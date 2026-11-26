# Progress

Terakhir diperbarui: 2026-11-27

## Status singkat
Fondasi lengkap dan teruji: database multi-tenant dengan RLS, 10 halaman admin, portal siswa, tema terang/gelap, dan tes otomatis. Cabang `feat/master-pendaftaran` menambah master jurusan, biaya, dan rekening dengan persetujuan kepala sekolah (fitur A, belum diuji di staging). Berikutnya: form pendaftaran publik + email (B), verifikasi bayar + penempatan kelas (C), pembuatan akun dari admin, portal wali.

## Selesai (27 November 2026 — Fitur B: PPDB Online)
- [x] Migrasi `20261127000000_ppdb_online.sql`: tabel `gelombang_pendaftaran` dan `pendaftaran_siswa` dengan isolasi RLS multi-tenant
- [x] Fungsi keamanan publik `SECURITY DEFINER`: `daftar_ppdb_publik`, `cek_status_ppdb`, dan `konfirmasi_bayar_ppdb` (publik tidak bisa `SELECT` tabel pendaftar secara langsung)
- [x] Fungsi verifikasi Admin/TU: `terima_pendaftar_ppdb` (otomatis membuat baris baru di tabel `siswa` + mencatat di `audit_log`) dan `tolak_pendaftar_ppdb`
- [x] Halaman publik `/daftar` (formulir pendaftaran siswa baru, cetak nomor registrasi & PIN akses, cek status kelulusan, dan konfirmasi pembayaran)
- [x] Halaman admin `/admin/gelombang` dan `/admin/pendaftar` di grup menu "Pendaftaran"
- [x] Pengujian E2E Playwright baru: `13-ppdb-publik.spec.js` dan `14-ppdb-keamanan.spec.js`

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
- [ ] Fitur A di staging: terapkan migrasi 20261124100000, jalankan `npm run test:e2e` (13 tes baru di spec 11 dan 12 belum pernah dijalankan terhadap Supabase asli)
- [ ] Tampilan halaman Biaya/Rekening/Persetujuan di browser asli (textarea belum punya gaya khusus di `styles.css`; daftar `.rincian` memakai gaya bawaan)
- [ ] 5 tes tampilan baru (`10-tampilan`) dan tampilan di browser asli: belum dijalankan setelah redesain
- [ ] Production: pastikan 003 dan 004 sudah terpasang (`npx supabase migration list --remote` harus menampilkan empat versi)
- [ ] Workflow `deploy-db.yml` butuh 3 secret GitHub; belum dipastikan terisi

## Berikutnya (urut)
0. [ ] Pendaftaran siswa baru: (B) form publik `/daftar`, email otomatis (Edge Function + layanan email), form konfirmasi bayar, salin rincian biaya ke data pendaftar saat mendaftar; (C) verifikasi pembayaran, tombol tutup pendaftaran, penempatan ke kelas (tambah `kelas.jurusan_id` dan `kelas.kapasitas`, tampil "X-IPA-1: 34/36")
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
