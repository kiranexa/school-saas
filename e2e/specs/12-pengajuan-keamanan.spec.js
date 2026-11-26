import { test, expect } from '@playwright/test';
import { USERS } from '../config.js';
import { anonClient, clientAs, fixtures } from '../helpers.js';
import { adminClient } from '../seed.js';

// Percobaan terlarang lewat API langsung (melewati layar). Semuanya harus ditolak database.
test.describe.configure({ mode: 'serial' });

const BARU = (nama) => ({ nama, nominal: 250000, wajib: true, aktif: true, urutan: 9 });
const ajukan = (sb, tenant, data, id = null) =>
  sb.rpc('ajukan_perubahan', { p_tenant: tenant, p_entitas: 'komponen_biaya', p_entitas_id: id, p_data: data });

async function bersih(nama) {
  const adm = adminClient();
  await adm.from('pengajuan_perubahan').delete().eq('data->>nama', nama);
  await adm.from('komponen_biaya').delete().eq('nama', nama);
}

test('tidak ada peran yang bisa menulis biaya/rekening/pengajuan secara langsung', async () => {
  const { tenantA, biayaA, metodeA } = fixtures();
  for (const email of [USERS.staffA, USERS.tuA, USERS.kepsekA, USERS.adminA]) {
    const sb = await clientAs(email);
    const ins = await sb.from('komponen_biaya').insert({ tenant_id: tenantA, nama: 'LANGSUNG', nominal: 1 });
    expect(ins.error, `insert biaya oleh ${email}`).not.toBeNull();
    await sb.from('komponen_biaya').update({ nominal: 1 }).eq('id', biayaA);
    await sb.from('komponen_biaya').delete().eq('id', biayaA);
    await sb.from('metode_pembayaran').update({ nomor: '0000' }).eq('id', metodeA);
    await sb.from('metode_pembayaran').delete().eq('id', metodeA);
    const pj = await sb.from('pengajuan_perubahan').insert({
      tenant_id: tenantA, entitas: 'komponen_biaya', aksi: 'buat', data: BARU('LANGSUNG'),
      status: 'disetujui', diputuskan_at: new Date().toISOString(),
    });
    expect(pj.error, `insert pengajuan oleh ${email}`).not.toBeNull();
  }
  const adm = adminClient();
  const { data: b } = await adm.from('komponen_biaya').select('nominal').eq('id', biayaA).single();
  const { data: m } = await adm.from('metode_pembayaran').select('nomor').eq('id', metodeA).single();
  expect(Number(b.nominal)).toBe(5000000);
  expect(m.nomor).toBe('1234567890');
  const { count } = await adm.from('komponen_biaya').select('*', { count: 'exact', head: true }).eq('nama', 'LANGSUNG');
  expect(count).toBe(0);
});

test('hanya admin/TU yang bisa mengajukan; guru, kepsek, owner, dan admin sekolah lain ditolak', async () => {
  const { tenantA } = fixtures();
  for (const email of [USERS.guruA, USERS.siswaA, USERS.kepsekA, USERS.adminA, USERS.adminB]) {
    const sb = await clientAs(email);
    const { error } = await ajukan(sb, tenantA, BARU('TOLAK-AJU'));
    expect(error, `ajukan oleh ${email}`).not.toBeNull();
  }
  const { error } = await ajukan(anonClient(), tenantA, BARU('TOLAK-AJU'));
  expect(error).not.toBeNull();
  const { count } = await adminClient().from('pengajuan_perubahan').select('*', { count: 'exact', head: true }).eq('data->>nama', 'TOLAK-AJU');
  expect(count).toBe(0);
});

