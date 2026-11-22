import { siswaPage } from './siswa.js';
import { guruPage, mapelPage, tahunPage, kelasPage, jadwalPage, tagihanPage, pembayaranPage } from './master.js';
import { kelasSiswaPage } from './kelasSiswa.js';
import { absensiPage } from './absensi.js';
import { nilaiPage } from './nilai.js';

const SEMUA_STAF = ['owner', 'kepala_sekolah', 'admin', 'tu', 'guru'];
const TULIS = ['owner', 'kepala_sekolah', 'admin', 'tu'];
const KEUANGAN = ['owner', 'kepala_sekolah', 'admin', 'tu'];

// who = peran yang boleh membuka; write = peran yang boleh mengubah (RLS tetap pengaman utama)
export const PAGES = {
  siswa:      { label: 'Siswa',          who: SEMUA_STAF, write: TULIS, render: (el, t, c) => siswaPage(el, t, c.canWrite) },
  guru:       { label: 'Guru',           who: SEMUA_STAF, write: TULIS, render: (el, t, c) => guruPage(el, t, c.canWrite) },
  kelas:      { label: 'Kelas',          who: SEMUA_STAF, write: TULIS, render: (el, t, c) => {
    const id = location.pathname.split('/')[3];
    return id ? kelasSiswaPage(el, t, c.canWrite, id) : kelasPage(el, t, c.canWrite);
  } },
  mapel:      { label: 'Mapel',          who: SEMUA_STAF, write: TULIS, render: (el, t, c) => mapelPage(el, t, c.canWrite) },
  jadwal:     { label: 'Jadwal',         who: SEMUA_STAF, write: TULIS, render: (el, t, c) => jadwalPage(el, t, c.canWrite) },
  tahun:      { label: 'Tahun ajaran',   who: TULIS,      write: TULIS, render: (el, t, c) => tahunPage(el, t, c.canWrite) },
  absensi:    { label: 'Absensi',        who: SEMUA_STAF, write: [...TULIS, 'guru'], render: (el, t, c) => absensiPage(el, t, c.canWrite) },
  nilai:      { label: 'Nilai',          who: SEMUA_STAF, write: [...TULIS, 'guru'], render: (el, t, c) => nilaiPage(el, t, c.canWrite) },
  tagihan:    { label: 'Tagihan',        who: KEUANGAN,   write: KEUANGAN, render: (el, t, c) => tagihanPage(el, t, c.canWrite) },
  pembayaran: { label: 'Pembayaran',     who: KEUANGAN,   write: KEUANGAN, render: (el, t, c) => pembayaranPage(el, t, c.canWrite) },
};
