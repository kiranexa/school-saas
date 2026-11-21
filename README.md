# School SaaS

Multi-tenant school management. Satu frontend, banyak sekolah (resolusi dari hostname).

## Jalankan lokal (database online Supabase)
```bash
cp .env.example .env     # isi URL & anon key dari Supabase > Project Settings > API
npm install
npm run dev
# buka http://school1.localhost:5173  (school1 = slug sekolah)
```

## Jalankan lokal penuh (database lokal via Docker)
```bash
npm i -g supabase
supabase init            # sekali saja; jangan timpa folder migrations
supabase start           # butuh Docker; catat API URL & anon key
supabase db reset        # menjalankan semua migrasi
```
Isi `.env` dengan URL `http://127.0.0.1:54321` dan anon key dari `supabase status`.
Buat user di Studio (http://127.0.0.1:54323) > Authentication, lalu jalankan `create_school(...)` di SQL Editor.

## Secrets GitHub (Settings > Secrets > Actions)
SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF
