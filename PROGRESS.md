# Progress

Terakhir diperbarui: 2026-11-28

## Status singkat
Fondasi lengkap dan teruji: database multi-tenant dengan RLS, 10 halaman admin, portal siswa, tema terang/gelap, dan tes otomatis. Fitur A (master jurusan, biaya, rekening + persetujuan kepala sekolah) dan fitur B (PPDB online: form publik, cek status, konfirmasi bayar, terima jadi siswa) sudah ada. Migrasi 007 memperbaiki B. Wizard Data Lengkap (tahap 1) menyusul di migrasi 008. Upload berkas (tahap 2) dan email otomatis (tahap 3, menunggu keputusan layanan email dan domain) belum ada. Berikutnya: tahap 2 dan 3, penempatan kelas (C), pembuatan akun dari admin, portal wali.

## Selesai (28 November 2026: Perbaikan PPDB, Profil Sekolah, Platform Admin, Owner Workflow)
- [x] **Profil sekolah** (`src/pages/master.js`): halaman "Profil" di grup "Manajemen" — edit nama, NPSN, jenjang, alamat, logo, tema, status. Sidebar nama sekolah update otomatis setelah simpan
- [x] **Platform admin** (`src/pages/platform.js`, migrasi `20261128000000_platform_admin.sql`): CRUD tenant (sekolah) di `/platform` — hanya platform owner/admin. Tambah/edit status (active/inactive/suspended), plan (free/basic/pro), tema JSON. Tidak ada tombol hapus. RLS di `tenants`, `tenant_domains`, `tenant_members` lindungi data antar sekolah
- [x] **Biaya & Rekening: owner bisa propose & approve** (migrasi `20261128000001_owner_ajukan.sql`, `src/pages/pengajuan.js`): owner masuk ke `PENGAJU` (bisa ajukan perubahan biaya/rekening) dan `PENYETUJU` (bisa setujui, termasuk pengajuan sendiri). Admin/TU tetap propose, kepala sekolah approve. Self-approval hanya untuk owner
- [x] **PPDB Data Lengkap disederhanakan** (migrasi `20261128000002_ppdb_hapus_koordinat_tgl_lahir.sql`, `src/pages/ppdbFields.js`, `src/pages/ppdbWizard.js`):
  - Hapus field `koordinat_lat_lng`
  - `ayah_tahun_lahir` → `ayah_tanggal_lahir` (date), `ibu_tahun_lahir` → `ibu_tanggal_lahir` (date) — gunakan date picker
  - Checkbox "sama dengan" (domisili sama KK, alamat ayah/ibu sama KK, ibu sama ayah): field alamat jadi **disabled** (bukan disembunyikan) + label "Alamat mengikuti yang dicentang di atas (tidak bisa diubah)"
  - Migrasi draf localStorage otomatis: `ayah_tahun_lahir` → `ayah_tanggal_lahir` (YYYY-01-01), `ibu_tahun_lahir` → `ibu_tanggal_lahir`, hapus `koordinat_lat_lng`
  - Validasi skip untuk alamat yang disabled

