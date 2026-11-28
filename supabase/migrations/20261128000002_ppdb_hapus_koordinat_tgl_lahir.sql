-- =====================================================================
-- PPDB Data Lengkap: hapus koordinat, ubah tahun_lahir -> tanggal_lahir
-- Idempotent: cek dulu apakah kolom lama masih ada
-- =====================================================================

-- 1. Drop koordinat_lat_lng column (if exists)
alter table public.pendaftaran_data_lengkap drop column if exists koordinat_lat_lng;

-- 2. Rename ayah_tahun_lahir -> ayah_tanggal_lahir (smallint -> date)
-- Only if old column still exists
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'pendaftaran_data_lengkap' and column_name = 'ayah_tahun_lahir') then
    alter table public.pendaftaran_data_lengkap rename column ayah_tahun_lahir to ayah_tanggal_lahir;
    alter table public.pendaftaran_data_lengkap alter column ayah_tanggal_lahir type date using (make_date(ayah_tanggal_lahir, 1, 1));
  end if;
end $$;

-- 3. Rename ibu_tahun_lahir -> ibu_tanggal_lahir (smallint -> date)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'pendaftaran_data_lengkap' and column_name = 'ibu_tahun_lahir') then
    alter table public.pendaftaran_data_lengkap rename column ibu_tahun_lahir to ibu_tanggal_lahir;
    alter table public.pendaftaran_data_lengkap alter column ibu_tanggal_lahir type date using (make_date(ibu_tanggal_lahir, 1, 1));
  end if;
end $$;

