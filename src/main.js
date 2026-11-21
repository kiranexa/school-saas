import { sb } from './supabase.js';
import { esc, layout } from './ui.js';
import { siswaPage } from './pages/siswa.js';

const app = document.getElementById('app');
const STAFF = ['owner', 'kepala_sekolah', 'admin', 'tu', 'guru'];
const WRITERS = ['owner', 'kepala_sekolah', 'admin', 'tu'];

// ---- 1. Tentukan sekolah dari hostname ----
async function resolveTenant() {
  const host = location.hostname;
  if (host.endsWith('.localhost')) {                // dev: school1.localhost:5173
    const { data } = await sb.from('tenants').select('*').eq('slug', host.split('.')[0]).maybeSingle();
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

// ---- 2. Login ----
function loginView(t, area) {
  app.innerHTML = layout(t, `
    <h2>Login ${esc(area)}</h2>
    <form id="f"><input id="em" type="email" placeholder="Email" required><br>
    <input id="pw" type="password" placeholder="Password" required><br>
    <button>Masuk</button> <span id="err" class="muted"></span></form>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({
      email: document.getElementById('em').value,
      password: document.getElementById('pw').value,
    });
    if (error) document.getElementById('err').textContent = error.message;
    else location.reload();
  };
}

const logoutBtn = '<button id="lo" class="sec">Keluar</button>';
const bindLogout = () => (document.getElementById('lo').onclick = async () => { await sb.auth.signOut(); location.href = '/'; });

// ---- 3. Halaman ----
async function landing(t) {
  const [h, g, p] = await Promise.all([
    sb.from('halaman').select('judul').eq('tenant_id', t.id).eq('slug', 'beranda').maybeSingle(),
    sb.from('galeri').select('judul,gambar_url').eq('tenant_id', t.id).limit(12),
    sb.from('pengumuman').select('judul,isi').eq('tenant_id', t.id).eq('target', 'publik').order('created_at', { ascending: false }).limit(5),
  ]);
  app.innerHTML = layout(t, `
    <h1>${esc(h.data?.judul ?? t.nama)}</h1>
    <h3>Pengumuman</h3>${(p.data ?? []).map((x) => `<div class="card"><b>${esc(x.judul)}</b><br>${esc(x.isi)}</div>`).join('') || '<p class="muted">Belum ada.</p>'}
    <h3>Galeri</h3><div class="grid">${(g.data ?? []).map((x) => `<img src="${esc(x.gambar_url)}" alt="${esc(x.judul)}">`).join('')}</div>`);
}

async function adminView(t, roles) {
  const sub = location.pathname.split('/')[2] ?? '';
  app.innerHTML = layout(t, `
    <h2>Admin <span class="muted">(${esc(roles.join(', '))})</span></h2>
    <p><a href="/admin">Dashboard</a> · <a href="/admin/siswa">Siswa</a> ${logoutBtn}</p>
    <div id="page"></div>`);
  bindLogout();
  const page = document.getElementById('page');

  if (sub === 'siswa') return siswaPage(page, t, roles.some((r) => WRITERS.includes(r)));

  const count = async (table) => {
    const { count: n } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
    return n ?? 0;
  };
  const [s, g, k] = await Promise.all([count('siswa'), count('guru'), count('kelas')]);
  page.innerHTML = `<div class="cols">
    <div class="card"><h3>${s}</h3>Siswa</div>
    <div class="card"><h3>${g}</h3>Guru</div>
    <div class="card"><h3>${k}</h3>Kelas</div></div>`;
}

async function siswaView(t) {
  const [n, a] = await Promise.all([
    sb.from('nilai').select('jenis,skor,mata_pelajaran(nama)').order('created_at', { ascending: false }).limit(50),
    sb.from('absensi').select('tanggal,status').order('tanggal', { ascending: false }).limit(30),
  ]);
  app.innerHTML = layout(t, `<h2>Portal Siswa</h2><p>${logoutBtn}</p>
    <h3>Nilai</h3><table>${(n.data ?? []).map((r) => `<tr><td>${esc(r.mata_pelajaran?.nama)}</td><td>${esc(r.jenis)}</td><td>${esc(r.skor)}</td></tr>`).join('')}</table>
    <h3>Absensi</h3><table>${(a.data ?? []).map((r) => `<tr><td>${esc(r.tanggal)}</td><td>${esc(r.status)}</td></tr>`).join('')}</table>`);
  bindLogout();
}

// ---- 4. Router ----
(async function main() {
  const t = await resolveTenant();
  if (!t) { app.innerHTML = '<main><h2>Sekolah tidak ditemukan</h2></main>'; return; }
  document.title = t.nama;

  const area = location.pathname.split('/')[1];
  if (area !== 'admin' && area !== 'siswa') return landing(t);

  const roles = await myRoles(t.id);
  if (!roles) return loginView(t, area);
  const allowed = area === 'admin' ? roles.some((r) => STAFF.includes(r)) : roles.includes('siswa');
  if (!allowed) { app.innerHTML = layout(t, `<h2>Akses ditolak</h2><p>${logoutBtn}</p>`); return bindLogout(); }
  return area === 'admin' ? adminView(t, roles) : siswaView(t);
})();
