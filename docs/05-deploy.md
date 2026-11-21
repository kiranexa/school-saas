# Deploy

## Model domain
```
school1.<domain-saas>   -> satu aplikasi (wildcard DNS) -> baca hostname -> tenant
school1.sch.id (opsional, CNAME dari sekolah) -> aplikasi yang sama, dicatat di tenant_domains
```

## Langkah (belum dilakukan)
1. Beli domain SaaS (mis. `sekolahku.id`).
2. Deploy repo ke Cloudflare Pages (atau Vercel) dari GitHub; build `npm run build`, output `dist`.
3. Set env `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di hosting.
4. DNS wildcard `*.domain-saas` ke hosting.
5. SPA fallback: semua path menuju `index.html`.
6. Tambah domain baru di `tenant_domains` untuk tiap sekolah.
7. Domain kustom sekolah: Cloudflare for SaaS (Custom Hostnames) atau API domain Vercel.

## GitHub Actions
- `deploy-db.yml`: `supabase db push` saat `supabase/migrations/**` berubah, lalu snapshot `db/schema.sql`. Perlu 3 secrets (lihat `02-backend.md`).
- `ci.yml`: build check.

## Sebelum production
- Backup rutin di luar Supabase dan uji restore
- Region database dekat pengguna (Singapore)
- Tinjau hutang teknis di `01-database.md`
- Rate limit dan proteksi login
