# Frontend

Vite + JavaScript (ES modules), tanpa framework. `npm run dev` -> `http://school1.localhost:5173`.

## Struktur
```
index.html          style global (variabel CSS, mode gelap otomatis)
src/supabase.js     klien Supabase (env VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
src/ui.js           esc(), layout()
src/main.js         resolusi sekolah, login, router, dashboard, portal siswa
src/pages/siswa.js  CRUD siswa (contoh pola halaman)
```

## Alur
1. `resolveTenant()` membaca hostname -> `tenants` (slug untuk `*.localhost`, `tenant_domains` untuk domain asli).
2. Path pertama menentukan area: `/` landing, `/admin`, `/siswa`.
3. `/admin` dan `/siswa` butuh login; peran dicek dari `tenant_members`.
4. Di `/admin`, path kedua memilih halaman (`/admin/siswa`).

## Pola menambah halaman admin
1. Buat `src/pages/<nama>.js` mengekspor `namaPage(el, t, canWrite)` mengikuti `siswa.js`.
2. Impor di `main.js`, tambah tautan di `adminView`, dan cabang `if (sub === '<nama>')`.
3. Semua query: `.eq('tenant_id', t.id)`; insert menyertakan `tenant_id`.
4. Semua nilai dinamis ke HTML lewat `esc()`.
5. Form: ubah string kosong jadi `null`; tampilkan error DB dengan pesan ramah (mis. kode `23505` = duplikat).
6. Aksi tulis hanya tampil jika `canWrite`; RLS tetap pengaman utama.

## Konvensi
- Teks UI bahasa Indonesia; tanpa library tambahan kecuali perlu.
- Jangan simpan rahasia di frontend.
- Tombol: `button` (utama), `.sec` (sekunder), `.danger` (hapus).

## Rencana
CRUD guru, kelas, mapel, penempatan siswa, jadwal, absensi, nilai, tagihan; portal wali; paging; migrasi ke React + TypeScript.
