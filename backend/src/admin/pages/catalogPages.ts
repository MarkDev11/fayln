/**
 * Halaman: dunia dan karakter.
 *
 * Dua hal yang HARUS terlihat admin dari layar ini, bukan dari dokumentasi:
 *
 * 1. Menyunting dunia yang sudah terbit TIDAK mengubah cerita yang sedang
 *    berjalan. Versi baru dibuat, versi lama diarsipkan, dan perjalanan lama
 *    tetap di versinya. Peringatan itu ditulis di formulir, bukan disembunyikan.
 * 2. Dunia dengan perjalanan pemain tidak dapat dihapus, hanya diarsipkan.
 */

import type { SafeHtml } from '../html';
import { CHEVRON, esc, escOr, formatTime, html, inputValue, safe, selected, statusPill, table } from '../html';
import { RELATION_STATUSES } from '../../contracts/types';
import { worldStatusLabel, type WorldStatus } from '../catalogAdminRepository';
import type { AdminPageContext } from './context';
import { draftResumePanel } from './wizardPages';

/**
 * Empat keadaan dunia, dengan kata-kata yang dipakai admin sehari-hari.
 *
 * Dua yang terakhir sering tertukar, padahal akibatnya berbeda bagi pemain:
 * `retired` menarik dunia dari katalog tetapi perjalanan yang sudah ada tetap
 * dapat diselesaikan; `revoked` menariknya seluruhnya. Karena itu bedanya
 * ditulis di pilihan, bukan diserahkan ke ingatan.
 */
const STATUS_OPTIONS: { value: WorldStatus; label: string; help: string }[] = [
  { value: 'draft', label: 'draft — belum terlihat pemain', help: 'Disiapkan diam-diam. Dunia terbit yang lama tetap tayang.' },
  { value: 'published', label: 'published — terlihat pemain', help: 'Tayang di katalog. Versi terbit lama otomatis diarsipkan.' },
  { value: 'retired', label: 'retired — ditarik', help: 'Keluar dari katalog, tetapi perjalanan yang sudah berjalan tetap bisa dilanjutkan.' },
  { value: 'revoked', label: 'revoked — dicabut', help: 'Ditarik seluruhnya; dunia tidak lagi dilayani, termasuk perjalanan yang sedang berjalan.' },
];

/**
 * Pil status dunia dengan label yang dapat dibaca.
 *
 * Nilai mentahnya (`published`, `retired`, …) TIDAK lagi dicetak sebagai baris
 * kedua di bawah pil. Dulu ia begitu, dengan alasan bahwa nilai itulah yang
 * dipakai kueri dan log — tetapi itu keperluan DIAGNOSA, dan diagnosa tidak
 * punya tempat di baris yang sedang dipindai orang. Hasilnya satu sel memuat
 * fakta yang sama dua kali, "terbit" di atas "published", dan tinggi barisnya
 * berlipat tanpa menambah keterangan. Nilai mentah itu kini menjadi tooltip,
 * dan tetap tertulis lengkap di halaman rincian dunia.
 */
function worldStatusPill(status: string): SafeHtml {
  return statusPill(status, worldStatusLabel(status), status);
}

const RATING_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'all — semua umur' },
  { value: '13_plus', label: '13_plus — 13 tahun ke atas' },
  { value: '18_plus', label: '18_plus — 18 tahun ke atas' },
];

const LOCALE_OPTIONS = ['id-ID', 'en-US'] as const;

/**
 * Daftar dunia — halaman yang memuatnya, bukan sekadar tabelnya.
 *
 * Halaman ini menyusun dirinya sendiri lengkap: judul, tindakan utama, bagian
 * draf, lalu arsipnya. Sebelumnya bagian draf disusun dari luar (di
 * `adminRoutes.ts`) dan ditempelkan DI DEPAN fungsi ini, sehingga `<h2>` draf
 * mendahului `<h1>` Dunia — urutan judul yang terbalik, dan judul besar
 * "Dunia" muncul di tengah halaman seperti judul kedua. Dengan kepemilikan
 * tunggal, urutannya tidak dapat terbalik lagi.
 */
