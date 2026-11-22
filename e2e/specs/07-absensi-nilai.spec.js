import { test, expect } from '@playwright/test';
import { USERS } from '../config.js';
import { login, clientAs, fixtures } from '../helpers.js';

test.describe.configure({ mode: 'serial' });
const siap = (page) => expect(page.locator('#page')).toHaveAttribute('data-state', 'ready');
const TGL = '2026-01-15';

test('absensi: guru menyimpan absensi kelasnya (tanpa duplikat saat disimpan ulang)', async ({ page }) => {
  const fx = fixtures();
  await login(page, '/admin/absensi', USERS.guruA);
  await page.locator('#kelas').selectOption({ label: 'X-A1' });
  await siap(page);
  await expect(page.getByRole('row', { name: /Siswa Uji A/ })).toBeVisible();
  await page.locator('#tgl').fill(TGL);
  await page.locator('#muat').click();
  await siap(page);

  await page.getByRole('row', { name: /Siswa Uji A/ }).getByLabel('sakit').check();
  await page.getByRole('button', { name: 'Simpan absensi' }).click();
  await siap(page);
  await expect(page.getByText(/Tersimpan/)).toBeVisible();

  await page.getByRole('row', { name: /Siswa Uji A/ }).getByLabel('izin').check();
  await page.getByRole('button', { name: 'Simpan absensi' }).click();
  await siap(page);

  const admin = await clientAs(USERS.adminA);
  const { data } = await admin.from('absensi').select('status').eq('tanggal', TGL).eq('siswa_id', fx.siswa.E2E001);
  expect(data).toEqual([{ status: 'izin' }]);
  await admin.from('absensi').delete().eq('tanggal', TGL);
});

test('absensi: guru tidak bisa menyimpan absensi kelas yang tidak diajar', async ({ page }) => {
  await login(page, '/admin/absensi', USERS.guruA);
  await page.locator('#kelas').selectOption({ label: 'X-A2' });
  await siap(page);
  await expect(page.getByRole('row', { name: /Siswa Lain A/ })).toBeVisible();
  await page.getByRole('button', { name: 'Simpan absensi' }).click();
  await siap(page);
  await expect(page.getByText(/row-level security/i)).toBeVisible();
});

test('nilai: guru menyimpan nilai kelasnya lalu memuat ulang', async ({ page }) => {
  await login(page, '/admin/nilai', USERS.guruA);
  await page.locator('#kelas').selectOption({ label: 'X-A1' });
  await page.locator('#mapel').selectOption({ label: 'Matematika' });
  await page.locator('#jenis').fill('tugas 1');
  await page.locator('#muat').click();
  await siap(page);

  await page.getByRole('row', { name: /Siswa Uji A/ }).locator('input[data-skor]').fill('77');
  await page.getByRole('button', { name: 'Simpan nilai' }).click();
  await siap(page);
  await expect(page.getByText(/Tersimpan/)).toBeVisible();

  await page.locator('#muat').click();
  await siap(page);
  await expect(page.getByRole('row', { name: /Siswa Uji A/ }).locator('input[data-skor]')).toHaveValue('77');

  const admin = await clientAs(USERS.adminA);
  await admin.from('nilai').delete().eq('jenis', 'tugas 1');
});

test('nilai: guru tidak bisa menyimpan nilai kelas yang tidak diajar', async ({ page }) => {
  await login(page, '/admin/nilai', USERS.guruA);
  await page.locator('#kelas').selectOption({ label: 'X-A2' });
  await page.locator('#mapel').selectOption({ label: 'Matematika' });
  await page.locator('#jenis').fill('tugas 1');
  await page.locator('#muat').click();
  await siap(page);
  await page.getByRole('row', { name: /Siswa Lain A/ }).locator('input[data-skor]').fill('60');
  await page.getByRole('button', { name: 'Simpan nilai' }).click();
  await siap(page);
  await expect(page.getByText(/row-level security/i)).toBeVisible();
});
