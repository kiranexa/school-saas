import { test, expect } from '@playwright/test';
import { SLUG_A, USERS } from '../config.js';
import { anonClient, clientAs, fixtures } from '../helpers.js';
import { adminClient, pastikanMigrasiPpdb } from '../seed.js';

// Percobaan terlarang lewat API langsung (melewati layar). Semuanya harus ditolak database.
test.describe.configure({ mode: 'serial' });

const adm = adminClient();
const NAMAS = [];
let gelA, gelB, jurA;

const daftar = (sb, o = {}) => sb.rpc('daftar_ppdb_publik', {
  p_tenant_slug: SLUG_A, p_gelombang_id: gelA, p_jurusan_id: jurA, p_nama_lengkap: `Siswa Uji ${Math.random().toString(36).slice(2, 8)}`,
  p_nik: null, p_jenis_kelamin: 'P', p_tempat_lahir: null, p_tanggal_lahir: '2011-01-01', p_asal_sekolah: null,
  p_nama_wali: 'Wali Uji', p_no_hp_wali: `0813${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
  p_email_wali: 'wali.e2e@example.com', p_alamat: null, ...o,
});
async function daftarOk(o) {
  const r = await daftar(anonClient(), o);
  expect(r.error, `daftar: ${r.error?.message}`).toBeNull();
  expect(r.data.ok).toBe(true);
  NAMAS.push(r.data.id);
  return r.data;
}

test.beforeAll(async () => {
  await pastikanMigrasiPpdb(adm);
  const { tenantA, tenantB } = fixtures();
  const g = await adm.from('gelombang_pendaftaran').insert([
    { tenant_id: tenantA, nama: 'Gel Keamanan A', status: 'dibuka' },
    { tenant_id: tenantB, nama: 'Gel Keamanan B', status: 'dibuka' },
  ]).select('id,tenant_id');
  gelA = g.data.find((x) => x.tenant_id === tenantA).id;
  gelB = g.data.find((x) => x.tenant_id === tenantB).id;
  jurA = (await adm.from('jurusan').select('id').eq('tenant_id', tenantA).eq('nama', 'IPA').single()).data.id;
});

test.afterAll(async () => {
  await adm.from('pendaftaran_siswa').delete().in('gelombang_id', [gelA, gelB]);
  await adm.from('gelombang_pendaftaran').delete().in('id', [gelA, gelB]);
  await adm.from('siswa').delete().like('nama', 'Siswa Uji %');
});

test('tabel pendaftar: anon tidak bisa baca; staf tidak bisa baca PIN atau menulis langsung', async () => {
  const data = await daftarOk();
  const anon = anonClient();
  const a = await anon.from('pendaftaran_siswa').select('nomor_registrasi');
  expect(a.data ?? []).toHaveLength(0);

  const staf = await clientAs(USERS.staffA);
  expect((await staf.from('pendaftaran_siswa').select('pin_akses')).error).not.toBeNull();     // kolom PIN dicabut
  expect((await staf.from('pendaftaran_siswa').select('*')).error).not.toBeNull();
  expect((await staf.from('pendaftaran_siswa').select('id,nomor_registrasi,total_biaya,email_wali').eq('id', data.id)).data).toHaveLength(1);

  for (const email of [USERS.staffA, USERS.tuA, USERS.kepsekA, USERS.adminA]) {
    const sb = await clientAs(email);
    await sb.from('pendaftaran_siswa').update({ status: 'diterima', status_bayar: 'lunas' }).eq('id', data.id);
    await sb.from('pendaftaran_siswa').delete().eq('id', data.id);
    const ins = await sb.from('pendaftaran_siswa').insert({ tenant_id: fixtures().tenantA, gelombang_id: gelA, nomor_registrasi: 'X', pin_akses: '1', nama_lengkap: 'x', nama_wali: 'y', no_hp_wali: 'z' });
    expect(ins.error, `insert langsung oleh ${email}`).not.toBeNull();
  }
  const { data: sisa } = await adm.from('pendaftaran_siswa').select('status,status_bayar').eq('id', data.id).single();
  expect(sisa).toEqual({ status: 'baru', status_bayar: 'belum_bayar' });

  const adminB = await clientAs(USERS.adminB);
  expect((await adminB.from('pendaftaran_siswa').select('id').eq('id', data.id)).data ?? []).toHaveLength(0);
});

test('validasi pendaftaran: email, HP, NIK, jurusan wajib, tanggal lahir, gelombang sekolah lain', async () => {
  const anon = anonClient();
  const gagal = async (o, pola) => {
    const r = await daftar(anon, o);
    expect(r.error, JSON.stringify(o)).not.toBeNull();
    expect(r.error.message).toMatch(pola);
  };
  await gagal({ p_email_wali: '' }, /email/i);
  await gagal({ p_email_wali: 'bukan-email' }, /email/i);
  await gagal({ p_no_hp_wali: 'abc' }, /HP/);
  await gagal({ p_nik: '123' }, /NIK/);
  await gagal({ p_jenis_kelamin: 'X' }, /kelamin/i);
  await gagal({ p_jurusan_id: null }, /jurusan/i);                     // sekolah A punya jurusan aktif
  await gagal({ p_tanggal_lahir: '2099-01-01' }, /lahir/i);
  await gagal({ p_gelombang_id: gelB }, /tidak tersedia/i);            // gelombang milik sekolah B
  await gagal({ p_tenant_slug: 'tidak-ada-xyz' }, /tidak ditemukan/i);
});

test('rincian biaya disalin dari master saat mendaftar dan tidak ikut berubah', async () => {
  const { tenantA } = fixtures();
  const { data: master } = await adm.from('komponen_biaya').select('nominal,wajib').eq('tenant_id', tenantA).eq('aktif', true);
  const harapan = master.filter((m) => m.wajib).reduce((s, m) => s + Number(m.nominal), 0);
  const d = await daftarOk();
  expect(Number(d.total_biaya)).toBe(harapan);
  expect(d.rincian_biaya.length).toBe(master.length);

  await adm.from('komponen_biaya').update({ nominal: 7777777 }).eq('tenant_id', tenantA).eq('nama', 'Uang gedung');
  try {
    const { data: row } = await adm.from('pendaftaran_siswa').select('total_biaya').eq('id', d.id).single();
    expect(Number(row.total_biaya)).toBe(harapan);                      // tagihan lama tidak berubah
  } finally {
    await adm.from('komponen_biaya').update({ nominal: 5000000 }).eq('tenant_id', tenantA).eq('nama', 'Uang gedung');
  }
});

test('biaya_daftar gelombang tidak bisa diubah staf (biaya resmi lewat persetujuan kepala sekolah)', async () => {
  const staf = await clientAs(USERS.staffA);
  await staf.from('gelombang_pendaftaran').update({ biaya_daftar: 1 }).eq('id', gelA);
  const { data } = await adm.from('gelombang_pendaftaran').select('biaya_daftar').eq('id', gelA).single();
  expect(Number(data.biaya_daftar)).toBe(0);
  const baru = await staf.from('gelombang_pendaftaran').insert({ tenant_id: fixtures().tenantA, nama: 'Gel Biaya Beku', status: 'draft', biaya_daftar: 999 }).select('biaya_daftar').single();
  try { expect(Number(baru.data?.biaya_daftar ?? 0)).toBe(0); }
  finally { await adm.from('gelombang_pendaftaran').delete().eq('nama', 'Gel Biaya Beku'); }
});

test('PIN: salah dikembalikan sebagai pesan, 5 kali salah mengunci, PIN benar saat terkunci tetap ditolak', async () => {
  const d = await daftarOk();
  const anon = anonClient();
  const cek = (pin) => anon.rpc('cek_status_ppdb', { p_nomor_registrasi: d.nomor_registrasi, p_pin_akses: pin });
  const salah = await cek('000000' === d.pin_akses ? '111111' : '000000');
  expect(salah.error).toBeNull();
  expect(salah.data.ok).toBe(false);
  for (let i = 0; i < 4; i += 1) await cek(`99999${i}` === d.pin_akses ? '888888' : `99999${i}`);
  const kunci = await cek(d.pin_akses);
  expect(kunci.data.ok).toBe(false);
  expect(kunci.data.pesan).toMatch(/Terlalu banyak/);
  const bayar = await anon.rpc('konfirmasi_bayar_ppdb', { p_nomor_registrasi: d.nomor_registrasi, p_pin_akses: d.pin_akses, p_metode_bayar_id: fixtures().metodeA, p_nominal_bayar: 1000, p_nama_pengirim: 'X', p_catatan_bayar: null });
  expect(bayar.data?.ok).toBe(false);
  // buka kunci lewat secret key, lalu PIN benar diterima
  await adm.from('pendaftaran_siswa').update({ pin_terkunci_sampai: new Date(Date.now() - 60000).toISOString() }).eq('id', d.id);
  const ok = await cek(d.pin_akses);
  expect(ok.data.ok).toBe(true);
  expect(ok.data.pin_akses).toBeUndefined();
  expect(ok.data.no_hp_wali).toBeUndefined();
});

test('pembatas: satu nomor HP maksimal 5 pendaftaran per hari', async () => {
  const hp = `0814${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  for (let i = 0; i < 5; i += 1) await daftarOk({ p_no_hp_wali: hp, p_tanggal_lahir: `2012-02-0${i + 1}` });
  const r = await daftar(anonClient(), { p_no_hp_wali: hp, p_tanggal_lahir: '2012-02-09' });
  expect(r.error?.message ?? '').toMatch(/5 pendaftaran/);
});

test('konfirmasi bayar: tujuan sekolah lain ditolak; setelah diterima tidak bisa diubah lagi', async () => {
  const d = await daftarOk();
  const anon = anonClient();
  const bayar = (metode, pin = d.pin_akses) => anon.rpc('konfirmasi_bayar_ppdb', { p_nomor_registrasi: d.nomor_registrasi, p_pin_akses: pin, p_metode_bayar_id: metode, p_nominal_bayar: 5000000, p_nama_pengirim: 'Wali Uji', p_catatan_bayar: null });
  expect((await bayar(fixtures().metodeB)).error?.message ?? '').toMatch(/Tujuan pembayaran/);
  expect((await bayar(null)).error?.message ?? '').toMatch(/Tujuan pembayaran/);
  expect((await bayar(fixtures().metodeA)).data.ok).toBe(true);

  const tu = await clientAs(USERS.tuA);
  const terima = await tu.rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: d.id, p_nis: null });
  expect(terima.error).toBeNull();
  const lagi = await bayar(fixtures().metodeA);
  expect(lagi.error?.message ?? '').toMatch(/sudah diproses/);
  const { data } = await adm.from('pendaftaran_siswa').select('status,status_bayar').eq('id', d.id).single();
  expect(data).toEqual({ status: 'diterima', status_bayar: 'lunas' });
});