export async function worldsList(ctx: AdminPageContext): Promise<SafeHtml> {
  const [worlds, drafts, genres] = await Promise.all([
    ctx.catalog.listWorlds(),
    ctx.drafts.listDrafts(),
    ctx.genres.list(),
  ]);

  // Label, bukan id. Kolom ini dibaca manusia, dan "Romansa" adalah nama yang
  // dipakai admin di formulir — menampilkan `romance` di sini memaksa admin
  // menerjemahkan sendiri antara apa yang ia centang dan apa yang ia lihat.
  // Id mentahnya tetap ada di formulir dunia bagi yang memerlukannya.
  const labelOf = new Map(genres.map((genre) => [genre.genreId, genre.labelId]));

  /*
   * Draf dikeluarkan dari daftar ini.
   *
   * Sebelumnya sebuah draf tampil DUA KALI pada satu layar — sekali di bagian
   * draf, sekali lagi di tabel di bawahnya — dan siapa pun yang melihatnya
   * wajar mengira ada dua catatan. Draf kini hanya punya satu tempat, lengkap
   * dengan tombol lanjutannya.
   */
  const arsip = worlds.filter((world) => world.status !== 'draft');

  const items = arsip.map((world) => {
    const genresText = world.genres.map((genre) => labelOf.get(genre) ?? genre).join(', ');
    const meta = [
      genresText === '' ? 'Tanpa genre' : genresText,
      `${String(world.characterCount)} karakter`,
      `${String(world.journeyCount)} perjalanan`,
    ].join(' · ');

    return html`<a class="list__item" href="/admin/worlds/${esc(world.worldId)}">
  <div class="list__main">
    <div class="list__title">${escOr(world.title, 'Tanpa judul')}</div>
    <div class="list__meta">${meta}</div>
  </div>
  <div class="list__side">
    ${worldStatusPill(world.status)}
    <span>Dibuat ${formatTime(world.createdAt)}</span>
    <span class="list__chev">${CHEVRON}</span>
  </div>
</a>`;
  });

  return html`<div class="page-head">
  <div>
    <h1>Dunia</h1>
    <p class="sub">
      Menyunting dunia yang sudah terbit akan membuat <strong>versi baru</strong>.
      Cerita yang sedang dimainkan pemain tetap memakai versi lamanya dan tidak berubah.
    </p>
  </div>
  <a href="/admin/worlds-new"><button type="button">Dunia baru</button></a>
</div>
${draftResumePanel(drafts)}
<h2>Terbit &amp; arsip <span class="muted">${String(arsip.length)} dunia</span></h2>
<div class="card card--list">${
    items.length > 0
      ? html`<div class="list">${items}</div>`
      : html`<div class="empty" style="margin:16px">Belum ada dunia yang terbit.</div>`
  }</div>`;
}

