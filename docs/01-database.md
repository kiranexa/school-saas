# Database

Sumber kebenaran: `supabase/migrations/`. Dokumen ini ringkasan; jika berbeda, migrasi yang benar.

## Enum
`member_role`, `status_aktif` (aktif/nonaktif/lulus/pindah/cuti), `status_absen` (hadir/izin/sakit/alpa), `status_bayar` (belum/sebagian/lunas), `jenis_kelamin` (L/P).

## Tabel (20)
| Kelompok | Tabel | Keterangan |
|---|---|---|
| Tenant | `tenants` | sekolah: slug, nama, npsn, jenjang, tema (jsonb), plan, status |
| | `tenant_domains` | domain -> tenant, `is_primary`, `verified` |
| | `tenant_members` | user (auth.users) + tenant + role |
| Akademik | `tahun_ajaran` | nama, semester, aktif |
| | `guru` | nip, nama, kontak, status, `user_id` |
| | `siswa` | nis (unik per tenant), nisn, nama, jk, tgl_lahir, wali, status, `user_id` |
| | `kelas` | nama, tingkat, tahun_ajaran, wali_guru |
| | `kelas_siswa` | siswa masuk kelas |
| | `mata_pelajaran` | kode, nama, kkm |
| | `jadwal` | kelas, mapel, guru, hari, jam, ruang |
| Operasional | `absensi` | siswa, tanggal, status; unik (siswa, tanggal, jadwal) |
| | `nilai` | siswa, mapel, jenis, skor 0-100 |
| | `tagihan`, `pembayaran` | keuangan/SPP |
| Konten publik | `halaman`, `galeri`, `pengumuman` | landing page; `published` |
| Wali | `wali`, `siswa_wali` | orang tua dan relasi ke siswa |
| Audit | `audit_log` | riwayat INSERT/UPDATE/DELETE (diisi trigger) |

Semua tabel selain `tenants` punya `tenant_id` (FK ke `tenants`, `on delete cascade`).

## Fungsi
- `is_member(tenant, roles[])` cek peran user login di sekolah
- `my_siswa_id(tenant)` id siswa milik user login
- `my_anak_ids(tenant)` id siswa anak dari wali login
- `log_audit()` trigger audit pada: siswa, guru, nilai, absensi, tagihan, pembayaran, tenant_members
- `create_school(slug, nama, base_domain, owner_user_id, jenjang, npsn, custom_domain)` hanya `service_role`/SQL Editor

## Matriks RLS (ringkas)
| Peran | Akses |
|---|---|
| anon | baca `tenants` aktif, `tenant_domains`, konten `published` (halaman, galeri, pengumuman publik) |
| owner, kepala_sekolah, admin, tu | CRUD data akademik, wali, konten, keuangan |
| owner, kepala_sekolah, admin | baca `audit_log` |
| guru | baca siswa, kelas, jadwal, mapel; tulis absensi dan nilai |
| siswa | baca data dirinya: profil, absensi, nilai, tagihan; baca jadwal, mapel, pengumuman |
| wali | baca data anaknya: profil, absensi, nilai, tagihan |

## Catatan keamanan / hutang teknis
- Guru bisa menulis nilai/absensi untuk siswa mana pun di sekolahnya (belum dibatasi ke kelas yang diajar).
- Policy `members_admin` mengizinkan admin mengelola `tenant_members`, termasuk memberi peran owner. Pertimbangkan batasi hanya owner.
- Hapus siswa cascade ke nilai, absensi, tagihan; pakai status nonaktif.
- Belum ada unique per (kelas, tahun ajaran) untuk penempatan siswa.
- Belum ada backup terjadwal di luar Supabase.
