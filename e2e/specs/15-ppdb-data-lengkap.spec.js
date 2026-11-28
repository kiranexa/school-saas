import { test, expect } from '@playwright/test';
import { SLUG_A, USERS, URL_A } from '../config.js';
import { anonClient, clientAs, fixtures, login } from '../helpers.js';
import { adminClient, pastikanMigrasiPpdb } from '../seed.js';
import { FIELDS, ALAMAT_KOMPONEN, nilaiAwal, bangunPayload, tampil, STEPS } from '../../src/pages/ppdbFields.js';

// Wizard "Data Lengkap": layar + keamanan. Spesifikasi isian diimpor langsung dari src/pages/ppdbFields.js, jadi
// bila form dan database tidak sinkron (kolom/aturan berbeda), tes di sini yang gagal.
test.describe.configure({ mode: 'serial' });

const adm = adminClient();
const siap = (page) => expect(page.locator('#page')).toHaveAttribute('data-state', 'ready');
const DAFTAR = [];
let gelA, jurA;

const nilaiValid = (f, unik) => {
  switch (f.kind) {
    case 'teks': return `Isi ${f.key}`.slice(0, f.max);
    case 'digits': return (unik + '7'.repeat(f.len)).slice(0, f.len);
    case 'pilih': return f.vals[0];
    case 'int': return String(Math.min(Math.max(f.lo + 1, f.key === 'tahun_lulus' ? 2024 : 0), f.hi));
    case 'num': return String(f.lo + 1);
    case 'hp': return '081234567890';
    case 'koord': return '-6.2, 106.8';
    default: return '';
  }
};
const ALAMAT = { jalan: 'Jl. Uji 1', rt_rw: '001/002', kelurahan: 'Sukamaju', kecamatan: 'Cibiru', kabupaten_kota: 'Bandung', kode_pos: '40615' };
const TEKS_ALAMAT = 'Jl. Uji 1, RT/RW 001/002, Kel. Sukamaju, Kec. Cibiru, Bandung, 40615';

function dataValid(unik, { sama = false } = {}) {
  const d = nilaiAwal();
  for (const f of FIELDS) {
    if (f.kind === 'alamat') d[f.key] = { ...ALAMAT };
    else if (f.kind !== 'bool') d[f.key] = nilaiValid(f, unik);
  }
  if (sama) { d.domisili_sama_kk = true; d.ortu_sama_kk = true; }
  return d;
}
// NISN/NIK unik per pendaftar: angka acak 8 digit + isi tetap
const unikBaru = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

