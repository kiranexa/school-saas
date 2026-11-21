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

export async function seed(sb) {
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
    { tenant_id: tenantA, user_id: ids.guruA, role: 'guru' },
    { tenant_id: tenantA, user_id: ids.siswaA, role: 'siswa' },
  ]), 'tenant_members');
  must(await sb.from('guru').insert({ tenant_id: tenantA, user_id: ids.guruA, nip: 'G001', nama: 'Guru Uji A' }), 'guru');

  const siswa = must(await sb.from('siswa').insert([
    { tenant_id: tenantA, user_id: ids.siswaA, nis: 'E2E001', nama: 'Siswa Uji A' },
    { tenant_id: tenantA, nis: 'E2E002', nama: 'Siswa Lain A' },
    { tenant_id: tenantB, nis: 'B001', nama: 'Siswa Sekolah B' },
  ]).select('id,nis'), 'siswa');
  const sid = (nis) => siswa.find((r) => r.nis === nis).id;

  const mapel = must(await sb.from('mata_pelajaran').select('id,kode').eq('tenant_id', tenantA), 'mata_pelajaran');
  const mp = (kode) => mapel.find((m) => m.kode === kode).id;
  must(await sb.from('nilai').insert([
    { tenant_id: tenantA, siswa_id: sid('E2E001'), mapel_id: mp('MTK'), jenis: 'uh', skor: 90 },
    { tenant_id: tenantA, siswa_id: sid('E2E002'), mapel_id: mp('BIN'), jenis: 'uh', skor: 55 },
  ]), 'nilai');
  must(await sb.from('absensi').insert({
    tenant_id: tenantA, siswa_id: sid('E2E001'), tanggal: new Date().toISOString().slice(0, 10), status: 'hadir',
  }), 'absensi');

  return { tenantA, tenantB, ids };
}
