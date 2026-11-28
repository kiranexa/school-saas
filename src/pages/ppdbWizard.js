import { sb } from '../supabase.js';
import { esc, pesan } from '../ui.js';
import {
  STEPS, FIELDS, ALAMAT_KOMPONEN, tampil, nilaiAwal, validasiStep, validasiSemua,
  bangunPayload, dariServer, maskRtRw, maskAngka, bagianRingkasan,
} from './ppdbFields.js';

// Wizard "Data Lengkap Calon Siswa". Orang tua masuk dengan nomor registrasi + PIN (sudah diverifikasi di halaman
// Cek Status). PIN hanya hidup di memori halaman, TIDAK ditulis ke localStorage. Draf (tanpa PIN) tersimpan otomatis
// 500 ms setelah mengetik, kedaluwarsa 7 hari, dan dihapus setelah berhasil kirim. Penggabungan alamat menjadi satu teks
// dilakukan di database; di sini alamat tetap berupa komponen agar mudah divalidasi dan dilanjutkan.

const TTL_DRAF = 7 * 24 * 3600 * 1000;
const WAKTU_SIMPAN = 500;
export const kunciDraf = (slug, nomor) => `ppdb-draft:${slug}:${nomor}`;

function bacaDraf(kunci) {
  try {
    const mentah = localStorage.getItem(kunci);
    if (!mentah) return null;
    const x = JSON.parse(mentah);
    if (!x || typeof x.savedAt !== 'number' || Date.now() - x.savedAt > TTL_DRAF) { localStorage.removeItem(kunci); return null; }
    return x;
  } catch { return null; }
}

// gabungkan draf ke nilai awal (draf lama tidak boleh menghilangkan field baru; alamat digabung per komponen)
function fusi(dasar, simpan = {}) {
  const d = { ...dasar };
  for (const f of FIELDS) {
    if (simpan[f.key] === undefined) continue;
    d[f.key] = f.kind === 'alamat' ? { ...dasar[f.key], ...simpan[f.key] } : simpan[f.key];
  }
  return d;
}

const opsi = (f) => (f.vals ?? []).map((v) => ({ v, l: f.labels?.[v] ?? v }));

