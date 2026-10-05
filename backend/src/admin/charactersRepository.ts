/**
 * Master karakter.
 *
 * Sebelum ini satu-satunya cara membuat karakter adalah lewat wizard "Dunia
 * baru" langkah 3, dan setiap karakter hidup HANYA di dalam satu versi dunia.
 * Karakter yang sama pada dua dunia berarti mengunggah gambar yang sama dua
 * kali. Berkas ini memindahkan bagian yang TIDAK khas dunia — nama karakter
 * dan gambar-gambar ekspresinya — ke satu tempat.
 *
 * Yang khas dunia (peran, latar belakang, hubungan awal) TIDAK ada di sini dan
 * memang tidak boleh ada: hal itu berbeda di tiap cerita, dan tempatnya di
 * `world_characters`.
 *
 * ---------------------------------------------------------------------------
 * TIGA KEPUTUSAN YANG PERLU DIKETAHUI SEBELUM MENYUNTING BERKAS INI
 * ---------------------------------------------------------------------------
 *
 * 1. EKSPRESI TANPA GAMBAR DIBUANG — di sini, bukan di route.
 *
 *    Aturan ini dulu hidup di route wizard, artinya ia hanya berlaku pada satu
 *    jalur simpan; jalur kedua yang ditambahkan kelak harus mengingatnya
 *    sendiri. Sekarang ia hidup di satu tempat yang dilewati SEMUA jalur.
 *
 *    Yang membuangnya bukan kehati-hatian berlebihan: ekspresi tanpa gambar
 *    tidak dapat dirender klien, dan mesin cerita dapat memilih ekspresi yang
 *    tidak punya gambar sama sekali. Basis data menegakkannya lagi lewat
 *    `media_id NOT NULL` dan kunci asing ke `media_blobs`.
 *
 * 2. NAMA EKSPRESI KEMBAR DITOLAK, bukan dibuang diam-diam.
 *
 *    Dua baris bernama "netral" membuat pemilih ekspresi menjadi ambigu.
 *    Membuang yang kedua tanpa suara akan lebih buruk daripada menolaknya:
 *    admin mengunggah dua gambar, menekan Simpan, dan satu gambar hilang tanpa
 *    penjelasan. Karena itu hasilnya `duplicate-expression`, dan halaman dapat
 *    menyebutkan nama mana yang kembar.
 *
 * 3. `character_id` DIBUAT SISTEM dan tidak pernah berubah.
 *
 *    Berbeda dari genre, tidak ada nilai yang lebih baik daripada id buatan:
 *    nama karakter bebas ("Elysia", "Bu Ratna"), dan menurunkannya menjadi id
 *    akan menabrak nama yang sama pada dua karakter berbeda.
 *
 * ---------------------------------------------------------------------------
 * MENGHAPUS: BELUM ADA YANG MENUNJUK KE SINI
 * ---------------------------------------------------------------------------
 * Saat ini tidak ada tabel yang berkunci asing ke `characters`, sehingga
 * menghapus selalu aman dan `remove()` tidak memeriksa pemakaian. Ketika dunia
 * kelak menunjuk master ini (lewat `world_characters.character_id`), `remove()`
 * harus memeriksa pemakaian lebih dulu dan mengembalikan `in-use` — pola yang
 * sama seperti `GenresRepository.remove()`.
 */

import { randomUUID } from 'node:crypto';

import type { Database, DbClient } from '../db/pool';
import { isMediaId } from '../repositories/mediaRepository';

export const MAX_CHARACTER_NAME = 120;
export const MAX_EXPRESSION_NAME = 120;
export const MAX_USAGE_NOTE = 500;

export type CharacterExpressionRow = {
  position: number;
  expression: string;
  mediaId: string;
  usageNote: string;
};

export type CharacterRow = {
  characterId: string;
  name: string;
  position: number;
  createdAt: Date | string;
  /** Terurut menurut `position`. Yang pertama adalah potret bawaan. */
  expressions: CharacterExpressionRow[];
};

export type CharacterExpressionInput = {
  expression: string;
  mediaId: string;
  usageNote: string;
};

export type CharacterInput = {
  name: string;
  expressions: readonly CharacterExpressionInput[];
};

/** Sebab sebuah tindakan ditolak, agar halaman dapat menampilkan pesan tepat. */
export type CharacterFailure =
  | 'invalid-name'
  | 'no-expressions'
  | 'duplicate-expression'
  | 'not-found';

