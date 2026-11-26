import { sb } from '../supabase.js';
import { esc, pill, pesan, shellPublik, bindTema } from '../ui.js';

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const tgl = (s) => (s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// =====================================================================
// 1. HALAMAN PUBLIK: FORMULIR PPDB & CEK STATUS / KONFIRMASI BAYAR
// =====================================================================
export async function ppdbPublikView(app, t) {
  const awalTab = new URLSearchParams(location.search).get('tab') === 'cek' ? 'cek' : 'daftar';
  let tab = awalTab;

  const [{ data: gelList }, { data: jurList }, { data: rekList }] = await Promise.all([
    sb.from('gelombang_pendaftaran').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false }),
    sb.from('jurusan').select('id, kode, nama').eq('tenant_id', t.id).eq('aktif', true).order('nama'),
    sb.from('metode_pembayaran').select('id, jenis, penyedia, nomor, atas_nama, instruksi').eq('tenant_id', t.id).eq('aktif', true).order('urutan'),
  ]);

  const terbuka = gelList ?? [];
  const jurusan = jurList ?? [];
  const rekening = rekList ?? [];
  let hasilDaftar = null;
  let hasilCek = null;
  let kredensialCek = { nomor_registrasi: '', pin_akses: '' };
  let msg = '';

  function render() {
    app.innerHTML = shellPublik(t, `
      <section class="buku">
        <h1>Pendaftaran Siswa Baru</h1>
        <p class="meta">${esc(t.nama)}</p>
        <div class="baris" style="margin-top:1rem">
          <button type="button" id="tab-daftar" class="${tab === 'daftar' ? '' : 'sec'}">Formulir Pendaftaran</button>
          <button type="button" id="tab-cek" class="${tab === 'cek' ? '' : 'sec'}">Cek Status &amp; Konfirmasi Bayar</button>
        </div>
      </section>

      ${pesan(msg)}

      ${tab === 'daftar' ? `
        <section class="bagian">
          ${hasilDaftar ? `
            <div class="panel" style="border-left:4px solid var(--brand)">
              <h2>Pendaftaran Berhasil</h2>
              <p>Simpan Nomor Registrasi dan PIN Akses berikut untuk mengecek status kelulusan serta konfirmasi pembayaran:</p>
              <p><strong>Nomor Registrasi:</strong> <code id="out-noreg">${esc(hasilDaftar.nomor_registrasi)}</code><br>
                 <strong>PIN Akses:</strong> <code id="out-pin">${esc(hasilDaftar.pin_akses)}</code><br>
                 <strong>Biaya Pendaftaran:</strong> ${esc(rupiah(hasilDaftar.biaya_daftar))}</p>
              <div class="baris">
                <button type="button" id="lanjut-cek">Lanjut Cek Status / Konfirmasi Bayar</button>
                <button type="button" class="sec" id="daftar-lagi">Daftarkan Siswa Lain</button>
              </div>
            </div>
          ` : terbuka.length === 0 ? `
            <div class="panel">
              <h2>Pendaftaran Belum Dibuka</h2>
              <p class="kosong">Saat ini belum ada gelombang pendaftaran yang dibuka untuk ${esc(t.nama)}.</p>
            </div>
          ` : `
            <form id="f-ppdb" class="panel">
              <h2>Isi Formulir Calon Siswa</h2>
              <div class="cols">
                <label>Gelombang pendaftaran *
                  <select name="gelombang_id" required>
                    ${terbuka.map((g) => `<option value="${esc(g.id)}">${esc(g.nama)} (${esc(rupiah(g.biaya_daftar))})</option>`).join('')}
                  </select>
                </label>
                ${jurusan.length ? `
                  <label>Pilihan jurusan *
                    <select name="jurusan_id" required>
                      <option value="">-- Pilih jurusan --</option>
                      ${jurusan.map((j) => `<option value="${esc(j.id)}">${esc(j.nama)}</option>`).join('')}
                    </select>
                  </label>
                ` : '<input type="hidden" name="jurusan_id" value="">'}
                <label>Nama lengkap calon siswa *<input name="nama_lengkap" required maxlength="150"></label>
                <label>NIK<input name="nik" maxlength="20"></label>
                <label>Jenis kelamin *
                  <select name="jenis_kelamin" required>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </label>
                <label>Tempat lahir<input name="tempat_lahir" maxlength="100"></label>
                <label>Tanggal lahir<input name="tanggal_lahir" type="date"></label>
                <label>Asal sekolah<input name="asal_sekolah" maxlength="150"></label>
                <label>Nama orang tua / wali *<input name="nama_wali" required maxlength="150"></label>
                <label>No. HP / WhatsApp wali *<input name="no_hp_wali" type="tel" required maxlength="30"></label>
                <label>Alamat lengkap<textarea name="alamat" rows="2" maxlength="500"></textarea></label>
              </div>
              <div class="baris" style="margin-top:1rem"><button>Kirim Pendaftaran</button></div>
            </form>
          `}
        </section>
      ` : `
        <section class="bagian">
          <form id="f-cek" class="panel">
            <h2>Cek Status Pendaftaran</h2>
            <div class="cols">
              <label>Nomor registrasi *<input name="nomor_registrasi" value="${esc(kredensialCek.nomor_registrasi)}" placeholder="PPDB-2026-XXXXXX" required></label>
              <label>PIN akses *<input name="pin_akses" value="${esc(kredensialCek.pin_akses)}" placeholder="6 digit PIN" required></label>
            </div>
            <div class="baris" style="margin-top:1rem"><button>Periksa Status</button></div>
          </form>

          ${hasilCek ? `
            <div class="panel" style="margin-top:1rem" id="status-box">
              <h3>${esc(hasilCek.nama_lengkap)} (${esc(hasilCek.nomor_registrasi)})</h3>
              <p><strong>Gelombang:</strong> ${esc(hasilCek.nama_gelombang)}${hasilCek.nama_jurusan ? ` · <strong>Jurusan:</strong> ${esc(hasilCek.nama_jurusan)}` : ''}</p>
              <p><strong>Status Pendaftaran:</strong> ${pill(hasilCek.status)} &nbsp; <strong>Status Pembayaran:</strong> ${pill(hasilCek.status_bayar)}</p>
              <p><strong>Biaya Pendaftaran:</strong> ${esc(rupiah(hasilCek.biaya_daftar))}</p>
              ${hasilCek.catatan_admin ? `<p><strong>Catatan Sekolah:</strong> ${esc(hasilCek.catatan_admin)}</p>` : ''}

              ${Number(hasilCek.biaya_daftar) > 0 && hasilCek.status_bayar !== 'lunas' ? `
                <hr style="margin:1rem 0">
                <h4>Konfirmasi Pembayaran Pendaftaran</h4>
                ${rekening.length ? `
                  <ul class="rincian" style="margin-bottom:1rem">
                    ${rekening.map((r) => `<li><b>${esc(r.penyedia)}</b> ${r.nomor ? `— <code>${esc(r.nomor)}</code>` : ''} ${r.atas_nama ? `(a.n. ${esc(r.atas_nama)})` : ''} ${r.instruksi ? `<br><span class="muted">${esc(r.instruksi)}</span>` : ''}</li>`).join('')}
                  </ul>
                ` : ''}
                <form id="f-bayar">
                  <div class="cols">
                    ${rekening.length ? `
                      <label>Tujuan pembayaran *
                        <select name="metode_bayar_id" required>
                          ${rekening.map((r) => `<option value="${esc(r.id)}">${esc(r.penyedia)} ${r.nomor ? `(${esc(r.nomor)})` : ''}</option>`).join('')}
                        </select>
                      </label>
                    ` : '<input type="hidden" name="metode_bayar_id" value="">'}
                    <label>Nominal ditransfer (Rp) *<input name="nominal_bayar" type="number" min="1" value="${esc(hasilCek.biaya_daftar)}" required></label>
                    <label>Nama pengirim / rekening *<input name="nama_pengirim" value="${esc(hasilCek.nama_pengirim ?? '')}" required></label>
                    <label>Catatan / nomor referensi<input name="catatan_bayar" placeholder="Opsional"></label>
                  </div>
                  <div class="baris" style="margin-top:1rem"><button>Kirim Konfirmasi Bayar</button></div>
                </form>
              ` : ''}
            </div>
          ` : ''}
        </section>
      `}
    `);

    bindTema();
    app.querySelector('#tab-daftar').onclick = () => { tab = 'daftar'; msg = ''; render(); };
    app.querySelector('#tab-cek').onclick = () => { tab = 'cek'; msg = ''; render(); };

    if (app.querySelector('#daftar-lagi')) {
      app.querySelector('#daftar-lagi').onclick = () => { hasilDaftar = null; msg = ''; render(); };
    }
    if (app.querySelector('#lanjut-cek')) {
      app.querySelector('#lanjut-cek').onclick = () => {
        kredensialCek = { nomor_registrasi: hasilDaftar.nomor_registrasi, pin_akses: hasilDaftar.pin_akses };
        tab = 'cek'; msg = ''; render();
      };
    }

    const fPpdb = app.querySelector('#f-ppdb');
    if (fPpdb) {
      fPpdb.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(fPpdb);
        const { data, error } = await sb.rpc('daftar_ppdb_publik', {
          p_tenant_slug: t.slug,
          p_gelombang_id: fd.get('gelombang_id'),
          p_jurusan_id: fd.get('jurusan_id') || null,
          p_nama_lengkap: fd.get('nama_lengkap'),
          p_nik: fd.get('nik') || null,
          p_jenis_kelamin: fd.get('jenis_kelamin'),
          p_tempat_lahir: fd.get('tempat_lahir') || null,
          p_tanggal_lahir: fd.get('tanggal_lahir') || null,
          p_asal_sekolah: fd.get('asal_sekolah') || null,
          p_nama_wali: fd.get('nama_wali'),
          p_no_hp_wali: fd.get('no_hp_wali'),
          p_alamat: fd.get('alamat') || null,
        });
        if (error) { msg = error.message; render(); return; }
        hasilDaftar = data;
        msg = '';
        render();
      };
    }

    const fCek = app.querySelector('#f-cek');
    if (fCek) {
      fCek.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(fCek);
        kredensialCek = {
          nomor_registrasi: String(fd.get('nomor_registrasi') ?? '').trim(),
          pin_akses: String(fd.get('pin_akses') ?? '').trim(),
        };
        const { data, error } = await sb.rpc('cek_status_ppdb', {
          p_nomor_registrasi: kredensialCek.nomor_registrasi,
          p_pin_akses: kredensialCek.pin_akses,
        });
        if (error) { hasilCek = null; msg = error.message; render(); return; }
        hasilCek = data;
        msg = '';
        render();
      };
    }

    const fBayar = app.querySelector('#f-bayar');
    if (fBayar) {
      fBayar.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(fBayar);
        const { error } = await sb.rpc('konfirmasi_bayar_ppdb', {
          p_nomor_registrasi: kredensialCek.nomor_registrasi,
          p_pin_akses: kredensialCek.pin_akses,
          p_metode_bayar_id: fd.get('metode_bayar_id') || null,
          p_nominal_bayar: Number(fd.get('nominal_bayar')),
          p_nama_pengirim: fd.get('nama_pengirim'),
          p_catatan_bayar: fd.get('catatan_bayar') || null,
        });
        if (error) { msg = error.message; render(); return; }
        const { data } = await sb.rpc('cek_status_ppdb', {
          p_nomor_registrasi: kredensialCek.nomor_registrasi,
          p_pin_akses: kredensialCek.pin_akses,
        });
        hasilCek = data;
        msg = 'Tersimpan. Konfirmasi pembayaran telah dikirim.';
        render();
      };
    }
  }

  render();
}

