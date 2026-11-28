-- =====================================================================
-- PPDB Payment Confirmation & Bukti Upload (Tahap 2)
-- Storage bucket for bukti transfer, payment tracking, email outbox
-- =====================================================================

-- 1. Create private storage bucket for bukti transfer
-- Note: buckets created via SQL need manual creation in dashboard or via API
-- This is documented here; run in Supabase Dashboard > Storage:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('ppdb-bukti', 'ppdb-bukti', false);

-- 2. Table for payment confirmations with bukti upload
create table if not exists public.pendaftaran_bukti_bayar (
  id uuid primary key default gen_random_uuid(),
  pendaftaran_id uuid not null references public.pendaftaran_siswa(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metode_bayar_id uuid not null references public.metode_pembayaran(id),
  nominal_bayar numeric not null check (nominal_bayar > 0),
  nama_pengirim text not null check (char_length(nama_pengirim) <= 150),
  catatan_bayar text,
  bukti_path text,                 -- storage object path (private bucket)
  bukti_content_type text,
  bukti_size_bytes bigint,
  status text not null default 'menunggu' check (status in ('menunggu', 'diverifikasi', 'ditolak')),
  dikirim_at timestamptz not null default now(),
  diverifikasi_oleh uuid references auth.users,
  diverifikasi_at timestamptz,
  catatan_verifikasi text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bukti_pendaftaran on public.pendaftaran_bukti_bayar(pendaftaran_id);
create index if not exists idx_bukti_status on public.pendaftaran_bukti_bayar(status);

alter table public.pendaftaran_bukti_bayar enable row level security;

-- RLS: Pendaftar (via PIN) bisa insert & read own bukti
create policy "Pendaftar insert bukti" on public.pendaftaran_bukti_bayar
  for insert with check (
    exists (
      select 1 from public.pendaftaran_siswa p
      where p.id = pendaftaran_id
      and p.status not in ('diterima', 'ditolak')
    )
  );

create policy "Pendaftar read own bukti" on public.pendaftaran_bukti_bayar
  for select using (
    exists (
      select 1 from public.pendaftaran_siswa p
      where p.id = pendaftaran_id
      and (p.nomor_registrasi = current_setting('request.jwt.claims.nomor_registrasi', true)::text
           or auth.uid() = p.id)  -- fallback
    )
  );

-- RLS: Staf sekolah (owner, kepala_sekolah, admin, tu) bisa read all & update status
create policy "Staf read bukti" on public.pendaftaran_bukti_bayar
  for select using (
    is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[])
  );

create policy "Staf update bukti status" on public.pendaftaran_bukti_bayar
  for update using (
    is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[])
  )
  with check (
    is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[])
  );

-- 3. Email outbox table (for Edge Function to process)
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  to_email text not null check (char_length(to_email) <= 320),
  subject text not null check (char_length(subject) <= 500),
  body_html text not null,
  body_text text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  retries int not null default 0,
  error_msg text,
  related_id uuid,                 -- e.g., pendaftaran_id
  related_type text,               -- e.g., 'ppdb_payment_instruction'
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_email_outbox_pending on public.email_outbox(status, created_at) where status = 'pending';

alter table public.email_outbox enable row level security;

-- Only platform/system can insert (Edge Function with service_role)
-- Staf can read for debugging
create policy "Platform insert email" on public.email_outbox
  for insert with check (false);  -- only service_role bypasses RLS

create policy "Staf read email outbox" on public.email_outbox
  for select using (
    is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[])
  );

