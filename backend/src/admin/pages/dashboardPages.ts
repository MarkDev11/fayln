/**
 * Halaman: ringkasan, pengaturan, dan audit.
 *
 * Ketiganya berkaitan dengan konfigurasi menyeluruh, jadi digabung dalam satu
 * berkas: pembaca yang ingin tahu "apa yang dapat diatur" tidak perlu berpindah
 * berkas.
 */

import type { SafeHtml } from './../html';
import { esc, formatTime, html, inputValue, pill, statusPill, table } from './../html';
import type { AdminPageContext } from './context';

export async function dashboard(ctx: AdminPageContext): Promise<SafeHtml> {
  const stats = await ctx.settings.dashboardStats();

  const cards = html`<div class="grid">
    <div class="stat"><b>${String(stats.worlds)}</b><span>Dunia</span></div>
    <div class="stat"><b>${String(stats.publishedWorlds)}</b><span>Dunia terbit</span></div>
    <div class="stat"><b>${String(stats.characters)}</b><span>Karakter</span></div>
    <div class="stat"><b>${String(stats.accounts)}</b><span>Akun pemain</span></div>
    <div class="stat"><b>${String(stats.journeys)}</b><span>Perjalanan</span></div>
    <div class="stat"><b>${String(stats.activePromotions)}</b><span>Promosi aktif</span></div>
  </div>`;

  const usage = await ctx.settings.todayUsage();
  const usageTable = table(
    ['Tier', 'Akun', 'Token terpakai', 'Token cadangan'],
    usage.map(
      (row) =>
        `<tr><td>${esc(row.tier)}</td><td>${esc(row.accounts)}</td>` +
        `<td class="mono">${esc(formatNumber(row.spentTokens))}</td>` +
        `<td class="mono">${esc(formatNumber(row.reservedTokens))}</td></tr>`,
    ),
    'Belum ada pemakaian hari ini.',
  );

  const simulator = await ctx.settings.getSetting('engine.simulator');
  const isSimulator = simulator === true;

  const engineCard = html`<div class="card">
    <div class="between">
      <div>
        <strong>Mesin cerita</strong>
        <p class="sub" style="margin:4px 0 0">
          ${
            isSimulator
              ? 'Simulator deterministik. Belum ada model bahasa sungguhan — keluaran tidak boleh dianggap hasil AI.'
              : 'Model sungguhan aktif. Pastikan biaya per giliran sudah benar di halaman Model.'
          }
        </p>
      </div>
      <div><span class="pill ${isSimulator ? 'draft' : 'ok'}">${esc(isSimulator ? 'simulator' : 'model nyata')}</span></div>
    </div>
  </div>`;

  return html`<h1>Ringkasan</h1>
<p class="sub">Keadaan katalog dan pemakaian hari ini (UTC).</p>
${cards}
${engineCard}
<h2>Pemakaian hari ini</h2>
<div class="card">${usageTable}</div>`;
}

