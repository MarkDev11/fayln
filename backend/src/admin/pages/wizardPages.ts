/**
 * Halaman wizard "Dunia baru" — tiga langkah.
 *
 * BENTUK YANG DIPILIH: satu halaman per langkah, bukan satu halaman panjang
 * dengan langkah yang disembunyikan JavaScript. Alasannya bukan selera:
 * gambar sudah bolak-balik ke server saat diunggah, jadi server SUDAH menjadi
 * sumber kebenaran. Menyembunyikan langkah di sisi klien berarti menambahkan
 * keadaan kedua yang harus dijaga tetap sama — dan yang pasti berselisih begitu
 * halaman dimuat ulang, tombol "kembali" ditekan, atau unggahan gagal di tengah.
 *
 * Karena itu "Lanjut" berarti menyimpan lalu mengalihkan, dan "Draf" berarti
 * menyimpan lalu keluar. Keduanya menyimpan; yang berbeda hanya ke mana pergi
 * sesudahnya.
 */

import type { SafeHtml } from '../html';
import { esc, escOr, formatTime, html, inputValue, safe, statusPill, table } from '../html';
import { GENRES, RESPONSE_LOCALES, type GenreId, type ResponseLocale } from '../../contracts/types';
import { BASE_EXPRESSION, MAX_BACKGROUNDS, type BackgroundRow, type DraftWorld, type NpcRow, type WizardStep } from '../worldDraftRepository';
import type { AdminPageContext } from './context';

/* ------------------------------------------------------------------ */
/* Bagian yang dipakai bersama                                        */
/* ------------------------------------------------------------------ */

/**
 * Langkah yang pantas dilanjutkan, diturunkan dari ISI draf.
 *
 * Sengaja diturunkan, bukan disimpan sebagai kolom: kolom langkah akan
 * berselisih dengan kenyataan begitu ada gambar yang dihapus, dan tidak ada cara
 * mengetahui mana yang benar. Isi draf tidak pernah berbohong.
 */
export function stepOfDraft(draft: DraftWorld): WizardStep {
  const identityComplete =
    draft.title.trim().length > 0 &&
    draft.synopsis.trim().length > 0 &&
    draft.premise.trim().length > 0 &&
    draft.coverMediaId !== null;

  if (!identityComplete) {
    return 1;
  }
  return draft.backgroundCount === 0 ? 2 : 3;
}

function progressText(draft: DraftWorld): string {
  return `${String(draft.backgroundCount)} latar · ${String(draft.npcCount)} NPC`;
}

/** Rangkaian langkah. Langkah yang belum terbuka tidak dapat diklik. */
function wizardSteps(current: WizardStep, worldId: string | null, unlocked: WizardStep): SafeHtml {
  const labels: Record<WizardStep, string> = {
    1: 'Identitas',
    2: 'Latar belakang',
    3: 'Karakter',
  };

  const items = ([1, 2, 3] as WizardStep[]).map((step) => {
    const label = `${String(step)}. ${labels[step]}`;
    if (!worldId || step > unlocked) {
      return html`<li><span class="${step === current ? 'is-current' : ''}">${label}</span></li>`;
    }
    const href = `/admin/worlds/${esc(worldId)}/wizard/${String(step)}`;
    const cls = step === current ? 'is-current' : step < current ? 'is-done' : '';
    return html`<li><a class="${cls}" href="${href}">${label}</a></li>`;
  });

  return html`<ol class="wizard-steps">${items}</ol>`;
}

/** Tombol bawah: "Simpan & keluar" selalu ada, aksi utama berbeda per langkah. */
function actions(primaryLabel: string, withBack: string | null): SafeHtml {
  return html`<div class="wizard-actions">
  ${
    withBack
      ? html`<a href="${withBack}"><button class="ghost" type="button">&larr; Kembali</button></a>`
      : ''
  }
  <button class="ghost" type="submit" name="intent" value="draft">Simpan &amp; keluar</button>
  <span class="spacer"></span>
  <button type="submit" name="intent" value="next">${primaryLabel}</button>
</div>`;
}

const RATING_OPTIONS = [
  { value: 'all', label: 'Semua umur' },
  { value: '13_plus', label: '13 tahun ke atas' },
  { value: '18_plus', label: '18 tahun ke atas' },
];

/* ------------------------------------------------------------------ */
/* Langkah 1 — identitas dan sampul                                   */
/* ------------------------------------------------------------------ */

