-- =====================================================================
-- 007: perbaikan PPDB online (menggantikan perilaku 20261127000000)
--   - terima_pendaftar_ppdb: memakai kolom siswa yang benar (jk, tgl_lahir), audit yang benar,
--     baris dikunci, wajib sudah bayar atau dikonfirmasi admin
--   - biaya berasal dari master komponen_biaya (disetujui kepala sekolah) dan DISALIN ke pendaftar;
--     gelombang_pendaftaran.biaya_daftar tidak dipakai lagi dan dibekukan
--   - konfirmasi bayar hanya saat pendaftaran masih terbuka; metode dicek milik sekolahnya
--   - pembatas: pendaftaran per sekolah per jam, per nomor HP per hari, kunci PIN setelah 5 salah
--   - nomor registrasi dan PIN dibuat dari gen_random_uuid() (acak kuat)
--   - kolom email wali (untuk email otomatis, menyusul)
--   - tabel pendaftar tidak bisa ditulis langsung; PIN tidak bisa dibaca staf
-- Jalankan SETELAH 001-006. Fungsi lama daftar_ppdb_publik (12 argumen) dan
-- terima_pendaftar_ppdb (3 argumen) dihapus: terapkan migrasi dan frontend bersamaan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. KOLOM BARU
-- ---------------------------------------------------------------------
alter table public.pendaftaran_siswa
  add column if not exists email_wali text
    check (email_wali is null or (char_length(email_wali) <= 200 and email_wali ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column if not exists rincian_biaya jsonb not null default '[]'::jsonb,
  add column if not exists total_biaya numeric(14,2) not null default 0 check (total_biaya >= 0),
  add column if not exists pin_gagal integer not null default 0,
  add column if not exists pin_terkunci_sampai timestamptz;

-- pendaftar lama: bawa biaya dari gelombang sebagai rincian satu baris
update public.pendaftaran_siswa p
   set total_biaya = g.biaya_daftar,
       rincian_biaya = jsonb_build_array(jsonb_build_object('nama', 'Biaya pendaftaran', 'nominal', g.biaya_daftar, 'wajib', true))
  from public.gelombang_pendaftaran g
 where g.id = p.gelombang_id and p.total_biaya = 0 and g.biaya_daftar > 0;

-- ---------------------------------------------------------------------
-- 2. BIAYA GELOMBANG DIBEKUKAN (biaya resmi = master komponen_biaya, lewat persetujuan)
-- ---------------------------------------------------------------------
create or replace function public.gelombang_biaya_beku()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.biaya_daftar := 0; else new.biaya_daftar := old.biaya_daftar; end if;
  return new;
end $$;

drop trigger if exists trg_gelombang_biaya_beku on public.gelombang_pendaftaran;
create trigger trg_gelombang_biaya_beku before insert or update on public.gelombang_pendaftaran
  for each row execute function public.gelombang_biaya_beku();

-- ---------------------------------------------------------------------
-- 3. HAK AKSES TABEL
-- ---------------------------------------------------------------------
-- tidak ada tulis langsung ke pendaftar: semua lewat fungsi
drop policy if exists pendaftaran_update_admin on public.pendaftaran_siswa;
revoke insert, update, delete, truncate on public.pendaftaran_siswa from anon, authenticated;
revoke insert, update, delete, truncate on public.gelombang_pendaftaran from anon;

-- staf boleh baca pendaftar (lewat policy RLS) tetapi TIDAK kolom PIN dan penghitung percobaan
revoke select on public.pendaftaran_siswa from anon, authenticated;
grant select (
  id, tenant_id, gelombang_id, jurusan_id, nomor_registrasi, nama_lengkap, nik, jenis_kelamin,
  tempat_lahir, tanggal_lahir, asal_sekolah, nama_wali, no_hp_wali, email_wali, alamat, status,
  status_bayar, metode_bayar_id, nominal_bayar, nama_pengirim, catatan_bayar, catatan_admin,
  siswa_id, diverifikasi_oleh, diverifikasi_pada, rincian_biaya, total_biaya, created_at
) on public.pendaftaran_siswa to authenticated;
-- CATATAN: kolom baru di pendaftaran_siswa tidak otomatis bisa dibaca staf; tambahkan grant select (kolom) di migrasi yang menambahnya.

-- tanggal buka/tutup memakai zona waktu WIB, bukan UTC
drop policy if exists gelombang_read_public on public.gelombang_pendaftaran;
create policy gelombang_read_public on public.gelombang_pendaftaran
  for select to anon
  using (
    status = 'dibuka'
    and (tanggal_buka is null or (now() at time zone 'Asia/Jakarta')::date >= tanggal_buka)
    and (tanggal_tutup is null or (now() at time zone 'Asia/Jakarta')::date <= tanggal_tutup)
  );

-- ---------------------------------------------------------------------
-- 4. PEMERIKSA KREDENSIAL (nomor registrasi + PIN) DENGAN KUNCI PERCOBAAN
--    Tidak memakai RAISE untuk salah PIN: RAISE membatalkan transaksi dan
--    penghitung percobaan ikut hilang.
-- ---------------------------------------------------------------------
create or replace function public.ppdb_cek_kredensial(p_nomor text, p_pin text, out o_id uuid, out o_pesan text)
language plpgsql security definer set search_path = public as $$
declare r public.pendaftaran_siswa;
begin
  select * into r from public.pendaftaran_siswa
   where nomor_registrasi = upper(btrim(coalesce(p_nomor, ''))) for update;
  if not found then
    o_pesan := 'Nomor registrasi atau PIN tidak cocok';
    return;
  end if;
  if r.pin_terkunci_sampai is not null and r.pin_terkunci_sampai > now() then
    o_pesan := 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit';
    return;
  end if;
  if r.pin_akses is distinct from btrim(coalesce(p_pin, '')) then
    if r.pin_gagal + 1 >= 5 then
      update public.pendaftaran_siswa set pin_gagal = 0, pin_terkunci_sampai = now() + interval '30 minutes' where id = r.id;
    else
      update public.pendaftaran_siswa set pin_gagal = pin_gagal + 1 where id = r.id;
    end if;
    o_pesan := 'Nomor registrasi atau PIN tidak cocok';
    return;
  end if;
  if r.pin_gagal > 0 or r.pin_terkunci_sampai is not null then
    update public.pendaftaran_siswa set pin_gagal = 0, pin_terkunci_sampai = null where id = r.id;
  end if;
  o_id := r.id;
end $$;

-- ---------------------------------------------------------------------
-- 5. DAFTAR (PUBLIK)
-- ---------------------------------------------------------------------
drop function if exists public.daftar_ppdb_publik(text, uuid, uuid, text, text, text, text, date, text, text, text, text);

create or replace function public.daftar_ppdb_publik(
  p_tenant_slug    text,
  p_gelombang_id   uuid,
  p_jurusan_id     uuid,
  p_nama_lengkap   text,
  p_nik            text,
  p_jenis_kelamin  text,
  p_tempat_lahir   text,
  p_tanggal_lahir  date,
  p_asal_sekolah   text,
  p_nama_wali      text,
  p_no_hp_wali     text,
  p_email_wali     text,
  p_alamat         text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid;
  g         public.gelombang_pendaftaran;
  v_hari    date := (now() at time zone 'Asia/Jakarta')::date;
  v_nama    text := btrim(coalesce(p_nama_lengkap, ''));
  v_wali    text := btrim(coalesce(p_nama_wali, ''));
  v_hp      text := regexp_replace(coalesce(p_no_hp_wali, ''), '[\s-]', '', 'g');
  v_email   text := lower(nullif(btrim(coalesce(p_email_wali, '')), ''));
  v_nik     text := nullif(btrim(coalesce(p_nik, '')), '');
  v_n       integer;
  v_ada_jur boolean;
  v_rincian jsonb;
  v_total   numeric;
  v_no_reg  text;
  v_pin     text;
  v_id      uuid;
begin
  if v_nama = '' then raise exception 'Nama calon siswa wajib diisi'; end if;
  if v_wali = '' then raise exception 'Nama orang tua/wali wajib diisi'; end if;
  if char_length(v_nama) > 150 or char_length(v_wali) > 150 then raise exception 'Nama maksimal 150 karakter'; end if;
  if v_hp !~ '^\+?[0-9]{8,15}$' then raise exception 'Nomor HP wali tidak valid (8 sampai 15 angka)'; end if;
  if v_email is null then raise exception 'Email orang tua/wali wajib diisi'; end if;
  if char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Format email tidak valid'; end if;
  if v_nik is not null and v_nik !~ '^[0-9]{16}$' then raise exception 'NIK harus 16 angka'; end if;
  if p_jenis_kelamin is null or p_jenis_kelamin not in ('L', 'P') then raise exception 'Jenis kelamin wajib dipilih'; end if;
  if p_tanggal_lahir is null or p_tanggal_lahir >= v_hari or p_tanggal_lahir < date '1980-01-01' then
    raise exception 'Tanggal lahir tidak valid';
  end if;
  if char_length(coalesce(p_tempat_lahir, '')) > 100 or char_length(coalesce(p_asal_sekolah, '')) > 150
     or char_length(coalesce(p_alamat, '')) > 500 then
    raise exception 'Isian terlalu panjang';
  end if;

  select id into v_tenant from public.tenants where slug = p_tenant_slug;
  if v_tenant is null then raise exception 'Sekolah tidak ditemukan'; end if;

  -- satu pendaftaran per sekolah diproses bergantian: kuota dan pembatas jadi akurat
  perform pg_advisory_xact_lock(hashtext('ppdb:' || v_tenant::text));

  select * into g from public.gelombang_pendaftaran where id = p_gelombang_id and tenant_id = v_tenant;
  if not found or g.status <> 'dibuka' then raise exception 'Gelombang pendaftaran tidak tersedia atau sudah ditutup'; end if;
  if g.tanggal_buka is not null and v_hari < g.tanggal_buka then raise exception 'Pendaftaran belum dibuka'; end if;
  if g.tanggal_tutup is not null and v_hari > g.tanggal_tutup then raise exception 'Masa pendaftaran sudah berakhir'; end if;
  if g.kuota is not null then
    select count(*) into v_n from public.pendaftaran_siswa where gelombang_id = g.id and status = 'diterima';
    if v_n >= g.kuota then raise exception 'Kuota gelombang pendaftaran sudah penuh'; end if;
  end if;

  select exists (select 1 from public.jurusan where tenant_id = v_tenant and aktif) into v_ada_jur;
  if v_ada_jur and p_jurusan_id is null then raise exception 'Pilihan jurusan wajib diisi'; end if;
  if p_jurusan_id is not null and not exists (
    select 1 from public.jurusan where id = p_jurusan_id and tenant_id = v_tenant and aktif
  ) then raise exception 'Jurusan tidak valid untuk sekolah ini'; end if;

  -- pembatas penyalahgunaan
  select count(*) into v_n from public.pendaftaran_siswa
   where tenant_id = v_tenant and created_at > now() - interval '1 hour';
  if v_n >= 200 then raise exception 'Pendaftaran sedang sangat ramai. Coba lagi beberapa saat lagi'; end if;
  select count(*) into v_n from public.pendaftaran_siswa
   where tenant_id = v_tenant and no_hp_wali = v_hp and created_at > now() - interval '24 hours';
  if v_n >= 5 then raise exception 'Nomor HP ini sudah dipakai untuk 5 pendaftaran dalam 24 jam terakhir'; end if;
  if exists (
    select 1 from public.pendaftaran_siswa
     where tenant_id = v_tenant and status <> 'ditolak' and tanggal_lahir = p_tanggal_lahir and lower(nama_lengkap) = lower(v_nama)
  ) then raise exception 'Calon siswa dengan nama dan tanggal lahir yang sama sudah terdaftar. Gunakan Cek Status dengan nomor registrasi Anda'; end if;

  -- salin rincian biaya dari master yang berlaku sekarang
  select coalesce(jsonb_agg(jsonb_build_object('nama', nama, 'nominal', nominal, 'wajib', wajib) order by urutan, nama), '[]'::jsonb),
         coalesce(sum(nominal) filter (where wajib), 0)
    into v_rincian, v_total
    from public.komponen_biaya where tenant_id = v_tenant and aktif;

  v_no_reg := 'PPDB-' || to_char(now() at time zone 'Asia/Jakarta', 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_pin    := lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');

  insert into public.pendaftaran_siswa (
    tenant_id, gelombang_id, jurusan_id, nomor_registrasi, pin_akses,
    nama_lengkap, nik, jenis_kelamin, tempat_lahir, tanggal_lahir, asal_sekolah,
    nama_wali, no_hp_wali, email_wali, alamat, rincian_biaya, total_biaya, status_bayar
  ) values (
    v_tenant, g.id, p_jurusan_id, v_no_reg, v_pin,
    v_nama, v_nik, p_jenis_kelamin, nullif(btrim(coalesce(p_tempat_lahir, '')), ''), p_tanggal_lahir,
    nullif(btrim(coalesce(p_asal_sekolah, '')), ''),
    v_wali, v_hp, v_email, nullif(btrim(coalesce(p_alamat, '')), ''), v_rincian, v_total,
    case when v_total = 0 then 'lunas' else 'belum_bayar' end
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'nomor_registrasi', v_no_reg, 'pin_akses', v_pin,
                            'total_biaya', v_total, 'rincian_biaya', v_rincian);
end $$;

-- ---------------------------------------------------------------------
-- 6. CEK STATUS (PUBLIK)
-- ---------------------------------------------------------------------
create or replace function public.cek_status_ppdb(p_nomor_registrasi text, p_pin_akses text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k record; v jsonb;
begin
  select * into k from public.ppdb_cek_kredensial(p_nomor_registrasi, p_pin_akses);
  if k.o_id is null then return jsonb_build_object('ok', false, 'pesan', k.o_pesan); end if;

  select jsonb_build_object(
           'ok', true,
           'nomor_registrasi', p.nomor_registrasi, 'nama_lengkap', p.nama_lengkap, 'asal_sekolah', p.asal_sekolah,
           'nama_wali', p.nama_wali, 'status', p.status, 'status_bayar', p.status_bayar,
           'nominal_bayar', p.nominal_bayar, 'nama_pengirim', p.nama_pengirim, 'catatan_admin', p.catatan_admin,
           'created_at', p.created_at, 'nama_gelombang', g.nama, 'nama_jurusan', j.nama,
           'nama_sekolah', t.nama, 'slug_sekolah', t.slug,
           'rincian_biaya', p.rincian_biaya, 'total_biaya', p.total_biaya)
    into v
    from public.pendaftaran_siswa p
    join public.gelombang_pendaftaran g on g.id = p.gelombang_id
    join public.tenants t on t.id = p.tenant_id
    left join public.jurusan j on j.id = p.jurusan_id
   where p.id = k.o_id;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 7. KONFIRMASI BAYAR (PUBLIK)
-- ---------------------------------------------------------------------
create or replace function public.konfirmasi_bayar_ppdb(
  p_nomor_registrasi text, p_pin_akses text, p_metode_bayar_id uuid,
  p_nominal_bayar numeric, p_nama_pengirim text, p_catatan_bayar text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k record; r public.pendaftaran_siswa; v_pengirim text := btrim(coalesce(p_nama_pengirim, ''));
begin
  select * into k from public.ppdb_cek_kredensial(p_nomor_registrasi, p_pin_akses);
  if k.o_id is null then return jsonb_build_object('ok', false, 'pesan', k.o_pesan); end if;

  select * into r from public.pendaftaran_siswa where id = k.o_id;
  if r.status in ('diterima', 'ditolak') or r.status_bayar = 'lunas' then
    raise exception 'Pendaftaran ini sudah diproses. Konfirmasi pembayaran tidak dapat diubah';
  end if;
  if r.total_biaya <= 0 then raise exception 'Tidak ada biaya yang perlu dibayar'; end if;
  if v_pengirim = '' or char_length(v_pengirim) > 150 then raise exception 'Nama pengirim wajib diisi (maksimal 150 karakter)'; end if;
  if p_nominal_bayar is null or p_nominal_bayar <= 0 or p_nominal_bayar >= 1000000000000 then
    raise exception 'Nominal pembayaran tidak valid';
  end if;
  if char_length(coalesce(p_catatan_bayar, '')) > 500 then raise exception 'Catatan maksimal 500 karakter'; end if;
  if p_metode_bayar_id is null or not exists (
    select 1 from public.metode_pembayaran where id = p_metode_bayar_id and tenant_id = r.tenant_id and aktif
  ) then raise exception 'Tujuan pembayaran tidak valid'; end if;

  update public.pendaftaran_siswa
     set metode_bayar_id = p_metode_bayar_id, nominal_bayar = p_nominal_bayar, nama_pengirim = v_pengirim,
         catatan_bayar = nullif(btrim(coalesce(p_catatan_bayar, '')), ''),
         status_bayar = 'menunggu_konfirmasi',
         status = case when status = 'baru' then 'menunggu_verifikasi' else status end
   where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 8. TERIMA / TOLAK (ADMIN, TU, KEPALA SEKOLAH, OWNER)
-- ---------------------------------------------------------------------
drop function if exists public.terima_pendaftar_ppdb(uuid, text, text);

create or replace function public.terima_pendaftar_ppdb(
  p_pendaftaran_id uuid, p_nis text default null, p_catatan_admin text default null,
  p_konfirmasi_lunas boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; r public.pendaftaran_siswa; v_siswa uuid;
  v_nis text := nullif(btrim(coalesce(p_nis, '')), '');
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  select tenant_id into v_tenant from public.pendaftaran_siswa where id = p_pendaftaran_id;
  if v_tenant is null or not public.is_member(v_tenant, array['owner','kepala_sekolah','admin','tu']::public.member_role[]) then
    raise exception 'Pendaftaran tidak ditemukan atau Anda tidak berhak memverifikasinya';
  end if;

  select * into r from public.pendaftaran_siswa where id = p_pendaftaran_id for update;
  if r.status = 'diterima' and r.siswa_id is not null then return r.siswa_id; end if;

  if r.total_biaya > 0 and r.status_bayar = 'belum_bayar' and not coalesce(p_konfirmasi_lunas, false) then
    raise exception 'Pembayaran belum dikonfirmasi pendaftar. Terima hanya jika pembayaran sudah Anda terima langsung';
  end if;

  begin
    insert into public.siswa (tenant_id, nis, nama, jk, tempat_lahir, tgl_lahir, alamat, nama_wali, telepon_wali, status)
    values (r.tenant_id, v_nis, r.nama_lengkap, r.jenis_kelamin::public.jenis_kelamin, r.tempat_lahir,
            r.tanggal_lahir, r.alamat, r.nama_wali, r.no_hp_wali, 'aktif')
    returning id into v_siswa;
  exception when unique_violation then
    raise exception 'NIS % sudah dipakai siswa lain', v_nis;
  end;

  update public.pendaftaran_siswa
     set status = 'diterima', status_bayar = 'lunas', siswa_id = v_siswa,
         catatan_admin = nullif(btrim(coalesce(p_catatan_admin, '')), ''),
         diverifikasi_oleh = auth.uid(), diverifikasi_pada = now()
   where id = r.id;

  insert into public.audit_log (tenant_id, user_id, tabel, aksi, row_id, data_baru)
  values (r.tenant_id, auth.uid(), 'pendaftaran_siswa', 'TERIMA', r.id,
          jsonb_build_object('nomor_registrasi', r.nomor_registrasi, 'siswa_id', v_siswa, 'nis', v_nis,
                             'total_biaya', r.total_biaya, 'nominal_bayar', r.nominal_bayar,
                             'status_bayar_sebelum', r.status_bayar, 'lunas_dikonfirmasi_admin', coalesce(p_konfirmasi_lunas, false)));
  return v_siswa;
end $$;

create or replace function public.tolak_pendaftar_ppdb(p_pendaftaran_id uuid, p_catatan_admin text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; r public.pendaftaran_siswa;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  select tenant_id into v_tenant from public.pendaftaran_siswa where id = p_pendaftaran_id;
  if v_tenant is null or not public.is_member(v_tenant, array['owner','kepala_sekolah','admin','tu']::public.member_role[]) then
    raise exception 'Pendaftaran tidak ditemukan atau Anda tidak berhak memverifikasinya';
  end if;
  select * into r from public.pendaftaran_siswa where id = p_pendaftaran_id for update;
  if r.status = 'diterima' then raise exception 'Pendaftar yang sudah diterima tidak bisa ditolak'; end if;

  update public.pendaftaran_siswa
     set status = 'ditolak', catatan_admin = nullif(btrim(coalesce(p_catatan_admin, '')), ''),
         diverifikasi_oleh = auth.uid(), diverifikasi_pada = now()
   where id = r.id;
  insert into public.audit_log (tenant_id, user_id, tabel, aksi, row_id, data_baru)
  values (r.tenant_id, auth.uid(), 'pendaftaran_siswa', 'TOLAK', r.id,
          jsonb_build_object('nomor_registrasi', r.nomor_registrasi, 'catatan', nullif(btrim(coalesce(p_catatan_admin, '')), '')));
end $$;

-- ---------------------------------------------------------------------
-- 9. HAK EKSEKUSI FUNGSI (cabut dari PUBLIC dulu, lalu beri yang perlu)
-- ---------------------------------------------------------------------
revoke all on function public.ppdb_cek_kredensial(text, text) from public, anon, authenticated;
revoke all on function public.daftar_ppdb_publik(text, uuid, uuid, text, text, text, text, date, text, text, text, text, text) from public;
revoke all on function public.cek_status_ppdb(text, text) from public;
revoke all on function public.konfirmasi_bayar_ppdb(text, text, uuid, numeric, text, text) from public;
revoke all on function public.terima_pendaftar_ppdb(uuid, text, text, boolean) from public, anon;
revoke all on function public.tolak_pendaftar_ppdb(uuid, text) from public, anon;

grant execute on function public.daftar_ppdb_publik(text, uuid, uuid, text, text, text, text, date, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.cek_status_ppdb(text, text) to anon, authenticated, service_role;
grant execute on function public.konfirmasi_bayar_ppdb(text, text, uuid, numeric, text, text) to anon, authenticated, service_role;
grant execute on function public.terima_pendaftar_ppdb(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.tolak_pendaftar_ppdb(uuid, text) to authenticated, service_role;
