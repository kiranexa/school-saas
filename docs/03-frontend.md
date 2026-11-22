# Frontend

Vite + JavaScript (ES modules), tanpa framework. `npm run dev` -> `http://school1.localhost:5173`.

## Struktur
```
index.html            style global (variabel CSS, mode gelap otomatis)
src/supabase.js       klien Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
src/ui.js             esc(), layout()
src/crud.js           halaman CRUD generik berbasis konfigurasi
src/main.js           resolusi sekolah, login, router, dashboard, portal siswa
src/pages/index.js    daftar halaman admin: label, peran yang boleh membuka/menulis, render
src/pages/master.js   konfigurasi CRUD: guru, mapel, tahun ajaran, kelas, jadwal, tagihan, pembayaran
src/pages/siswa.js    CRUD siswa (versi awal, berdiri sendiri)
src/pages/kelasSiswa.js  penempatan siswa di kelas (/admin/kelas/<id>)
src/pages/absensi.js  absensi harian per kelas (RPC simpan_absensi_harian)
src/pages/nilai.js    input nilai per kelas, mapel, jenis (RPC simpan_nilai_kelas)
```

## Alur
1. `resolveTenant()` membaca hostname -> `tenants` (slug untuk `*.localhost`, `tenant_domains` untuk domain asli).
2. Path pertama menentukan area: `/` landing, `/admin`, `/siswa`.
3. `/admin` dan `/siswa` butuh login; peran dicek dari `tenant_members`.
4. Di `/admin`, path kedua memilih halaman dari `PAGES` (`/admin/guru`). Navigasi hanya menampilkan halaman yang boleh dibuka peran user.

## Menambah halaman CRUD biasa
1. Di `src/pages/master.js`, tambahkan `export const xPage = (el, t, w) => crudPage(el, t, w, { ... })`.
   - `table`, `order`, `search[]`, `columns[{label,get}]`, `fields[]`, `defaults`, `select` (untuk join; pakai hint FK, mis. `guru!wali_guru_id(nama)`).
   - field: `{name,label,type,required,options | lookup{table,select,label,filter},step,createOnly}`.
   - opsional: `actions[{label,href}]`, `dupMessage`, `deleteWarn`, `extra()`.
2. Daftarkan di `src/pages/index.js` dengan `who` (boleh membuka) dan `write` (boleh mengubah).
3. Tambahkan tes di `e2e/specs/`.

## Halaman dengan alur khusus
Absensi, nilai, dan penempatan siswa memakai halaman tersendiri. Pola penting:
- Penyimpanan massal lewat RPC agar atomik dan tetap diperiksa RLS.
- Atribut `data-state` (`loading`/`ready`) pada kontainer `#page` sebagai penanda untuk tes; pemuatan yang tumpang tindih diatur dengan penanda urutan agar hanya yang terbaru yang menggambar.

## Konvensi
- Teks UI bahasa Indonesia; semua nilai dinamis ke HTML lewat `esc()`.
- Query selalu `.eq('tenant_id', t.id)`; insert menyertakan `tenant_id`; RLS tetap pengaman utama.
- String kosong pada form menjadi `null`; kode error DB diterjemahkan ke pesan ramah.
- Tombol: `button` (utama), `.sec` (sekunder), `.danger` (hapus).
- Jangan simpan rahasia di frontend.

## Rencana
Pembuatan akun dari admin, portal wali, kelola konten landing, rapor/PDF, paging, React + TypeScript.
