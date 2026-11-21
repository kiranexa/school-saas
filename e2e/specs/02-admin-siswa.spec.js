import { test, expect } from '@playwright/test';
import { USERS } from '../config.js';
import { login } from '../helpers.js';

test.describe.configure({ mode: 'serial' });

test('admin: tambah, cari, duplikat NIS, ubah, hapus siswa', async ({ page }) => {
  await login(page, '/admin/siswa', USERS.adminA);
  const tambah = page.getByRole('button', { name: '+ Tambah' });
  await expect(tambah).toBeVisible();

  // tambah
  await tambah.click();
  await page.locator('input[name=nama]').fill('Budi Uji');
  await page.locator('input[name=nis]').fill('E2E900');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Tersimpan.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Budi Uji' })).toBeVisible();

  // cari
  await page.locator('#q').fill('Budi');
  await page.locator('#q').press('Enter');
  await expect(page.getByRole('cell', { name: 'Budi Uji' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Siswa Uji A' })).toHaveCount(0);

  // NIS duplikat
  await tambah.click();
  await page.locator('input[name=nama]').fill('Budi Kembar');
  await page.locator('input[name=nis]').fill('E2E900');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('NIS sudah dipakai siswa lain.')).toBeVisible();
  await page.getByRole('button', { name: 'Batal' }).click();

  // ubah
  await page.getByRole('row', { name: /Budi Uji/ }).getByRole('button', { name: 'Ubah' }).click();
  await page.locator('input[name=nama]').fill('Budi Uji Edit');
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByRole('cell', { name: 'Budi Uji Edit' })).toBeVisible();

  // hapus
  page.once('dialog', (d) => d.accept());
  await page.getByRole('row', { name: /Budi Uji Edit/ }).getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByText('Terhapus.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Budi Uji Edit' })).toHaveCount(0);
});

test('admin: dashboard tampil setelah login', async ({ page }) => {
  await login(page, '/admin', USERS.adminA);
  await expect(page.getByRole('heading', { name: /^Admin/ })).toBeVisible();
  await expect(page.getByText('Siswa', { exact: true }).first()).toBeVisible();
});
