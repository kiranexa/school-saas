import { sb } from '../supabase.js';
import { crudPage } from '../crud.js';

const opt = (arr) => arr.map((v) => ({ value: v, label: v }));
const JK = [{ value: '', label: '—' }, { value: 'L', label: 'L' }, { value: 'P', label: 'P' }];
const STATUS = opt(['aktif', 'nonaktif', 'lulus', 'pindah', 'cuti']);
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((l, i) => ({ value: String(i + 1), label: l }));
const jam = (s) => (s ?? '').slice(0, 5);

export const guruPage = (el, t, w) => crudPage(el, t, w, {
  title: 'Data Guru', singular: 'guru', table: 'guru', order: 'nama', search: ['nama', 'nip'],
  defaults: { status: 'aktif' },
  dupMessage: 'Data guru duplikat.',
  deleteWarn: () => 'Guru yang masih menjadi wali kelas atau punya jadwal tidak bisa dihapus. Ubah status menjadi nonaktif.',
  columns: [
    { label: 'NIP', get: (r) => r.nip }, { label: 'Nama', get: (r) => r.nama },
    { label: 'Telepon', get: (r) => r.telepon }, { label: 'Status', get: (r) => r.status },
  ],
  fields: [
    { name: 'nama', label: 'Nama', required: true }, { name: 'nip', label: 'NIP' },
    { name: 'jk', label: 'Jenis kelamin', type: 'select', options: JK },
    { name: 'tgl_lahir', label: 'Tanggal lahir', type: 'date' },
    { name: 'email', label: 'Email', type: 'email' }, { name: 'telepon', label: 'Telepon' },
    { name: 'alamat', label: 'Alamat' },
    { name: 'status', label: 'Status', type: 'select', options: STATUS },
  ],
});

export const mapelPage = (el, t, w) => crudPage(el, t, w, {
  title: 'Mata Pelajaran', singular: 'mata pelajaran', table: 'mata_pelajaran', order: 'nama', search: ['nama', 'kode'],
  defaults: { kkm: 75 },
  deleteWarn: () => 'Nilai dan jadwal yang memakai mata pelajaran ini akan menghalangi penghapusan.',
  columns: [{ label: 'Kode', get: (r) => r.kode }, { label: 'Nama', get: (r) => r.nama }, { label: 'KKM', get: (r) => r.kkm }],
  fields: [
    { name: 'kode', label: 'Kode' }, { name: 'nama', label: 'Nama', required: true },
    { name: 'kkm', label: 'KKM', type: 'number' },
  ],
});

export const tahunPage = (el, t, w) => crudPage(el, t, w, {
  title: 'Tahun Ajaran', singular: 'tahun ajaran', table: 'tahun_ajaran', order: [['nama', { ascending: false }], 'semester'],
  dupMessage: 'Hanya boleh satu tahun ajaran aktif. Nonaktifkan yang lain dulu.',
  deleteWarn: () => 'Kelas yang memakai tahun ajaran ini akan kehilangan tahun ajarannya.',
  columns: [
    { label: 'Tahun ajaran', get: (r) => r.nama }, { label: 'Semester', get: (r) => r.semester },
    { label: 'Mulai', get: (r) => r.mulai }, { label: 'Selesai', get: (r) => r.selesai },
    { label: 'Aktif', get: (r) => (r.aktif ? 'ya' : '') },
  ],
  fields: [
    { name: 'nama', label: 'Nama (mis. 2026/2027)', required: true },
    { name: 'semester', label: 'Semester', type: 'select', options: opt(['1', '2']) },
    { name: 'mulai', label: 'Mulai', type: 'date' }, { name: 'selesai', label: 'Selesai', type: 'date' },
    { name: 'aktif', label: 'Aktif', type: 'checkbox' },
  ],
});

export const kelasPage = (el, t, w) => crudPage(el, t, w, {
  title: 'Kelas', singular: 'kelas', table: 'kelas', order: 'nama', search: ['nama'],
  select: '*, tahun_ajaran!tahun_ajaran_id(nama), guru!wali_guru_id(nama)',
  deleteWarn: () => 'Penempatan siswa di kelas ini ikut terhapus.',
  actions: [{ label: 'Siswa', href: (r) => `/admin/kelas/${r.id}` }],
  columns: [
    { label: 'Kelas', get: (r) => r.nama }, { label: 'Tingkat', get: (r) => r.tingkat },
    { label: 'Tahun ajaran', get: (r) => r.tahun_ajaran?.nama }, { label: 'Wali kelas', get: (r) => r.guru?.nama },
  ],
  fields: [
    { name: 'nama', label: 'Nama kelas', required: true }, { name: 'tingkat', label: 'Tingkat', type: 'number' },
    { name: 'tahun_ajaran_id', label: 'Tahun ajaran',
      lookup: { table: 'tahun_ajaran', select: 'id,nama,semester', label: (r) => `${r.nama} (S${r.semester})` } },
    { name: 'wali_guru_id', label: 'Wali kelas',
      lookup: { table: 'guru', select: 'id,nama', label: (r) => r.nama } },
  ],
});

