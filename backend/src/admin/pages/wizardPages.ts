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
import { CHEVRON, esc, formatTime, html, inputValue, statusPill } from '../html';
import { RESPONSE_LOCALES, type ResponseLocale } from '../../contracts/types';
import {
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
  const [masterCharacters, providers] = await Promise.all([
    ctx.characters.list(),
    ctx.providers.listOfferable(),
  ]);

  /*
   * Karakter master yang sudah dipakai dunia ini tidak ditawarkan dua kali.
   *
   * Tanpa penyaringan ini, admin dapat memasukkan karakter yang sama berulang
   * kali — dan keduanya akan tampil sebagai dua orang berbeda yang kebetulan
   * bernama sama dan berpotret sama.
   */
  const dipakai = new Set<string>();
  for (const npc of npcs) {
    if (npc.masterCharacterId) {
      dipakai.add(npc.masterCharacterId);
    }
  }
  const tersedia = masterCharacters.filter((item) => !dipakai.has(item.characterId));

  const pilihanKarakter =
    tersedia.length > 0
      ? tersedia.map(
          (item) =>
            html`<option value="${inputValue(item.characterId)}">${esc(item.name)} — ${String(
              item.expressions.length,
            )} ekspresi</option>`,
        )
      : [html`<option value="">(semua karakter master sudah dipakai, atau master masih kosong)</option>`];

  const pilihanProvider =
    providers.length > 0
      ? providers.map(
          (provider) =>
            html`<option value="${inputValue(provider.providerId)}">${esc(provider.name)}</option>`,
        )
      : [html`<option value="">(belum ada provider)</option>`];

  return html`<h1>Karakter — Langkah 3 dari 3</h1>
${wizardSteps(3, worldId, 3)}
<p class="sub">
  Karakter <strong>dipungut dari master</strong>, lengkap dengan seluruh potret
  dan ekspresinya. Yang diisi di sini hanya yang memang milik dunia ini:
  <strong>peran</strong> (fungsi tokoh dalam cerita ini), <strong>background</strong>
  (apa yang sudah terjadi antara ia dan @user), dan <strong>soul</strong>
  (kepribadian mendalamnya). Tulis sedikit di kolomnya, lalu biarkan AI
  memperincinya.
</p>

${
  tersedia.length > 0
    ? html`<form method="post" action="/admin/worlds-wizard/3/npc" class="card">
  <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">
  <div class="two">
    <label><span>Pungut karakter dari master</span>
      <select name="characterId" required>${pilihanKarakter}</select>
    </label>
    <label><span>Peran dalam cerita ini</span>
      <input name="role" maxlength="120" placeholder="mis. bosmu, sahabatmu, mantan pacarmu">
    </label>
  </div>
  <p class="sub" style="margin-top:0">
    Potret dan seluruh ekspresinya ikut otomatis dari master. Namanya boleh diganti
    setelah dipungut — <strong>master tidak ikut berubah</strong>.
  </p>
  <div class="wizard-actions">
    <span class="spacer"></span>
    <button type="submit">Pungut karakter</button>
  </div>
</form>`
    : html`<div class="card" style="border-color:var(--warn)">
  <p class="sub" style="margin-top:0">
    <strong>Tidak ada karakter yang dapat dipungut.</strong> Semua karakter master
    sudah dipakai dunia ini, atau master masih kosong. Isi
    <a href="/admin/characters">master karakter</a> lebih dulu: tambahkan nama,
    lalu unggah potretnya.
  </p>
</div>`
}

${
  npcs.length > 0
    ? html`<div data-ai-scope>
  <div class="card" style="margin-bottom:16px">
    <div class="two">
      <label><span>Provider untuk AI</span>
        <select data-ai-provider>${pilihanProvider}</select>
      </label>
      <label><span>Model teks</span>
        <select data-ai-model><option value="">(pilih provider lebih dulu)</option></select>
      </label>
    </div>
    <div class="field__status" data-ai-status>
      Pilih provider dan model, lalu tekan tombol di bawah kolom mana pun.
    </div>
  </div>

  ${npcs.map((npc) => npcCard(npc, draft))}
</div>`
    : html`<div class="empty">Belum ada karakter. Pungut minimal satu sebelum menerbitkan.</div>`
}


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

/**
 * Satu karakter pada dunia ini.
 *
 * Yang dapat diubah di sini hanya yang memang milik DUNIA — nama (boleh diganti),
 * peran, background, dan soul. Potret serta seluruh ekspresinya berasal dari
 * master dan karena itu tidak disunting: mengubahnya di sini akan membuat dunia
 * ini berbeda dari master tanpa cara untuk menyelaraskan keduanya lagi.
 */
function npcCard(npc: NpcRow, draft: DraftWorld): SafeHtml {
  return html`<div class="npc-card">
  <div class="npc-card__head">
    <img class="upload-thumb" style="width:72px;height:108px" alt=""
         src="${npc.baseUri ? esc(npc.baseUri) : ''}">
    <div style="flex:1;min-width:0">
      <strong>${esc(npc.name)}</strong>
      <div class="muted" style="font-size:12px">
        ${String(npc.expressions.length)} ekspresi${
          npc.masterCharacterId ? ' · dipungut dari master' : ' · tanpa master'
        }
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

  <form method="post" action="/admin/worlds-wizard/3/npc/save" style="margin-top:12px">
    <input type="hidden" name="worldId" value="${inputValue(draft.worldId)}">
    <input type="hidden" name="npcId" value="${inputValue(npc.npcId)}">

    <div class="two">
      <label><span>Nama (boleh diganti untuk dunia ini)</span>
        <input name="name" maxlength="120" value="${inputValue(npc.name)}">
      </label>
      <label><span>Peran dalam cerita ini</span>
        <input name="role" maxlength="120" value="${inputValue(npc.role)}"
               placeholder="mis. bosmu, sahabatmu">
      </label>
    </div>

    <label><span>Background — tulis sedikit, lalu perinci dengan AI</span>
      <textarea name="background" maxlength="4000" data-ai-field="background" style="min-height:110px"
                placeholder="mis. mantan pacar @user saat SMP dulu">${esc(npc.publicBackstory)}</textarea>
    </label>
    <button class="ghost" type="button" data-ai-run="background">Perinci dengan AI</button>

    <label><span>Soul — kepribadian mendalamnya</span>
      <textarea name="soul" maxlength="4000" data-ai-field="soul" style="min-height:110px"
                placeholder="mis. pendiam karena terbiasa mengamati, bukan karena tidak peduli">${esc(
                  npc.soul,
                )}</textarea>
    </label>
    <button class="ghost" type="button" data-ai-run="soul">Tulis soul dengan AI</button>

    <div class="wizard-actions">
      <span class="spacer"></span>
      <button type="submit">Simpan karakter ini</button>
    </div>
  </form>
</div>`;
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
