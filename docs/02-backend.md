# Backend

Belum ada server sendiri. Backend = Supabase:
- **PostgreSQL**: data + RLS + fungsi + trigger
- **PostgREST**: endpoint REST otomatis per tabel (dipanggil lewat `supabase-js`)
- **Auth**: login email/password; user di `auth.users`

## Kunci API
- Publishable key (`sb_publishable_...`) -> frontend, aman asal RLS aktif.
- Secret key (`sb_secret_...`) / service_role -> hanya server (Edge Function, CI). Jangan di repo/frontend.

## Migrasi
- File di `supabase/migrations/`, nama `YYYYMMDDHHMMSS_deskripsi.sql`.
- 001 dan 002 sudah dijalankan manual di SQL Editor, lalu ditandai applied (`migration repair`).
- Migrasi baru: tulis file, `npx supabase db push --remote`, atau push ke `main` (workflow `deploy-db.yml`).
- Cek: `npx supabase migration list --remote` (Local dan Remote harus sama).

## Onboarding sekolah
Via SQL Editor: buat user di Authentication, lalu
```sql
select create_school('slug','Nama Sekolah','domain-saas.id',(select id from auth.users where email='...'),'SMA','NPSN');
```
Rencana: Edge Function agar self-service.

## Membuat akun siswa/guru (belum otomatis)
Saat ini manual: buat user di Authentication, isi `siswa.user_id` / `guru.user_id`, insert `tenant_members`. Rencana: Edge Function memakai secret key di server agar admin bisa membuat akun dari `/admin`.

## Rencana backend tambahan (bila perlu)
Payment gateway + webhook, notifikasi WhatsApp/email, rapor PDF, import/export Excel, sinkron Dapodik, job tagihan bulanan. Kandidat: Supabase Edge Functions atau layanan TypeScript terpisah.

## Rahasia
GitHub Actions secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