// =====================================================================
// 2. ADMIN PAGE: GELOMBANG PENDAFTARAN
// =====================================================================
export async function gelombangPage(el, t, canWrite) {
  let rows = [], tahunList = [], form = null, msg = '';

  async function load() {
    el.dataset.state = 'loading';
    const [g, ta] = await Promise.all([
      sb.from('gelombang_pendaftaran').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false }),
      sb.from('tahun_ajaran').select('id, nama').eq('tenant_id', t.id).order('nama', { ascending: false }),
    ]);
    rows = g.data ?? [];
    tahunList = ta.data ?? [];
    if (g.error) msg = g.error.message;
    draw();
    el.dataset.state = 'ready';
  }

  function draw() {
    el.innerHTML = `
      <h1 class="judul">Gelombang Pendaftaran</h1>
      <p class="sub">Atur jadwal pembukaan pendaftaran siswa baru, kuota, dan biaya pendaftaran.</p>
      ${pesan(msg)}
      <div class="toolbar">
        ${canWrite ? '<button id="new">+ Tambah gelombang</button>' : ''}
        <span class="muted">${rows.length} gelombang</span>
      </div>
      ${form ? `
        <form id="gf" class="panel">
          <h3>${form.id ? 'Ubah' : 'Tambah'} gelombang</h3>
          <div class="cols">
            <label>Nama gelombang *<input name="nama" value="${esc(form.nama ?? '')}" required placeholder="Mis. Gelombang 1"></label>
            <label>Tahun ajaran
              <select name="tahun_ajaran_id">
                <option value="">-- Pilih tahun ajaran --</option>
                ${tahunList.map((x) => `<option value="${esc(x.id)}" ${form.tahun_ajaran_id === x.id ? 'selected' : ''}>${esc(x.nama)}</option>`).join('')}
              </select>
            </label>
            <label>Tanggal buka<input name="tanggal_buka" type="date" value="${esc(form.tanggal_buka ?? '')}"></label>
            <label>Tanggal tutup<input name="tanggal_tutup" type="date" value="${esc(form.tanggal_tutup ?? '')}"></label>
            <label>Kuota (kosongkan jika tanpa batas)<input name="kuota" type="number" min="1" value="${esc(form.kuota ?? '')}"></label>
            <label>Biaya pendaftaran (Rp)<input name="biaya_daftar" type="number" min="0" value="${esc(form.biaya_daftar ?? 0)}"></label>
            <label>Status *
              <select name="status">
                ${['draft', 'dibuka', 'ditutup'].map((s) => `<option value="${s}" ${(form.status ?? 'draft') === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="baris" style="margin-top:1rem"><button>Simpan</button><button type="button" class="sec" id="cancel">Batal</button></div>
        </form>
      ` : ''}
      <div class="tabel"><table>
        <thead><tr><th>Nama</th><th>Periode</th><th>Kuota</th><th>Biaya</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(r.nama)}</td>
            <td>${esc(tgl(r.tanggal_buka))} – ${esc(tgl(r.tanggal_tutup))}</td>
            <td>${r.kuota ?? '∞'}</td>
            <td>${esc(rupiah(r.biaya_daftar))}</td>
            <td>${pill(r.status)}</td>
            <td class="aksi">${canWrite ? `<button class="sec kecil" data-edit="${esc(r.id)}">Ubah</button>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>${rows.length === 0 ? '<p class="kosong">Belum ada gelombang pendaftaran.</p>' : ''}</div>
    `;

    if (el.querySelector('#new')) el.querySelector('#new').onclick = () => { form = { status: 'dibuka', biaya_daftar: 0 }; msg = ''; draw(); };
    if (el.querySelector('#cancel')) el.querySelector('#cancel').onclick = () => { form = null; draw(); };
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
      form = { ...rows.find((x) => x.id === b.dataset.edit) }; msg = ''; draw();
    });
    const gf = el.querySelector('#gf');
    if (gf) {
      gf.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(gf);
        const payload = {
          tenant_id: t.id,
          nama: String(fd.get('nama')).trim(),
          tahun_ajaran_id: fd.get('tahun_ajaran_id') || null,
          tanggal_buka: fd.get('tanggal_buka') || null,
          tanggal_tutup: fd.get('tanggal_tutup') || null,
          kuota: fd.get('kuota') ? Number(fd.get('kuota')) : null,
          biaya_daftar: Number(fd.get('biaya_daftar') || 0),
          status: fd.get('status'),
        };
        const res = form.id
          ? await sb.from('gelombang_pendaftaran').update(payload).eq('id', form.id)
          : await sb.from('gelombang_pendaftaran').insert(payload);
        if (res.error) { msg = res.error.message; draw(); return; }
        form = null; msg = 'Tersimpan.';
        await load();
      };
    }
  }

  await load();
}

