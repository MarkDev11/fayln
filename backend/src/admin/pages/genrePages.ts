/**
 * Halaman: master genre.
 *
 * Sebelum ini daftar genre tertanam di tiga tempat sekaligus — konstanta di
 * kode, `CHECK` di skema, dan kunci terjemahan di aplikasi pemain — sehingga
 * menambah satu genre berarti migrasi baru. Halaman ini memindahkan pemiliknya
 * ke admin.
 *
 * DUA HAL YANG HARUS TERLIHAT DARI LAYAR INI, bukan dari dokumentasi:
 *
 * 1. **Id tidak dapat diubah.** Id dirujuk `world_genres`, termasuk oleh versi
 *    dunia lama yang masih dipakai perjalanan pemain. Yang dapat diubah adalah
 *    labelnya — dan label itulah yang dilihat orang.
 * 2. **Genre yang masih dipakai tidak dapat dihapus**, hanya dinonaktifkan.
 *    Tombol hapus pada baris seperti itu diganti penjelasan, bukan dibiarkan
 *    ada lalu ditolak diam-diam saat ditekan.
 */

import type { SafeHtml } from '../html';
import { esc, escOr, html, inputValue, pill, table } from '../html';
import type { AdminPageContext } from './context';
import type { GenreRow } from '../genresRepository';

export async function genresList(ctx: AdminPageContext): Promise<SafeHtml> {
  const genres = await ctx.genres.list();
  const inUse = genres.filter((genre) => genre.worldCount > 0).length;

  const rows = genres.map((genre, index) => genreRow(genre, index, genres.length));

  const totalUse = genres.reduce((sum, genre) => sum + genre.worldCount, 0);

  return html`<h1>Genre</h1>
<p class="sub">
  Genre adalah data, bukan daftar yang ditulis di kode. Genre yang ditambahkan di sini
  langsung dapat dipilih pada formulir dunia, dan muncul di aplikasi pemain
  <strong>hanya bila ada cerita terbit yang memakainya</strong>.
</p>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(genres.length)}</b><span>Genre terdaftar</span></div>
  <div class="stat"><b>${String(genres.filter((genre) => genre.active).length)}</b><span>Ditawarkan di formulir</span></div>
  <div class="stat"><b>${String(inUse)}</b><span>Sedang dipakai dunia</span></div>
</div>

<div class="card">
  ${table(
    ['ID', 'Label (Indonesia)', 'Label (Inggris)', 'Urutan', 'Dipakai', 'Keadaan', ''],
    rows,
    'Belum ada genre. Tambahkan satu di bawah.',
  )}
  ${
    totalUse === 0 && genres.length > 0
      ? html`<p class="sub" style="margin:14px 0 0">
  Belum ada dunia yang memakai genre mana pun. Genre tetap tampil di formulir,
  tetapi belum muncul di aplikasi pemain sampai ada cerita terbit yang memakainya.
</p>`
      : ''
  }
</div>

<h2>Tambah genre</h2>
<div class="card">
  <form method="post" action="/admin/genres">
    <div class="two">
      <label><span>ID — huruf kecil, angka, garis bawah</span>
        <input name="genreId" required maxlength="32" pattern="[a-z][a-z0-9_]{1,31}"
               placeholder="mis. slice_of_life">
      </label>
      <label><span>Label Indonesia</span>
        <input name="labelId" maxlength="60" placeholder="mis. Keseharian">
      </label>
    </div>
    <div class="two">
      <label><span>Label Inggris</span>
        <input name="labelEn" maxlength="60" placeholder="mis. Slice of Life">
      </label>
      <label><span>Keadaan</span>
        <select name="active">
          <option value="true" selected>Ditawarkan di formulir</option>
          <option value="false">Disimpan, tidak ditawarkan</option>
        </select>
      </label>
    </div>
    <div class="row">
      <button type="submit">Tambah genre</button>
    </div>
  </form>
  <p class="sub" style="margin:14px 0 0">
    <strong>ID tidak dapat diubah setelah dibuat.</strong> Ia dirujuk oleh dunia —
    termasuk versi lama yang sedang dibaca pemain. Labelnya yang dapat diubah kapan saja;
    bila label dikosongkan, ID dipakai sebagai gantinya supaya tidak ada baris tanpa nama.
  </p>
</div>

<h2>Menghapus dan menonaktifkan</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    Genre yang <strong>masih dipakai</strong> tidak dapat dihapus — dunia yang memakainya
    akan kehilangan genrenya. Untuk genre yang sudah tidak diinginkan, ubah keadaannya
    menjadi <strong>tidak ditawarkan</strong>: ia hilang dari formulir, tetapi dunia lama
    yang memakainya tetap utuh dan tetap tampil benar di aplikasi pemain.
  </p>
</div>`;
}

