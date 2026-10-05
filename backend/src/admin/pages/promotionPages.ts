/**
 * Halaman: promosi dan konfigurasi selama promosi.
 *
 * "Konfigurasi khusus selama promosi" yang diminta bukan satu tombol, melainkan
 * tiga hal yang memang berbeda sifatnya:
 *
 *   1. Kode promosi sekali pakai (hadiah token) — di halaman ini.
 *   2. Pengali kuota harian yang berlaku selama periode promosi — di halaman
 *      Pengaturan (`promo.free_tier_multiplier` / `promo.paid_tier_multiplier`).
 *   3. Teks banner yang dilihat pemain — `promo.banner_text`, halaman Pengaturan.
 *
 * Ketiganya sengaja tidak digabung ke dalam satu "mode promosi": pengali kuota
 * berlaku GLOBAL selama disetel, sedangkan kode promosi berlaku per akun. Menyatukan
 * keduanya akan membuat mematikan satu kode ikut mematikan pengali untuk semua orang.
 */

import type { SafeHtml } from '../html';
import { esc, escOr, formatTime, html, inputValue, pill, selected, table } from '../html';
import { formatNumber } from './dashboardPages';
import type { AdminPageContext } from './context';

export async function promotionsList(ctx: AdminPageContext): Promise<SafeHtml> {
  const promotions = await ctx.promotions.listPromotions();

  const multiplierFree = await ctx.settings.getSetting('promo.free_tier_multiplier');
  const multiplierPaid = await ctx.settings.getSetting('promo.paid_tier_multiplier');
  const bannerText = await ctx.settings.getSetting('promo.banner_text');

  const rows = promotions.map(
    (promo) =>
      html`<tr>
  <td>
    <a href="/admin/promotions/${esc(promo.promotionId)}"><span class="mono">${esc(promo.code)}</span></a>
    <div class="muted" style="font-size:12px">${escOr(promo.label, '—')}</div>
  </td>
  <td class="right mono">${formatNumber(promo.bonusTokens)}</td>
  <td class="right mono">
    ${String(promo.redemptionCount)}${promo.maxRedemptions > 0 ? ` / ${String(promo.maxRedemptions)}` : ' / ∞'}
  </td>
  <td>${promo.tierRequirement === 'any' ? pill('semua') : pill(promo.tierRequirement)}</td>
  <td>${promo.oncePerAccount ? pill('sekali/akun') : pill('berulang')}</td>
  <td>${
    promo.isLive
      ? pill('berjalan', 'ok')
      : promo.isActive
        ? pill('aktif, di luar periode', 'draft')
        : pill('nonaktif', 'off')
  }</td>
  <td class="muted mono" style="font-size:11px">
    ${promo.startsAt ? formatTime(promo.startsAt) : 'mulai bebas'} →
    ${promo.endsAt ? formatTime(promo.endsAt) : 'tanpa akhir'}
  </td>
</tr>`,
  );

  const activeCount = promotions.filter((p) => p.isLive).length;

  return html`<h1>Promosi</h1>
<p class="sub">
  Hadiah promosi berupa <strong>token</strong>, bukan mata uang terpisah. Token sejajar
  dengan biaya model, sehingga pemeriksaan anggaran tetap satu perbandingan sederhana.
</p>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(promotions.length)}</b><span>Kode terdaftar</span></div>
  <div class="stat"><b>${String(activeCount)}</b><span>Sedang berjalan</span></div>
  <div class="stat"><b>${esc(String(multiplierFree ?? 1))}×</b><span>Pengali kuota Free</span></div>
  <div class="stat"><b>${esc(String(multiplierPaid ?? 1))}×</b><span>Pengali kuota Paid</span></div>
</div>

<div class="between" style="margin-bottom:14px">
  <span class="muted">${String(promotions.length)} promosi</span>
  <a href="/admin/promotions-new"><button type="button">Promosi baru</button></a>
</div>
<div class="card">${table(
    ['Kode', 'Token', 'Penukaran', 'Syarat tier', 'Batas', 'Keadaan', 'Periode'],
    rows,
    'Belum ada promosi.',
  )}</div>

<h2>Konfigurasi selama promosi</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    Pengali kuota dan teks banner berlaku <strong>global</strong> selama disetel —
    berbeda dari kode promosi yang berlaku per akun. Keduanya diubah di halaman
    <a href="/admin/settings">Pengaturan</a>.
  </p>
  <table>
    <tbody>
      <tr><td class="mono">promo.free_tier_multiplier</td><td class="mono">${esc(renderScalar(multiplierFree))}</td></tr>
      <tr><td class="mono">promo.paid_tier_multiplier</td><td class="mono">${esc(renderScalar(multiplierPaid))}</td></tr>
      <tr><td class="mono">promo.banner_text</td><td>${renderScalar(bannerText) === '' ? html`<span class="muted">—</span>` : esc(renderScalar(bannerText))}</td></tr>
    </tbody>
  </table>
</div>`;
}

