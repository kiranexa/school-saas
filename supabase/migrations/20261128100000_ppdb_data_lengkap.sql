-- =====================================================================
-- 008: data lengkap calon siswa (wizard PPDB, tahap 1)
--   - tabel pendaftaran_data_lengkap (1:1 dengan pendaftaran_siswa) untuk data sensitif:
--     identitas, kesehatan, sekolah asal, orang tua/wali. Hanya staf sekolahnya yang bisa membaca
--   - alamat disimpan sebagai teks gabungan (tampil/cetak) + komponen jsonb (filter/zonasi), digabung di SERVER
--   - simpan_data_lengkap_ppdb / ambil_data_lengkap_ppdb: dipanggil orang tua dengan nomor registrasi + PIN
--     (kunci percobaan PIN yang sama dengan migrasi 007). Berkas upload dan email: tahap berikutnya
--   - cek_status_ppdb menambah data_lengkap_terisi; terima_pendaftar_ppdb memakai tempat lahir dan alamat domisili
-- File ini DIHASILKAN dari spesifikasi bersama src/pages/ppdbFields.js (kolom dan validasi harus sama).
-- Jalankan SETELAH 001-007.
-- =====================================================================

create table public.pendaftaran_data_lengkap (
  pendaftaran_id uuid primary key references public.pendaftaran_siswa(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  jalur_pendaftaran text,
  nama_panggilan text,
  nisn text,
  nik_siswa text,
  no_kk text,
  no_akta_lahir text,
  tempat_lahir text,
  agama text,
  kewarganegaraan text,
  anak_ke smallint,
  jumlah_saudara smallint,
  status_keluarga text,
  kebutuhan_khusus text,
  no_hp_siswa text,
  alamat_kk text,
  alamat_kk_komponen jsonb,
  domisili_sama_kk boolean not null default false,
  alamat_domisili text,
  alamat_domisili_komponen jsonb,
  status_tinggal text,
  jarak_sekolah_km numeric(6,2),
  koordinat_lat_lng text,
  tinggi_badan smallint,
  berat_badan smallint,
  golongan_darah text,
  riwayat_penyakit text,
  alergi text,
  nama_sekolah_asal text,
  npsn_sekolah_asal text,
  status_sekolah_asal text,
  tahun_lulus smallint,
  no_ijazah_skl text,
  rata_rata_rapor numeric(6,2),
  ayah_nama text,
  ayah_nik text,
  ayah_status_hidup text,
  ayah_tahun_lahir smallint,
  ayah_pendidikan text,
  ayah_pekerjaan text,
  ayah_penghasilan text,
  ayah_no_hp text,
  ibu_nama text,
  ibu_nik text,
  ibu_status_hidup text,
  ibu_tahun_lahir smallint,
  ibu_pendidikan text,
  ibu_pekerjaan text,
  ibu_penghasilan text,
  ibu_no_hp text,
  ortu_sama_kk boolean not null default false,
  alamat_ayah text,
  alamat_ayah_komponen jsonb,
  ibu_sama_ayah boolean not null default false,
  alamat_ibu text,
  alamat_ibu_komponen jsonb,
  wali_nama text,
  wali_hubungan text,
  wali_no_hp text,
  wali_pekerjaan text,
  pernyataan_benar boolean not null default false,
  dibuat_at  timestamptz not null default now(),
  diisi_at   timestamptz not null default now()
);
create index on public.pendaftaran_data_lengkap (tenant_id, nisn);
create index on public.pendaftaran_data_lengkap (tenant_id, nik_siswa);

alter table public.pendaftaran_data_lengkap enable row level security;
create policy lengkap_staff on public.pendaftaran_data_lengkap for select to authenticated
  using (public.is_member(tenant_id, array['owner','kepala_sekolah','admin','tu']::public.member_role[]));
revoke all on public.pendaftaran_data_lengkap from anon, authenticated;
grant select on public.pendaftaran_data_lengkap to authenticated;

-- ---------------------------------------------------------------------
-- FUNGSI VALIDASI (internal; hanya dipanggil fungsi di bawah)
-- ---------------------------------------------------------------------
create or replace function public.ppdb_v_teks(j jsonb, k text, lbl text, req boolean, mx int)
returns text language plpgsql immutable as $$
declare v text;
begin
  if jsonb_typeof(j->k) in ('object','array') then raise exception '% tidak valid', lbl; end if;
  v := nullif(btrim(coalesce(j->>k, '')), '');
  if v is null then
    if req then raise exception '% wajib diisi', lbl; end if;
    return null;
  end if;
  if char_length(v) > mx then raise exception '% maksimal % karakter', lbl, mx; end if;
  return v;
end $$;

create or replace function public.ppdb_v_digits(j jsonb, k text, lbl text, req boolean, len int)
returns text language plpgsql immutable as $$
declare v text := public.ppdb_v_teks(j, k, lbl, req, 64);
begin
  if v is not null and v !~ ('^[0-9]{' || len || '}$') then raise exception '% harus % angka', lbl, len; end if;
  return v;
end $$;

create or replace function public.ppdb_v_pilih(j jsonb, k text, lbl text, req boolean, vals text[], d text)
returns text language plpgsql immutable as $$
declare v text := public.ppdb_v_teks(j, k, lbl, false, 100);
begin
  if v is null then v := d; end if;
  if v is null then
    if req then raise exception '% wajib dipilih', lbl; end if;
    return null;
  end if;
  if not (v = any(vals)) then raise exception '% tidak valid', lbl; end if;
  return v;
end $$;

create or replace function public.ppdb_v_int(j jsonb, k text, lbl text, req boolean, lo int, hi int)
returns integer language plpgsql immutable as $$
declare v text := public.ppdb_v_teks(j, k, lbl, req, 12);
begin
  if v is null then return null; end if;
  if v !~ '^[0-9]{1,6}$' or v::int < lo or v::int > hi then raise exception '% harus bilangan bulat % sampai %', lbl, lo, hi; end if;
  return v::int;
end $$;

create or replace function public.ppdb_v_num(j jsonb, k text, lbl text, req boolean, lo numeric, hi numeric)
returns numeric language plpgsql immutable as $$
declare v text := public.ppdb_v_teks(j, k, lbl, req, 12);
begin
  if v is null then return null; end if;
  v := replace(v, ',', '.');
  if v !~ '^[0-9]{1,5}(\.[0-9]{1,2})?$' or v::numeric < lo or v::numeric > hi then raise exception '% harus angka % sampai %', lbl, lo, hi; end if;
  return v::numeric;
end $$;

create or replace function public.ppdb_v_hp(j jsonb, k text, lbl text, req boolean)
returns text language plpgsql immutable as $$
declare v text := public.ppdb_v_teks(j, k, lbl, req, 30);
begin
  if v is null then return null; end if;
  v := regexp_replace(v, '[\s-]', '', 'g');
  if v !~ '^\+?[0-9]{8,15}$' then raise exception '% tidak valid (8 sampai 15 angka)', lbl; end if;
  return v;
end $$;

create or replace function public.ppdb_v_koord(j jsonb, k text, lbl text, req boolean)
returns text language plpgsql immutable as $$
declare v text := public.ppdb_v_teks(j, k, lbl, req, 40);
begin
  if v is null then return null; end if;
  v := regexp_replace(v, '\s', '', 'g');
  if v !~ '^-?[0-9]{1,2}(\.[0-9]+)?,-?[0-9]{1,3}(\.[0-9]+)?$' then raise exception '% tidak valid (contoh -6.2, 106.8)', lbl; end if;
  return v;
end $$;

create or replace function public.ppdb_v_bool(j jsonb, k text, d boolean)
returns boolean language plpgsql immutable as $$
begin
  if j->k is null or jsonb_typeof(j->k) = 'null' then return d; end if;
  if jsonb_typeof(j->k) <> 'boolean' then raise exception '% harus true atau false', k; end if;
  return (j->k)::text::boolean;
end $$;

-- alamat: {jalan, rt_rw (000/000), kelurahan, kecamatan, kabupaten_kota, kode_pos (5 digit)}
create or replace function public.ppdb_v_alamat(j jsonb, k text, lbl text, req boolean)
returns jsonb language plpgsql immutable as $$
declare a jsonb := j->k;
begin
  if a is null or jsonb_typeof(a) = 'null' then
    if req then raise exception '% wajib diisi', lbl; end if;
    return null;
  end if;
  if jsonb_typeof(a) <> 'object' then raise exception '% tidak valid', lbl; end if;
  return jsonb_build_object(
    'jalan',          public.ppdb_v_teks(a, 'jalan', lbl || ': jalan', true, 200),
    'rt_rw',          (select case when t ~ '^[0-9]{3}/[0-9]{3}$' then t else null end
                         from (select public.ppdb_v_teks(a, 'rt_rw', lbl || ': RT/RW', true, 7) t) x),
    'kelurahan',      public.ppdb_v_teks(a, 'kelurahan', lbl || ': kelurahan', true, 100),
    'kecamatan',      public.ppdb_v_teks(a, 'kecamatan', lbl || ': kecamatan', true, 100),
    'kabupaten_kota', public.ppdb_v_teks(a, 'kabupaten_kota', lbl || ': kabupaten/kota', true, 100),
    'kode_pos',       public.ppdb_v_digits(a, 'kode_pos', lbl || ': kode pos', true, 5));
end $$;

create or replace function public.ppdb_v_alamat_cek(a jsonb, lbl text)
returns jsonb language plpgsql immutable as $$
begin
  if a ->> 'rt_rw' is null then raise exception '%: RT/RW harus berformat 000/000', lbl; end if;
  return a;
end $$;

-- "[jalan], RT/RW [rt_rw], Kel. [kelurahan], Kec. [kecamatan], [kabupaten_kota], [kode_pos]"
create or replace function public.ppdb_alamat_gabung(a jsonb)
returns text language sql immutable as $$
  select concat_ws(', ', nullif(a->>'jalan', ''), 'RT/RW ' || nullif(a->>'rt_rw', ''), 'Kel. ' || nullif(a->>'kelurahan', ''),
                   'Kec. ' || nullif(a->>'kecamatan', ''), nullif(a->>'kabupaten_kota', ''), nullif(a->>'kode_pos', ''));
$$;

-- ---------------------------------------------------------------------
-- SIMPAN DATA LENGKAP (orang tua; nomor registrasi + PIN)
-- ---------------------------------------------------------------------
create or replace function public.simpan_data_lengkap_ppdb(p_nomor_registrasi text, p_pin_akses text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k record; r public.pendaftaran_siswa;
  v jsonb := '{}'::jsonb;
  v_ok text[] := array['pernyataan_benar','jalur_pendaftaran','nama_panggilan','nisn','nik_siswa','no_kk','no_akta_lahir','tempat_lahir','agama','kewarganegaraan','anak_ke','jumlah_saudara','status_keluarga','kebutuhan_khusus','no_hp_siswa','alamat_kk','domisili_sama_kk','alamat_domisili','status_tinggal','jarak_sekolah_km','koordinat_lat_lng','tinggi_badan','berat_badan','golongan_darah','riwayat_penyakit','alergi','nama_sekolah_asal','npsn_sekolah_asal','status_sekolah_asal','tahun_lulus','no_ijazah_skl','rata_rata_rapor','ayah_nama','ayah_nik','ayah_status_hidup','ayah_tahun_lahir','ayah_pendidikan','ayah_pekerjaan','ayah_penghasilan','ayah_no_hp','ibu_nama','ibu_nik','ibu_status_hidup','ibu_tahun_lahir','ibu_pendidikan','ibu_pekerjaan','ibu_penghasilan','ibu_no_hp','ortu_sama_kk','alamat_ayah','ibu_sama_ayah','alamat_ibu','wali_nama','wali_hubungan','wali_no_hp','wali_pekerjaan'];
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
  v := v || jsonb_build_object('koordinat_lat_lng', ppdb_v_koord(p_data,'koordinat_lat_lng','Koordinat (lat, lng)',false));
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
  v := v || jsonb_build_object('ayah_tahun_lahir', ppdb_v_int(p_data,'ayah_tahun_lahir','Tahun lahir Ayah',false,1930,2015));
  v := v || jsonb_build_object('ayah_pendidikan', ppdb_v_pilih(p_data,'ayah_pendidikan','Pendidikan Ayah',false,array['Tidak sekolah','SD/sederajat','SMP/sederajat','SMA/sederajat','D1-D3','S1/D4','S2','S3']::text[],null));
  v := v || jsonb_build_object('ayah_pekerjaan', ppdb_v_teks(p_data,'ayah_pekerjaan','Pekerjaan Ayah',false,100));
  v := v || jsonb_build_object('ayah_penghasilan', ppdb_v_pilih(p_data,'ayah_penghasilan','Penghasilan Ayah',false,array['Tidak berpenghasilan','Di bawah Rp1.000.000','Rp1.000.000 - Rp2.999.999','Rp3.000.000 - Rp4.999.999','Rp5.000.000 - Rp9.999.999','Di atas Rp10.000.000']::text[],null));
  v := v || jsonb_build_object('ayah_no_hp', ppdb_v_hp(p_data,'ayah_no_hp','No. HP Ayah',false));
  v := v || jsonb_build_object('ibu_nama', ppdb_v_teks(p_data,'ibu_nama','Nama Ibu',true,150));
  v := v || jsonb_build_object('ibu_nik', ppdb_v_digits(p_data,'ibu_nik','NIK Ibu',false,16));
  v := v || jsonb_build_object('ibu_status_hidup', ppdb_v_pilih(p_data,'ibu_status_hidup','Status Ibu',true,array['Hidup','Meninggal','Tidak diketahui']::text[],null));
  v := v || jsonb_build_object('ibu_tahun_lahir', ppdb_v_int(p_data,'ibu_tahun_lahir','Tahun lahir Ibu',false,1930,2015));
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

-- ---------------------------------------------------------------------
-- AMBIL DATA TERSIMPAN (untuk melanjutkan di perangkat lain)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- cek_status_ppdb: tambah data_lengkap_terisi
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
           'rincian_biaya', p.rincian_biaya, 'total_biaya', p.total_biaya,
           'data_lengkap_terisi', exists (select 1 from public.pendaftaran_data_lengkap l where l.pendaftaran_id = p.id))
    into v
    from public.pendaftaran_siswa p
    join public.gelombang_pendaftaran g on g.id = p.gelombang_id
    join public.tenants t on t.id = p.tenant_id
    left join public.jurusan j on j.id = p.jurusan_id
   where p.id = k.o_id;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- terima_pendaftar_ppdb: pakai tempat lahir dan alamat domisili dari data lengkap bila ada
-- ---------------------------------------------------------------------
create or replace function public.terima_pendaftar_ppdb(
  p_pendaftaran_id uuid, p_nis text default null, p_catatan_admin text default null,
  p_konfirmasi_lunas boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; r public.pendaftaran_siswa; l public.pendaftaran_data_lengkap; v_siswa uuid;
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
  select * into l from public.pendaftaran_data_lengkap where pendaftaran_id = r.id;

  begin
    insert into public.siswa (tenant_id, nis, nama, jk, tempat_lahir, tgl_lahir, alamat, nama_wali, telepon_wali, status)
    values (r.tenant_id, v_nis, r.nama_lengkap, r.jenis_kelamin::public.jenis_kelamin,
            coalesce(l.tempat_lahir, r.tempat_lahir), r.tanggal_lahir, coalesce(l.alamat_domisili, r.alamat),
            r.nama_wali, r.no_hp_wali, 'aktif')
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
                             'status_bayar_sebelum', r.status_bayar, 'lunas_dikonfirmasi_admin', coalesce(p_konfirmasi_lunas, false),
                             'data_lengkap', l.pendaftaran_id is not null));
  return v_siswa;
