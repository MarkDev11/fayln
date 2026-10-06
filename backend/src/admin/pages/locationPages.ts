/**
 * Halaman: master lokasi dan master kategori lokasi.
 *
 * Satu lokasi adalah **satu nama, satu kategori, satu keterangan, dan satu
 * gambar latar**. Kategori di sini berarti SETTING/ERA — "fantasy", "masa kini",
 * "masa lalu", "era dinasti".
 *
 * Bentuknya sengaja datar. Versi sebelumnya memakai baris berulang sehingga satu
 * tempat dapat memuat banyak gambar (satu per era); itu dibuang karena yang
 * diisi sehari-hari adalah satu tempat pada satu era. Tempat yang sama pada era
 * lain sekarang adalah LOKASI LAIN — dan itu memang cara berpikirnya: "Aula
 * Kantor pada era dinasti" bukan "Aula Kantor".
 *
 * Yang khas sebuah cerita (keterangan yang dibaca mesin cerita, kekuatan blur,
 * titik fokus, peluang kemunculan) TIDAK ada di sini. Hal itu berbeda di tiap
 * dunia dan tempatnya di `world_assets`; wizard hanya MEMUNGUT latar dari sini
 * lalu membiarkan dunianya menyesuaikannya.
 */

import type { SafeHtml } from '../html';
import { CHEVRON, esc, escOr, formatTime, html, inputValue, selected } from '../html';
import type { AdminPageContext } from './context';
import type { LocationCategoryRow, LocationRow } from '../locationsRepository';
import type { ProviderRow } from '../providersRepository';

/** Jalur gambar yang disajikan server untuk sebuah berkas unggahan. */
function mediaUrl(mediaId: string): string {
  return `/v1/media/${mediaId}`;
}

/* ------------------------------------------------------------------ */
/* Master lokasi                                                       */
/* ------------------------------------------------------------------ */

export async function locationsList(ctx: AdminPageContext): Promise<SafeHtml> {
  const [locations, categories] = await Promise.all([
    ctx.locations.list(),
    ctx.locations.listCategories(),
  ]);

  const items = locations.map((location) => {
    const thumb = html`<img class="list__thumb list__thumb--wide" src="${esc(mediaUrl(location.mediaId))}" alt="" loading="lazy">`;

    const meta = [
      escOr(location.categoryName, 'tanpa kategori'),
      `dibuat ${formatTime(location.createdAt)}`,
    ].join(' · ');

    return html`<a class="list__item" href="/admin/locations-form?location=${esc(location.locationId)}">
  <div class="list__main">
    <div class="list__title">${escOr(location.name, 'Tanpa nama')}</div>
    <div class="list__meta">${meta}</div>
  </div>
  <div class="list__side">
    ${thumb}
    <span class="list__chev">${CHEVRON}</span>
  </div>
</a>`;
  });

  return html`<div class="page-head">
  <div>
    <h1>Lokasi</h1>
    <p class="sub">
      Master lokasi memuat <strong>nama tempat</strong>, <strong>kategori (era)</strong>,
      dan <strong>satu gambar latarnya</strong>. Isinya tidak terikat satu dunia: satu tempat
      cukup diunggah sekali, lalu dipungut oleh dunia mana pun di langkah 2 wizard.
    </p>
  </div>
  <a href="/admin/locations-form"><button type="button">Lokasi baru</button></a>
</div>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(locations.length)}</b><span>Lokasi terdaftar</span></div>
  <div class="stat"><b>${String(categories.length)}</b><span>Kategori (era)</span></div>
</div>

${
    categories.length === 0
      ? html`<div class="card" style="border-color:var(--warn)">
  <p class="sub" style="margin-top:0">
    <strong>Belum ada kategori (era).</strong> Setiap lokasi wajib punya kategori, jadi
    tambahkan minimal satu lebih dulu — mis. <em>fantasy</em>, <em>masa kini</em>,
    <em>masa lalu</em>, <em>era dinasti</em>.
  </p>
  <p style="margin-bottom:0"><a href="/admin/location-categories">Kelola kategori lokasi</a></p>
</div>`
      : ''
  }

<h2>Terdaftar <span class="muted">${String(locations.length)} lokasi</span></h2>
<div class="card card--list">${
    items.length > 0
      ? html`<div class="list">${items}</div>`
      : html`<div class="empty" style="margin:16px">
  Belum ada lokasi. Tambahkan satu, lalu unggah gambar latarnya.
</div>`
  }</div>

<p class="sub">
  Kategori (era) dikelola di <a href="/admin/location-categories">halaman terpisah</a>.
  Menghapus lokasi yang sudah dipungut sebuah dunia ditolak — hapus latarnya dari dunia itu
  lebih dulu.
</p>`;
}

