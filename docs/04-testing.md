# Testing

## Lapisan
| Lapisan | Alat | Status |
|---|---|---|
| Build check | GitHub Actions `ci.yml` | aktif |
| E2E + isolasi RLS + keamanan peran | Playwright (`e2e/`) | aktif (butuh project staging) |
| DB (pgTAP) | `supabase test db` | rencana |
| Unit | Vitest | rencana |

## E2E dengan Playwright
Tes berjalan di **project Supabase staging**, bukan production.
- `global-setup` membuat 2 sekolah uji (`e2e-a`, `e2e-b`), 7 user, dan data contoh memakai secret key; `global-teardown` menghapus semuanya.
- Frontend dijalankan di port 5199 dengan `--mode e2e` (membaca `.env.e2e`).
- Tes membuka `http://e2e-a.localhost:5199` dan `http://e2e-b.localhost:5199`.

### Data uji sekolah A
| Data | Keterangan |
|---|---|
| Kelas `X-A1` | diajar `guruA` (jadwal MTK); siswa `Siswa Uji A` (E2E001, akun `siswaA`) |
| Kelas `X-A2` | TIDAK diajar `guruA`; siswa `Siswa Lain A` (E2E002) |
| `Siswa Penempatan` (E2E003) | belum punya kelas |
| Tagihan SPP 100000 | untuk E2E001 |
| Master pendaftaran | biaya `Uang gedung` 5.000.000 (wajib) dan `Seragam` 750.000, rekening BCA, jurusan IPA (aktif) dan IPS (nonaktif); sekolah B punya satu dari masing-masing |
| Pengguna | `adminA` (owner), `staffA` (admin), `tuA` (tu), `kepsekA` (kepala_sekolah), `guruA`, `siswaA`; sekolah B: `adminB`, siswa `Siswa Sekolah B` |

### Cakupan
| File | Isi |
|---|---|
| `01-publik` | landing per hostname, sekolah tak dikenal, form login, password salah |
| `02-admin-siswa` | CRUD siswa, NIS duplikat, dashboard |
| `03-peran` | guru read-only, portal siswa hanya data sendiri, siswa/admin lintas sekolah ditolak |
| `04-isolasi-rls` | anon tidak bisa baca data privat, admin A tidak bisa baca/tulis sekolah B, siswa tidak bisa tulis nilai, `create_school` tertutup |
| `05-master-data` | CRUD guru, mapel, kelas, jadwal, tahun ajaran; guru wali kelas tidak bisa dihapus; satu tahun ajaran aktif |
| `06-penempatan-kelas` | tambah/keluarkan siswa dari kelas; ganda per tahun ajaran ditolak |
| `07-absensi-nilai` | guru simpan absensi/nilai kelasnya (tanpa duplikat), ditolak di kelas yang tidak diajar |
| `08-keuangan` | tagihan belum -> sebagian -> lunas otomatis; guru tanpa akses tagihan; tagihan di portal siswa |
| `11-master-pendaftaran` | admin mengajukan, kepsek menyetujui, TU mengajukan lalu membatalkan, tombol per peran, jurusan CRUD, guru tanpa menu Pendaftaran |
| `13-ppdb-publik` | alur layar PPDB: admin buka gelombang, orang tua daftar (rincian biaya dari master), konfirmasi bayar, admin terima jadi siswa; PIN salah tampil sebagai pesan |
| `14-ppdb-keamanan` | tabel pendaftar tertutup untuk anon dan tulis langsung, PIN tidak terbaca staf, validasi, biaya disalin dan tidak berubah, `biaya_daftar` beku, kunci PIN, batas per HP, metode lintas sekolah, terima/tolak per peran, audit tanpa PIN |
| `12-pengajuan-keamanan` | tidak ada peran yang bisa menulis biaya/rekening langsung; hanya admin/tu mengajukan; hanya kepsek/owner menyetujui, bukan pengaju sendiri; validasi input; data lama tetap berlaku; visibilitas anon dan lintas sekolah; audit |
| `09-keamanan` | admin tidak bisa memberi/mengubah owner; guru dibatasi ke kelasnya; penempatan lintas sekolah ditolak; fungsi simpan massal tertutup untuk anon |

### Setup sekali
1. Buat project Supabase staging; jalankan semua migrasi berurutan di SQL Editor (001, 002, 003, dan seterusnya).
2. `npm i -D @playwright/test dotenv` lalu `npx playwright install chromium`.
3. Salin `.env.e2e.example` ke `.env.e2e`, isi URL, publishable key, secret key, `E2E_PROJECT_REF` (project staging).

### Menjalankan
```bash
npm run test:e2e          # headless
npm run test:e2e:ui       # mode interaktif
npm run test:e2e:report   # laporan HTML
E2E_KEEP_DATA=1 npm run test:e2e   # tinggalkan data uji untuk debugging
```

### Aturan
- Fitur baru: tambah tes; perubahan RLS atau fungsi database: tambah kasus di `09-keamanan` atau `04-isolasi-rls`.
- Migrasi baru harus diterapkan ke staging sebelum menjalankan tes.
- Secret key hanya di `.env.e2e` dan GitHub Secrets.
- Data uji selalu berslug `e2e-*` dan email `e2e-*@example.com`.
- `workers: 1` karena berbagi satu database.
- Untuk menunggu halaman absensi/nilai/penempatan selesai memuat, gunakan atribut `data-state="ready"` pada `#page`, bukan `waitForTimeout`.

### CI
`.github/workflows/e2e.yml` (manual/`workflow_dispatch`) butuh secrets: `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SECRET_KEY`, `E2E_PROJECT_REF`.

## Cek manual yang masih berguna
Tampilan visual dan kenyamanan pemakaian.
```sql
select tablename from pg_tables where schemaname='public' and not rowsecurity;  -- harus kosong
```
