export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Ikon (garis, 24x24) ----------
const SVG = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2.5.5 4 2.2 4 5"/>',
  layers: '<path d="M12 3 2 8l10 5 10-5z"/><path d="m2 13 10 5 10-5"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  bank: '<path d="M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  school: '<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
};
export const ikon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SVG[n] ?? ''}</svg>`;

// ---------- Status (pil berwarna) ----------
const NADA = {
  aktif: 'ok', hadir: 'ok', lunas: 'ok', ya: 'ok',
  nonaktif: 'mute', lulus: 'info', izin: 'info',
  pindah: 'warn', cuti: 'warn', sakit: 'warn', sebagian: 'warn',
  alpa: 'bad', belum: 'bad',
  menunggu: 'warn', disetujui: 'ok', ditolak: 'bad', dibatalkan: 'mute',
  dibuka: 'ok', draft: 'mute', ditutup: 'bad', baru: 'info', menunggu_verifikasi: 'warn', diterima: 'ok', belum_bayar: 'bad', menunggu_konfirmasi: 'warn',
};
export const pill = (v) => (v == null || v === '' ? ''
  : `<span class="pill ${NADA[String(v).toLowerCase()] ?? 'mute'}">${esc(v)}</span>`);

// ---------- Pesan hasil aksi ----------
const SUKSES = /^(Tersimpan|Terhapus|Siswa ditambahkan|Siswa dikeluarkan|Pendaftar (diterima|ditolak)|Pengajuan (terkirim|disetujui|ditolak|dibatalkan))/;
export const pesan = (m) => (m
  ? `<p class="msg ${SUKSES.test(m) ? 'ok' : 'err'}" role="${SUKSES.test(m) ? 'status' : 'alert'}">${esc(m)}</p>` : '');

// ---------- Tema terang/gelap ----------
export function setTema(t) {
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem('tema', t); } catch { /* penyimpanan tidak tersedia */ }
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = t === 'dark' ? '#0E1320' : '#F3F6FB';
}
export const tombolTema = () => `<button type="button" class="sec ikon" data-tema-toggle aria-label="Ganti tema" title="Ganti tema terang/gelap">
  <span class="ikon-terang">${ikon('moon')}</span><span class="ikon-gelap">${ikon('sun')}</span></button>`;
export function bindTema() {
  document.querySelectorAll('[data-tema-toggle]').forEach((b) => {
    b.onclick = () => setTema(document.documentElement.dataset.tema === 'dark' ? 'light' : 'dark');
  });
}

// Warna sekolah dari tenants.tema.accent (hanya heks 6 digit; pilih warna yang cukup gelap)
export function terapkanMerek(t) {
  const c = t?.tema?.accent;
  if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) document.documentElement.style.setProperty('--brand', c);
}

// ---------- Kerangka ----------
export function shellPublik(t, body, aksi = null) {
  const kanan = aksi ?? '<a class="btn kecil" href="/daftar">Daftar Siswa Baru</a><a class="btn sec kecil" href="/admin">Masuk staf</a><a class="btn sec kecil" href="/siswa">Masuk siswa</a>';
  return `<a class="lompat" href="#isi">Lewati ke konten</a>
    <header class="pub-atas"><a class="nama" href="/">${esc(t.nama)}</a>
      <nav class="pub-nav" aria-label="Menu utama">${kanan}${tombolTema()}</nav></header>
    <main id="isi" class="pub-main">${body}</main>
    <footer class="kaki">${esc(t.nama)}</footer>`;
}
export const layout = shellPublik;   // nama lama

// bisa: [[kunci, {label, ikon, grup}]]
export function shellApp(t, { roles, bisa, aktif, body }) {
  const link = (k, label, ic) => `<a class="nav" href="/admin${k ? `/${k}` : ''}" ${aktif === k ? 'aria-current="page"' : ''}>${ikon(ic)}<span>${esc(label)}</span></a>`;
  const grup = [];
  for (const [k, p] of bisa) {
    let g = grup.find((x) => x.nama === p.grup);
    if (!g) { g = { nama: p.grup, item: [] }; grup.push(g); }
    g.item.push(link(k, p.label, p.ikon));
  }
  return `<a class="lompat" href="#isi">Lewati ke konten</a>
    <div class="app">
      <aside class="sisi" id="sisi">
        <div class="sekolah">${esc(t.nama)}</div>
        <h2 class="area">Admin <span class="role">(${esc(roles.join(', '))})</span></h2>
        <nav aria-label="Menu admin">
          ${link('', 'Dashboard', 'grid')}
          ${grup.map((g) => `<div class="grup">${esc(g.nama)}</div>${g.item.join('')}`).join('')}
        </nav>
      </aside>
      <div class="latar" data-tutup></div>
      <div class="utama">
        <header class="atas">
          <button type="button" class="sec ikon hamburger" aria-label="Buka menu" aria-controls="sisi" aria-expanded="false">${ikon('menu')}</button>
          ${tombolTema()}
          <button id="lo" class="sec">${ikon('logout')}<span>Keluar</span></button>
        </header>
        <main id="isi" class="isi">${body}</main>
      </div>
    </div>`;
}

export function bindShell() {
  const tombol = document.querySelector('.hamburger');
  if (!tombol) return;
  const tutup = () => { document.body.classList.remove('nav-open'); tombol.setAttribute('aria-expanded', 'false'); };
  tombol.addEventListener('click', () => {
    const buka = document.body.classList.toggle('nav-open');
    tombol.setAttribute('aria-expanded', String(buka));
  });
  document.querySelector('[data-tutup]')?.addEventListener('click', tutup);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutup(); });
}
