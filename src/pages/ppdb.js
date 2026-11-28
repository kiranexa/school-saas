import { sb } from '../supabase.js';
import { esc, pill, pesan, shellPublik, bindTema } from '../ui.js';
import { wizardView } from './ppdbWizard.js';
import { bagianRingkasan } from './ppdbFields.js';

// Ubah ke true setelah email otomatis (tahap 3) aktif; sampai itu, jangan menjanjikan email ke orang tua.
const EMAIL_OTOMATIS_AKTIF = true;
const CATATAN_EMAIL = EMAIL_OTOMATIS_AKTIF
  ? 'Penting: Masukkan alamat email aktif Orang Tua/Wali (bukan email anak). Instruksi pembayaran dan status verifikasi akan dikirim ke email ini.'
  : 'Penting: Masukkan alamat email aktif Orang Tua/Wali (bukan email anak). Email ini dipakai sekolah untuk menghubungi Anda.';

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const rincianBiaya = (list) => {
  const l = Array.isArray(list) ? list : [];
  if (!l.length) return '';
  const total = l.filter((b) => b.wajib).reduce((s, b) => s + Number(b.nominal), 0);
  return `<ul class="rincian">${l.map((b) => `<li>${esc(b.nama)}: <b>${esc(rupiah(b.nominal))}</b>${b.wajib ? '' : ' <span class="muted">(opsional, tidak dihitung)</span>'}</li>`).join('')}</ul>
    <p><strong>Total biaya wajib:</strong> <span id="total-biaya">${esc(rupiah(total))}</span></p>`;
};
const tgl = (s) => (s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Payment upload state
let buktiUpload = { buktiId: null, uploadUrl: null, file: null, uploading: false };

// =====================================================================
// 1. HALAMAN PUBLIK: FORMULIR PPDB & CEK STATUS / KONFIRMASI BAYAR
// =====================================================================
export async function ppdbPublikView(app, t) {
  const awalTab = new URLSearchParams(location.search).get('tab') === 'cek' ? 'cek' : 'daftar';
  let tab = awalTab;

  const [{ data: gelList }, { data: jurList }, { data: rekList }, { data: biayaList }] = await Promise.all([
    sb.from('gelombang_pendaftaran').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false }),
    sb.from('jurusan').select('id, kode, nama').eq('tenant_id', t.id).eq('aktif', true).order('nama'),
    sb.from('metode_pembayaran').select('id, jenis, penyedia, nomor, atas_nama, instruksi').eq('tenant_id', t.id).eq('aktif', true).order('urutan'),
    sb.from('komponen_biaya').select('nama, nominal, wajib').eq('tenant_id', t.id).eq('aktif', true).order('urutan'),
  ]);

  const terbuka = gelList ?? [];
  const jurusan = jurList ?? [];
  const rekening = rekList ?? [];
  const biaya = biayaList ?? [];
  let hasilDaftar = null;
  let hasilCek = null;
  let nilaiDaftar = null;   // isian form pendaftaran (hanya di memori): tidak hilang saat galat atau pindah tab
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

      ${tab === 'lengkap' ? '<section class="bagian"><div id="wizard-host"></div></section>' : tab === 'daftar' ? `
        <section class="bagian">
          ${hasilDaftar ? `
            <div class="panel" style="border-left:4px solid var(--brand)">
              <h2>Pendaftaran Berhasil</h2>
              <p>Simpan Nomor Registrasi dan PIN Akses berikut untuk mengecek status kelulusan serta konfirmasi pembayaran:</p>
              <p><strong>Nomor Registrasi:</strong> <code id="out-noreg">${esc(hasilDaftar.nomor_registrasi)}</code><br>
                 <strong>PIN Akses:</strong> <code id="out-pin">${esc(hasilDaftar.pin_akses)}</code><br>
                 <span class="muted">PIN hanya ditampilkan sekali ini. Catat atau foto layar ini.</span></p>
              ${rincianBiaya(hasilDaftar.rincian_biaya)}
              <div class="baris">
                <button type="button" id="lengkapi">Lengkapi Data Siswa Sekarang</button>
                <button type="button" class="sec" id="lanjut-cek">Lanjut Cek Status / Konfirmasi Bayar</button>
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
              ${biaya.length ? `<div id="info-biaya"><h4>Rincian biaya</h4>${rincianBiaya(biaya)}</div>` : ''}
              <div class="cols">
                <label>Gelombang pendaftaran *
                  <select name="gelombang_id" required>
                    ${terbuka.map((g) => `<option value="${esc(g.id)}">${esc(g.nama)}</option>`).join('')}
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
                <label>NIK (16 angka)<input name="nik" inputmode="numeric" maxlength="16" pattern="[0-9]{16}" title="16 angka"></label>
                <label>Jenis kelamin *
                  <select name="jenis_kelamin" required>
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </label>
                <label>Tempat lahir<input name="tempat_lahir" maxlength="100"></label>
                <label>Tanggal lahir *<input name="tanggal_lahir" type="date" required></label>
                <label>Asal sekolah<input name="asal_sekolah" maxlength="150"></label>
                <label>Nama orang tua / wali *<input name="nama_wali" required maxlength="150"></label>
                <label>No. HP / WhatsApp wali *<input name="no_hp_wali" type="tel" required maxlength="20"></label>
                <label>Email orang tua / wali *<input name="email_wali" type="email" required maxlength="200" autocomplete="email">
                  <small class="muted" id="catatan-email">${esc(CATATAN_EMAIL)}</small></label>
                <label>Ulangi email orang tua / wali *<input name="email_wali2" type="email" required maxlength="200" autocomplete="off"></label>
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
              ${rincianBiaya(hasilCek.rincian_biaya)}
              <p><strong>Data Lengkap:</strong> ${hasilCek.data_lengkap_terisi ? 'sudah diisi' : 'belum diisi'}
                ${hasilCek.status !== 'ditolak' ? `<button type="button" class="kecil" id="isi-lengkap">${hasilCek.data_lengkap_terisi ? 'Ubah Data Lengkap' : 'Isi Data Lengkap'}</button>` : ''}</p>
              ${hasilCek.catatan_admin ? `<p><strong>Catatan Sekolah:</strong> ${esc(hasilCek.catatan_admin)}</p>` : ''}

              ${Number(hasilCek.total_biaya) > 0 && hasilCek.status_bayar !== 'lunas' && !['diterima', 'ditolak'].includes(hasilCek.status) ? `
                <hr style="margin:1rem 0">
                <h4>Konfirmasi Pembayaran Pendaftaran</h4>
                ${rekening.length ? `
                  <ul class="rincian" style="margin-bottom:1rem">
                    ${rekening.map((r) => `<li><b>${esc(r.penyedia)}</b> ${r.nomor ? `— <code>${esc(r.nomor)}</code>` : ''} ${r.atas_nama ? `(a.n. ${esc(r.atas_nama)})` : ''} ${r.instruksi ? `<br><span class="muted">${esc(r.instruksi)}</span>` : ''}</li>`).join('')}
                  </ul>
                ` : ''}
                ${buktiUpload.buktiId ? `
                  <div class="panel" style="margin-bottom:1rem;background:#f8f9fa;border-left:4px solid var(--brand)">
                    <h5>Bukti Transfer</h5>
                    ${buktiUpload.uploading ? `
                      <p class="muted">Mengunggah bukti transfer...</p>
                    ` : buktiUpload.file ? `
                      <p>File dipilih: <b>${esc(buktiUpload.file.name)}</b> (${(buktiUpload.file.size / 1024).toFixed(1)} KB)</p>
                      <div class="baris" style="margin-top:.5rem">
                        <button type="button" id="upload-bukti" class="">Unggah Bukti</button>
                        <button type="button" class="sec kecil" id="ganti-bukti">Ganti File</button>
                      </div>
                    ` : `
                      <p class="muted">Belum ada bukti transfer diunggah.</p>
                      <div class="baris" style="margin-top:.5rem">
                        <label class="sec">Pilih File Bukti (JPG/PNG/PDF, max 10MB)
                          <input type="file" id="file-bukti" accept="image/jpeg,image/png,application/pdf" style="display:none">
                        </label>
                      </div>
                    `}
                  </div>
                ` : `
                  <form id="f-bayar" class="panel">
                    <div class="cols">
                      ${rekening.length ? `
                        <label>Tujuan pembayaran *
                          <select name="metode_bayar_id" required>
                            ${rekening.map((r) => `<option value="${esc(r.id)}">${esc(r.penyedia)} ${r.nomor ? `(${esc(r.nomor)})` : ''}</option>`).join('')}
                          </select>
                        </label>
                      ` : '<input type="hidden" name="metode_bayar_id" value="">'}
                      <label>Nominal ditransfer (Rp) *<input name="nominal_bayar" type="number" min="1" value="${esc(hasilCek.total_biaya)}" required></label>
                      <label>Nama pengirim / rekening *<input name="nama_pengirim" value="${esc(hasilCek.nama_pengirim ?? '')}" required></label>
                      <label>Catatan / nomor referensi<input name="catatan_bayar" placeholder="Opsional"></label>
                    </div>
                    <div class="baris" style="margin-top:1rem"><button id="btn-konfirmasi-bayar">Kirim Konfirmasi & Dapatkan Link Upload</button></div>
                  </form>
                `}
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

    if (app.querySelector('#lengkapi')) {
      app.querySelector('#lengkapi').onclick = async () => {
        kredensialCek = { nomor_registrasi: hasilDaftar.nomor_registrasi, pin_akses: hasilDaftar.pin_akses };
        const { data, error } = await sb.rpc('cek_status_ppdb', { p_nomor_registrasi: kredensialCek.nomor_registrasi, p_pin_akses: kredensialCek.pin_akses });
        if (error || data?.ok === false) { msg = error?.message ?? data.pesan; render(); return; }
        hasilCek = data; tab = 'lengkap'; msg = ''; render();
      };
    }
    if (app.querySelector('#isi-lengkap')) app.querySelector('#isi-lengkap').onclick = () => { tab = 'lengkap'; msg = ''; render(); };
    if (tab === 'lengkap' && hasilCek) {
      wizardView(app.querySelector('#wizard-host'), t, kredensialCek, hasilCek, async () => {
        const { data } = await sb.rpc('cek_status_ppdb', { p_nomor_registrasi: kredensialCek.nomor_registrasi, p_pin_akses: kredensialCek.pin_akses });
        if (data?.ok) hasilCek = data;
        tab = 'cek'; msg = ''; render();
      });
    }

    const fPpdb = app.querySelector('#f-ppdb');
    if (fPpdb) {
      if (nilaiDaftar) for (const [k, v] of Object.entries(nilaiDaftar)) { const e = fPpdb.elements[k]; if (e && 'value' in e) e.value = v; }
      fPpdb.addEventListener('input', () => { nilaiDaftar = Object.fromEntries(new FormData(fPpdb).entries()); });
      fPpdb.addEventListener('change', () => { nilaiDaftar = Object.fromEntries(new FormData(fPpdb).entries()); });
    }
    if (fPpdb) {
      fPpdb.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(fPpdb);
        if (String(fd.get('email_wali')).trim().toLowerCase() !== String(fd.get('email_wali2')).trim().toLowerCase()) {
          msg = 'Email dan ulangi email tidak sama. Periksa kembali agar informasi dari sekolah sampai ke orang tua.'; render(); return;
        }
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
          p_email_wali: fd.get('email_wali'),
          p_alamat: fd.get('alamat') || null,
        });
        if (error || data?.ok === false) { msg = error?.message ?? data.pesan; render(); return; }
        hasilDaftar = data;
        nilaiDaftar = null;                       // sukses: bersihkan isian dari memori
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
        if (error || data?.ok === false) { hasilCek = null; msg = error?.message ?? data.pesan; render(); return; }
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
        const { data: hasil, error } = await sb.rpc('konfirmasi_bayar_ppdb_upload', {
          p_nomor_registrasi: kredensialCek.nomor_registrasi,
          p_pin_akses: kredensialCek.pin_akses,
          p_metode_bayar_id: fd.get('metode_bayar_id') || null,
          p_nominal_bayar: Number(fd.get('nominal_bayar')),
          p_nama_pengirim: fd.get('nama_pengirim'),
          p_catatan_bayar: fd.get('catatan_bayar') || null,
        });
        if (error || hasil?.ok === false) { msg = error?.message ?? hasil.pesan; render(); return; }
        buktiUpload = { buktiId: hasil.bukti_id, uploadUrl: hasil.upload_url, file: null, uploading: false };
        const { data } = await sb.rpc('cek_status_ppdb', {
          p_nomor_registrasi: kredensialCek.nomor_registrasi,
          p_pin_akses: kredensialCek.pin_akses,
        });
        hasilCek = data;
        msg = 'Konfirmasi terkirim. Silakan unggah bukti transfer.';
        render();
      };
    }

    // File input handler
    const fileInput = app.querySelector('#file-bukti');
    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          if (file.size > 10485760) { msg = 'Ukuran file maksimal 10 MB'; fileInput.value = ''; render(); return; }
          if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) { msg = 'Format file tidak didukung (JPG, PNG, PDF)'; fileInput.value = ''; render(); return; }
          buktiUpload.file = file;
          msg = '';
          render();
        }
      };
      const label = fileInput.closest('label');
      if (label) label.onclick = () => fileInput.click();
    }

    // Upload bukti button
    const uploadBtn = app.querySelector('#upload-bukti');
    if (uploadBtn) {
      uploadBtn.onclick = async () => {
        if (!buktiUpload.file || !buktiUpload.buktiId) return;
        buktiUpload.uploading = true;
        render();
        try {
          const uploadRes = await fetch(`${sb.supabaseUrl}/storage/v1/object/ppdb-bukti/${buktiUpload.uploadUrl.split('/').pop()}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${(await sb.auth.getSession()).data.session?.access_token}`,
              'Content-Type': buktiUpload.file.type,
            },
            body: buktiUpload.file,
          });
          if (!uploadRes.ok) throw new Error('Upload gagal: ' + await uploadRes.text());

          const { data: done, error: doneErr } = await sb.rpc('selesai_upload_bukti_ppdb', {
            p_bukti_id: buktiUpload.buktiId,
            p_content_type: buktiUpload.file.type,
            p_size_bytes: buktiUpload.file.size,
          });
          if (doneErr || done?.ok === false) throw new Error(doneErr?.message ?? done?.pesan);

          buktiUpload = { buktiId: buktiUpload.buktiId, uploadUrl: buktiUpload.uploadUrl, file: buktiUpload.file, uploading: false };
          const { data } = await sb.rpc('cek_status_ppdb', {
            p_nomor_registrasi: kredensialCek.nomor_registrasi,
            p_pin_akses: kredensialCek.pin_akses,
          });
          hasilCek = data;
          msg = 'Bukti transfer berhasil diunggah. Menunggu verifikasi sekolah.';
          render();
        } catch (e) {
          buktiUpload.uploading = false;
          msg = String(e);
          render();
        }
      };
    }

    // Ganti bukti button
    const gantiBtn = app.querySelector('#ganti-bukti');
    if (gantiBtn) {
      gantiBtn.onclick = () => {
        buktiUpload.file = null;
        const fi = app.querySelector('#file-bukti');
        if (fi) fi.value = '';
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
      <p class="sub">Atur jadwal pembukaan pendaftaran siswa baru, dan kuota. Biaya diatur di menu Biaya (perubahan perlu persetujuan kepala sekolah).</p>
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
        <thead><tr><th>Nama</th><th>Periode</th><th>Kuota</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${esc(r.nama)}</td>
            <td>${esc(tgl(r.tanggal_buka))} – ${esc(tgl(r.tanggal_tutup))}</td>
            <td>${r.kuota ?? '∞'}</td>
            <td>${pill(r.status)}</td>
            <td class="aksi">${canWrite ? `<button class="sec kecil" data-edit="${esc(r.id)}">Ubah</button>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>${rows.length === 0 ? '<p class="kosong">Belum ada gelombang pendaftaran.</p>' : ''}</div>
    `;

    if (el.querySelector('#new')) el.querySelector('#new').onclick = () => { form = { status: 'dibuka' }; msg = ''; draw(); };
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
// kolom PIN tidak boleh dibaca staf (dicabut di database), jadi tidak memakai select('*')
const KOLOM_PENDAFTAR = 'id, nomor_registrasi, nama_lengkap, asal_sekolah, nama_wali, no_hp_wali, email_wali, status, status_bayar, '
  + 'nominal_bayar, nama_pengirim, total_biaya, created_at, gelombang_pendaftaran(nama), jurusan(nama), pendaftaran_data_lengkap(diisi_at)';

export async function pendaftarPage(el, t, canWrite) {
  let rows = [], filter = '', msg = '', detail = null, buktiDetail = null;
  const adaLengkap = (r) => (Array.isArray(r.pendaftaran_data_lengkap) ? r.pendaftaran_data_lengkap.length > 0 : !!r.pendaftaran_data_lengkap);

  async function load() {
    el.dataset.state = 'loading';
    let q = sb.from('pendaftaran_siswa')
      .select(KOLOM_PENDAFTAR)
      .eq('tenant_id', t.id)
      .order('created_at', { ascending: false });
    if (filter) q = q.eq('status', filter);
    const { data, error } = await q.limit(200);
    rows = data ?? [];
    if (error) msg = error.message;
    draw();
    el.dataset.state = 'ready';
  }

  async function loadBukti(pendaftaranId) {
    const { data, error } = await sb.from('pendaftaran_bukti_bayar')
      .select('*')
      .eq('pendaftaran_id', pendaftaranId)
      .order('dikirim_at', { ascending: false })
      .limit(5);
    if (error) return [];
    return data ?? [];
  }

  function draw() {
    el.innerHTML = `
      <h1 class="judul">Calon Siswa (PPDB)</h1>
      <p class="sub">Verifikasi pendaftaran dan konfirmasi pembayaran calon siswa baru.</p>
      ${pesan(msg)}
      ${buktiDetail ? `<section class="panel" id="detail-bukti"><div class="baris"><h3>Bukti Transfer: ${esc(buktiDetail.nama)}</h3>
        <button type="button" class="sec kecil" id="b-tutup">Tutup</button></div>
        ${buktiDetail.bukti.map((b) => `
          <div class="panel" style="margin-top:1rem">
            <p><strong>Status:</strong> ${pill(b.status)} · <strong>Nominal:</strong> ${esc(rupiah(b.nominal_bayar))} · <strong>Pengirim:</strong> ${esc(b.nama_pengirim)}</p>
            <p><strong>Metode:</strong> ${esc(b.metode_bayar_id)} · <strong>Dikirim:</strong> ${new Date(b.dikirim_at).toLocaleString('id-ID')}</p>
            ${b.bukti_path ? `<p><strong>File:</strong> ${b.bukti_content_type} (${(b.bukti_size_bytes / 1024).toFixed(1)} KB)
              <button type="button" class="kecil" data-bukti-download="${esc(b.id)}">Unduh</button></p>` : '<p class="muted">Belum upload file</p>'}
            ${b.catatan_bayar ? `<p><strong>Catatan:</strong> ${esc(b.catatan_bayar)}</p>` : ''}
            ${b.status === 'menunggu' || b.status === 'menunggu_upload' ? `
              <div class="baris" style="margin-top:.5rem">
                <button type="button" class="" data-bukti-setujui="${esc(b.id)}">Setujui</button>
                <button type="button" class="danger kecil" data-bukti-tolak="${esc(b.id)}">Tolak</button>
              </div>
            ` : b.status === 'diverifikasi' ? `
              <p class="muted">Disetujui oleh ${b.diverifikasi_oleh ? 'staf' : '—'} pada ${b.diverifikasi_at ? new Date(b.diverifikasi_at).toLocaleString('id-ID') : '—'}</p>
            ` : b.status === 'ditolak' ? `
              <p class="muted">Ditolak pada ${b.diverifikasi_at ? new Date(b.diverifikasi_at).toLocaleString('id-ID') : '—'}</p>
              ${b.catatan_verifikasi ? `<p><strong>Alasan:</strong> ${esc(b.catatan_verifikasi)}</p>` : ''}
            ` : ''}
          </div>
        `).join('')}</section>` : ''}
      ${detail ? `<section class="panel" id="detail-lengkap"><div class="baris"><h3>Data Lengkap: ${esc(detail.nama)}</h3>
        <button type="button" class="sec kecil" id="d-cetak">Cetak</button><button type="button" class="sec kecil" id="d-tutup">Tutup</button></div>
        <p class="muted">Data sensitif milik anak di bawah umur. Gunakan hanya untuk keperluan pendaftaran dan jangan dibagikan.</p>
        ${bagianRingkasan(detail.row, { dariDb: true }).map((b) => `<h4>${esc(b.judul)}</h4><dl class="ringkas">${
          b.baris.map(([k, v]) => `<div><dt class="muted">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`).join('')}</section>` : ''}
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
            <td>${esc(r.nama_wali)}<br><span class="muted">${esc(r.no_hp_wali)}${r.email_wali ? ` · ${esc(r.email_wali)}` : ''}</span></td>
            <td>${pill(r.status_bayar)}<br><span class="muted">tagihan ${esc(rupiah(r.total_biaya))}</span>${r.nama_pengirim ? `<br><span class="muted">${esc(r.nama_pengirim)} (${esc(rupiah(r.nominal_bayar))})</span>` : ''}</td>
            <td>${pill(r.status)}</td>
            <td class="aksi">
              ${adaLengkap(r) ? `<button class="sec kecil" data-lengkap="${esc(r.id)}">Data lengkap</button>` : '<span class="muted">data lengkap: belum</span>'}
              ${r.status_bayar !== 'lunas' && r.status_bayar !== 'belum_bayar' ? `<button class="sec kecil" data-bukti="${esc(r.id)}">Bukti</button>` : ''}
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
    if (el.querySelector('#b-tutup')) el.querySelector('#b-tutup').onclick = () => { buktiDetail = null; draw(); };
    if (el.querySelector('#d-tutup')) el.querySelector('#d-tutup').onclick = () => { detail = null; draw(); };
    if (el.querySelector('#d-cetak')) el.querySelector('#d-cetak').onclick = () => window.print();
    el.querySelectorAll('[data-lengkap]').forEach((b) => b.onclick = async () => {
      const { data, error } = await sb.from('pendaftaran_data_lengkap').select('*').eq('pendaftaran_id', b.dataset.lengkap).single();
      if (error) { msg = error.message; draw(); return; }
      detail = { nama: rows.find((x) => x.id === b.dataset.lengkap)?.nama_lengkap ?? '', row: data };
      msg = ''; draw();
      el.querySelector('#detail-lengkap')?.scrollIntoView({ block: 'start' });
    });
    el.querySelectorAll('[data-bukti]').forEach((b) => b.onclick = async () => {
      const pendaftaranId = b.dataset.bukti;
      const r = rows.find((x) => x.id === pendaftaranId);
      const bukti = await loadBukti(pendaftaranId);
      buktiDetail = { nama: r?.nama_lengkap ?? '', bukti };
      msg = ''; draw();
      el.querySelector('#detail-bukti')?.scrollIntoView({ block: 'start' });
    });
    el.querySelectorAll('[data-bukti-download]').forEach((b) => b.onclick = async () => {
      const { data, error } = await sb.rpc('get_bukti_download_url', { p_bukti_id: b.dataset.buktiDownload });
      if (error || data?.ok === false) { msg = error?.message ?? data?.pesan; draw(); return; }
      const { data: signed } = await sb.storage.from('ppdb-bukti').createSignedUrl(data.path, 60);
      if (signed?.signedUrl) window.open(signed.signedUrl, '_blank');
      else msg = 'Gagal membuat tautan unduh';
      draw();
    });
    el.querySelectorAll('[data-bukti-setujui]').forEach((b) => b.onclick = async () => {
      const alasan = prompt('Catatan verifikasi (opsional):', '');
      if (alasan === null) return;
      const { data, error } = await sb.rpc('verifikasi_bukti_ppdb', { p_bukti_id: b.dataset.buktiSetujui, p_setujui: true, p_catatan: alasan });
      if (error) { msg = error.message; draw(); return; }
      msg = data.message;
      // Refresh bukti detail
      const pendingId = buktiDetail?.bukti?.find((x) => x.id === b.dataset.buktiSetujui)?.pendaftaran_id;
      if (pendingId) {
        buktiDetail.bukti = await loadBukti(pendingId);
      }
      draw();
      await load();
    });
    el.querySelectorAll('[data-bukti-tolak]').forEach((b) => b.onclick = async () => {
      const alasan = prompt('Alasan penolakan (wajib):', '');
      if (!alasan) return;
      const { data, error } = await sb.rpc('verifikasi_bukti_ppdb', { p_bukti_id: b.dataset.buktiTolak, p_setujui: false, p_catatan: alasan });
      if (error) { msg = error.message; draw(); return; }
      msg = data.message;
      const pendingId = buktiDetail?.bukti?.find((x) => x.id === b.dataset.buktiTolak)?.pendaftaran_id;
      if (pendingId) {
        buktiDetail.bukti = await loadBukti(pendingId);
      }
      draw();
      await load();
    });
    el.querySelectorAll('[data-terima]').forEach((b) => b.onclick = async () => {
      const nis = prompt('Masukkan NIS untuk siswa baru ini (opsional, bisa diisi nanti):', '');
      if (nis === null) return;
      const r = rows.find((x) => x.id === b.dataset.terima);
      const belumBayar = r && Number(r.total_biaya) > 0 && r.status_bayar === 'belum_bayar';
      if (belumBayar && !confirm('Pendaftar ini belum mengonfirmasi pembayaran. Terima dan tandai LUNAS hanya jika pembayaran sudah Anda terima langsung (mis. tunai). Lanjutkan?')) return;
      const { error } = await sb.rpc('terima_pendaftar_ppdb', { p_pendaftaran_id: b.dataset.terima, p_nis: nis, p_konfirmasi_lunas: belumBayar });
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