test('input tidak valid ditolak oleh database', async () => {
  const { tenantA } = fixtures();
  const sb = await clientAs(USERS.staffA);
  for (const data of [{ nama: 'X', nominal: -1 }, { nama: 'X', nominal: 'abc' }, { nama: '  ', nominal: 1 }]) {
    expect((await ajukan(sb, tenantA, data)).error).not.toBeNull();
  }
  const metode = (data) => sb.rpc('ajukan_perubahan', { p_tenant: tenantA, p_entitas: 'metode_pembayaran', p_entitas_id: null, p_data: data });
  expect((await metode({ jenis: 'transfer', penyedia: 'BCA', nomor: '1' })).error).not.toBeNull();   // tanpa atas nama
  expect((await metode({ jenis: 'kripto', penyedia: 'X', nomor: '1' })).error).not.toBeNull();
  const asing = await sb.rpc('ajukan_perubahan', { p_tenant: tenantA, p_entitas: 'siswa', p_entitas_id: null, p_data: { nama: 'X', nominal: 1 } });
  expect(asing.error).not.toBeNull();
});

test('persetujuan: hanya kepsek (atau owner); admin, TU, guru, orang luar, dan pengaju sendiri ditolak', async () => {
  const { tenantA, ids } = fixtures();
  const NAMA = 'Biaya Uji API';
  const adm = adminClient();
  try {
    const aju = await ajukan(await clientAs(USERS.staffA), tenantA, BARU(NAMA));
    expect(aju.error).toBeNull();
    const pid = aju.data;
    const setuju = (sb) => sb.rpc('setujui_pengajuan', { p_id: pid });

    for (const email of [USERS.staffA, USERS.tuA, USERS.guruA, USERS.adminB]) {
      expect((await setuju(await clientAs(email))).error, `setujui oleh ${email}`).not.toBeNull();
    }
    expect((await setuju(anonClient())).error).not.toBeNull();
    expect((await (await clientAs(USERS.staffA)).from('komponen_biaya').select('id').eq('nama', NAMA)).data).toEqual([]);

    // pengaju yang kebetulan juga kepala sekolah tetap tidak boleh menyetujui sendiri
    await adm.from('tenant_members').insert({ tenant_id: tenantA, user_id: ids.staffA, role: 'kepala_sekolah' });
    const diri = await setuju(await clientAs(USERS.staffA));
    expect(diri.error?.message ?? '').toMatch(/mengajukannya/);
    await adm.from('tenant_members').delete().eq('tenant_id', tenantA).eq('user_id', ids.staffA).eq('role', 'kepala_sekolah');

    // kepala sekolah boleh; setelah itu data berlaku dan tidak bisa disetujui ulang
    const ok = await setuju(await clientAs(USERS.kepsekA));
    expect(ok.error).toBeNull();
    const { data } = await adm.from('komponen_biaya').select('nominal,tenant_id').eq('nama', NAMA);
    expect(data).toHaveLength(1);
    expect(data[0].tenant_id).toBe(tenantA);
    expect((await setuju(await clientAs(USERS.kepsekA))).error).not.toBeNull();
  } finally {
    await adm.from('tenant_members').delete().eq('tenant_id', tenantA).eq('user_id', ids.staffA).eq('role', 'kepala_sekolah');
    await bersih(NAMA);
  }
});

test('ubah: data lama tetap berlaku saat menunggu atau ditolak; satu pengajuan menunggu per data; tanpa perubahan ditolak', async () => {
  const { tenantA, biayaA } = fixtures();
  const adm = adminClient();
  const nominal = async () => Number((await adm.from('komponen_biaya').select('nominal').eq('id', biayaA).single()).data.nominal);
  const penuh = (n) => ({ nama: 'Uang gedung', nominal: n, wajib: true, aktif: true, urutan: 1 });
  const tu = await clientAs(USERS.tuA);
  try {
    expect((await ajukan(tu, tenantA, penuh(5000000), biayaA)).error).not.toBeNull();     // tanpa perubahan
    const aju = await ajukan(tu, tenantA, penuh(9000000), biayaA);
    expect(aju.error).toBeNull();
    expect(await nominal()).toBe(5000000);
    const ganda = await ajukan(await clientAs(USERS.staffA), tenantA, penuh(9500000), biayaA);
    expect(ganda.error?.code).toBe('23505');                                              // sudah ada yang menunggu

    expect((await (await clientAs(USERS.staffA)).rpc('batalkan_pengajuan', { p_id: aju.data })).error).not.toBeNull();  // bukan miliknya
    const tolak = await (await clientAs(USERS.kepsekA)).rpc('tolak_pengajuan', { p_id: aju.data, p_catatan: 'terlalu mahal' });
    expect(tolak.error).toBeNull();
    expect(await nominal()).toBe(5000000);
    expect((await (await clientAs(USERS.staffA)).rpc('tolak_pengajuan', { p_id: aju.data })).error).not.toBeNull();     // admin tak bisa menolak
  } finally {
    await adm.from('pengajuan_perubahan').delete().eq('tenant_id', tenantA).eq('entitas_id', biayaA);
    await adm.from('komponen_biaya').update({ nominal: 5000000 }).eq('id', biayaA);
  }
});

