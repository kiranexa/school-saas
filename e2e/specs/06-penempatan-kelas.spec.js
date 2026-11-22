import { test, expect } from '@playwright/test';
import { USERS } from '../config.js';
import { login } from '../helpers.js';

test('penempatan: tambah dan keluarkan siswa dari kelas', async ({ page }) => {
  await login(page, '/admin/kelas', USERS.adminA);
  await page.getByRole('row', { name: /X-A1/ }).getByRole('link', { name: 'Siswa' }).click();
  await expect(page.getByRole('cell', { name: 'Siswa Uji A' })).toBeVisible();

  await page.locator('#sel').selectOption({ label: 'Siswa Penempatan (E2E003)' });
  await page.getByRole('button', { name: 'Tambahkan' }).click();
  await expect(page.getByRole('cell', { name: 'Siswa Penempatan' })).toBeVisible();

  await page.getByRole('row', { name: /Siswa Penempatan/ }).getByRole('button', { name: 'Keluarkan' }).click();
  await expect(page.getByRole('cell', { name: 'Siswa Penempatan' })).toHaveCount(0);
});

test('penempatan: siswa yang sudah di kelas lain (tahun ajaran sama) ditolak', async ({ page }) => {
  await login(page, '/admin/kelas', USERS.adminA);
  await page.getByRole('row', { name: /X-A1/ }).getByRole('link', { name: 'Siswa' }).click();
  await page.locator('#sel').selectOption({ label: 'Siswa Lain A (E2E002)' });
  await page.getByRole('button', { name: 'Tambahkan' }).click();
  await expect(page.getByText(/kelas lain/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Siswa Lain A' })).toHaveCount(0);
});
