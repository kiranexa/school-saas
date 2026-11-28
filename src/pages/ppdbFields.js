// Spesifikasi isian data lengkap PPDB (wizard). Bagian STEPS dan FIELDS DIHASILKAN dari spesifikasi bersama dengan
// migrasi 20261128100000_ppdb_data_lengkap.sql: kolom, aturan, dan label HARUS sama. Ubah keduanya bersamaan.
export const STEPS = [
 {
  "id": "identitas",
  "title": "Identitas Siswa"
 },
 {
  "id": "alamat",
  "title": "Alamat & Kesehatan"
 },
 {
  "id": "sekolah_ortu",
  "title": "Sekolah Asal & Orang Tua"
 }
];

export const FIELDS = [
 {
  "key": "jalur_pendaftaran",
  "label": "Jalur pendaftaran",
  "kind": "pilih",
  "req": true,
  "step": "identitas",
  "section": "Pendaftaran",
  "vals": [
   "reguler",
   "prestasi",
   "afirmasi",
   "perpindahan_tugas",
   "zonasi"
  ],
  "labels": {
   "reguler": "Reguler",
   "prestasi": "Prestasi",
   "afirmasi": "Afirmasi",
   "perpindahan_tugas": "Perpindahan tugas orang tua",
   "zonasi": "Zonasi/domisili"
  }
 },
 {
  "key": "nama_panggilan",
  "label": "Nama panggilan",
  "kind": "teks",
  "req": false,
  "step": "identitas",
  "section": "Identitas siswa",
  "max": 50
 },
 {
  "key": "nisn",
  "label": "NISN",
  "kind": "digits",
  "req": true,
  "step": "identitas",
  "section": "Identitas siswa",
  "len": 10,
  "help": "10 angka, tercantum di rapor atau kartu NISN"
 },
 {
  "key": "nik_siswa",
  "label": "NIK siswa",
  "kind": "digits",
  "req": true,
  "step": "identitas",
  "section": "Identitas siswa",
  "len": 16
 },
 {
  "key": "no_kk",
  "label": "Nomor Kartu Keluarga",
  "kind": "digits",
  "req": true,
  "step": "identitas",
  "section": "Identitas siswa",
  "len": 16
 },
 {
  "key": "no_akta_lahir",
  "label": "Nomor akta lahir",
  "kind": "teks",
  "req": true,
  "step": "identitas",
  "section": "Identitas siswa",
  "max": 50
 },
 {
  "key": "tempat_lahir",
  "label": "Tempat lahir",
  "kind": "teks",
  "req": true,
  "step": "identitas",
  "section": "Identitas siswa",
  "max": 100
 },
 {
  "key": "agama",
  "label": "Agama",
  "kind": "pilih",
  "req": true,
  "step": "identitas",
  "section": "Identitas siswa",
  "vals": [
   "Islam",
   "Kristen",
   "Katolik",
   "Hindu",
   "Buddha",
   "Konghucu",
   "Lainnya"
  ]
 },
 {
  "key": "kewarganegaraan",
  "label": "Kewarganegaraan",
  "kind": "pilih",
  "req": true,
  "step": "identitas",
  "section": "Identitas siswa",
  "vals": [
   "WNI",
   "WNA"
  ],
  "default": "WNI"
 },
 {
  "key": "anak_ke",
  "label": "Anak ke-",
  "kind": "int",
  "req": true,
  "step": "identitas",
  "section": "Keluarga",
  "lo": 1,
  "hi": 30
 },
 {
  "key": "jumlah_saudara",
  "label": "Jumlah saudara kandung",
  "kind": "int",
  "req": true,
  "step": "identitas",
  "section": "Keluarga",
  "lo": 0,
  "hi": 30
 },
 {
  "key": "status_keluarga",
  "label": "Status dalam keluarga",
  "kind": "pilih",
  "req": true,
  "step": "identitas",
  "section": "Keluarga",
  "vals": [
   "Anak kandung",
   "Anak tiri",
   "Anak angkat"
  ]
 },
 {
  "key": "kebutuhan_khusus",
  "label": "Kebutuhan khusus (jika ada)",
  "kind": "teks",
  "req": false,
  "step": "identitas",
  "section": "Keluarga",
  "max": 200
 },
 {
  "key": "no_hp_siswa",
  "label": "No. HP siswa",
  "kind": "hp",
  "req": false,
  "step": "identitas",
  "section": "Keluarga"
 },
 {
  "key": "alamat_kk",
  "label": "Alamat sesuai Kartu Keluarga",
  "kind": "alamat",
  "req": true,
  "step": "alamat",
  "section": "Alamat siswa"
 },
 {
  "key": "domisili_sama_kk",
  "label": "Alamat domisili saat ini sama dengan alamat KK",
  "kind": "bool",
  "req": false,
  "step": "alamat",
  "section": "Alamat siswa"
 },
 {
  "key": "alamat_domisili",
  "label": "Alamat domisili saat ini",
  "kind": "alamat",
  "req": true,
  "step": "alamat",
  "section": "Alamat siswa",
  "when": "domisili_beda"
 },
 {
  "key": "status_tinggal",
  "label": "Status tempat tinggal",
  "kind": "pilih",
  "req": true,
  "step": "alamat",
  "section": "Alamat siswa",
  "vals": [
   "Bersama orang tua",
   "Bersama wali",
   "Kos",
   "Asrama",
   "Panti asuhan",
   "Lainnya"
  ]
 },
 {
  "key": "jarak_sekolah_km",
  "label": "Jarak ke sekolah (km)",
  "kind": "num",
  "req": false,
  "step": "alamat",
  "section": "Alamat siswa",
  "lo": 0,
  "hi": 500
 },
 {
  "key": "koordinat_lat_lng",
  "label": "Koordinat (lat, lng)",
  "kind": "koord",
  "req": false,
  "step": "alamat",
  "section": "Alamat siswa",
  "help": "Contoh: -6.200000, 106.816666"
 },
 {
  "key": "tinggi_badan",
  "label": "Tinggi badan (cm)",
  "kind": "int",
  "req": false,
  "step": "alamat",
  "section": "Kesehatan",
  "lo": 50,
  "hi": 250
 },
 {
  "key": "berat_badan",
  "label": "Berat badan (kg)",
  "kind": "int",
  "req": false,
  "step": "alamat",
  "section": "Kesehatan",
  "lo": 10,
  "hi": 250
 },
 {
  "key": "golongan_darah",
  "label": "Golongan darah",
  "kind": "pilih",
  "req": false,
  "step": "alamat",
  "section": "Kesehatan",
  "vals": [
   "A",
   "B",
   "AB",
   "O",
   "Tidak tahu"
  ]
 },
 {
  "key": "riwayat_penyakit",
  "label": "Riwayat penyakit",
  "kind": "teks",
  "req": false,
  "step": "alamat",
  "section": "Kesehatan",
  "max": 300
 },
 {
  "key": "alergi",
  "label": "Alergi",
  "kind": "teks",
  "req": false,
  "step": "alamat",
  "section": "Kesehatan",
  "max": 300
 },
 {
  "key": "nama_sekolah_asal",
  "label": "Nama sekolah asal",
  "kind": "teks",
  "req": true,
  "step": "sekolah_ortu",
  "section": "Sekolah asal",
  "max": 150
 },
 {
  "key": "npsn_sekolah_asal",
  "label": "NPSN sekolah asal",
  "kind": "digits",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Sekolah asal",
  "len": 8
 },
 {
  "key": "status_sekolah_asal",
  "label": "Status sekolah asal",
  "kind": "pilih",
  "req": true,
  "step": "sekolah_ortu",
  "section": "Sekolah asal",
  "vals": [
   "Negeri",
   "Swasta"
  ]
 },
 {
  "key": "tahun_lulus",
  "label": "Tahun lulus",
  "kind": "int",
  "req": true,
  "step": "sekolah_ortu",
  "section": "Sekolah asal",
  "lo": 2000,
  "hi": 2100
 },
 {
  "key": "no_ijazah_skl",
  "label": "Nomor ijazah / SKL",
  "kind": "teks",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Sekolah asal",
  "max": 50
 },
 {
  "key": "rata_rata_rapor",
  "label": "Rata-rata nilai rapor",
  "kind": "num",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Sekolah asal",
  "lo": 0,
  "hi": 100
 },
 {
  "key": "ayah_nama",
  "label": "Nama Ayah",
  "kind": "teks",
  "req": true,
  "step": "sekolah_ortu",
  "section": "Ayah",
  "max": 150
 },
 {
  "key": "ayah_nik",
  "label": "NIK Ayah",
  "kind": "digits",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ayah",
  "len": 16
 },
 {
  "key": "ayah_status_hidup",
  "label": "Status Ayah",
  "kind": "pilih",
  "req": true,
  "step": "sekolah_ortu",
  "section": "Ayah",
  "vals": [
   "Hidup",
   "Meninggal",
   "Tidak diketahui"
  ]
 },
 {
  "key": "ayah_tahun_lahir",
  "label": "Tahun lahir Ayah",
  "kind": "int",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ayah",
  "lo": 1930,
  "hi": 2015
 },
 {
  "key": "ayah_pendidikan",
  "label": "Pendidikan Ayah",
  "kind": "pilih",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ayah",
  "vals": [
   "Tidak sekolah",
   "SD/sederajat",
   "SMP/sederajat",
   "SMA/sederajat",
   "D1-D3",
   "S1/D4",
   "S2",
   "S3"
  ]
 },
 {
  "key": "ayah_pekerjaan",
  "label": "Pekerjaan Ayah",
  "kind": "teks",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ayah",
  "max": 100
 },
 {
  "key": "ayah_penghasilan",
  "label": "Penghasilan Ayah",
  "kind": "pilih",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ayah",
  "vals": [
   "Tidak berpenghasilan",
   "Di bawah Rp1.000.000",
   "Rp1.000.000 - Rp2.999.999",
   "Rp3.000.000 - Rp4.999.999",
   "Rp5.000.000 - Rp9.999.999",
   "Di atas Rp10.000.000"
  ]
 },
 {
  "key": "ayah_no_hp",
  "label": "No. HP Ayah",
  "kind": "hp",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ayah"
 },
 {
  "key": "ibu_nama",
  "label": "Nama Ibu",
  "kind": "teks",
  "req": true,
  "step": "sekolah_ortu",
  "section": "Ibu",
  "max": 150
 },
 {
  "key": "ibu_nik",
  "label": "NIK Ibu",
  "kind": "digits",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ibu",
  "len": 16
 },
 {
  "key": "ibu_status_hidup",
  "label": "Status Ibu",
  "kind": "pilih",
  "req": true,
  "step": "sekolah_ortu",
  "section": "Ibu",
  "vals": [
   "Hidup",
   "Meninggal",
   "Tidak diketahui"
  ]
 },
 {
  "key": "ibu_tahun_lahir",
  "label": "Tahun lahir Ibu",
  "kind": "int",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ibu",
  "lo": 1930,
  "hi": 2015
 },
 {
  "key": "ibu_pendidikan",
  "label": "Pendidikan Ibu",
  "kind": "pilih",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ibu",
  "vals": [
   "Tidak sekolah",
   "SD/sederajat",
   "SMP/sederajat",
   "SMA/sederajat",
   "D1-D3",
   "S1/D4",
   "S2",
   "S3"
  ]
 },
 {
  "key": "ibu_pekerjaan",
  "label": "Pekerjaan Ibu",
  "kind": "teks",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ibu",
  "max": 100
 },
 {
  "key": "ibu_penghasilan",
  "label": "Penghasilan Ibu",
  "kind": "pilih",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ibu",
  "vals": [
   "Tidak berpenghasilan",
   "Di bawah Rp1.000.000",
   "Rp1.000.000 - Rp2.999.999",
   "Rp3.000.000 - Rp4.999.999",
   "Rp5.000.000 - Rp9.999.999",
   "Di atas Rp10.000.000"
  ]
 },
 {
  "key": "ibu_no_hp",
  "label": "No. HP Ibu",
  "kind": "hp",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Ibu"
 },
 {
  "key": "ortu_sama_kk",
  "label": "Alamat Ayah & Ibu sama dengan alamat KK siswa",
  "kind": "bool",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Alamat orang tua"
 },
 {
  "key": "alamat_ayah",
  "label": "Alamat Ayah",
  "kind": "alamat",
  "req": true,
  "step": "sekolah_ortu",
  "section": "Alamat orang tua",
  "when": "ayah_beda"
 },
 {
  "key": "ibu_sama_ayah",
  "label": "Alamat Ibu sama dengan alamat Ayah",
  "kind": "bool",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Alamat orang tua",
  "when": "ortu_beda"
 },
 {
  "key": "alamat_ibu",
  "label": "Alamat Ibu",
  "kind": "alamat",
  "req": true,
  "step": "sekolah_ortu",
  "section": "Alamat orang tua",
  "when": "ibu_beda"
 },
 {
  "key": "wali_nama",
  "label": "Nama wali",
  "kind": "teks",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Wali (opsional)",
  "max": 150
 },
 {
  "key": "wali_hubungan",
  "label": "Hubungan dengan siswa",
  "kind": "teks",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Wali (opsional)",
  "max": 50
 },
 {
  "key": "wali_no_hp",
  "label": "No. HP wali",
  "kind": "hp",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Wali (opsional)"
 },
 {
  "key": "wali_pekerjaan",
  "label": "Pekerjaan wali",
  "kind": "teks",
  "req": false,
  "step": "sekolah_ortu",
  "section": "Wali (opsional)",
  "max": 100
 }
];

