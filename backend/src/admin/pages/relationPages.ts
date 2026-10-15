/**
 * Halaman master hubungan.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA HALAMAN INI ADA
 * ---------------------------------------------------------------------------
 * Sebelumnya daftar status hubungan adalah konstanta di dalam kode, disalin ke
 * lima tempat — konstanta TS, `CHECK` di skema, array di aplikasi pemain, kunci
 * terjemahan, dan arti untuk model. Menambah status kesembilan berarti menyunting
 * kelimanya; melewatkan salah satu adalah kegagalan senyap: nilainya ditolak
 * basis data, atau tersimpan baik-baik saja lalu tampil "Belum diketahui" di
 * layar pemain tanpa satu pun galat.
 *
 * Di sini ia menjadi data, dan admin dapat mengelolanya sendiri.
 *
 * ---------------------------------------------------------------------------
 * YANG PERLU DIKETAHUI PEMBACA HALAMAN INI
 * ---------------------------------------------------------------------------
 * Perubahan di halaman ini berlaku untuk dunia yang DITERBITKAN SESUDAHNYA.
 * Dunia yang sudah terbit membawa salinan kosakatanya sendiri, dan perjalanan
 * pemain menunjuk ke versi dunia itu — jadi menyunting arti sebuah status di
 * sini tidak mengubah cara tokoh bersikap di cerita yang sedang berjalan.
 *
 * Teks itu ada di halaman, bukan hanya di sini: admin yang tidak tahu akan
 * mengira perubahan artinya langsung berlaku, lalu bingung ketika cerita lama
 * tidak berubah.
 */

import { esc, escOr, html, inputValue, pill, table, type SafeHtml } from '../html';
import type { AdminPageContext } from './context';
import type { RelationRow } from '../relationsRepository';

export async function relationsList(ctx: AdminPageContext): Promise<SafeHtml> {
  const relations = await ctx.relations.list();
  const active = relations.filter((relation) => relation.active).length;
  const used = relations.filter((relation) => relation.usageCount > 0).length;

  return html`<h1>Hubungan</h1>
<p class="sub">
  Status hubungan adalah <strong>data, bukan daftar di dalam kode</strong>. Yang
  ditambahkan di sini langsung dapat dipilih saat membuat dunia, dipakai mesin
  cerita untuk memerankan sikap tokoh, dan tampil di aplikasi pemain
  <strong>tanpa membangun ulang aplikasi</strong>.
</p>

<div class="grid" style="margin-bottom:18px">
  <div class="stat"><b>${String(relations.length)}</b><span>Status terdaftar</span></div>
  <div class="stat"><b>${String(active)}</b><span>Ditawarkan saat membuat dunia</span></div>
  <div class="stat"><b>${String(used)}</b><span>Sudah dipakai cerita</span></div>
</div>

<div class="card">
  ${table(
    ['ID', 'Label (Indonesia)', 'Label (Inggris)', 'Arti untuk mesin cerita', 'Dipakai', 'Keadaan', ''],
    relations.map((relation, index) => relationRow(relation, index, relations.length)),
    'Belum ada status hubungan. Tambahkan satu di bawah.',
  )}
</div>

<h2>Tambah status hubungan</h2>
<div class="card">
  <form method="post" action="/admin/relations">
    <div class="two">
      <label><span>Label Indonesia</span>
        <input name="labelId" required maxlength="60" placeholder="mis. Curiga">
      </label>
      <label><span>Label Inggris</span>
        <input name="labelEn" maxlength="60" placeholder="mis. Suspicious">
      </label>
    </div>
    <div class="field">
      <label class="field__label" for="rel-meaning">Arti untuk mesin cerita</label>
      <textarea id="rel-meaning" name="meaning" maxlength="600" required style="min-height:96px"
                aria-describedby="rel-meaning-hint"
                placeholder="mis. Menjaga jarak dan berhati-hati mempercayai pemain; tetap dapat bersikap sopan."></textarea>
      <span class="field__hint" id="rel-meaning-hint"><b>Wajib.</b> Kalimat ini dibaca
        mesin cerita, bukan pemain. Tuliskan bagaimana tokoh harus <em>bersikap</em> —
        jarak bicara, panjang jawaban, apa yang ia mau bagikan — bukan sekadar nama
        perasaannya. Status tanpa arti akan diperankan model secara acak.</span>
    </div>
    <div class="field">
      <label class="field__label" for="rel-hint">Contoh sikap <span class="muted">(opsional, tetapi sangat dianjurkan)</span></label>
      <textarea id="rel-hint" name="behaviourHint" maxlength="400" style="min-height:72px"
                aria-describedby="rel-hint-hint"
                placeholder="mis. Menjaga jarak fisik, jawaban singkat dan lengkap seperlunya, menimbang kata-katanya."></textarea>
      <span class="field__hint" id="rel-hint-hint"><b>Satu kalimat tentang apa yang TERLIHAT</b>,
        bukan apa yang dirasakan. Ini yang paling menentukan apakah tokohnya benar-benar
        terasa berbeda: model yang hanya diberi nama perasaan cenderung menghasilkan
        perbedaan yang tipis. Kosong boleh — statusnya tetap sah.</span>
    </div>
    <label><span>Keadaan</span>
      <select name="active">
        <option value="true" selected>Ditawarkan saat membuat dunia</option>
        <option value="false">Disimpan, tidak ditawarkan</option>
      </select>
    </label>
    <div class="row">
      <button type="submit">Tambah status</button>
    </div>
  </form>
  <p class="sub" style="margin:14px 0 0">
    <strong>ID dibuat otomatis dari labelnya dan tidak dapat diubah.</strong> Ia
    dirujuk oleh hubungan awal karakter, oleh setiap versi dunia yang terbit, dan
    oleh beat cerita yang sudah tercatat — menggantinya berarti menulis ulang
    riwayat yang justru tidak boleh berubah. Yang dapat diubah adalah label dan
    artinya.
  </p>
</div>

<h2>Menghapus, menonaktifkan, dan kapan berlakunya</h2>
<div class="card">
  <p class="sub" style="margin-top:0">
    Status yang <strong>sudah dipakai cerita</strong> tidak dapat dihapus: menghapusnya
    membuat perjalanan lama kehilangan status yang sedang dipakainya. Untuk status yang
    sudah tidak diinginkan, ubah keadaannya menjadi <strong>tidak ditawarkan</strong> —
    ia hilang dari pilihan saat membuat dunia, tetapi seluruh cerita lama tetap utuh.
  </p>
  <p class="sub">
    Perubahan di halaman ini berlaku untuk dunia yang <strong>diterbitkan
    sesudahnya</strong>. Dunia yang sudah terbit membawa salinan kosakatanya sendiri,
    sehingga menyunting arti sebuah status tidak mengubah cara tokoh bersikap di cerita
    yang sedang berjalan. Agar status baru dapat dipakai, terbitkan versi baru dunianya.
  </p>
</div>`;
}

