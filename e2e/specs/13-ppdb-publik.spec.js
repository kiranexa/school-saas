import { test, expect } from '@playwright/test';
import { USERS, URL_A } from '../config.js';
import { login, fixtures } from '../helpers.js';
import { adminClient, pastikanMigrasiPpdb } from '../seed.js';

test.describe.configure({ mode: 'serial' });

const GEL_NAMA = 'Gelombang E2E Uji';
const SISWA_NAMA = 'Calon Siswa E2E Uji';

async function bersihkan() {
  const { tenantA } = fixtures();
  const adm = adminClient();
  await adm.from('pendaftaran_siswa').delete().eq('tenant_id', tenantA).eq('nama_lengkap', SISWA_NAMA);
  await adm.from('gelombang_pendaftaran').delete().eq('tenant_id', tenantA).eq('nama', GEL_NAMA);
  await adm.from('siswa').delete().eq('tenant_id', tenantA).eq('nama', SISWA_NAMA);
}

'alur lengkap PPDB: admin buka gelombang -> publik daftar & konfirmasi bayar -> admin terima jadi siswa', async ({ page, browser }) => {
  test.setTimeout(60000);
  const adm = adminClient();
  await pastikanMigrasiPpdb(adm);
  await bersihkan();

  const publik = await browser.newPage();
  try {
    // 1. Admin membuka gelombang pendaftaran
    await login(page, `${URL_A}/admin/gelombang`, USERS.staffA);
    await expect(page.locator('#page')).toHaveAttribute('data-state', 'ready');
    await page.getByRole('button', { name: '+ Tambah gelombang' }).click();
    await page.locator('input[name=nama]').fill(GEL_NAMA);
    await page.locator('input[name=biaya_daftar]').fill('150000');
    await page.locator('select[name=status]').selectOption('dibuka');
    await page.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('Tersimpan.')).toBeVisible();

    // 2. Calon siswa membuka beranda dan klik Daftar Siswa Baru
    await publik.goto(`${URL_A}/`);
    await publik.getByRole('link', { name: /Daftar Siswa Baru/i }).first().click();
    await expect(publik.getByRole('heading', { name: 'Pendaftaran Siswa Baru' })).toBeVisible();

    await publik.locator('select[name=gelombang_id]').selectOption({ label: `${GEL_NAMA} (Biaya Daftar: Rp 150.000)` });
    await publik.locator('input[name=nama_lengkap]').fill(SISWA_NAMA);
    await publik.locator('input[name=asal_sekolah]').fill('SMP Negeri 1 Uji');
    await publik.locator('input[name=nama_wali]').fill('Budi Santoso');
    await publik.locator('input[name=no_hp_wali]').fill('081234567890');
    await publik.getByRole('button', { name: 'Kirim Pendaftaran' }).click();

    await expect(publik.getByRole('heading', { name: 'Pendaftaran Berhasil' })).toBeVisible();
    const noReg = await publik.locator('#out-noreg').textContent();
    const pin = await publik.locator('#out-pin').textContent();
    expect(noReg).toMatch(/^PPDB-\d{4}-[A-Z0-9]{6}$/);
    expect(pin).toMatch(/^\d{6}$/);

    // 3. Calon siswa cek status & konfirmasi pembayaran
    await publik.getByRole('button', { name: 'Lanjut Cek Status / Konfirmasi Bayar' }).click();
    await publik.getByRole('button', { name: 'Periksa Status' }).click();
    await expect(publik.locator('#status-box')).toContainText(SISWA_NAMA);
    await expect(publik.locator('#status-box')).toContainText('belum_bayar');

    await publik.locator('input[name=nama_pengirim]').fill('Budi Santoso');
    await publik.getByRole('button', { name: 'Kirim Konfirmasi Bayar' }).click();
    await expect(publik.getByText('Konfirmasi pembayaran telah dikirim')).toBeVisible();
    await expect(publik.locator('#status-box')).toContainText('menunggu_konfirmasi');

    // 4. Admin memverifikasi & menerima calon siswa menjadi siswa resmi
    await page.goto(`${URL_A}/admin/pendaftar`);
    await expect(page.locator('#page')).toHaveAttribute('data-state', 'ready');
    const row = page.locator('tr', { hasText: SISWA_NAMA });
    await expect(row).toContainText('menunggu_konfirmasi');

    page.once('dialog', (d) => d.accept('NIS-E2E-999'));
    await row.getByRole('button', { name: 'Terima' }).click();
    await expect(page.getByText('Pendaftar diterima sebagai siswa.')).toBeVisible();

    // 5. Pastikan data otomatis masuk ke tabel Siswa
    await page.goto(`${URL_A}/admin/siswa`);
    await expect(page.getByRole('cell', { name: SISWA_NAMA })).toBeVisible();
  } finally {
    await publik.close();
    await bersihkan();
  }
};
