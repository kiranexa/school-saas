import { sb } from '../supabase.js';
import { esc, pesan } from '../ui.js';

// Penempatan siswa di satu kelas: /admin/kelas/<id>
export async function kelasSiswaPage(el, t, canWrite, kelasId) {
  let msg = '';

  async function draw() {
    el.dataset.state = 'loading';
    const [k, ks, semua] = await Promise.all([
      sb.from('kelas').select('id,nama,tingkat,tahun_ajaran!tahun_ajaran_id(nama),guru!wali_guru_id(nama)')
        .eq('tenant_id', t.id).eq('id', kelasId).maybeSingle(),
      sb.from('kelas_siswa').select('id,siswa!siswa_id(id,nis,nama,status)').eq('tenant_id', t.id).eq('kelas_id', kelasId),
      canWrite
        ? sb.from('siswa').select('id,nis,nama').eq('tenant_id', t.id).eq('status', 'aktif').order('nama').limit(1000)
        : Promise.resolve({ data: [] }),
    ]);
    if (!k.data) {
      el.innerHTML = '<h1 class="judul">Kelas tidak ditemukan</h1><a class="kembali" href="/admin/kelas">Kembali ke daftar kelas</a>';
      el.dataset.state = 'ready';
      return;
    }
    const anggota = (ks.data ?? []).filter((x) => x.siswa)
      .sort((a, b) => a.siswa.nama.localeCompare(b.siswa.nama));
    const sudah = new Set(anggota.map((x) => x.siswa.id));
    const kandidat = (semua.data ?? []).filter((s) => !sudah.has(s.id));

    el.innerHTML = `
      <a class="kembali" href="/admin/kelas">Kembali ke daftar kelas</a>
      <h1 class="judul">Kelas ${esc(k.data.nama)}</h1>
      <p class="sub">Tahun ajaran ${esc(k.data.tahun_ajaran?.nama ?? '-')}. Wali kelas ${esc(k.data.guru?.nama ?? '-')}. Jumlah siswa ${anggota.length}.</p>
      ${pesan(msg)}
      ${canWrite ? `<div class="toolbar"><select id="sel" aria-label="Siswa yang akan ditambahkan"><option value="">— pilih siswa —</option>
        ${kandidat.map((s) => `<option value="${esc(s.id)}">${esc(s.nama)} (${esc(s.nis ?? '-')})</option>`).join('')}</select>
        <button id="add">Tambahkan</button></div>` : ''}
      <div class="tabel"><table><thead><tr><th>NIS</th><th>Nama</th><th></th></tr></thead><tbody>
        ${anggota.map((x) => `<tr><td>${esc(x.siswa.nis)}</td><td>${esc(x.siswa.nama)}</td>
          <td class="aksi">${canWrite ? `<button class="danger kecil" data-rm="${esc(x.id)}">Keluarkan</button>` : ''}</td></tr>`).join('')}
      </tbody></table>${anggota.length === 0 ? '<p class="kosong">Belum ada siswa di kelas ini.</p>' : ''}</div>`;

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
