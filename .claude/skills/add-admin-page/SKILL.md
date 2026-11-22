---
name: add-admin-page
description: Menambah halaman di /admin (CRUD biasa lewat konfigurasi crudPage, atau halaman dengan alur khusus seperti absensi). Gunakan saat membuat fitur admin baru.
---

# Menambah halaman admin

1. Baca `docs/03-frontend.md`, `src/crud.js`, dan contoh di `src/pages/master.js`.
2. CRUD biasa: tambah konfigurasi `crudPage` di `src/pages/master.js` (kolom, field, lookup, join dengan hint FK seperti `guru!wali_guru_id(nama)`), lalu daftarkan di `src/pages/index.js` dengan `who` dan `write` yang tepat.
3. Alur khusus (penyimpanan massal, penempatan): buat `src/pages/<nama>.js`, tulis lewat RPC database agar atomik dan RLS berlaku, pasang `data-state` loading/ready pada kontainer, dan cegah pemuatan tumpang tindih dengan penanda urutan seperti di `absensi.js`.
4. Aturan: semua query `.eq('tenant_id', t.id)`; insert menyertakan `tenant_id`; nilai dinamis lewat `esc()`; aksi tulis hanya jika `canWrite`; RLS adalah pengaman utama.
5. Tabel atau kebijakan baru: ikuti skill `db-migration` dan `rls-check`.
6. Tambah tes di `e2e/specs/` (skill `e2e-test`): alur normal, kasus gagal, dan akses per peran.
7. Jalankan `npm run build` dan `npm run test:e2e`; perbarui `PROGRESS.md` dan dokumen terkait.