export const ALAMAT_KOMPONEN = [
  { key: 'jalan', label: 'Jalan / dusun / nama gedung', max: 200, placeholder: 'Jl. Merdeka No. 10' },
  { key: 'rt_rw', label: 'RT/RW', max: 7, mask: 'rtrw', placeholder: '000/000' },
  { key: 'kelurahan', label: 'Kelurahan / desa', max: 100 },
  { key: 'kecamatan', label: 'Kecamatan', max: 100 },
  { key: 'kabupaten_kota', label: 'Kabupaten / kota', max: 100 },
  { key: 'kode_pos', label: 'Kode pos', max: 5, mask: 'digits', placeholder: '5 digit' },
];

const t = (x) => (x === undefined || x === null ? '' : String(x).trim());

// Format yang sama dengan ppdb_alamat_gabung() di database
export const gabungAlamat = (a = {}) => [
  t(a.jalan), t(a.rt_rw) && `RT/RW ${t(a.rt_rw)}`, t(a.kelurahan) && `Kel. ${t(a.kelurahan)}`,
  t(a.kecamatan) && `Kec. ${t(a.kecamatan)}`, t(a.kabupaten_kota), t(a.kode_pos),
].filter(Boolean).join(', ');

export const maskRtRw = (s) => {
  const d = String(s ?? '').replace(/\D/g, '').slice(0, 6);
  return d.length > 3 ? `${d.slice(0, 3)}/${d.slice(3)}` : d;
};
export const maskAngka = (s, n) => String(s ?? '').replace(/\D/g, '').slice(0, n);