## Selesai (29 November 2026: PPDB tahap 1, Data Lengkap, migrasi 008)
Rancangan: pendaftaran awal tetap singkat (nama, kontak, email, jurusan); data lengkap diisi orang tua SESUDAH itu lewat wizard dengan nomor registrasi + PIN. Data sensitif dipisah ke tabel 1:1 supaya aksesnya bisa lebih ketat.
- [x] Tabel `pendaftaran_data_lengkap` (55 isian: identitas, keluarga, alamat, kesehatan, sekolah asal, ayah, ibu, wali). Hanya staf sekolahnya (owner, kepala_sekolah, admin, tu) yang bisa membaca; tidak ada tulis langsung
- [x] Alamat: form dan draf memakai komponen (jalan, RT/RW 000/000, kelurahan, kecamatan, kabupaten/kota, kode pos); di database disimpan sebagai teks gabungan (format "[jalan], RT/RW [rt_rw], Kel. [..], Kec. [..], [kab/kota], [kode_pos]") DAN komponen jsonb. Penggabungan dilakukan di server
- [x] Checkbox: domisili sama KK; alamat Ayah & Ibu sama KK; Ibu sama Ayah. Server yang menyalin alamatnya
- [x] Wizard 3 langkah + ringkasan (`src/pages/ppdbWizard.js`), validasi per langkah dengan scroll ke galat pertama, auto-save 500 ms ke localStorage, resume setelah reload, draf kedaluwarsa 7 hari, tombol Hapus draf, data tersimpan di server bisa dimuat di perangkat lain. PIN hanya di memori, tidak pernah ke localStorage
- [x] NISN dan NIK unik per sekolah (pendaftar yang ditolak tidak memblokir); kunci PIN yang sama dengan migrasi 007
- [x] `terima_pendaftar_ppdb` memakai tempat lahir dan alamat domisili dari data lengkap; simpan ulang setelah diterima ikut memperbarui `siswa`
- [x] Admin: tombol "Data lengkap" per pendaftar (panel detail + cetak). Audit mencatat pengisian TANPA isi data
- [x] Form awal: kolom "ulangi email" + peringatan email orang tua (bukan email anak); isian form tidak hilang saat galat atau pindah tab (sebelumnya semua terhapus)
- [x] Spesifikasi isian satu sumber (`src/pages/ppdbFields.js`); spec e2e `15-ppdb-data-lengkap` mengimpornya sehingga SQL dan form yang tidak sinkron akan ketahuan
- [x] Diuji: 121 pemeriksaan SQL (82 kasus dihasilkan dari spesifikasi form) + 72 uji lama terhadap DB dengan 008 + jalur upgrade dari data 007; 59 pemeriksaan wizard di browser dengan Supabase tiruan + 28 uji lama. Spec 15 (9 tes) belum dijalankan terhadap Supabase asli

## Selesai (28 November 2026: perbaikan PPDB, migrasi 007)
Hasil tinjauan atas fitur B (27 November). Temuan yang diperbaiki di `20261127100000_ppdb_perbaikan.sql`:
- [x] `terima_pendaftar_ppdb` selalu gagal (memakai kolom `jenis_kelamin`/`tanggal_lahir`, padahal `siswa.jk`/`tgl_lahir`; kolom `audit_log` juga salah). Sekarang benar, baris dikunci, NIS ganda diberi pesan jelas
- [x] Biaya berasal dari master `komponen_biaya` (persetujuan kepala sekolah) dan DISALIN ke pendaftar (`rincian_biaya`, `total_biaya`). `gelombang_pendaftaran.biaya_daftar` dibekukan (tidak dipakai)
- [x] Terima pendaftar yang belum bayar wajib konfirmasi lunas oleh admin (`p_konfirmasi_lunas`), tercatat di audit
- [x] Konfirmasi bayar ditolak jika sudah diterima/ditolak/lunas; tujuan bayar harus metode aktif milik sekolah itu
- [x] Pembatas: 200 pendaftaran per sekolah per jam, 5 per nomor HP per hari, duplikat nama + tanggal lahir ditolak, PIN terkunci 30 menit setelah 5 kali salah
- [x] Nomor registrasi (8 hex) dan PIN dari `gen_random_uuid()`; PIN dan penghitung percobaan tidak bisa dibaca staf (grant kolom); pendaftar tidak bisa ditulis langsung
- [x] Kolom `email_wali` (wajib di form). Pengiriman email belum ada
- [x] Spec `13-ppdb-publik` tidak pernah menjalankan tes (kata `test(` hilang); ditulis ulang. Spec `14-ppdb-keamanan` diperluas menjadi 9 tes
- [x] Diuji di Postgres lokal (72 pemeriksaan SQL, termasuk jalur upgrade dari 006) dan di browser dengan Supabase tiruan (28 pemeriksaan)