test('visibilitas: anon hanya melihat yang aktif; pengajuan hanya untuk staf sekolahnya', async () => {
  const { tenantA, tenantB } = fixtures();
  const anon = anonClient();
  const jur = await anon.from('jurusan').select('nama,aktif').eq('tenant_id', tenantA);
  expect(jur.data.every((j) => j.aktif)).toBe(true);
  expect(jur.data.map((j) => j.nama)).toContain('IPA');
  expect(jur.data.map((j) => j.nama)).not.toContain('IPS');                               // nonaktif
  expect((await anon.from('metode_pembayaran').select('id').eq('tenant_id', tenantA)).data.length).toBeGreaterThan(0);
  expect((await anon.from('pengajuan_perubahan').select('id')).data).toEqual([]);
  expect((await anon.from('jurusan').insert({ tenant_id: tenantA, nama: 'ANON' })).error).not.toBeNull();

  const adm = adminClient();
  const aju = await ajukan(await clientAs(USERS.staffA), tenantA, BARU('Biaya Lihat'));
  expect(aju.error).toBeNull();
  try {
    expect((await (await clientAs(USERS.guruA)).from('pengajuan_perubahan').select('id')).data).toEqual([]);
    expect((await (await clientAs(USERS.adminB)).from('pengajuan_perubahan').select('id').eq('tenant_id', tenantA)).data).toEqual([]);
    expect((await (await clientAs(USERS.tuA)).from('pengajuan_perubahan').select('id').eq('id', aju.data)).data).toHaveLength(1);
    // jurusan nonaktif A tidak terlihat staf B; staf B tidak bisa menulis jurusan A
    const b = await clientAs(USERS.adminB);
    expect((await b.from('jurusan').select('nama').eq('tenant_id', tenantA).eq('nama', 'IPS')).data).toEqual([]);
    expect((await b.from('jurusan').insert({ tenant_id: tenantA, nama: 'LINTAS' })).error).not.toBeNull();
  } finally {
    await adm.from('pengajuan_perubahan').delete().eq('id', aju.data);
    await adm.from('jurusan').delete().eq('tenant_id', tenantA).eq('nama', 'LINTAS');
  }
  expect(tenantB).toBeTruthy();
});

test('audit: persetujuan tercatat dengan pelakunya', async () => {
  const { tenantA, ids } = fixtures();
  const NAMA = 'Biaya Uji Audit';
  const adm = adminClient();
  try {
    const aju = await ajukan(await clientAs(USERS.tuA), tenantA, BARU(NAMA));
    expect(aju.error).toBeNull();
    expect((await (await clientAs(USERS.kepsekA)).rpc('setujui_pengajuan', { p_id: aju.data })).error).toBeNull();
    const { data: biaya } = await adm.from('komponen_biaya').select('id').eq('nama', NAMA).single();
    const { data: log } = await adm.from('audit_log').select('aksi,user_id').eq('tabel', 'komponen_biaya').eq('row_id', biaya.id);
    expect(log?.length).toBeGreaterThan(0);
    expect(log.some((l) => l.user_id === ids.kepsekA)).toBe(true);
  } finally {
    await bersih(NAMA);
  }
});
