/**
 * Halaman: ringkasan, pengaturan, dan audit.
 *
 * Ketiganya berkaitan dengan konfigurasi menyeluruh, jadi digabung dalam satu
 * berkas: pembaca yang ingin tahu "apa yang dapat diatur" tidak perlu berpindah
 * berkas.
 */

import type { SafeHtml } from './../html';
import { esc, escOr, formatTime, html, inputValue, pill, statusPill, table } from './../html';
import { worldStatusLabel, type WorldStatus } from '../catalogAdminRepository';
import { STORY_ENGINE_IS_SIMULATOR } from '../../services/storyEngine';
import type { AdminPageContext } from './context';

/**
 * Urutan status yang ditampilkan ringkasan.
 *
 * Keempatnya selalu ditampilkan, termasuk yang jumlahnya nol: kosakata status
 * dunia harus terlihat sekilas, bukan hanya status yang kebetulan terpakai.
 */
const SUMMARY_STATUSES: WorldStatus[] = ['published', 'draft', 'retired', 'revoked'];

export async function dashboard(ctx: AdminPageContext): Promise<SafeHtml> {
  const [stats, worlds, health] = await Promise.all([
    ctx.settings.dashboardStats(),
    ctx.catalog.listWorlds(),
    ctx.models.chainHealth(),
  ]);

  /*
   * Jumlah per status dihitung dari versi TERBARU tiap dunia, bukan dari
   * "pernah terbit". Bedanya nyata: dunia yang versi terbitnya sudah diganti
   * versi baru berstatus draft punya versi lama berstatus published, tetapi
   * yang dipakai katalog adalah versi terbarunya.
   */
  const statusCards = SUMMARY_STATUSES.map((status) => {
    const total = worlds.filter((world) => world.status === status).length;
    return html`<div class="stat">
      <b>${String(total)}</b>
      <span>${esc(worldStatusLabel(status))} <span class="mono">(${esc(status)})</span></span>
    </div>`;
  });

  const cards = html`<div class="grid">
    <div class="stat"><b>${String(stats.worlds)}</b><span>Dunia terdaftar</span></div>
    ${statusCards}
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

  /*
   * Keadaan mesin cerita datang dari DUA fakta, dan keduanya dibaca — bukan
   * dikarang:
   *   1. `engine.simulator` — pengaturan yang dapat diubah dari panel.
   *   2. `STORY_ENGINE_IS_SIMULATOR` — konstanta yang sama dengan yang
   *      dilaporkan `/v1/meta` pada `storyEngine.simulator`. Bila keduanya
   *      berbeda, panel harus mengatakannya; menyembunyikan bedanya akan
   *      membuat admin percaya pada keadaan yang tidak benar.
   */
  const disagrees = isSimulator !== STORY_ENGINE_IS_SIMULATOR;
  const activeModels = health.reduce((sum, item) => sum + item.activeCount, 0);
  const withoutPrimary = health.filter((item) => item.activeCount > 0 && !item.hasPrimary);

  const engineCard = html`<div class="card">
    <div class="between">
      <div>
        <strong>Mesin cerita</strong>
        <p class="sub" style="margin:4px 0 0">
          ${
            STORY_ENGINE_IS_SIMULATOR
              ? 'Mesin yang terpasang adalah simulator deterministik. Belum ada model bahasa sungguhan — keluaran tidak boleh dianggap hasil AI.'
              : 'Model sungguhan terpasang. Pastikan biaya per giliran sudah benar di halaman Model.'
          }
        </p>
        <p class="sub" style="margin:6px 0 0">
          <span class="mono">/v1/meta</span> melaporkan
          <span class="mono">storyEngine.simulator = ${String(STORY_ENGINE_IS_SIMULATOR)}</span>,
          sedangkan pengaturan <span class="mono">engine.simulator</span> =
          <span class="mono">${esc(JSON.stringify(simulator))}</span>.
        </p>
        ${
          disagrees
            ? html`<p class="sub" style="margin:6px 0 0;color:#e0cf8f">
            Keduanya tidak sejalan. Yang dipakai pemain adalah mesin yang terpasang;
            pengaturan hanya menandai niat.
          </p>`
            : ''
        }
      </div>
      <div>
        <span class="pill ${STORY_ENGINE_IS_SIMULATOR ? 'draft' : 'ok'}">${
          STORY_ENGINE_IS_SIMULATOR ? 'simulator' : 'model nyata'
        }</span>
      </div>
    </div>
    <table style="margin-top:14px">
      <tbody>
        <tr>
          <td>Model aktif terdaftar</td>
          <td class="right mono">${String(activeModels)}</td>
        </tr>
        ${health.map(
          (item) =>
            html`<tr>
          <td>Tier ${esc(item.tier)}</td>
          <td class="right">${
            item.activeCount === 0
              ? pill('tidak ada model aktif', 'off')
              : pill(`${String(item.activeCount)} aktif`, 'ok')
          }</td>
        </tr>`,
        )}
      </tbody>
    </table>
    ${
      withoutPrimary.length > 0
        ? html`<p class="sub" style="margin:10px 0 0;color:#e0cf8f">
            ${withoutPrimary.map((item) => esc(item.tier)).join(', ')} punya model aktif tetapi tidak
            ada model utama (posisi 0). Periksa halaman <a href="/admin/models">Model</a>.
          </p>`
        : ''
    }
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
    <form method="post" action="/admin/settings/delete" class="inline"
          data-confirm="Hapus pengaturan ${esc(setting.key)}? Nilainya akan kembali ke bawaan."
          data-confirm-title="Hapus pengaturan"
          data-confirm-ok="Hapus">
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
  <p class="sub" style="margin-top:0">
    Menambah dan menonaktifkan akun admin ada di halaman
    <a href="/admin/admins">Admin</a>, bersama daftar siapa saja yang dapat masuk
    ke panel ini.
  </p>
</div>`;
}

/**
 * Catatan audit dengan saringan.
 *
 * Saringan dikirim sebagai query, bukan disimpan di sesi: tautan hasil
 * penyaringan dapat dibagikan dan di bookmark, dan menekan "kembali" tidak
 * mengembalikan halaman ke keadaan yang berbeda dari yang tertulis di alamat.
 */
export async function auditList(
  ctx: AdminPageContext,
  filter: { username: string; action: string },
): Promise<SafeHtml> {
  const username = filter.username.trim();
  const action = filter.action.trim();

  const [entries, facets] = await Promise.all([
    ctx.admins.listAudit(150, { username, action }),
    ctx.admins.auditFacets(),
  ]);

  const rows = entries.map(
    (entry) =>
      html`<tr>
  <td class="muted mono">${formatTime(entry.createdAt, 'minute')}</td>
  <td>${esc(entry.username)}</td>
  <td><span class="pill">${esc(entry.action)}</span></td>
  <td class="mono">${esc(entry.targetKind)}${entry.targetId ? esc(` / ${entry.targetId}`) : ''}</td>
</tr>`,
  );

  // LARIK, bukan `.join('')` — `html()` menggabung larik apa adanya, sedangkan
  // string akan di-escape dan seluruh daftar pilihan tampil sebagai teks.
  const usernameOptions = facets.usernames.map(
    (name) =>
      `<option value="${inputValue(name)}"${name === username ? ' selected' : ''}>${esc(name)}</option>`,
  );
  const actionOptions = facets.actions.map(
    (item) =>
      `<option value="${inputValue(item)}"${item === action ? ' selected' : ''}>${esc(item)}</option>`,
  );

  const isFiltered = username !== '' || action !== '';

  return html`<h1>Catatan audit</h1>
<p class="sub">
  ${isFiltered ? 'Hasil penyaringan, ' : ''}150 tindakan terakhir. Setiap perubahan yang
  mengubah keadaan dicatat di sini — tanpa ini, tidak ada cara menjawab
  "siapa yang mengubah ini".
</p>
<form method="get" action="/admin/audit" class="card">
  <div class="row" style="align-items:flex-end">
    <label style="flex:1;min-width:180px;margin-bottom:0"><span>Admin</span>
      <select name="username">
        <option value="">— semua admin —</option>
        ${usernameOptions}
      </select>
    </label>
    <label style="flex:1;min-width:180px;margin-bottom:0"><span>Tindakan</span>
      <select name="action">
        <option value="">— semua tindakan —</option>
        ${actionOptions}
      </select>
    </label>
    <button type="submit">Saring</button>
    ${isFiltered ? html`<a href="/admin/audit"><button class="ghost" type="button">Reset</button></a>` : ''}
  </div>
</form>
<div class="between" style="margin-bottom:14px">
  <span class="muted">${String(entries.length)} catatan${isFiltered ? ' cocok dengan saringan' : ''}</span>
  ${isFiltered ? html`<span class="muted">Saringan: ${escOr(username, 'semua admin')} · ${escOr(action, 'semua tindakan')}</span>` : ''}
</div>
<div class="card">${table(['Waktu', 'Admin', 'Tindakan', 'Sasaran'], rows, 'Tidak ada catatan yang cocok.')}</div>`;
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
