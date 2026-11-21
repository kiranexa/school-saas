-- =====================================================================
-- School Management SaaS - 001_init.sql  (Supabase / PostgreSQL)
-- Multi-tenant: 1 database, banyak sekolah, dipisah kolom tenant_id + RLS
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- ENUM ----------
create type member_role   as enum ('owner','kepala_sekolah','admin','tu','guru','siswa','wali');
create type status_aktif  as enum ('aktif','nonaktif','lulus','pindah','cuti');
create type status_absen  as enum ('hadir','izin','sakit','alpa');
create type status_bayar  as enum ('belum','sebagian','lunas');
create type jenis_kelamin as enum ('L','P');

-- =====================================================================
-- 1. TENANT (SEKOLAH) & DOMAIN
-- =====================================================================
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,            -- "school1"
  nama          text not null,
  npsn          text,
  jenjang       text,                            -- SD/SMP/SMA/SMK
  alamat        text,
  logo_url      text,
  tema          jsonb default '{}',              -- warna, font landing page
  plan          text not null default 'free',    -- free/basic/pro
  status        text not null default 'active',  -- active/suspended
  created_at    timestamptz default now()
);

create table tenant_domains (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  domain     text unique not null,               -- school1.sekolahku.id / school1.sch.id
  is_primary boolean default false,
  verified   boolean default false
);

-- Relasi user (auth.users) <-> sekolah + role
create table tenant_members (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       member_role not null,
  created_at timestamptz default now(),
  unique (tenant_id, user_id, role)
);

-- =====================================================================
-- 2. MASTER AKADEMIK
-- =====================================================================
create table tahun_ajaran (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  nama       text not null,                      -- 2026/2027
  semester   smallint not null check (semester in (1,2)),
  mulai      date, selesai date,
  aktif      boolean default false
);

create table guru (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid references auth.users(id),
  nip        text, nama text not null,
  jk         jenis_kelamin, tgl_lahir date,
  email      text, telepon text, alamat text,
  status     status_aktif default 'aktif',
  created_at timestamptz default now()
);

create table kelas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  tahun_ajaran_id uuid references tahun_ajaran(id),
  nama           text not null,                  -- X IPA 1
  tingkat        smallint,
  wali_guru_id   uuid references guru(id)
);

create table siswa (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid references auth.users(id),
  nis        text, nisn text, nama text not null,
  jk         jenis_kelamin, tempat_lahir text, tgl_lahir date,
  alamat     text, telepon text, foto_url text,
  nama_wali  text, telepon_wali text,
  status     status_aktif default 'aktif',
  created_at timestamptz default now(),
  unique (tenant_id, nis)
);

create table kelas_siswa (                        -- siswa masuk kelas per tahun ajaran
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kelas_id  uuid not null references kelas(id) on delete cascade,
  siswa_id  uuid not null references siswa(id) on delete cascade,
  unique (kelas_id, siswa_id)
);

create table mata_pelajaran (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kode      text, nama text not null, kkm smallint default 75
);

create table jadwal (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kelas_id  uuid not null references kelas(id) on delete cascade,
  mapel_id  uuid not null references mata_pelajaran(id),
  guru_id   uuid not null references guru(id),
  hari      smallint not null check (hari between 1 and 7),
  jam_mulai time not null, jam_selesai time not null,
  ruang     text
);

-- =====================================================================
-- 3. OPERASIONAL
-- =====================================================================
create table absensi (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  siswa_id  uuid not null references siswa(id) on delete cascade,
  kelas_id  uuid references kelas(id),
  jadwal_id uuid references jadwal(id),
  tanggal   date not null,
  status    status_absen not null,
  catatan   text,
  dicatat_oleh uuid references auth.users(id),
  unique (siswa_id, tanggal, jadwal_id)
);

create table nilai (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  siswa_id  uuid not null references siswa(id) on delete cascade,
  mapel_id  uuid not null references mata_pelajaran(id),
  tahun_ajaran_id uuid references tahun_ajaran(id),
  jenis     text not null,                       -- tugas/uh/uts/uas/praktik
  skor      numeric(5,2) not null check (skor between 0 and 100),
  catatan   text,
  guru_id   uuid references guru(id),
  created_at timestamptz default now()
);

create table tagihan (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  siswa_id  uuid not null references siswa(id) on delete cascade,
  jenis     text not null,                       -- SPP / Gedung / Seragam
  periode   text,                                -- 2026-11
  jumlah    numeric(14,2) not null,
  jatuh_tempo date,
  status    status_bayar default 'belum'
);

create table pembayaran (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  tagihan_id uuid not null references tagihan(id) on delete cascade,
  jumlah     numeric(14,2) not null,
  metode     text, bukti_url text,
  tgl_bayar  timestamptz default now(),
  dicatat_oleh uuid references auth.users(id)
);