export async function locationsForm(
  ctx: AdminPageContext,
  locationId: string | null,
): Promise<SafeHtml> {
  const [location, categories, providers] = await Promise.all([
    locationId ? ctx.locations.find(locationId) : Promise.resolve(null),
    ctx.locations.listCategories(),
    ctx.providers.listOfferable(),
  ]);

  if (locationId && !location) {
    return html`<h1>Tidak ditemukan</h1>
<div class="card"><p>Lokasi <span class="mono">${esc(locationId)}</span> tidak ada.</p>
<p><a href="/admin/locations">Kembali ke daftar lokasi</a></p></div>`;
  }

  if (categories.length === 0) {
    return html`<h1>Belum ada kategori</h1>
<div class="card">
  <p>Setiap lokasi wajib punya kategori (era). Tambahkan minimal satu lebih dulu.</p>
  <p><a href="/admin/location-categories">Kelola kategori lokasi</a></p>
</div>`;
  }

  return html`<div class="between">
  <h1>${location ? 'Ubah lokasi' : 'Lokasi baru'}</h1>
  <button type="button" data-bulk-open>Bulk with AI</button>
</div>
<p class="sub">
  Isi nama tempat, pilih kategorinya (era), lalu unggah <strong>satu</strong> gambar latar.
  Tempat yang sama pada era lain dibuat sebagai lokasi tersendiri — mis. "Aula Kantor"
  pada era dinasti dan pada masa kini adalah dua baris.
</p>
<form method="post" action="/admin/locations" class="card" data-background-scope>
  <input type="hidden" name="locationId" value="${inputValue(location?.locationId ?? '')}">

  <label><span>Nama lokasi</span>
    <input name="name" required maxlength="120" placeholder="mis. Aula Kantor"
           value="${inputValue(location?.name ?? '')}">
  </label>

  <div class="two">
    <label><span>Kategori (era)</span>
      <select name="categoryId" required>
        ${categoryOptions(categories, location?.categoryId ?? '')}
      </select>
    </label>
    <label><span>Gambar latar (PNG/JPEG/WebP)</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" data-upload="background">
    </label>
  </div>

  <label><span>Keterangan — dibaca mesin cerita (opsional)</span>
    <input name="description" maxlength="200" placeholder="mis. Aula kantor yang lapang"
           value="${inputValue(location?.description ?? '')}">
  </label>

  <div class="upload-status" data-background-status>${
    location ? 'Tersimpan.' : 'Belum ada gambar.'
  }</div>
  <input type="hidden" name="mediaId" data-background-media value="${inputValue(location?.mediaId ?? '')}">
  ${
    location
      ? html`<img data-background-preview class="upload-thumb" style="width:128px;height:72px"
         src="${esc(mediaUrl(location.mediaId))}" alt="">`
      : html`<img data-background-preview class="upload-thumb" style="width:128px;height:72px" hidden alt="">`
  }

  <div class="row" style="margin-top:18px">
    <button type="submit">Simpan</button>
    <a href="/admin/locations"><button class="ghost" type="button">Batal</button></a>
  </div>
</form>
${bulkSheet(categories, providers)}
${location ? deleteCard(location) : ''}`;
}

/**
 * Sheet "Bulk with AI".
 *
 * Diletakkan di halaman lokasi, bukan halaman tersendiri, karena hasilnya
 * langsung menjadi lokasi: setelah selesai, halaman yang sama cukup dimuat ulang
 * dan barisnya sudah ada di daftar.
 *
 * Markupnya dirender server-side — termasuk saat tersembunyi — supaya ikut
 * tersapu uji render. Kalau dibuat JavaScript, markup yang salah tampil sebagai
 * teks tidak akan tertangkap uji mana pun.
 *
 * Kategori (era) dipilih SEKALI untuk seluruh batch, dan itu keputusan yang
 * disengaja: era adalah taksonomi produk, bukan sesuatu yang dapat dilihat dari
 * gambar. Foto hutan tidak memberi tahu apakah ia "Era Modern" atau "Era
 * Kolonial" dalam katalog ini.
 */
