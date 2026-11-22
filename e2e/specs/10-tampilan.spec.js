import { test, expect } from '@playwright/test';
import { USERS } from '../config.js';
import { login } from '../helpers.js';

test('tema: pilihan terang/gelap tersimpan setelah halaman dimuat ulang', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await login(page, '/admin', USERS.adminA);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-tema', 'light');

  await page.getByRole('button', { name: 'Ganti tema' }).click();
  await expect(html).toHaveAttribute('data-tema', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-tema', 'dark');

  await page.getByRole('button', { name: 'Ganti tema' }).click();
  await expect(html).toHaveAttribute('data-tema', 'light');
});

test('tema: mengikuti pengaturan gelap perangkat jika belum memilih', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'dark');
});

test('tema: portal siswa juga bisa berganti tema', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await login(page, '/siswa', USERS.siswaA);
  await expect(page.getByRole('heading', { name: 'Portal Siswa' })).toBeVisible();
  await page.getByRole('button', { name: 'Ganti tema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'dark');
});

test('layar kecil: menu admin dibuka lewat tombol menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await login(page, '/admin', USERS.adminA);
  await page.getByRole('button', { name: 'Buka menu' }).click();
  await page.getByRole('navigation', { name: 'Menu admin' }).getByRole('link', { name: 'Guru' }).click();
  await expect(page.getByRole('heading', { name: 'Data Guru' })).toBeVisible();
});

test('menu: halaman yang aktif ditandai, dan guru tidak melihat menu keuangan', async ({ page }) => {
  await login(page, '/admin/guru', USERS.guruA);
  const menu = page.getByRole('navigation', { name: 'Menu admin' });
  await expect(menu.getByRole('link', { name: 'Guru' })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('link', { name: 'Tagihan' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Absensi' })).toBeVisible();
});