end $$;

-- ---------------------------------------------------------------------
-- HAK EKSEKUSI
-- ---------------------------------------------------------------------
revoke all on function public.ppdb_v_teks(jsonb, text, text, boolean, int)                       from public, anon, authenticated;
revoke all on function public.ppdb_v_digits(jsonb, text, text, boolean, int)                     from public, anon, authenticated;
revoke all on function public.ppdb_v_pilih(jsonb, text, text, boolean, text[], text)             from public, anon, authenticated;
revoke all on function public.ppdb_v_int(jsonb, text, text, boolean, int, int)                   from public, anon, authenticated;
revoke all on function public.ppdb_v_num(jsonb, text, text, boolean, numeric, numeric)           from public, anon, authenticated;
revoke all on function public.ppdb_v_hp(jsonb, text, text, boolean)                              from public, anon, authenticated;
revoke all on function public.ppdb_v_koord(jsonb, text, text, boolean)                           from public, anon, authenticated;
revoke all on function public.ppdb_v_bool(jsonb, text, boolean)                                  from public, anon, authenticated;
revoke all on function public.ppdb_v_alamat(jsonb, text, text, boolean)                          from public, anon, authenticated;
revoke all on function public.ppdb_v_alamat_cek(jsonb, text)                                     from public, anon, authenticated;
revoke all on function public.ppdb_alamat_gabung(jsonb)                                          from public, anon, authenticated;

revoke all on function public.simpan_data_lengkap_ppdb(text, text, jsonb) from public;
revoke all on function public.ambil_data_lengkap_ppdb(text, text)         from public;
grant execute on function public.simpan_data_lengkap_ppdb(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.ambil_data_lengkap_ppdb(text, text)         to anon, authenticated, service_role;