export async function wizardStep1(
  ctx: AdminPageContext,
  worldId: string | null,
): Promise<SafeHtml> {
  const draft = worldId ? await ctx.drafts.findDraft(worldId) : null;

  const genres = new Set(draft?.genres ?? []);
  const locales = new Set(draft?.locales ?? []);

  const genreBoxes = GENRES.map(
    (genre) =>
      html`<label class="inline" style="margin-right:14px">
  <input type="checkbox" name="genres" value="${genre}"${genres.has(genre as GenreId) ? ' checked' : ''}
         style="width:auto"> ${esc(genre)}
</label>`,
  );

  const localeBoxes = RESPONSE_LOCALES.map(
    (locale) =>
      html`<label class="inline" style="margin-right:14px">
  <input type="checkbox" name="locales" value="${locale}"${
    locales.has(locale as ResponseLocale) || (!draft && locale === 'id-ID') ? ' checked' : ''
  } style="width:auto"> ${esc(locale)}
</label>`,
  );

  const ratingOptions = RATING_OPTIONS.map(
    (option) =>
      `<option value="${esc(option.value)}"${
        (draft?.contentRating ?? 'all') === option.value ? ' selected' : ''
      }>${esc(option.label)}</option>`,
  );

  return html`<h1>${draft ? 'Lanjutkan dunia' : 'Dunia baru'} — Langkah 1 dari 3</h1>
${wizardSteps(1, worldId, draft ? stepOfDraft(draft) : 1)}
<p class="sub">
  Judul dan sinopsis memberi tahu pemain dunia ini tentang apa. <strong>Premis</strong>
  adalah cerita pembuka yang mengarahkan AI saat menyusun adegan pertama — tuliskan
  situasi awal, siapa yang ada di sana, dan apa yang sedang terjadi.
</p>
${
  draft
    ? html`<p class="sub">Terakhir disentuh ${esc(formatTime(draft.updatedAt, 'minute'))} · ${progressText(draft)}</p>`
    : ''
}
<form method="post" action="/admin/worlds-wizard/1" class="card">
  <input type="hidden" name="worldId" value="${inputValue(worldId ?? '')}">

  <label><span>Judul</span>
    <input name="title" required maxlength="120" value="${inputValue(draft?.title ?? '')}"
           placeholder="mis. Rapat Tengah Malam">
  </label>

  <label><span>Sinopsis — latar cerita</span>
    <textarea name="synopsis" required maxlength="240" placeholder="Satu sampai dua kalimat yang tampil di katalog.">${esc(
      draft?.synopsis ?? '',
    )}</textarea>
  </label>

  <label><span>Premis — cerita awal yang mengarahkan AI</span>
    <textarea name="premise" required maxlength="2000" style="min-height:150px"
              placeholder="Situasi pembuka: di mana, siapa saja, dan apa yang sedang terjadi.">${esc(
      draft?.premise ?? '',
    )}</textarea>
  </label>

  <div data-cover-scope>
    <label><span>Foto sampul (PNG, JPEG, atau WebP)</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" data-upload="cover">
    </label>
    <input type="hidden" name="coverMediaId" data-cover-media
           value="${inputValue(draft?.coverMediaId ?? '')}">
    <img data-cover-preview class="upload-thumb" style="width:120px;height:160px"
         ${draft?.coverMediaId ? `src="${esc(`/v1/media/${draft.coverMediaId}`)}"` : 'hidden'} alt="Pratinjau sampul">
    <div class="upload-status" data-cover-status>
      ${draft?.coverMediaId ? 'Sampul sudah tersimpan.' : 'Belum ada sampul.'}
    </div>
  </div>

  <div class="two" style="margin-top:16px">
    <label><span>Tingkat usia</span>
      <select name="contentRating">${ratingOptions}</select>
    </label>
    <label><span>Bahasa respons</span>
      <div style="padding-top:6px">${localeBoxes}</div>
    </label>
  </div>

  <label><span>Genre</span>
    <div style="padding-top:6px">${genreBoxes}</div>
  </label>

  ${actions('Lanjut ke latar belakang &rarr;', null)}
</form>`;
}

/* ------------------------------------------------------------------ */
/* Langkah 2 — latar belakang                                         */
/* ------------------------------------------------------------------ */

