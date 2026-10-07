/**
 * Halaman: master karakter.
 *
 * Isinya SENGAJA hanya dua hal — **nama** dan **gambar tiap ekspresi**. Yang
 * khas sebuah cerita (peran, latar belakang, hubungan awal dengan pemain) tidak
 * ada di sini, karena hal itu berbeda di tiap dunia dan tempatnya di
 * `world_characters`. Memisahkannya begini yang membuat satu karakter cukup
 * diunggah SEKALI lalu dipakai banyak dunia.
 *
 * DUA HAL YANG HARUS TERLIHAT DARI LAYAR INI, bukan dari dokumentasi:
 *
 * 1. **Setiap ekspresi wajib punya gambar.** Baris yang gambarnya belum
 *    diunggah tidak ikut tersimpan — dan itu dikatakan di halaman, sebelum
 *    admin menekan Simpan, bukan sesudahnya lewat pesan galat.
 * 2. **Baris pertama menjadi potret bawaan.** Ditulis sebagai aturan, bukan
 *    sebagai tanda pada baris tertentu: tanda pada baris akan berbohong begitu
 *    baris pertama dihapus, sedangkan aturan tetap benar.
 */

import type { SafeHtml } from '../html';
import { CHEVRON, esc, escOr, formatTime, html, inputValue } from '../html';
import type { AdminPageContext } from './context';
import type { CharacterExpressionRow, CharacterRow } from '../charactersRepository';

/** Jalur gambar yang disajikan server untuk sebuah berkas unggahan. */
function mediaUrl(mediaId: string): string {
  return `/v1/media/${mediaId}`;
}