export async function worldsForm(ctx: AdminPageContext, worldId: string | null): Promise<SafeHtml> {
  const world = worldId ? await ctx.catalog.findWorld(worldId) : null;
  if (worldId && !world) {
    return html`<h1>Tidak ditemukan</h1>
<div class="card"><p>Dunia <span class="mono">${worldId}</span> tidak ada.</p>
<p><a href="/admin/worlds">Kembali ke daftar dunia</a></p></div>`;
  }

  const assets = await ctx.catalog.listAssets();

  // PENTING: ketiga daftar di bawah tetap berupa LARIK, bukan `.join('')`.
  // `html()` menyisipkan larik apa adanya, sedangkan string di-escape — jadi
  // `.join('')` akan membuat seluruh daftar pilihan tampil sebagai teks markup.
  const coverOptions = assets.covers.map(
    (asset) =>
      `<option value="${inputValue(asset.assetId)}"${selected(world?.coverAssetId, asset.assetId)}>${esc(
        asset.label,
      )} — ${esc(asset.assetId)}</option>`,
  );

  // Genre dibaca dari TABEL, bukan dari konstanta. Daftar tetap akan menyembunyikan
  // genre yang baru dibuat admin — dan menyembunyikannya tepat pada formulir yang
  // seharusnya menawarkannya. Genre nonaktif tetap muncul bila dunia ini sudah
  // memakainya, supaya menyimpan formulir tidak membuang genre diam-diam.
  const genreOptions = await ctx.genres.listOfferable(world?.genres ?? []);
  const genreBoxes = genreOptions.map(
    (genre) =>
      html`<label class="inline" style="margin-right:16px">
  <input type="checkbox" name="genres" value="${genre.genreId}"${
    world?.genres.includes(genre.genreId) ? ' checked' : ''
  } style="width:auto">
  <span style="display:inline;margin-left:6px">${esc(genre.labelId)}</span>
  ${genre.active ? '' : html` <span class="muted" style="font-size:11px">(tidak ditawarkan)</span>`}
</label>`,
  );

  const localeBoxes = LOCALE_OPTIONS.map(
    (locale) =>
      `<label class="inline" style="display:inline-block;margin-right:16px">
        <input type="checkbox" name="locales" value="${esc(locale)}" style="width:auto"
          ${world?.locales.includes(locale) ? 'checked' : ''}>
        <span style="display:inline;margin-left:6px">${esc(locale)}</span>
      </label>`,
  );

  // Warna tidak lagi ditulis di sini. Sebelumnya kotak ini memakai warna gelap
  // tetap yang hanya cocok untuk satu tema; sejak tema mengikuti perangkat,
  // nilai tetap itu membuat teksnya tidak terbaca di tema terang.
  const versionNotice = world
    ? html`<div class="notice info">
    Menyimpan akan membuat <strong>versi ${String(world.worldVersion + 1)}</strong>.
    Versi ${String(world.worldVersion)} tetap ada dan tetap dipakai
    ${String(world.journeyCount)} perjalanan yang sedang berjalan.
  </div>`
    : '';

  /**
   * Riwayat versi.
   *
   * Inilah yang menjawab "apa yang berubah sejak versi kemarin" — dan yang
   * lebih penting, versi mana yang masih dikunci perjalanan pemain sehingga
   * tidak boleh hilang. Kolom Perjalanan pada tabel ini adalah alasan versi
   * lama tidak pernah dihapus.
   */
  const versions = world ? await ctx.catalog.listWorldVersions(world.worldId) : [];
  const versionRows = versions.map((version) => {
    const isCurrent = version.worldVersion === world?.worldVersion;
    return html`<tr>
  <td class="mono">v${String(version.worldVersion)}${
    isCurrent ? html` <span class="pill ok">terbaru</span>` : ''
  }</td>
  <td>${esc(version.title)}</td>
  <td>${worldStatusPill(version.status)}</td>
  <td class="right mono">${String(version.characterCount)}</td>
  <td class="right mono">${String(version.locationCount)}</td>
  <td class="right mono">${String(version.journeyCount)}</td>
  <td class="right muted mono">${formatTime(version.publishedAt ?? version.createdAt, 'minute')}</td>
</tr>`;
  });

  const historyCard = world
    ? html`<h2>Riwayat versi</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    Menyimpan perubahan membuat versi baru; versi lama tidak pernah diubah.
    Versi dengan <strong>Perjalanan &gt; 0</strong> dikunci oleh pemain yang sedang
    membacanya, sehingga tidak boleh dihapus — hanya ditarik.
  </p>
  ${table(['Versi', 'Judul', 'Status', 'Karakter', 'Lokasi', 'Perjalanan', 'Dibuat/diterbitkan'], versionRows, 'Belum ada versi.')}
</div>`
    : '';

  const deleteCard = world
    ? html`<h2>Hapus</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    ${
      world.journeyCount > 0
        ? safe(
            `Dunia ini dipakai ${String(world.journeyCount)} perjalanan pemain, jadi tidak dapat dihapus. Tarik dunianya lewat <strong>Status</strong> di atas: <span class="mono">retired</span> bila perjalanan yang sudah ada boleh diselesaikan, <span class="mono">revoked</span> bila dunia harus berhenti dilayani seluruhnya.`,
          )
        : 'Belum ada perjalanan pemain yang memakai dunia ini, sehingga aman dihapus.'
    }
  </p>
  <form method="post" action="/admin/worlds/delete" class="inline"
        data-confirm="Hapus dunia “${esc(world.title)}” beserta seluruh versinya? Perjalanan pemain yang menunjuk ke sana tidak dapat dibuka lagi."
        data-confirm-title="Hapus dunia"
        data-confirm-ok="Hapus dunia">
    <input type="hidden" name="worldId" value="${inputValue(world.worldId)}">
    <button class="danger" type="submit" ${world.journeyCount > 0 ? 'disabled' : ''}>Hapus dunia</button>
  </form>
</div>`
    : '';

  return html`<h1>${world ? 'Ubah dunia' : 'Dunia baru'}</h1>
<p class="sub">${
  world
    ? html`Versi terbaru: v${String(world.worldVersion)} · status ${esc(world.status)} (${esc(
        worldStatusLabel(world.status),
      )})`
    : 'Dunia baru dimulai dari versi 1.'
}</p>
${versionNotice}
<form method="post" action="/admin/worlds" class="card">
  <input type="hidden" name="worldId" value="${inputValue(world?.worldId ?? '')}">
  <label><span>Judul</span>
    <input name="title" required maxlength="120" value="${inputValue(world?.title ?? '')}">
  </label>
  <label><span>Sinopsis singkat (tampil di katalog)</span>
    <input name="synopsis" required maxlength="240" value="${inputValue(world?.synopsis ?? '')}">
  </label>
  <label><span>Premis (latar lengkap untuk pembaca)</span>
    <textarea name="premise" required maxlength="2000">${esc(world?.premise ?? '')}</textarea>
  </label>
  <div class="two">
    <label><span>Sampul</span>
      <select name="coverAssetId" required>
        <option value="">— pilih aset sampul —</option>
        ${coverOptions}
      </select>
    </label>
    <label><span>Status</span>
      <select name="status">
        ${STATUS_OPTIONS.map(
          (option) =>
            `<option value="${esc(option.value)}"${selected(world?.status, option.value)}>${esc(option.label)}</option>`,
        )}
      </select>
      <div class="muted" style="font-size:12px;margin-top:6px">
        ${STATUS_OPTIONS.map(
          (option) =>
            html`<div><span class="mono">${esc(option.value)}</span> — ${esc(option.help)}</div>`,
        )}
      </div>
    </label>
  </div>
  <label><span>Tingkat usia</span>
    <select name="contentRating">
      ${RATING_OPTIONS.map(
        (option) =>
          `<option value="${esc(option.value)}"${selected(world?.contentRating, option.value)}>${esc(option.label)}</option>`,
      )}
    </select>
  </label>
  <label><span>Genre (boleh lebih dari satu)</span>
    <div>${genreBoxes}</div>
  </label>
  <label><span>Bahasa balasan yang didukung</span>
    <div>${localeBoxes}</div>
  </label>
  <div class="row">
    <button type="submit">Simpan</button>
    <a href="/admin/worlds"><button class="ghost" type="button">Batal</button></a>
  </div>
</form>
${deleteCard}
${historyCard}`;
}