const daftar = (o = {}) => anonClient().rpc('daftar_ppdb_publik', {
  p_tenant_slug: SLUG_A, p_gelombang_id: gelA, p_jurusan_id: jurA, p_nama_lengkap: `Siswa Lengkap ${Math.random().toString(36).slice(2, 8)}`,
  p_nik: null, p_jenis_kelamin: 'L', p_tempat_lahir: null, p_tanggal_lahir: '2010-03-03', p_asal_sekolah: null,
  p_nama_wali: 'Wali Uji', p_no_hp_wali: `0815${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
  p_email_wali: 'wali.lengkap@example.com', p_alamat: null, ...o,
});
async function pendaftarBaru(o) {
  const r = await daftar(o);
  expect(r.error, r.error?.message).toBeNull();
  DAFTAR.push(r.data.id);
  return r.data;
}
const simpan = (p, payload, pin = p.pin_akses) => anonClient().rpc('simpan_data_lengkap_ppdb', { p_nomor_registrasi: p.nomor_registrasi, p_pin_akses: pin, p_data: payload });

test.beforeAll(async () => {
  await pastikanMigrasiPpdb(adm);
  const probe = await adm.rpc('ambil_data_lengkap_ppdb', { p_nomor_registrasi: 'PPDB-0000-00000000', p_pin_akses: '000000' });
  if (probe.error) throw new Error(`Migrasi 20261128100000_ppdb_data_lengkap.sql belum diterapkan di database uji: ${probe.error.message}`);
  const { tenantA } = fixtures();
  const g = await adm.from('gelombang_pendaftaran').insert({ tenant_id: tenantA, nama: 'Gel Data Lengkap', status: 'dibuka' }).select('id').single();
  gelA = g.data.id;
  jurA = (await adm.from('jurusan').select('id').eq('tenant_id', tenantA).eq('nama', 'IPA').single()).data.id;
});

test.afterAll(async () => {
  await adm.from('pendaftaran_siswa').delete().eq('gelombang_id', gelA);
  await adm.from('gelombang_pendaftaran').delete().eq('id', gelA);
  await adm.from('siswa').delete().like('nama', 'Siswa Lengkap %');
});

test('spesifikasi form = database: payload dari ppdbFields.js diterima server; tiap isian wajib benar-benar wajib', async () => {
  const p = await pendaftarBaru();
  const d = dataValid(unikBaru());
  const payload = bangunPayload(d);
  const r = await simpan(p, payload);
  expect(r.error, r.error?.message).toBeNull();
  expect(r.data.ok).toBe(true);

  // setiap field wajib yang tampil harus ditolak server bila hilang
  for (const f of FIELDS.filter((x) => x.req && x.kind !== 'bool' && x.default === undefined && tampil(x, d))) {   // yang punya nilai bawaan tidak wajib dikirim
    const tanpa = { ...payload }; delete tanpa[f.key];
    const g = await simpan(p, tanpa);
    expect(g.error?.message ?? 'DITERIMA', `field wajib ${f.key}`).toMatch(new RegExp('wajib', 'i'));
  }
  expect((await simpan(p, { ...payload, kolom_asing: 'x' })).error?.message ?? '').toMatch(/tidak dikenal/);
  expect((await simpan(p, { ...payload, pernyataan_benar: false })).error?.message ?? '').toMatch(/Pernyataan/);
});

test('alamat digabung di server; alamat yang "sama" disalin server; data sampai ke pendaftar', async () => {
  const p = await pendaftarBaru();
  const unik = unikBaru();
  const d = dataValid(unik, { sama: true });
  const r = await simpan(p, bangunPayload(d));
  expect(r.error, r.error?.message).toBeNull();
  const { data: l } = await adm.from('pendaftaran_data_lengkap').select('*').eq('pendaftaran_id', p.id).single();
  expect(l.alamat_kk).toBe(TEKS_ALAMAT);
  expect(l.alamat_kk_komponen).toMatchObject({ kode_pos: '40615', rt_rw: '001/002' });
  expect(l.alamat_domisili).toBe(TEKS_ALAMAT);
  expect(l.alamat_ayah).toBe(TEKS_ALAMAT);
  expect(l.alamat_ibu).toBe(TEKS_ALAMAT);
  const { data: ps } = await adm.from('pendaftaran_siswa').select('tempat_lahir,nik,alamat').eq('id', p.id).single();
  expect(ps).toMatchObject({ tempat_lahir: l.tempat_lahir, nik: l.nik_siswa, alamat: TEKS_ALAMAT });

  // ibu sama ayah (ortu tidak sama KK): alamat ibu = alamat ayah
  const e = dataValid(unikBaru());
  e.alamat_ayah = { ...ALAMAT, jalan: 'Jl. Ayah 7' }; e.ibu_sama_ayah = true;
  const r2 = await simpan(p, bangunPayload(e));
  expect(r2.error, r2.error?.message).toBeNull();
  const { data: l2 } = await adm.from('pendaftaran_data_lengkap').select('alamat_ayah,alamat_ibu,alamat_kk').eq('pendaftaran_id', p.id).single();
  expect(l2.alamat_ibu).toBe(l2.alamat_ayah);
  expect(l2.alamat_ayah).toContain('Jl. Ayah 7');
  expect(l2.alamat_kk).toBe(TEKS_ALAMAT);
});

test('validasi alamat dan angka di server (RT/RW 000/000, kode pos 5 digit, NISN 10 digit, NIK 16 digit)', async () => {
  const p = await pendaftarBaru();
  const payload = bangunPayload(dataValid(unikBaru()));
  const gagal = async (o, pola) => expect((await simpan(p, { ...payload, ...o })).error?.message ?? 'DITERIMA').toMatch(pola);
  await gagal({ alamat_kk: { ...ALAMAT, rt_rw: '12/34' } }, /RT\/RW/);
  await gagal({ alamat_kk: { ...ALAMAT, kode_pos: '123' } }, /kode pos/i);
  await gagal({ alamat_kk: 'Jl. teks bebas' }, /tidak valid/i);
  await gagal({ nisn: '123' }, /NISN/);
  await gagal({ nik_siswa: '123' }, /NIK/);
  await gagal({ no_kk: '123' }, /Kartu Keluarga/);
  await gagal({ agama: 'Lainnya-asing' }, /Agama/);
  await gagal({ tahun_lulus: '2100' }, /Tahun lulus/);
});

test('NISN dan NIK unik per sekolah; pendaftar yang ditolak tidak memblokir', async () => {
  const unik = unikBaru();
  const a = await pendaftarBaru();
  const b = await pendaftarBaru();
  const payload = bangunPayload(dataValid(unik));
  expect((await simpan(a, payload)).error).toBeNull();
  expect((await simpan(b, payload)).error?.message ?? '').toMatch(/NISN sudah terdaftar/);
  expect((await simpan(b, { ...payload, nisn: `9${unik}1`.slice(0, 10) })).error?.message ?? '').toMatch(/NIK sudah terdaftar/);
  await adm.from('pendaftaran_siswa').update({ status: 'ditolak' }).eq('id', a.id);
  expect((await simpan(b, payload)).error).toBeNull();                      // NISN milik yang ditolak boleh dipakai lagi
  expect((await simpan(a, payload)).error?.message ?? '').toMatch(/ditolak/);   // yang ditolak tidak bisa mengubah data
});

test('PIN: salah dikembalikan sebagai pesan; kunci berlaku juga untuk simpan dan ambil', async () => {
  const p = await pendaftarBaru();
  const payload = bangunPayload(dataValid(unikBaru()));
  const salah = await simpan(p, payload, p.pin_akses === '000000' ? '111111' : '000000');
  expect(salah.error).toBeNull();
  expect(salah.data.ok).toBe(false);
  for (let i = 0; i < 4; i += 1) await anonClient().rpc('ambil_data_lengkap_ppdb', { p_nomor_registrasi: p.nomor_registrasi, p_pin_akses: `99999${i}` === p.pin_akses ? '888888' : `99999${i}` });
  const kunci = await simpan(p, payload);                                    // PIN benar tapi terkunci
  expect(kunci.data.ok).toBe(false);
  expect(kunci.data.pesan).toMatch(/Terlalu banyak/);
  const { count } = await adm.from('pendaftaran_data_lengkap').select('*', { count: 'exact', head: true }).eq('pendaftaran_id', p.id);
  expect(count).toBe(0);
});

test('akses baca: anon, guru, dan staf sekolah lain tidak bisa; staf sekolahnya bisa; tidak ada tulis langsung', async () => {
  const p = await pendaftarBaru();
  expect((await simpan(p, bangunPayload(dataValid(unikBaru())))).error).toBeNull();

  expect((await anonClient().from('pendaftaran_data_lengkap').select('nisn')).data ?? []).toHaveLength(0);
  expect((await (await clientAs(USERS.guruA)).from('pendaftaran_data_lengkap').select('nisn')).data ?? []).toHaveLength(0);
  expect((await (await clientAs(USERS.adminB)).from('pendaftaran_data_lengkap').select('nisn').eq('pendaftaran_id', p.id)).data ?? []).toHaveLength(0);
  for (const email of [USERS.staffA, USERS.tuA, USERS.kepsekA]) {
    expect((await (await clientAs(email)).from('pendaftaran_data_lengkap').select('nisn').eq('pendaftaran_id', p.id)).data, email).toHaveLength(1);
  }
  const staf = await clientAs(USERS.staffA);
  await staf.from('pendaftaran_data_lengkap').update({ nisn: '0000000000' }).eq('pendaftaran_id', p.id);
  await staf.from('pendaftaran_data_lengkap').delete().eq('pendaftaran_id', p.id);
  const { data } = await adm.from('pendaftaran_data_lengkap').select('nisn').eq('pendaftaran_id', p.id).single();
  expect(data.nisn).not.toBe('0000000000');

  // audit tidak memuat isi data sensitif
  const { data: log } = await adm.from('audit_log').select('data_baru').eq('tabel', 'pendaftaran_data_lengkap').eq('row_id', p.id);
  expect(log.length).toBeGreaterThan(0);
  expect(JSON.stringify(log)).not.toContain(data.nisn);
});

test('terima memakai tempat lahir dan alamat domisili dari data lengkap', async () => {
  const p = await pendaftarBaru({ p_nama_lengkap: 'Siswa Lengkap Terima' });
  const payload = bangunPayload(dataValid(unikBaru(), { sama: true }));
  expect((await simpan(p, { ...payload, tempat_lahir: 'Garut' })).error).toBeNull();
  const tu = await clientAs(USERS.tuA);
  const t = await tu.rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: p.id, p_nis: null, p_konfirmasi_lunas: true });
  expect(t.error, t.error?.message).toBeNull();
  const { data: s } = await adm.from('siswa').select('tempat_lahir,alamat').eq('id', t.data).single();
  expect(s).toEqual({ tempat_lahir: 'Garut', alamat: TEKS_ALAMAT });
  // setelah diterima, perubahan data lengkap ikut memperbarui siswa
  expect((await simpan(p, { ...payload, tempat_lahir: 'Bandung' })).error).toBeNull();
  expect((await adm.from('siswa').select('tempat_lahir').eq('id', t.data).single()).data.tempat_lahir).toBe('Bandung');
});

// ---------------- layar ----------------
async function isiLangkah(page, stepId, d) {
  for (const f of FIELDS.filter((x) => x.step === stepId && tampil(x, d))) {
    if (f.kind === 'bool') { if (d[f.key]) await page.locator(`input[name="${f.key}"]`).check(); continue; }
    if (f.kind === 'alamat') {
      for (const c of ALAMAT_KOMPONEN) await page.locator(`input[name="${f.key}.${c.key}"]`).fill(String(d[f.key][c.key]).replace('/', ''));
      continue;
    }
    if (f.kind === 'pilih') { await page.locator(`select[name="${f.key}"]`).selectOption(d[f.key]); continue; }
    await page.locator(`input[name="${f.key}"]`).fill(d[f.key]);
  }
}

test('layar: orang tua mengisi wizard sampai kirim; draf dipulihkan setelah reload; admin melihat dan mencetak data', async ({ page, browser }) => {
  test.setTimeout(120000);
  const p = await pendaftarBaru({ p_nama_lengkap: 'Siswa Lengkap Layar' });
  const d = dataValid(unikBaru(), { sama: true });
  const ortu = await browser.newPage();
  try {
    await ortu.goto(`${URL_A}/daftar?tab=cek`);
    const masuk = async () => {
      await ortu.locator('input[name=nomor_registrasi]').fill(p.nomor_registrasi);
      await ortu.locator('input[name=pin_akses]').fill(p.pin_akses);
      await ortu.getByRole('button', { name: 'Periksa Status' }).click();
      await expect(ortu.locator('#status-box')).toContainText('Data Lengkap');
      await ortu.locator('#isi-lengkap').click();
      await expect(ortu.locator('#wizard')).toBeVisible();
    };
    await masuk();

    // langkah 1 kosong ditolak, lalu diisi
    await ortu.locator('#w-maju').click();
    await expect(ortu.locator('.msg.err')).toContainText('perlu diperbaiki');
    await expect(ortu.locator('[data-galat=nisn]')).toContainText('NISN wajib diisi');
    await isiLangkah(ortu, STEPS[0].id, d);
    await ortu.locator('#w-maju').click();
    await expect(ortu.locator('.langkah li[aria-current=step]')).toContainText('2.');

    // reload di tengah jalan: draf pulih
    await ortu.waitForTimeout(800);
    await ortu.goto(`${URL_A}/daftar?tab=cek`);
    await masuk();
    await expect(ortu.locator('#info-draf')).toContainText('Draf dipulihkan');
    await expect(ortu.locator('.langkah li[aria-current=step]')).toContainText('2.');
    await ortu.locator('#w-mundur').click();
    await expect(ortu.locator('input[name=nisn]')).toHaveValue(d.nisn);
    await ortu.locator('#w-maju').click();

    await isiLangkah(ortu, STEPS[1].id, d);
    await ortu.locator('#w-maju').click();
    await isiLangkah(ortu, STEPS[2].id, d);
    await ortu.locator('#w-maju').click();

    // ringkasan memuat alamat gabungan; wajib centang pernyataan
    await expect(ortu.locator('#wf')).toContainText(TEKS_ALAMAT);
    await ortu.locator('#w-kirim').click();
    await expect(ortu.locator('[data-galat=_setuju]')).toBeVisible();
    await ortu.locator('input[name=_setuju]').check();
    await ortu.locator('#w-kirim').click();
    await expect(ortu.locator('#wizard-selesai')).toContainText('Data Lengkap Tersimpan');
    expect(await ortu.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ppdb-draft:')))).toHaveLength(0);

    const { data: l } = await adm.from('pendaftaran_data_lengkap').select('alamat_kk,nisn').eq('pendaftaran_id', p.id).single();
    expect(l).toEqual({ alamat_kk: TEKS_ALAMAT, nisn: d.nisn });

    // admin: tombol Data lengkap, detail memuat alamat gabungan
    await login(page, `${URL_A}/admin/pendaftar`, USERS.staffA);
    await siap(page);
    const baris = page.locator('tr', { hasText: 'Siswa Lengkap Layar' });
    await baris.getByRole('button', { name: 'Data lengkap' }).click();
    await expect(page.locator('#detail-lengkap')).toContainText(TEKS_ALAMAT);
    await expect(page.locator('#detail-lengkap')).toContainText(d.nisn);
    await expect(page.locator('#detail-lengkap')).toContainText('Data sensitif');
    await page.locator('#d-tutup').click();
    await expect(page.locator('#detail-lengkap')).toHaveCount(0);
  } finally {
    await ortu.close();
  }
});

test('layar: galat email tidak menghapus isian form pendaftaran awal', async ({ page }) => {
  await page.goto(`${URL_A}/daftar`);
  await page.locator('select[name=gelombang_id]').selectOption({ index: 1 }).catch(() => {});
  await page.locator('select[name=jurusan_id]').selectOption({ label: 'IPA' });
  await page.locator('input[name=nama_lengkap]').fill('Siswa Lengkap Email');
  await page.locator('input[name=tanggal_lahir]').fill('2010-05-05');
  await page.locator('input[name=nama_wali]').fill('Wali');
  await page.locator('input[name=no_hp_wali]').fill('0812345678');
  await page.locator('input[name=email_wali]').fill('a@example.com');
  await page.locator('input[name=email_wali2]').fill('b@example.com');
  await page.getByRole('button', { name: 'Kirim Pendaftaran' }).click();
  await expect(page.getByText('Email dan ulangi email tidak sama')).toBeVisible();
  await expect(page.locator('input[name=nama_lengkap]')).toHaveValue('Siswa Lengkap Email');
  await expect(page.locator('input[name=nama_wali]')).toHaveValue('Wali');
  await expect(page.locator('#catatan-email')).toContainText('bukan email anak');
});
