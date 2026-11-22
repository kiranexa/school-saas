import { test, expect } from '@playwright/test';
import { USERS } from '../config.js';
import { login } from '../helpers.js';

test('keuangan: tagihan jadi sebagian lalu lunas sesuai pembayaran', async ({ page }) => {
  await login(page, '/admin/tagihan', USERS.adminA);
  await page.getByRole('button', { name: '+ Tambah' }).click();
  await page.locator('select[name=siswa_id]').selectOption({ label: 'Siswa Uji A (E2E001)' });
  await page.locator('input[name=jenis]').fill('Seragam');
  await page.locator('input[name=jumlah]').fill('200000');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByRole('row', { name: /Seragam/ })).toContainText('belum');

  const bayar = async (jumlah) => {
    await page.goto('/admin/pembayaran');
    await page.getByRole('button', { name: '+ Tambah' }).click();
    await page.locator('select[name=tagihan_id]').selectOption({ label: 'Siswa Uji A — Seragam (Rp 200000)' });
    await page.locator('input[name=jumlah]').fill(String(jumlah));
    await page.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByText('Tersimpan.')).toBeVisible();
    await page.goto('/admin/tagihan');
  };

  await bayar(50000);
  await expect(page.getByRole('row', { name: /Seragam/ })).toContainText('sebagian');
  await bayar(150000);
  await expect(page.getByRole('row', { name: /Seragam/ })).toContainText('lunas');

  page.once('dialog', (d) => d.accept());           // bersihkan (pembayaran ikut terhapus)
  await page.getByRole('row', { name: /Seragam/ }).getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByRole('row', { name: /Seragam/ })).toHaveCount(0);
});

test('keuangan: guru tidak punya akses halaman tagihan', async ({ page }) => {
  await login(page, '/admin/tagihan', USERS.guruA);
  await expect(page.getByText('Anda tidak punya akses ke halaman ini.')).toBeVisible();
});

test('siswa: portal menampilkan tagihan miliknya', async ({ page }) => {
  await login(page, '/siswa', USERS.siswaA);
  await expect(page.getByRole('heading', { name: 'Tagihan' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'SPP' })).toBeVisible();
});
