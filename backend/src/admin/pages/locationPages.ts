/**
 * Halaman: lokasi di dalam dunia.
 *
 * Lokasi mengikuti aturan versi yang sama dengan karakter: ia hidup di dalam
 * (world_id, world_version), jadi menambah, mengubah, atau menghapusnya SELALU
 * membuat versi baru dunianya. Halaman ini menuliskan akibat itu di bagian
 * atas, karena bila tidak admin akan menyangka ia sedang menyunting dunia yang
 * sedang tayang.
 *
 * Bentuknya sengaja ringkas — satu tabel dengan formulir sebaris — karena
 * lokasi hanya punya dua hal yang berarti: ID-nya (dipakai cerita untuk
 * menyebut tempat) dan label yang dilihat pemain.
 */

import type { SafeHtml } from '../html';
import { esc, html, inputValue, table } from '../html';
import type { AdminPageContext } from './context';

export async function locationsList(ctx: AdminPageContext, worldId: string | null): Promise<SafeHtml> {
  const worlds = await ctx.catalog.listWorlds();
  if (worlds.length === 0) {
    return html`<h1>Belum ada dunia</h1>
<div class="card"><p>Lokasi hidup di dalam dunia. Buat dunia lebih dulu.</p>
<p><a href="/admin/worlds-new">Buat dunia</a></p></div>`;
  }

  const activeWorldId = worldId && worlds.some((item) => item.worldId === worldId) ? worldId : worlds[0]!.worldId;
  const world = worlds.find((item) => item.worldId === activeWorldId)!;

  const locations = await ctx.catalog.listLocations(activeWorldId, world.worldVersion);

  const worldOptions = worlds.map(
    (item) =>
      `<option value="${inputValue(item.worldId)}"${
        item.worldId === activeWorldId ? ' selected' : ''
      }>${esc(item.title)} (v${String(item.worldVersion)})</option>`,
  );

  const rows = locations.map(
    (location) =>
      html`<tr>
  <td class="mono">${esc(location.locationId)}</td>
  <td>
    <form method="post" action="/admin/locations" class="inline">
      <input type="hidden" name="worldId" value="${inputValue(activeWorldId)}">
      <input type="hidden" name="locationId" value="${inputValue(location.locationId)}">
      <input name="label" required maxlength="120" value="${inputValue(location.label)}"
             style="display:inline-block;width:auto;min-width:220px">
      <button class="ghost" type="submit">Simpan</button>
    </form>
  </td>
  <td class="right mono">${String(location.position)}</td>
  <td class="right">
    <form method="post" action="/admin/locations/delete" class="inline">
      <input type="hidden" name="worldId" value="${inputValue(activeWorldId)}">
      <input type="hidden" name="locationId" value="${inputValue(location.locationId)}">
      <button class="danger" type="submit">Hapus</button>
    </form>
  </td>
</tr>`,
  );

  return html`<h1>Lokasi</h1>
<p class="sub">
  Tempat yang dapat disebut cerita. Menambah, mengubah, atau menghapus lokasi membuat
  <strong>versi baru</strong> dunianya — versi yang sedang dipakai perjalanan pemain
  tidak berubah.
</p>
<div class="between" style="margin-bottom:14px">
  <span class="muted">${String(locations.length)} lokasi pada ${esc(world.title)} v${String(world.worldVersion)}</span>
  <label class="inline" style="margin:0">
    <select name="world" style="width:auto"
            onchange="location.href='/admin/locations?world='+encodeURIComponent(this.value)">
      ${worldOptions}
    </select>
  </label>
</div>
<div class="card">${table(['ID lokasi', 'Label yang dilihat pemain', 'Urutan', ''], rows, 'Belum ada lokasi di dunia ini.')}</div>

<h2>Tambah lokasi</h2>
<div class="card">
  <form method="post" action="/admin/locations">
    <input type="hidden" name="worldId" value="${inputValue(activeWorldId)}">
    <div class="row" style="align-items:flex-end">
      <label style="flex:1;min-width:220px;margin-bottom:0"><span>Label</span>
        <input name="label" required maxlength="120" placeholder="mis. Ruang Rapat Kecil">
      </label>
      <button type="submit">Tambah</button>
    </div>
  </form>
  <p class="sub" style="margin:14px 0 0">
    ID lokasi dibuat otomatis dari labelnya dan stabil selamanya; perubahan setelah
    cerita terbit akan memutus rujukan pada versi lama.
  </p>
</div>`;
}
