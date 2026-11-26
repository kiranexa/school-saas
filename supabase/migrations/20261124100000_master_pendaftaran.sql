-- =====================================================================
-- 005: master pendaftaran (fitur A)
--   jurusan, komponen_biaya, metode_pembayaran
--   + pengajuan_perubahan: biaya dan rekening hanya berubah setelah
--     diajukan admin/TU dan disetujui kepala sekolah (dijaga di database)
-- Jalankan SETELAH 001-004. Tidak mengubah tabel lama.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. JURUSAN (diubah langsung oleh staf; tanpa persetujuan)
-- ---------------------------------------------------------------------
create table jurusan (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  kode       text,
  nama       text not null,
  aktif      boolean not null default true,
  created_at timestamptz default now(),
  unique (tenant_id, nama)
);
create index on jurusan (tenant_id);
alter table jurusan enable row level security;

create policy jurusan_staff on jurusan for all
  using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]))
  with check (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));
-- form pendaftaran publik perlu daftar jurusan aktif
create policy jurusan_public on jurusan for select using (aktif);

-- ---------------------------------------------------------------------
-- 2. KOMPONEN BIAYA dan METODE PEMBAYARAN
--    Tidak ada policy/izin tulis: satu-satunya jalan menulis adalah
--    setujui_pengajuan() di bawah.
-- ---------------------------------------------------------------------
create table komponen_biaya (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  nama       text not null check (char_length(nama) between 1 and 150),
  nominal    numeric(14,2) not null check (nominal >= 0),
  wajib      boolean not null default true,
  aktif      boolean not null default true,
  urutan     integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on komponen_biaya (tenant_id);

create table metode_pembayaran (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  jenis      text not null check (jenis in ('transfer','virtual_account','ewallet','tunai')),
  penyedia   text not null check (char_length(penyedia) between 1 and 100),   -- BCA, GoPay, Kasir TU
  nomor      text check (char_length(nomor) <= 64),
  atas_nama  text check (char_length(atas_nama) <= 150),
  instruksi  text check (char_length(instruksi) <= 1000),
  aktif      boolean not null default true,
  urutan     integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on metode_pembayaran (tenant_id);

alter table komponen_biaya     enable row level security;
alter table metode_pembayaran  enable row level security;

create policy komponen_biaya_staff on komponen_biaya for select
  using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));
create policy komponen_biaya_public on komponen_biaya for select using (aktif);

create policy metode_pembayaran_staff on metode_pembayaran for select
  using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));
create policy metode_pembayaran_public on metode_pembayaran for select using (aktif);

-- lapis kedua: cabut izin tulis di tingkat tabel (service_role dan fungsi di bawah tetap bisa)
revoke insert, update, delete, truncate on komponen_biaya    from anon, authenticated;
revoke insert, update, delete, truncate on metode_pembayaran from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. PENGAJUAN PERUBAHAN
-- ---------------------------------------------------------------------
create table pengajuan_perubahan (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  entitas          text not null check (entitas in ('komponen_biaya','metode_pembayaran')),
  entitas_id       uuid,                          -- null untuk 'buat' sampai disetujui
  aksi             text not null check (aksi in ('buat','ubah')),
  data             jsonb not null,               -- nilai baru (sudah divalidasi)
  data_lama        jsonb,                        -- nilai yang berlaku saat diajukan (untuk 'ubah')
  status           text not null default 'menunggu'
                   check (status in ('menunggu','disetujui','ditolak','dibatalkan')),
  catatan          text check (char_length(catatan) <= 500),
  diajukan_oleh    uuid references auth.users(id) on delete set null,
  diajukan_email   text,
  diajukan_at      timestamptz not null default now(),
  diputuskan_oleh  uuid references auth.users(id) on delete set null,
  diputuskan_email text,
  diputuskan_at    timestamptz,
  catatan_keputusan text check (char_length(catatan_keputusan) <= 500),
  check (aksi = 'buat' or entitas_id is not null),
  check (status = 'menunggu' or diputuskan_at is not null)
);
create index on pengajuan_perubahan (tenant_id, status, diajukan_at desc);
-- satu data hanya boleh punya satu pengajuan menunggu (data lama tetap akurat)
create unique index pengajuan_menunggu_uq on pengajuan_perubahan (entitas, entitas_id)
  where status = 'menunggu' and entitas_id is not null;