export async function wizardStep2(ctx: AdminPageContext, worldId: string): Promise<SafeHtml> {
  const draft = await ctx.drafts.findDraft(worldId);
  if (!draft) {
    return notADraft();
  }

  const backgrounds = await ctx.drafts.listBackgrounds(draft.worldId, draft.worldVersion);
  const full = backgrounds.length >= MAX_BACKGROUNDS;

  const items = backgrounds.map((background, index) => backgroundItem(background, draft, index, backgrounds.length));

  return html`<h1>Latar belakang — Langkah 2 dari 3</h1>
${wizardSteps(2, worldId, stepOfDraft(draft))}
<p class="sub">
  Tempat cerita berlangsung. Setiap gambar punya <strong>keterangan</strong> yang dibaca
  manusia dan <strong>pemakaian</strong> yang membimbing AI. Angka <em>peluang bertemu</em>
  sengaja terpisah dari catatan bebas: ia dipakai mesin cerita untuk memutuskan, dan
  apa pun yang dipakai untuk memutuskan harus berupa nilai, bukan kalimat.
</p>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(backgrounds.length)}</b><span>Latar belakang</span></div>
  <div class="stat"><b>${String(MAX_BACKGROUNDS)}</b><span>Batas maksimum</span></div>
  <div class="stat"><b>${String(backgrounds.filter((item) => item.description.trim().length === 0).length)}</b><span>Belum diberi keterangan</span></div>
</div>

${
  full
    ? html`<div class="notice err">
  Batas ${String(MAX_BACKGROUNDS)} latar belakang sudah tercapai. Hapus salah satu
  untuk menambah yang baru.
</div>`
    : html`<form method="post" action="/admin/worlds-wizard/2/backgrounds" class="card">
  <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">
  <label><span>Unggah beberapa gambar sekaligus</span>
    <input type="file" accept="image/png,image/jpeg,image/webp" multiple data-upload="background-batch">
  </label>
  <p class="sub" style="margin-top:0">
    Gambar diperkecil di peramban sebelum diunggah (maksimal 1280&times;720). Setelah
    masuk, keterangan dan penyetelannya diatur pada daftar di bawah.
    Tersisa ${String(MAX_BACKGROUNDS - backgrounds.length)} tempat.
  </p>
  <div class="upload-status" data-batch-status></div>
  <div data-batch-list></div>
  <div class="wizard-actions">
    <span class="spacer"></span>
    <button type="submit" data-batch-submit disabled>Tambahkan ke daftar</button>
  </div>
</form>`
}

<h2>Daftar latar belakang</h2>
${
  backgrounds.length === 0
    ? html`<div class="empty">Belum ada latar belakang. Unggah minimal satu untuk melanjutkan.</div>`
    : html`<div class="card">${items}</div>`
}

<form method="post" action="/admin/worlds-wizard/2" class="card">
  <input type="hidden" name="worldId" value="${inputValue(worldId)}">
  ${actions('Lanjut ke karakter &rarr;', `/admin/worlds/${esc(worldId)}/wizard/1`)}
</form>`;
}

