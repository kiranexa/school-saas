# School SaaS — konteks proyek untuk Claude

Baca file ini dulu di setiap sesi. Detail ada di `docs/`.

## Ringkas
SaaS manajemen sekolah multi-tenant. Satu frontend + satu database; tiap sekolah dikenali dari hostname.
- `school1.<domain>/` landing page, galeri, pengumuman
- `school1.<domain>/admin` staf (owner, kepala_sekolah, admin, tu, guru)
- `school1.<domain>/siswa` siswa aktif
- Dev lokal: `http://school1.localhost:5173`

## Stack
- DB + API + Auth: Supabase (PostgreSQL + RLS). Project ref: `rxmofaibjvzdcffbazny`
- Frontend: Vite + JavaScript (ES modules). Rencana: React + TypeScript
- CI/CD: GitHub Actions. Hosting rencana: Cloudflare Pages (wildcard subdomain)

## Aturan wajib
1. Skema berubah HANYA lewat file BARU di `supabase/migrations/` (`YYYYMMDDHHMMSS_nama.sql`). Jangan edit migrasi lama yang sudah dijalankan.
2. Tabel baru wajib: kolom `tenant_id`, `enable row level security`, policy, index `tenant_id`.
3. Jangan pernah memakai atau meng-commit service_role / secret key / password DB. Frontend hanya memakai publishable key (`VITE_SUPABASE_ANON_KEY`).
4. Query frontend selalu `.eq('tenant_id', t.id)`, dan tetap mengandalkan RLS sebagai pengaman utama.
5. Semua teks dinamis yang dimasukkan ke HTML harus lewat `esc()` (`src/ui.js`).
6. Siswa lulus/pindah: ubah `status`, jangan hapus (hapus akan cascade ke nilai, absensi, tagihan).
7. Bahasa UI: Indonesia.
8. Setelah selesai satu tugas: update `PROGRESS.md` dan catat prompt di `prompts/`.

## Perintah
```bash
npm run dev                                   # dev server (jangan hentikan untuk perintah lain, buka tab baru)
npm run build                                 # cek build
npx supabase migration list --remote          # status migrasi
npx supabase db push --remote                 # terapkan migrasi baru (tanpa --remote jika CLI sudah menarget project)
```
Jangan `npm i -g supabase` (gagal); selalu pakai `npx supabase`.

## Peta dokumen
- `docs/00-project.md` tujuan, peran, model multi-tenant, keputusan
- `docs/01-database.md` struktur tabel, enum, fungsi, matriks RLS
- `docs/02-backend.md` Supabase, auth, migrasi, onboarding sekolah
- `docs/03-frontend.md` struktur kode, routing, pola menambah halaman
- `docs/04-testing.md` checklist dan tes otomatis
- `docs/05-deploy.md` domain, hosting, GitHub Actions
- `PROGRESS.md` status dan langkah berikutnya
- `prompts/` log prompt per tanggal
- `.claude/skills/` panduan tugas berulang (migrasi, halaman admin, cek RLS)