const WHEN = {
  domisili_beda: (d) => !d.domisili_sama_kk,
  ayah_beda: (d) => !d.ortu_sama_kk,
  ortu_beda: (d) => !d.ortu_sama_kk,
  ibu_beda: (d) => !d.ortu_sama_kk && !d.ibu_sama_ayah,
};
export const tampil = (f, d) => !f.when || WHEN[f.when](d);

export function nilaiAwal() {
  const d = {};
  for (const f of FIELDS) {
    if (f.kind === 'bool') d[f.key] = false;
    else if (f.kind === 'alamat') d[f.key] = Object.fromEntries(ALAMAT_KOMPONEN.map((c) => [c.key, '']));
    else d[f.key] = f.default ?? '';
  }
  return d;
}

function cekNilai(f, raw) {
  const v = t(raw);
  if (v === '') return f.req ? `${f.label} wajib ${f.kind === 'pilih' ? 'dipilih' : 'diisi'}` : '';
  const rentang = (n) => `${f.label} harus ${f.kind === 'int' ? 'bilangan bulat' : 'angka'} ${f.lo} sampai ${f.hi}`;
  switch (f.kind) {
    case 'teks': return v.length > f.max ? `${f.label} maksimal ${f.max} karakter` : '';
    case 'digits': return new RegExp(`^[0-9]{${f.len}}$`).test(v) ? '' : `${f.label} harus ${f.len} angka`;
    case 'pilih': return f.vals.includes(v) ? '' : `${f.label} tidak valid`;
    case 'int': {
      if (!/^[0-9]{1,6}$/.test(v) || +v < f.lo || +v > f.hi) return rentang();
      if (f.key === 'tahun_lulus' && +v > new Date().getFullYear() + 1) return `${f.label} tidak valid`;
      return '';
    }
    case 'num': {
      const n = v.replace(',', '.');
      return /^[0-9]{1,5}(\.[0-9]{1,2})?$/.test(n) && +n >= f.lo && +n <= f.hi ? '' : rentang();
    }
    case 'hp': return /^\+?[0-9]{8,15}$/.test(v.replace(/[\s-]/g, '')) ? '' : `${f.label} tidak valid (8 sampai 15 angka)`;
    case 'koord': return /^-?[0-9]{1,2}(\.[0-9]+)?,-?[0-9]{1,3}(\.[0-9]+)?$/.test(v.replace(/\s/g, '')) ? '' : `${f.label} tidak valid (contoh -6.2, 106.8)`;
    default: return '';
  }
}