/**
 * Satu baris status.
 *
 * Baris yang sudah dipakai TIDAK menampilkan tombol hapus sama sekali. Menampilkan
 * tombol yang pasti ditolak hanya memindahkan penjelasan ke pesan galat setelah
 * ditekan — di sini alasannya terbaca sebelum admin mencoba.
 */
function relationRow(relation: RelationRow, index: number, total: number): SafeHtml {
  const used = relation.usageCount > 0;

  return html`<tr>
  <td class="mono">${esc(relation.relationId)}</td>
  <td colspan="2">
    <form method="post" action="/admin/relations/update" class="inline" style="display:flex;gap:8px;flex-wrap:wrap">
      <input type="hidden" name="relationId" value="${inputValue(relation.relationId)}">
      <input name="labelId" maxlength="60" required value="${inputValue(relation.labelId)}"
             style="display:inline-block;width:auto;min-width:150px" aria-label="Label Indonesia">
      <input name="labelEn" maxlength="60" value="${inputValue(relation.labelEn)}"
             style="display:inline-block;width:auto;min-width:150px" aria-label="Label Inggris">
      <select name="active" style="display:inline-block;width:auto" aria-label="Keadaan">
        <option value="true"${relation.active ? ' selected' : ''}>Ditawarkan</option>
        <option value="false"${relation.active ? '' : ' selected'}>Tidak ditawarkan</option>
      </select>
      <button class="ghost" type="submit">Simpan</button>
    </form>
  </td>
  <td style="min-width:260px">
    <form method="post" action="/admin/relations/update" class="inline">
      <input type="hidden" name="relationId" value="${inputValue(relation.relationId)}">
      <input type="hidden" name="labelId" value="${inputValue(relation.labelId)}">
      <input type="hidden" name="labelEn" value="${inputValue(relation.labelEn)}">
      <input type="hidden" name="active" value="${relation.active ? 'true' : 'false'}">
      <textarea name="meaning" maxlength="600" required aria-label="Arti untuk mesin cerita"
                style="min-height:72px">${esc(relation.meaning)}</textarea>
      <textarea name="behaviourHint" maxlength="400" aria-label="Contoh sikap"
                aria-describedby="rel-row-hint"
                placeholder="Contoh sikap (apa yang terlihat)"
                style="min-height:56px;margin-top:6px">${esc(relation.behaviourHint)}</textarea>
      <span class="field__hint" id="rel-row-hint" style="font-size:11px">
        Baris kedua: apa yang <em>terlihat</em>. Ini yang membuat tokohnya benar-benar
        terasa berbeda.
      </span>
      <button class="ghost" type="submit">Simpan arti</button>
    </form>
  </td>
  <td class="right mono">
    ${used ? String(relation.usageCount) : html`<span class="muted">0</span>`}
  </td>
  <td>
    ${relation.active ? pill('ditawarkan', 'ok') : pill('tidak ditawarkan', 'off')}
    ${used ? html` ${pill('dipakai', 'draft')}` : ''}
  </td>
  <td class="right">
    <div class="row" style="justify-content:flex-end;gap:4px">
      <form method="post" action="/admin/relations/move">
        <input type="hidden" name="relationId" value="${inputValue(relation.relationId)}">
        <input type="hidden" name="direction" value="up">
        <button class="ghost" type="submit"${index === 0 ? ' disabled' : ''} title="Naikkan">&uarr;</button>
      </form>
      <form method="post" action="/admin/relations/move">
        <input type="hidden" name="relationId" value="${inputValue(relation.relationId)}">
        <input type="hidden" name="direction" value="down">
        <button class="ghost" type="submit"${index === total - 1 ? ' disabled' : ''} title="Turunkan">&darr;</button>
      </form>
      ${
        used
          ? html`<span class="muted" style="font-size:12px">dipakai ${escOr(String(relation.usageCount), '0')}×</span>`
          : html`<form method="post" action="/admin/relations/delete" class="inline"
      data-confirm="Hapus status “${esc(relation.labelId)}”? Status yang sudah dipakai cerita tidak dapat dihapus — nonaktifkan saja."
      data-confirm-title="Hapus status hubungan"
      data-confirm-ok="Hapus">
      <input type="hidden" name="relationId" value="${inputValue(relation.relationId)}">
      <button class="danger" type="submit">Hapus</button>
    </form>`
      }
    </div>
  </td>
</tr>`;
}
