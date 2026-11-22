# Desain antarmuka

Konsep: **buku induk** — buku besar administrasi sekolah. Tenang, datar, dan fungsional untuk dipakai seharian; satu-satunya dekorasi yang disengaja adalah halaman depan bergaya buku tulis.

## Token (di `src/styles.css`)
| Token | Terang | Gelap | Peran |
|---|---|---|---|
| `--bg` | #F3F6FB | #0E1320 | latar halaman |
| `--surface` / `--surface-2` | #FFFFFF / #E9EEF7 | #151C2C / #1B2438 | panel, tabel / kepala tabel, area cekung |
| `--ink` / `--ink-2` | #14213D / #4A5878 | #E7ECF7 / #9AA8C7 | teks utama / pendukung |
| `--line` / `--line-strong` | #D5DDEA / #B3BFD6 | #26314A / #3A4766 | garis halus / garis tegas |
| `--brand` → `--accent` | #2447D6 | brand dicampur putih 50% | warna sekolah (biru tinta), tombol, tautan, fokus |
| `--ok` `--warn` `--bad` `--info` | hijau, kuning tua, merah, biru | versi lebih terang | status (hadir, sebagian, alpa, izin) |
| `--margin` / `--garis` | #E8A9B0 / #DCE5F3 | #6B3440 / #1E2940 | margin merah dan garis buku tulis (hanya halaman depan) |

## Huruf
IBM Plex Sans untuk antarmuka (angka sejajar lewat `tabular-nums`), IBM Plex Serif hanya untuk judul dan nama sekolah. Dimuat dari Google Fonts di `index.html` dengan cadangan huruf sistem.

## Ciri khas
- Judul halaman memakai **garis ganda** seperti kepala buku kas (`.judul`).
- Ringkasan dashboard memakai **titik penghubung** seperti daftar isi (`.ringkas`).
- Halaman depan sekolah berupa **halaman buku tulis** (`.buku`): garis bertinta dan margin merah.
- Tanpa bayangan generik dan tanpa kartu seragam; struktur dibentuk oleh garis tipis. Sudut membulat bertingkat: tombol dan isian 6px, panel dan tabel 10px, pil penuh.

## Tema terang dan gelap
- `data-tema="light|dark"` pada `<html>`. Skrip kecil di `index.html` memasangnya sebelum halaman digambar (tanpa kedipan): pilihan tersimpan di `localStorage['tema']`, jika belum ada mengikuti pengaturan perangkat.
- Tombol ganti tema ada di bilah atas admin, portal siswa, login, dan halaman depan (`tombolTema()` di `src/ui.js`, label aksesibel "Ganti tema").
- Warna dibuat hanya dari variabel; jangan menulis warna heks langsung di komponen.

## Warna sekolah
`tenants.tema` (jsonb) membaca `accent` berupa heks 6 digit, mis. `update tenants set tema = '{"accent":"#0F766E"}' where slug = 'school1';`. Pilih warna yang cukup gelap agar teks putih pada tombol terbaca. Pada mode gelap, warna otomatis dicampur dengan putih.

## Komponen
| Kelas / fungsi | Fungsi |
|---|---|
| `button` (utama), `.sec`, `.danger`, `.kecil`, `.ikon` | tombol |
| `.panel`, `.cols`, `.toolbar`, `.baris` | form dan baris kontrol |
| `.tabel` + `table` | tabel dengan kepala tetap dan gulir horizontal |
| `pill(nilai)` | status berwarna (aktif, hadir, lunas, sebagian, alpa, ...); di `crud`, tandai kolom dengan `pill: true` |
| `pesan(teks)` | banner hasil aksi; sukses jika diawali Tersimpan/Terhapus/..., selain itu galat |
| `.kosong` | keadaan kosong dengan petunjuk |
| `shellPublik`, `shellApp` | kerangka halaman publik/portal dan admin |

## Layar kecil
Di bawah 860px menu samping menjadi laci yang dibuka tombol menu; tabel digulir di dalam pembungkusnya. Gerak dimatikan jika perangkat meminta `prefers-reduced-motion`.

## Aksesibilitas
Fokus keyboard terlihat, tautan "Lewati ke konten", ikon dekoratif disembunyikan dari pembaca layar, pesan memakai `role="status"` atau `role="alert"`, menu memakai `aria-current="page"`.

## Catatan untuk tes
Teks dan selector yang dipakai tes (label tombol, id `#q #kelas #tgl #muat #jenis #mapel #sel #em #pw #err #lo`, atribut `data-state` pada `#page`, judul "Login admin", "Akses ditolak", "Portal Siswa") sengaja dipertahankan. Ubah bersama tesnya.
