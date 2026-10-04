/**
 * Halaman: manajemen akun pemain.
 *
 * Dipakai menjawab pertanyaan operasional yang nyata: "akun ini kenapa tidak
 * bisa lanjut?", "siapa yang menukar kode promo ini?", "perjalanan mana yang
 * dipakai akun ini?". Karena itu halaman rinciannya memuat pemakaian harian,
 * perjalanan, penukaran, dan buku besar terakhir — bukan hanya identitas.
 */

import type { SafeHtml } from '../html';
import { esc, formatTime, html, inputValue, pill, selected, table } from '../html';
import { formatNumber } from './dashboardPages';
import type { AdminPageContext } from './context';

export async function accountsList(ctx: AdminPageContext, query: { search: string }): Promise<SafeHtml> {
  const accounts = await ctx.accounts.listAccounts({ search: query.search });

  const rows = accounts.map(
    (account) =>
      html`<tr>
  <td>
    <a href="/admin/accounts/${esc(account.accountId)}">${esc(account.displayName || account.accountId)}</a>
    <div class="muted mono" style="font-size:11px">${esc(account.accountId)}</div>
  </td>
  <td>${account.tier === 'paid' ? pill('paid', 'ok') : pill('free')}</td>
  <td class="right mono">${formatNumber(account.spentToday)}</td>
  <td class="right mono">${account.bonusBalance > 0 ? formatNumber(account.bonusBalance) : html`<span class="muted">0</span>`}</td>
  <td class="right mono">${String(account.journeyCount)}</td>
  <td class="right muted mono">${formatTime(account.createdAt)}</td>
</tr>`,
  );

  return html`<h1>Akun</h1>
<p class="sub">
  ${query.search ? html`Hasil pencarian untuk “${query.search}”.` : '100 akun terbaru. Cari berdasarkan ID atau nama.'}
</p>
<form method="get" action="/admin/accounts" class="card">
  <div class="row">
    <input name="search" placeholder="ID akun atau nama tampilan" value="${inputValue(query.search)}"
           style="flex:1;min-width:220px">
    <button type="submit">Cari</button>
    ${query.search ? html`<a href="/admin/accounts"><button class="ghost" type="button">Bersihkan</button></a>` : ''}
  </div>
</form>
<div class="card">${table(
    ['Akun', 'Tier hari ini', 'Token terpakai', 'Saldo bonus', 'Perjalanan', 'Dibuat'],
    rows,
    'Tidak ada akun yang cocok.',
  )}</div>`;
}

export async function accountDetail(ctx: AdminPageContext, accountId: string): Promise<SafeHtml> {
  const account = await ctx.accounts.findAccount(accountId);
  if (!account) {
    return html`<h1>Tidak ditemukan</h1>
<div class="card"><p>Akun <span class="mono">${accountId}</span> tidak ada.</p>
<p><a href="/admin/accounts">Kembali ke daftar akun</a></p></div>`;
  }

  const usageRows = account.usageHistory.map(
    (row) =>
      html`<tr>
  <td class="mono">${row.usageDate}</td>
  <td>${row.tier}</td>
  <td class="right mono">${formatNumber(row.spentTokens)}</td>
  <td class="right mono">${formatNumber(row.reservedTokens)}</td>
</tr>`,
  );

  const journeyRows = account.journeys.map(
    (journey) =>
      html`<tr>
  <td class="mono">${journey.worldId} <span class="muted">v${String(journey.worldVersion)}</span></td>
  <td>${journey.personaName}</td>
  <td class="right mono">${String(journey.decisionCount)}</td>
  <td class="right muted mono">${formatTime(journey.updatedAt, 'minute')}</td>
</tr>`,
  );

  const redemptionRows = account.redemptions.map(
    (row) =>
      html`<tr>
  <td class="mono">${row.code}</td>
  <td class="right mono">${formatNumber(row.tokensGranted)}</td>
  <td class="right muted mono">${formatTime(row.createdAt, 'minute')}</td>
</tr>`,
  );

  const entryRows = account.recentEntries.map(
    (row) =>
      html`<tr>
  <td class="mono">${row.usageDate}</td>
  <td class="right mono">${formatNumber(row.promptTokens)}</td>
  <td class="right mono">${formatNumber(row.completionTokens)}</td>
  <td class="right mono">${formatNumber(row.chargedTotal)}</td>
  <td class="right muted mono">${formatTime(row.createdAt, 'minute')}</td>
</tr>`,
  );

  return html`<h1>${esc(account.displayName || account.accountId)}</h1>
<p class="sub mono">${esc(account.accountId)}</p>

<div class="grid">
  <div class="stat"><b>${formatNumber(account.spentToday)}</b><span>Token terpakai hari ini</span></div>
  <div class="stat"><b>${formatNumber(account.bonusBalance)}</b><span>Saldo bonus</span></div>
  <div class="stat"><b>${String(account.journeyCount)}</b><span>Perjalanan</span></div>
  <div class="stat"><b>${esc(account.tier)}</b><span>Tier hari ini</span></div>
</div>

<h2>Tindakan</h2>
<div class="card">
  <div class="two">
    <form method="post" action="/admin/accounts/tier">
      <input type="hidden" name="accountId" value="${inputValue(account.accountId)}">
      <label><span>Tier untuk hari ini</span>
        <select name="tier">
          <option value="free"${selected(account.tier, 'free')}>free</option>
          <option value="paid"${selected(account.tier, 'paid')}>paid</option>
        </select>
      </label>
      <p class="sub" style="margin:4px 0 10px">Berlaku untuk tanggal UTC hari ini saja.</p>
      <button type="submit">Simpan tier</button>
    </form>

    <form method="post" action="/admin/accounts/reset">
      <input type="hidden" name="accountId" value="${inputValue(account.accountId)}">
      <p class="sub" style="margin-top:0">
        Mengosongkan hitungan pemakaian hari ini supaya pemain mendapat kembali
        kuotanya. Buku besar penagihan tidak dihapus.
      </p>
      <button class="ghost" type="submit">Reset pemakaian hari ini</button>
    </form>
  </div>

  <hr style="border:none;border-top:1px solid var(--line);margin:18px 0">

  <form method="post" action="/admin/accounts/bonus">
    <input type="hidden" name="accountId" value="${inputValue(account.accountId)}">
    <div class="two">
      <label><span>Ubah saldo bonus (token)</span>
        <input name="delta" type="number" required placeholder="50000 atau -10000">
      </label>
      <label><span>Alasan</span>
        <input name="reason" maxlength="120" placeholder="mis. kompensasi gangguan layanan">
      </label>
    </div>
    <button type="submit">Terapkan perubahan saldo</button>
  </form>
</div>

<h2>Pemakaian harian (30 hari terakhir)</h2>
<div class="card">${table(['Tanggal', 'Tier', 'Terpakai', 'Dicadangkan'], usageRows, 'Belum ada pemakaian.')}</div>

<h2>Perjalanan</h2>
<div class="card">${table(['Dunia', 'Persona', 'Keputusan', 'Diperbarui'], journeyRows, 'Belum ada perjalanan.')}</div>

<h2>Penukaran promosi</h2>
<div class="card">${table(['Kode', 'Token', 'Waktu'], redemptionRows, 'Belum pernah menukar kode.')}</div>

<h2>Buku besar terakhir</h2>
<div class="card">${table(['Tanggal', 'Prompt', 'Completion', 'Ditagihkan', 'Waktu'], entryRows, 'Belum ada entri.')}</div>`;
}
