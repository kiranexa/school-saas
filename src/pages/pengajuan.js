import { sb } from '../supabase.js';
import { esc, pill, pesan } from '../ui.js';

// Biaya pendaftaran dan rekening tidak ditulis langsung: admin/TU mengajukan,
// kepala sekolah menyetujui (fungsi database ajukan_perubahan / setujui_pengajuan / dst.).
// Penjagaan sebenarnya ada di database; kode ini hanya menyembunyikan tombol yang tidak berlaku.

const PENGAJU = ['admin', 'tu'];
const PENYETUJU = ['kepala_sekolah', 'owner'];

const rupiah = (n) => `Rp ${Number(n ?? 0).toLocaleString('id-ID')}`;
const ya = (v) => (v ? 'ya' : 'tidak');
const tglJam = (s) => (s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '');

const JENIS = [
  { value: 'transfer', label: 'Transfer bank' },
  { value: 'virtual_account', label: 'Virtual account' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'tunai', label: 'Tunai' },
];
const jenisLabel = (v) => JENIS.find((j) => j.value === v)?.label ?? v;

export const ENTITAS = {
  komponen_biaya: {
    judul: 'Biaya Pendaftaran', singular: 'komponen biaya', order: [['urutan', {}], ['nama', {}]],
    defaults: { wajib: true, aktif: true, urutan: 0 },
    fields: [
      { name: 'nama', label: 'Nama komponen (mis. Uang gedung)', required: true },
      { name: 'nominal', label: 'Nominal (Rp)', type: 'number', required: true, fmt: rupiah },
      { name: 'wajib', label: 'Wajib dibayar', type: 'checkbox', fmt: ya },
      { name: 'aktif', label: 'Aktif (tampil di pendaftaran)', type: 'checkbox', fmt: ya },
      { name: 'urutan', label: 'Urutan tampil', type: 'number' },
    ],
    columns: [
      { label: 'Komponen', get: (r) => r.nama }, { label: 'Nominal', get: (r) => rupiah(r.nominal) },
      { label: 'Wajib', get: (r) => ya(r.wajib) }, { label: 'Status', get: (r) => (r.aktif ? 'aktif' : 'nonaktif'), pill: true },
    ],
    nama: (d) => d.nama,
    ringkas: (rows) => {
      const total = rows.filter((r) => r.aktif && r.wajib).reduce((s, r) => s + Number(r.nominal), 0);
      return `Total biaya wajib (komponen aktif): <b>${esc(rupiah(total))}</b>`;
    },
  },
  metode_pembayaran: {
    judul: 'Rekening dan Metode Pembayaran', singular: 'metode pembayaran', order: [['urutan', {}], ['penyedia', {}]],
    defaults: { jenis: 'transfer', aktif: true, urutan: 0 },
    fields: [
      { name: 'jenis', label: 'Jenis', type: 'select', options: JENIS, required: true, fmt: jenisLabel },
      { name: 'penyedia', label: 'Nama bank / penyedia (mis. BCA, GoPay, Kasir TU)', required: true },
      { name: 'nomor', label: 'Nomor rekening / VA / e-wallet' },
      { name: 'atas_nama', label: 'Atas nama' },
      { name: 'instruksi', label: 'Instruksi untuk orang tua', type: 'textarea' },
      { name: 'aktif', label: 'Aktif (tampil di pendaftaran)', type: 'checkbox', fmt: ya },
      { name: 'urutan', label: 'Urutan tampil', type: 'number' },
    ],
    columns: [
      { label: 'Jenis', get: (r) => jenisLabel(r.jenis) }, { label: 'Bank / penyedia', get: (r) => r.penyedia },
      { label: 'Nomor', get: (r) => r.nomor }, { label: 'Atas nama', get: (r) => r.atas_nama },
      { label: 'Status', get: (r) => (r.aktif ? 'aktif' : 'nonaktif'), pill: true },
    ],
    nama: (d) => [d.penyedia, d.nomor].filter(Boolean).join(' '),
    ringkas: () => '',
  },
};

const fmtNilai = (f, v) => (v === null || v === undefined || v === '' ? '—' : (f.fmt ? f.fmt(v) : String(v)));

// Teks perubahan: 'ubah' = hanya kolom yang berbeda; 'buat' = semua isian
function rincian(cfg, p) {
  const baris = [];
  for (const f of cfg.fields) {
    const baru = p.data?.[f.name];
    if (p.aksi === 'ubah') {
      const lama = p.data_lama?.[f.name];
      if (JSON.stringify(lama ?? null) === JSON.stringify(baru ?? null)) continue;
      baris.push(`<li><span class="muted">${esc(f.label.replace(/ \(.*\)$/, ''))}:</span> ${esc(fmtNilai(f, lama))} → <b>${esc(fmtNilai(f, baru))}</b></li>`);
    } else if (baru !== null && baru !== undefined && baru !== '') {
      baris.push(`<li><span class="muted">${esc(f.label.replace(/ \(.*\)$/, ''))}:</span> ${esc(fmtNilai(f, baru))}</li>`);
    }
  }
  return `<ul class="rincian">${baris.join('')}</ul>`;
}