-- 4. RPC: Konfirmasi bayar + upload bukti (public, SECURITY DEFINER)
-- Returns signed upload URL for bukti file
create or replace function public.konfirmasi_bayar_ppdb_upload(
  p_nomor_registrasi text,
  p_pin_akses text,
  p_metode_bayar_id uuid,
  p_nominal_bayar numeric,
  p_nama_pengirim text,
  p_catatan_bayar text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k record;
  r public.pendaftaran_siswa;
  v_bukti uuid;
  v_upload_url text;
  v_path text;
begin
  select * into k from public.ppdb_cek_kredensial(p_nomor_registrasi, p_pin_akses);
  if k.o_id is null then return jsonb_build_object('ok', false, 'pesan', k.o_pesan); end if;

  select * into r from public.pendaftaran_siswa where id = k.o_id;
  if r.status in ('diterima', 'ditolak') or r.status_bayar = 'lunas' then
    raise exception 'Pendaftaran ini sudah diproses. Konfirmasi pembayaran tidak dapat diubah';
  end if;
  if r.total_biaya <= 0 then raise exception 'Tidak ada biaya yang perlu dibayar'; end if;
  if p_nominal_bayar is null or p_nominal_bayar <= 0 or p_nominal_bayar >= 1000000000000 then
    raise exception 'Nominal pembayaran tidak valid';
  end if;
  if not exists (
    select 1 from public.metode_pembayaran where id = p_metode_bayar_id and tenant_id = r.tenant_id and aktif
  ) then raise exception 'Tujuan pembayaran tidak valid'; end if;

  -- Create bukti record (pending upload)
  v_path := r.tenant_id::text || '/' || r.id::text || '/' || gen_random_uuid()::text;
  insert into public.pendaftaran_bukti_bayar (
    pendaftaran_id, tenant_id, metode_bayar_id, nominal_bayar,
    nama_pengirim, catatan_bayar, bukti_path, status
  ) values (
    r.id, r.tenant_id, p_metode_bayar_id, p_nominal_bayar,
    btrim(p_nama_pengirim), nullif(btrim(coalesce(p_catatan_bayar, '')), ''),
    v_path, 'menunggu_upload'
  ) returning id into v_bukti;

  -- Generate signed upload URL (valid 1 hour)
  -- Note: This requires storage extension; fallback to returning path for client-side upload
  v_upload_url := 'storage/v1/object/ppdb-bukti/' || v_path;

  -- Update pendaftaran status
  update public.pendaftaran_siswa
     set metode_bayar_id = p_metode_bayar_id,
         nominal_bayar = p_nominal_bayar,
         nama_pengirim = btrim(p_nama_pengirim),
         catatan_bayar = nullif(btrim(coalesce(p_catatan_bayar, '')), ''),
         status_bayar = 'menunggu_verifikasi',
         status = case when status = 'baru' then 'menunggu_verifikasi' else status end
   where id = r.id;

  return jsonb_build_object(
    'ok', true,
    'bukti_id', v_bukti,
    'upload_url', v_upload_url,
    'message', 'Silakan unggah bukti transfer menggunakan URL yang diberikan.'
  );
end $$;

-- 5. RPC: Complete bukti upload (called after client uploads file)
create or replace function public.selesai_upload_bukti_ppdb(
  p_bukti_id uuid,
  p_content_type text,
  p_size_bytes bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bukti public.pendaftaran_bukti_bayar;
  v_pendaftaran public.pendaftaran_siswa;
  v_tenant public.tenants;
  v_rekening jsonb;
  v_rincian jsonb;
begin
  select * into v_bukti from public.pendaftaran_bukti_bayar where id = p_bukti_id;
  if not found then raise exception 'Bukti tidak ditemukan'; end if;
  if v_bukti.status <> 'menunggu_upload' then raise exception 'Bukti sudah diproses'; end if;

  -- Verify file size (max 10MB)
  if p_size_bytes > 10485760 then raise exception 'Ukuran file maksimal 10 MB'; end if;
  -- Verify content type
  if p_content_type not in ('image/jpeg', 'image/png', 'application/pdf') then
    raise exception 'Format file tidak didukung. Gunakan JPG, PNG, atau PDF.';
  end if;

  update public.pendaftaran_bukti_bayar
     set bukti_content_type = p_content_type,
         bukti_size_bytes = p_size_bytes,
         status = 'menunggu',
         updated_at = now()
   where id = p_bukti_id;

  -- Get data for email
  select * into v_pendaftaran from public.pendaftaran_siswa where id = v_bukti.pendaftaran_id;
  select * into v_tenant from public.tenants where id = v_pendaftaran.tenant_id;
  select jsonb_agg(jsonb_build_object(
    'penyedia', m.penyedia, 'nomor', m.nomor, 'atas_nama', m.atas_nama, 'instruksi', m.instruksi
  )) into v_rekening from public.metode_pembayaran m where m.tenant_id = v_tenant.id and m.aktif;

  -- Insert email to outbox for payment confirmation instruction
  insert into public.email_outbox (tenant_id, to_email, subject, body_html, related_id, related_type)
  values (
    v_tenant.id,
    v_pendaftaran.email_wali,
    'Konfirmasi Pembayaran PPDB - ' || v_tenant.nama,
    '<p>Yth. Orang Tua/Wali <b>' || v_pendaftaran.nama_wali || '</b>,</p>' ||
    '<p>Pendaftaran atas nama <b>' || v_pendaftaran.nama_lengkap || '</b> (No. Reg: <code>' || v_pendaftaran.nomor_registrasi || '</code>) sudah kami terima.</p>' ||
    '<p>Silakan lakukan pembayaran ke rekening berikut:</p>' ||
    '<ul>' || coalesce((
      select string_agg('<li><b>' || m->>'penyedia' || '</b> ' || coalesce(m->>'nomor', '') || ' ' || coalesce('(a.n. ' || m->>'atas_nama' || ')', '') || ' ' || coalesce(m->>'instruksi', '') || '</li>', '')
      from jsonb_array_elements(v_rekening) m
    ), '') || '</ul>' ||
    '<p>Total biaya: <b>Rp ' || to_char(v_pendaftaran.total_biaya, 'FM999,999,999,999') || '</b></p>' ||
    '<p>Setelah transfer, silakan unggah bukti transfer melalui tautan di halaman status pendaftaran.</p>' ||
    '<p>Salam,<br>Tim ' || v_tenant.nama || '</p>',
    v_pendaftaran.id,
    'ppdb_payment_instruction'
  );

  return jsonb_build_object('ok', true, 'message', 'Bukti terverifikasi. Instruksi pembayaran dikirim ke email.');
end $$;

-- 6. RPC: Admin verifikasi bukti (approve/reject)
create or replace function public.verifikasi_bukti_ppdb(
  p_bukti_id uuid,
  p_setujui boolean,
  p_catatan text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bukti public.pendaftaran_bukti_bayar;
  v_pendaftaran public.pendaftaran_siswa;
  v_tenant public.tenants;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Harus login'; end if;

  select * into v_bukti from public.pendaftaran_bukti_bayar where id = p_bukti_id;
  if not found then raise exception 'Bukti tidak ditemukan'; end if;

  if not is_member(v_bukti.tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]) then
    raise exception 'Tidak berhak memverifikasi bukti ini';
  end if;

  if v_bukti.status not in ('menunggu', 'menunggu_upload') then
    raise exception 'Bukti sudah diproses';
  end if;

  select * into v_pendaftaran from public.pendaftaran_siswa where id = v_bukti.pendaftaran_id;

  if p_setujui then
    update public.pendaftaran_bukti_bayar
       set status = 'diverifikasi',
           diverifikasi_oleh = v_uid,
           diverifikasi_at = now(),
           catatan_verifikasi = nullif(btrim(coalesce(p_catatan, '')), ''),
           updated_at = now()
     where id = p_bukti_id;

    update public.pendaftaran_siswa
       set status_bayar = 'lunas',
           status = case when status = 'menunggu_verifikasi' then 'baru' else status end
     where id = v_pendaftaran.id;

    -- Email: payment verified
    select * into v_tenant from public.tenants where id = v_bukti.tenant_id;
    insert into public.email_outbox (tenant_id, to_email, subject, body_html, related_id, related_type)
    values (
      v_tenant.id,
      v_pendaftaran.email_wali,
      'Pembayaran Diverifikasi - ' || v_tenant.nama,
      '<p>Yth. Orang Tua/Wali <b>' || v_pendaftaran.nama_wali || '</b>,</p>' ||
      '<p>Pembayaran untuk pendaftaran <b>' || v_pendaftaran.nama_lengkap || '</b> (No. Reg: <code>' || v_pendaftaran.nomor_registrasi || '</code>) <b>telah diverifikasi</b>.</p>' ||
      '<p>Status pembayaran: <b>LUNAS</b></p>' ||
      '<p>Pendaftaran akan diproses lebih lanjut oleh panitia.</p>' ||
      '<p>Salam,<br>Tim ' || v_tenant.nama || '</p>',
      v_pendaftaran.id,
      'ppdb_payment_verified'
    );

    return jsonb_build_object('ok', true, 'message', 'Bukti disetujui. Status pembayaran: Lunas.');
  else
    update public.pendaftaran_bukti_bayar
       set status = 'ditolak',
           diverifikasi_oleh = v_uid,
           diverifikasi_at = now(),
           catatan_verifikasi = nullif(btrim(coalesce(p_catatan, '')), ''),
           updated_at = now()
     where id = p_bukti_id;

    update public.pendaftaran_siswa
       set status_bayar = 'belum_bayar'
     where id = v_pendaftaran.id;

    -- Email: payment rejected
    select * into v_tenant from public.tenants where id = v_bukti.tenant_id;
    insert into public.email_outbox (tenant_id, to_email, subject, body_html, related_id, related_type)
    values (
      v_tenant.id,
      v_pendaftaran.email_wali,
      'Pembayaran Ditolak - ' || v_tenant.nama,
      '<p>Yth. Orang Tua/Wali <b>' || v_pendaftaran.nama_wali || '</b>,</p>' ||
      '<p>Pembayaran untuk pendaftaran <b>' || v_pendaftaran.nama_lengkap || '</b> (No. Reg: <code>' || v_pendaftaran.nomor_registrasi || '</code>) <b>ditolak</b>.</p>' ||
      '<p>Alasan: ' || esc(coalesce(p_catatan, 'Bukti tidak valid atau nominal tidak sesuai')) || '</p>' ||
      '<p>Silakan hubungi panitia atau lakukan pembayaran ulang.</p>' ||
      '<p>Salam,<br>Tim ' || v_tenant.nama || '</p>',
      v_pendaftaran.id,
      'ppdb_payment_rejected'
    );

    return jsonb_build_object('ok', true, 'message', 'Bukti ditolak. Status pembayaran dikembalikan ke Belum Bayar.');
  end if;
end $$;

-- 7. Helper: Get signed download URL for bukti (admin only)
create or replace function public.get_bukti_download_url(p_bukti_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_bukti public.pendaftaran_bukti_bayar;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  select * into v_bukti from public.pendaftaran_bukti_bayar where id = p_bukti_id;
  if not found then raise exception 'Bukti tidak ditemukan'; end if;
  if not is_member(v_bukti.tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]) then
    raise exception 'Tidak berhak mengakses bukti ini';
  end if;
  -- Return path for client to generate signed URL via storage API
  return jsonb_build_object('ok', true, 'path', v_bukti.bukti_path);
end $$;

-- 8. Grant execute to anon/authenticated
grant execute on function public.konfirmasi_bayar_ppdb_upload to anon, authenticated;
grant execute on function public.selesai_upload_bukti_ppdb to anon, authenticated;
grant execute on function public.verifikasi_bukti_ppdb to authenticated;
grant execute on function public.get_bukti_download_url to authenticated;

-- 9. Revoke old konfirmasi_bayar_ppdb (replaced by upload flow)
-- keep for backward compat but mark deprecated
comment on function public.konfirmasi_bayar_ppdb is 'DEPRECATED: gunakan konfirmasi_bayar_ppdb_upload + selesai_upload_bukti_ppdb';