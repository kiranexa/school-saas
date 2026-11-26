import './styles.css';
import { sb } from './supabase.js';
import { esc, pill, shellPublik, shellApp, bindTema, bindShell, terapkanMerek, ikon } from './ui.js';
import { PAGES } from './pages/index.js';
import { ppdbPublikView } from './pages/ppdb.js';

const app = document.getElementById('app');
const STAFF = ['owner', 'kepala_sekolah', 'admin', 'tu', 'guru'];

// ---- 1. Tentukan sekolah dari hostname ----
async function resolveTenant() {
  const host = location.hostname;
  let slug = null;
  if (host.endsWith('.localhost')) {                // dev di komputer: school1.localhost:5173
    slug = host.split('.')[0];
  } else if (import.meta.env.DEV) {                 // hanya saat pengembangan, mis. dari HP lewat IP:
    const q = new URLSearchParams(location.search).get('sekolah');   // http://192.168.x.x:5173/?sekolah=school1
    try {
      if (q) localStorage.setItem('dev-sekolah', q);
      slug = q ?? localStorage.getItem('dev-sekolah');
    } catch { slug = q; }
  }
  if (slug) {
    const { data } = await sb.from('tenants').select('*').eq('slug', slug).maybeSingle();
    return data;
  }
  const { data } = await sb.from('tenant_domains').select('tenants(*)').eq('domain', host).maybeSingle();
  return data?.tenants ?? null;
}

async function myRoles(tid) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('tenant_members').select('role').eq('tenant_id', tid).eq('user_id', user.id);
  return (data ?? []).map((r) => r.role);
}

const logoutBtn = `<button id="lo" class="sec">${ikon('logout')}<span>Keluar</span></button>`;
const bindLogout = () => (document.getElementById('lo').onclick = async () => { await sb.auth.signOut(); location.href = '/'; });
const tgl = (s) => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

// ---- 2. Login ----
function loginView(t, area) {
  app.innerHTML = shellPublik(t, `
    <section class="masuk">
      <h2 class="judul">Login ${esc(area)}</h2>
      <p class="sub">Masuk dengan email dan password dari sekolah.</p>
      <form id="f" class="panel">
        <label>Email<input id="em" type="email" autocomplete="username" required></label>
        <label>Password<input id="pw" type="password" autocomplete="current-password" required></label>
        <button>Masuk</button>
        <p id="err" class="msg err" role="alert" hidden></p>
      </form>
    </section>`);
  bindTema();
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({
      email: document.getElementById('em').value,
      password: document.getElementById('pw').value,
    });
    if (error) {
      const el = document.getElementById('err');
      el.textContent = error.message;
      el.hidden = false;
    } else location.reload();
  };
}

// ---- 3. Halaman ----
async function landing(t) {
  const [h, g, p] = await Promise.all([
    sb.from('halaman').select('judul').eq('tenant_id', t.id).eq('slug', 'beranda').maybeSingle(),
    sb.from('galeri').select('judul,gambar_url').eq('tenant_id', t.id).limit(12),
    sb.from('pengumuman').select('judul,isi,created_at').eq('tenant_id', t.id).eq('target', 'publik').order('created_at', { ascending: false }).limit(5),
  ]);
  const info = [t.jenjang, t.alamat].filter(Boolean).map((x) => `<p class="meta">${esc(x)}</p>`).join('');
  const galeri = g.data ?? [];
  app.innerHTML = shellPublik(t, `
    <section class="buku"><h1>${esc(h.data?.judul ?? t.nama)}</h1>${info}<div class="baris" style="margin-top:1rem"><a class="btn" href="/daftar">Daftar Siswa Baru (PPDB)</a><a class="btn sec" href="/daftar?tab=cek">Cek Status Pendaftaran</a></div></section>
    <section class="bagian pengumuman"><h2>Pengumuman</h2>
      ${(p.data ?? []).map((x) => `<article><time datetime="${esc(x.created_at)}">${esc(tgl(x.created_at))}</time>
        <div><h3>${esc(x.judul)}</h3><p>${esc(x.isi)}</p></div></article>`).join('') || '<p class="kosong">Belum ada pengumuman.</p>'}
    </section>
    ${galeri.length ? `<section class="bagian"><h2>Galeri</h2><div class="galeri">${galeri.map((x) =>
      `<figure><img src="${esc(x.gambar_url)}" alt="${esc(x.judul)}" loading="lazy"><figcaption>${esc(x.judul)}</figcaption></figure>`).join('')}</div></section>` : ''}`);
  bindTema();
}