/**
 * Satu baris genre.
 *
 * Baris yang masih dipakai TIDAK menampilkan tombol hapus sama sekali. Menampilkan
 * tombol yang pasti ditolak hanya memindahkan penjelasan ke pesan galat setelah
 * ditekan — di sini alasannya terbaca sebelum admin mencoba.
 */
function genreRow(genre: GenreRow, index: number, total: number): SafeHtml {
  const used = genre.worldCount > 0;

  return html`<tr>
  <td class="mono">${esc(genre.genreId)}</td>
  <td colspan="2">
    <form method="post" action="/admin/genres/update" class="inline" style="display:flex;gap:8px;flex-wrap:wrap">
      <input type="hidden" name="genreId" value="${inputValue(genre.genreId)}">
      <input name="labelId" maxlength="60" value="${inputValue(genre.labelId)}"
             style="display:inline-block;width:auto;min-width:150px" aria-label="Label Indonesia">
      <input name="labelEn" maxlength="60" value="${inputValue(genre.labelEn)}"
             style="display:inline-block;width:auto;min-width:150px" aria-label="Label Inggris">
      <select name="active" style="display:inline-block;width:auto" aria-label="Keadaan">
        <option value="true"${genre.active ? ' selected' : ''}>Ditawarkan</option>
        <option value="false"${genre.active ? '' : ' selected'}>Tidak ditawarkan</option>
      </select>
      <button class="ghost" type="submit">Simpan</button>
    </form>
  </td>
  <td class="right">
    <div class="row" style="justify-content:flex-end;gap:4px">
      <form method="post" action="/admin/genres/move">
        <input type="hidden" name="genreId" value="${inputValue(genre.genreId)}">
        <input type="hidden" name="direction" value="up">
        <button class="ghost" type="submit"${index === 0 ? ' disabled' : ''} title="Naikkan">&uarr;</button>
      </form>
      <form method="post" action="/admin/genres/move">
        <input type="hidden" name="genreId" value="${inputValue(genre.genreId)}">
        <input type="hidden" name="direction" value="down">
        <button class="ghost" type="submit"${index === total - 1 ? ' disabled' : ''} title="Turunkan">&darr;</button>
      </form>
      <span class="muted mono">${String(genre.position)}</span>
    </div>
  </td>
  <td class="right mono">
    ${used ? String(genre.worldCount) : html`<span class="muted">0</span>`}
  </td>
  <td>
    ${genre.active ? pill('ditawarkan', 'ok') : pill('tidak ditawarkan', 'off')}
    ${used ? html` ${pill('dipakai', 'draft')}` : ''}
  </td>
  <td class="right">
    ${
      used
        ? html`<span class="muted" style="font-size:12px">dipakai ${escOr(String(genre.worldCount), '0')} dunia</span>`
        : html`<form method="post" action="/admin/genres/delete" class="inline">
      <input type="hidden" name="genreId" value="${inputValue(genre.genreId)}">
      <button class="danger" type="submit">Hapus</button>
    </form>`
    }
  </td>
</tr>`;
}
