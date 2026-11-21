-- =====================================================================
-- School Management SaaS - 002_wali_audit_onboarding.sql
-- Isi: tabel wali, audit log, fungsi create_school()
-- Jalankan SETELAH 001_init.sql
-- =====================================================================

-- =====================================================================
-- 1. WALI (ORANG TUA)
-- =====================================================================
create table wali (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid references auth.users(id),
  nama       text not null,
  telepon    text, email text, pekerjaan text, alamat text,
  created_at timestamptz default now()
);

create table siswa_wali (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  siswa_id  uuid not null references siswa(id) on delete cascade,
  wali_id   uuid not null references wali(id) on delete cascade,
  hubungan  text default 'orang_tua',            -- ayah / ibu / wali
  unique (siswa_id, wali_id)
);

create index on wali (tenant_id);
create index on siswa_wali (tenant_id, wali_id);

-- helper: daftar siswa_id milik wali yang sedang login
create or replace function my_anak_ids(t uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select sw.siswa_id
  from siswa_wali sw
  join wali w on w.id = sw.wali_id
  where w.tenant_id = t and w.user_id = auth.uid();
$$;

alter table wali       enable row level security;
alter table siswa_wali enable row level security;

create policy wali_staff on wali for all
  using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]))
  with check (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));
create policy wali_self on wali for select using (user_id = auth.uid());

create policy siswa_wali_staff on siswa_wali for all
  using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]))
  with check (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));
create policy siswa_wali_self on siswa_wali for select
  using (siswa_id in (select my_anak_ids(tenant_id)));

-- wali melihat data anaknya
create policy wali_read_siswa   on siswa   for select using (id in (select my_anak_ids(tenant_id)));
create policy wali_read_absensi on absensi for select using (siswa_id in (select my_anak_ids(tenant_id)));
create policy wali_read_nilai   on nilai   for select using (siswa_id in (select my_anak_ids(tenant_id)));
create policy wali_read_tagihan on tagihan for select using (siswa_id in (select my_anak_ids(tenant_id)));
create policy wali_read_pengumuman on pengumuman for select
  using (published and is_member(tenant_id, array['wali']::member_role[]));

-- =====================================================================
-- 2. AUDIT LOG
-- =====================================================================
create table audit_log (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null,
  user_id    uuid,
  tabel      text not null,
  aksi       text not null,                      -- INSERT / UPDATE / DELETE
  row_id     uuid,
  data_lama  jsonb,
  data_baru  jsonb,
  created_at timestamptz default now()
);

create index on audit_log (tenant_id, created_at desc);
create index on audit_log (tenant_id, tabel, row_id);

alter table audit_log enable row level security;

-- hanya dibaca pimpinan; tidak ada policy insert/update/delete (hanya trigger yang menulis)
create policy audit_read on audit_log for select
  using (is_member(tenant_id, array['owner','kepala_sekolah','admin']::member_role[]));

create or replace function log_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  insert into audit_log (tenant_id, user_id, tabel, aksi, row_id, data_lama, data_baru)
  values (
    r.tenant_id, auth.uid(), tg_table_name, tg_op, r.id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return r;
end $$;

do $$
declare t text;
begin
  foreach t in array array['siswa','guru','nilai','absensi','tagihan','pembayaran','tenant_members'] loop
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on %1$s
       for each row execute function log_audit()', t);
  end loop;
end $$;

-- =====================================================================
-- 3. ONBOARDING SEKOLAH BARU
-- =====================================================================
-- Dipanggil oleh PLATFORM OWNER (SQL Editor / Edge Function / service_role),
-- BUKAN oleh user biasa dari frontend.
create or replace function create_school(
  p_slug          text,
  p_nama          text,
  p_base_domain   text,          -- 'sekolahku.id'  -> school1.sekolahku.id
  p_owner_user_id uuid,          -- id dari auth.users (admin pertama)
  p_jenjang       text default null,
  p_npsn          text default null,
  p_custom_domain text default null   -- 'school1.sch.id' (opsional)
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_ta     uuid;
  v_year   int := extract(year from now());
begin
  if p_slug !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' then
    raise exception 'slug tidak valid: gunakan huruf kecil, angka, dan strip (3-40 karakter)';
  end if;

  insert into tenants (slug, nama, jenjang, npsn)
  values (p_slug, p_nama, p_jenjang, p_npsn)
  returning id into v_tenant;

  insert into tenant_domains (tenant_id, domain, is_primary, verified)
  values (v_tenant, p_slug || '.' || p_base_domain, p_custom_domain is null, true);

  if p_custom_domain is not null then
    insert into tenant_domains (tenant_id, domain, is_primary, verified)
    values (v_tenant, lower(p_custom_domain), true, false);   -- verified=true setelah DNS dicek
  end if;

  insert into tenant_members (tenant_id, user_id, role)
  values (v_tenant, p_owner_user_id, 'owner');

  insert into tahun_ajaran (tenant_id, nama, semester, aktif)
  values (v_tenant, v_year || '/' || (v_year + 1), 1, true)
  returning id into v_ta;

  insert into halaman (tenant_id, slug, judul, konten, published) values
    (v_tenant, 'beranda', 'Selamat Datang di ' || p_nama, '{}', true),
    (v_tenant, 'profil',  'Profil Sekolah', '{}', true);

  insert into mata_pelajaran (tenant_id, kode, nama) values
    (v_tenant, 'MTK', 'Matematika'),
    (v_tenant, 'BIN', 'Bahasa Indonesia'),
    (v_tenant, 'ING', 'Bahasa Inggris'),
    (v_tenant, 'IPA', 'Ilmu Pengetahuan Alam');

  return v_tenant;
end $$;

-- kunci: user biasa tidak boleh memanggil
revoke all on function create_school(text,text,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function create_school(text,text,text,uuid,text,text,text) to service_role;

-- =====================================================================
-- 4. CONTOH PEMAKAIAN (jalankan manual, jangan commit user id asli)
-- =====================================================================
-- select create_school(
--   'school1', 'SMA Negeri 1 Contoh', 'sekolahku.id',
--   '00000000-0000-0000-0000-000000000000',   -- ganti dgn id user dari Authentication > Users
--   'SMA', '12345678'
-- );