export async function settingsList(ctx: AdminPageContext): Promise<SafeHtml> {
  const all = await ctx.settings.listSettings();
  const known = await ctx.settings.knownSettings();

  const rows = all.map(
    (setting) =>
      html`<tr>
  <td class="mono">${setting.key}</td>
  <td>${setting.description ? esc(setting.description) : html`<span class="muted">—</span>`}</td>
  <td class="mono">${renderValue(setting.value)}</td>
  <td class="right">
    <form method="post" action="/admin/settings/delete" class="inline">
      <input type="hidden" name="key" value="${inputValue(setting.key)}">
      <button class="danger" type="submit">Hapus</button>
    </form>
  </td>
</tr>`,
  );

  // Larik, bukan `.join('')` — lihat catatan di `table()` pada html.ts.
  const options = known.map(
    (item) => `<option value="${esc(item.key)}">${esc(item.key)} — ${esc(item.label)}</option>`,
  );

  const admins = await ctx.admins.listAdmins();
  const adminRows = admins.map(
    (admin) =>
      html`<tr>
  <td>${admin.username}</td>
  <td>${admin.displayName ? esc(admin.displayName) : html`<span class="muted">—</span>`}</td>
  <td>${admin.role}</td>
  <td>${admin.isActive ? pill('aktif', 'ok') : pill('nonaktif', 'off')}</td>
  <td class="muted mono">${admin.lastLoginAt ? formatTime(admin.lastLoginAt, 'minute') : 'belum pernah'}</td>
  <td class="right">
    <form method="post" action="/admin/admins/toggle" class="inline">
      <input type="hidden" name="adminId" value="${inputValue(admin.adminId)}">
      <input type="hidden" name="isActive" value="${admin.isActive ? 'false' : 'true'}">
      <button class="ghost" type="submit">${admin.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button>
    </form>
  </td>
</tr>`,
  );

  return html`<h1>Pengaturan</h1>
<p class="sub">
  Nilai di sini dibaca saat berjalan, sehingga dapat diubah tanpa membangun ulang
  aplikasi. Yang berkaitan dengan model ada di halaman <a href="/admin/models">Model</a>.
</p>

<h2>Konfigurasi tersimpan</h2>
<div class="card">${table(['Kunci', 'Keterangan', 'Nilai', ''], rows, 'Belum ada pengaturan.')}</div>

<h2>Simpan pengaturan</h2>
<div class="card">
  <form method="post" action="/admin/settings">
    <label><span>Kunci pengaturan</span>
      <select name="key" required>
        <option value="">— pilih —</option>
        ${options}
      </select>
    </label>
    <label><span>Nilai</span>
      <input name="value" placeholder='contoh: true, 50000, atau "hemat"' required>
    </label>
    <label><span>Keterangan (opsional)</span>
      <input name="description" placeholder="Untuk apa pengaturan ini">
    </label>
    <button type="submit">Simpan</button>
  </form>
  <p class="sub" style="margin:14px 0 0">
    Nilai diurai sebagai JSON. Tulis <span class="mono">true</span> untuk boolean,
    <span class="mono">50000</span> untuk angka, dan
    <span class="mono">"teks"</span> (dengan tanda kutip) untuk teks biasa.
  </p>
</div>

<h2>Ganti kata sandi saya</h2>
<div class="card">
  <form method="post" action="/admin/password">
    <div class="two">
      <label><span>Kata sandi sekarang</span>
        <input name="currentPassword" type="password" autocomplete="current-password" required>
      </label>
      <label><span>Kata sandi baru (minimal 8 karakter)</span>
        <input name="newPassword" type="password" autocomplete="new-password" required>
      </label>
    </div>
    <p class="sub" style="margin:4px 0 12px">
      Mengganti kata sandi akan mengakhiri semua sesi yang sedang berjalan, termasuk ini.
    </p>
    <button type="submit">Ganti kata sandi</button>
  </form>
</div>

<h2>Akun admin</h2>
<div class="card">
  ${table(['Nama pengguna', 'Nama tampilan', 'Peran', 'Status', 'Masuk terakhir', ''], adminRows, 'Belum ada akun admin.')}
  <h2 style="margin-top:26px">Tambah akun admin</h2>
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
        <select name="role">
          <option value="owner">owner — akses penuh</option>
          <option value="editor">editor — katalog saja</option>
          <option value="support">support — akun saja</option>
        </select>
      </label>
    </div>
    <button type="submit">Tambah akun</button>
  </form>
</div>`;
}

export async function auditList(ctx: AdminPageContext): Promise<SafeHtml> {
  const entries = await ctx.admins.listAudit(150);

  const rows = entries.map(
    (entry) =>
      html`<tr>
  <td class="muted mono">${formatTime(entry.createdAt, 'minute')}</td>
  <td>${entry.username}</td>
  <td><span class="pill">${entry.action}</span></td>
  <td class="mono">${entry.targetKind}${entry.targetId ? ` / ${entry.targetId}` : ''}</td>
</tr>`,
  );

  return html`<h1>Catatan audit</h1>
<p class="sub">
  150 tindakan terakhir. Setiap perubahan yang mengubah keadaan dicatat di sini —
  tanpa ini, tidak ada cara menjawab "siapa yang mengubah ini".
</p>
<div class="card">${table(['Waktu', 'Admin', 'Tindakan', 'Sasaran'], rows, 'Belum ada catatan.')}</div>`;
}

/** Menampilkan nilai JSON dengan aman, merangkum yang terlalu panjang. */
function renderValue(value: unknown): SafeHtml {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const raw = text ?? '';
  return esc(raw.length > 80 ? `${raw.slice(0, 77)}...` : raw);
}

/** Memisahkan ribuan supaya angka token dapat dibaca sekilas. */
export function formatNumber(value: number | string): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  return numeric.toLocaleString('id-ID');
}

export { statusPill };