// =====================================================================
// 3. ADMIN PAGE: DAFTAR CALON SISWA & VERIFIKASI
// =====================================================================
export async function pendaftarPage(el, t, canWrite) {
  let rows = [], filter = '', msg = '';

  async function load() {
    el.dataset.state = 'loading';
    let q = sb.from('pendaftaran_siswa')
      .select('*, gelombang_pendaftaran(nama), jurusan(nama)')
      .eq('tenant_id', t.id)
      .order('created_at', { ascending: false });
    if (filter) q = q.eq('status', filter);
    const { data, error } = await q.limit(200);
    rows = data ?? [];
    if (error) msg = error.message;
    draw();
    el.dataset.state = 'ready';
  }

  function draw() {
    el.innerHTML = `
      <h1 class="judul">Calon Siswa (PPDB)</h1>
      <p class="sub">Verifikasi pendaftaran dan konfirmasi pembayaran calon siswa baru.</p>
      ${pesan(msg)}
      <div class="toolbar">
        <select id="flt-status">
          <option value="">Semua status</option>
          ${['baru', 'menunggu_verifikasi', 'diterima', 'ditolak'].map((s) => `<option value="${s}" ${filter === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <span class="muted">${rows.length} pendaftar</span>
      </div>
      <div class="tabel"><table>
        <thead><tr><th>No. Reg</th><th>Nama</th><th>Gelombang / Jurusan</th><th>Wali</th><th>Bayar</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td><code>${esc(r.nomor_registrasi)}</code></td>
            <td><b>${esc(r.nama_lengkap)}</b><br><span class="muted">${esc(r.asal_sekolah ?? '')}</span></td>
            <td>${esc(r.gelombang_pendaftaran?.nama ?? '—')}${r.jurusan?.nama ? `<br><span class="muted">${esc(r.jurusan.nama)}</span>` : ''}</td>
            <td>${esc(r.nama_wali)}<br><span class="muted">${esc(r.no_hp_wali)}</span></td>
            <td>${pill(r.status_bayar)}${r.nama_pengirim ? `<br><span class="muted">${esc(r.nama_pengirim)} (${esc(rupiah(r.nominal_bayar))})</span>` : ''}</td>
            <td>${pill(r.status)}</td>
            <td class="aksi">
              ${canWrite && r.status !== 'diterima' ? `
                <button class="kecil" data-terima="${esc(r.id)}">Terima</button>
                ${r.status !== 'ditolak' ? `<button class="danger kecil" data-tolak="${esc(r.id)}">Tolak</button>` : ''}
              ` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>${rows.length === 0 ? '<p class="kosong">Belum ada calon siswa terdaftar.</p>' : ''}</div>
    `;

    el.querySelector('#flt-status').onchange = (e) => { filter = e.target.value; load(); };
    el.querySelectorAll('[data-terima]').forEach((b) => b.onclick = async () => {
      const nis = prompt('Masukkan NIS untuk siswa baru ini (opsional, bisa diisi nanti):', '');
      if (nis === null) return;
      const { error } = await sb.rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: b.dataset.terima, p_nis: nis });
      msg = error ? error.message : 'Pendaftar diterima sebagai siswa.';
      await load();
    });
    el.querySelectorAll('[data-tolak]').forEach((b) => b.onclick = async () => {
      const alasan = prompt('Alasan penolakan (opsional):', '');
      if (alasan === null) return;
      const { error } = await sb.rpc('tolak_pendaftar_ppdb', { p_pendaftaran_id: b.dataset.tolak, p_catatan_admin: alasan });
      msg = error ? error.message : 'Pendaftar ditolak.';
      await load();
    });
  }

  await load();
}