function backgroundItem(
  background: BackgroundRow,
  draft: DraftWorld,
  index: number,
  total: number,
): SafeHtml {
  const likelihoodOptions = [
    { value: '', label: '— belum ditentukan —' },
    { value: 'none', label: 'Tidak ada' },
    { value: 'low', label: 'Rendah' },
    { value: 'medium', label: 'Sedang' },
    { value: 'high', label: 'Tinggi' },
  ].map(
    (option) =>
      `<option value="${esc(option.value)}"${
        (background.encounterLikelihood ?? '') === option.value ? ' selected' : ''
      }>${esc(option.label)}</option>`,
  );

  const missing = background.description.trim().length === 0;

  return html`<div class="bg-item">
  <img class="bg-item__thumb" alt=""
       src="${background.mediaId ? esc(`/v1/media/${background.mediaId}`) : ''}">
  <div class="bg-item__body">
    <div>
      <strong>${missing ? html`<span class="muted">belum diberi keterangan</span>` : esc(background.description)}</strong>
      ${missing ? statusPill('draft', 'perlu dilengkapi') : ''}
    </div>
    <div class="bg-item__meta">
      ${String(background.width ?? 0)}&times;${String(background.height ?? 0)} ·
      blur ${String(background.blurStrength)} ·
      fokus ${String(Math.round(background.focalX * 100))}%/${String(Math.round(background.focalY * 100))} ·
      ${background.encounterLikelihood ? esc(background.encounterLikelihood) : 'peluang belum diisi'}
    </div>
    <details style="margin-top:8px">
      <summary class="muted" style="cursor:pointer;font-size:13px">Ubah keterangan, blur, dan titik fokus</summary>
      <form method="post" action="/admin/worlds-wizard/2/background" style="margin-top:12px"
            data-preview-scope>
        <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">
        <input type="hidden" name="assetId" value="${inputValue(background.assetId)}">

        <div class="two">
          <label><span>Keterangan (mis. "Aula kantor")</span>
            <input name="description" maxlength="200" value="${inputValue(background.description)}">
          </label>
          <label><span>Peluang bertemu NPC</span>
            <select name="encounterLikelihood">${likelihoodOptions}</select>
          </label>
        </div>

        <label><span>Pemakaian — membimbing AI (mis. "banyak orang lalu lalang, sering jadi tempat bertemu")</span>
          <textarea name="usageNote" maxlength="500" style="min-height:70px">${esc(background.usageNote)}</textarea>
        </label>

        <div class="two">
          <div>
            <span class="muted" style="font-size:12px">Titik fokus — klik gambar untuk memindahkan</span>
            <div class="focal-stage" data-focal-stage>
              <img data-focal-image data-blur-image
                   src="${background.mediaId ? esc(`/v1/media/${background.mediaId}`) : ''}" alt="">
              <span class="focal-marker" data-focal-marker></span>
            </div>
            <div class="muted" style="font-size:12px;margin-top:6px">
              Fokus: <span data-focal-readout>50% / 50%</span>
              <button class="link" type="button" data-focal-reset>atur ulang</button>
            </div>
            <input type="hidden" name="focalX" data-focal-x value="${String(background.focalX)}">
            <input type="hidden" name="focalY" data-focal-y value="${String(background.focalY)}">
          </div>

          <div>
            <label><span>Kekuatan blur: <span data-blur-readout>0</span> dari 100</span>
              <input type="range" min="0" max="100" step="1" name="blurStrength"
                     data-blur value="${String(background.blurStrength)}">
            </label>
            <button class="link" type="button" data-blur-reset>atur ulang blur</button>
          </div>
        </div>

        <div class="wizard-actions">
          <button type="submit">Simpan perubahan</button>
        </div>
      </form>
    </details>
  </div>

  <div class="bg-item__order">
    <form method="post" action="/admin/worlds-wizard/2/background/move">
      <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">
      <input type="hidden" name="assetId" value="${inputValue(background.assetId)}">
      <input type="hidden" name="direction" value="up">
      <button class="ghost" type="submit"${index === 0 ? ' disabled' : ''} title="Naikkan">&uarr;</button>
    </form>
    <form method="post" action="/admin/worlds-wizard/2/background/move">
      <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">
      <input type="hidden" name="assetId" value="${inputValue(background.assetId)}">
      <input type="hidden" name="direction" value="down">
      <button class="ghost" type="submit"${index === total - 1 ? ' disabled' : ''} title="Turunkan">&darr;</button>
    </form>
    <form method="post" action="/admin/worlds-wizard/2/background/delete">
      <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">
      <input type="hidden" name="assetId" value="${inputValue(background.assetId)}">
      <button class="danger" type="submit" title="Hapus">Hapus</button>
    </form>
  </div>
</div>`;
}

/* ------------------------------------------------------------------ */
/* Langkah 3 — karakter                                               */
/* ------------------------------------------------------------------ */