## Selesai (27 November 2026: Fitur B, PPDB Online, versi awal oleh Gemini)
- [x] Migrasi `20261127000000_ppdb_online.sql`: tabel `gelombang_pendaftaran` dan `pendaftaran_siswa` dengan isolasi RLS multi-tenant
- [x] Fungsi keamanan publik `SECURITY DEFINER`: `daftar_ppdb_publik`, `cek_status_ppdb`, dan `konfirmasi_bayar_ppdb` (publik tidak bisa `SELECT` tabel pendaftar secara langsung)
- [x] Fungsi verifikasi Admin/TU: `terima_pendaftar_ppdb` (otomatis membuat baris baru di tabel `siswa` + mencatat di `audit_log`) dan `tolak_pendaftar_ppdb`
- [x] Halaman publik `/daftar` (formulir pendaftaran siswa baru, cetak nomor registrasi & PIN akses, cek status kelulusan, dan konfirmasi pembayaran)
- [x] Halaman admin `/admin/gelombang` dan `/admin/pendaftar` di grup menu "Pendaftaran"
- [x] Spec e2e `13-ppdb-publik` dan `14-ppdb-keamanan` (lihat perbaikan di atas: 13 sebelumnya tidak menjalankan tes)

## Selesai (21-22 November 2026)
**Database (Supabase, migrasi 001 sampai 004)**
- [x] 001: 17 tabel multi-tenant + RLS per peran
- [x] 002: wali, audit log, `create_school()`
- [x] 003: admin tidak bisa memberi/mengubah peran owner; guru hanya menulis nilai/absensi kelas yang diajar atau diwalikan; satu tahun ajaran aktif; penempatan siswa unik per tahun ajaran dan tidak lintas sekolah; status tagihan otomatis; simpan massal absensi dan nilai (RPC)
- [x] 004: perbaikan akses anon pada `guru_boleh_siswa` (ditemukan oleh tes)
- [x] Staging: 001 sampai 004 terpasang, 38 tes hijau

**Fitur A: master pendaftaran (cabang `feat/master-pendaftaran`, migrasi 20261124100000)**
- [x] Tabel `jurusan` (staf CRUD langsung), `komponen_biaya`, `metode_pembayaran` (tidak bisa ditulis langsung oleh siapa pun), `pengajuan_perubahan`
- [x] Biaya dan rekening hanya berubah lewat `ajukan_perubahan` (admin/tu) -> `setujui_pengajuan` (kepala_sekolah, owner sebagai cadangan); penyetuju tidak boleh pengaju; satu pengajuan menunggu per data; data lama berlaku sampai disetujui; semua tercatat di `audit_log`
- [x] Halaman admin: Jurusan, Biaya, Rekening, Persetujuan (grup menu "Pendaftaran")
- [x] Diuji di Postgres lokal (62 pemeriksaan SQL) dan di browser dengan Supabase tiruan (33 pemeriksaan tampilan)
- [x] Spec e2e baru `11-master-pendaftaran` (6 tes) dan `12-pengajuan-keamanan` (7 tes); user uji baru `tuA`, `kepsekA`

**Aplikasi**
- [x] Landing, login, portal siswa (nilai, absensi, tagihan)
- [x] Admin: Siswa, Guru, Kelas (+ penempatan siswa), Mapel, Jadwal, Tahun ajaran, Absensi harian, Input nilai, Tagihan, Pembayaran
- [x] Desain "buku induk", mode terang/gelap (tersimpan, mengikuti perangkat), warna sekolah via `tenants.tema.accent`, menu geser di layar kecil (`docs/06-design.md`)
- [x] Mode pengembangan dari HP lewat `?sekolah=slug` (hanya `npm run dev`)