async function adminView(t, roles) {
  const sub = location.pathname.split('/')[2] ?? '';
  const bisa = Object.entries(PAGES).filter(([, p]) => roles.some((r) => p.who.includes(r)));
  const def = PAGES[sub];

  app.innerHTML = shellApp(t, { roles, bisa, aktif: def ? sub : '', body: '<div id="page"></div>' });
  bindTema(); bindShell(); bindLogout();
  const page = document.getElementById('page');

  if (def) {
    if (!bisa.some(([k]) => k === sub)) { page.innerHTML = '<p class="kosong">Anda tidak punya akses ke halaman ini.</p>'; return; }
    return def.render(page, t, { roles, canWrite: roles.some((r) => def.write.includes(r)) });
  }

  const count = async (table) => {
    const { count: n } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
    return n ?? 0;
  };
  const [s, g, k] = await Promise.all([count('siswa'), count('guru'), count('kelas')]);
  const ringkas = [['siswa', 'Siswa', s], ['guru', 'Guru', g], ['kelas', 'Kelas', k]];
  const pintas = bisa.filter(([key]) => ['absensi', 'nilai'].includes(key))
    .map(([key, p]) => `<a class="btn sec" href="/admin/${key}">${ikon(p.ikon)}<span>${esc(p.label)}</span></a>`).join('');
  page.innerHTML = `<h1 class="judul">Ringkasan</h1>
    <ul class="ringkas">${ringkas.map(([key, label, n]) =>
      `<li><a href="/admin/${key}"><span>${label}</span><i class="titik"></i><b>${n}</b></a></li>`).join('')}</ul>
    ${pintas ? `<div class="pintas">${pintas}</div>` : ''}`;
}

async function siswaView(t) {
  const [diri, n, a, tg] = await Promise.all([
    sb.from('siswa').select('nama,nis').limit(1).maybeSingle(),
    sb.from('nilai').select('jenis,skor,mata_pelajaran(nama)').order('created_at', { ascending: false }).limit(50),
    sb.from('absensi').select('tanggal,status').order('tanggal', { ascending: false }).limit(30),
    sb.from('tagihan').select('jenis,periode,jumlah,status').order('jatuh_tempo', { ascending: false }).limit(30),
  ]);
  const tabel = (kepala, baris, kosong) => (baris.length
    ? `<div class="tabel"><table><thead><tr>${kepala.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${baris.join('')}</tbody></table></div>`
    : `<p class="kosong">${kosong}</p>`);
  const hitung = {};
  for (const r of a.data ?? []) hitung[r.status] = (hitung[r.status] ?? 0) + 1;
  const rekap = Object.entries(hitung).map(([st, jml]) => `<span class="pill ${pill(st).match(/pill (\w+)/)?.[1] ?? 'mute'}">${esc(st)} ${jml}</span>`).join(' ');

  app.innerHTML = shellPublik(t, `
    <h2 class="judul">Portal Siswa</h2>
    <p class="sub">${diri.data ? `${esc(diri.data.nama)}, NIS ${esc(diri.data.nis ?? '-')}` : 'Data siswa belum terhubung ke akun ini.'}</p>
    <section class="bagian"><h3>Tagihan</h3>
      ${tabel(['Jenis', 'Periode', 'Jumlah', 'Status'], (tg.data ?? []).map((r) =>
        `<tr><td>${esc(r.jenis)}</td><td>${esc(r.periode)}</td><td>${esc(r.jumlah)}</td><td>${pill(r.status)}</td></tr>`), 'Tidak ada tagihan.')}
    </section>
    <section class="bagian"><h3>Nilai</h3>
      ${tabel(['Mata pelajaran', 'Jenis', 'Skor'], (n.data ?? []).map((r) =>
        `<tr><td>${esc(r.mata_pelajaran?.nama)}</td><td>${esc(r.jenis)}</td><td>${esc(r.skor)}</td></tr>`), 'Belum ada nilai.')}
    </section>
    <section class="bagian"><h3>Absensi</h3>
      ${rekap ? `<p class="baris" style="margin-bottom:.8rem">${rekap}</p>` : ''}
      ${tabel(['Tanggal', 'Status'], (a.data ?? []).map((r) =>
        `<tr><td>${esc(r.tanggal)}</td><td>${pill(r.status)}</td></tr>`), 'Belum ada catatan absensi.')}
    </section>`, logoutBtn);
  bindTema(); bindLogout();
}

// ---- 4. Router ----
(async function main() {
  const t = await resolveTenant();
  if (!t) {
    app.innerHTML = `<main class="pub-main"><section class="masuk"><h2 class="judul">Sekolah tidak ditemukan</h2>
      <p class="sub">Alamat ${esc(location.hostname)} belum terdaftar. Periksa kembali alamat yang Anda buka.</p></section></main>`;
    return;
  }
  document.title = t.nama;
  terapkanMerek(t);

  const area = location.pathname.split('/')[1];
  if (area === 'daftar') return ppdbPublikView(app, t);
  if (area !== 'admin' && area !== 'siswa') return landing(t);

  const roles = await myRoles(t.id);
  if (!roles) return loginView(t, area);
  const allowed = area === 'admin' ? roles.some((r) => STAFF.includes(r)) : roles.includes('siswa');
  if (!allowed) {
    app.innerHTML = shellPublik(t, `<section class="masuk"><h2 class="judul">Akses ditolak</h2>
      <p class="sub">Akun ini tidak punya hak untuk membuka area ${esc(area)}.</p></section>`, logoutBtn);
    bindTema(); bindLogout();
    return;
  }
  return area === 'admin' ? adminView(t, roles) : siswaView(t);
})();
