-- =====================================================================
-- 006: PPDB Online (Fitur B)
--   gelombang_pendaftaran, pendaftaran_siswa
--   + fungsi keamanan publik (daftar, cek status, konfirmasi bayar)
--   + otomatisasi penerimaan pendaftar menjadi siswa resmi
-- Jalankan SETELAH 001-005. Tidak mengubah tabel lama.
-- =====================================================================

-- 1. GELOMBANG PENDAFTARAN
create table if not exists public.gelombang_pendaftaran (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  tahun_ajaran_id uuid references public.tahun_ajaran(id) on delete set null,
  nama            text not null,
  tanggal_buka    date,
  tanggal_tutup   date,
  kuota           integer check (kuota is null or kuota > 0),
  biaya_daftar    numeric(14,2) not null default 0 check (biaya_daftar >= 0),
  status          text not null default 'draft' check (status in ('draft', 'dibuka', 'ditutup')),
  created_at      timestamptz not null default now(),
  unique (tenant_id, nama)
);

-- 2. PENDAFTARAN CALON SISWA
create table if not exists public.pendaftaran_siswa (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  gelombang_id      uuid not null references public.gelombang_pendaftaran(id) on delete restrict,
  jurusan_id        uuid references public.jurusan(id) on delete set null,
  nomor_registrasi  text not null unique,
  pin_akses         text not null,
  nama_lengkap      text not null,
  nik               text,
  jenis_kelamin     text check (jenis_kelamin in ('L', 'P')),
  tempat_lahir      text,
  tanggal_lahir     date,
  asal_sekolah      text,
  nama_wali         text not null,
  no_hp_wali        text not null,
  alamat            text,
  status            text not null default 'baru'
                    check (status in ('baru', 'menunggu_verifikasi', 'diterima', 'ditolak')),
  status_bayar      text not null default 'belum_bayar'
                    check (status_bayar in ('belum_bayar', 'menunggu_konfirmasi', 'lunas')),
  metode_bayar_id   uuid references public.metode_pembayaran(id) on delete set null,
  nominal_bayar     numeric(14,2) default 0,
  nama_pengirim     text,
  catatan_bayar     text,
  catatan_admin     text,
  siswa_id          uuid references public.siswa(id) on delete set null,
  diverifikasi_oleh uuid references auth.users(id) on delete set null,
  diverifikasi_pada timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_gelombang_tenant on public.gelombang_pendaftaran(tenant_id, status);
create index if not exists idx_pendaftaran_tenant on public.pendaftaran_siswa(tenant_id, status);

-- 3. RLS & HAK AKSES
alter table public.gelombang_pendaftaran enable row level security;
alter table public.pendaftaran_siswa enable row level security;

-- Publik hanya bisa melihat gelombang yang statusnya 'dibuka' dan masuk rentang tanggal
drop policy if exists gelombang_read_public on public.gelombang_pendaftaran;
create policy gelombang_read_public on public.gelombang_pendaftaran
  for select to anon
  using (
    status = 'dibuka'
    and (tanggal_buka is null or current_date >= tanggal_buka)
    and (tanggal_tutup is null or current_date <= tanggal_tutup)
  );

-- Staf sekolah bisa melihat semua gelombang di sekolahnya
drop policy if exists gelombang_read_staff on public.gelombang_pendaftaran;
create policy gelombang_read_staff on public.gelombang_pendaftaran
  for select to authenticated
  using (public.is_member(tenant_id, array['owner','kepala_sekolah','admin','tu','guru']::public.member_role[]));

-- Admin / TU / Kepala Sekolah / Owner kelola gelombang
drop policy if exists gelombang_write_admin on public.gelombang_pendaftaran;
create policy gelombang_write_admin on public.gelombang_pendaftaran
  for all to authenticated
  using (public.is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::public.member_role[]))
  with check (public.is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::public.member_role[]));

-- Pendaftaran siswa: TIDAK ADA policy SELECT untuk anon (mencegah kebocoran data pendaftar)
drop policy if exists pendaftaran_read_staff on public.pendaftaran_siswa;
create policy pendaftaran_read_staff on public.pendaftaran_siswa
  for select to authenticated
  using (public.is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::public.member_role[]));

drop policy if exists pendaftaran_update_admin on public.pendaftaran_siswa;
create policy pendaftaran_update_admin on public.pendaftaran_siswa
  for update to authenticated
  using (public.is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::public.member_role[]))
  with check (public.is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::public.member_role[]));

-- 4. FUNGSI PUBLIK: DAFTAR SISWA BARU (SECURITY DEFINER)
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
  p_alamat         text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_gelombang record;
  v_terisi    integer;
  v_no_reg    text;
  v_pin       text;
  v_id        uuid;