export const jadwalPage = (el, t, w) => crudPage(el, t, w, {
  title: 'Jadwal Pelajaran', singular: 'jadwal', table: 'jadwal', order: ['hari', 'jam_mulai'],
  select: '*, kelas!kelas_id(nama), mata_pelajaran!mapel_id(nama), guru!guru_id(nama)',
  columns: [
    { label: 'Hari', get: (r) => HARI.find((h) => h.value === String(r.hari))?.label },
    { label: 'Jam', get: (r) => `${jam(r.jam_mulai)}–${jam(r.jam_selesai)}` },
    { label: 'Kelas', get: (r) => r.kelas?.nama }, { label: 'Mapel', get: (r) => r.mata_pelajaran?.nama },
    { label: 'Guru', get: (r) => r.guru?.nama }, { label: 'Ruang', get: (r) => r.ruang },
  ],
  fields: [
    { name: 'kelas_id', label: 'Kelas', required: true, lookup: { table: 'kelas', select: 'id,nama', label: (r) => r.nama } },
    { name: 'mapel_id', label: 'Mata pelajaran', required: true, lookup: { table: 'mata_pelajaran', select: 'id,nama', label: (r) => r.nama } },
    { name: 'guru_id', label: 'Guru', required: true, lookup: { table: 'guru', select: 'id,nama', label: (r) => r.nama } },
    { name: 'hari', label: 'Hari', type: 'select', options: HARI },
    { name: 'jam_mulai', label: 'Jam mulai', type: 'time', required: true },
    { name: 'jam_selesai', label: 'Jam selesai', type: 'time', required: true },
    { name: 'ruang', label: 'Ruang' },
  ],
  defaults: { hari: '1' },
});

export const tagihanPage = (el, t, w) => crudPage(el, t, w, {
  title: 'Tagihan', singular: 'tagihan', table: 'tagihan', order: [['jatuh_tempo', { ascending: false }]],
  select: '*, siswa!siswa_id(nama)',
  deleteWarn: () => 'Semua pembayaran untuk tagihan ini ikut terhapus.',
  columns: [
    { label: 'Siswa', get: (r) => r.siswa?.nama }, { label: 'Jenis', get: (r) => r.jenis },
    { label: 'Periode', get: (r) => r.periode }, { label: 'Jumlah', get: (r) => r.jumlah },
    { label: 'Jatuh tempo', get: (r) => r.jatuh_tempo }, { label: 'Status', get: (r) => r.status },
  ],
  fields: [
    { name: 'siswa_id', label: 'Siswa', required: true,
      lookup: { table: 'siswa', select: 'id,nama,nis', label: (r) => `${r.nama} (${r.nis ?? '-'})` } },
    { name: 'jenis', label: 'Jenis (SPP, Gedung, ...)', required: true }, { name: 'periode', label: 'Periode (mis. 2026-11)' },
    { name: 'jumlah', label: 'Jumlah (Rp)', type: 'number', step: '0.01', required: true },
    { name: 'jatuh_tempo', label: 'Jatuh tempo', type: 'date' },
  ],
});

export const pembayaranPage = (el, t, w) => crudPage(el, t, w, {
  title: 'Pembayaran', singular: 'pembayaran', table: 'pembayaran', order: [['tgl_bayar', { ascending: false }]],
  select: '*, tagihan!tagihan_id(jenis,periode,siswa!siswa_id(nama))',
  deleteWarn: () => 'Status tagihan akan dihitung ulang.',
  extra: async () => { const { data: { user } } = await sb.auth.getUser(); return { dicatat_oleh: user.id }; },
  columns: [
    { label: 'Tanggal', get: (r) => (r.tgl_bayar ?? '').slice(0, 10) },
    { label: 'Siswa', get: (r) => r.tagihan?.siswa?.nama },
    { label: 'Tagihan', get: (r) => [r.tagihan?.jenis, r.tagihan?.periode].filter(Boolean).join(' ') },
    { label: 'Jumlah', get: (r) => r.jumlah }, { label: 'Metode', get: (r) => r.metode },
  ],
  fields: [
    { name: 'tagihan_id', label: 'Tagihan', required: true, createOnly: true,
      lookup: { table: 'tagihan', select: 'id,jenis,periode,jumlah,status,siswa!siswa_id(nama)',
        filter: (r) => r.status !== 'lunas',
        label: (r) => `${r.siswa?.nama ?? '?'} — ${[r.jenis, r.periode].filter(Boolean).join(' ')} (Rp ${r.jumlah})` } },
    { name: 'jumlah', label: 'Jumlah dibayar (Rp)', type: 'number', step: '0.01', required: true },
    { name: 'metode', label: 'Metode', type: 'select', options: opt(['tunai', 'transfer']) },
  ],
  defaults: { metode: 'tunai' },
});
