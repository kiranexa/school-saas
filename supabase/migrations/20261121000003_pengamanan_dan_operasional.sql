-- =====================================================================
-- 003: perbaikan celah keamanan + fitur operasional
-- Jalankan SETELAH 001 dan 002
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. CELAH KEAMANAN
-- ---------------------------------------------------------------------

-- A1. Admin tidak boleh memberi/mengubah peran owner. Hanya owner yang boleh.
drop policy if exists members_admin on tenant_members;

create policy members_write_owner on tenant_members for all
  using (is_member(tenant_id, array['owner']::member_role[]))
  with check (is_member(tenant_id, array['owner']::member_role[]));

create policy members_write_admin on tenant_members for all
  using (role <> 'owner' and is_member(tenant_id, array['admin']::member_role[]))
  with check (role <> 'owner' and is_member(tenant_id, array['admin']::member_role[]));

-- A2. Guru hanya boleh menulis absensi/nilai untuk siswa di kelas yang diajar
--     (punya jadwal di kelas itu) atau kelas yang ia walikan.
create or replace function guru_boleh_siswa(t uuid, s uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from guru g
    join kelas_siswa ks on ks.tenant_id = g.tenant_id and ks.siswa_id = s
    where g.user_id = auth.uid() and g.tenant_id = t
      and (
        exists (select 1 from jadwal j where j.guru_id = g.id and j.kelas_id = ks.kelas_id)
        or exists (select 1 from kelas k where k.id = ks.kelas_id and k.wali_guru_id = g.id)
      )
  );
$$;
revoke all on function guru_boleh_siswa(uuid, uuid) from public, anon;
grant execute on function guru_boleh_siswa(uuid, uuid) to authenticated, service_role;

drop policy if exists guru_absensi on absensi;
drop policy if exists guru_nilai   on nilai;

create policy absensi_staff on absensi for all
  using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]))
  with check (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));
create policy absensi_guru on absensi for all
  using (is_member(tenant_id, array['guru']::member_role[]) and guru_boleh_siswa(tenant_id, siswa_id))
  with check (is_member(tenant_id, array['guru']::member_role[]) and guru_boleh_siswa(tenant_id, siswa_id));

create policy nilai_staff on nilai for all
  using (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]))
  with check (is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::member_role[]));
create policy nilai_guru on nilai for all
  using (is_member(tenant_id, array['guru']::member_role[]) and guru_boleh_siswa(tenant_id, siswa_id))
  with check (is_member(tenant_id, array['guru']::member_role[]) and guru_boleh_siswa(tenant_id, siswa_id));

-- Guru perlu membaca data referensi untuk halaman absensi/nilai
create policy guru_read_kelas_siswa  on kelas_siswa  for select using (is_member(tenant_id, array['guru']::member_role[]));
create policy guru_read_guru         on guru         for select using (is_member(tenant_id, array['guru']::member_role[]));
create policy guru_read_tahun_ajaran on tahun_ajaran for select using (is_member(tenant_id, array['guru']::member_role[]));

-- ---------------------------------------------------------------------
-- B. INTEGRITAS DATA
-- ---------------------------------------------------------------------

-- B1. Hanya satu tahun ajaran aktif per sekolah
create unique index tahun_ajaran_aktif_uq on tahun_ajaran (tenant_id) where aktif;

-- B2. Penempatan siswa: kelas & siswa harus dari sekolah yang sama,
--     dan satu siswa hanya boleh di satu kelas per tahun ajaran.
--     (berjalan sebagai pemanggil, jadi RLS menyembunyikan baris sekolah lain)
create or replace function cek_kelas_siswa() returns trigger language plpgsql as $$
declare v_ta uuid; v_tk uuid; v_ts uuid;
begin
  select tenant_id, tahun_ajaran_id into v_tk, v_ta from kelas where id = new.kelas_id;
  select tenant_id into v_ts from siswa where id = new.siswa_id;
  if v_tk is distinct from new.tenant_id or v_ts is distinct from new.tenant_id then
    raise exception 'Kelas atau siswa tidak ditemukan di sekolah ini';
  end if;
  if v_ta is not null and exists (
    select 1 from kelas_siswa ks join kelas k on k.id = ks.kelas_id
    where ks.siswa_id = new.siswa_id and k.tahun_ajaran_id = v_ta
      and ks.kelas_id <> new.kelas_id
  ) then
    raise exception 'Siswa sudah terdaftar di kelas lain pada tahun ajaran ini';
  end if;
  return new;
