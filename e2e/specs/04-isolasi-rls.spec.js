import { test, expect } from '@playwright/test';
import { SLUG_A, SLUG_B, USERS } from '../config.js';
import { anonClient, clientAs, fixtures } from '../helpers.js';

test('anon: tidak bisa membaca siswa maupun audit_log', async () => {
  const sb = anonClient();
  for (const tabel of ['siswa', 'guru', 'nilai', 'tagihan', 'audit_log']) {
    const { data, error } = await sb.from(tabel).select('id').limit(5);
    expect(error, tabel).toBeNull();
    expect(data, tabel).toEqual([]);
  }
});

test('anon: data sekolah (publik) bisa dibaca', async () => {
  const { data } = await anonClient().from('tenants').select('slug').in('slug', [SLUG_A, SLUG_B]);
  expect(data).toHaveLength(2);
});

test('anon: tidak boleh memanggil create_school', async () => {
  const { error } = await anonClient().rpc('create_school', {
    p_slug: 'e2e-intruder', p_nama: 'x', p_base_domain: 'x.id',
    p_owner_user_id: '00000000-0000-0000-0000-000000000000',
  });
  expect(error).not.toBeNull();
});

test('admin A: tidak melihat dan tidak bisa menulis data sekolah B', async () => {
  const { tenantA, tenantB } = fixtures();
  const sb = await clientAs(USERS.adminA);

  const b = await sb.from('siswa').select('id').eq('tenant_id', tenantB);
  expect(b.data).toEqual([]);

  const semua = await sb.from('siswa').select('tenant_id');
  expect(semua.data.length).toBeGreaterThan(0);
  expect(semua.data.every((r) => r.tenant_id === tenantA)).toBe(true);

  const ins = await sb.from('siswa').insert({ tenant_id: tenantB, nis: 'X1', nama: 'Penyusup' });
  expect(ins.error).not.toBeNull();
});

test('siswa: hanya membaca data dirinya, tidak bisa menulis nilai', async () => {
  const { tenantA } = fixtures();
  const sb = await clientAs(USERS.siswaA);

  expect((await sb.from('siswa').select('id')).data).toHaveLength(1);
  expect((await sb.from('nilai').select('id')).data).toHaveLength(1);
  expect((await sb.from('audit_log').select('id')).data).toEqual([]);

  const mapel = await sb.from('mata_pelajaran').select('id').eq('tenant_id', tenantA).limit(1);
  const ins = await sb.from('nilai').insert({
    tenant_id: tenantA, siswa_id: (await sb.from('siswa').select('id')).data[0].id,
    mapel_id: mapel.data[0].id, jenis: 'uh', skor: 100,
  });
  expect(ins.error).not.toBeNull();
});
