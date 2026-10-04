/**
 * Halaman: model dan rantai fallback.
 *
 * Yang perlu dipahami dari halaman ini: rantai fallback adalah URUTAN, bukan
 * kumpulan. Posisi 0 dicoba lebih dulu; bila gagal, posisi 1; dan seterusnya.
 * Karena itu tabelnya menampilkan posisi, dan peringatan muncul bila rantai
 * tidak punya posisi 0 (tidak ada model utama = tidak ada yang dicoba lebih dulu).
 */

import type { SafeHtml } from '../html';
import { esc, escOr, html, inputValue, pill, selected, table } from '../html';
import { formatNumber } from './dashboardPages';
import type { AdminPageContext } from './context';

export async function modelsList(ctx: AdminPageContext): Promise<SafeHtml> {
  const models = await ctx.models.listModels();
  const health = await ctx.models.chainHealth();

  const healthCards = health.map((item) => {
    const problems: string[] = [];
    if (item.activeCount === 0) {
      problems.push('Belum ada model aktif.');
    } else if (!item.hasPrimary) {
      problems.push('Tidak ada model utama (posisi 0).');
    }
    return html`<div class="stat">
    <b>${String(item.activeCount)}</b>
    <span>Tier ${item.tier} · biaya per giliran ${formatNumber(item.totalCost)} token</span>
    ${problems.length > 0 ? html`<div class="pill draft" style="margin-top:8px">${problems.join(' ')}</div>` : ''}
  </div>`;
  });

  const rows = models.map(
    (model) =>
      html`<tr>
  <td>
    <span class="mono">${esc(model.modelId)}</span>
    <div class="muted" style="font-size:12px">${esc(model.label)}</div>
  </td>
  <td class="muted">${escOr(model.provider, '—')}</td>
  <td>${model.tier === 'paid' ? pill('paid', 'ok') : pill('free')}</td>
  <td class="right mono">${String(model.position)}</td>
  <td class="right mono">${formatNumber(model.estimatedTurnCost)}</td>
  <td class="right mono">${formatNumber(model.contextTokens)}</td>
  <td>${model.isActive ? pill('aktif', 'ok') : pill('nonaktif', 'off')}</td>
  <td class="right">
    <div class="row" style="justify-content:flex-end">
      <a href="/admin/models-form?model=${esc(model.modelId)}"><button class="ghost" type="button">Ubah</button></a>
      <form method="post" action="/admin/models/toggle" class="inline">
        <input type="hidden" name="modelId" value="${inputValue(model.modelId)}">
        <input type="hidden" name="isActive" value="${model.isActive ? 'false' : 'true'}">
        <button class="ghost" type="submit">${model.isActive ? 'Matikan' : 'Nyalakan'}</button>
      </form>
    </td>
</tr>`,
  );

  return html`<h1>Model</h1>
<p class="sub">
  Biaya per giliran di sini dipakai memeriksa anggaran <strong>sebelum</strong> model
  dipanggil. Angka yang salah berarti pemain dapat memakai token lebih banyak
  daripada jatahnya — atau ditolak padahal masih cukup.
</p>
<div class="grid" style="margin-bottom:18px">${healthCards}</div>
<div class="between" style="margin-bottom:14px">
  <span class="muted">${String(models.length)} model terdaftar</span>
  <a href="/admin/models-form"><button type="button">Tambah model</button></a>
</div>
<div class="card">${table(
    ['Model', 'Provider', 'Tier', 'Posisi', 'Biaya/giliran', 'Konteks', 'Status', ''],
    rows,
    'Belum ada model terdaftar.',
  )}</div>
<div class="notice err" style="margin-top:18px">
  Model yang belum diverifikasi biayanya <strong>tidak boleh dinyalakan</strong>.
  Selama belum ada model aktif, permintaan pemain tidak dilayani oleh model apa pun.
</div>`;
}

export async function modelForm(ctx: AdminPageContext, modelId: string | null): Promise<SafeHtml> {
  const model = modelId ? await ctx.models.findModel(modelId) : null;
  if (modelId && !model) {
    return html`<h1>Tidak ditemukan</h1>
<div class="card"><p>Model <span class="mono">${modelId}</span> tidak terdaftar.</p>
<p><a href="/admin/models">Kembali ke daftar model</a></p></div>`;
  }

  const tierOptions = ['free', 'paid'].map(
    (tier) =>
      `<option value="${esc(tier)}"${selected(model?.tier, tier)}>${esc(tier)}</option>`,
  );

  return html`<h1>${model ? 'Ubah model' : 'Model baru'}</h1>
<p class="sub">
  ID model dibuat dari label bila dibiarkan kosong. Mengubah ID model yang sudah
  dipakai akan memutus kaitannya dengan konfigurasi lain — ubah hanya bila perlu.
</p>
<form method="post" action="/admin/models" class="card">
  <input type="hidden" name="modelId" value="${inputValue(model?.modelId ?? '')}">
  <div class="two">
    <label><span>Label</span>
      <input name="label" required maxlength="120" placeholder="mis. Mistral Medium"
             value="${inputValue(model?.label ?? '')}">
    </label>
    <label><span>Provider</span>
      <input name="provider" maxlength="60" placeholder="mis. mistral" value="${inputValue(model?.provider ?? '')}">
    </label>
  </div>
  <div class="two">
    <label><span>Biaya perkiraan per giliran (token)</span>
      <input name="estimatedTurnCost" type="number" min="1" required
             value="${inputValue(model?.estimatedTurnCost ?? '')}">
    </label>
    <label><span>Batas konteks (token)</span>
      <input name="contextTokens" type="number" min="1" required value="${inputValue(model?.contextTokens ?? '')}">
    </label>
  </div>
  <div class="two">
    <label><span>Tier</span>
      <select name="tier">${tierOptions}</select>
    </label>
    <label><span>Posisi dalam rantai (0 = utama)</span>
      <input name="position" type="number" min="0" required value="${inputValue(model?.position ?? 0)}">
    </label>
  </div>
  <label><span>Catatan</span>
    <input name="notes" maxlength="240" placeholder="mis. belum diverifikasi, jangan dinyalakan"
           value="${inputValue(model?.notes ?? '')}">
  </label>
  <label class="inline" style="display:block">
    <input type="checkbox" name="isActive" style="width:auto" ${model?.isActive ? 'checked' : ''}>
    <span style="display:inline;margin-left:6px">Aktifkan model ini</span>
  </label>
  <div class="row" style="margin-top:12px">
    <button type="submit">Simpan</button>
    <a href="/admin/models"><button class="ghost" type="button">Batal</button></a>
    ${
      model
        ? html`<form method="post" action="/admin/models/delete" class="inline">
      <input type="hidden" name="modelId" value="${inputValue(model.modelId)}">
      <button class="danger" type="submit">Hapus</button>
    </form>`
        : ''
    }
  </div>
</form>`;
}
