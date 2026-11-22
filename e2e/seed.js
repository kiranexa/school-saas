import { createClient } from '@supabase/supabase-js';
import { SLUG_A, SLUG_B, PASSWORD, USERS } from './config.js';

// Klien admin (secret key). HANYA dipakai di setup/teardown tes, tidak pernah di frontend.
export function adminClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Isi VITE_SUPABASE_URL dan E2E_SUPABASE_SECRET_KEY di .env.e2e');
  const ref = new URL(url).hostname.split('.')[0];
  if (process.env.E2E_PROJECT_REF !== ref) {
    throw new Error(`Pengaman: set E2E_PROJECT_REF=${ref} di .env.e2e untuk mengonfirmasi project yang boleh diisi data uji.`);
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const must = ({ data, error }, label) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};

// Hapus semua data uji. Tenant dulu (cascade), baru user.
export async function cleanup(sb) {
  must(await sb.from('tenants').delete().in('slug', [SLUG_A, SLUG_B]), 'hapus tenant uji');
  const emails = Object.values(USERS);
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  for (const u of data.users.filter((x) => emails.includes(x.email))) {
    const r = await sb.auth.admin.deleteUser(u.id);
    if (r.error) throw new Error(`deleteUser ${u.email}: ${r.error.message}`);
  }
}

// Pastikan migrasi 003 sudah diterapkan di project yang dipakai tes ini.
export async function pastikanMigrasi(sb) {
  const nol = '00000000-0000-0000-0000-000000000000';
  const { error } = await sb.rpc('guru_boleh_siswa', { t: nol, s: nol });
  if (error) {
    throw new Error(
      'Migrasi 003 belum diterapkan di project staging (fungsi guru_boleh_siswa tidak ditemukan). ' +
      'Jalankan supabase/migrations/20261121000003_pengamanan_dan_operasional.sql di SQL Editor project STAGING, lalu ulangi tes. ' +
      `Detail: ${error.message}`,
    );
  }
}

/*
 * Data uji sekolah A:
 *  - Kelas X-A1 (diajar guruA via jadwal MTK): siswa "Siswa Uji A" (E2E001, akun siswaA)
 *  - Kelas X-A2 (TIDAK diajar guruA): siswa "Siswa Lain A" (E2E002)
 *  - "Siswa Penempatan" (E2E003): belum punya kelas
 *  - Tagihan SPP 100000 untuk E2E001
 * Sekolah B: "Siswa Sekolah B" (B001)
 */
export async function seed(sb) {
  await pastikanMigrasi(sb);
  const ids = {};
  for (const [key, email] of Object.entries(USERS)) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    ids[key] = data.user.id;
  }

  const school = async (slug, nama, owner) =>
    must(await sb.rpc('create_school', {
      p_slug: slug, p_nama: nama, p_base_domain: 'e2e.test', p_owner_user_id: owner, p_jenjang: 'SMA',
    }), `create_school ${slug}`);
  const tenantA = await school(SLUG_A, 'E2E Sekolah A', ids.adminA);
  const tenantB = await school(SLUG_B, 'E2E Sekolah B', ids.adminB);

  must(await sb.from('tenant_members').insert([
    { tenant_id: tenantA, user_id: ids.staffA, role: 'admin' },
    { tenant_id: tenantA, user_id: ids.guruA, role: 'guru' },
    { tenant_id: tenantA, user_id: ids.siswaA, role: 'siswa' },
  ]), 'tenant_members');

  const guru = must(await sb.from('guru').insert({
    tenant_id: tenantA, user_id: ids.guruA, nip: 'G001', nama: 'Guru Uji A',
  }).select('id').single(), 'guru');

  const ta = must(await sb.from('tahun_ajaran').select('id').eq('tenant_id', tenantA).eq('aktif', true).single(), 'tahun_ajaran');

  const siswa = must(await sb.from('siswa').insert([
    { tenant_id: tenantA, user_id: ids.siswaA, nis: 'E2E001', nama: 'Siswa Uji A' },
    { tenant_id: tenantA, nis: 'E2E002', nama: 'Siswa Lain A' },
    { tenant_id: tenantA, nis: 'E2E003', nama: 'Siswa Penempatan' },
    { tenant_id: tenantB, nis: 'B001', nama: 'Siswa Sekolah B' },
  ]).select('id,nis'), 'siswa');
  const sid = Object.fromEntries(siswa.map((r) => [r.nis, r.id]));

  const kelas = must(await sb.from('kelas').insert([
    { tenant_id: tenantA, tahun_ajaran_id: ta.id, nama: 'X-A1', tingkat: 10 },
    { tenant_id: tenantA, tahun_ajaran_id: ta.id, nama: 'X-A2', tingkat: 10 },
  ]).select('id,nama'), 'kelas');
  const kid = Object.fromEntries(kelas.map((k) => [k.nama, k.id]));

  must(await sb.from('kelas_siswa').insert([
    { tenant_id: tenantA, kelas_id: kid['X-A1'], siswa_id: sid.E2E001 },
    { tenant_id: tenantA, kelas_id: kid['X-A2'], siswa_id: sid.E2E002 },
  ]), 'kelas_siswa');

  const mapel = must(await sb.from('mata_pelajaran').select('id,kode').eq('tenant_id', tenantA), 'mata_pelajaran');
  const mp = Object.fromEntries(mapel.map((m) => [m.kode, m.id]));

  must(await sb.from('jadwal').insert({
    tenant_id: tenantA, kelas_id: kid['X-A1'], mapel_id: mp.MTK, guru_id: guru.id,
    hari: 1, jam_mulai: '07:00', jam_selesai: '08:30', ruang: 'R1',
  }), 'jadwal');

  must(await sb.from('nilai').insert([
    { tenant_id: tenantA, siswa_id: sid.E2E001, mapel_id: mp.MTK, jenis: 'uh', skor: 90 },
    { tenant_id: tenantA, siswa_id: sid.E2E002, mapel_id: mp.BIN, jenis: 'uh', skor: 55 },
  ]), 'nilai');
  must(await sb.from('absensi').insert({
    tenant_id: tenantA, siswa_id: sid.E2E001, tanggal: new Date().toISOString().slice(0, 10), status: 'hadir',
  }), 'absensi');
  must(await sb.from('tagihan').insert({
    tenant_id: tenantA, siswa_id: sid.E2E001, jenis: 'SPP', periode: '2026-11', jumlah: 100000,
  }), 'tagihan');

  return { tenantA, tenantB, ids, ta: ta.id, kelas: kid, siswa: sid, mapel: mp };
}