-- 4. Update simpan_data_lengkap_ppdb function: remove koordinat, change ayah/ibu tahun_lahir to date
create or replace function public.simpan_data_lengkap_ppdb(p_nomor_registrasi text, p_pin_akses text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k record; r public.pendaftaran_siswa;
  v jsonb := '{}'::jsonb;
  v_ok text[] := array['pernyataan_benar','jalur_pendaftaran','nama_panggilan','nisn','nik_siswa','no_kk','no_akta_lahir','tempat_lahir','agama','kewarganegaraan','anak_ke','jumlah_saudara','status_keluarga','kebutuhan_khusus','no_hp_siswa','alamat_kk','domisili_sama_kk','alamat_domisili','status_tinggal','jarak_sekolah_km','tinggi_badan','berat_badan','golongan_darah','riwayat_penyakit','alergi','nama_sekolah_asal','npsn_sekolah_asal','status_sekolah_asal','tahun_lulus','no_ijazah_skl','rata_rata_rapor','ayah_nama','ayah_nik','ayah_status_hidup','ayah_tanggal_lahir','ayah_pendidikan','ayah_pekerjaan','ayah_penghasilan','ayah_no_hp','ibu_nama','ibu_nik','ibu_status_hidup','ibu_tanggal_lahir','ibu_pendidikan','ibu_pekerjaan','ibu_penghasilan','ibu_no_hp','ortu_sama_kk','alamat_ayah','ibu_sama_ayah','alamat_ibu','wali_nama','wali_hubungan','wali_no_hp','wali_pekerjaan'];
  v_asing text;
  v_kk jsonb; v_dom jsonb; v_ayah jsonb; v_ibu jsonb;
  v_dom_sama boolean; v_ortu_sama boolean; v_ibu_sama boolean;
  v_tahun integer := extract(year from (now() at time zone 'Asia/Jakarta'))::integer;
  v_dibuat timestamptz;
begin
  select * into k from public.ppdb_cek_kredensial(p_nomor_registrasi, p_pin_akses);
  if k.o_id is null then return jsonb_build_object('ok', false, 'pesan', k.o_pesan); end if;

  select * into r from public.pendaftaran_siswa where id = k.o_id;
  if r.status = 'ditolak' then raise exception 'Pendaftaran ini ditolak. Data tidak dapat diubah'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Data tidak valid'; end if;
  if octet_length(p_data::text) > 20000 then raise exception 'Data terlalu besar'; end if;
  select string_agg(x, ', ') into v_asing from jsonb_object_keys(p_data) x where x <> all(v_ok);
  if v_asing is not null then raise exception 'Isian tidak dikenal: %', v_asing; end if;
  if not public.ppdb_v_bool(p_data, 'pernyataan_benar', false) then
    raise exception 'Pernyataan kebenaran data wajib disetujui';
  end if;

  v := v || jsonb_build_object('jalur_pendaftaran', ppdb_v_pilih(p_data,'jalur_pendaftaran','Jalur pendaftaran',true,array['reguler','prestasi','afirmasi','perpindahan_tugas','zonasi']::text[],null));
  v := v || jsonb_build_object('nama_panggilan', ppdb_v_teks(p_data,'nama_panggilan','Nama panggilan',false,50));
  v := v || jsonb_build_object('nisn', ppdb_v_digits(p_data,'nisn','NISN',true,10));
  v := v || jsonb_build_object('nik_siswa', ppdb_v_digits(p_data,'nik_siswa','NIK siswa',true,16));
  v := v || jsonb_build_object('no_kk', ppdb_v_digits(p_data,'no_kk','Nomor Kartu Keluarga',true,16));
  v := v || jsonb_build_object('no_akta_lahir', ppdb_v_teks(p_data,'no_akta_lahir','Nomor akta lahir',true,50));
  v := v || jsonb_build_object('tempat_lahir', ppdb_v_teks(p_data,'tempat_lahir','Tempat lahir',true,100));
  v := v || jsonb_build_object('agama', ppdb_v_pilih(p_data,'agama','Agama',true,array['Islam','Kristen','Katolik','Hindu','Buddha','Konghucu','Lainnya']::text[],null));
  v := v || jsonb_build_object('kewarganegaraan', ppdb_v_pilih(p_data,'kewarganegaraan','Kewarganegaraan',true,array['WNI','WNA']::text[],'WNI'));
  v := v || jsonb_build_object('anak_ke', ppdb_v_int(p_data,'anak_ke','Anak ke-',true,1,30));
  v := v || jsonb_build_object('jumlah_saudara', ppdb_v_int(p_data,'jumlah_saudara','Jumlah saudara kandung',true,0,30));
  v := v || jsonb_build_object('status_keluarga', ppdb_v_pilih(p_data,'status_keluarga','Status dalam keluarga',true,array['Anak kandung','Anak tiri','Anak angkat']::text[],null));
  v := v || jsonb_build_object('kebutuhan_khusus', ppdb_v_teks(p_data,'kebutuhan_khusus','Kebutuhan khusus (jika ada)',false,200));
  v := v || jsonb_build_object('no_hp_siswa', ppdb_v_hp(p_data,'no_hp_siswa','No. HP siswa',false));
  v := v || jsonb_build_object('domisili_sama_kk', ppdb_v_bool(p_data,'domisili_sama_kk',false));
  v := v || jsonb_build_object('status_tinggal', ppdb_v_pilih(p_data,'status_tinggal','Status tempat tinggal',true,array['Bersama orang tua','Bersama wali','Kos','Asrama','Panti asuhan','Lainnya']::text[],null));
  v := v || jsonb_build_object('jarak_sekolah_km', ppdb_v_num(p_data,'jarak_sekolah_km','Jarak ke sekolah (km)',false,0,500));
  v := v || jsonb_build_object('tinggi_badan', ppdb_v_int(p_data,'tinggi_badan','Tinggi badan (cm)',false,50,250));
  v := v || jsonb_build_object('berat_badan', ppdb_v_int(p_data,'berat_badan','Berat badan (kg)',false,10,250));
  v := v || jsonb_build_object('golongan_darah', ppdb_v_pilih(p_data,'golongan_darah','Golongan darah',false,array['A','B','AB','O','Tidak tahu']::text[],null));
  v := v || jsonb_build_object('riwayat_penyakit', ppdb_v_teks(p_data,'riwayat_penyakit','Riwayat penyakit',false,300));
  v := v || jsonb_build_object('alergi', ppdb_v_teks(p_data,'alergi','Alergi',false,300));
  v := v || jsonb_build_object('nama_sekolah_asal', ppdb_v_teks(p_data,'nama_sekolah_asal','Nama sekolah asal',true,150));
  v := v || jsonb_build_object('npsn_sekolah_asal', ppdb_v_digits(p_data,'npsn_sekolah_asal','NPSN sekolah asal',false,8));
  v := v || jsonb_build_object('status_sekolah_asal', ppdb_v_pilih(p_data,'status_sekolah_asal','Status sekolah asal',true,array['Negeri','Swasta']::text[],null));
  v := v || jsonb_build_object('tahun_lulus', ppdb_v_int(p_data,'tahun_lulus','Tahun lulus',true,2000,2100));
  v := v || jsonb_build_object('no_ijazah_skl', ppdb_v_teks(p_data,'no_ijazah_skl','Nomor ijazah / SKL',false,50));
  v := v || jsonb_build_object('rata_rata_rapor', ppdb_v_num(p_data,'rata_rata_rapor','Rata-rata nilai rapor',false,0,100));
  v := v || jsonb_build_object('ayah_nama', ppdb_v_teks(p_data,'ayah_nama','Nama Ayah',true,150));
  v := v || jsonb_build_object('ayah_nik', ppdb_v_digits(p_data,'ayah_nik','NIK Ayah',false,16));
  v := v || jsonb_build_object('ayah_status_hidup', ppdb_v_pilih(p_data,'ayah_status_hidup','Status Ayah',true,array['Hidup','Meninggal','Tidak diketahui']::text[],null));
  v := v || jsonb_build_object('ayah_tanggal_lahir', (p_data->>'ayah_tanggal_lahir')::date);
  v := v || jsonb_build_object('ayah_pendidikan', ppdb_v_pilih(p_data,'ayah_pendidikan','Pendidikan Ayah',false,array['Tidak sekolah','SD/sederajat','SMP/sederajat','SMA/sederajat','D1-D3','S1/D4','S2','S3']::text[],null));
  v := v || jsonb_build_object('ayah_pekerjaan', ppdb_v_teks(p_data,'ayah_pekerjaan','Pekerjaan Ayah',false,100));
  v := v || jsonb_build_object('ayah_penghasilan', ppdb_v_pilih(p_data,'ayah_penghasilan','Penghasilan Ayah',false,array['Tidak berpenghasilan','Di bawah Rp1.000.000','Rp1.000.000 - Rp2.999.999','Rp3.000.000 - Rp4.999.999','Rp5.000.000 - Rp9.999.999','Di atas Rp10.000.000']::text[],null));
  v := v || jsonb_build_object('ayah_no_hp', ppdb_v_hp(p_data,'ayah_no_hp','No. HP Ayah',false));
  v := v || jsonb_build_object('ibu_nama', ppdb_v_teks(p_data,'ibu_nama','Nama Ibu',true,150));
  v := v || jsonb_build_object('ibu_nik', ppdb_v_digits(p_data,'ibu_nik','NIK Ibu',false,16));
  v := v || jsonb_build_object('ibu_status_hidup', ppdb_v_pilih(p_data,'ibu_status_hidup','Status Ibu',true,array['Hidup','Meninggal','Tidak diketahui']::text[],null));
  v := v || jsonb_build_object('ibu_tanggal_lahir', (p_data->>'ibu_tanggal_lahir')::date);
  v := v || jsonb_build_object('ibu_pendidikan', ppdb_v_pilih(p_data,'ibu_pendidikan','Pendidikan Ibu',false,array['Tidak sekolah','SD/sederajat','SMP/sederajat','SMA/sederajat','D1-D3','S1/D4','S2','S3']::text[],null));
  v := v || jsonb_build_object('ibu_pekerjaan', ppdb_v_teks(p_data,'ibu_pekerjaan','Pekerjaan Ibu',false,100));
  v := v || jsonb_build_object('ibu_penghasilan', ppdb_v_pilih(p_data,'ibu_penghasilan','Penghasilan Ibu',false,array['Tidak berpenghasilan','Di bawah Rp1.000.000','Rp1.000.000 - Rp2.999.999','Rp3.000.000 - Rp4.999.999','Rp5.000.000 - Rp9.999.999','Di atas Rp10.000.000']::text[],null));
  v := v || jsonb_build_object('ibu_no_hp', ppdb_v_hp(p_data,'ibu_no_hp','No. HP Ibu',false));
  v := v || jsonb_build_object('ortu_sama_kk', ppdb_v_bool(p_data,'ortu_sama_kk',false));
  v := v || jsonb_build_object('ibu_sama_ayah', ppdb_v_bool(p_data,'ibu_sama_ayah',false));
  v := v || jsonb_build_object('wali_nama', ppdb_v_teks(p_data,'wali_nama','Nama wali',false,150));
  v := v || jsonb_build_object('wali_hubungan', ppdb_v_teks(p_data,'wali_hubungan','Hubungan dengan siswa',false,50));
  v := v || jsonb_build_object('wali_no_hp', ppdb_v_hp(p_data,'wali_no_hp','No. HP wali',false));
  v := v || jsonb_build_object('wali_pekerjaan', ppdb_v_teks(p_data,'wali_pekerjaan','Pekerjaan wali',false,100));

  if (v->>'tahun_lulus')::int > v_tahun + 1 then raise exception 'Tahun lulus tidak valid'; end if;

  v_dom_sama   := (v->>'domisili_sama_kk')::boolean;
  v_ortu_sama  := (v->>'ortu_sama_kk')::boolean;
  v_ibu_sama   := (v->>'ibu_sama_ayah')::boolean and not v_ortu_sama;
  v := v || jsonb_build_object('ibu_sama_ayah', v_ibu_sama);

  v_kk   := public.ppdb_v_alamat_cek(public.ppdb_v_alamat(p_data, 'alamat_kk', 'Alamat sesuai Kartu Keluarga', true), 'Alamat sesuai Kartu Keluarga');
  v_dom  := case when v_dom_sama then v_kk
                 else public.ppdb_v_alamat_cek(public.ppdb_v_alamat(p_data, 'alamat_domisili', 'Alamat domisili saat ini', true), 'Alamat domisili saat ini') end;
  v_ayah := case when v_ortu_sama then v_kk
                 else public.ppdb_v_alamat_cek(public.ppdb_v_alamat(p_data, 'alamat_ayah', 'Alamat Ayah', true), 'Alamat Ayah') end;
  v_ibu  := case when v_ortu_sama then v_kk when v_ibu_sama then v_ayah
                 else public.ppdb_v_alamat_cek(public.ppdb_v_alamat(p_data, 'alamat_ibu', 'Alamat Ibu', true), 'Alamat Ibu') end;
  v := v || jsonb_build_object(
    'alamat_kk', public.ppdb_alamat_gabung(v_kk),         'alamat_kk_komponen', v_kk,
    'alamat_domisili', public.ppdb_alamat_gabung(v_dom),  'alamat_domisili_komponen', v_dom,
    'alamat_ayah', public.ppdb_alamat_gabung(v_ayah),     'alamat_ayah_komponen', v_ayah,
    'alamat_ibu', public.ppdb_alamat_gabung(v_ibu),       'alamat_ibu_komponen', v_ibu);

  -- NISN dan NIK unik per sekolah (pendaftar yang ditolak tidak memblokir)
  perform pg_advisory_xact_lock(hashtext('ppdb:' || r.tenant_id::text));
  if exists (select 1 from public.pendaftaran_data_lengkap l join public.pendaftaran_siswa p on p.id = l.pendaftaran_id
              where l.tenant_id = r.tenant_id and p.status <> 'ditolak' and l.pendaftaran_id <> r.id and l.nisn = v->>'nisn') then
    raise exception 'NISN sudah terdaftar pada pendaftar lain di sekolah ini. Hubungi panitia jika ini keliru';
  end if;
  if exists (select 1 from public.pendaftaran_data_lengkap l join public.pendaftaran_siswa p on p.id = l.pendaftaran_id
              where l.tenant_id = r.tenant_id and p.status <> 'ditolak' and l.pendaftaran_id <> r.id and l.nik_siswa = v->>'nik_siswa') then
    raise exception 'NIK sudah terdaftar pada pendaftar lain di sekolah ini. Hubungi panitia jika ini keliru';
  end if;

  select dibuat_at into v_dibuat from public.pendaftaran_data_lengkap where pendaftaran_id = r.id;
  delete from public.pendaftaran_data_lengkap where pendaftaran_id = r.id;
  insert into public.pendaftaran_data_lengkap
    select * from jsonb_populate_record(null::public.pendaftaran_data_lengkap,
      v || jsonb_build_object('pendaftaran_id', r.id, 'tenant_id', r.tenant_id, 'pernyataan_benar', true,
                              'dibuat_at', coalesce(v_dibuat, now()), 'diisi_at', now()));

  update public.pendaftaran_siswa
     set tempat_lahir = v->>'tempat_lahir', asal_sekolah = v->>'nama_sekolah_asal',
         nik = v->>'nik_siswa', alamat = v->>'alamat_domisili'
   where id = r.id;
  if r.siswa_id is not null then
    update public.siswa set tempat_lahir = v->>'tempat_lahir', alamat = v->>'alamat_domisili'
     where id = r.siswa_id and tenant_id = r.tenant_id;
  end if;

  -- audit tanpa isi data (NIK dan data kesehatan tidak boleh masuk audit_log)
  insert into public.audit_log (tenant_id, user_id, tabel, aksi, row_id, data_baru)
  values (r.tenant_id, null, 'pendaftaran_data_lengkap', 'ISI_DATA_LENGKAP', r.id,
          jsonb_build_object('nomor_registrasi', r.nomor_registrasi, 'diperbarui', v_dibuat is not null));
  return jsonb_build_object('ok', true);
end $$;

-- 5. Update ambil_data_lengkap_ppdb: remove koordinat from exclusion list
create or replace function public.ambil_data_lengkap_ppdb(p_nomor_registrasi text, p_pin_akses text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k record; v jsonb;
begin
  select * into k from public.ppdb_cek_kredensial(p_nomor_registrasi, p_pin_akses);
  if k.o_id is null then return jsonb_build_object('ok', false, 'pesan', k.o_pesan); end if;
  select (to_jsonb(l) - 'pendaftaran_id' - 'tenant_id' - 'dibuat_at' - 'diisi_at'
          - 'alamat_kk' - 'alamat_kk_komponen' - 'alamat_domisili' - 'alamat_domisili_komponen'
          - 'alamat_ayah' - 'alamat_ayah_komponen' - 'alamat_ibu' - 'alamat_ibu_komponen')
         || jsonb_build_object('alamat_kk', l.alamat_kk_komponen, 'alamat_domisili', l.alamat_domisili_komponen,
                               'alamat_ayah', l.alamat_ayah_komponen, 'alamat_ibu', l.alamat_ibu_komponen)
    into v from public.pendaftaran_data_lengkap l where l.pendaftaran_id = k.o_id;
  return jsonb_build_object('ok', true, 'data', v);
end $$;

-- 6. Revoke old koord function, no new function needed
revoke all on function public.ppdb_v_koord(jsonb, text, text, boolean) from public, anon, authenticated;