end $$;

create trigger trg_kelas_siswa_cek before insert or update on kelas_siswa
  for each row execute function cek_kelas_siswa();

-- B3. Status tagihan dihitung otomatis dari total pembayaran
create or replace function refresh_tagihan_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.tagihan_id, old.tagihan_id);
        v_total numeric; v_bayar numeric;
begin
  select jumlah into v_total from tagihan where id = v_id;
  if v_total is null then return null; end if;
  select coalesce(sum(jumlah), 0) into v_bayar from pembayaran where tagihan_id = v_id;
  update tagihan set status = (case when v_bayar >= v_total then 'lunas'
                                    when v_bayar > 0 then 'sebagian'
                                    else 'belum' end)::status_bayar
  where id = v_id;
  return null;
end $$;

create trigger trg_pembayaran_status after insert or update or delete on pembayaran
  for each row execute function refresh_tagihan_status();

-- ---------------------------------------------------------------------
-- C. SIMPAN MASSAL (atomik; berjalan sebagai pemanggil, jadi RLS tetap berlaku)
-- ---------------------------------------------------------------------

-- Absensi harian satu kelas. p_data: [{"siswa_id","status","catatan"}]
create or replace function simpan_absensi_harian(p_kelas_id uuid, p_tanggal date, p_data jsonb)
returns integer language plpgsql as $$
declare v_tenant uuid; n integer;
begin
  select tenant_id into v_tenant from kelas where id = p_kelas_id;
  if v_tenant is null then raise exception 'Kelas tidak ditemukan'; end if;

  delete from absensi a using kelas_siswa ks
   where ks.kelas_id = p_kelas_id and a.siswa_id = ks.siswa_id
     and a.tanggal = p_tanggal and a.jadwal_id is null;

  insert into absensi (tenant_id, siswa_id, kelas_id, tanggal, status, catatan, dicatat_oleh)
  select v_tenant, (x->>'siswa_id')::uuid, p_kelas_id, p_tanggal,
         (x->>'status')::status_absen, nullif(x->>'catatan', ''), auth.uid()
  from jsonb_array_elements(p_data) x
  where exists (select 1 from kelas_siswa ks
                where ks.kelas_id = p_kelas_id and ks.siswa_id = (x->>'siswa_id')::uuid);
  get diagnostics n = row_count;
  return n;
end $$;

-- Nilai satu kelas untuk satu mapel dan satu jenis. p_data: [{"siswa_id","skor"}]
-- Skor kosong = tidak disimpan (nilai lama untuk jenis itu dihapus).
create or replace function simpan_nilai_kelas(p_kelas_id uuid, p_mapel_id uuid, p_jenis text, p_data jsonb)
returns integer language plpgsql as $$
declare v_tenant uuid; v_ta uuid; n integer;
begin
  select tenant_id, tahun_ajaran_id into v_tenant, v_ta from kelas where id = p_kelas_id;
  if v_tenant is null then raise exception 'Kelas tidak ditemukan'; end if;

  delete from nilai nl using kelas_siswa ks
   where ks.kelas_id = p_kelas_id and nl.siswa_id = ks.siswa_id
     and nl.mapel_id = p_mapel_id and nl.jenis = p_jenis
     and nl.tahun_ajaran_id is not distinct from v_ta;

  insert into nilai (tenant_id, siswa_id, mapel_id, tahun_ajaran_id, jenis, skor, guru_id)
  select v_tenant, (x->>'siswa_id')::uuid, p_mapel_id, v_ta, p_jenis, (x->>'skor')::numeric,
         (select g.id from guru g where g.user_id = auth.uid() and g.tenant_id = v_tenant limit 1)
  from jsonb_array_elements(p_data) x
  where nullif(x->>'skor', '') is not null
    and exists (select 1 from kelas_siswa ks
                where ks.kelas_id = p_kelas_id and ks.siswa_id = (x->>'siswa_id')::uuid);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function simpan_absensi_harian(uuid, date, jsonb) from public, anon;
revoke all on function simpan_nilai_kelas(uuid, uuid, text, jsonb) from public, anon;
grant execute on function simpan_absensi_harian(uuid, date, jsonb) to authenticated, service_role;
grant execute on function simpan_nilai_kelas(uuid, uuid, text, jsonb) to authenticated, service_role;
