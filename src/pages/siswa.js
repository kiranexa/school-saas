import { sb } from '../supabase.js';
import { esc } from '../ui.js';

const STATUS = ['aktif', 'nonaktif', 'lulus', 'pindah', 'cuti'];
const FIELDS = ['nis', 'nisn', 'nama', 'jk', 'tgl_lahir', 'telepon', 'alamat', 'nama_wali', 'telepon_wali', 'status'];

// el: elemen tempat halaman dirender, t: sekolah, canWrite: boleh tambah/ubah/hapus
export function siswaPage(el, t, canWrite) {
  let rows = [], q = '', form = null, msg = '';   // form = { id?, v } | null

  const field = (name, label, v, type = 'text') =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(v[name])}"></label>`;
  const select = (name, label, opts, cur) =>
    `<label>${label}<select name="${name}">${opts.map((o) =>
      `<option value="${esc(o)}" ${cur === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;

  function formHtml() {
    const v = form.v;
    return `<form id="sf" class="card">
      <h3>${form.id ? 'Ubah siswa' : 'Tambah siswa'}</h3>
      <div class="cols">
        ${field('nama', 'Nama *', v)} ${field('nis', 'NIS', v)} ${field('nisn', 'NISN', v)}
        ${select('jk', 'Jenis kelamin', ['', 'L', 'P'], v.jk ?? '')}
        ${field('tgl_lahir', 'Tanggal lahir', v, 'date')} ${field('telepon', 'Telepon', v)}
        ${field('alamat', 'Alamat', v)} ${field('nama_wali', 'Nama wali', v)}
        ${field('telepon_wali', 'Telepon wali', v)}
        ${select('status', 'Status', STATUS, v.status ?? 'aktif')}
      </div>
      <button>Simpan</button> <button type="button" class="sec" id="cancel">Batal</button>
    </form>`;
  }

  function draw() {
    el.innerHTML = `
      <h3>Data Siswa (${rows.length})</h3>
      ${msg ? `<p class="muted">${esc(msg)}</p>` : ''}
      <p><input id="q" placeholder="Cari nama / NIS" value="${esc(q)}">
         <button id="go" class="sec">Cari</button>
         ${canWrite ? '<button id="new">+ Tambah</button>' : ''}</p>
      ${form ? formHtml() : ''}
      <div style="overflow-x:auto"><table>
        <tr><th>NIS</th><th>Nama</th><th>JK</th><th>Wali</th><th>Status</th><th></th></tr>
        ${rows.map((r) => `<tr><td>${esc(r.nis)}</td><td>${esc(r.nama)}</td><td>${esc(r.jk)}</td>
          <td>${esc(r.nama_wali)}</td><td>${esc(r.status)}</td>
          <td>${canWrite ? `<button class="sec" data-edit="${esc(r.id)}">Ubah</button>
            <button class="danger" data-del="${esc(r.id)}">Hapus</button>` : ''}</td></tr>`).join('')}
      </table></div>
      ${rows.length === 0 ? '<p class="muted">Belum ada data.</p>' : ''}`;
    bind();
  }

  function bind() {
    const $ = (s) => el.querySelector(s);
    $('#go').onclick = () => { q = $('#q').value; load(); };
    $('#q').onkeydown = (e) => { if (e.key === 'Enter') { q = e.target.value; load(); } };
    if ($('#new')) $('#new').onclick = () => { form = { v: { status: 'aktif' } }; msg = ''; draw(); };
    if ($('#cancel')) $('#cancel').onclick = () => { form = null; draw(); };
    if ($('#sf')) $('#sf').onsubmit = save;
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
      const r = rows.find((x) => x.id === b.dataset.edit);
      form = { id: r.id, v: { ...r } }; msg = ''; draw();
    });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => remove(b.dataset.del));
  }

  async function load() {
    let query = sb.from('siswa').select('*').eq('tenant_id', t.id).order('nama').limit(200);
    const s = q.replace(/[,()%*\\]/g, ' ').trim();
    if (s) query = query.or(`nama.ilike.%${s}%,nis.ilike.%${s}%`);
    const { data, error } = await query;
    if (error) msg = error.message;
    rows = data ?? [];
    draw();
  }

  async function save(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const rec = {};
    for (const f of FIELDS) {
      const s = String(fd.get(f) ?? '').trim();
      rec[f] = s === '' ? null : s;
    }
    form.v = { ...form.v, ...rec };
    if (!rec.nama) { msg = 'Nama wajib diisi.'; return draw(); }
    rec.status = rec.status ?? 'aktif';

    const { error } = form.id
      ? await sb.from('siswa').update(rec).eq('id', form.id).eq('tenant_id', t.id)
      : await sb.from('siswa').insert({ ...rec, tenant_id: t.id });

    if (error) {
      msg = error.code === '23505' ? 'NIS sudah dipakai siswa lain.' : error.message;
      return draw();
    }
    form = null; msg = 'Tersimpan.';
    load();
  }

  async function remove(id) {
    const r = rows.find((x) => x.id === id);
    if (!confirm(`Hapus ${r.nama}?\nAbsensi, nilai, dan tagihan siswa ini ikut terhapus.\nLebih aman: ubah status menjadi nonaktif.`)) return;
    const { error } = await sb.from('siswa').delete().eq('id', id).eq('tenant_id', t.id);
    msg = error ? error.message : 'Terhapus.';
    load();
  }

  return load();
}
