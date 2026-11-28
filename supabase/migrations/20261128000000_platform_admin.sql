-- =====================================================================
-- Platform Admin: kelola sekolah (tenant) dari level platform
-- =====================================================================

-- 1. Tabel platform_admins (user yang bisa kelola semua sekolah)
create table platform_admins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'admin',           -- 'owner' | 'admin'
  created_at timestamptz default now(),
  unique (user_id)
);

alter table platform_admins enable row level security;

-- Hanya platform admin yang bisa baca platform_admins
create policy platform_admins_self on platform_admins
  for select using (user_id = auth.uid());

-- 2. Fungsi cek platform admin
create or replace function is_platform_admin(roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform_admins pa
    where pa.user_id = auth.uid()
      and (roles is null or pa.role = any(roles))
  );
$$;

-- 3. Update tabel tenants: pastikan status punya constraint & index
-- (status sudah ada di init.sql: active/suspended, tambahkan constraint)
alter table tenants drop constraint if exists tenants_status_check;
alter table tenants add constraint tenants_status_check
  check (status in ('active','inactive','suspended'));

-- Index untuk query platform
create index if not exists idx_tenants_status on tenants(status);

-- 4. RLS: Proteksi tenants dari user level sekolah
-- Hapus policy lama yang terlalu longgar (kalau ada)
drop policy if exists tenants_public_read on tenants;
drop policy if exists tenants_staff on tenants;

-- Policy baru:
-- - Public read: hanya tenant dengan status 'active' (untuk landing page)
-- - Platform admin: full access (CRUD semua tenant)
-- - User level sekolah: HANYA baca tenant MILIKNYA (via tenant_members)
create policy tenants_public_read on tenants
  for select using (status = 'active');

create policy tenants_platform_admin on tenants
  for all using (is_platform_admin(array['owner','admin']::text[]))
  with check (is_platform_admin(array['owner','admin']::text[]));

create policy tenants_self_school on tenants
  for select using (
    exists (
      select 1 from tenant_members tm
      where tm.tenant_id = tenants.id
        and tm.user_id = auth.uid()
    )
  );

-- 5. RLS: tenant_domains - platform admin full, sekolah baca miliknya
drop policy if exists domains_public_read on tenant_domains;
drop policy if exists domains_staff on tenant_domains;

create policy domains_public_read on tenant_domains for select using (true);

create policy domains_platform_admin on tenant_domains
  for all using (is_platform_admin(array['owner','admin']::text[]))
  with check (is_platform_admin(array['owner','admin']::text[]));

create policy domains_self_school on tenant_domains
  for select using (
    exists (
      select 1 from tenant_members tm
      where tm.tenant_id = tenant_domains.tenant_id
        and tm.user_id = auth.uid()
    )
  );

-- 6. RLS: tenant_members - platform admin full, sekolah kelola miliknya (owner/admin)
drop policy if exists members_admin on tenant_members;

create policy members_platform_admin on tenant_members
  for all using (is_platform_admin(array['owner','admin']::text[]))
  with check (is_platform_admin(array['owner','admin']::text[]));

-- Policy members_admin (sekolah) sudah ada di init.sql, biarkan
-- create policy members_admin on tenant_members for all using (is_member(tenant_id, array['owner','admin']::member_role[]));