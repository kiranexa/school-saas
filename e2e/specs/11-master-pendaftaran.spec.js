import { test, expect } from '@playwright/test';
import { USERS, URL_A } from '../config.js';
import { login, fixtures } from '../helpers.js';
import { adminClient } from '../seed.js';

// Alur layar: admin/TU mengajukan, kepala sekolah menyetujui. Penjagaan sebenarnya diuji di 12-pengajuan-keamanan.
test.describe.configure({ mode: 'serial' });

const NAMA = 'Biaya Uji UI';
const siap = (page) => expect(page.locator('#page')).toHaveAttribute('data-state', 'ready');

async function bersihkan() {
  const { tenantA } = fixtures();
  const adm = adminClient();
  await adm.from('pengajuan_perubahan').delete().eq('tenant_id', tenantA).eq('data->>nama', NAMA);
  await adm.from('komponen_biaya').delete().eq('tenant_id', tenantA).eq('nama', NAMA);
}

test('admin mengajukan biaya baru; data berlaku tidak berubah sampai kepala sekolah menyetujui', async ({ page, browser }) => {
  await bersihkan();
  const kepsek = await browser.newPage();
  try {
    await login(page, `${URL_A}/admin/biaya`, USERS.staffA);
    await siap(page);
    await expect(page.getByRole('heading', { name: 'Biaya Pendaftaran' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Uang gedung' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Setujui' })).toHaveCount(0);   // admin tidak punya tombol setuju

    await page.getByRole('button', { name: '+ Ajukan data baru' }).click();
    await page.locator('input[name=nama]').fill(NAMA);
    await page.locator('input[name=nominal]').fill('123000');
    await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
    await expect(page.getByText('Pengajuan terkirim')).toBeVisible();
    await expect(page.locator('#menunggu')).toContainText(NAMA);
    await expect(page.locator('.tabel')).not.toContainText(NAMA);                  // belum berlaku

    // kepala sekolah menyetujui lewat halaman Persetujuan
    await login(kepsek, `${URL_A}/admin/persetujuan`, USERS.kepsekA);
    await siap(kepsek);
    const kartu = kepsek.locator('[data-pengajuan]', { hasText: NAMA });
    await expect(kartu).toBeVisible();
    kepsek.once('dialog', (d) => d.accept());
    await kartu.getByRole('button', { name: 'Setujui' }).click();
    await expect(kepsek.getByText('Pengajuan disetujui')).toBeVisible();

    await kepsek.goto(`${URL_A}/admin/biaya`);
    await siap(kepsek);
    await expect(kepsek.getByRole('row', { name: new RegExp(`${NAMA}.*123\\.000`) })).toBeVisible();
  } finally {
    await kepsek.close();
    await bersihkan();
  }
});

test('kepala sekolah tidak punya tombol ajukan; menu Pendaftaran tampil', async ({ page }) => {
  await login(page, `${URL_A}/admin/biaya`, USERS.kepsekA);
  await siap(page);
  await expect(page.getByRole('button', { name: '+ Ajukan data baru' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ajukan ubah' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Persetujuan' })).toBeVisible();
});

test('TU mengajukan perubahan nominal lalu membatalkan; nilai lama tetap berlaku', async ({ page }) => {
  await login(page, `${URL_A}/admin/biaya`, USERS.tuA);
  await siap(page);
  const baris = page.getByRole('row', { name: /Uang gedung/ });
  await baris.getByRole('button', { name: 'Ajukan ubah' }).click();
  await page.locator('input[name=nominal]').fill('6000000');
  await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
  await expect(page.getByText('Pengajuan terkirim')).toBeVisible();
  await expect(page.locator('#menunggu')).toContainText('Uang gedung');
  await expect(page.locator('#menunggu')).toContainText('6.000.000');
  await expect(page.getByRole('row', { name: /Uang gedung.*5\.000\.000/ })).toBeVisible();   // masih nilai lama

  page.once('dialog', (d) => d.accept());
  await page.locator('#menunggu').getByRole('button', { name: 'Batalkan' }).click();
  await expect(page.getByText('Pengajuan dibatalkan')).toBeVisible();
  await expect(page.locator('#menunggu')).not.toContainText('Uang gedung');
});

test('rekening: admin tidak melihat tombol setuju; validasi transfer tanpa atas nama', async ({ page }) => {
  await login(page, `${URL_A}/admin/rekening`, USERS.staffA);
  await siap(page);
  await expect(page.getByRole('cell', { name: 'BCA' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Setujui' })).toHaveCount(0);
  await page.getByRole('button', { name: '+ Ajukan data baru' }).click();
  await page.locator('input[name=penyedia]').fill('BNI');
  await page.locator('input[name=nomor]').fill('555');
  await page.getByRole('button', { name: 'Kirim pengajuan' }).click();              // jenis transfer (default) tanpa atas nama
  await expect(page.getByText('Atas nama wajib diisi')).toBeVisible();
});

test('jurusan: admin tambah dan hapus langsung (tanpa persetujuan)', async ({ page }) => {
  const { tenantA } = fixtures();
  try {
    await login(page, `${URL_A}/admin/jurusan`, USERS.staffA);
    await page.getByRole('button', { name: '+ Tambah' }).click();
    await page.locator('input[name=nama]').fill('Bahasa Uji');
    await page.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('Tersimpan.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Bahasa Uji' })).toBeVisible();

    await page.getByRole('button', { name: '+ Tambah' }).click();                    // nama ganda
    await page.locator('input[name=nama]').fill('Bahasa Uji');
    await page.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('Nama jurusan sudah ada.')).toBeVisible();
  } finally {
    await adminClient().from('jurusan').delete().eq('tenant_id', tenantA).eq('nama', 'Bahasa Uji');
  }
});

test('guru tidak melihat menu Pendaftaran', async ({ page }) => {
  await login(page, `${URL_A}/admin`, USERS.guruA);
  await expect(page.getByRole('link', { name: 'Siswa' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Biaya' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Rekening' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Persetujuan' })).toHaveCount(0);
});