export async function wizardStep3(ctx: AdminPageContext, worldId: string): Promise<SafeHtml> {
  const draft = await ctx.drafts.findDraft(worldId);
  if (!draft) {
    return notADraft();
  }

  const npcs = await ctx.drafts.listNpcs(draft.worldId, draft.worldVersion);

  return html`<h1>Karakter — Langkah 3 dari 3</h1>
${wizardSteps(3, worldId, 3)}
<p class="sub">
  Setiap karakter punya satu gambar dasar dan beberapa gambar ekspresi. Unggahan
  ekspresi memakai PNG agar latarnya tetap tembus pandang — potret tidak dipotong
  persegi di dalam adegan.
</p>

${
  npcs.length === 0
    ? html`<div class="empty">Belum ada karakter. Tambahkan minimal satu sebelum menerbitkan.</div>`
    : html`<div>${npcs.map((npc) => npcCard(npc, draft))}</div>`
}

<h2>Tambah karakter</h2>
<form method="post" action="/admin/worlds-wizard/3/npc" class="card" data-npc-scope>
  <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">
  <input type="hidden" name="npcId" value="">

  <div class="two">
    <label><span>Nama</span>
      <input name="name" required maxlength="120" placeholder="mis. Elysia">
    </label>
    <label><span>Peran</span>
      <input name="role" maxlength="120" placeholder="mis. Sekretaris yang selalu tahu segalanya">
    </label>
  </div>

  <label><span>Sifat (pisahkan dengan koma)</span>
    <input name="traits" placeholder="mis. teliti, pendiam, mudah tersinggung">
  </label>

  <label><span>Relasi awal dengan pemain</span>
    <select name="initialRelation">
      ${[
        ['normal', 'Normal'],
        ['hangat', 'Hangat'],
        ['waspada', 'Waspada'],
        ['tegang', 'Tegang'],
        ['renggang', 'Renggang'],
        ['dekat', 'Dekat'],
        ['sayang', 'Sayang'],
        ['cinta', 'Cinta'],
      ].map(
        ([value, label]) =>
          `<option value="${esc(value)}"${value === 'normal' ? ' selected' : ''}>${esc(label)}</option>`,
      )}
    </select>
  </label>

  <label><span>Latar yang boleh diketahui pemain</span>
    <textarea name="publicBackstory" maxlength="2000">${esc('')}</textarea>
  </label>

  <label><span>Gambar dasar karakter (PNG/JPEG/WebP)</span>
    <input type="file" accept="image/png,image/jpeg,image/webp" data-upload="portrait">
  </label>
  <input type="hidden" name="baseMediaId" data-portrait-media value="">
  <div class="upload-status" data-portrait-status>Belum ada gambar dasar.</div>

  <h2 style="margin-top:22px">Ekspresi</h2>
  <p class="sub" style="margin-top:0">
    Gambar dasar di atas disimpan sebagai ekspresi bernama <strong>${esc(BASE_EXPRESSION)}</strong>
    dan menjadi <strong>potret bawaan</strong> karakter ini. Tambahkan ekspresi lain
    sebanyak yang diperlukan; yang belum diunggah gambarnya tidak akan tersimpan.
    Bila gambar dasar dikosongkan, ekspresi pertama yang menjadi potret bawaan.
  </p>

  <div data-expression-list></div>

  <div class="wizard-actions">
    <button class="ghost" type="button" data-expression-add>+ Tambah ekspresi</button>
  </div>

  <div class="wizard-actions">
    <span class="spacer"></span>
    <button type="submit">Tambah karakter</button>
  </div>
</form>

<template data-expression-template>
  <div class="expression-row" data-expression-row data-portrait-scope>
    <div class="expression-row__fields">
      <div class="two">
        <label><span>Nama ekspresi</span>
          <input name="expression" maxlength="120" placeholder="mis. neutral, senyum, marah">
        </label>
        <label><span>Gambar ekspresi (PNG)</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" data-upload="portrait">
        </label>
      </div>
      <label><span>Pemakaian — membimbing AI (mis. "dipakai saat ia menahan kesal")</span>
        <input name="expressionUsage" maxlength="500">
      </label>
      <div class="upload-status" data-portrait-status>Belum ada gambar.</div>
      <input type="hidden" name="expressionMedia" data-portrait-media value="">
      <img data-portrait-preview class="upload-thumb" style="width:64px;height:96px" hidden alt="">
    </div>
    <button class="danger" type="button" data-expression-remove>Hapus baris</button>
  </div>
</template>

<form method="post" action="/admin/worlds-wizard/3" class="card">
  <input type="hidden" name="worldId" value="${inputValue(worldId)}">
  ${actions('Simpan &amp; terbitkan', `/admin/worlds/${esc(worldId)}/wizard/2`)}
  <p class="sub" style="margin:12px 0 0">
    <strong>Simpan &amp; terbitkan</strong> membuat dunia langsung tampil di katalog
    pemain. Bila belum yakin, pakai <strong>Simpan &amp; keluar</strong> — draf dapat
    dilanjutkan kapan saja.
  </p>
</form>`;
}