begin
  if coalesce(trim(p_nama_lengkap), '') = '' or coalesce(trim(p_nama_wali), '') = '' or coalesce(trim(p_no_hp_wali), '') = '' then
    raise exception 'Nama calon siswa, nama wali, dan nomor HP wali wajib diisi';
  end if;

  select id into v_tenant_id from public.tenants where slug = p_tenant_slug;
  if v_tenant_id is null then
    raise exception 'Sekolah tidak ditemukan';
  end if;

  select * into v_gelombang
  from public.gelombang_pendaftaran
  where id = p_gelombang_id and tenant_id = v_tenant_id;

  if v_gelombang is null or v_gelombang.status <> 'dibuka' then
    raise exception 'Gelombang pendaftaran tidak tersedia atau sudah ditutup';
  end if;

  if v_gelombang.tanggal_buka is not null and current_date < v_gelombang.tanggal_buka then
    raise exception 'Pendaftaran belum dibuka';
  end if;

  if v_gelombang.tanggal_tutup is not null and current_date > v_gelombang.tanggal_tutup then
    raise exception 'Masa pendaftaran sudah berakhir';
  end if;

  if v_gelombang.kuota is not null then
    select count(*) into v_terisi
    from public.pendaftaran_siswa
    where gelombang_id = p_gelombang_id and status = 'diterima';
    if v_terisi >= v_gelombang.kuota then
      raise exception 'Kuota gelombang pendaftaran sudah penuh';
    end if;
  end if;

  if p_jurusan_id is not null and not exists (
    select 1 from public.jurusan where id = p_jurusan_id and tenant_id = v_tenant_id and aktif = true
  ) then
    raise exception 'Jurusan tidak valid untuk sekolah ini';
  end if;

  v_no_reg := 'PPDB-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  v_pin    := lpad((floor(random() * 900000) + 100000)::text, 6, '0');

  insert into public.pendaftaran_siswa (
    tenant_id, gelombang_id, jurusan_id, nomor_registrasi, pin_akses,
    nama_lengkap, nik, jenis_kelamin, tempat_lahir, tanggal_lahir,
    asal_sekolah, nama_wali, no_hp_wali, alamat,
    status_bayar
  ) values (
    v_tenant_id, p_gelombang_id, p_jurusan_id, v_no_reg, v_pin,
    trim(p_nama_lengkap), nullif(trim(p_nik), ''), coalesce(nullif(trim(p_jenis_kelamin), ''), 'L'),
    nullif(trim(p_tempat_lahir), ''), p_tanggal_lahir,
    nullif(trim(p_asal_sekolah), ''), trim(p_nama_wali), trim(p_no_hp_wali),
    nullif(trim(p_alamat), ''),
    case when coalesce(v_gelombang.biaya_daftar, 0) = 0 then 'lunas' else 'belum_bayar' end
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'nomor_registrasi', v_no_reg,
    'pin_akses', v_pin,
    'biaya_daftar', v_gelombang.biaya_daftar
  );
end;
$$;