export async function charactersList(ctx: AdminPageContext): Promise<SafeHtml> {
  const worlds = await ctx.catalog.listWorlds();

  const sections = await Promise.all(
    worlds.map(async (world) => {
      const characters = await ctx.catalog.listCharacters(world.worldId);
      const rows = characters.map(
        (npc) =>
          html`<tr>
  <td>
    <a href="/admin/characters-form?world=${esc(world.worldId)}&npc=${esc(npc.npcId)}">${esc(npc.name)}</a>
    <div class="muted mono" style="font-size:11px">${npc.npcId}</div>
  </td>
  <td>${esc(npc.role)}</td>
  <td class="muted">${npc.traits.join(', ') || '—'}</td>
  <td>${statusPill(npc.initialRelation)}</td>
  <td class="muted mono">${escOr(npc.defaultPortraitAssetId, '—')}</td>
</tr>`,
      );

      return html`<h2>${esc(world.title)} <span class="muted" style="text-transform:none;letter-spacing:0">v${String(world.worldVersion)}</span></h2>
<div class="card">
  ${table(['Nama', 'Peran', 'Sifat', 'Hubungan awal', 'Potret bawaan'], rows, 'Belum ada karakter di dunia ini.')}
  <div style="margin-top:14px">
    <a href="/admin/characters-form?world=${esc(world.worldId)}"><button type="button" class="ghost">Tambah karakter</button></a>
  </div>
</div>`;
    }),
  );

  return html`<h1>Karakter</h1>
<p class="sub">
  Menambah atau mengubah karakter membuat <strong>versi baru</strong> pada dunianya.
  Versi lama tetap utuh untuk perjalanan yang sedang berjalan.
</p>
${worlds.length === 0 ? html`<div class="empty">Belum ada dunia, jadi belum ada karakter.</div>` : sections}`;
}

