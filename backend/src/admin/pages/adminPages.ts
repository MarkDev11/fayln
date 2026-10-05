/**
 * Halaman: kelola akun admin.
 *
 * Sebelumnya akun admin hanya bisa DIBUAT dan dinonaktifkan lewat dua route
 * POST, tanpa satu halaman pun yang memperlihatkan siapa saja adminnya. Akibat
 * praktisnya: tidak ada cara menjawab "siapa lagi yang bisa masuk ke panel ini"
 * tanpa membaca basis data langsung.
 *
 * Dua aturan yang ditegakkan di sini, dan keduanya juga ditegakkan di server
 * (jangan menggantungkan pengaman pada tampilan):
 *   1. Hanya `owner` yang boleh menambah atau menonaktifkan admin.
 *   2. Admin tidak boleh menonaktifkan dirinya sendiri — melakukannya berarti
 *      mengakhiri sesinya sendiri dan dapat mengunci panel tanpa sisa akun.
 */

import type { SafeHtml } from '../html';
import { esc, escOr, formatTime, html, inputValue, pill, table } from '../html';
import type { AdminPageContext } from './context';

/** Admin yang sedang masuk. Null hanya bila halaman dirender tanpa sesi. */
export type AdminViewer = { adminId: string; username: string; role: string } | null;

const ROLE_HELP: { value: string; label: string }[] = [
  { value: 'owner', label: 'owner — akses penuh, termasuk kelola admin' },
  { value: 'editor', label: 'editor — katalog saja' },
  { value: 'support', label: 'support — akun saja' },
];

export async function adminsList(ctx: AdminPageContext, viewer: AdminViewer): Promise<SafeHtml> {
  const admins = await ctx.admins.listAdmins();
  const isOwner = viewer?.role === 'owner';

  const rows = admins.map((admin) => {
    const isSelf = admin.adminId === viewer?.adminId;
    return html`<tr>
  <td>
    ${esc(admin.username)}${isSelf ? html` <span class="pill">anda</span>` : ''}
    <div class="muted mono" style="font-size:11px">${esc(admin.adminId)}</div>
  </td>
  <td>${escOr(admin.displayName, '—')}</td>
  <td>${esc(admin.role)}</td>
  <td>${admin.isActive ? pill('aktif', 'ok') : pill('nonaktif', 'off')}</td>
  <td class="muted mono">${admin.lastLoginAt ? esc(formatTime(admin.lastLoginAt, 'minute')) : 'belum pernah'}</td>
  <td class="muted mono">${esc(formatTime(admin.createdAt))}</td>
  <td class="right">
    ${
      isSelf
        ? html`<span class="muted" style="font-size:12px">tidak dapat menonaktifkan diri sendiri</span>`
        : html`<form method="post" action="/admin/admins/toggle" class="inline"
      data-confirm="${admin.isActive ? 'Nonaktifkan' : 'Aktifkan'} akses ${esc(admin.displayName || admin.username)} ke panel?"
      data-confirm-title="${admin.isActive ? 'Nonaktifkan admin' : 'Aktifkan admin'}"
      data-confirm-ok="${admin.isActive ? 'Nonaktifkan' : 'Aktifkan'}">
      <input type="hidden" name="adminId" value="${inputValue(admin.adminId)}">
      <input type="hidden" name="isActive" value="${admin.isActive ? 'false' : 'true'}">
      <button class="ghost" type="submit" ${isOwner ? '' : 'disabled'}>${
        admin.isActive ? 'Nonaktifkan' : 'Aktifkan'
      }</button>
    </form>`
    }
  </td>
</tr>`;
  });

  const roleOptions = ROLE_HELP.map(
    (role) => `<option value="${esc(role.value)}">${esc(role.label)}</option>`,
  );

  return html`<h1>Akun admin</h1>
<p class="sub">
  Siapa saja yang dapat masuk ke panel ini. Setiap perubahan di sini tercatat di
  <a href="/admin/audit">catatan audit</a>.
</p>
<div class="between" style="margin-bottom:14px">
  <span class="muted">${String(admins.length)} akun terdaftar</span>
  <span class="muted">Peran anda: ${esc(viewer?.role ?? '—')}</span>
</div>
<div class="card">${table(
    ['Nama pengguna', 'Nama tampilan', 'Peran', 'Status', 'Masuk terakhir', 'Dibuat', ''],
    rows,
    'Belum ada akun admin.',
  )}</div>

${
  isOwner
    ? html`<h2>Tambah akun admin</h2>
<div class="card">
  <form method="post" action="/admin/admins">
    <div class="two">
      <label><span>Nama pengguna (huruf kecil, 3-32 karakter)</span>
        <input name="username" required pattern="[a-z0-9_.\\-]{3,32}"
               title="Huruf kecil, angka, titik, garis bawah, atau tanda hubung">
      </label>
      <label><span>Nama tampilan</span>
        <input name="displayName" placeholder="Nama yang ditampilkan">
      </label>
    </div>
    <div class="two">
      <label><span>Kata sandi (minimal 8 karakter)</span>
        <input name="password" type="password" autocomplete="new-password" required>
      </label>
      <label><span>Peran</span>
        <select name="role">${roleOptions}</select>
      </label>
    </div>
    <button type="submit">Tambah akun</button>
  </form>
</div>`
    : html`<div class="notice err" style="margin-top:18px">
  Hanya admin berperan <strong>owner</strong> yang dapat menambah atau menonaktifkan
  akun admin. Peran anda: ${esc(viewer?.role ?? '—')}.
</div>`
}`;
}
