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
import { CHEVRON, esc, escOr, formatTime, html, inputValue, statusPill } from '../html';
import { RESPONSE_LOCALES, type ResponseLocale } from '../../contracts/types';
import {
  BASE_EXPRESSION,
  DEFAULT_BLUR_STRENGTH,
  MAX_BACKGROUNDS,
  MAX_WORLD_PREMISE,
  MAX_WORLD_SYNOPSIS,
  type DraftWorld,
  type NpcRow,
  type WizardStep,
} from '../worldDraftRepository';
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

/**
 * Tombol bawah: "Simpan & keluar" selalu ada, aksi utama berbeda per langkah.
 *
 * `primaryLabel` bertipe `SafeHtml`, bukan `string`. Sebabnya konkret dan pernah
 * salah: label dikirim sebagai string, lalu `html()` meng-escape-nya, sehingga
 * entitas seperti `&rarr;` tampil apa adanya sebagai teks "&rarr;" di tombol.
 * Dengan markup, pemanggil menulis persis apa yang ia maksud, dan tanggung jawab
 * meng-escape ada di tempat yang terlihat.
 */
function actions(primaryLabel: SafeHtml, withBack: string | null): SafeHtml {
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

  // Provider untuk pengisi otomatis sinopsis dan premis. Halaman ini tidak
  // memakainya untuk apa pun selain itu — tidak ada gambar di langkah 1.
  const providers = await ctx.providers.listOfferable();
  const providerOptions =
    providers.length > 0
      ? providers.map(
          (provider) =>
            html`<option value="${inputValue(provider.providerId)}">${esc(provider.name)}</option>`,
        )
      : [html`<option value="">(belum ada provider)</option>`];

  const genres = new Set(draft?.genres ?? []);
  const locales = new Set(draft?.locales ?? []);

  // Genre dibaca dari TABEL, bukan dari konstanta — lihat `worldsForm` di
  // `catalogPages`. Dua formulir yang menawarkan daftar berbeda adalah cacat
  // yang tidak terlihat sampai ada yang membandingkan keduanya.
  const genreOptions = await ctx.genres.listOfferable(draft?.genres ?? []);
  const genreBoxes = genreOptions.map(
    (genre) =>
      html`<label class="inline" style="margin-right:14px">
  <input type="checkbox" name="genres" value="${genre.genreId}"${
    genres.has(genre.genreId) ? ' checked' : ''
  } style="width:auto"> ${esc(genre.labelId)}
  ${genre.active ? '' : html`<span class="muted" style="font-size:11px">(tidak ditawarkan)</span>`}
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

  <!--
    Pengisi otomatis berada DI ANTARA judul dan dua bidang yang diisinya.

    Judul adalah masukannya, sinopsis dan premis adalah keluarannya — jadi
    menaruhnya di tengah membuat urutan kerjanya terbaca dari tata letaknya:
    tulis judul, pilih model, tekan tombolnya, periksa hasilnya di bawah.

    Tidak ada bidang di sini yang punya atribut name, jadi tidak ada yang ikut
    terkirim saat formulir disimpan.
  -->
  <div class="ai-fill" data-world-text>
    <div class="two">
      <label><span>Provider</span>
        <select data-world-text-provider>${providerOptions}</select>
      </label>
      <label><span>Model teks — pilih yang dapat menulis panjang</span>
        <select data-world-text-model><option value="">(pilih provider lebih dulu)</option></select>
      </label>
    </div>
    <div class="field__status" data-world-text-status>
      Tulis judulnya lebih dulu, lalu pilih provider dan model.
    </div>
    <div class="row" style="margin-top:12px">
      <button class="ghost" type="button" data-world-text-run>Isi dengan AI</button>
    </div>
  </div>

  <label><span>Sinopsis — latar cerita</span>
    <textarea name="synopsis" required maxlength="${String(MAX_WORLD_SYNOPSIS)}"
              style="min-height:220px"
              placeholder="Latar cerita yang utuh, sekitar 500 kata. Tampil di halaman detail dunia.">${esc(
      draft?.synopsis ?? '',
    )}</textarea>
  </label>

  <label><span>Premis — cerita awal yang mengarahkan AI</span>
    <textarea name="premise" required maxlength="${String(MAX_WORLD_PREMISE)}" style="min-height:220px"
              placeholder="Situasi pembuka: di mana, siapa saja, dan apa yang sedang terjadi — sekitar 500 kata.">${esc(
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

  ${actions(html`Lanjut ke latar belakang &rarr;`, null)}
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

  /*
   * Kategori (era) yang dipilih dunia, beserta berapa lokasi yang benar-benar
   * akan menjadi latar.
   *
   * Yang dihitung adalah lokasi BER-GAMBAR: lokasi yang gambarnya belum
   * diunggah tidak dapat dirender klien, jadi ia tidak akan masuk. Menampilkan
   * jumlah mentah akan menjanjikan latar yang tidak pernah muncul.
   */
  const [masterLocations, masterCategories] = await Promise.all([
    ctx.locations.list(),
    ctx.locations.listCategories(),
  ]);

  const ringkas = new Map<string, { total: number; bergambar: number; nama: string[] }>();
  for (const location of masterLocations) {
    const catatan = ringkas.get(location.categoryId) ?? { total: 0, bergambar: 0, nama: [] };
    catatan.total += 1;
    if (location.mediaId) {
      catatan.bergambar += 1;
      catatan.nama.push(location.name);
    }
    ringkas.set(location.categoryId, catatan);
  }

  const pilihan = masterCategories.map((category) => ({
    categoryId: category.categoryId,
    name: category.name,
    ...(ringkas.get(category.categoryId) ?? { total: 0, bergambar: 0, nama: [] }),
  }));
  const terpilih = draft.locationCategoryId;
  const kategoriTerpilih = pilihan.find((item) => item.categoryId === terpilih) ?? null;
  const adaIsi = pilihan.filter((item) => item.bergambar > 0);

  const categoryOptions = pilihan.map(
    (item) =>
      html`<option value="${inputValue(item.categoryId)}"${
        item.categoryId === terpilih ? ' selected' : ''
      }>${esc(item.name)} — ${String(item.bergambar)} lokasi${
        item.bergambar === 0 ? ' (belum ada gambar)' : ''
      }</option>`,
  );

  /*
   * Satu panel pratinjau per kategori, semuanya dirender dan hanya yang terpilih
   * yang tampak. Menggambar ulang lewat permintaan ke server akan membuat
   * pratinjaunya tertinggal satu langkah dari pilihannya — dan admin yang melihat
   * daftar lama akan mengira pilihannya tidak berpengaruh.
   */
  const panels = pilihan.map((item) => {
    const isi = masterLocations.filter(
      (location) => location.categoryId === item.categoryId && location.mediaId,
    );
    return html`<div data-kategori-panel="${inputValue(item.categoryId)}"${
      item.categoryId === terpilih ? '' : ' hidden'
    }>
  ${
    isi.length === 0
      ? html`<p class="sub" style="margin:0">Kategori ini belum punya lokasi bergambar.</p>`
      : html`<div class="grid">
    ${isi.map(
      (location) =>
        html`<figure class="bg-preview">
      <img src="/v1/media/${esc(location.mediaId)}" alt="${esc(location.name)}" loading="lazy">
      <figcaption>
        <strong>${esc(location.name)}</strong>
        ${location.description.trim().length > 0 ? html`<span class="muted">${esc(location.description)}</span>` : ''}
      </figcaption>
    </figure>`,
    )}
  </div>`
  }
</div>`;
  });

  return html`<h1>Latar belakang — Langkah 2 dari 3</h1>
${wizardSteps(2, worldId, stepOfDraft(draft))}
<p class="sub">
  Dunia memakai <strong>satu kategori lokasi</strong> (era), dan <strong>seluruh</strong> lokasi
  di kategori itu menjadi latar dunia ini. Keterangannya disalin dari master dan blur-nya
  <strong>${String(DEFAULT_BLUR_STRENGTH)}%</strong> — tidak ada yang perlu diatur satu per satu.
  Menyimpan membangun ulang daftarnya, jadi lokasi yang ditambahkan ke kategori itu nanti ikut
  masuk saat disimpan lagi.
</p>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(backgrounds.length)}</b><span>Latar dunia ini</span></div>
  <div class="stat"><b>${String(MAX_BACKGROUNDS)}</b><span>Batas maksimum</span></div>
  <div class="stat"><b>${esc(kategoriTerpilih?.name ?? '—')}</b><span>Kategori terpilih</span></div>
</div>

<form method="post" action="/admin/worlds-wizard/2" class="card" data-kategori-scope>
  <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">

  ${
    adaIsi.length === 0
      ? html`<div class="notice err" style="margin-bottom:14px">
  <strong>Belum ada kategori lokasi yang berisi.</strong> Latar diambil dari master, jadi isi
  <a href="/admin/locations">master lokasi</a> lebih dulu: tambahkan tempat, pilih kategorinya,
  lalu unggah gambarnya. Kategori (era) dikelola di
  <a href="/admin/location-categories">halaman kategori lokasi</a>.
</div>`
      : ''
  }

  <label><span>Kategori lokasi dunia ini</span>
    <select name="categoryId" required data-kategori-pilih>${categoryOptions}</select>
  </label>

  <p class="sub" style="margin-top:0">
    Seluruh lokasi di kategori ini menjadi latar, berurut seperti di master. Lokasi yang
    belum punya gambar dilewati — angka di daftar di atas hanya menghitung yang bergambar.
  </p>

  <div class="bg-preview-wrap">${panels}</div>

  ${actions(html`Lanjut ke karakter &rarr;`, `/admin/worlds/${esc(worldId)}/wizard/1`)}
</form>
`;
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

  <!--
    Templat ini HARUS berada di dalam formulir, bukan sesudahnya.
    Skrip klien mencarinya dengan scope.querySelector, dan scope-nya adalah
    elemen ber-atribut data-npc-scope di atas. Templat yang menjadi SAUDARA
    formulir tidak akan ditemukan; fungsinya keluar lebih awal tanpa satu pun
    galat, dan tombol "+ Tambah ekspresi" hanya diam ketika ditekan — sehingga
    karakter dengan lebih dari satu ekspresi mustahil dibuat lewat wizard.
    admin-render.test.ts menjaga letak ini.
  -->
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
</form>

<form method="post" action="/admin/worlds-wizard/3" class="card">
  <input type="hidden" name="worldId" value="${inputValue(worldId)}">
  ${actions(html`Simpan &amp; terbitkan`, `/admin/worlds/${esc(worldId)}/wizard/2`)}
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
    <form method="post" action="/admin/worlds-wizard/3/npc/delete"
          data-confirm="Hapus karakter “${esc(npc.name)}” beserta seluruh ekspresinya dari draf ini?"
          data-confirm-title="Hapus karakter"
          data-confirm-ok="Hapus karakter">
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

  const items = drafts.map((draft) => {
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

    // Tanpa id dunia dan tanpa nomor versi: keduanya nilai yang dipakai kueri,
    // bukan yang dibaca penulis saat memilih draf mana yang hendak dilanjutkan.
    return html`<a class="list__item" href="/admin/worlds/${esc(draft.worldId)}/wizard/${String(step)}">
  <div class="list__main">
    <div class="list__title">${
      draft.title.trim().length > 0 ? esc(draft.title) : html`<span class="muted">Tanpa judul</span>`
    }</div>
    <div class="list__meta">${progressText(draft)} · ${
      missing.length > 0 ? esc(missing.join(', ')) : 'siap diterbitkan'
    }</div>
  </div>
  <div class="list__side">
    ${statusPill('draft', `langkah ${String(step)} dari 3`)}
    <span>${esc(formatTime(draft.updatedAt, 'minute'))}</span>
    <span class="list__chev">${CHEVRON}</span>
  </div>
</a>`;
  });

  return html`<h2>Draf belum selesai <span class="muted">${String(drafts.length)} draf</span></h2>
<div class="card card--list">
  <p class="sub">Dunia yang belum diterbitkan. Draf dapat ditinggalkan dan dilanjutkan kapan saja.</p>
  <div class="list">${items}</div>
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