test('terima/tolak: hanya staf sekolahnya; siswa dibuat benar, idempoten, tercatat di audit tanpa PIN', async () => {
  const { tenantA, ids } = fixtures();
  const d = await daftarOk({ p_nama_lengkap: 'Siswa Uji Terima', p_tanggal_lahir: '2010-10-10' });
  await adm.from('pendaftaran_siswa').update({ status_bayar: 'menunggu_konfirmasi', status: 'menunggu_verifikasi' }).eq('id', d.id);

  for (const email of [USERS.adminB, USERS.guruA, USERS.siswaA]) {
    const sb = await clientAs(email);
    expect((await sb.rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: d.id, p_nis: 'HACK' })).error, `terima oleh ${email}`).not.toBeNull();
    expect((await sb.rpc('tolak_pendaftar_ppdb', { p_pendaftaran_id: d.id })).error, `tolak oleh ${email}`).not.toBeNull();
  }
  expect((await anonClient().rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: d.id, p_nis: 'HACK' })).error).not.toBeNull();

  const tu = await clientAs(USERS.tuA);
  const t1 = await tu.rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: d.id, p_nis: 'NIS-E2E-14', p_catatan_admin: 'ok' });
  expect(t1.error, t1.error?.message).toBeNull();
  const { data: siswa } = await adm.from('siswa').select('nama,jk,tgl_lahir,nis,nama_wali,tenant_id,status').eq('id', t1.data).single();
  expect(siswa).toMatchObject({ nama: 'Siswa Uji Terima', jk: 'P', tgl_lahir: '2010-10-10', nis: 'NIS-E2E-14', nama_wali: 'Wali Uji', tenant_id: tenantA, status: 'aktif' });
  const t2 = await tu.rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: d.id, p_nis: 'NIS-LAIN' });
  expect(t2.data).toBe(t1.data);                                          // idempoten
  const { count } = await adm.from('siswa').select('*', { count: 'exact', head: true }).eq('nama', 'Siswa Uji Terima');
  expect(count).toBe(1);

  const { data: log } = await adm.from('audit_log').select('user_id,data_baru').eq('tabel', 'pendaftaran_siswa').eq('aksi', 'TERIMA').eq('row_id', d.id);
  expect(log).toHaveLength(1);
  expect(log[0].user_id).toBe(ids.tuA);
  expect(JSON.stringify(log[0].data_baru)).not.toContain(d.pin_akses);
  expect((await tu.rpc('tolak_pendaftar_ppdb', { p_pendaftaran_id: d.id })).error?.message ?? '').toMatch(/sudah diterima/);
});

test('terima yang belum bayar wajib konfirmasi lunas oleh admin (pembayaran tunai)', async () => {
  const d = await daftarOk();
  const staf = await clientAs(USERS.staffA);
  const tanpa = await staf.rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: d.id, p_nis: null });
  expect(tanpa.error?.message ?? '').toMatch(/belum dikonfirmasi/);
  const dengan = await staf.rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: d.id, p_nis: null, p_konfirmasi_lunas: true });
  expect(dengan.error).toBeNull();
  const { data: log } = await adm.from('audit_log').select('data_baru').eq('aksi', 'TERIMA').eq('row_id', d.id).single();
  expect(log.data_baru.lunas_dikonfirmasi_admin).toBe(true);
  expect(log.data_baru.status_bayar_sebelum).toBe('belum_bayar');
});