export async function wizardView(el, t, kred, status, keluar) {
  const kunci = kunciDraf(t.slug, kred.nomor_registrasi);
  const LAST = STEPS.length;                       // indeks langkah Ringkasan
  let langkah = 0, d = nilaiAwal(), errs = {}, msg = '', setuju = false, mengirim = false, selesai = false;
  let infoDraf = '', timer = null, gagalSimpan = false;

  // ---- muat: draf perangkat ini diutamakan; bila tidak ada, ambil yang sudah tersimpan di server ----
  const draf = bacaDraf(kunci);
  if (draf) {
    // Migrasi field lama di draf ke field baru
    const migrasi = { ...draf.data };
    if (migrasi.ayah_tahun_lahir) {
      migrasi.ayah_tanggal_lahir = String(migrasi.ayah_tahun_lahir) + '-01-01';
      delete migrasi.ayah_tahun_lahir;
    }
    if (migrasi.ibu_tahun_lahir) {
      migrasi.ibu_tanggal_lahir = String(migrasi.ibu_tahun_lahir) + '-01-01';
      delete migrasi.ibu_tahun_lahir;
    }
    delete migrasi.koordinat_lat_lng; // buang field lama
    d = fusi(nilaiAwal(), migrasi);
    langkah = Math.min(Math.max(Number(draf.step) || 0, 0), LAST);
    infoDraf = `Draf dipulihkan (disimpan ${new Date(draf.savedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}).`;
  } else {
    const { data, error } = await sb.rpc('ambil_data_lengkap_ppdb', { p_nomor_registrasi: kred.nomor_registrasi, p_pin_akses: kred.pin_akses });
    if (error || data?.ok === false) msg = error?.message ?? data.pesan;
    else if (data?.data) { d = dariServer(data.data); infoDraf = 'Data yang sudah tersimpan sebelumnya dimuat. Anda dapat mengubahnya.'; }
  }

  function simpanDraf() {
    try {
      localStorage.setItem(kunci, JSON.stringify({ savedAt: Date.now(), step: langkah, data: d }));
      gagalSimpan = false;
    } catch { gagalSimpan = true; }
  }
  const jadwalSimpan = () => { clearTimeout(timer); timer = setTimeout(simpanDraf, WAKTU_SIMPAN); };
  function hapusDraf() { clearTimeout(timer); try { localStorage.removeItem(kunci); } catch { /* abaikan */ } }

  const galatHtml = (key) => (errs[key] ? `<small class="galat" data-galat="${esc(key)}" style="color:#c0392b">${esc(errs[key])}</small>` : '');

  function fieldHtml(f) {
    const v = d[f.key] ?? '';
    const lab = `${esc(f.label)}${f.req ? ' *' : ''}`;
    const bantu = f.help ? `<small class="muted">${esc(f.help)}</small>` : '';
    if (f.kind === 'bool') return `<label class="cek"><input type="checkbox" name="${f.key}" ${d[f.key] ? 'checked' : ''}> ${esc(f.label)}</label>`;
    if (f.kind === 'pilih') {
      return `<label>${lab}<select name="${f.key}" ${errs[f.key] ? 'aria-invalid="true"' : ''}><option value="">-- Pilih --</option>${
        opsi(f).map((o) => `<option value="${esc(o.v)}" ${v === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select>${bantu}${galatHtml(f.key)}</label>`;
    }
    const numerik = ['digits', 'int', 'num'].includes(f.kind);
    const tipe = f.kind === 'hp' ? 'tel' : 'text';
    const maks = f.kind === 'digits' ? f.len + 10 : f.kind === 'teks' ? f.max : '';   // digits: masker yang memotong, agar tempelan "1234 5678" tidak terpotong lebih dulu
    return `<label>${lab}<input name="${f.key}" type="${tipe}" ${numerik ? 'inputmode="decimal"' : ''} ${maks ? `maxlength="${maks}"` : ''}
      value="${esc(v)}" autocomplete="off" ${errs[f.key] ? 'aria-invalid="true"' : ''}>${bantu}${galatHtml(f.key)}</label>`;
  }

  function alamatHtml(f) {
    const a = d[f.key] ?? {};
    // Cek apakah alamat ini harus disabled (checkbox "sama dengan" dicentang)
    const disabledMap = {
      alamat_domisili: d.domisili_sama_kk,
      alamat_ayah: d.ortu_sama_kk,
      alamat_ibu: d.ortu_sama_kk || d.ibu_sama_ayah,
    };
    const isDisabled = disabledMap[f.key] === true;
    return `<div class="alamat" data-alamat="${f.key}"><h4>${esc(f.label)}${f.req ? ' *' : ''}</h4><div class="cols">${
      ALAMAT_KOMPONEN.map((c) => {
        const nama = `${f.key}.${c.key}`;
        return `<label>${esc(c.label)}<input name="${nama}" type="text" value="${esc(a[c.key] ?? '')}" maxlength="${c.mask ? 20 : c.max}"
          placeholder="${esc(c.placeholder ?? '')}" ${c.mask ? 'inputmode="numeric"' : ''} autocomplete="off" ${isDisabled ? 'disabled' : ''} ${errs[nama] ? 'aria-invalid="true"' : ''}>${galatHtml(nama)}</label>`;
      }).join('')}</div>${isDisabled ? '<p class="muted" style="margin-top:.5rem"><small>Alamat mengikuti yang dicentang di atas (tidak bisa diubah)</small></p>' : ''}</div>`;
  }

  function langkahHtml() {
    const id = STEPS[langkah].id;
    const per = new Map();
    for (const f of FIELDS.filter((x) => x.step === id && tampil(x, d))) {
      if (!per.has(f.section)) per.set(f.section, []);
      per.get(f.section).push(f);
    }
    return [...per.entries()].map(([judul, fl]) => `<fieldset class="panel" data-section="${esc(judul)}"><legend><b>${esc(judul)}</b></legend>
      <div class="cols">${fl.filter((f) => f.kind !== 'alamat').map(fieldHtml).join('')}</div>
      ${fl.filter((f) => f.kind === 'alamat').map(alamatHtml).join('')}</fieldset>`).join('');
  }

  function ringkasanHtml() {
    return `<p class="muted">Periksa kembali data berikut. Alamat akan disimpan sebagai satu baris teks.</p>${
      bagianRingkasan(d).map((b) => `<section class="panel"><h3>${esc(b.judul)}</h3><dl class="ringkas">${
        b.baris.map(([k, v]) => `<div><dt class="muted">${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>`).join('')}
      <label class="cek"><input type="checkbox" name="_setuju" ${setuju ? 'checked' : ''}> Saya menyatakan bahwa seluruh data di atas adalah benar dan dapat dipertanggungjawabkan.</label>
      ${galatHtml('_setuju')}`;
  }

  function gambar() {
    if (selesai) {
      el.innerHTML = `<div class="panel" id="wizard-selesai" style="border-left:4px solid var(--brand)"><h2>Data Lengkap Tersimpan</h2>
        <p>Terima kasih. Data calon siswa <b>${esc(status.nama_lengkap)}</b> (${esc(status.nomor_registrasi)}) sudah kami terima.
        Data tidak dapat diubah setelah dikirim.</p>
        <p class="muted">Instruksi pembayaran dan tautan konfirmasi akan dikirim ke email orang tua/wali.
        Silakan periksa email untuk melanjutkan proses pembayaran.</p>
        <div class="baris"><button type="button" class="sec" id="w-keluar">Kembali ke Status</button></div></div>`;
      el.querySelector('#w-keluar').onclick = () => keluar();
      return;
    }
    const terakhir = langkah === LAST;
    el.innerHTML = `
      <div class="panel" id="wizard">
        <h2>Data Lengkap Calon Siswa</h2>
        <p class="muted">${esc(status.nama_lengkap)} · ${esc(status.nomor_registrasi)}</p>
        <ol class="langkah" style="display:flex;gap:.5rem;flex-wrap:wrap;list-style:none;padding:0;margin:.5rem 0">${
          [...STEPS.map((s) => s.title), 'Ringkasan'].map((j, i) => `<li data-langkah="${i}" ${i === langkah ? 'aria-current="step"' : ''}
            style="padding:.25rem .6rem;border-radius:1rem;border:1px solid currentColor;${i === langkah ? 'font-weight:700' : 'opacity:.6'}">${i + 1}. ${esc(j)}</li>`).join('')}</ol>
        <p class="muted" id="info-draf">${infoDraf ? `${esc(infoDraf)} ` : ''}Isian tersimpan otomatis di perangkat ini selama 7 hari${gagalSimpan ? ' (penyimpanan otomatis gagal di browser ini)' : ''}.
          Jangan memakai perangkat umum. <button type="button" class="sec kecil" id="w-hapus-draf">Hapus draf</button></p>
        ${pesan(msg)}
        <form id="wf" novalidate>${terakhir ? ringkasanHtml() : langkahHtml()}</form>
        <div class="baris" style="margin-top:1rem">
          ${langkah > 0 ? '<button type="button" class="sec" id="w-mundur">Kembali</button>' : '<button type="button" class="sec" id="w-keluar">Batal</button>'}
          ${terakhir ? `<button type="button" id="w-kirim" ${mengirim ? 'disabled' : ''}>${mengirim ? 'Mengirim…' : 'Kirim Data Lengkap'}</button>`
                     : '<button type="button" id="w-maju">Lanjut</button>'}
        </div>
      </div>`;
    pasang();
  }

  // ---- set nilai dari input (dengan masker) ----
  function setNilai(input) {
    const n = input.name;
    if (!n || n === '_setuju') return;
    if (n.includes('.')) {
      const [kunciAlamat, komp] = n.split('.');
      // Skip if address is disabled (checkbox "sama dengan" dicentang)
      const disabledMap = {
        alamat_domisili: d.domisili_sama_kk,
        alamat_ayah: d.ortu_sama_kk,
        alamat_ibu: d.ortu_sama_kk || d.ibu_sama_ayah,
      };
      if (disabledMap[kunciAlamat]) return;
      let v = input.value;
      if (komp === 'rt_rw') v = maskRtRw(v);
      if (komp === 'kode_pos') v = maskAngka(v, 5);
      if (v !== input.value) input.value = v;
      d[kunciAlamat][komp] = v;
      return;
    }
    const f = FIELDS.find((x) => x.key === n);
    if (!f) return;
    if (f.kind === 'bool') d[n] = input.checked;
    else if (f.kind === 'digits') { const v = maskAngka(input.value, f.len); if (v !== input.value) input.value = v; d[n] = v; }
    else d[n] = input.value;
  }

  function bersihkanGalat(n) {
    if (!errs[n]) return;
    delete errs[n];
    el.querySelector(`[data-galat="${CSS.escape(n)}"]`)?.remove();
    el.querySelector(`[name="${CSS.escape(n)}"]`)?.removeAttribute('aria-invalid');
  }

  function keGalatPertama() {
    const pertama = Object.keys(errs)[0];
    if (!pertama) return;
    const input = el.querySelector(`[name="${CSS.escape(pertama)}"]`);
    if (input) { input.scrollIntoView({ block: 'center', behavior: 'smooth' }); input.focus({ preventScroll: true }); }
  }

  function pasang() {
    const $ = (s) => el.querySelector(s);
    $('#w-hapus-draf').onclick = () => { if (confirm('Hapus draf di perangkat ini? Isian yang belum dikirim akan hilang.')) { hapusDraf(); d = nilaiAwal(); langkah = 0; infoDraf = 'Draf dihapus.'; errs = {}; setuju = false; gambar(); } };
    if ($('#w-keluar')) $('#w-keluar').onclick = () => keluar();
    if ($('#w-mundur')) $('#w-mundur').onclick = () => { langkah -= 1; errs = {}; msg = ''; simpanDraf(); gambar(); window.scrollTo?.(0, 0); };
    if ($('#w-maju')) $('#w-maju').onclick = () => {
      errs = validasiStep(STEPS[langkah].id, d);
      if (Object.keys(errs).length) { msg = `Ada ${Object.keys(errs).length} isian yang perlu diperbaiki.`; gambar(); keGalatPertama(); return; }
      msg = ''; langkah += 1; simpanDraf(); gambar(); window.scrollTo?.(0, 0);
    };
    if ($('#w-kirim')) $('#w-kirim').onclick = kirim;

    const form = $('#wf');
    form.oninput = (e) => {
      if (e.target.name === '_setuju') return;
      setNilai(e.target); bersihkanGalat(e.target.name); jadwalSimpan();
    };
    form.onchange = (e) => {
      const n = e.target.name;
      if (n === '_setuju') { setuju = e.target.checked; bersihkanGalat('_setuju'); return; }
      setNilai(e.target); jadwalSimpan();
      if (['domisili_sama_kk', 'ortu_sama_kk', 'ibu_sama_ayah'].includes(n)) { simpanDraf(); gambar(); }   // ubah bagian yang tampil
      else bersihkanGalat(n);
    };
  }

  async function kirim() {
    errs = validasiSemua(d);
    const pertama = Object.keys(errs)[0];
    if (pertama) {
      const f = FIELDS.find((x) => x.key === pertama.split('.')[0]);
      langkah = STEPS.findIndex((s) => s.id === f.step);
      msg = `Masih ada ${Object.keys(errs).length} isian yang belum benar. Silakan perbaiki.`;
      simpanDraf(); gambar(); keGalatPertama(); return;
    }
    if (!setuju) { errs = { _setuju: 'Pernyataan harus disetujui sebelum mengirim' }; gambar(); return; }
    mengirim = true; msg = ''; gambar();
    let res;
    try {
      res = await sb.rpc('simpan_data_lengkap_ppdb', { p_nomor_registrasi: kred.nomor_registrasi, p_pin_akses: kred.pin_akses, p_data: bangunPayload(d) });
    } catch (e) { res = { error: { message: 'Koneksi bermasalah. Isian Anda aman tersimpan di perangkat ini; coba kirim lagi.' } }; }
    mengirim = false;
    if (res.error || res.data?.ok === false) {
      msg = res.error?.message ?? res.data.pesan;               // draf tetap ada: bisa langsung dikirim ulang
      simpanDraf(); gambar(); return;
    }
    hapusDraf();
    selesai = true; gambar();
  }

  gambar();
}
