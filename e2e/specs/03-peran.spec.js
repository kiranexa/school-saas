import { test, expect } from '@playwright/test';
import { URL_B, USERS } from '../config.js';
import { login } from '../helpers.js';

test('guru: bisa melihat siswa tetapi tidak ada tombol tulis', async ({ page }) => {
  await login(page, '/admin/siswa', USERS.guruA);
  await expect(page.getByRole('cell', { name: 'Siswa Uji A' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Tambah' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ubah' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hapus' })).toHaveCount(0);
});

test('siswa: portal hanya menampilkan data miliknya', async ({ page }) => {
  await login(page, '/siswa', USERS.siswaA);
  await expect(page.getByRole('heading', { name: 'Portal Siswa' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Matematika' })).toBeVisible();
  await expect(page.getByText('Bahasa Indonesia')).toHaveCount(0);   // nilai siswa lain
});

test('siswa: tidak bisa masuk area admin', async ({ page }) => {
  await login(page, '/admin', USERS.siswaA);
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
});

test('admin sekolah A: tidak bisa masuk area admin sekolah B', async ({ page }) => {
  await login(page, `${URL_B}/admin`, USERS.adminA);
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
});

test('admin sekolah B: hanya melihat siswa sekolahnya', async ({ page }) => {
  await login(page, `${URL_B}/admin/siswa`, USERS.adminB);
  await expect(page.getByRole('cell', { name: 'Siswa Sekolah B' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Siswa Uji A' })).toHaveCount(0);
});