export type CharacterResult =
  | { ok: true; characterId: string }
  | { ok: false; reason: CharacterFailure; detail?: string };

type Prepared = { name: string; expressions: Omit<CharacterExpressionRow, 'position'>[] };

export class CharactersRepository {
  constructor(private readonly db: Database) {}

  /**
   * Seluruh karakter beserta ekspresinya.
   *
   * Dua kueri, bukan satu kueri ber-`JOIN`: pg-mem tidak dapat sub-kueri yang
   * merujuk tabel induk, dan pengelompokan di sisi JavaScript tidak terasa
   * karena jumlah karakter kecil. Pola yang sama dipakai `GenresRepository`.
   */
  async list(): Promise<CharacterRow[]> {
    const { rows } = await this.db.query<{
      character_id: string;
      name: string;
      position: number;
      created_at: Date | string;
    }>(
      `SELECT character_id, name, position, created_at
       FROM characters
       ORDER BY position ASC, character_id ASC`,
    );

    const { rows: expressionRows } = await this.db.query<{
      character_id: string;
      position: number;
      expression: string;
      media_id: string;
      usage_note: string;
    }>(
      `SELECT character_id, position, expression, media_id, usage_note
       FROM character_expressions
       ORDER BY character_id ASC, position ASC`,
    );

    const byCharacter = new Map<string, CharacterExpressionRow[]>();
    for (const row of expressionRows) {
      const list = byCharacter.get(row.character_id) ?? [];
      list.push({
        position: row.position,
        expression: row.expression,
        mediaId: row.media_id,
        usageNote: row.usage_note,
      });
      byCharacter.set(row.character_id, list);
    }

    return rows.map((row) => ({
      characterId: row.character_id,
      name: row.name,
      position: row.position,
      createdAt: row.created_at,
      expressions: byCharacter.get(row.character_id) ?? [],
    }));
  }

  async find(characterId: string): Promise<CharacterRow | null> {
    const all = await this.list();
    return all.find((row) => row.characterId === characterId) ?? null;
  }

