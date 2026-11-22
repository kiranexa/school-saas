# Progress

Terakhir diperbarui: 2026-11-22

## Selesai
- [x] Skema multi-tenant + RLS per peran (001), wali + audit log + `create_school()` (002)
- [x] Pengamanan dan fitur operasional (003): admin tidak bisa memberi peran owner, guru hanya menulis nilai/absensi kelas yang diajar, satu tahun ajaran aktif, penempatan siswa unik per tahun ajaran dan tidak lintas sekolah, status tagihan otomatis, simpan massal absensi dan nilai
- [x] Migrasi 004: perbaikan akses anon pada `guru_boleh_siswa` (anon membaca nilai/absensi sebelumnya error, bukan kosong)
- [x] Database online, sekolah pertama, repo GitHub, dokumentasi, skill proyek
- [x] Frontend: landing, login, portal siswa (nilai, absensi, tagihan)
- [x] Halaman admin: Siswa, Guru, Kelas (+ penempatan siswa), Mapel, Jadwal, Tahun ajaran, Absensi harian, Input nilai, Tagihan, Pembayaran
- [x] Tes Playwright (E2E + isolasi RLS + keamanan peran): 38 tes di 9 file `e2e/specs/` (semua hijau di staging setelah 003 dan 004)

## Berikutnya (urut)
- [ ] Pembuatan akun siswa/guru dari `/admin` (Edge Function memakai secret key di server)
- [ ] Portal wali (`/wali`): data anak, absensi, nilai, tagihan
- [ ] Konten landing: kelola pengumuman, galeri, halaman dari `/admin`
- [ ] Rapor (rekap nilai per siswa) dan cetak PDF
- [ ] Absensi per jam pelajaran (berdasarkan jadwal)
- [ ] Filter dropdown kelas untuk guru (hanya kelas yang diajar)
- [ ] Paging untuk daftar > 200 baris
- [ ] Deploy Cloudflare Pages + wildcard domain
- [ ] E2E di GitHub Actions (isi 4 secret staging, aktifkan pemicu push)
- [ ] Migrasi frontend ke React + TypeScript

## Hutang teknis
Lihat bagian terakhir `docs/01-database.md`.

## Log
- 2026-11-21: skema 001-002, frontend dasar, CRUD siswa, dokumentasi, Playwright (16 tes hijau)
- 2026-11-22: migrasi 003, halaman admin lengkap, tes tambahan
- 2026-11-22: tes menemukan cacat di 003 (anon error saat baca nilai/absensi); diperbaiki di migrasi 004