**Otomasi dan repo**
- [x] Playwright: 43 tes di 10 file (E2E, isolasi RLS, keamanan peran, tampilan), data uji dibuat dan dihapus otomatis di project staging
- [x] GitHub Actions: `ci.yml` (build), `deploy-db.yml` (migrasi), `e2e.yml` (manual)
- [x] Dokumentasi: `CLAUDE.md`, `docs/00` sampai `docs/06`, skill proyek di `.claude/skills/`

## Belum terverifikasi
- [ ] Migrasi 008 dan spec 15 belum dijalankan terhadap Supabase asli (PostgREST: grant kolom, embed 1:1 `pendaftaran_data_lengkap(diisi_at)` di daftar pendaftar, bentuk hasil rpc)
- [ ] Tampilan wizard di browser dan HP asli (tidak ada `styles.css` di lingkungan uji; stepper memakai gaya inline sementara)
- [ ] Hukum: data identitas, kesehatan, dan penghasilan anak/orang tua dikumpulkan dari publik (UU PDP 27/2022). Sekolah perlu kebijakan privasi, masa retensi, dan siapa yang boleh melihat. Belum ada kebijakan retensi/penghapusan di sistem
- [ ] Migrasi 007 dan semua spec baru (11 sampai 14) belum dijalankan terhadap Supabase asli. Butuh project Supabase uji TERPISAH: `.env.e2e` saat ini menunjuk ke project yang sama dengan production
- [ ] Perlindungan spam hanya di database (pembatas per sekolah/HP). Belum ada captcha (Cloudflare Turnstile butuh verifikasi di Edge Function)
- [ ] Fitur A di staging: terapkan migrasi 20261124100000, jalankan `npm run test:e2e` (13 tes baru di spec 11 dan 12 belum pernah dijalankan terhadap Supabase asli)
- [ ] Tampilan halaman Biaya/Rekening/Persetujuan di browser asli (textarea belum punya gaya khusus di `styles.css`; daftar `.rincian` memakai gaya bawaan)
- [ ] 5 tes tampilan baru (`10-tampilan`) dan tampilan di browser asli: belum dijalankan setelah redesain
- [ ] Production: pastikan 003 dan 004 sudah terpasang (`npx supabase migration list --remote` harus menampilkan empat versi)
- [ ] Workflow `deploy-db.yml` butuh 3 secret GitHub; belum dipastikan terisi

## Berikutnya (urut)
00. [ ] PPDB tahap 2: upload berkas (pas foto, KK, akta, rapor, berkas jalur) ke bucket PRIVAT dengan URL bertanda tangan, langkah 4 di wizard, unggah bukti bayar, tombol terima/tolak bukti. Butuh Edge Function (URL unggah sekali pakai, cek tipe dan ukuran file). PPDB tahap 3: email #1 (ringkasan, biaya, rekening, tautan unik) dan #2 (pembayaran terverifikasi) lewat tabel outbox + Edge Function + `payment_token`; butuh keputusan layanan email dan domain. Setelah email aktif, ubah `EMAIL_OTOMATIS_AKTIF` di `src/pages/ppdb.js`
0. [ ] Pendaftaran siswa baru: (B2) email otomatis ke orang tua (Edge Function + layanan email; butuh domain pengirim) dan captcha; (C) verifikasi pembayaran, tombol tutup pendaftaran, penempatan ke kelas (tambah `kelas.jurusan_id` dan `kelas.kapasitas`, tampil "X-IPA-1: 34/36")
1. [ ] Tinjau tampilan di browser dan HP, sesuaikan (warna, huruf, jarak); pastikan 43 tes hijau
2. [ ] Pembuatan akun siswa/guru dari `/admin` (Edge Function dengan secret key di server; usulan: password sementara yang ditampilkan sekali; keputusan belum final)
3. [ ] Portal wali (`/wali`): data anak, absensi, nilai, tagihan
4. [ ] Kelola konten landing (pengumuman, galeri, halaman) dan warna sekolah dari `/admin`
5. [ ] Rapor (rekap nilai per siswa) dan cetak PDF
6. [ ] Absensi per jam pelajaran (berdasarkan jadwal)
7. [ ] Filter dropdown kelas untuk guru; paging untuk daftar lebih dari 200 baris
8. [ ] Deploy ke Vercel + wildcard domain; E2E di GitHub Actions (4 secret staging)
9. [ ] Migrasi frontend ke React + TypeScript

