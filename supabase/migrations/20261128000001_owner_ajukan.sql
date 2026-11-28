-- =====================================================================
-- Allow owner to propose changes (ajukan_perubahan)
-- =====================================================================

create or replace function ajukan_perubahan(
  p_tenant uuid, p_entitas text, p_entitas_id uuid, p_data jsonb, p_catatan text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_data jsonb; v_lama jsonb; v_aksi text; v_id uuid;
begin
  if v_uid is null then raise exception 'Harus login'; end if;
  -- Allow owner, admin, tu to propose
  if not is_member(p_tenant, array['owner','admin','tu']::member_role[]) then
    raise exception 'Hanya owner, admin, atau TU yang boleh mengajukan perubahan';
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

-- =====================================================================
-- Also update setujui_pengajuan: allow owner to approve their own proposal
-- =====================================================================

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
  -- Allow owner to approve their own proposal (bypass self-approval check)
  if r.diajukan_oleh is not distinct from v_uid and not is_member(r.tenant_id, array['owner']::member_role[]) then
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