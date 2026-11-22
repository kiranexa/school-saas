import { sb } from '../supabase.js';
import { esc, pesan } from '../ui.js';

const STATUS = ['hadir', 'izin', 'sakit', 'alpa'];
const lokal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Absensi harian per kelas. Penyimpanan lewat RPC simpan_absensi_harian (atomik, RLS berlaku).
export async function absensiPage(el, t, canWrite) {
  let kelasId = '', tanggal = lokal(), murid = [], rec = {}, msg = '';
  const { data } = await sb.from('kelas').select('id,nama').eq('tenant_id', t.id).order('nama');
  const kelas = data ?? [];

  // Mengembalikan data tanpa mengubah state; hanya pemuatan terbaru yang boleh menggambar (lihat reload)
  async function ambil() {
    const hasil = { murid: [], rec: {} };
    if (!kelasId) return hasil;
    const { data: ks } = await sb.from('kelas_siswa').select('siswa!siswa_id(id,nis,nama)').eq('kelas_id', kelasId);
    hasil.murid = (ks ?? []).map((x) => x.siswa).filter(Boolean).sort((a, b) => a.nama.localeCompare(b.nama));
    if (!hasil.murid.length) return hasil;
    const { data: ab } = await sb.from('absensi').select('siswa_id,status,catatan')
      .eq('tanggal', tanggal).is('jadwal_id', null).in('siswa_id', hasil.murid.map((m) => m.id));
    for (const a of ab ?? []) hasil.rec[a.siswa_id] = a;
    return hasil;
  }

  function draw() {
    el.innerHTML = `
      <h1 class="judul">Absensi harian</h1>
      <div class="toolbar">
        <label>Kelas <select id="kelas"><option value="">— pilih —</option>
          ${kelas.map((k) => `<option value="${esc(k.id)}" ${k.id === kelasId ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>
        <label>Tanggal <input id="tgl" type="date" value="${esc(tanggal)}"></label>
        <button id="muat" class="sec">Muat</button>
      </div>
      ${pesan(msg)}
      ${kelasId ? `<div class="tabel"><table><thead><tr><th>NIS</th><th>Nama</th><th>Kehadiran</th><th>Catatan</th></tr></thead><tbody>
        ${murid.map((m) => { const cur = rec[m.id]?.status ?? 'hadir'; return `<tr><td>${esc(m.nis)}</td><td>${esc(m.nama)}</td>
          <td>${STATUS.map((s) => `<label class="opsi"><input type="radio" name="st-${esc(m.id)}" value="${s}" ${cur === s ? 'checked' : ''} ${canWrite ? '' : 'disabled'}>${s}</label>`).join('')}</td>
          <td><input data-cat="${esc(m.id)}" aria-label="Catatan ${esc(m.nama)}" value="${esc(rec[m.id]?.catatan)}" ${canWrite ? '' : 'disabled'}></td></tr>`; }).join('')}
        </tbody></table>${murid.length === 0 ? '<p class="kosong">Belum ada siswa di kelas ini.</p>' : ''}</div>
        ${canWrite && murid.length ? '<div class="baris"><button id="simpan">Simpan absensi</button></div>' : ''}`
        : '<p class="kosong">Pilih kelas dan tanggal untuk mengisi absensi.</p>'}`;
    bind();
    el.dataset.state = 'ready';
  }

  let seq = 0;
  async function reload() {
    const my = ++seq;
    el.dataset.state = 'loading';
    const h = await ambil();
    if (my !== seq) return;            // ada pemuatan yang lebih baru
    murid = h.murid; rec = h.rec;
    draw();
  }

  function bind() {
    const $ = (s) => el.querySelector(s);
    const muat = () => { kelasId = $('#kelas').value; tanggal = $('#tgl').value || tanggal; msg = ''; reload(); };
    $('#kelas').onchange = muat;
    $('#tgl').onchange = muat;
    $('#muat').onclick = muat;
    if ($('#simpan')) $('#simpan').onclick = save;
  }

  async function save() {
    if (el.querySelector('#tgl').value !== tanggal) { msg = 'Tanggal berubah. Klik Muat dulu.'; return draw(); }
    const payload = murid.map((m) => ({
      siswa_id: m.id,
      status: el.querySelector(`input[name="st-${m.id}"]:checked`)?.value ?? 'hadir',
      catatan: el.querySelector(`input[data-cat="${m.id}"]`)?.value ?? '',
    }));
    el.dataset.state = 'loading';
    const { data: n, error } = await sb.rpc('simpan_absensi_harian', { p_kelas_id: kelasId, p_tanggal: tanggal, p_data: payload });
    msg = error ? error.message : `Tersimpan (${n} siswa).`;
    await reload();
  }

  draw();
}
