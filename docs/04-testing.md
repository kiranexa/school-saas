# Testing

Status: tes otomatis masih minim. Yang aktif: build check di CI. Sisanya checklist manual dan rencana.

## 1. Cek build (otomatis, CI)
`.github/workflows/ci.yml` menjalankan `npm ci` dan `npm run build` di setiap push dan pull request.

## 2. Tes RLS (manual, SQL Editor)
Jalankan sebagai admin, lalu sebagai anon.
```sql
insert into siswa (tenant_id, nama, nis)
select id, 'Siswa Tes', 'TEST01' from tenants where slug = 'school1';
select count(*) as admin_melihat from siswa;        -- harus >= 1

begin; set local role anon;
select count(*) as anon_melihat from siswa;         -- harus 0
select slug from tenants;                           -- harus tampil (publik)
rollback;

select tabel, aksi from audit_log order by id desc limit 3;   -- INSERT siswa tercatat
delete from siswa where nis = 'TEST01';
```
Cek tambahan:
```sql
select tablename from pg_tables where schemaname='public' and not rowsecurity;  -- harus kosong
select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';  -- 20
```

## 3. Checklist manual aplikasi
- [ ] `/` menampilkan nama sekolah, pengumuman, galeri
- [ ] `/admin` tanpa login -> form login; salah password -> pesan error
- [ ] Login owner -> dashboard menampilkan jumlah
- [ ] `/admin/siswa`: tambah, ubah, cari, hapus; NIS ganda -> pesan "NIS sudah dipakai"
- [ ] Setiap tambah/ubah/hapus tercatat di `audit_log`
- [ ] Login akun siswa di `/siswa`: hanya data sendiri
- [ ] Akun siswa membuka `/admin` -> "Akses ditolak"
- [ ] Akun guru di `/admin/siswa`: tombol tambah/ubah/hapus tidak ada
- [ ] Hostname sekolah lain tidak membuka data sekolah ini

## 4. Rencana tes otomatis
| Lapisan | Alat | Cakupan |
|---|---|---|
| Database | pgTAP lewat `npx supabase test db` (butuh Docker) | RLS per peran, unik, trigger audit |
| Unit | Vitest | fungsi murni (`esc`, pembersih input) |
| End-to-end | Playwright | login per peran, CRUD siswa, isolasi antar sekolah |
Prioritas: tes isolasi tenant (sekolah A tidak bisa membaca B) karena risikonya paling besar.