function bulkSheet(categories: LocationCategoryRow[], providers: ProviderRow[]): SafeHtml {
  const providerOptions =
    providers.length > 0
      ? providers.map(
          (provider) =>
            html`<option value="${inputValue(provider.providerId)}">${esc(provider.name)}</option>`,
        )
      : [html`<option value="">(belum ada provider)</option>`];

  return html`<div class="sheet-layer" data-bulk-root hidden>
  <div class="sheet sheet--bulk" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
    <header class="sheet__bar">
      <span class="traffic traffic--live">
        <button type="button" class="traffic__dot traffic__dot--close" data-bulk-action="close" aria-label="Tutup" title="Tutup"></button>
        <button type="button" class="traffic__dot traffic__dot--min" data-bulk-action="min" aria-label="Kecilkan" title="Kecilkan"></button>
        <button type="button" class="traffic__dot traffic__dot--zoom" data-bulk-action="zoom" aria-label="Perlebar" title="Perlebar"></button>
      </span>
      <h2 class="sheet__title" id="bulk-title">Bulk with AI</h2>
    </header>

    <div class="sheet__body">
      <p class="sheet__text">
        Unggah beberapa gambar latar sekaligus. Model visi yang Anda pilih akan mengisi
        <strong>nama</strong> dan <strong>keterangan</strong> untuk tiap gambar, lalu
        menyimpannya sebagai lokasi. Semuanya masih dapat disunting setelah selesai.
      </p>

      <div class="two">
        <label><span>Kategori (era) untuk semua gambar</span>
          <select data-bulk-category>${categoryOptions(categories, '')}</select>
        </label>
        <label><span>Provider</span>
          <select data-bulk-provider>${providerOptions}</select>
        </label>
      </div>

      <label><span>Model visi — pilih yang dapat melihat gambar</span>
        <select data-bulk-model><option value="">(pilih provider lebih dulu)</option></select>
      </label>
      <div class="field__status" data-bulk-model-status>Daftar model diambil dari provider yang dipilih.</div>

      <label><span>Gambar — boleh banyak sekaligus</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple data-bulk-files>
      </label>

      <div class="bulk-list" data-bulk-list></div>
    </div>

    <footer class="sheet__foot">
      <button type="button" class="ghost" data-bulk-action="close">Batal</button>
      <button type="button" data-bulk-action="start">Mulai</button>
    </footer>
  </div>
</div>`;
}

function categoryOptions(
  categories: readonly LocationCategoryRow[],
  current: string,
): SafeHtml {
  return html`${categories.map(
    (category) =>
      html`<option value="${inputValue(category.categoryId)}"${selected(current, category.categoryId)}>${esc(category.name)}</option>`,
  )}`;
}

/**
 * Kartu hapus.
 *
 * Menyebutkan akibatnya dengan tepat: gambar yang diunggah TIDAK ikut terhapus
 * dari penyimpanan berkas, karena berkas yang sama mungkin masih dipakai lokasi
 * atau versi dunia lain.
 */
function deleteCard(location: LocationRow): SafeHtml {
  return html`<h2>Hapus</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    Menghapus lokasi ini membuang <strong>nama, kategori, keterangan, dan latarnya</strong>.
    Berkas gambarnya tidak ikut terhapus — gambar yang sama mungkin masih dipakai
    lokasi lain, dan berkasnya dipakai bersama. Lokasi yang sudah dipungut sebuah
    dunia juga tidak dapat dihapus.
  </p>
  <form method="post" action="/admin/locations/delete" class="inline"
        data-confirm="Hapus lokasi “${esc(location.name)}”?"
        data-confirm-title="Hapus lokasi"
        data-confirm-ok="Hapus lokasi">
    <input type="hidden" name="locationId" value="${inputValue(location.locationId)}">
    <button class="danger" type="submit">Hapus lokasi</button>
  </form>
</div>`;
}

/* ------------------------------------------------------------------ */
/* Master kategori (era)                                               */
/* ------------------------------------------------------------------ */