export async function promotionForm(ctx: AdminPageContext, promotionId: string | null): Promise<SafeHtml> {
  const promo = promotionId ? await ctx.promotions.findPromotion(promotionId) : null;
  if (promotionId && !promo) {
    return html`<h1>Tidak ditemukan</h1>
<div class="card"><p>Promosi <span class="mono">${promotionId}</span> tidak ada.</p>
<p><a href="/admin/promotions">Kembali ke daftar promosi</a></p></div>`;
  }

  const redemptions = promo ? await ctx.promotions.listRedemptions(promo.promotionId, 100) : [];

  const redemptionRows = redemptions.map(
    (row) =>
      `<tr><td class="mono">${esc(row.accountId)}</td>` +
      `<td class="right mono">${formatNumber(row.tokensGranted)}</td>` +
      `<td class="right muted mono">${formatTime(row.createdAt, 'minute')}</td></tr>`,
  );

  // Nilai `datetime-local` butuh bentuk YYYY-MM-DDTHH:mm — dengan huruf T, bukan
  // spasi. `formatTime` sengaja memakai spasi untuk tampilan, jadi hasilnya
  // diganti kembali di sini alih-alih menambah mode ketiga padanya.
  const toLocalInput = (value: unknown): string => formatTime(value, 'minute').replace(' ', 'T');

  const tierOptions = (['any', 'free', 'paid'] as const).map(
    (tier) =>
      `<option value="${esc(tier)}"${selected(promo?.tierRequirement, tier)}>${
        tier === 'any' ? 'any — semua pengguna' : esc(tier)
      }</option>`,
  );

  return html`<h1>${promo ? 'Ubah promosi' : 'Promosi baru'}</h1>
<p class="sub">
  ${
    promo
      ? html`Kode <span class="mono">${esc(promo.code)}</span> · ${String(promo.redemptionCount)} penukaran tercatat.`
      : 'Kode tidak peka besar-kecil huruf: "HEMAT" dan "hemat" dianggap sama.'
  }
</p>
<form method="post" action="/admin/promotions" class="card">
  <input type="hidden" name="promotionId" value="${inputValue(promo?.promotionId ?? '')}">
  <div class="two">
    <label><span>Kode</span>
      <input name="code" required maxlength="40" placeholder="mis. HEMAT2026"
             value="${inputValue(promo?.code ?? '')}">
    </label>
    <label><span>Label (keterangan internal)</span>
      <input name="label" maxlength="120" placeholder="mis. Promosi peluncuran"
             value="${inputValue(promo?.label ?? '')}">
    </label>
  </div>
  <div class="two">
    <label><span>Token bonus</span>
      <input name="bonusTokens" type="number" min="1" required value="${inputValue(promo?.bonusTokens ?? '')}">
    </label>
    <label><span>Batas penukaran (0 = tanpa batas)</span>
      <input name="maxRedemptions" type="number" min="0" required value="${inputValue(promo?.maxRedemptions ?? 0)}">
    </label>
  </div>
  <div class="two">
    <label><span>Syarat tier</span>
      <select name="tierRequirement">${tierOptions}</select>
    </label>
    <div>
      <label class="inline" style="display:block;margin-top:24px">
        <input type="checkbox" name="oncePerAccount" style="width:auto" ${promo ? (promo.oncePerAccount ? 'checked' : '') : 'checked'}>
        <span style="display:inline;margin-left:6px">Satu akun hanya boleh menukar sekali</span>
      </label>
      <label class="inline" style="display:block">
        <input type="checkbox" name="isActive" style="width:auto" ${promo ? (promo.isActive ? 'checked' : '') : 'checked'}>
        <span style="display:inline;margin-left:6px">Promosi aktif</span>
      </label>
    </div>
  </div>
  <div class="two">
    <label><span>Mulai (opsional)</span>
      <input name="startsAt" type="datetime-local" value="${inputValue(toLocalInput(promo?.startsAt ?? null))}">
    </label>
    <label><span>Berakhir (opsional)</span>
      <input name="endsAt" type="datetime-local" value="${inputValue(toLocalInput(promo?.endsAt ?? null))}">
    </label>
  </div>
  <label><span>Catatan</span>
    <input name="notes" maxlength="240" value="${inputValue(promo?.notes ?? '')}">
  </label>
  <div class="row">
    <button type="submit">Simpan</button>
    <a href="/admin/promotions"><button class="ghost" type="button">Batal</button></a>
    ${
      promo
        ? html`<form method="post" action="/admin/promotions/delete" class="inline"
      data-confirm="Hapus promosi ${esc(promo.code)}? Riwayat penukarannya tetap tercatat di audit."
      data-confirm-title="Hapus promosi"
      data-confirm-ok="Hapus">
      <input type="hidden" name="promotionId" value="${inputValue(promo.promotionId)}">
      <button class="danger" type="submit">Hapus promosi</button>
    </form>`
        : ''
    }
  </div>
</form>

${
  promo
    ? html`<h2>Riwayat penukaran</h2>
<div class="card">${table(['Akun', 'Token', 'Waktu'], redemptionRows, 'Belum ada yang menukar kode ini.')}</div>`
    : ''
}`;
}

function renderScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}
