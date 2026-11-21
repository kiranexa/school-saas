---
name: e2e-test
description: Menambah atau memperbaiki tes Playwright (E2E dan isolasi RLS) untuk fitur baru atau perubahan policy. Gunakan setiap selesai membuat halaman atau mengubah RLS.
---

# Menulis tes E2E

1. Baca `docs/04-testing.md`, `e2e/seed.js`, dan satu spec yang mirip di `e2e/specs/`.
2. Butuh data baru? Tambahkan di `seed()` (`e2e/seed.js`), tetap dengan slug `e2e-*`, dan pastikan `cleanup()` tetap bisa menghapusnya.
3. Selector: pakai `getByRole`/`getByText`; jangan bergantung pada urutan DOM.
4. Fitur baru: satu spec untuk alur normal + satu untuk kasus gagal (validasi, duplikat, akses ditolak).
5. Perubahan RLS: tambah kasus di `04-isolasi-rls.spec.js` untuk tiap peran dan lintas sekolah.
6. Jalankan `npm run test:e2e`; jangan menyatakan selesai sebelum hijau.
7. Perbarui tabel cakupan di `docs/04-testing.md` dan `PROGRESS.md`.