-- 5. FUNGSI PUBLIK: CEK STATUS PENDAFTARAN
create or replace function public.cek_status_ppdb(
  p_nomor_registrasi text,
  p_pin_akses        text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select
    p.id, p.tenant_id, p.nomor_registrasi, p.nama_lengkap, p.asal_sekolah,
    p.nama_wali, p.no_hp_wali, p.status, p.status_bayar, p.nominal_bayar,
    p.nama_pengirim, p.catatan_admin, p.created_at,
    g.nama as nama_gelombang, g.biaya_daftar,
    j.nama as nama_jurusan,
    t.nama as nama_sekolah, t.slug as slug_sekolah
  into v_row
  from public.pendaftaran_siswa p
  join public.gelombang_pendaftaran g on g.id = p.gelombang_id
  join public.tenants t on t.id = p.tenant_id
  left join public.jurusan j on j.id = p.jurusan_id
  where upper(trim(p.nomor_registrasi)) = upper(trim(p_nomor_registrasi))
    and trim(p.pin_akses) = trim(p_pin_akses);

  if v_row is null then
    raise exception 'Nomor registrasi atau PIN akses tidak cocok';
  end if;

  return to_jsonb(v_row);
end;
$$;

-- 6. FUNGSI PUBLIK: KONFIRMASI PEMBAYARAN PENDAFTARAN
create or replace function public.konfirmasi_bayar_ppdb(
  p_nomor_registrasi text,
  p_pin_akses        text,
  p_metode_bayar_id  uuid,
  p_nominal_bayar    numeric,
  p_nama_pengirim    text,
  p_catatan_bayar    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
begin
  select * into v_p
  from public.pendaftaran_siswa
  where upper(trim(nomor_registrasi)) = upper(trim(p_nomor_registrasi))
    and trim(pin_akses) = trim(p_pin_akses);

  if v_p is null then
    raise exception 'Data pendaftaran tidak ditemukan';
  end if;

  if coalesce(trim(p_nama_pengirim), '') = '' or coalesce(p_nominal_bayar, 0) <= 0 then
    raise exception 'Nama pengirim dan nominal pembayaran wajib diisi';
  end if;

  update public.pendaftaran_siswa
  set
    metode_bayar_id = p_metode_bayar_id,
    nominal_bayar   = p_nominal_bayar,
    nama_pengirim   = trim(p_nama_pengirim),
    catatan_bayar   = nullif(trim(p_catatan_bayar), ''),
    status_bayar    = 'menunggu_konfirmasi',
    status          = case when status = 'baru' then 'menunggu_verifikasi' else status end
  where id = v_p.id;

  return jsonb_build_object('ok', true);
end;
$$;

-- 7. FUNGSI ADMIN/TU: TERIMA PENDAFTAR MENJADI SISWA RESMI
create or replace function public.terima_pendaftar_ppdb(
  p_pendaftaran_id uuid,
  p_nis            text,
  p_catatan_admin  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p        record;
  v_siswa_id uuid;
begin
  select * into v_p from public.pendaftaran_siswa where id = p_pendaftaran_id;
  if v_p is null then
    raise exception 'Data pendaftaran tidak ditemukan';
  end if;

  if not public.is_member(v_p.tenant_id, array['owner','kepala_sekolah','admin','tu']::public.member_role[]) then
    raise exception 'Tidak memiliki hak akses verifikasi PPDB';
  end if;

  if v_p.status = 'diterima' and v_p.siswa_id is not null then
    return v_p.siswa_id;
  end if;

  insert into public.siswa (
    tenant_id, nis, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, status
  ) values (
    v_p.tenant_id,
    nullif(trim(p_nis), ''),
    v_p.nama_lengkap,
    coalesce(v_p.jenis_kelamin, 'L'),
    v_p.tempat_lahir,
    v_p.tanggal_lahir,
    v_p.alamat,
    'aktif'
  )
  returning id into v_siswa_id;

  update public.pendaftaran_siswa
  set
    status            = 'diterima',
    status_bayar      = 'lunas',
    siswa_id          = v_siswa_id,
    catatan_admin     = nullif(trim(p_catatan_admin), ''),
    diverifikasi_oleh = auth.uid(),
    diverifikasi_pada = now()
  where id = p_pendaftaran_id;

  insert into public.audit_log (tenant_id, actor_id, action, table_name, record_id, details)
  values (
    v_p.tenant_id, auth.uid(), 'TERIMA_PPDB', 'pendaftaran_siswa', p_pendaftaran_id,
    jsonb_build_object('nomor_registrasi', v_p.nomor_registrasi, 'siswa_id', v_siswa_id, 'nis', trim(p_nis))
  );

  return v_siswa_id;
end;
$$;

-- 8. FUNGSI ADMIN/TU: TOLAK PENDAFTAR
create or replace function public.tolak_pendaftar_ppdb(
  p_pendaftaran_id uuid,
  p_catatan_admin  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
begin
  select * into v_p from public.pendaftaran_siswa where id = p_pendaftaran_id;
  if v_p is null then
    raise exception 'Data pendaftaran tidak ditemukan';
  end if;

  if not public.is_member(v_p.tenant_id, array['owner','kepala_sekolah','admin','tu']::public.member_role[]) then
    raise exception 'Tidak memiliki hak akses verifikasi PPDB';
  end if;

  update public.pendaftaran_siswa
  set
    status            = 'ditolak',
    catatan_admin     = nullif(trim(p_catatan_admin), ''),
    diverifikasi_oleh = auth.uid(),
    diverifikasi_pada = now()
  where id = p_pendaftaran_id;
end;
$$;

grant execute on function public.daftar_ppdb_publik(text, uuid, uuid, text, text, text, text, date, text, text, text, text) to anon, authenticated;
grant execute on function public.cek_status_ppdb(text, text) to anon, authenticated;
grant execute on function public.konfirmasi_bayar_ppdb(text, text, uuid, numeric, text, text) to anon, authenticated;
grant execute on function public.terima_pendaftar_ppdb(uuid, text, text) to authenticated;
grant execute on function public.tolak_pendaftar_ppdb(uuid, text) to authenticated;
