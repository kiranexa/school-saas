import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SLUG_A, SLUG_B, USERS, PASSWORD } from '../config.js';
import { fixtures } from '../helpers.js';
import { adminClient, pastikanMigrasiPpdb } from '../seed.js';

function anonClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function loginClient(email) {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}

test('keamanan PPDB: anon tidak bisa baca tabel pendaftaran_siswa langsung & isolasi lintas sekolah terjaga', async () => {
  const adm = adminClient();
  await pastikanMigrasiPpdb(adm);
  const { tenantA } = fixtures();
  const anon = anonClient();

  // 1. Anon tidak boleh SELECT tabel pendaftaran_siswa secara langsung
  const { data: bocor } = await anon.from('pendaftaran_siswa').select('*');
  expect(bocor ?? []).toHaveLength(0);

  // 2. Buat gelombang uji & 1 pendaftar di Sekolah A
  const { data: gel, error: errGel } = await adm
    .from('gelombang_pendaftaran')
    .insert({ tenant_id: tenantA, nama: 'Gelombang Keamanan E2E', biaya_daftar: 50000, status: 'dibuka' })
    .select()
    .single();
  if (errGel) throw new Error(errGel.message);

  try {
    const { data: reg, error: errReg } = await anon.rpc('daftar_ppdb_publik', {
      p_tenant_slug: SLUG_A,
      p_gelombang_id: gel.id,
      p_jurusan_id: null,
      p_nama_lengkap: 'Siswa Rahasia A',
      p_nik: null,
      p_jenis_kelamin: 'P',
      p_tempat_lahir: null,
      p_tanggal_lahir: null,
      p_asal_sekolah: null,
      p_nama_wali: 'Wali A',
      p_no_hp_wali: '0811111111',
      p_alamat: null,
    });
    expect(errReg).toBeNull();

    // 3. Cek status dengan PIN salah harus ditolak
    const { error: errPin } = await anon.rpc('cek_status_ppdb', {
      p_nomor_registrasi: reg.nomor_registrasi,
      p_pin_akses: '000000',
    });
    expect(errPin).not.toBeNull();

    // 4. Admin Sekolah B tidak boleh bisa melihat atau menerima pendaftar Sekolah A
    const adminB = await loginClient(USERS.adminB);
    const { data: lihatB } = await adminB.from('pendaftaran_siswa').select('*').eq('id', reg.id);
    expect(lihatB ?? []).toHaveLength(0);

    const { error: errTerimaB } = await adminB.rpc('terima_pendaftar_ppdb', {
      p_pendaftaran_id: reg.id,
      p_nis: 'HACK-01',
    });
    expect(errTerimaB).not.toBeNull();
  } finally {
    await adm.from('pendaftaran_siswa').delete().eq('gelombang_id', gel.id);
    await adm.from('gelombang_pendaftaran').delete().eq('id', gel.id);
  }
});
