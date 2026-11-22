import { sb } from '../supabase.js';
import { esc } from '../ui.js';

// Penempatan siswa di satu kelas: /admin/kelas/<id>
export async function kelasSiswaPage(el, t, canWrite, kelasId) {
  let msg = '';

  async function draw() {
    el.dataset.state = 'loading';
    const [k, ks, semua] = await Promise.all([
      sb.from('kelas').select('id,nama,tingkat,tahun_ajaran!tahun_ajaran_id(nama),guru!wali_guru_id(nama)')
        .eq('tenant_id', t.id).eq('id', kelasId).maybeSingle(),
      sb.from('kelas_siswa').select('id,siswa!siswa_id(id,nis,nama)').eq('tenant_id', t.id).eq('kelas_id', kelasId),
      canWrite
        ? sb.from('siswa').select('id,nis,nama').eq('tenant_id', t.id).eq('status', 'aktif').order('nama').limit(1000)
        : Promise.resolve({ data: [] }),
    ]);
    if (!k.data) {
      el.innerHTML = '<p>Kelas tidak ditemukan.</p><p><a href="/admin/kelas">← Kelas</a></p>';
      el.dataset.state = 'ready';
      return;
    }
    const anggota = (ks.data ?? []).filter((x) => x.siswa)
      .sort((a, b) => a.siswa.nama.localeCompare(b.siswa.nama));
    const sudah = new Set(anggota.map((x) => x.siswa.id));
    const kandidat = (semua.data ?? []).filter((s) => !sudah.has(s.id));

    el.innerHTML = `
      <p><a href="/admin/kelas">← Kelas</a></p>
      <h3>Kelas ${esc(k.data.nama)}</h3>
      <p class="muted">Tahun ajaran: ${esc(k.data.tahun_ajaran?.nama ?? '-')} · Wali kelas: ${esc(k.data.guru?.nama ?? '-')} · ${anggota.length} siswa</p>
      ${msg ? `<p class="muted">${esc(msg)}</p>` : ''}
      ${canWrite ? `<p><select id="sel" style="display:inline;width:auto"><option value="">— pilih siswa —</option>
        ${kandidat.map((s) => `<option value="${esc(s.id)}">${esc(s.nama)} (${esc(s.nis ?? '-')})</option>`).join('')}</select>
        <button id="add">Tambahkan</button></p>` : ''}
      <table><tr><th>NIS</th><th>Nama</th><th></th></tr>
        ${anggota.map((x) => `<tr><td>${esc(x.siswa.nis)}</td><td>${esc(x.siswa.nama)}</td>
          <td>${canWrite ? `<button class="danger" data-rm="${esc(x.id)}">Keluarkan</button>` : ''}</td></tr>`).join('')}
      </table>${anggota.length === 0 ? '<p class="muted">Belum ada siswa di kelas ini.</p>' : ''}`;

    if (el.querySelector('#add')) {
      el.querySelector('#add').onclick = async () => {
        const id = el.querySelector('#sel').value;
        if (!id) { msg = 'Pilih siswa dulu.'; return draw(); }
        const { error } = await sb.from('kelas_siswa').insert({ tenant_id: t.id, kelas_id: kelasId, siswa_id: id });
        msg = error ? (error.code === '23505' ? 'Siswa sudah ada di kelas ini.' : error.message) : 'Siswa ditambahkan.';
        draw();
      };
    }
    el.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      const { error } = await sb.from('kelas_siswa').delete().eq('id', b.dataset.rm).eq('tenant_id', t.id);
      msg = error ? error.message : 'Siswa dikeluarkan.';
      draw();
    });
    el.dataset.state = 'ready';
  }

  await draw();
}
