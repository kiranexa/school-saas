# Proyek

## Tujuan
Platform SaaS manajemen sekolah. Banyak sekolah memakai satu sistem, data terisolasi per sekolah.

## Model multi-tenant
- 1 database, semua tabel punya `tenant_id`; isolasi dengan RLS.
- Sekolah dikenali dari hostname: `tenant_domains.domain` -> `tenant_id`.
- Dev: `*.localhost` memakai slug (`school1.localhost` -> `tenants.slug = 'school1'`).

## Peran (enum `member_role`)
owner, kepala_sekolah, admin, tu, guru, siswa, wali. Satu user bisa punya beberapa peran/sekolah lewat `tenant_members`.

## Area aplikasi
| Path | Siapa | Isi |
|---|---|---|
| `/` | publik | landing, pengumuman, galeri |
| `/admin` | staf | dashboard, CRUD data, absensi, nilai, keuangan |
| `/siswa` | siswa | nilai, absensi sendiri |
| (rencana) `/wali` | orang tua | data anak |

## Keputusan
- Supabase (Postgres + RLS) dipilih agar tidak perlu menulis backend CRUD dan isolasi data dijaga di database.
- Domain default `school1.<domain-saas>`; domain sekolah sendiri (`*.sch.id`) lewat CNAME. `sch.id` tidak bisa di-wildcard karena didaftarkan per sekolah (PANDI).
- GitHub Pages tidak dipakai: tidak mendukung wildcard subdomain. Pakai Vercel (wildcard domain didukung); Cloudflare Pages tidak mendukung wildcard domain kustom.
- Frontend sementara JS polos (prototipe). Pindah ke React + TypeScript saat fitur membesar; skema DB tidak berubah.

## Catatan hukum
Data siswa = data pribadi anak. Perhatikan UU PDP (UU No. 27 Tahun 2022); konsultasikan ke ahli hukum sebelum komersial.