  async create(input: CharacterInput): Promise<CharacterResult> {
    const prepared = await this.prepare(input);
    if ('reason' in prepared) {
      return { ok: false, reason: prepared.reason, detail: prepared.detail };
    }

    const characterId = newCharacterId();

    await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ next_position: number }>(
        'SELECT coalesce(max(position), 0)::int + 1 AS next_position FROM characters',
      );
      await client.query(
        'INSERT INTO characters (character_id, name, position) VALUES ($1, $2, $3)',
        [characterId, prepared.name, rows[0]?.next_position ?? 1],
      );
      await this.replaceExpressions(client, characterId, prepared.expressions);
    });

    return { ok: true, characterId };
  }

  /**
   * Mengubah nama dan mengganti seluruh daftar ekspresi.
   *
   * Daftar ekspresi ditulis ulang, bukan dicocokkan satu per satu: menyunting
   * daftar berarti menggantinya, dan mencocokkan baris lama dengan baris baru
   * hanya menambah tempat yang bisa salah — persis alasan yang sama seperti
   * `saveNpc` menulis ulang sifat dan ekspresi.
   */
  async update(characterId: string, input: CharacterInput): Promise<CharacterResult> {
    const prepared = await this.prepare(input);
    if ('reason' in prepared) {
      return { ok: false, reason: prepared.reason, detail: prepared.detail };
    }

    return this.db.transaction(async (client) => {
      const { rowCount } = await client.query(
        'UPDATE characters SET name = $2 WHERE character_id = $1',
        [characterId, prepared.name],
      );
      if (rowCount === 0) {
        return { ok: false, reason: 'not-found' } as const;
      }
      await this.replaceExpressions(client, characterId, prepared.expressions);
      return { ok: true, characterId } as const;
    });
  }

  /**
   * Menghapus karakter beserta ekspresinya.
   *
   * Baris ekspresi dibuang LEBIH DULU, tidak mengandalkan `ON DELETE CASCADE`.
   * Cascade memang bekerja di pg-mem (dibuktikan `schema.test.ts`), tetapi kode
   * yang benar hanya bergantung pada apa yang ia kerjakan sendiri — pola yang
   * sama seperti `deleteNpc`.
   */
  async remove(characterId: string): Promise<CharacterResult> {
    return this.db.transaction(async (client) => {
      const { rows } = await client.query<{ character_id: string }>(
        'SELECT character_id FROM characters WHERE character_id = $1',
        [characterId],
      );
      if (rows.length === 0) {
        return { ok: false, reason: 'not-found' } as const;
      }

      await client.query('DELETE FROM character_expressions WHERE character_id = $1', [characterId]);
      await client.query('DELETE FROM characters WHERE character_id = $1', [characterId]);
      return { ok: true, characterId } as const;
    });
  }

  /**
   * Menyaring dan menormalkan isian sebelum menyentuh basis data.
   *
   * Mengembalikan `reason` alih-alih melempar, supaya halaman dapat menjelaskan
   * penolakannya — dan supaya tidak ada satu pun jalur simpan yang dapat
   * menyelundupkan ekspresi tanpa gambar.
   */
  private async prepare(
    input: CharacterInput,
  ): Promise<Prepared | { reason: CharacterFailure; detail?: string }> {
    const name = clamp(input.name, MAX_CHARACTER_NAME);
    if (name.length === 0) {
      return { reason: 'invalid-name' };
    }

    // Nama kosong dibuang tanpa suara: baris yang dikosongkan admin adalah
    // baris yang memang tidak jadi dipakai, bukan data yang hilang.
    const named = input.expressions.filter((item) => item.expression.trim().length > 0);
    if (named.length === 0) {
      return { reason: 'no-expressions' };
    }

    const seen = new Set<string>();
    for (const item of named) {
      const key = clamp(item.expression, MAX_EXPRESSION_NAME).toLowerCase();
      if (seen.has(key)) {
        return { reason: 'duplicate-expression', detail: clamp(item.expression, MAX_EXPRESSION_NAME) };
      }
      seen.add(key);
    }

    const known = await this.knownMediaIds(named.map((item) => item.mediaId.trim()));
    const withImage = named.filter((item) => known.has(item.mediaId.trim()));
    if (withImage.length === 0) {
      return { reason: 'no-expressions' };
    }

    return {
      name,
      expressions: withImage.map((item) => ({
        expression: clamp(item.expression, MAX_EXPRESSION_NAME),
        mediaId: item.mediaId.trim(),
        usageNote: clamp(item.usageNote ?? '', MAX_USAGE_NOTE),
      })),
    };
  }

  /**
   * Id berkas unggahan yang benar-benar ada.
   *
   * Satu kueri `IN`, bukan satu kueri per ekspresi. Kunci asing tetap menjadi
   * jaring pengaman, tetapi memeriksanya di sini membuat penolakannya dapat
   * dijelaskan alih-alih muncul sebagai galat basis data.
   *
   * BENTUK id diperiksa lebih dulu, dan itu bukan kehati-hatian berlebihan.
   * `media_blobs.media_id` selalu SHA-256 heksadesimal hasil unggahan, dan
   * penyaji berkas menolak bentuk lain. Baris yang lolos di sini tetapi
   * berbentuk lain akan tersimpan sebagai potret yang TIDAK PERNAH dapat
   * dimuat: markup-nya benar, gambarnya rusak, dan tidak ada galat di mana pun.
   */
  private async knownMediaIds(candidates: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(candidates.filter((id) => isMediaId(id)))];
    if (unique.length === 0) {
      return new Set();
    }

    const placeholders = unique.map((_id, index) => `$${String(index + 1)}`).join(', ');
    const { rows } = await this.db.query<{ media_id: string }>(
      `SELECT media_id FROM media_blobs WHERE media_id IN (${placeholders})`,
      unique,
    );
    return new Set(rows.map((row) => row.media_id));
  }

  /** Hapus lalu isi ulang. Satu-satunya tempat ekspresi ditulis. */
  private async replaceExpressions(
    client: DbClient,
    characterId: string,
    expressions: readonly Omit<CharacterExpressionRow, 'position'>[],
  ): Promise<void> {
    await client.query('DELETE FROM character_expressions WHERE character_id = $1', [characterId]);

    for (const [position, item] of expressions.entries()) {
      await client.query(
        `INSERT INTO character_expressions (character_id, position, expression, media_id, usage_note)
         VALUES ($1, $2, $3, $4, $5)`,
        [characterId, position, item.expression, item.mediaId, item.usageNote],
      );
    }
  }
}

/**
 * Id karakter yang dibuat sistem.
 *
 * Berawalan `char_` supaya bentuknya dapat dikenali sekilas di URL dan di log,
 * dan supaya tidak pernah bertabrakan dengan `npc_` milik `world_characters` —
 * keduanya hidup di tabel berbeda, tetapi muncul berdampingan di halaman.
 */
function newCharacterId(): string {
  return `char_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
