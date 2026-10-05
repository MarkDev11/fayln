/**
 * Halaman: master lokasi dan master kategori lokasi.
 *
 * Master lokasi memuat dua hal: **nama tempat** dan **gambar latarnya per
 * kategori**. Kategori di sini berarti SETTING/ERA — "fantasy", "masa kini",
 * "masa lalu", "era dinasti" — sehingga satu tempat dapat tampil di banyak era
 * tanpa mengunggah ulang gambarnya.
 *
 * Yang khas sebuah cerita (keterangan yang dibaca mesin cerita, kekuatan blur,
 * titik fokus, peluang kemunculan) TIDAK ada di sini. Hal itu berbeda di tiap
 * dunia dan tempatnya di `world_assets`; wizard hanya MEMUNGUT latar dari sini
 * lalu membiarkan dunianya menyesuaikannya.
 *
 * ---------------------------------------------------------------------------
 * CATATAN NAMA ATRIBUT YANG SENGAJA DIPERTAHANKAN
 * ---------------------------------------------------------------------------
 * Baris latar di bawah memakai penanda `data-expression-*` (`data-expression-scope`,
 * `data-expression-list`, `data-expression-template`, `data-expression-add`,
 * `data-expression-row`, `data-expression-remove`). Namanya memang menyebut
 * "expression" karena mekanisme yang sama pertama kali dipakai baris ekspresi
 * karakter — tetapi yang dimaksud adalah **baris berulang yang dapat ditambah
 * dan dihapus**, bukan ekspresi secara harfiah.
 *
 * Namanya TIDAK diganti dengan alasan yang sama seperti nama kelas CSS panel:
 * satu penanda yang terlewat tidak menghasilkan galat apa pun, hanya tombol
 * "+ Tambah" yang diam selamanya. Menggantinya berarti menyunting tiga halaman
 * sekaligus, dan yang terlewat tidak akan terlihat.
 */

