import { test, expect } from '@playwright/test';
import { USERS } from '../config.js';
import { anonClient, clientAs, fixtures } from '../helpers.js';
import { adminClient } from '../seed.js';

// Tes di file ini sengaja mencoba hal terlarang. Jika kebijakan bocor, data uji bisa berubah,
// jadi setiap tes memulihkan keadaan lewat klien admin (secret key) di blok finally.

test('admin (bukan owner) tidak bisa memberi peran owner, tapi bisa peran lain', async () => {
  const { tenantA, ids } = fixtures();
  const sb = await clientAs(USERS.staffA);
  try {
    const owner = await sb.from('tenant_members').insert({ tenant_id: tenantA, user_id: ids.guruA, role: 'owner' });
    expect(owner.error).not.toBeNull();

    const wali = await sb.from('tenant_members').insert({ tenant_id: tenantA, user_id: ids.guruA, role: 'wali' });
    expect(wali.error).toBeNull();
    const hapus = await sb.from('tenant_members').delete().eq('tenant_id', tenantA).eq('user_id', ids.guruA).eq('role', 'wali');
    expect(hapus.error).toBeNull();
  } finally {
    await adminClient().from('tenant_members').delete()
      .eq('tenant_id', tenantA).eq('user_id', ids.guruA).in('role', ['owner', 'wali']);
  }
});

test('admin (bukan owner) tidak bisa mengubah atau menghapus owner', async () => {
  const { tenantA, ids } = fixtures();
  const sb = await clientAs(USERS.staffA);
  try {
    await sb.from('tenant_members').update({ role: 'guru' }).eq('tenant_id', tenantA).eq('user_id', ids.adminA);
    await sb.from('tenant_members').delete().eq('tenant_id', tenantA).eq('user_id', ids.adminA);

    const owner = await clientAs(USERS.adminA);
    const { data } = await owner.from('tenant_members').select('role').eq('tenant_id', tenantA).eq('user_id', ids.adminA);
    expect(data).toEqual([{ role: 'owner' }]);
  } finally {
    const adm = adminClient();                       // pulihkan status owner jika sempat rusak
    await adm.from('tenant_members').delete().eq('tenant_id', tenantA).eq('user_id', ids.adminA).neq('role', 'owner');
    await adm.from('tenant_members').upsert(
      { tenant_id: tenantA, user_id: ids.adminA, role: 'owner' },
      { onConflict: 'tenant_id,user_id,role' },
    );
  }
});

test('guru: hanya boleh menulis nilai dan absensi siswa di kelas yang diajar', async () => {
  const { tenantA, siswa, mapel } = fixtures();
  const sb = await clientAs(USERS.guruA);
  const nilai = (sid) => sb.from('nilai').insert({ tenant_id: tenantA, siswa_id: sid, mapel_id: mapel.MTK, jenis: 'uji-guru', skor: 80 });
  const absen = (sid) => sb.from('absensi').insert({ tenant_id: tenantA, siswa_id: sid, tanggal: '2026-02-02', status: 'hadir' });
  try {
    expect((await nilai(siswa.E2E001)).error).toBeNull();
    expect((await nilai(siswa.E2E002)).error).not.toBeNull();
    expect((await absen(siswa.E2E001)).error).toBeNull();
    expect((await absen(siswa.E2E002)).error).not.toBeNull();
  } finally {
    const adm = adminClient();
    await adm.from('nilai').delete().eq('jenis', 'uji-guru');
    await adm.from('absensi').delete().eq('tanggal', '2026-02-02');
  }
});

test('guru tidak bisa membaca tagihan', async () => {
  const { data } = await (await clientAs(USERS.guruA)).from('tagihan').select('id');
  expect(data).toEqual([]);
});

test('integritas: penempatan lintas sekolah dan ganda ditolak', async () => {
  const { tenantA, kelas, siswa } = fixtures();
  const sb = await clientAs(USERS.adminA);
  try {
    const lintas = await sb.from('kelas_siswa').insert({ tenant_id: tenantA, kelas_id: kelas['X-A1'], siswa_id: siswa.B001 });
    expect(lintas.error).not.toBeNull();
    const ganda = await sb.from('kelas_siswa').insert({ tenant_id: tenantA, kelas_id: kelas['X-A1'], siswa_id: siswa.E2E002 });
    expect(ganda.error?.message).toMatch(/kelas lain/);
  } finally {
    await adminClient().from('kelas_siswa').delete()
      .eq('kelas_id', kelas['X-A1']).in('siswa_id', [siswa.B001, siswa.E2E002]);
  }
});

test('integritas: dua tahun ajaran aktif ditolak', async () => {
  const { tenantA } = fixtures();
  try {
    const { error } = await (await clientAs(USERS.adminA)).from('tahun_ajaran')
      .insert({ tenant_id: tenantA, nama: '2098/2099', semester: 1, aktif: true });
    expect(error?.code).toBe('23505');
  } finally {
    await adminClient().from('tahun_ajaran').delete().eq('tenant_id', tenantA).eq('nama', '2098/2099');
  }
});

test('anon tidak bisa memanggil fungsi simpan massal', async () => {
  const { kelas, mapel } = fixtures();
  const sb = anonClient();
  expect((await sb.rpc('simpan_absensi_harian', { p_kelas_id: kelas['X-A1'], p_tanggal: '2026-03-03', p_data: [] })).error).not.toBeNull();
  expect((await sb.rpc('simpan_nilai_kelas', { p_kelas_id: kelas['X-A1'], p_mapel_id: mapel.MTK, p_jenis: 'x', p_data: [] })).error).not.toBeNull();
});