function npcCard(npc: NpcRow, draft: DraftWorld): SafeHtml {
  const expressionRows = npc.expressions.map(
    (expression) =>
      html`<div class="bg-item">
  <img class="bg-item__thumb" style="width:64px;height:96px" alt=""
       src="${expression.mediaId ? esc(`/v1/media/${expression.mediaId}`) : ''}">
  <div class="bg-item__body">
    <strong>${esc(expression.expression)}</strong>
    ${expression.assetId === portraitDefaultId(npc) ? html` ${statusPill('ok', 'bawaan')}` : ''}
    <div class="bg-item__meta">${escOr(expression.usageNote, 'belum ada catatan pemakaian')}</div>
  </div>
</div>`,
  );

  const missing = npc.expressions.length === 0;

  return html`<div class="npc-card">
  <div class="npc-card__head">
    <img class="upload-thumb" style="width:72px;height:108px" alt=""
         src="${npc.baseUri ? esc(npc.baseUri) : ''}">
    <div style="flex:1;min-width:0">
      <strong>${esc(npc.name)}</strong>
      ${missing ? html` ${statusPill('draft', 'belum punya ekspresi')}` : ''}
      <div class="muted" style="font-size:12px">${escOr(npc.role, 'tanpa peran')}</div>
      <div class="muted" style="font-size:12px">
        relasi awal: ${esc(npc.initialRelation)} · sifat: ${escOr(npc.traits.join(', '), '—')}
      </div>
    </div>
    <form method="post" action="/admin/worlds-wizard/3/npc/delete">
      <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">
      <input type="hidden" name="npcId" value="${inputValue(npc.npcId)}">
      <button class="danger" type="submit">Hapus</button>
    </form>
  </div>
  ${npc.expressions.length > 0 ? html`<div style="margin-top:10px">${expressionRows}</div>` : ''}
</div>`;
}

/** Aset potret yang ditunjuk sebagai bawaan; diturunkan dari daftar ekspresi. */
function portraitDefaultId(npc: NpcRow): string {
  return npc.expressions[0]?.assetId ?? '';
}

/* ------------------------------------------------------------------ */
/* Daftar draf yang dapat dilanjutkan                                 */
/* ------------------------------------------------------------------ */

export function draftResumePanel(drafts: DraftWorld[]): SafeHtml {
  if (drafts.length === 0) {
    return html``;
  }

  const rows = drafts.map((draft) => {
    const step = stepOfDraft(draft);
    const missing: string[] = [];
    if (draft.coverMediaId === null) {
      missing.push('belum ada sampul');
    }
    if (draft.backgroundCount === 0) {
      missing.push('belum ada latar');
    }
    if (draft.npcCount === 0) {
      missing.push('belum ada NPC');
    }

    return html`<tr>
  <td>
    <strong>${draft.title.trim().length > 0 ? esc(draft.title) : html`<span class="muted">tanpa judul</span>`}</strong>
    <div class="muted mono" style="font-size:11px">${esc(draft.worldId)} · v${String(draft.worldVersion)}</div>
  </td>
  <td>${statusPill('draft', `langkah ${String(step)} dari 3`)}</td>
  <td class="muted">${progressText(draft)}</td>
  <td class="muted">${missing.length > 0 ? esc(missing.join(', ')) : html`<span class="pill ok">siap diterbitkan</span>`}</td>
  <td class="muted mono">${esc(formatTime(draft.updatedAt, 'minute'))}</td>
  <td class="right">
    <a href="/admin/worlds/${esc(draft.worldId)}/wizard/${String(step)}"><button type="button">Lanjutkan</button></a>
  </td>
</tr>`;
  });

  return html`<h2>Draf belum selesai</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    Dunia yang belum diterbitkan. Draf dapat ditinggalkan dan dilanjutkan kapan saja.
  </p>
  ${table(
    ['Dunia', 'Kemajuan', 'Isi', 'Yang kurang', 'Terakhir disentuh', ''],
    rows,
    'Tidak ada draf.',
  )}
</div>`;
}

function notADraft(): SafeHtml {
  return html`<h1>Bukan draf</h1>
<div class="card">
  <p>
    Dunia ini sudah pernah diterbitkan, jadi versinya tidak dapat diubah di tempat —
    perjalanan pemain menunjuk versi tersebut, dan mengubahnya akan mengubah cerita
    yang sedang mereka baca.
  </p>
  <p><a href="/admin/worlds">Kembali ke daftar dunia</a></p>
</div>`;
}
