# Progress

Terakhir diperbarui: 2026-11-21

## Selesai
- [x] Skema multi-tenant + RLS per peran (migrasi 001)
- [x] Wali, audit log, `create_school()` (migrasi 002)
- [x] Database online (Supabase), migrasi tersinkron (`migration list --remote`)
- [x] Sekolah pertama `school1` + akun owner
- [x] Frontend dasar: landing, login, `/admin`, `/siswa`
- [x] CRUD siswa di `/admin/siswa` (jalan; sudah menyimpan siswa baru)
- [x] Repo di GitHub; dokumentasi dan skill proyek

## Berikutnya (urut)
- [ ] CRUD guru
- [ ] CRUD kelas (+ wali kelas dari guru)
- [ ] Penempatan siswa ke kelas
- [ ] CRUD mata pelajaran dan jadwal
- [ ] Absensi dan input nilai (guru)
- [ ] Tagihan dan pembayaran SPP
- [ ] Pembuatan akun siswa/guru dari `/admin` (Edge Function)
- [ ] Portal wali
- [ ] Deploy Cloudflare Pages + wildcard domain
- [ ] Tes otomatis (pgTAP, Vitest, Playwright)
- [ ] Migrasi frontend ke React + TypeScript

## Hutang teknis
Lihat bagian terakhir `docs/01-database.md`.

## Log
- 2026-11-21: skema 001-002, frontend dasar, CRUD siswa, dokumentasi