const galat = (e) => (e.code === '23505' ? 'Sudah ada pengajuan yang menunggu untuk data ini. Batalkan atau tunggu keputusannya.' : e.message);

/**
 * entitas: 'komponen_biaya' | 'metode_pembayaran' | null (null = halaman Persetujuan: semua pengajuan)
 */
export async function pengajuanPage(el, t, roles, entitas) {
  const bisaAjukan = roles.some((r) => PENGAJU.includes(r));
  const bisaPutuskan = roles.some((r) => PENYETUJU.includes(r));
  const cfg = entitas ? ENTITAS[entitas] : null;
  const { data: { user } } = await sb.auth.getUser();

  let rows = [], daftar = [], form = null, msg = '', rev = 0;

  async function load() {
    const my = ++rev;
    el.dataset.state = 'loading';
    const [live, pj] = await Promise.all([
      entitas
        ? (() => { let q = sb.from(entitas).select('*').eq('tenant_id', t.id); for (const [k, o] of cfg.order) q = q.order(k, o); return q.limit(200); })()
        : { data: [] },
      (() => {
        let q = sb.from('pengajuan_perubahan').select('*').eq('tenant_id', t.id);
        if (entitas) q = q.eq('entitas', entitas);
        return q.order('diajukan_at', { ascending: false }).limit(100);
      })(),
    ]);
    if (my !== rev) return;                        // ada pemuatan yang lebih baru
    if (live.error || pj.error) msg = (live.error ?? pj.error).message;
    rows = live.data ?? [];
    daftar = pj.data ?? [];
    draw();
    el.dataset.state = 'ready';
  }

  const fieldHtml = (f, v) => {
    const val = v[f.name];
    const lab = esc(f.label) + (f.required ? ' *' : '');
    if (f.type === 'checkbox') return `<label><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}>${esc(f.label)}</label>`;
    if (f.type === 'select') {
      return `<label>${lab}<select name="${f.name}">${f.options.map((o) =>
        `<option value="${esc(o.value)}" ${String(val ?? '') === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    }
    if (f.type === 'textarea') return `<label>${lab}<textarea name="${f.name}" rows="3" maxlength="1000">${esc(val)}</textarea></label>`;
    return `<label>${lab}<input name="${f.name}" type="${f.type ?? 'text'}" ${f.type === 'number' ? 'step="any" min="0"' : ''} value="${esc(val)}"></label>`;
  };

  function kartuPengajuan(p, menunggu) {
    const c = ENTITAS[p.entitas];
    const sendiri = p.diajukan_oleh === user.id;
    const aksi = [];
    if (menunggu && bisaPutuskan && !sendiri) {
      aksi.push(`<button data-setujui="${esc(p.id)}">Setujui</button><button class="danger kecil" data-tolak="${esc(p.id)}">Tolak</button>`);
    }
    if (menunggu && sendiri && bisaAjukan) aksi.push(`<button class="sec kecil" data-batal="${esc(p.id)}">Batalkan</button>`);
    return `<article class="panel pengajuan" data-pengajuan="${esc(p.id)}">
      <h3>${esc(c.judul)}: ${p.aksi === 'buat' ? 'data baru' : 'ubah'} “${esc(c.nama(p.data))}”</h3>
      ${rincian(c, p)}
      <p class="muted">Diajukan ${esc(p.diajukan_email ?? '—')} · ${esc(tglJam(p.diajukan_at))}${p.catatan ? ` · Catatan: ${esc(p.catatan)}` : ''}</p>
      ${!menunggu ? `<p>${pill(p.status)} <span class="muted">${esc(p.diputuskan_email ?? '')} · ${esc(tglJam(p.diputuskan_at))}${p.catatan_keputusan ? ` · ${esc(p.catatan_keputusan)}` : ''}</span></p>` : ''}
      ${aksi.length ? `<div class="baris">${aksi.join('')}</div>` : ''}
      ${menunggu && bisaPutuskan && sendiri ? '<p class="muted">Anda tidak bisa menyetujui pengajuan Anda sendiri.</p>' : ''}
    </article>`;
  }

  function draw() {
    const menunggu = daftar.filter((p) => p.status === 'menunggu');
    const riwayat = daftar.filter((p) => p.status !== 'menunggu').slice(0, 20);
    const judul = cfg ? cfg.judul : 'Persetujuan';
    el.innerHTML = `
      <h1 class="judul">${esc(judul)}</h1>
      <p class="sub">${cfg
        ? 'Perubahan diajukan admin atau TU dan baru berlaku setelah disetujui kepala sekolah. Selama menunggu, data lama tetap berlaku.'
        : 'Pengajuan perubahan biaya dan rekening yang menunggu keputusan kepala sekolah.'}</p>
      ${pesan(msg)}
      ${cfg ? `<div class="toolbar">${bisaAjukan ? '<button id="new">+ Ajukan data baru</button>' : ''}<span class="muted">${rows.length} data berlaku</span>
        ${cfg.ringkas(rows) ? `<span>${cfg.ringkas(rows)}</span>` : ''}</div>` : ''}
      ${form ? `<form id="sf" class="panel"><h3>${form.id ? 'Ajukan perubahan' : 'Ajukan'} ${esc(cfg.singular)}</h3>
        <div class="cols">${cfg.fields.map((f) => fieldHtml(f, form.v)).join('')}
          <label>Catatan untuk kepala sekolah (opsional)<input name="_catatan" maxlength="500"></label></div>
        <div class="baris"><button>Kirim pengajuan</button><button type="button" class="sec" id="cancel">Batal</button></div></form>` : ''}
      ${cfg ? `<h2>Data yang berlaku</h2><div class="tabel"><table>
        <thead><tr>${cfg.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr>${cfg.columns.map((c) => `<td>${c.pill ? pill(c.get(r)) : esc(c.get(r))}</td>`).join('')}
          <td class="aksi">${bisaAjukan ? `<button class="sec kecil" data-edit="${esc(r.id)}">Ajukan ubah</button>` : ''}</td></tr>`).join('')}</tbody>
        </table>${rows.length === 0 ? '<p class="kosong">Belum ada data yang berlaku.</p>' : ''}</div>` : ''}
      <h2>Menunggu persetujuan <span class="muted">(${menunggu.length})</span></h2>
      <div id="menunggu">${menunggu.map((p) => kartuPengajuan(p, true)).join('') || '<p class="kosong">Tidak ada pengajuan yang menunggu.</p>'}</div>
      <h2>Riwayat</h2>
      <div id="riwayat">${riwayat.map((p) => kartuPengajuan(p, false)).join('') || '<p class="kosong">Belum ada riwayat.</p>'}</div>`;
    bind();
  }

  async function panggil(fn, args, sukses) {
    const { error } = await sb.rpc(fn, args);
    msg = error ? galat(error) : sukses;
    if (!error) form = null;
    return load();
  }

  function bind() {
    const $ = (s) => el.querySelector(s);
    if ($('#new')) $('#new').onclick = () => { form = { v: { ...cfg.defaults } }; msg = ''; draw(); };
    if ($('#cancel')) $('#cancel').onclick = () => { form = null; draw(); };
    if ($('#sf')) $('#sf').onsubmit = kirim;
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
      const r = rows.find((x) => x.id === b.dataset.edit);
      form = { id: r.id, v: { ...r } }; msg = ''; draw();
      el.querySelector('#sf')?.scrollIntoView({ block: 'nearest' });
    });
    el.querySelectorAll('[data-setujui]').forEach((b) => b.onclick = () => {
      if (confirm('Setujui pengajuan ini? Perubahan langsung berlaku.')) panggil('setujui_pengajuan', { p_id: b.dataset.setujui }, 'Pengajuan disetujui.');
    });
    el.querySelectorAll('[data-tolak]').forEach((b) => b.onclick = () => {
      const alasan = prompt('Alasan penolakan (opsional):');
      if (alasan === null) return;
      panggil('tolak_pengajuan', { p_id: b.dataset.tolak, p_catatan: alasan }, 'Pengajuan ditolak.');
    });
    el.querySelectorAll('[data-batal]').forEach((b) => b.onclick = () => {
      if (confirm('Batalkan pengajuan ini?')) panggil('batalkan_pengajuan', { p_id: b.dataset.batal }, 'Pengajuan dibatalkan.');
    });
  }

  async function kirim(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {};
    for (const f of cfg.fields) {
      if (f.type === 'checkbox') { data[f.name] = fd.has(f.name); continue; }
      const s = String(fd.get(f.name) ?? '').trim();
      data[f.name] = s === '' ? null : s;          // angka dikirim apa adanya; database yang memvalidasi
    }
    form.v = { ...form.v, ...data };
    const kosong = cfg.fields.find((f) => f.required && data[f.name] === null);
    if (kosong) { msg = `${kosong.label.replace(/ \(.*\)$/, '')} wajib diisi.`; return draw(); }
    await panggil('ajukan_perubahan', {
      p_tenant: t.id, p_entitas: entitas, p_entitas_id: form.id ?? null, p_data: data,
      p_catatan: String(fd.get('_catatan') ?? '').trim() || null,
    }, 'Pengajuan terkirim. Menunggu persetujuan kepala sekolah.');
  }

  await load();
}
