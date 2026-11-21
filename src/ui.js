export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const layout = (t, body) => `
  <header><strong>${esc(t.nama)}</strong>
    <nav><a href="/">Beranda</a><a href="/admin">Admin</a><a href="/siswa">Siswa</a></nav></header>
  <main>${body}</main>`;
