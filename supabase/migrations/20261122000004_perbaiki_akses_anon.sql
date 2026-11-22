-- =====================================================================
-- 004: perbaikan akses anon pada guru_boleh_siswa
--
-- Di 003, hak eksekusi guru_boleh_siswa dicabut dari anon. Namun kebijakan
-- nilai_guru dan absensi_guru ikut dievaluasi saat anon membaca tabel itu,
-- sehingga anon mendapat error "permission denied" alih-alih daftar kosong.
-- Fungsi ini aman untuk anon: tanpa login (auth.uid() null) hasilnya selalu false,
-- sama seperti is_member() yang juga bisa dipanggil anon.
-- =====================================================================
grant execute on function guru_boleh_siswa(uuid, uuid) to anon;