export async function charactersList(ctx: AdminPageContext): Promise<SafeHtml> {
  const characters = await ctx.characters.list();

  const items = characters.map((character) => {
    // Potret bawaan = ekspresi pertama. Repository menjamin setiap ekspresi
    // punya gambar, jadi tidak ada cabang "tanpa gambar" di sini.
    const base = character.expressions[0];
    const thumb = base
      ? html`<img class="list__thumb" src="${esc(mediaUrl(base.mediaId))}" alt="" loading="lazy">`
      : '';

    const meta = [
      `${String(character.expressions.length)} ekspresi`,
      `dibuat ${formatTime(character.createdAt)}`,
    ].join(' · ');

    return html`<a class="list__item" href="/admin/characters-form?character=${esc(character.characterId)}">
  <div class="list__main">
    <div class="list__title">${escOr(character.name, 'Tanpa nama')}</div>
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
    <h1>Karakter</h1>
    <p class="sub">
      Master karakter memuat <strong>nama</strong> dan <strong>gambar setiap ekspresi</strong>.
      Isinya tidak terikat satu dunia: satu karakter cukup diunggah sekali, lalu dipakai
      di dunia mana pun.
    </p>
  </div>
  <a href="/admin/characters-form"><button type="button">Karakter baru</button></a>
</div>
<h2>Terdaftar <span class="muted">${String(characters.length)} karakter</span></h2>
<div class="card card--list">${
    items.length > 0
      ? html`<div class="list">${items}</div>`
      : html`<div class="empty" style="margin:16px">
  Belum ada karakter. Tambahkan satu, lalu unggah gambar untuk tiap ekspresinya.
</div>`
  }</div>`;
}

export async function charactersForm(
  ctx: AdminPageContext,
  characterId: string | null,
): Promise<SafeHtml> {
  const [character, providers] = await Promise.all([
    characterId ? ctx.characters.find(characterId) : Promise.resolve(null),
    ctx.providers.listOfferable(),
  ]);

  if (characterId && !character) {
    return html`<h1>Tidak ditemukan</h1>
<div class="card"><p>Karakter <span class="mono">${esc(characterId)}</span> tidak ada.</p>
<p><a href="/admin/characters">Kembali ke daftar karakter</a></p></div>`;
  }

  const rows = (character?.expressions ?? []).map(expressionRow);

  const providerOptions =
    providers.length > 0
      ? providers.map(
          (provider) =>
            html`<option value="${inputValue(provider.providerId)}">${esc(provider.name)}</option>`,
        )
      : [html`<option value="">(belum ada provider)</option>`];

  return html`<h1>${character ? 'Ubah karakter' : 'Karakter baru'}</h1>
<p class="sub">
  Isi nama karakter, lalu unggah potretnya <strong>sekaligus</strong>. Model visi mengisi
  keterangan tiap potret dengan format <span class="mono">ekspresi, pakaian, pose</span> —
  mis. <span class="mono">senyum, pakaian kantor, normal</span>. Keterangan itu menjadi
  nama ekspresinya, dan masih dapat disunting sebelum disimpan.
  <strong>Baris pertama menjadi potret bawaan</strong>.
</p>
<form method="post" action="/admin/characters" class="card" data-expression-scope data-portrait-bulk>
  <input type="hidden" name="characterId" value="${inputValue(character?.characterId ?? '')}">

  <label><span>Nama karakter</span>
    <input name="name" required maxlength="120" placeholder="mis. Elysia"
           value="${inputValue(character?.name ?? '')}">
  </label>

  <!--
    Impor potret berada DI DALAM formulir, tepat di bawah nama, dan itu bukan
    sekadar tata letak.

    Repositori MENOLAK karakter tanpa ekspresi bergambar (no-expressions), jadi
    "simpan namanya dulu, baru unggah" adalah alur yang tidak mungkin: menyimpan
    nama saja akan gagal. Menaruhnya di sini membuat keduanya satu langkah —
    unggah, biarkan model mengisi barisnya, lalu Simpan sekali.

    Tidak ada bidang di bagian ini yang punya atribut name, jadi tidak ada yang
    ikut terkirim saat formulir disubmit. Yang terkirim hanya baris ekspresinya,
    lewat data-expression-list di bawah.
  -->
  <div class="bulk-inline">
    <div class="two">
      <label><span>Provider</span>
        <select data-portrait-bulk-provider>${providerOptions}</select>
      </label>
      <label><span>Model visi — pilih yang dapat melihat gambar</span>
        <select data-portrait-bulk-model><option value="">(pilih provider lebih dulu)</option></select>
      </label>
    </div>
    <div class="field__status" data-portrait-bulk-model-status>Daftar model diambil dari provider yang dipilih.</div>

    <label><span>Potret — boleh banyak sekaligus</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" multiple data-portrait-bulk-files>
    </label>

    <div class="row" style="margin-top:14px">
      <button class="ghost" type="button" data-portrait-bulk-run>Isi keterangan dengan AI</button>
    </div>

    <div class="bulk-list" data-portrait-bulk-list></div>
  </div>

  <div data-expression-list>${rows}</div>

  <div class="row" style="margin-top:18px">
    <button type="submit">Simpan</button>
    <a href="/admin/characters"><button class="ghost" type="button">Batal</button></a>
  </div>

  <!--
    Templat ini HARUS berada di dalam formulir, bukan sesudahnya.
    Skrip klien mencarinya dengan scope.querySelector, dan scope-nya adalah
    elemen ber-atribut data-expression-scope di atas. Templat yang menjadi
    SAUDARA formulir tidak akan ditemukan; fungsinya keluar lebih awal tanpa
    satu pun galat, dan tombol "+ Tambah ekspresi" hanya diam ketika ditekan.
    admin-render.test.ts menjaga letak ini.
  -->
  <template data-expression-template>
    <div class="expression-row" data-expression-row data-portrait-scope>
      <div class="expression-row__fields">
        <div class="two">
          <label><span>Nama ekspresi</span>
            <input name="expression" maxlength="120" placeholder="mis. netral, senyum, marah">
          </label>
          <label><span>Gambar ekspresi (PNG/JPEG/WebP)</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" data-upload="portrait">
          </label>
        </div>
        <label><span>Catatan pemakaian — membimbing AI (opsional)</span>
          <input name="expressionUsage" maxlength="500"
                 placeholder="mis. dipakai saat ia menahan kesal">
        </label>
        <div class="upload-status" data-portrait-status>Belum ada gambar.</div>
        <input type="hidden" name="expressionMedia" data-portrait-media value="">
        <img data-portrait-preview class="upload-thumb" style="width:64px;height:96px" hidden alt="">
      </div>
      <button class="danger" type="button" data-expression-remove>Hapus baris</button>
    </div>
  </template>
</form>
${character ? deleteCard(character) : ''}`;
}


/**
 * Satu baris ekspresi yang sudah tersimpan.
 *
 * Gambarnya ditampilkan lewat `data-portrait-preview` — elemen yang sama yang
 * dipakai skrip klien untuk memperlihatkan hasil unggahan baru. Jadi mengganti
 * gambar langsung memperbarui pratinjau yang sama, bukan menumpuk gambar kedua.
 */
function expressionRow(item: CharacterExpressionRow): SafeHtml {
  return html`<div class="expression-row" data-expression-row data-portrait-scope>
  <div class="expression-row__fields">
    <div class="two">
      <label><span>Nama ekspresi</span>
        <input name="expression" maxlength="120" placeholder="mis. netral, senyum, marah"
               value="${inputValue(item.expression)}">
      </label>
      <label><span>Gambar ekspresi (PNG/JPEG/WebP)</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-upload="portrait">
      </label>
    </div>
    <label><span>Catatan pemakaian — membimbing AI (opsional)</span>
      <input name="expressionUsage" maxlength="500" value="${inputValue(item.usageNote)}">
    </label>
    <div class="upload-status" data-portrait-status>Tersimpan.</div>
    <input type="hidden" name="expressionMedia" data-portrait-media value="${inputValue(item.mediaId)}">
    <img data-portrait-preview class="upload-thumb" style="width:64px;height:96px"
         src="${esc(mediaUrl(item.mediaId))}" alt="">
  </div>
  <button class="danger" type="button" data-expression-remove>Hapus baris</button>
</div>`;
}

/**
 * Kartu hapus.
 *
 * Menyebutkan akibatnya dengan tepat: gambar yang diunggah TIDAK ikut terhapus
 * dari penyimpanan berkas, karena berkas yang sama mungkin masih dipakai
 * karakter lain. Menghapus master tidak boleh tampak seperti menghapus gambar.
 */
function deleteCard(character: CharacterRow): SafeHtml {
  return html`<h2>Hapus</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    Menghapus karakter ini membuang <strong>nama dan seluruh baris ekspresinya</strong>.
    Berkas gambarnya tidak ikut terhapus — gambar yang sama mungkin masih dipakai
    karakter lain, dan berkasnya dipakai bersama.
  </p>
  <form method="post" action="/admin/characters/delete" class="inline"
        data-confirm="Hapus karakter “${esc(character.name)}” beserta ${String(
          character.expressions.length,
        )} ekspresinya?"
        data-confirm-title="Hapus karakter"
        data-confirm-ok="Hapus karakter">
    <input type="hidden" name="characterId" value="${inputValue(character.characterId)}">
    <button class="danger" type="submit">Hapus karakter</button>
  </form>
</div>`;
}