function cekKomponen(c, raw, lbl) {
  const v = t(raw);
  if (v === '') return `${lbl}: ${c.label.toLowerCase()} wajib diisi`;
  if (c.key === 'rt_rw' && !/^[0-9]{3}\/[0-9]{3}$/.test(v)) return `${lbl}: RT/RW harus berformat 000/000`;
  if (c.key === 'kode_pos' && !/^[0-9]{5}$/.test(v)) return `${lbl}: kode pos harus 5 angka`;
  return v.length > c.max ? `${lbl}: ${c.label.toLowerCase()} terlalu panjang` : '';
}

// Hasil: { 'nisn': 'pesan', 'alamat_kk.rt_rw': 'pesan', ... } (kosong = valid)
export function validasiStep(stepId, d) {
  const err = {};
  for (const f of FIELDS.filter((x) => x.step === stepId)) {
    if (!tampil(f, d) || f.kind === 'bool') continue;
    if (f.kind === 'alamat') {
      for (const c of ALAMAT_KOMPONEN) {
        const m = cekKomponen(c, d[f.key]?.[c.key], f.label);
        if (m) err[`${f.key}.${c.key}`] = m;
      }
      continue;
    }
    const m = cekNilai(f, d[f.key]);
    if (m) err[f.key] = m;
  }
  return err;
}