## Hutang teknis
Lihat bagian terakhir `docs/01-database.md`. Yang terpenting: guru bisa membaca data semua siswa dan guru di sekolahnya; backup di luar Supabase belum ada.

## Melanjutkan di chat baru
Chat baru tidak mengingat percakapan ini. Tempel atau unggah: `CLAUDE.md`, `PROGRESS.md`, dan `docs/01-database.md` (tambah file spesifik yang akan diubah). Contoh pembuka:

> Saya melanjutkan proyek School SaaS (Supabase + Vite, multi-tenant). Konteksnya ada di CLAUDE.md dan PROGRESS.md terlampir. Tugas hari ini: [isi, mis. "buat pembuatan akun siswa dari /admin"]. Ikuti aturan di CLAUDE.md, tulis migrasi baru jika skema berubah, dan sertakan tes Playwright.

Alternatif: Claude Code di folder proyek membaca `CLAUDE.md` otomatis.

## Log
- 2026-11-21: skema 001-002, frontend dasar, CRUD siswa, dokumentasi, Playwright (16 tes hijau), push ke GitHub
- 2026-11-24: fitur A (master pendaftaran): migrasi 20261124100000, halaman Jurusan/Biaya/Rekening/Persetujuan, spec 11 dan 12
- 2026-11-22: migrasi 003-004, halaman admin lengkap, 38 tes hijau di staging, redesain dan mode terang/gelap, dukungan HP untuk dev

## Lingkungan
- Production: Supabase `rxmofaibjvzdcffbazny`. Staging: (isi ref project staging di sini). Keduanya memakai migrasi 001 sampai 004.
- Demo online: https://school-saas.vercel.app (Vercel, deploy otomatis dari `main`), terdaftar di `tenant_domains` untuk sekolah `school1`.
- Dev lokal: `npm run dev` (port 5173, pindah ke 5174 jika terpakai). Tes e2e memakai port 5199. Dari HP: `http://<IP>:PORT/?sekolah=school1`.
- Perintah database: `npx supabase ...` (bukan instalasi global); tambahkan `--remote` untuk menarget project production.

## Keputusan
- Hosting: Vercel (wildcard domain didukung). Cloudflare Pages dicoret (tanpa wildcard domain kustom); GitHub Pages tidak cocok.
- Pembuatan akun siswa/guru dari admin: usulan password sementara yang ditampilkan sekali (belum final; alternatifnya undangan email).
- `is_primary` di `tenant_domains` belum dibaca kode; pengalihan ke alamat utama belum dibangun.

- Master pendaftaran: persetujuan oleh `kepala_sekolah` (owner sebagai cadangan jika tidak ada akun kepsek); biaya satu daftar untuk semua pendaftar; pembayaran manual dulu (gateway ditunda); yang sudah bayar langsung diterima, kuota hanya jadi peringatan saat penempatan kelas; pindah jurusan ditunda.

## Belum dipastikan
- Akun login kepala sekolah di production: peran sudah ada di enum, akun belum tentu ada. Buat lewat dashboard Supabase sampai fitur akun dari admin selesai.
- Demo Vercel: halaman depan tampil, login admin, muat ulang `/admin/siswa` tidak 404, terbuka dari HP.
- 5 tes `10-tampilan` dan tampilan di browser asli.
- 2026-11-22: deploy demo ke Vercel, catatan hosting dan lingkungan
