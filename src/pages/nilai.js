import { sb } from '../supabase.js';
import { esc } from '../ui.js';

const JENIS = ['tugas', 'uh', 'uts', 'uas', 'praktik'];

// Input nilai per kelas + mapel + jenis. Penyimpanan lewat RPC simpan_nilai_kelas.
export async function nilaiPage(el, t, canWrite) {
  let kelasId = '', mapelId = '', jenis = '', murid = [], skor = {}, msg = '';
  const [k, m] = await Promise.all([
    sb.from('kelas').select('id,nama,tahun_ajaran_id').eq('tenant_id', t.id).order('nama'),
    sb.from('mata_pelajaran').select('id,nama').eq('tenant_id', t.id).order('nama'),
  ]);
  const kelas = k.data ?? [], mapel = m.data ?? [];

  async function ambil() {
    const hasil = { murid: [], skor: {} };
    if (!kelasId) return hasil;
    const { data: ks } = await sb.from('kelas_siswa').select('siswa!siswa_id(id,nis,nama)').eq('kelas_id', kelasId);
    hasil.murid = (ks ?? []).map((x) => x.siswa).filter(Boolean).sort((a, b) => a.nama.localeCompare(b.nama));
    if (!hasil.murid.length || !mapelId || !jenis) return hasil;
    const ta = kelas.find((x) => x.id === kelasId)?.tahun_ajaran_id;
    let q = sb.from('nilai').select('siswa_id,skor').eq('mapel_id', mapelId).eq('jenis', jenis).in('siswa_id', hasil.murid.map((x) => x.id));
    q = ta ? q.eq('tahun_ajaran_id', ta) : q.is('tahun_ajaran_id', null);
    const { data } = await q;
    for (const r of data ?? []) hasil.skor[r.siswa_id] = r.skor;
    return hasil;
  }

  const siap = () => kelasId && mapelId && jenis;

  function draw() {
    el.innerHTML = `
      <h3>Input Nilai</h3>
      <p><label style="display:inline">Kelas <select id="kelas" style="display:inline;width:auto"><option value="">— pilih —</option>
        ${kelas.map((x) => `<option value="${esc(x.id)}" ${x.id === kelasId ? 'selected' : ''}>${esc(x.nama)}</option>`).join('')}</select></label>
        <label style="display:inline">Mapel <select id="mapel" style="display:inline;width:auto"><option value="">— pilih —</option>
        ${mapel.map((x) => `<option value="${esc(x.id)}" ${x.id === mapelId ? 'selected' : ''}>${esc(x.nama)}</option>`).join('')}</select></label>
        <label style="display:inline">Jenis <input id="jenis" list="jenis-list" value="${esc(jenis)}" style="display:inline;width:140px"></label>
        <datalist id="jenis-list">${JENIS.map((j) => `<option value="${j}">`).join('')}</datalist>
        <button id="muat" class="sec">Muat</button></p>
      ${msg ? `<p class="muted">${esc(msg)}</p>` : ''}
      ${siap() ? `<table><tr><th>NIS</th><th>Nama</th><th>Skor (0-100)</th></tr>
        ${murid.map((s) => `<tr><td>${esc(s.nis)}</td><td>${esc(s.nama)}</td>
          <td><input type="number" min="0" max="100" step="0.01" data-skor="${esc(s.id)}" value="${esc(skor[s.id])}" style="width:100px" ${canWrite ? '' : 'disabled'}></td></tr>`).join('')}
        </table>${murid.length === 0 ? '<p class="muted">Belum ada siswa di kelas ini.</p>' : ''}
        ${canWrite && murid.length ? '<p><button id="simpan">Simpan nilai</button></p>' : ''}`
        : '<p class="muted">Pilih kelas, mata pelajaran, dan isi jenis nilai (mis. tugas 1, uh, uts), lalu klik Muat.</p>'}`;
    bind();
    el.dataset.state = 'ready';
  }

  let seq = 0;
  async function reload() {
    const my = ++seq;
    el.dataset.state = 'loading';
    const h = await ambil();
    if (my !== seq) return;            // ada pemuatan yang lebih baru
    murid = h.murid; skor = h.skor;
    draw();
  }

  function bind() {
    const $ = (s) => el.querySelector(s);
    $('#muat').onclick = () => {
      kelasId = $('#kelas').value; mapelId = $('#mapel').value; jenis = $('#jenis').value.trim(); msg = '';
      if (!siap()) { msg = 'Pilih kelas, mata pelajaran, dan jenis nilai.'; murid = []; return draw(); }
      reload();
    };
    if ($('#simpan')) $('#simpan').onclick = save;
  }

  async function save() {
    const payload = murid.map((s) => ({ siswa_id: s.id, skor: el.querySelector(`input[data-skor="${s.id}"]`).value }));
    el.dataset.state = 'loading';
    const { data: n, error } = await sb.rpc('simpan_nilai_kelas', { p_kelas_id: kelasId, p_mapel_id: mapelId, p_jenis: jenis, p_data: payload });
    msg = error ? error.message : `Tersimpan (${n} nilai).`;
    await reload();
  }

  draw();
}
