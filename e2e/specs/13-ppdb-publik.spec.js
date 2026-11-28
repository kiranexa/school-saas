import { test, expect } from '@playwright/test';
import { USERS, URL_A } from '../config.js';
import { login, fixtures } from '../helpers.js';
import { adminClient, pastikanMigrasiPpdb } from '../seed.js';

// Alur layar PPDB: admin membuka gelombang -> orang tua mendaftar dan konfirmasi bayar -> admin menerima jadi siswa.
// Penjagaan keamanannya diuji terpisah di 14-ppdb-keamanan.
test.describe.configure({ mode: 'serial' });

const GEL = 'Gelombang E2E Uji';
const SISWA = 'Calon Siswa E2E Uji';
const siap = (page) => expect(page.locator('#page')).toHaveAttribute('data-state', 'ready');

async function bersihkan() {
  const { tenantA } = fixtures();
  const adm = adminClient();
  await adm.from('pendaftaran_siswa').delete().eq('tenant_id', tenantA).in('nama_lengkap', [SISWA]);
  await adm.from('gelombang_pendaftaran').delete().eq('tenant_id', tenantA).eq('nama', GEL);
  await adm.from('siswa').delete().eq('tenant_id', tenantA).eq('nama', SISWA);
}

test('alur lengkap: admin buka gelombang, orang tua daftar dan konfirmasi bayar, admin menerima jadi siswa', async ({ page, browser }) => {
  test.setTimeout(90000);
  await pastikanMigrasiPpdb(adminClient());
  await bersihkan();
  const publik = await browser.newPage();
  const hp = `0812${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;      // unik tiap run (batas 5 per HP per hari)
  try {
    // 1. admin membuka gelombang (tidak ada isian biaya: biaya berasal dari master Biaya)
    await login(page, `${URL_A}/admin/gelombang`, USERS.staffA);
    await siap(page);
    await expect(page.getByRole('button', { name: '+ Tambah gelombang' })).toBeVisible();
    await page.getByRole('button', { name: '+ Tambah gelombang' }).click();
    await expect(page.locator('input[name=biaya_daftar]')).toHaveCount(0);
    await page.locator('input[name=nama]').fill(GEL);
    await page.locator('select[name=status]').selectOption('dibuka');
    await page.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('Tersimpan.')).toBeVisible();

    // 2. orang tua mendaftar; rincian biaya mengikuti master (Uang gedung wajib, Seragam opsional)
    await publik.goto(`${URL_A}/daftar`);
    await expect(publik.getByRole('heading', { name: 'Pendaftaran Siswa Baru' })).toBeVisible();
    await expect(publik.locator('#info-biaya')).toContainText('Uang gedung');
    await expect(publik.locator('#info-biaya')).toContainText('opsional');
    await expect(publik.locator('#total-biaya')).toHaveText('Rp 5.000.000');
    await publik.locator('select[name=gelombang_id]').selectOption({ label: GEL });
    await publik.locator('select[name=jurusan_id]').selectOption({ label: 'IPA' });
    await publik.locator('input[name=nama_lengkap]').fill(SISWA);
    await publik.locator('input[name=tanggal_lahir]').fill('2010-05-05');
    await publik.locator('input[name=asal_sekolah]').fill('SMP Negeri 1 Uji');
    await publik.locator('input[name=nama_wali]').fill('Budi Santoso');
    await publik.locator('input[name=no_hp_wali]').fill(hp);
    await publik.locator('input[name=email_wali]').fill('budi.e2e@example.com');
    await publik.getByRole('button', { name: 'Kirim Pendaftaran' }).click();

    await expect(publik.getByRole('heading', { name: 'Pendaftaran Berhasil' })).toBeVisible();
    expect(await publik.locator('#out-noreg').textContent()).toMatch(/^PPDB-\d{4}-[0-9A-F]{8}$/);
    expect(await publik.locator('#out-pin').textContent()).toMatch(/^\d{6}$/);

    // 3. cek status, lalu konfirmasi pembayaran
    await publik.getByRole('button', { name: 'Lanjut Cek Status / Konfirmasi Bayar' }).click();
    await publik.getByRole('button', { name: 'Periksa Status' }).click();
    await expect(publik.locator('#status-box')).toContainText(SISWA);
    await expect(publik.locator('#status-box')).toContainText('belum_bayar');
    await publik.locator('input[name=nama_pengirim]').fill('Budi Santoso');
    await publik.getByRole('button', { name: 'Kirim Konfirmasi Bayar' }).click();
    await expect(publik.getByText('Konfirmasi pembayaran telah dikirim')).toBeVisible();
    await expect(publik.locator('#status-box')).toContainText('menunggu_konfirmasi');

    // 4. admin menerima (pembayaran sudah dikonfirmasi: tidak ada peringatan tunai)
    await page.goto(`${URL_A}/admin/pendaftar`);
    await siap(page);
    const baris = page.locator('tr', { hasText: SISWA });
    await expect(baris).toContainText('menunggu_konfirmasi');
    await expect(baris).toContainText('budi.e2e@example.com');
    page.once('dialog', (d) => d.accept('NIS-E2E-999'));
    await baris.getByRole('button', { name: 'Terima' }).click();
    await expect(page.getByText('Pendaftar diterima sebagai siswa.')).toBeVisible();

    // 5. data masuk ke tabel Siswa
    await page.goto(`${URL_A}/admin/siswa`);
    await expect(page.getByRole('cell', { name: SISWA })).toBeVisible();

    // 6. orang tua melihat status diterima, form bayar hilang
    await publik.getByRole('button', { name: 'Periksa Status' }).click();
    await expect(publik.locator('#status-box')).toContainText('diterima');
    await expect(publik.locator('#f-bayar')).toHaveCount(0);
  } finally {
    await publik.close();
    await bersihkan();
  }
});

test('PIN salah ditampilkan sebagai pesan, bukan error halaman', async ({ page }) => {
  await pastikanMigrasiPpdb(adminClient());
  await page.goto(`${URL_A}/daftar?tab=cek`);
  await page.locator('input[name=nomor_registrasi]').fill('PPDB-2026-00000000');
  await page.locator('input[name=pin_akses]').fill('000000');
  await page.getByRole('button', { name: 'Periksa Status' }).click();
  await expect(page.getByText('Nomor registrasi atau PIN tidak cocok')).toBeVisible();
  await expect(page.locator('#status-box')).toHaveCount(0);
});
