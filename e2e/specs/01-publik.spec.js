import { test, expect } from '@playwright/test';
import { PORT, USERS } from '../config.js';
import { login } from '../helpers.js';

test('landing page menampilkan sekolah sesuai hostname', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Selamat Datang di E2E Sekolah A' })).toBeVisible();
});

test('hostname tidak terdaftar -> sekolah tidak ditemukan', async ({ page }) => {
  await page.goto(`http://tidak-ada.localhost:${PORT}/`);
  await expect(page.getByText('Sekolah tidak ditemukan')).toBeVisible();
});

test('/admin tanpa login menampilkan form login', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Login admin' })).toBeVisible();
});

test('password salah menampilkan error', async ({ page }) => {
  await login(page, '/admin', USERS.adminA, 'password-salah');
  await expect(page.locator('#err')).toContainText(/invalid/i);
});
