import { test, expect } from '@playwright/test';
import { USERS } from '../config.js';
import { login } from '../helpers.js';

test.describe.configure({ mode: 'serial' });
const tambah = (page) => page.getByRole('button', { name: '+ Tambah' });
const simpan = (page) => page.getByRole('button', { name: 'Simpan' });

test('guru: tambah, ubah, hapus', async ({ page }) => {
  await login(page, '/admin/guru', USERS.adminA);
  await tambah(page).click();
  await page.locator('input[name=nama]').fill('Guru Baru');
  await page.locator('input[name=nip]').fill('G900');
  await simpan(page).click();
  await expect(page.getByText('Tersimpan.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Guru Baru' })).toBeVisible();

  await page.getByRole('row', { name: /Guru Baru/ }).getByRole('button', { name: 'Ubah' }).click();
  await page.locator('input[name=nama]').fill('Guru Baru Edit');
  await simpan(page).click();
  await expect(page.getByRole('cell', { name: 'Guru Baru Edit' })).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('row', { name: /Guru Baru Edit/ }).getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByText('Terhapus.')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Guru Baru Edit' })).toHaveCount(0);
});

test('guru yang menjadi wali kelas tidak bisa dihapus', async ({ page }) => {
  await login(page, '/admin/kelas', USERS.adminA);
  await tambah(page).click();
  await page.locator('input[name=nama]').fill('X-WALI');
  await page.locator('select[name=wali_guru_id]').selectOption({ label: 'Guru Uji A' });
  await simpan(page).click();
  await expect(page.getByRole('cell', { name: 'X-WALI' })).toBeVisible();

  await page.goto('/admin/guru');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('row', { name: /Guru Uji A/ }).getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByText(/masih dipakai/)).toBeVisible();

  await page.goto('/admin/kelas');           // bersihkan
  page.once('dialog', (d) => d.accept());
  await page.getByRole('row', { name: /X-WALI/ }).getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByRole('cell', { name: 'X-WALI' })).toHaveCount(0);
});

test('mata pelajaran: tambah, ubah, hapus', async ({ page }) => {
  await login(page, '/admin/mapel', USERS.adminA);
  await tambah(page).click();
  await page.locator('input[name=kode]').fill('E2E');
  await page.locator('input[name=nama]').fill('Mapel Uji');
  await simpan(page).click();
  await expect(page.getByRole('cell', { name: 'Mapel Uji' })).toBeVisible();

  await page.getByRole('row', { name: /Mapel Uji/ }).getByRole('button', { name: 'Ubah' }).click();
  await page.locator('input[name=kkm]').fill('80');
  await simpan(page).click();
  await expect(page.getByRole('row', { name: /Mapel Uji/ })).toContainText('80');

  page.once('dialog', (d) => d.accept());
  await page.getByRole('row', { name: /Mapel Uji/ }).getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByRole('cell', { name: 'Mapel Uji' })).toHaveCount(0);
});

test('kelas: tambah dengan tahun ajaran dan wali, lalu hapus', async ({ page }) => {
  await login(page, '/admin/kelas', USERS.adminA);
  await tambah(page).click();
  await page.locator('input[name=nama]').fill('X-TES');
  await page.locator('input[name=tingkat]').fill('10');
  await page.locator('select[name=tahun_ajaran_id]').selectOption({ index: 1 });
  await page.locator('select[name=wali_guru_id]').selectOption({ label: 'Guru Uji A' });
  await simpan(page).click();
  const baris = page.getByRole('row', { name: /X-TES/ });
  await expect(baris).toBeVisible();
  await expect(baris).toContainText('Guru Uji A');

  page.once('dialog', (d) => d.accept());
  await baris.getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByRole('cell', { name: 'X-TES' })).toHaveCount(0);
});

test('jadwal: tambah lalu hapus', async ({ page }) => {
  await login(page, '/admin/jadwal', USERS.adminA);
  await tambah(page).click();
  await page.locator('select[name=kelas_id]').selectOption({ label: 'X-A1' });
  await page.locator('select[name=mapel_id]').selectOption({ label: 'Matematika' });
  await page.locator('select[name=guru_id]').selectOption({ label: 'Guru Uji A' });
  await page.locator('select[name=hari]').selectOption({ label: 'Rabu' });
  await page.locator('input[name=jam_mulai]').fill('10:00');
  await page.locator('input[name=jam_selesai]').fill('11:00');
  await simpan(page).click();
  const baris = page.getByRole('row', { name: /Rabu/ });
  await expect(baris).toBeVisible();
  await expect(baris).toContainText('10:00–11:00');

  page.once('dialog', (d) => d.accept());
  await baris.getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByRole('row', { name: /Rabu/ })).toHaveCount(0);
});

test('tahun ajaran: hanya satu yang boleh aktif', async ({ page }) => {
  await login(page, '/admin/tahun', USERS.adminA);
  await tambah(page).click();
  await page.locator('input[name=nama]').fill('2099/2100');
  await page.locator('input[name=aktif]').check();
  await simpan(page).click();
  await expect(page.getByText(/Hanya boleh satu tahun ajaran aktif/)).toBeVisible();

  await page.locator('input[name=aktif]').uncheck();   // tanpa aktif -> boleh
  await simpan(page).click();
  await expect(page.getByRole('cell', { name: '2099/2100' })).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('row', { name: /2099\/2100/ }).getByRole('button', { name: 'Hapus' }).click();
  await expect(page.getByRole('cell', { name: '2099/2100' })).toHaveCount(0);
});
