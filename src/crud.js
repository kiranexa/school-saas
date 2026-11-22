import { sb } from './supabase.js';
import { esc } from './ui.js';

const friendly = (error, aksi, cfg) => {
  if (error.code === '23505') return cfg.dupMessage ?? 'Data duplikat.';
  if (error.code === '23503') {
    return aksi === 'hapus' ? 'Data masih dipakai oleh data lain, tidak bisa dihapus.' : 'Data terkait tidak valid.';
  }
  return error.message;
};

/**
 * Halaman CRUD generik berbasis konfigurasi.
 * cfg: { title, singular, table, select, order, search[], columns[{label,get}], fields[], defaults,
 *        dupMessage, actions[{label,href}], deleteWarn(r), extra() }
 * field: { name, label, type, required, options | lookup{table,select,label,filter}, step, createOnly }
 */
export async function crudPage(el, t, canWrite, cfg) {
  const orders = [].concat(cfg.order);
  const lookups = {};
  let rows = [], q = '', form = null, msg = '';

  async function loadLookups() {
    await Promise.all(cfg.fields.filter((f) => f.lookup).map(async (f) => {
      const lk = f.lookup;
      const { data } = await sb.from(lk.table).select(lk.select).eq('tenant_id', t.id).limit(1000);
      lookups[f.name] = (data ?? []).filter(lk.filter ?? (() => true))
        .map((r) => ({ value: r.id, label: lk.label(r) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }));
  }

  const fieldHtml = (f, v, isNew) => {
    if (f.createOnly && !isNew) return '';
    const val = v[f.name];
    const lab = esc(f.label) + (f.required ? ' *' : '');
    if (f.type === 'checkbox') {
      return `<label><input type="checkbox" name="${f.name}" style="display:inline;width:auto" ${val ? 'checked' : ''}> ${esc(f.label)}</label>`;
    }
    if (f.lookup || f.type === 'select') {
      const opts = f.lookup ? [{ value: '', label: '—' }, ...(lookups[f.name] ?? [])] : f.options;
      return `<label>${lab}<select name="${f.name}">${opts.map((o) =>
        `<option value="${esc(o.value)}" ${String(val ?? '') === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    }
    return `<label>${lab}<input name="${f.name}" type="${f.type ?? 'text'}" ${f.step ? `step="${f.step}"` : ''} value="${esc(val)}"></label>`;
  };

  function draw() {
    const isNew = !form?.id;
    el.innerHTML = `
      <h3>${esc(cfg.title)} (${rows.length})</h3>
      ${msg ? `<p class="muted">${esc(msg)}</p>` : ''}
      <p>${cfg.search ? `<input id="q" placeholder="Cari ${esc(cfg.search.join(' / '))}" value="${esc(q)}"> <button id="go" class="sec">Cari</button> ` : ''}${canWrite ? '<button id="new">+ Tambah</button>' : ''}</p>
      ${form ? `<form id="sf" class="card"><h3>${isNew ? 'Tambah' : 'Ubah'} ${esc(cfg.singular ?? cfg.title)}</h3>
        <div class="cols">${cfg.fields.map((f) => fieldHtml(f, form.v, isNew)).join('')}</div>
        <button>Simpan</button> <button type="button" class="sec" id="cancel">Batal</button></form>` : ''}
      <div style="overflow-x:auto"><table>
        <tr>${cfg.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr>
        ${rows.map((r) => `<tr>${cfg.columns.map((c) => `<td>${esc(c.get(r))}</td>`).join('')}<td>
          ${(cfg.actions ?? []).map((a) => `<a href="${esc(a.href(r))}">${esc(a.label)}</a> `).join('')}
          ${canWrite ? `<button class="sec" data-edit="${esc(r.id)}">Ubah</button> <button class="danger" data-del="${esc(r.id)}">Hapus</button>` : ''}</td></tr>`).join('')}
      </table></div>
      ${rows.length === 0 ? '<p class="muted">Belum ada data.</p>' : ''}`;
    bind();
  }

  function bind() {
    const $ = (s) => el.querySelector(s);
    if ($('#go')) $('#go').onclick = () => { q = $('#q').value; load(); };
    if ($('#q')) $('#q').onkeydown = (e) => { if (e.key === 'Enter') { q = e.target.value; load(); } };
    if ($('#new')) $('#new').onclick = () => { form = { v: { ...(cfg.defaults ?? {}) } }; msg = ''; draw(); };
    if ($('#cancel')) $('#cancel').onclick = () => { form = null; draw(); };
    if ($('#sf')) $('#sf').onsubmit = save;
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
      const r = rows.find((x) => x.id === b.dataset.edit);
      form = { id: r.id, v: { ...r } }; msg = ''; draw();
    });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => remove(b.dataset.del));
  }

  async function load() {
    let query = sb.from(cfg.table).select(cfg.select ?? '*').eq('tenant_id', t.id);
    for (const o of orders) query = Array.isArray(o) ? query.order(o[0], o[1]) : query.order(o);
    const s = q.replace(/[,()%*\\]/g, ' ').trim();
    if (s && cfg.search) query = query.or(cfg.search.map((c) => `${c}.ilike.%${s}%`).join(','));
    const { data, error } = await query.limit(200);
    if (error) msg = error.message;
    rows = data ?? [];
    draw();
  }

  async function save(e) {
    e.preventDefault();
    const isNew = !form.id;
    const fd = new FormData(e.target);
    const rec = {};
    for (const f of cfg.fields) {
      if (f.createOnly && !isNew) continue;
      if (f.type === 'checkbox') { rec[f.name] = fd.has(f.name); continue; }
      const s = String(fd.get(f.name) ?? '').trim();
      rec[f.name] = s === '' ? null : (f.type === 'number' ? Number(s) : s);
    }
    form.v = { ...form.v, ...rec };
    const kosong = cfg.fields.find((f) => f.required && !(f.createOnly && !isNew) && rec[f.name] === null);
    if (kosong) { msg = `${kosong.label} wajib diisi.`; return draw(); }

    const extra = isNew && cfg.extra ? await cfg.extra() : {};
    const { error } = isNew
      ? await sb.from(cfg.table).insert({ ...rec, ...extra, tenant_id: t.id })
      : await sb.from(cfg.table).update(rec).eq('id', form.id).eq('tenant_id', t.id);
    if (error) { msg = friendly(error, 'simpan', cfg); return draw(); }
    form = null; msg = 'Tersimpan.';
    load();
  }

  async function remove(id) {
    const r = rows.find((x) => x.id === id);
    const warn = cfg.deleteWarn ? cfg.deleteWarn(r) : 'Data yang terkait mungkin ikut terhapus.';
    if (!confirm(`Hapus data ini?\n${warn}`)) return;
    const { error } = await sb.from(cfg.table).delete().eq('id', id).eq('tenant_id', t.id);
    msg = error ? friendly(error, 'hapus', cfg) : 'Terhapus.';
    load();
  }

  await loadLookups();
  await load();
}
