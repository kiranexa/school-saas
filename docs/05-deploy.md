# Deploy

## Model domain
```
school1.<domain-saas>   -> satu aplikasi (wildcard DNS) -> baca hostname -> tenant
school1.sch.id (opsional, CNAME dari sekolah) -> aplikasi yang sama, dicatat di tenant_domains
```
Aplikasi mencari sekolah dari hostname lewat tabel `tenant_domains`, jadi domain APA PUN bisa dipakai selama barisnya ada di tabel itu.

## Pilihan hosting (diperiksa 22 Nov 2026 dari dokumentasi masing-masing)
| Layanan | Wildcard `*.domain` | Catatan |
|---|---|---|
| **Vercel** | didukung (tambah `*.domain` di Settings > Domains) | butuh nameserver Vercel, atau delegasi NS untuk `_acme-challenge` jika nameserver tidak bisa diubah. Paket Hobby memberi batas 50 domain kustom per proyek; cek juga ketentuan pemakaian komersial sebelum menjual layanan |
| Cloudflare Pages | TIDAK didukung untuk domain kustom | cocok untuk demo di `*.pages.dev`; untuk wildcard Cloudflare menyarankan Workers (static assets) dengan domain/route sendiri, belum kita uji |
| GitHub Pages | tidak | kurang cocok: tanpa wildcard, tanpa SPA fallback (muat ulang `/admin/siswa` menjadi 404), proyek berada di subpath `/nama-repo/` yang merusak router, repo privat butuh paket berbayar |

Keputusan: **Vercel** untuk demo dan produksi awal.

## Demo online (tanpa domain sendiri), sekitar 10 menit
1. Daftar di vercel.com, **Add New > Project**, impor repo GitHub. Framework Vite terdeteksi otomatis (build `npm run build`, output `dist`). File `vercel.json` di repo mengarahkan semua path ke `index.html` agar `/admin/siswa` tetap terbuka saat dimuat ulang.
2. Environment Variables (Production): `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (publishable key). Jangan memasukkan secret key.
3. Deploy. Catat alamatnya, mis. `school-saas.vercel.app`.
4. Daftarkan alamat itu ke sekolah (SQL Editor, project production):
```sql
insert into tenant_domains (tenant_id, domain, is_primary, verified)
select id, 'school-saas.vercel.app', false, true from tenants where slug = 'school1';
```
5. Buka alamat itu dari HP atau komputer mana pun. Tanpa langkah 4 yang tampil "Sekolah tidak ditemukan".
Setiap push ke `main` otomatis men-deploy ulang.

## Produksi dengan subdomain per sekolah
1. Beli domain SaaS (mis. `sekolahku.id`) dan tambahkan `*.sekolahku.id` di Settings > Domains proyek Vercel; ikuti petunjuk DNS Vercel (nameserver atau delegasi `_acme-challenge`).
2. Tiap sekolah baru: `create_school(...)` sudah membuat `school1.sekolahku.id` di `tenant_domains`; tidak ada langkah hosting tambahan.
3. Domain milik sekolah (`*.sch.id`): sekolah membuat CNAME ke Vercel, domain ditambahkan ke proyek (dashboard atau API domain Vercel), lalu dicatat di `tenant_domains`. Alur otomatisnya belum dibangun.

## GitHub Actions
- `deploy-db.yml`: `supabase db push` saat `supabase/migrations/**` berubah (butuh 3 secret: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`).
- `ci.yml`: cek build.
- `e2e.yml`: manual; butuh 4 secret staging.

## Sebelum production sungguhan
- Migrasi 003 dan 004 terpasang di production; 43 tes hijau di staging
- Backup rutin di luar Supabase dan uji restore
- Region database dekat pengguna (Singapore)
- Tinjau hutang teknis di `01-database.md`
- Rate limit dan proteksi login; kebijakan data pribadi siswa (UU PDP)