alter table pengajuan_perubahan enable row level security;
create policy pengajuan_staff on pengajuan_perubahan for select
  using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));
revoke insert, update, delete, truncate on pengajuan_perubahan from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. FUNGSI BANTU (tidak untuk dipanggil dari klien)
-- ---------------------------------------------------------------------
create or replace function pj_bool(j jsonb, k text, d boolean)
returns boolean language plpgsql immutable as $$
begin
  if j->k is null or jsonb_typeof(j->k) = 'null' then return d; end if;
  return (j->>k)::boolean;
exception when others then
  raise exception '% harus true atau false', k;
end $$;

create or replace function pj_int(j jsonb, k text, d integer)
returns integer language plpgsql immutable as $$
declare v integer;
begin
  if j->k is null or jsonb_typeof(j->k) = 'null' or btrim(j->>k) = '' then return d; end if;
  v := (j->>k)::integer;
  if v < 0 or v > 100000 then raise exception 'x'; end if;
  return v;
exception when others then
  raise exception '% harus berupa bilangan bulat 0 sampai 100000', k;
end $$;

-- validasi + bentuk baku. Hasil selalu berisi tepat kunci yang boleh diubah.
create or replace function pj_normalisasi(p_entitas text, p_data jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_nama text; v_nominal numeric;
  v_jenis text; v_penyedia text; v_nomor text; v_atas text; v_instr text;
begin
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Data tidak valid'; end if;

  if p_entitas = 'komponen_biaya' then
    v_nama := nullif(btrim(p_data->>'nama'), '');
    if v_nama is null then raise exception 'Nama komponen wajib diisi'; end if;
    if char_length(v_nama) > 150 then raise exception 'Nama komponen maksimal 150 karakter'; end if;
    begin
      v_nominal := round((p_data->>'nominal')::numeric, 2);
    exception when others then
      v_nominal := null;
    end;
    if v_nominal is null or v_nominal < 0 or v_nominal >= 1000000000000 then
      raise exception 'Nominal harus berupa angka 0 atau lebih';
    end if;
    return jsonb_build_object(
      'nama', v_nama, 'nominal', v_nominal,
      'wajib', pj_bool(p_data, 'wajib', true), 'aktif', pj_bool(p_data, 'aktif', true),
      'urutan', pj_int(p_data, 'urutan', 0));

  elsif p_entitas = 'metode_pembayaran' then
    v_jenis    := btrim(p_data->>'jenis');
    v_penyedia := nullif(btrim(p_data->>'penyedia'), '');
    v_nomor    := nullif(btrim(p_data->>'nomor'), '');
    v_atas     := nullif(btrim(p_data->>'atas_nama'), '');
    v_instr    := nullif(btrim(p_data->>'instruksi'), '');
    if v_jenis is null or v_jenis not in ('transfer','virtual_account','ewallet','tunai') then
      raise exception 'Jenis pembayaran tidak valid';
    end if;
    if v_penyedia is null then raise exception 'Nama bank/penyedia wajib diisi'; end if;
    if v_jenis <> 'tunai' and v_nomor is null then raise exception 'Nomor rekening/VA/e-wallet wajib diisi'; end if;
    if v_jenis = 'transfer' and v_atas is null then raise exception 'Atas nama wajib diisi untuk transfer bank'; end if;
    if char_length(v_penyedia) > 100 then raise exception 'Nama bank/penyedia maksimal 100 karakter'; end if;
    if char_length(coalesce(v_nomor, '')) > 64 then raise exception 'Nomor maksimal 64 karakter'; end if;
    if char_length(coalesce(v_atas, '')) > 150 then raise exception 'Atas nama maksimal 150 karakter'; end if;
    if char_length(coalesce(v_instr, '')) > 1000 then raise exception 'Instruksi maksimal 1000 karakter'; end if;
    return jsonb_build_object(
      'jenis', v_jenis, 'penyedia', v_penyedia, 'nomor', v_nomor, 'atas_nama', v_atas,
      'instruksi', v_instr, 'aktif', pj_bool(p_data, 'aktif', true), 'urutan', pj_int(p_data, 'urutan', 0));
  end if;

  raise exception 'Jenis data tidak dikenal';
end $$;

-- nilai yang sedang berlaku (kunci yang sama dengan pj_normalisasi); null jika tidak ada
create or replace function pj_ambil(p_entitas text, p_id uuid, p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_entitas = 'komponen_biaya' then
    select jsonb_build_object('nama', nama, 'nominal', nominal, 'wajib', wajib, 'aktif', aktif, 'urutan', urutan)
      into r from komponen_biaya where id = p_id and tenant_id = p_tenant;
  elsif p_entitas = 'metode_pembayaran' then
    select jsonb_build_object('jenis', jenis, 'penyedia', penyedia, 'nomor', nomor, 'atas_nama', atas_nama,
                              'instruksi', instruksi, 'aktif', aktif, 'urutan', urutan)
      into r from metode_pembayaran where id = p_id and tenant_id = p_tenant;
  end if;
  return r;
end $$;

revoke all on function pj_bool(jsonb, text, boolean)            from public, anon, authenticated;
revoke all on function pj_int(jsonb, text, integer)             from public, anon, authenticated;
revoke all on function pj_normalisasi(text, jsonb)              from public, anon, authenticated;
revoke all on function pj_ambil(text, uuid, uuid)               from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. AJUKAN / SETUJUI / TOLAK / BATALKAN
--    Pengaju: admin, tu.  Penyetuju: kepala_sekolah, owner (cadangan).
--    Penyetuju tidak boleh sama dengan pengaju.
-- ---------------------------------------------------------------------
create or replace function ajukan_perubahan(
  p_tenant uuid, p_entitas text, p_entitas_id uuid, p_data jsonb, p_catatan text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_data jsonb; v_lama jsonb; v_aksi text; v_id uuid;
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  if not is_member(p_tenant, array['admin','tu']::member_role[]) then
    raise exception 'Hanya admin atau TU yang boleh mengajukan perubahan';
  end if;
  if p_entitas is null or p_entitas not in ('komponen_biaya','metode_pembayaran') then
    raise exception 'Jenis data tidak dikenal';
  end if;

  v_data := pj_normalisasi(p_entitas, coalesce(p_data, '{}'::jsonb));

  if p_entitas_id is null then
    v_aksi := 'buat';
  else
    v_aksi := 'ubah';
    v_lama := pj_ambil(p_entitas, p_entitas_id, p_tenant);
    if v_lama is null then raise exception 'Data yang diubah tidak ditemukan'; end if;
    if v_lama = v_data then raise exception 'Tidak ada perubahan dari data yang berlaku'; end if;
  end if;

  insert into pengajuan_perubahan (tenant_id, entitas, entitas_id, aksi, data, data_lama, catatan,
                                   diajukan_oleh, diajukan_email)
  values (p_tenant, p_entitas, p_entitas_id, v_aksi, v_data, v_lama, left(nullif(btrim(p_catatan), ''), 500),
          v_uid, auth.jwt()->>'email')
  returning id into v_id;
  return v_id;
end $$;

create or replace function setujui_pengajuan(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r pengajuan_perubahan; v jsonb; v_new uuid;
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  select * into r from pengajuan_perubahan where id = p_id for update;
  if not found or not is_member(r.tenant_id, array['kepala_sekolah','owner']::member_role[]) then
    raise exception 'Pengajuan tidak ditemukan atau Anda tidak berhak menyetujuinya';
  end if;
  if r.status <> 'menunggu' then raise exception 'Pengajuan sudah diproses'; end if;
  if r.diajukan_oleh is not distinct from v_uid then
    raise exception 'Pengajuan tidak boleh disetujui oleh orang yang mengajukannya';
  end if;

  v := pj_normalisasi(r.entitas, r.data);

  if r.aksi = 'ubah' and pj_ambil(r.entitas, r.entitas_id, r.tenant_id) is distinct from r.data_lama then
    raise exception 'Data sudah berubah sejak diajukan. Tolak pengajuan ini dan ajukan ulang';
  end if;

  if r.entitas = 'komponen_biaya' then
    if r.aksi = 'buat' then
      insert into komponen_biaya (tenant_id, nama, nominal, wajib, aktif, urutan)
      values (r.tenant_id, v->>'nama', (v->>'nominal')::numeric, (v->>'wajib')::boolean,
              (v->>'aktif')::boolean, (v->>'urutan')::integer)
      returning id into v_new;
    else
      update komponen_biaya set nama = v->>'nama', nominal = (v->>'nominal')::numeric,
             wajib = (v->>'wajib')::boolean, aktif = (v->>'aktif')::boolean,
             urutan = (v->>'urutan')::integer, updated_at = now()
       where id = r.entitas_id and tenant_id = r.tenant_id;
      if not found then raise exception 'Data yang diubah sudah tidak ada'; end if;
      v_new := r.entitas_id;
    end if;
  else  -- metode_pembayaran
    if r.aksi = 'buat' then
      insert into metode_pembayaran (tenant_id, jenis, penyedia, nomor, atas_nama, instruksi, aktif, urutan)
      values (r.tenant_id, v->>'jenis', v->>'penyedia', v->>'nomor', v->>'atas_nama', v->>'instruksi',
              (v->>'aktif')::boolean, (v->>'urutan')::integer)
      returning id into v_new;
    else
      update metode_pembayaran set jenis = v->>'jenis', penyedia = v->>'penyedia', nomor = v->>'nomor',
             atas_nama = v->>'atas_nama', instruksi = v->>'instruksi',
             aktif = (v->>'aktif')::boolean, urutan = (v->>'urutan')::integer, updated_at = now()
       where id = r.entitas_id and tenant_id = r.tenant_id;
      if not found then raise exception 'Data yang diubah sudah tidak ada'; end if;
      v_new := r.entitas_id;
    end if;
  end if;

  update pengajuan_perubahan
     set status = 'disetujui', entitas_id = v_new, diputuskan_oleh = v_uid,
         diputuskan_email = auth.jwt()->>'email', diputuskan_at = now()
   where id = p_id;
end $$;

create or replace function tolak_pengajuan(p_id uuid, p_catatan text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r pengajuan_perubahan;
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  select * into r from pengajuan_perubahan where id = p_id for update;
  if not found or not is_member(r.tenant_id, array['kepala_sekolah','owner']::member_role[]) then
    raise exception 'Pengajuan tidak ditemukan atau Anda tidak berhak menolaknya';
  end if;
  if r.status <> 'menunggu' then raise exception 'Pengajuan sudah diproses'; end if;
  update pengajuan_perubahan
     set status = 'ditolak', diputuskan_oleh = v_uid, diputuskan_email = auth.jwt()->>'email',
         diputuskan_at = now(), catatan_keputusan = left(nullif(btrim(p_catatan), ''), 500)
   where id = p_id;
end $$;

create or replace function batalkan_pengajuan(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r pengajuan_perubahan;
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  select * into r from pengajuan_perubahan where id = p_id for update;
  if not found or r.diajukan_oleh is distinct from v_uid
     or not is_member(r.tenant_id, array['admin','tu']::member_role[]) then
    raise exception 'Pengajuan tidak ditemukan atau bukan milik Anda';
  end if;
  if r.status <> 'menunggu' then raise exception 'Pengajuan sudah diproses'; end if;
  update pengajuan_perubahan
     set status = 'dibatalkan', diputuskan_oleh = v_uid, diputuskan_email = auth.jwt()->>'email',
         diputuskan_at = now()
   where id = p_id;
end $$;

revoke all on function ajukan_perubahan(uuid, text, uuid, jsonb, text) from public, anon;
revoke all on function setujui_pengajuan(uuid)                         from public, anon;
revoke all on function tolak_pengajuan(uuid, text)                     from public, anon;
revoke all on function batalkan_pengajuan(uuid)                        from public, anon;
grant execute on function ajukan_perubahan(uuid, text, uuid, jsonb, text) to authenticated, service_role;
grant execute on function setujui_pengajuan(uuid)                         to authenticated, service_role;
grant execute on function tolak_pengajuan(uuid, text)                     to authenticated, service_role;
grant execute on function batalkan_pengajuan(uuid)                        to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. AUDIT
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['jurusan','komponen_biaya','metode_pembayaran','pengajuan_perubahan'] loop
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on %1$s
       for each row execute function log_audit()', t);
  end loop;
end $$;
