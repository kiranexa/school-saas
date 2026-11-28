import { siswaPage, guruPage, mapelPage, tahunPage, kelasPage, jadwalPage, tagihanPage, pembayaranPage, jurusanPage, profilPage } from './master.js';
import { pengajuanPage } from './pengajuan.js';
import { gelombangPage, pendaftarPage } from './ppdb.js';
import { kelasSiswaPage } from './kelasSiswa.js';
import { absensiPage } from './absensi.js';
import { nilaiPage } from './nilai.js';

const SEMUA_STAF = ['owner', 'kepala_sekolah', 'admin', 'tu', 'guru'];
const TULIS = ['owner', 'kepala_sekolah', 'admin', 'tu'];
const KEUANGAN = ['owner', 'kepala_sekolah', 'admin', 'tu'];
const MANAJEMEN = ['owner', 'kepala_sekolah', 'admin']; // untuk profil sekolah, pengaturan

// who = peran yang boleh membuka; write = peran yang boleh mengubah (RLS tetap pengaman utama)
// grup + ikon dipakai menu samping
export const PAGES = {
  siswa:      { label: 'Siswa',        grup: 'Akademik', ikon: 'users',    who: SEMUA_STAF, write: TULIS, render: (el, t, c) => siswaPage(el, t, c.canWrite) },
  guru:       { label: 'Guru',         grup: 'Akademik', ikon: 'user',     who: SEMUA_STAF, write: TULIS, render: (el, t, c) => guruPage(el, t, c.canWrite) },
  kelas:      { label: 'Kelas',        grup: 'Akademik', ikon: 'layers',   who: SEMUA_STAF, write: TULIS, render: (el, t, c) => {
    const id = location.pathname.split('/')[3];
    return id ? kelasSiswaPage(el, t, c.canWrite, id) : kelasPage(el, t, c.canWrite);
  } },
  mapel:      { label: 'Mapel',        grup: 'Akademik', ikon: 'book',     who: SEMUA_STAF, write: TULIS, render: (el, t, c) => mapelPage(el, t, c.canWrite) },
  jadwal:     { label: 'Jadwal',       grup: 'Akademik', ikon: 'calendar', who: SEMUA_STAF, write: TULIS, render: (el, t, c) => jadwalPage(el, t, c.canWrite) },
  tahun:      { label: 'Tahun ajaran', grup: 'Akademik', ikon: 'clock',    who: TULIS,      write: TULIS, render: (el, t, c) => tahunPage(el, t, c.canWrite) },
  absensi:    { label: 'Absensi',      grup: 'Harian',   ikon: 'check',    who: SEMUA_STAF, write: [...TULIS, 'guru'], render: (el, t, c) => absensiPage(el, t, c.canWrite) },
  nilai:      { label: 'Nilai',        grup: 'Harian',   ikon: 'chart',    who: SEMUA_STAF, write: [...TULIS, 'guru'], render: (el, t, c) => nilaiPage(el, t, c.canWrite) },
  tagihan:    { label: 'Tagihan',      grup: 'Keuangan', ikon: 'receipt',  who: KEUANGAN,   write: KEUANGAN, render: (el, t, c) => tagihanPage(el, t, c.canWrite) },
  pembayaran: { label: 'Pembayaran',   grup: 'Keuangan', ikon: 'card',     who: KEUANGAN,   write: KEUANGAN, render: (el, t, c) => pembayaranPage(el, t, c.canWrite) },
  gelombang:  { label: 'Gelombang',    grup: 'Pendaftaran', ikon: 'flag',   who: TULIS, write: TULIS, render: (el, t, c) => gelombangPage(el, t, c.canWrite) },
  pendaftar:  { label: 'Calon Siswa',  grup: 'Pendaftaran', ikon: 'inbox',  who: TULIS, write: TULIS, render: (el, t, c) => pendaftarPage(el, t, c.canWrite) },
  jurusan:    { label: 'Jurusan',      grup: 'Pendaftaran', ikon: 'school', who: TULIS, write: TULIS, render: (el, t, c) => jurusanPage(el, t, c.canWrite) },
  biaya:      { label: 'Biaya',        grup: 'Pendaftaran', ikon: 'tag',    who: TULIS, write: [], render: (el, t, c) => pengajuanPage(el, t, c.roles, 'komponen_biaya') },
  rekening:   { label: 'Rekening',     grup: 'Pendaftaran', ikon: 'bank',   who: TULIS, write: [], render: (el, t, c) => pengajuanPage(el, t, c.roles, 'metode_pembayaran') },
  persetujuan:{ label: 'Persetujuan',  grup: 'Pendaftaran', ikon: 'shield', who: TULIS, write: [], render: (el, t, c) => pengajuanPage(el, t, c.roles, null) },
  profil:     { label: 'Profil Sekolah', grup: 'Pengaturan', ikon: 'settings', who: MANAJEMEN, write: MANAJEMEN, render: (el, t, c) => profilPage(el, t, c.canWrite) },
};
