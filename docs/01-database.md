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
| Akademik | `tahun_ajaran` | nama, semester, aktif (maks. satu aktif per sekolah) |
| | `guru` | nip, nama, kontak, status, `user_id` |
| | `siswa` | nis (unik per tenant), nisn, nama, jk, tgl_lahir, wali, status, `user_id` |
| | `kelas` | nama, tingkat, tahun_ajaran, wali_guru |
| | `kelas_siswa` | penempatan siswa; satu siswa satu kelas per tahun ajaran |
| | `mata_pelajaran` | kode, nama, kkm |
| | `jadwal` | kelas, mapel, guru, hari, jam, ruang |
| Operasional | `absensi` | siswa, tanggal, status, `jadwal_id` (null = absensi harian) |
| | `nilai` | siswa, mapel, tahun_ajaran, jenis (teks bebas), skor 0-100 |
| | `tagihan`, `pembayaran` | keuangan; status tagihan dihitung otomatis dari pembayaran |
| Konten publik | `halaman`, `galeri`, `pengumuman` | landing page; `published` |
| Wali | `wali`, `siswa_wali` | orang tua dan relasi ke siswa |
| Audit | `audit_log` | riwayat INSERT/UPDATE/DELETE (diisi trigger) |

Semua tabel selain `tenants` punya `tenant_id` (FK ke `tenants`, `on delete cascade`).

## Master pendaftaran (migrasi 20261124100000)
| Tabel | Keterangan |
|---|---|
| `jurusan` | per tenant; `unique(tenant_id, nama)`; staf (owner, kepala_sekolah, admin, tu) CRUD langsung; anon baca yang `aktif` |
| `komponen_biaya` | nama, nominal, wajib, aktif, urutan. TIDAK ada izin tulis untuk klien; anon baca yang `aktif` |
| `metode_pembayaran` | jenis (transfer, virtual_account, ewallet, tunai), penyedia, nomor, atas_nama, instruksi, aktif. Sama: tulis hanya lewat persetujuan |
| `pengajuan_perubahan` | entitas, aksi (buat/ubah), `data` baru, `data_lama`, status (menunggu/disetujui/ditolak/dibatalkan), pengaju dan pemutus (id + email), catatan. Hanya staf sekolahnya yang bisa baca; tulis hanya lewat fungsi |

Aturan persetujuan (dijaga di database):
- `ajukan_perubahan(tenant, entitas, entitas_id, data, catatan)`: hanya admin/tu. `entitas_id` null = data baru. Data divalidasi dan dibakukan oleh `pj_normalisasi`. Menonaktifkan = mengubah `aktif`; tidak ada hapus.
- `setujui_pengajuan(id)` / `tolak_pengajuan(id, catatan)`: hanya kepala_sekolah atau owner (cadangan). Penyetuju tidak boleh pengaju (walau satu orang memegang dua peran). Persetujuan menolak jika data berlaku sudah berubah sejak diajukan.
- `batalkan_pengajuan(id)`: hanya pengaju, selama menunggu.
- Unique parsial `pengajuan_menunggu_uq`: satu pengajuan menunggu per data.
- Tabel live dicabut izin insert/update/delete untuk `anon` dan `authenticated`; fungsi berjalan `security definer` dengan pemeriksaan tenant dan peran sendiri.
- Saat pendaftaran (fitur B), rincian biaya HARUS disalin ke data pendaftar agar perubahan nominal berikutnya tidak mengubah tagihan lama.

## Fungsi dan trigger
| Nama | Fungsi |
|---|---|
| `is_member(tenant, roles[])` | cek peran user login |
| `my_siswa_id(tenant)`, `my_anak_ids(tenant)` | id siswa milik user / anak dari wali |
| `guru_boleh_siswa(tenant, siswa)` | true jika guru login mengajar (jadwal) atau menjadi wali kelas dari kelas siswa itu |
| `create_school(...)` | onboarding sekolah; hanya `service_role`/SQL Editor |
| `simpan_absensi_harian(kelas, tanggal, data)` | RPC atomik: ganti absensi harian satu kelas. Berjalan sebagai pemanggil (RLS berlaku). Tidak untuk anon |
| `simpan_nilai_kelas(kelas, mapel, jenis, data)` | RPC atomik: ganti nilai satu kelas untuk satu mapel dan jenis. Skor kosong = dihapus |
| trigger `log_audit` | siswa, guru, nilai, absensi, tagihan, pembayaran, tenant_members, jurusan, komponen_biaya, metode_pembayaran, pengajuan_perubahan |
| trigger `cek_kelas_siswa` | penempatan harus sekolah yang sama dan unik per tahun ajaran |
| trigger `refresh_tagihan_status` | belum / sebagian / lunas dari total pembayaran |

## Matriks RLS (ringkas)
| Peran | Akses |
|---|---|
| anon | baca `tenants` aktif, `tenant_domains`, konten `published` |
| owner | semua di sekolahnya, termasuk mengelola `tenant_members` (semua peran) |
| admin | CRUD data akademik, wali, konten, keuangan; kelola `tenant_members` kecuali peran owner |
| kepala_sekolah, tu | CRUD data akademik, wali, konten, keuangan |
| owner, kepala_sekolah, admin | baca `audit_log` |
| admin, tu | ajukan perubahan biaya dan rekening (tidak bisa menulis langsung) |
| kepala_sekolah (owner cadangan) | setujui/tolak pengajuan |
| guru | baca siswa, kelas, kelas_siswa, jadwal, mapel, guru, tahun_ajaran; tulis absensi dan nilai hanya untuk siswa di kelas yang diajar/diwalikan |
| siswa | baca data dirinya: profil, absensi, nilai, tagihan; baca jadwal, mapel, pengumuman |
| wali | baca data anaknya: profil, absensi, nilai, tagihan |

## Diselesaikan di migrasi 003
- Admin tidak lagi bisa memberi peran owner atau mengubah/menghapus owner.
- Guru tidak lagi bisa menulis nilai/absensi siswa di luar kelasnya.
- Penempatan siswa lintas sekolah dan ganda per tahun ajaran ditolak.
- Dua tahun ajaran aktif ditolak.

## Hutang teknis
- Guru bisa membaca data siswa dan guru seluruh sekolah (termasuk kontak/alamat); belum dibatasi ke kelasnya.
- Dropdown kelas untuk guru menampilkan semua kelas; penulisan di kelas lain ditolak RLS, tetapi belum difilter di UI.
- Status tagihan tidak dihitung ulang jika `jumlah` tagihan diubah (hanya saat pembayaran berubah). UI mengunci tagihan saat mengedit pembayaran.
- Simpan massal memakai hapus lalu isi ulang, jadi `audit_log` mencatat banyak baris untuk satu kali simpan.
- Absensi baru harian per kelas; belum per jam pelajaran.
- Tautan lintas sekolah selain `kelas_siswa` (mis. `jadwal.guru_id` ke guru sekolah lain) belum dijaga trigger. RLS mencegah pembacaan, tetapi bukan penautan oleh admin yang mengetahui id-nya.
- Hapus siswa cascade ke nilai, absensi, tagihan; gunakan status nonaktif.
- Belum ada backup terjadwal di luar Supabase.
- Akun login siswa/guru masih dibuat manual (belum dari `/admin`).
