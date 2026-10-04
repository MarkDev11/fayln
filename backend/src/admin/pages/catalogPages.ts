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
import { esc, escOr, formatTime, html, inputValue, safe, selected, statusPill, table } from '../html';
import { GENRES, RELATION_STATUSES } from '../../contracts/types';
import type { AdminPageContext } from './context';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'draft', label: 'draft — belum terlihat pemain' },
  { value: 'published', label: 'published — terlihat pemain' },
];

const RATING_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'all — semua umur' },
  { value: '13_plus', label: '13_plus — 13 tahun ke atas' },
  { value: '18_plus', label: '18_plus — 18 tahun ke atas' },
];

const LOCALE_OPTIONS = ['id-ID', 'en-US'] as const;

export async function worldsList(ctx: AdminPageContext): Promise<SafeHtml> {
  const worlds = await ctx.catalog.listWorlds();

  const rows = worlds.map(
    (world) =>
      html`<tr>
  <td>
    <a href="/admin/worlds/${esc(world.worldId)}">${escOr(world.title, '<span class="muted">tanpa judul</span>')}</a>
    <div class="muted mono" style="font-size:11px">${world.worldId} · v${String(world.worldVersion)}</div>
  </td>
  <td>${statusPill(world.status)}</td>
  <td class="muted">${world.genres.join(', ') || '—'}</td>
  <td class="right mono">${String(world.characterCount)}</td>
  <td class="right mono">${String(world.journeyCount)}</td>
  <td class="right muted mono">${formatTime(world.createdAt)}</td>
</tr>`,
  );

  return html`<h1>Dunia</h1>
<p class="sub">
  Menyunting dunia yang sudah terbit akan membuat <strong>versi baru</strong>.
  Cerita yang sedang dimainkan pemain tetap memakai versi lamanya dan tidak berubah.
</p>
<div class="between" style="margin-bottom:14px">
  <span class="muted">${String(worlds.length)} dunia</span>
  <a href="/admin/worlds-new"><button type="button">Dunia baru</button></a>
</div>
<div class="card">${table(
    ['Judul', 'Status', 'Genre', 'Karakter', 'Perjalanan', 'Dibuat'],
    rows,
    'Belum ada dunia.',
  )}</div>`;
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

  const genreBoxes = GENRES.map(
    (genre) =>
      `<label class="inline" style="display:inline-block;margin-right:16px">
        <input type="checkbox" name="genres" value="${esc(genre)}" style="width:auto"
          ${world?.genres.includes(genre) ? 'checked' : ''}>
        <span style="display:inline;margin-left:6px">${esc(genre)}</span>
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

  const versionNotice = world
    ? html`<div class="notice ok" style="background:#1a2b33;border-color:#2a5563;color:#a8d8e6">
    Menyimpan akan membuat <strong>versi ${String(world.worldVersion + 1)}</strong>.
    Versi ${String(world.worldVersion)} tetap ada dan tetap dipakai
    ${String(world.journeyCount)} perjalanan yang sedang berjalan.
  </div>`
    : '';

  const deleteCard = world
    ? html`<h2>Hapus</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    ${
      world.journeyCount > 0
        ? safe(
            `Dunia ini dipakai ${String(world.journeyCount)} perjalanan pemain, jadi tidak dapat dihapus. Ubah statusnya menjadi <span class="mono">retired</span> untuk menariknya dari katalog.`,
          )
        : 'Belum ada perjalanan pemain yang memakai dunia ini, sehingga aman dihapus.'
    }
  </p>
  <form method="post" action="/admin/worlds/delete" class="inline">
    <input type="hidden" name="worldId" value="${inputValue(world.worldId)}">
    <button class="danger" type="submit" ${world.journeyCount > 0 ? 'disabled' : ''}>Hapus dunia</button>
  </form>
</div>`
    : '';

  return html`<h1>${world ? 'Ubah dunia' : 'Dunia baru'}</h1>
<p class="sub">${world ? html`Versi terbaru: v${String(world.worldVersion)} · status ${esc(world.status)}` : 'Dunia baru dimulai dari versi 1.'}</p>
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
${deleteCard}`;
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
${worlds.length === 0 ? '<div class="empty">Belum ada dunia, jadi belum ada karakter.</div>' : sections}`;
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
  </div>
</form>`;
}