-- =====================================================================
-- 4. KONTEN PUBLIK (LANDING PAGE)
-- =====================================================================
create table halaman (                             -- beranda, profil, visi-misi, dll
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug      text not null, judul text not null,
  konten    jsonb default '{}',
  published boolean default false,
  unique (tenant_id, slug)
);

create table galeri (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  judul     text, gambar_url text not null, album text,
  published boolean default true,
  created_at timestamptz default now()
);

create table pengumuman (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  judul     text not null, isi text,
  target    text default 'publik',               -- publik / siswa / guru
  published boolean default true,
  created_at timestamptz default now()
);

-- =====================================================================
-- 5. INDEX
-- =====================================================================
create index on tenant_members (user_id);
create index on tenant_domains (domain);
create index on siswa (tenant_id);
create index on guru (tenant_id);
create index on kelas_siswa (tenant_id, siswa_id);
create index on absensi (tenant_id, tanggal);
create index on nilai (tenant_id, siswa_id);
create index on tagihan (tenant_id, siswa_id);

-- =====================================================================
-- 6. HELPER FUNCTION RLS
-- =====================================================================
create or replace function is_member(t uuid, roles member_role[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members m
    where m.tenant_id = t and m.user_id = auth.uid()
      and (roles is null or m.role = any(roles))
  );
$$;

create or replace function my_siswa_id(t uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from siswa where tenant_id = t and user_id = auth.uid() limit 1;
$$;

-- =====================================================================
-- 7. ENABLE RLS + POLICY
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','tenant_domains','tenant_members','tahun_ajaran','guru','kelas',
    'siswa','kelas_siswa','mata_pelajaran','jadwal','absensi','nilai',
    'tagihan','pembayaran','halaman','galeri','pengumuman'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Resolusi tenant dari hostname (boleh dibaca publik)
create policy tenants_public_read on tenants        for select using (status = 'active');
create policy domains_public_read on tenant_domains for select using (true);

-- Membership: user lihat miliknya, owner/admin kelola
create policy members_self  on tenant_members for select using (user_id = auth.uid() or is_member(tenant_id, array['owner','admin']::member_role[]));
create policy members_admin on tenant_members for all    using (is_member(tenant_id, array['owner','admin']::member_role[]));

-- Staff (admin area) = baca/tulis penuh data akademik tenant-nya
do $$
declare t text;
begin
  foreach t in array array[
    'tahun_ajaran','guru','kelas','siswa','kelas_siswa','mata_pelajaran',
    'jadwal','halaman','galeri','pengumuman'
  ] loop
    execute format($f$
      create policy %1$s_staff on %1$s for all
      using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]))
      with check (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]))
    $f$, t);
  end loop;
end $$;

-- Guru: baca data akademik, tulis absensi & nilai
create policy guru_read_siswa  on siswa  for select using (is_member(tenant_id, array['guru']::member_role[]));
create policy guru_read_kelas  on kelas  for select using (is_member(tenant_id, array['guru']::member_role[]));
create policy guru_read_jadwal on jadwal for select using (is_member(tenant_id, array['guru']::member_role[]));
create policy guru_absensi on absensi for all using (is_member(tenant_id, array['guru','tu','admin','kepala_sekolah','owner']::member_role[]))
                                          with check (is_member(tenant_id, array['guru','tu','admin','kepala_sekolah','owner']::member_role[]));
create policy guru_nilai   on nilai   for all using (is_member(tenant_id, array['guru','tu','admin','kepala_sekolah','owner']::member_role[]))
                                          with check (is_member(tenant_id, array['guru','tu','admin','kepala_sekolah','owner']::member_role[]));

-- Keuangan: hanya TU/admin/kepsek/owner
create policy tagihan_staff    on tagihan    for all using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));
create policy pembayaran_staff on pembayaran for all using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));

-- Siswa: hanya data miliknya sendiri
create policy siswa_self_profile on siswa   for select using (user_id = auth.uid());
create policy siswa_self_absensi on absensi for select using (siswa_id = my_siswa_id(tenant_id));
create policy siswa_self_nilai   on nilai   for select using (siswa_id = my_siswa_id(tenant_id));
create policy siswa_self_tagihan on tagihan for select using (siswa_id = my_siswa_id(tenant_id));
create policy siswa_read_jadwal  on jadwal  for select using (is_member(tenant_id, array['siswa']::member_role[]));
create policy siswa_read_mapel   on mata_pelajaran for select using (is_member(tenant_id, array['siswa','guru']::member_role[]));

-- Konten publik (landing page) dibaca siapa saja
create policy halaman_public     on halaman     for select using (published);
create policy galeri_public      on galeri      for select using (published);
create policy pengumuman_public  on pengumuman  for select using (published and target = 'publik');
create policy pengumuman_siswa   on pengumuman  for select using (published and is_member(tenant_id, array['siswa','guru']::member_role[]));