export const validasiSemua = (d) => STEPS.reduce((acc, s) => ({ ...acc, ...validasiStep(s.id, d) }), {});

// Payload ke simpan_data_lengkap_ppdb. Alamat yang disembunyikan (sama dengan KK/Ayah) tidak dikirim:
// server yang menyalinnya. Penggabungan alamat menjadi satu teks juga dilakukan di server.
export function bangunPayload(d) {
  const p = { pernyataan_benar: true };
  for (const f of FIELDS) {
    if (!tampil(f, d)) continue;
    if (f.kind === 'bool') { p[f.key] = !!d[f.key]; continue; }
    if (f.kind === 'alamat') {
      p[f.key] = Object.fromEntries(ALAMAT_KOMPONEN.map((c) => [c.key, t(d[f.key]?.[c.key])]));
      continue;
    }
    if (t(d[f.key]) !== '') p[f.key] = t(d[f.key]);
  }
  return p;
}

// Data dari server (ambil_data_lengkap_ppdb) -> bentuk state form
export function dariServer(row) {
  const d = nilaiAwal();
  if (!row) return d;
  for (const f of FIELDS) {
    if (row[f.key] === undefined || row[f.key] === null) continue;
    if (f.kind === 'alamat') d[f.key] = { ...d[f.key], ...row[f.key] };
    else if (f.kind === 'bool') d[f.key] = !!row[f.key];
    else d[f.key] = String(row[f.key]);
  }
  return d;
}

const ya = (v) => (v ? 'Ya' : 'Tidak');
// Bagian-bagian untuk halaman ringkasan (state form) dan tampilan admin (baris database)
export function bagianRingkasan(src, { dariDb = false } = {}) {
  const bagian = [];
  const peta = new Map();
  for (const f of FIELDS) {
    if (!dariDb && !tampil(f, src) && f.kind !== 'alamat') continue;
    let nilai;
    if (f.kind === 'bool') nilai = ya(src[f.key]);
    else if (f.kind === 'alamat') {
      nilai = dariDb ? src[f.key] : gabungAlamat(src[f.key]);
      if (!dariDb && !tampil(f, src)) {
        // urutan sama dengan server: ortu_sama_kk -> KK; selain itu Ibu mengikuti Ayah (ibu_sama_ayah)
        nilai = f.key === 'alamat_ibu' && !src.ortu_sama_kk ? gabungAlamat(src.alamat_ayah) : gabungAlamat(src.alamat_kk);
      }
    } else if (f.kind === 'pilih' && f.labels) nilai = f.labels[src[f.key]] ?? src[f.key];
    else nilai = src[f.key];
    if (f.kind !== 'bool' && t(nilai) === '') continue;
    const kunci = `${f.step}|${f.section}`;
    if (!peta.has(kunci)) { const b = { judul: f.section, baris: [] }; peta.set(kunci, b); bagian.push(b); }
    peta.get(kunci).baris.push([f.label, t(nilai)]);
  }
  return bagian;
}