import type { SafeHtml } from '../html';
import { CHEVRON, esc, escOr, formatTime, html, inputValue, selected } from '../html';
import type { AdminPageContext } from './context';
import type { LocationBackgroundRow, LocationCategoryRow, LocationRow } from '../locationsRepository';

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

  const withoutBackground = locations.filter((item) => item.backgrounds.length === 0).length;

  const items = locations.map((location) => {
    const first = location.backgrounds[0];
    const thumb = first
      ? html`<img class="list__thumb list__thumb--wide" src="${esc(mediaUrl(first.mediaId))}" alt="" loading="lazy">`
      : '';

    const meta = [
      `${String(location.backgrounds.length)} era`,
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
      Master lokasi memuat <strong>nama tempat</strong> dan <strong>gambar latarnya</strong>,
      satu gambar untuk tiap kategori (era). Isinya tidak terikat satu dunia: satu tempat
      cukup diunggah sekali, lalu dipungut oleh dunia mana pun di langkah 2 wizard.
    </p>
  </div>
  <a href="/admin/locations-form"><button type="button">Lokasi baru</button></a>
</div>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(locations.length)}</b><span>Lokasi terdaftar</span></div>
  <div class="stat"><b>${String(categories.length)}</b><span>Kategori (era)</span></div>
  <div class="stat"><b>${String(withoutBackground)}</b><span>Belum punya latar</span></div>
</div>

${
    categories.length === 0
      ? html`<div class="card" style="border-color:var(--warn)">
  <p class="sub" style="margin-top:0">
    <strong>Belum ada kategori (era).</strong> Setiap latar wajib punya kategori, jadi
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
  Belum ada lokasi. Tambahkan satu, lalu unggah gambar untuk tiap kategorinya.
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
  const [location, categories] = await Promise.all([
    locationId ? ctx.locations.find(locationId) : Promise.resolve(null),
    ctx.locations.listCategories(),
  ]);

  if (locationId && !location) {
    return html`<h1>Tidak ditemukan</h1>
<div class="card"><p>Lokasi <span class="mono">${esc(locationId)}</span> tidak ada.</p>
<p><a href="/admin/locations">Kembali ke daftar lokasi</a></p></div>`;
  }

  if (categories.length === 0) {
    return html`<h1>Belum ada kategori</h1>
<div class="card">
  <p>Setiap latar wajib punya kategori (era). Tambahkan minimal satu lebih dulu.</p>
  <p><a href="/admin/location-categories">Kelola kategori lokasi</a></p>
</div>`;
  }

  const rows = (location?.backgrounds ?? []).map((item) => backgroundRow(item, categories));

  return html`<h1>${location ? 'Ubah lokasi' : 'Lokasi baru'}</h1>
<p class="sub">
  Isi nama tempat, lalu unggah satu gambar untuk tiap kategori (era).
  <strong>Satu kategori hanya boleh dipakai sekali</strong> — dua gambar pada era yang
  sama akan ditolak, bukan dibuang diam-diam.
</p>
<form method="post" action="/admin/locations" class="card" data-expression-scope>
  <input type="hidden" name="locationId" value="${inputValue(location?.locationId ?? '')}">

  <label><span>Nama lokasi</span>
    <input name="name" required maxlength="120" placeholder="mis. Aula Kantor"
           value="${inputValue(location?.name ?? '')}">
  </label>

  <h2 style="margin-top:22px">Latar belakang per kategori</h2>
  <p class="sub" style="margin-top:0">
    Setiap baris memerlukan <strong>kategori</strong> dan <strong>gambar</strong>.
    Baris yang gambarnya belum diunggah tidak akan tersimpan — jadi unggah dulu
    gambarnya sebelum menekan Simpan. PNG, JPEG, atau WebP.
  </p>

  <div data-expression-list>${rows}</div>

  <div class="wizard-actions">
    <button class="ghost" type="button" data-expression-add>+ Tambah latar</button>
  </div>

  <div class="row" style="margin-top:18px">
    <button type="submit">Simpan</button>
    <a href="/admin/locations"><button class="ghost" type="button">Batal</button></a>
  </div>

  <!--
    Templat ini HARUS berada di dalam formulir, bukan sesudahnya.
    Skrip klien mencarinya dengan scope.querySelector, dan scope-nya adalah
    elemen ber-atribut data-expression-scope di atas. Templat yang menjadi
    SAUDARA formulir tidak akan ditemukan; fungsinya keluar lebih awal tanpa
    satu pun galat, dan tombol "+ Tambah latar" hanya diam ketika ditekan.
    admin-render.test.ts menjaga letak ini.
  -->
  <template data-expression-template>
    <div class="expression-row" data-expression-row data-background-scope>
      <div class="expression-row__fields">
        <div class="two">
          <label><span>Kategori (era)</span>
            <select name="backgroundCategory">${categoryOptions(categories, '')}</select>
          </label>
          <label><span>Gambar latar (PNG/JPEG/WebP)</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" data-upload="background">
          </label>
        </div>
        <label><span>Keterangan — dibaca mesin cerita (opsional)</span>
          <input name="backgroundDescription" maxlength="200" placeholder="mis. Aula kantor yang lapang">
        </label>
        <label><span>Catatan pemakaian — membimbing AI (opsional)</span>
          <input name="backgroundUsage" maxlength="500" placeholder="mis. banyak orang lalu lalang">
        </label>
        <div class="upload-status" data-background-status>Belum ada gambar.</div>
        <input type="hidden" name="backgroundMedia" data-background-media value="">
        <img data-background-preview class="upload-thumb" style="width:128px;height:72px" hidden alt="">
      </div>
      <button class="danger" type="button" data-expression-remove>Hapus baris</button>
    </div>
  </template>
</form>
${location ? deleteCard(location) : ''}`;
}

/**
 * Satu baris latar yang sudah tersimpan.
 *
 * Gambarnya ditampilkan lewat `data-background-preview` — elemen yang sama yang
 * dipakai skrip klien untuk memperlihatkan hasil unggahan baru. Jadi mengganti
 * gambar langsung memperbarui pratinjau yang sama, bukan menumpuk gambar kedua.
 */
function backgroundRow(
  item: LocationBackgroundRow,
  categories: readonly LocationCategoryRow[],
): SafeHtml {
  return html`<div class="expression-row" data-expression-row data-background-scope>
  <div class="expression-row__fields">
    <div class="two">
      <label><span>Kategori (era)</span>
        <select name="backgroundCategory">${categoryOptions(categories, item.categoryId)}</select>
      </label>
      <label><span>Gambar latar (PNG/JPEG/WebP)</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-upload="background">
      </label>
    </div>
    <label><span>Keterangan — dibaca mesin cerita (opsional)</span>
      <input name="backgroundDescription" maxlength="200" value="${inputValue(item.description)}">
    </label>
    <label><span>Catatan pemakaian — membimbing AI (opsional)</span>
      <input name="backgroundUsage" maxlength="500" value="${inputValue(item.usageNote)}">
    </label>
    <div class="upload-status" data-background-status>Tersimpan.</div>
    <input type="hidden" name="backgroundMedia" data-background-media value="${inputValue(item.mediaId)}">
    <img data-background-preview class="upload-thumb" style="width:128px;height:72px"
         src="${esc(mediaUrl(item.mediaId))}" alt="">
  </div>
  <button class="danger" type="button" data-expression-remove>Hapus baris</button>
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
    Menghapus lokasi ini membuang <strong>nama dan seluruh baris latarnya</strong>.
    Berkas gambarnya tidak ikut terhapus — gambar yang sama mungkin masih dipakai
    lokasi lain, dan berkasnya dipakai bersama. Lokasi yang sudah dipungut sebuah
    dunia juga tidak dapat dihapus.
  </p>
  <form method="post" action="/admin/locations/delete" class="inline"
        data-confirm="Hapus lokasi “${esc(location.name)}” beserta ${String(
          location.backgrounds.length,
        )} latarnya?"
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
  <em>masa kini</em>, <em>masa lalu</em>, <em>era dinasti</em>. Satu tempat dapat punya
  satu gambar latar untuk tiap kategori, sehingga tempat yang sama dapat dipakai di
  banyak era tanpa mengunggah ulang.
</p>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(categories.length)}</b><span>Kategori terdaftar</span></div>
  <div class="stat"><b>${String(used)}</b><span>Sudah dipakai latar</span></div>
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
  Belum ada kategori. Tambahkan satu di bawah — latar tidak dapat diunggah sebelum ada kategori.
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
    latar dan dunia menunjuk ke sana. Kategori yang masih dipakai sebuah latar tidak
    dapat dihapus — pindahkan latarnya ke kategori lain lebih dulu.
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
      data-confirm="Hapus kategori “${esc(category.name)}”? Kategori yang masih dipakai latar tidak dapat dihapus."
      data-confirm-title="Hapus kategori"
      data-confirm-ok="Hapus">
      <input type="hidden" name="categoryId" value="${inputValue(category.categoryId)}">
      <button class="danger" type="submit">Hapus</button>
    </form>`
    }
  </td>
</tr>`;
}
