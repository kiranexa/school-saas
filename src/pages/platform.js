import { sb } from '../supabase.js';
import { esc, pill, pesan } from '../ui.js';

const STATUS_OPTS = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
  { value: 'suspended', label: 'Diblokir' },
];

export async function platformTenantsPage(el, canWrite) {
  if (!canWrite) {
    el.innerHTML = '<p class="msg err">Akses ditolak. Hanya platform owner/admin.</p>';
    return;
  }

  let rows = [], q = '', form = null, msg = '';

  async function load() {
    let query = sb.from('tenants').select('*').order('created_at', { ascending: false });
    const s = q.replace(/[,()%*\\]/g, ' ').trim();
    if (s) query = query.or(`nama.ilike.%${s}%,slug.ilike.%${s}%,npsn.ilike.%${s}%`);
    const { data, error } = await query.limit(200);
    if (error) { msg = error.message; draw(); return; }
    rows = data ?? [];
    draw();
  }

  function statusPill(s) {
    const map = { active: 'ok', inactive: 'mute', suspended: 'bad' };
    return `<span class="pill ${map[s] ?? 'mute'}">${s}</span>`;
  }

  function fieldHtml(f, v, isNew) {
    if (f.createOnly && !isNew) return '';
    const val = v[f.name];
    const lab = esc(f.label) + (f.required ? ' *' : '');
    if (f.type === 'select') {
      return `<label>${lab}<select name="${f.name}">${f.options.map((o) =>
        `<option value="${esc(o.value)}" ${String(val ?? '') === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    }
    return `<label>${lab}<input name="${f.name}" type="${f.type ?? 'text'}" value="${esc(val)}"></label>`;
  }

  async function save(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const isNew = !form.id;
    const rec = {
      slug: fd.get('slug').trim().toLowerCase() || null,
      nama: fd.get('nama').trim() || null,
      npsn: fd.get('npsn').trim() || null,
      jenjang: fd.get('jenjang').trim() || null,
      alamat: fd.get('alamat').trim() || null,
      logo_url: fd.get('logo_url').trim() || null,
      status: fd.get('status') || 'active',
      plan: fd.get('plan') || 'free',
    };
    const temaRaw = fd.get('tema').trim();
    if (temaRaw) {
      try { rec.tema = JSON.parse(temaRaw); } catch { msg = 'Format JSON tema tidak valid.'; draw(); return; }
    }

    const kosong = ['slug', 'nama'].find((k) => !rec[k]);
    if (kosong) { msg = `${kosong === 'slug' ? 'Slug' : 'Nama'} wajib diisi.`; draw(); return; }

    const { error } = isNew
      ? await sb.from('tenants').insert(rec)
      : await sb.from('tenants').update(rec).eq('id', form.id);
    if (error) { msg = error.code === '23505' ? 'Slug sudah dipakai.' : error.message; draw(); return; }

    form = null; msg = isNew ? 'Sekolah ditambahkan.' : 'Sekolah diupdate.';
    load();
  }

  function draw() {
    const isNew = !form?.id;
    const fields = [
      { name: 'slug', label: 'Slug (unik, untuk subdomain)', required: true, createOnly: true },
      { name: 'nama', label: 'Nama Sekolah', required: true },
      { name: 'npsn', label: 'NPSN' },
      { name: 'jenjang', label: 'Jenjang (SD/SMP/SMA/SMK)' },
      { name: 'alamat', label: 'Alamat' },
      { name: 'logo_url', label: 'Logo URL', type: 'url' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTS },
      { name: 'plan', label: 'Plan', type: 'select', options: [{value:'free',label:'Free'},{value:'basic',label:'Basic'},{value:'pro',label:'Pro'}] },
      { name: 'tema', label: 'Tema (JSON)', type: 'textarea' },
    ];

    el.innerHTML = `
      <h1 class="judul">Kelola Sekolah (Platform)</h1>
      ${pesan(msg)}
      <div class="toolbar">
        <input id="q" type="search" placeholder="Cari nama/slug/NPSN" value="${esc(q)}">
        <button id="go" class="sec">Cari</button>
        <button id="new">+ Tambah Sekolah</button>
        <span class="muted">${rows.length} sekolah</span>
      </div>
      ${form ? `<form id="sf" class="panel"><h3>${isNew ? 'Tambah' : 'Ubah'} Sekolah</h3>
        <div class="cols">${fields.map((f) => fieldHtml(f, form.v, isNew)).join('')}</div>
        <div class="baris"><button>Simpan</button><button type="button" class="sec" id="cancel">Batal</button></div></form>` : ''}
      <div class="tabel"><table>
        <thead><tr><th>Nama</th><th>Slug</th><th>NPSN</th><th>Jenjang</th><th>Status</th><th>Plan</th><th>Dibuat</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>${esc(r.nama)}</td><td><code>${esc(r.slug)}</code></td><td>${esc(r.npsn ?? '-')}</td>
          <td>${esc(r.jenjang ?? '-')}</td><td>${statusPill(r.status)}</td><td>${esc(r.plan)}</td>
          <td>${new Date(r.created_at).toLocaleDateString('id-ID')}</td>
          <td class="aksi"><button class="sec kecil" data-edit="${esc(r.id)}">Ubah</button></td>
        </tr>`).join('')}</tbody>
      </table>${rows.length === 0 ? '<p class="kosong">Belum ada sekolah.</p>' : ''}</div>`;

    const $ = (s) => el.querySelector(s);
    const goBtn = $('#go'); if (goBtn) goBtn.onclick = () => { q = $('#q').value; load(); };
    const qInput = $('#q'); if (qInput) qInput.onkeydown = (e) => { if (e.key === 'Enter') { q = e.target.value; load(); } };
    const newBtn = $('#new'); if (newBtn) newBtn.onclick = () => { form = { v: { status: 'active', plan: 'free' } }; msg = ''; draw(); };
    const cancelBtn = $('#cancel'); if (cancelBtn) cancelBtn.onclick = () => { form = null; draw(); };
    const sfForm = $('#sf'); if (sfForm) sfForm.onsubmit = save;
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
      const r = rows.find((x) => x.id === b.dataset.edit);
      form = { id: r.id, v: { ...r, tema: JSON.stringify(r.tema ?? {}, null, 2) } }; msg = ''; draw();
    });
  }

  await load();
}