export async function charactersForm(
  ctx: AdminPageContext,
  worldId: string | null,
  npcId: string | null,
): Promise<SafeHtml> {
  const worlds = await ctx.catalog.listWorlds();
  if (worlds.length === 0) {
    return html`<h1>Tidak ada dunia</h1>
<div class="card"><p>Buat dunia lebih dulu sebelum menambahkan karakter.</p>
<p><a href="/admin/worlds-new">Buat dunia</a></p></div>`;
  }

  const activeWorldId = worldId ?? worlds[0]?.worldId ?? '';
  const world = worlds.find((item) => item.worldId === activeWorldId);
  const character = npcId && world ? await ctx.catalog.findCharacter(activeWorldId, npcId) : null;

  // Sama seperti di `worldsForm`: kirim LARIK ke `html()`, jangan `.join('')`.
  const worldOptions = worlds.map(
    (item) =>
      `<option value="${inputValue(item.worldId)}"${selected(activeWorldId, item.worldId)}>${esc(
        item.title,
      )} (v${String(item.worldVersion)})</option>`,
  );

  const assets = await ctx.catalog.listAssets();
  // Potret disaring ke yang memang milik dunia ini bila ada; kalau tidak, semua
  // potret ditampilkan supaya admin dapat memakai ulang yang sudah ada.
  const ownPortraits = assets.portraits.filter((_asset) => true);
  const portraitOptions = ownPortraits.map(
    (asset) =>
      `<option value="${inputValue(asset.assetId)}"${selected(character?.defaultPortraitAssetId, asset.assetId)}>${esc(
        asset.label,
      )} — ${esc(asset.assetId)}</option>`,
  );

  const relationOptions = RELATION_STATUSES.map(
    (relation) =>
      `<option value="${esc(relation)}"${selected(character?.initialRelation, relation)}>${esc(relation)}</option>`,
  );

  return html`<h1>${character ? 'Ubah karakter' : 'Karakter baru'}</h1>
<p class="sub">
  ${
    world
      ? html`Dunia: ${esc(world.title)} · menyimpan akan menaikkan versinya ke v${String(
          character ? world.worldVersion + 1 : world.worldVersion + 1,
        )}.`
      : ''
  }
</p>
<form method="post" action="/admin/characters" class="card">
  <label><span>Dunia</span>
    <select name="worldId" required onchange="location.href='/admin/characters-form?world='+encodeURIComponent(this.value)">
      ${worldOptions}
    </select>
  </label>
  <input type="hidden" name="npcId" value="${inputValue(character?.npcId ?? '')}">
  <div class="two">
    <label><span>Nama</span>
      <input name="name" required maxlength="80" value="${inputValue(character?.name ?? '')}">
    </label>
    <label><span>Peran dalam cerita</span>
      <input name="role" required maxlength="80" placeholder="mis. atasan, sahabat, penjaga"
             value="${inputValue(character?.role ?? '')}">
    </label>
  </div>
  <label><span>Latar belakang yang boleh diketahui pemain</span>
    <textarea name="publicBackstory" required maxlength="1200">${esc(character?.publicBackstory ?? '')}</textarea>
  </label>
  <div class="two">
    <label><span>Hubungan awal terhadap pemain</span>
      <select name="initialRelation">${relationOptions}</select>
    </label>
    <label><span>Potret bawaan</span>
      <select name="defaultPortraitAssetId" required>
        <option value="">— pilih potret —</option>
        ${portraitOptions}
      </select>
    </label>
  </div>
  <label><span>Sifat (satu per baris)</span>
    <textarea name="traits" placeholder="tenang&#10;tegas">${esc(character?.traits.join('\n') ?? '')}</textarea>
  </label>
  <label><span>Ekspresi yang tersedia (satu per baris)</span>
    <textarea name="expressions" placeholder="netral&#10;tersenyum&#10;kesal">${esc(
      character?.expressions.join('\n') ?? '',
    )}</textarea>
  </label>
  <div class="row">
    <button type="submit">Simpan</button>
    <a href="/admin/characters"><button class="ghost" type="button">Batal</button></a>
    ${
      character
        ? html`<form method="post" action="/admin/characters/delete" class="inline"
      data-confirm="Hapus karakter “${esc(character.name)}” dari dunia ini? Dunia akan mendapat versi baru tanpa karakter tersebut."
      data-confirm-title="Hapus karakter"
      data-confirm-ok="Hapus karakter">
      <input type="hidden" name="worldId" value="${inputValue(activeWorldId)}">
      <input type="hidden" name="npcId" value="${inputValue(character.npcId)}">
      <button class="danger" type="submit">Hapus karakter</button>
    </form>`
        : ''
    }
  </div>
</form>
${
  character
    ? html`<h2>Menghapus karakter</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    Karakter tidak pernah dihapus dari versi yang sedang dipakai pemain.
    Menghapusnya membuat <strong>versi baru</strong> dunianya tanpa karakter ini,
    sedangkan versi lama tetap utuh bersama perjalanan yang sudah berjalan.
  </p>
</div>`
    : ''
}`;
}
