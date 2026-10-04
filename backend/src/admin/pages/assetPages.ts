/**
 * Halaman: aset katalog.
 *
 * Halaman ini sengaja HANYA DAFTAR — tidak ada tombol tambah atau ubah.
 *
 * Alasannya bukan malas, dan perlu ditulis terbuka supaya tidak ada yang
 * menunggu tombol yang tidak pernah datang: berkas gambar aset disajikan dari
 * folder `assets/` di dalam image, ikut berversi bersama kode, dan
 * `registerAssetRoutes` tidak menyediakan satu pun jalur unggah. Menambah aset
 * dari sini berarti menambah BARIS yang menunjuk berkas yang belum ada —
 * hasilnya tautan gambar rusak, dan kerusakannya baru terlihat di perangkat
 * pemain. Menambah aset sungguhan memerlukan unggah berkas, yang di luar
 * lingkup panel ini.
 *
 * Yang bisa dilakukan panel dan ada di sini: melihat aset apa saja yang
 * dikenal, berkas apa yang ditunjuknya, dan — paling berguna — berapa versi
 * dunia yang memakainya. Angka terakhir itu yang menjawab "amanakah aset ini
 * diganti?".
 */

import type { SafeHtml } from '../html';
import { esc, escOr, html, pill, table } from '../html';
import type { AdminPageContext } from './context';

export async function assetsList(ctx: AdminPageContext): Promise<SafeHtml> {
  const assets = await ctx.catalog.listAssets();
  const usage = await ctx.catalog.assetUsage();

  const coverRows = assets.covers.map(
    (asset) =>
      html`<tr>
  <td class="mono">${esc(asset.assetId)}</td>
  <td>${esc(asset.label)}</td>
  <td class="muted mono" style="font-size:11px">${esc(asset.uri)}</td>
  <td>${usageBadge(usage.get(asset.assetId) ?? 0)}</td>
</tr>`,
  );

  const backgroundRows = assets.backgrounds.map(
    (asset) =>
      html`<tr>
  <td class="mono">${esc(asset.assetId)}</td>
  <td>${esc(asset.label)}</td>
  <td class="muted mono" style="font-size:11px">${esc(asset.uri)}</td>
  <td><span class="muted">—</span></td>
</tr>`,
  );

  const portraitRows = assets.portraits.map(
    (asset) =>
      html`<tr>
  <td class="mono">${esc(asset.assetId)}</td>
  <td>${esc(asset.label)}</td>
  <td class="mono" style="font-size:11px">${escOr(asset.npcId, '—')}</td>
  <td class="muted mono" style="font-size:11px">${esc(asset.uri)}</td>
  <td>${usageBadge(usage.get(asset.assetId) ?? 0)}</td>
</tr>`,
  );

  const total = assets.covers.length + assets.backgrounds.length + assets.portraits.length;

  return html`<h1>Aset</h1>
<p class="sub">
  Berkas gambar yang dirujuk katalog. Panel ini hanya menampilkannya: menambah aset
  berarti menambah berkas ke folder <span class="mono">assets/</span> lalu
  membangun ulang aplikasi — tidak ada jalur unggah di sini.
</p>
<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(total)}</b><span>Aset dikenal</span></div>
  <div class="stat"><b>${String(assets.covers.length)}</b><span>Sampul</span></div>
  <div class="stat"><b>${String(assets.backgrounds.length)}</b><span>Latar</span></div>
  <div class="stat"><b>${String(assets.portraits.length)}</b><span>Potret</span></div>
</div>

<h2>Sampul</h2>
<div class="card">${table(['ID', 'Label', 'Berkas', 'Dipakai'], coverRows, 'Belum ada aset sampul.')}</div>

<h2>Latar</h2>
<div class="card">${table(['ID', 'Label', 'Berkas', 'Dipakai'], backgroundRows, 'Belum ada aset latar.')}</div>

<h2>Potret</h2>
<div class="card">${table(['ID', 'Label', 'Karakter', 'Berkas', 'Dipakai'], portraitRows, 'Belum ada aset potret.')}</div>

<div class="notice err" style="margin-top:18px">
  Mengganti berkas aset berlaku untuk <strong>seluruh versi</strong> yang memakainya,
  karena panel hanya menyimpan ID dan berkasnya disajikan dari satu folder bersama.
  Inilah alasan perubahan aset dilakukan lewat commit, bukan dari panel.
</div>`;
}

/**
 * Penanda "dipakai berapa versi dunia".
 *
 * Nol bukan sekadar angka kecil — artinya aset ini aman diganti tanpa
 * mengubah tampilan dunia mana pun yang sudah terbit. Karena itu diberi warna
 * sendiri, bukan disamakan dengan angka biasa.
 */
function usageBadge(count: number): SafeHtml {
  if (count === 0) {
    return pill('tidak dipakai', 'off');
  }
  return pill(`${String(count)} versi`, 'ok');
}