export async function locationCategoriesList(ctx: AdminPageContext): Promise<SafeHtml> {
  const categories = await ctx.locations.listCategories();
  const used = categories.filter((category) => category.locationCount > 0).length;

  const rows = categories.map((category, index) => categoryRow(category, index, categories.length));

  return html`<h1>Kategori lokasi</h1>
<p class="sub">
  Kategori di sini berarti <strong>setting atau era</strong> — mis. <em>fantasy</em>,
  <em>masa kini</em>, <em>masa lalu</em>, <em>era dinasti</em>. Setiap lokasi memilih satu
  kategori, dan pemilih di langkah 2 wizard mengelompokkan lokasi menurut kategori itu.
</p>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(categories.length)}</b><span>Kategori terdaftar</span></div>
  <div class="stat"><b>${String(used)}</b><span>Sudah dipakai lokasi</span></div>
</div>

<div class="card">
  ${
    categories.length > 0
      ? html`<table>
  <thead><tr>
    <th>Urutan</th><th>Nama kategori</th><th class="right">Dipakai</th><th></th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>`
      : html`<p class="empty" style="margin:16px">
  Belum ada kategori. Tambahkan satu di bawah — lokasi tidak dapat dibuat sebelum ada kategori.
</p>`
  }
</div>

<h2>Tambah kategori</h2>
<div class="card">
  <form method="post" action="/admin/location-categories">
    <div class="row" style="align-items:flex-end">
      <label style="flex:1;min-width:220px;margin-bottom:0"><span>Nama kategori (era)</span>
        <input name="name" required maxlength="60" placeholder="mis. era dinasti">
      </label>
      <button type="submit">Tambah</button>
    </div>
  </form>
  <p class="sub" style="margin:14px 0 0">
    Nama kategori boleh diubah kapan saja; yang tidak dapat diubah adalah id-nya, karena
    lokasi dan dunia menunjuk ke sana. Kategori yang masih dipakai sebuah lokasi tidak
    dapat dihapus — pindahkan lokasinya ke kategori lain lebih dulu.
  </p>
</div>

<p class="sub"><a href="/admin/locations">Kembali ke daftar lokasi</a></p>`;
}

/**
 * Satu baris kategori.
 *
 * Baris yang masih dipakai TIDAK menampilkan tombol hapus sama sekali.
 * Menampilkan tombol yang pasti ditolak hanya memindahkan penjelasan ke pesan
 * galat setelah ditekan — di sini alasannya terbaca sebelum admin mencoba.
 */
function categoryRow(
  category: LocationCategoryRow,
  index: number,
  total: number,
): SafeHtml {
  const inUse = category.locationCount > 0;

  return html`<tr>
  <td>
    <div class="row" style="gap:4px">
      <form method="post" action="/admin/location-categories/move">
        <input type="hidden" name="categoryId" value="${inputValue(category.categoryId)}">
        <input type="hidden" name="direction" value="up">
        <button class="ghost" type="submit"${index === 0 ? ' disabled' : ''} title="Naikkan">&uarr;</button>
      </form>
      <form method="post" action="/admin/location-categories/move">
        <input type="hidden" name="categoryId" value="${inputValue(category.categoryId)}">
        <input type="hidden" name="direction" value="down">
        <button class="ghost" type="submit"${index === total - 1 ? ' disabled' : ''} title="Turunkan">&darr;</button>
      </form>
    </div>
  </td>
  <td>
    <form method="post" action="/admin/location-categories/rename" class="inline"
          style="display:flex;gap:8px;flex-wrap:wrap">
      <input type="hidden" name="categoryId" value="${inputValue(category.categoryId)}">
      <input name="name" required maxlength="60" value="${inputValue(category.name)}"
             style="display:inline-block;width:auto;min-width:200px" aria-label="Nama kategori">
      <button class="ghost" type="submit">Simpan</button>
    </form>
  </td>
  <td class="right mono">${inUse ? String(category.locationCount) : html`<span class="muted">0</span>`}</td>
  <td class="right">
    ${
      inUse
        ? html`<span class="muted" style="font-size:12px">dipakai ${String(
            category.locationCount,
          )} lokasi</span>`
        : html`<form method="post" action="/admin/location-categories/delete" class="inline"
      data-confirm="Hapus kategori “${esc(category.name)}”? Kategori yang masih dipakai lokasi tidak dapat dihapus."
      data-confirm-title="Hapus kategori"
      data-confirm-ok="Hapus">
      <input type="hidden" name="categoryId" value="${inputValue(category.categoryId)}">
      <button class="danger" type="submit">Hapus</button>
    </form>`
    }
  </td>
</tr>`;
}
