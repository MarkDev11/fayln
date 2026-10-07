/**
 * Wizard "Dunia baru" — draf dunia beserta latar belakang dan NPC-nya.
 *
 * ============================ PENYIMPANGAN YANG DISENGAJA ============================
 *
 * `catalogAdminRepository.ts` memuat aturan yang berbunyi: "versi dunia TIDAK
 * PERNAH diubah di tempat". Aturan itu benar, dan berkas ini MENYIMPANGINYA —
 * dengan sadar, dan hanya untuk baris berstatus `draft`.
 *
 * Alasannya: aturan itu ada untuk melindungi PERJALANAN PEMAIN. Setiap
 * perjalanan menyimpan `world_version`, jadi mengubah baris yang sedang dipakai
 * akan mengubah cerita orang di tengah jalan. Sebuah DRAF tidak dipakai
 * perjalanan mana pun — mustahil, karena ia belum pernah terbit.
 *
 * Kalau draf tetap mengikuti pola salin-saat-simpan, satu dunia dengan 50 latar
 * belakang dan belasan NPC akan menghasilkan puluhan versi hanya untuk satu
 * sesi penyuntingan: setiap ketikan yang disimpan menaikkan nomor versi. Versi
 * yang tidak pernah dilihat siapa pun, tetapi mengunci aset dan membuat riwayat
 * versi tak terbaca.
 *
 * Jadi batasnya diletakkan tepat di tempat yang bermakna:
 *   - `draft`      → boleh diubah di tempat (berkas ini).
 *   - selain draft → WAJIB versi baru (`catalogAdminRepository`).
 *
 * `publishDraft()` adalah satu-satunya peralihan di antara keduanya. Sesudahnya,
 * seluruh penyuntingan kembali tunduk pada aturan lama.
 * =====================================================================================
 */

import { randomUUID } from 'node:crypto';

import type { Database, DbClient } from '../db/pool';
import type { ContentRating, GenreId, RelationStatus, ResponseLocale } from '../contracts/types';
import { RELATION_STATUSES } from '../contracts/types';

/**
 * Batas jumlah latar belakang per versi dunia.
 *
 * Ditegakkan di sini DAN di route. Halaman hanya menyembunyikan tombolnya saat
 * sudah penuh — dan tampilan bukan pengaman: dua tab yang terbuka bersamaan akan
 * sama-sama melihat 49.
 */
export const MAX_BACKGROUNDS = 50;

/**
 * Batas panjang sinopsis dan premis dunia.
 *
 * Dinaikkan dari 240 dan 2000 huruf pada 7 Oktober 2026: pemilik produk menilai
 * batas lamanya terlalu pendek untuk menuliskan latar cerita yang utuh, dan
 * meminta ruang sekitar 500 kata untuk keduanya.
 *
 * Angkanya dipakai BERSAMA oleh skema permintaan di `adminRoutes.ts` dan atribut
 * `maxlength` di halaman wizard. Sebelumnya ketiganya ditulis terpisah, dan
 * angka yang berbeda di salah satunya akan memotong tulisan admin tanpa
 * penjelasan — batas di peramban terasa cukup, lalu server menolaknya.
 *
 * 500 kata berbahasa Indonesia kira-kira 3.500 huruf; 4.000 memberi sedikit
 * ruang lebih tanpa membiarkan bidangnya tumbuh tanpa batas.
 */
export const MAX_WORLD_SYNOPSIS = 4000;
export const MAX_WORLD_PREMISE = 4000;

/** Langkah wizard yang dapat dilanjutkan. */
export type WizardStep = 1 | 2 | 3;

export type DraftWorld = {
  worldId: string;
  worldVersion: number;
  title: string;
  synopsis: string;
  premise: string;
  coverAssetId: string;
  coverMediaId: string | null;
  contentRating: ContentRating;
  genres: GenreId[];
  locales: ResponseLocale[];
  backgroundCount: number;
  npcCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type DraftIdentityInput = {
  title: string;
  synopsis: string;
  premise: string;
  contentRating: ContentRating;
  genres: GenreId[];
  locales: ResponseLocale[];
  /** Media sampul. `null` berarti belum diunggah — draf boleh belum punya. */
  coverMediaId: string | null;
};

export type BackgroundRow = {
  assetId: string;
  mediaId: string | null;
  uri: string;
  label: string;
  description: string;
  usageNote: string;
  encounterLikelihood: string | null;
  blurStrength: number;
  focalX: number;
  focalY: number;
  width: number | null;
  height: number | null;
  position: number;
  /**
   * Lokasi dan kategori (era) master asal latar ini.
   *
   * `null` berarti aset lama yang diunggah sebelum master lokasi ada — dan itu
   * memang benar: ia tidak berasal dari master mana pun. Dibaca halaman langkah 2
   * untuk memberi tahu admin latar ini datang dari mana.
   */
  masterLocationId: string | null;
  masterCategoryId: string | null;
};

export type BackgroundInput = {
  mediaId: string | null;
  label: string;
  description: string;
  usageNote: string;
  encounterLikelihood: string | null;
  blurStrength: number;
  focalX: number;
  focalY: number;
  width: number | null;
  height: number | null;
  /**
   * Lokasi dan kategori master asal latar ini.
   *
   * SENGAJA opsional: hanya `addBackground` yang menulisnya, dan
   * `updateBackground` memang tidak menyentuhnya — menyunting keterangan atau
   * blur sebuah latar tidak boleh mengubah asalnya. Menjadikannya wajib akan
   * memaksa pemanggil `updateBackground` mengirim nilai yang tidak dipakai,
   * dan nilai itu justru mengundang orang mengira ia berpengaruh.
   */
  masterLocationId?: string | null;
  masterCategoryId?: string | null;
};

export type NpcExpressionRow = {
  expression: string;
  usageNote: string;
  mediaId: string | null;
  uri: string;
  assetId: string;
  position: number;
};

export type NpcRow = {
  npcId: string;
  name: string;
  role: string;
  traits: string[];
  publicBackstory: string;
  initialRelation: RelationStatus;
  position: number;
  baseMediaId: string | null;
  baseUri: string;
  expressions: NpcExpressionRow[];
};

export type NpcInput = {
  npcId: string | null;
  name: string;
  role: string;
  traits: string[];
  publicBackstory: string;
  initialRelation: RelationStatus;
  /**
   * Ekspresi berurutan; yang PERTAMA menjadi potret bawaan.
   *
   * Gambar dasar karakter ikut di sini sebagai ekspresi bernama `dasar` dan
   * diletakkan paling depan oleh pemanggil. Tidak ada kolom terpisah untuknya:
   * kolom kedua akan menjadi sumber kebenaran kedua untuk "gambar utama NPC".
   */
  expressions: { expression: string; usageNote: string; mediaId: string | null }[];
};

/** Batas panjang teks, sejalan dengan batas di route. */
const MAX_NAME = 120;
const MAX_DESCRIPTION = 200;
const MAX_USAGE = 500;

const LIKELIHOODS = ['none', 'low', 'medium', 'high'] as const;

export function isLikelihood(value: string): boolean {
  return (LIKELIHOODS as readonly string[]).includes(value);
}

export class WorldDraftRepository {
  constructor(private readonly db: Database) {}

  /* ---------------------------------------------------------------- */
  /* Draf: membuat, membaca, menyunting                                */
  /* ---------------------------------------------------------------- */

  /**
   * Membuat dunia baru beserta versi 1-nya yang berstatus `draf`.
   *
   * Dibuat dengan judul kosong supaya draf dapat dimulai tanpa mengisi apa pun
   * — dan supaya "Draf" di langkah 1 punya sesuatu untuk disimpan. Judul diisi
   * pada penyimpanan pertama.
   */
  async createDraft(): Promise<{ worldId: string; worldVersion: number }> {
    const worldId = `w_${slug(randomUUID())}`;

    return this.db.transaction(async (client) => {
      await client.query('INSERT INTO worlds (world_id) VALUES ($1)', [worldId]);
      await client.query(
        `INSERT INTO world_versions (
           world_id, world_version, title, synopsis, premise,
           cover_asset_id, status, content_rating
         ) VALUES ($1, 1, '', '', '', '', 'draft', 'all')`,
        [worldId],
      );
      return { worldId, worldVersion: 1 };
    });
  }

  /**
   * Draf dari sebuah dunia, atau `null` bila versi terbarunya bukan draf.
   *
   * Inilah yang membatasi wizard pada dunia yang belum pernah terbit. Dunia yang
   * versi terbarunya sudah `published`/`retired`/`revoked` disunting lewat jalur
   * lama yang membuat versi baru — bukan lewat wizard yang mengubah di tempat.
   */
  async findDraft(worldId: string): Promise<DraftWorld | null> {
    const { rows } = await this.db.query<{
      world_id: string;
      world_version: number;
      title: string;
      synopsis: string;
      premise: string;
      cover_asset_id: string;
      content_rating: string;
      created_at: Date | string;
    }>(
      `SELECT world_id, world_version, title, synopsis, premise, cover_asset_id,
              content_rating, created_at
       FROM world_versions
       WHERE world_id = $1 AND status = 'draft'
       ORDER BY world_version DESC LIMIT 1`,
      [worldId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.hydrate(row);
  }

  /** Seluruh draf, yang paling baru disunting lebih dulu. */
  async listDrafts(): Promise<DraftWorld[]> {
    const { rows } = await this.db.query<{
      world_id: string;
      world_version: number;
      title: string;
      synopsis: string;
      premise: string;
      cover_asset_id: string;
      content_rating: string;
      created_at: Date | string;
    }>(
      `SELECT world_id, world_version, title, synopsis, premise, cover_asset_id,
              content_rating, created_at
       FROM world_versions
       WHERE status = 'draft'
       ORDER BY created_at DESC`,
    );

    const drafts = await Promise.all(rows.map((row) => this.hydrate(row)));
    return drafts;
  }

  /**
   * Menyimpan identitas draf: judul, sinopsis, premis, sampul, genre, lokale.
   *
   * Termasuk membuat atau mengganti baris aset sampul. `cover_asset_id` pada
   * `world_versions` selalu menunjuk ke id aset tetap `cover_main`, sehingga
   * mengganti gambar cukup menimpa baris asetnya — tidak menumpuk aset sampul
   * lama yang tidak lagi dirujuk siapa pun.
   */
  async saveIdentity(
    worldId: string,
    worldVersion: number,
    input: DraftIdentityInput,
  ): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE world_versions
         SET title = $3, synopsis = $4, premise = $5, content_rating = $6,
             cover_asset_id = $7
         WHERE world_id = $1 AND world_version = $2 AND status = 'draft'`,
        [
          worldId,
          worldVersion,
          input.title,
          input.synopsis,
          input.premise,
          input.contentRating,
          input.coverMediaId ? 'cover_main' : '',
        ],
      );

      await replaceList(client, 'world_genres', 'genre', worldId, worldVersion, input.genres);
      await replaceList(client, 'world_response_locales', 'locale', worldId, worldVersion, input.locales);

      if (input.coverMediaId) {
        await client.query(
          `INSERT INTO world_assets (world_id, world_version, asset_id, kind, label, uri, media_id, position)
           VALUES ($1,$2,'cover_main','cover',$3,$4,$5,0)
           ON CONFLICT (world_id, world_version, asset_id) DO UPDATE SET
             label = $3, uri = $4, media_id = $5`,
          [worldId, worldVersion, input.title, mediaUri(input.coverMediaId), input.coverMediaId],
        );
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Latar belakang                                                    */
  /* ---------------------------------------------------------------- */

  async listBackgrounds(worldId: string, worldVersion: number): Promise<BackgroundRow[]> {
    const { rows } = await this.db.query<{
      asset_id: string;
      media_id: string | null;
      uri: string;
      label: string;
      description: string;
      usage_note: string;
      encounter_likelihood: string | null;
      blur_strength: number;
      focal_x: number;
      focal_y: number;
      width: number | null;
      height: number | null;
      position: number;
      master_location_id: string | null;
      master_category_id: string | null;
    }>(
      `SELECT asset_id, media_id, uri, label, description, usage_note,
              encounter_likelihood, blur_strength, focal_x, focal_y,
              width, height, position, master_location_id, master_category_id
       FROM world_assets
       WHERE world_id = $1 AND world_version = $2 AND kind = 'background'
       ORDER BY position ASC, asset_id ASC`,
      [worldId, worldVersion],
    );

    return rows.map((row) => ({
      assetId: row.asset_id,
      mediaId: row.media_id,
      uri: row.uri,
      label: row.label,
      description: row.description,
      usageNote: row.usage_note,
      encounterLikelihood: row.encounter_likelihood,
      blurStrength: row.blur_strength,
      focalX: row.focal_x,
      focalY: row.focal_y,
      width: row.width,
      height: row.height,
      position: row.position,
      masterLocationId: row.master_location_id,
      masterCategoryId: row.master_category_id,
    }));
  }

  /**
   * Menambah satu latar belakang.
   *
   * Mengembalikan `null` bila batas 50 sudah tercapai. Pemeriksaannya dilakukan
   * DI DALAM transaksi dan lewat kueri terpisah — pg-mem tidak dapat menghitung
   * sub-kueri berkorelasi, dan memeriksa di luar transaksi membuka celah dua
   * permintaan yang sama-sama melihat 49.
   */
  async addBackground(
    worldId: string,
    worldVersion: number,
    input: BackgroundInput,
  ): Promise<BackgroundRow | null> {
    return this.db.transaction(async (client) => {
      const { rows: counted } = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM world_assets
         WHERE world_id = $1 AND world_version = $2 AND kind = 'background'`,
        [worldId, worldVersion],
      );
      if ((counted[0]?.total ?? 0) >= MAX_BACKGROUNDS) {
        return null;
      }

      const { rows: nextRows } = await client.query<{ next_position: number }>(
        `SELECT coalesce(max(position), 0)::int + 1 AS next_position
         FROM world_assets WHERE world_id = $1 AND world_version = $2 AND kind = 'background'`,
        [worldId, worldVersion],
      );
      const position = nextRows[0]?.next_position ?? 1;

      const assetId = `bg_${slug(randomUUID()).slice(0, 10)}`;
      await client.query(
        `INSERT INTO world_assets (
           world_id, world_version, asset_id, kind, label, uri, media_id,
           description, usage_note, encounter_likelihood,
           blur_strength, focal_x, focal_y, width, height, position,
           master_location_id, master_category_id
         ) VALUES ($1,$2,$3,'background',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          worldId,
          worldVersion,
          assetId,
          clamp(input.label, MAX_NAME),
          input.mediaId ? mediaUri(input.mediaId) : '',
          input.mediaId,
          clamp(input.description, MAX_DESCRIPTION),
          clamp(input.usageNote, MAX_USAGE),
          normaliseLikelihood(input.encounterLikelihood),
          clampBlur(input.blurStrength),
          clampFocal(input.focalX),
          clampFocal(input.focalY),
          input.width,
          input.height,
          position,
          input.masterLocationId ?? null,
          input.masterCategoryId ?? null,
        ],
      );

      const all = await this.listBackgrounds(worldId, worldVersion);
      return all.find((item) => item.assetId === assetId) ?? null;
    });
  }

  async updateBackground(
    worldId: string,
    worldVersion: number,
    assetId: string,
    input: BackgroundInput,
  ): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE world_assets SET
         label = $4, description = $5, usage_note = $6, encounter_likelihood = $7,
         blur_strength = $8, focal_x = $9, focal_y = $10,
         media_id = coalesce($11, media_id),
         uri = coalesce($12, uri),
         width = coalesce($13, width), height = coalesce($14, height)
       WHERE world_id = $1 AND world_version = $2 AND asset_id = $3 AND kind = 'background'`,
      [
        worldId,
        worldVersion,
        assetId,
        clamp(input.label, MAX_NAME),
        clamp(input.description, MAX_DESCRIPTION),
        clamp(input.usageNote, MAX_USAGE),
        normaliseLikelihood(input.encounterLikelihood),
        clampBlur(input.blurStrength),
        clampFocal(input.focalX),
        clampFocal(input.focalY),
        input.mediaId,
        input.mediaId ? mediaUri(input.mediaId) : null,
        input.width,
        input.height,
      ],
    );
    return rowCount > 0;
  }

  /**
   * Menghapus latar belakang dari draf.
   *
   * Yang dihapus hanya BARIS ASET, bukan berkas medianya. Berkas bersifat
   * content-addressed dan dapat dipakai versi atau dunia lain; menghapusnya di
   * sini akan memutus gambar di tempat lain.
   */
  async deleteBackground(worldId: string, worldVersion: number, assetId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM world_assets
       WHERE world_id = $1 AND world_version = $2 AND asset_id = $3 AND kind = 'background'`,
      [worldId, worldVersion, assetId],
    );
    return rowCount > 0;
  }

  /**
   * Menggeser satu latar belakang satu langkah ke atas atau ke bawah.
   *
   * Urutan adalah urutan cerita, jadi ia harus dapat diatur. Tombol naik/turun
   * dipilih alih-alih seret-lepas: seret-lepas menuntut JavaScript yang jauh
   * lebih rumit dan tidak dapat dipakai tanpa tetikus.
   */
  async moveBackground(
    worldId: string,
    worldVersion: number,
    assetId: string,
    direction: 'up' | 'down',
  ): Promise<void> {
    await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ asset_id: string; position: number }>(
        `SELECT asset_id, position FROM world_assets
         WHERE world_id = $1 AND world_version = $2 AND kind = 'background'
         ORDER BY position ASC, asset_id ASC`,
        [worldId, worldVersion],
      );

      const index = rows.findIndex((row) => row.asset_id === assetId);
      const target = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || target < 0 || target >= rows.length) {
        return;
      }

      const reordered = [...rows];
      const moved = reordered[index]!;
      reordered[index] = reordered[target]!;
      reordered[target] = moved;

      // Penomoran ditulis ulang seluruhnya, bukan sekadar ditukar: menukar dua
      // nilai akan meninggalkan posisi kembar bila datanya pernah tidak rapi.
      for (const [position, row] of reordered.entries()) {
        await client.query(
          `UPDATE world_assets SET position = $4
           WHERE world_id = $1 AND world_version = $2 AND asset_id = $3`,
          [worldId, worldVersion, row.asset_id, position + 1],
        );
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Lokasi dunia (diisi dari master)                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Memastikan sebuah lokasi master terdaftar di dunia ini.
   *
   * Daftar lokasi dunia tidak lagi diketik admin satu per satu; ia TUMBUH dari
   * latar yang dipungut di langkah 2. Karena itu setiap pemungutan latar wajib
   * melewati sini, dan sifatnya idempoten: memungut dua latar dari lokasi yang
   * sama tidak boleh menghasilkan dua baris.
   *
   * `location_id` SENGAJA sama persis dengan id master. Satu tempat punya satu
   * identitas di seluruh sistem, sehingga "latar ini dari lokasi mana" dapat
   * dijawab tanpa tabel penghubung — dan mesin cerita tetap menyebut tempat
   * dengan id yang sama seperti yang dilihat panel.
   *
   * Labelnya masih boleh berbeda per dunia: dunia yang menamai ulang sebuah
   * tempat tidak mengubah master. Karena itu label hanya ditulis saat barisnya
   * BARU, bukan setiap kali latar dipungut — kalau tidak, menamai ulang akan
   * dibatalkan diam-diam oleh pemungutan latar berikutnya.
   */
  async ensureLocation(
    worldId: string,
    worldVersion: number,
    locationId: string,
    label: string,
  ): Promise<void> {
    await this.db.transaction(async (client) => {
      const { rows: existing } = await client.query<{ location_id: string }>(
        `SELECT location_id FROM world_locations
         WHERE world_id = $1 AND world_version = $2 AND location_id = $3 LIMIT 1`,
        [worldId, worldVersion, locationId],
      );
      if (existing.length > 0) {
        return;
      }

      const { rows: posRows } = await client.query<{ next_position: number }>(
        `SELECT coalesce(max(position), 0)::int + 1 AS next_position
         FROM world_locations WHERE world_id = $1 AND world_version = $2`,
        [worldId, worldVersion],
      );

      await client.query(
        `INSERT INTO world_locations (world_id, world_version, location_id, label, position)
         VALUES ($1,$2,$3,$4,$5)`,
        [worldId, worldVersion, locationId, clamp(label, MAX_NAME), posRows[0]?.next_position ?? 1],
      );
    });
  }

  /* ---------------------------------------------------------------- */
  /* NPC dan ekspresinya                                               */
  /* ---------------------------------------------------------------- */

  async listNpcs(worldId: string, worldVersion: number): Promise<NpcRow[]> {
    const { rows } = await this.db.query<{
      npc_id: string;
      name: string;
      role: string;
      public_backstory: string;
      initial_relation: string;
      position: number;
    }>(
      `SELECT npc_id, name, role, public_backstory, initial_relation, position
       FROM world_characters
       WHERE world_id = $1 AND world_version = $2
       ORDER BY position ASC, npc_id ASC`,
      [worldId, worldVersion],
    );

    const traits = await groupedStrings(clientOf(this.db), 'world_character_traits', 'trait', worldId, worldVersion);
    const portraits = await this.listPortraits(worldId, worldVersion);

    return rows.map((row) => ({
      npcId: row.npc_id,
      name: row.name,
      role: row.role,
      traits: traits.get(row.npc_id) ?? [],
      publicBackstory: row.public_backstory,
      initialRelation: row.initial_relation as RelationStatus,
      position: row.position,
      baseMediaId: portraits.base.get(row.npc_id)?.mediaId ?? null,
      baseUri: portraits.base.get(row.npc_id)?.uri ?? '',
      expressions: portraits.expressions.get(row.npc_id) ?? [],
    }));
  }

  /**
   * Menyimpan satu NPC beserta ekspresinya.
   *
   * `default_portrait_asset_id` diisi dari ekspresi PERTAMA, dan itu memang
   * satu-satunya sumber kebenaran "ekspresi mana yang bawaan" — tidak ada kolom
   * kedua yang menandainya. Dua penanda untuk satu hal akan cepat saling
   * bertentangan, dan yang lebih buruk: tidak ada cara tahu mana yang benar.
   */
  async saveNpc(
    worldId: string,
    worldVersion: number,
    input: NpcInput,
  ): Promise<{ npcId: string } | null> {
    const expressions = input.expressions.filter((item) => item.expression.trim().length > 0);

    return this.db.transaction(async (client) => {
      const { rows: existing } = await client.query<{ npc_id: string }>(
        'SELECT npc_id FROM world_characters WHERE world_id = $1 AND world_version = $2 AND npc_id = $3',
        [worldId, worldVersion, input.npcId ?? ''],
      );
      const npcId = existing[0]?.npc_id ?? input.npcId ?? `npc_${slug(randomUUID()).slice(0, 10)}`;

      // Ekspresi pertama menjadi potret bawaan. Bila NPC tidak punya ekspresi
      // sama sekali, kolom itu tidak boleh kosong (NOT NULL), jadi dipakai
      // penanda kosong — dan halaman memperingatkan bahwa NPC ini belum dapat
      // dipakai.
      const defaultAssetId =
        expressions.length > 0 ? portraitAssetId(npcId, expressions[0]!.expression) : '';

      const { rows: positionRows } = await client.query<{ next_position: number }>(
        `SELECT coalesce(max(position), 0)::int + 1 AS next_position
         FROM world_characters WHERE world_id = $1 AND world_version = $2`,
        [worldId, worldVersion],
      );

      await client.query(
        `INSERT INTO world_characters (
           world_id, world_version, npc_id, name, role, public_backstory,
           initial_relation, default_portrait_asset_id, position
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (world_id, world_version, npc_id) DO UPDATE SET
           name = $4, role = $5, public_backstory = $6,
           initial_relation = $7, default_portrait_asset_id = $8`,
        [
          worldId,
          worldVersion,
          npcId,
          clamp(input.name, MAX_NAME),
          clamp(input.role, MAX_NAME),
          clamp(input.publicBackstory, 2000),
          input.initialRelation,
          defaultAssetId,
          positionRows[0]?.next_position ?? 1,
        ],
      );

      // Sifat ditulis ulang seluruhnya: menyunting daftar berarti menggantinya,
      // dan mencocokkan satu per satu hanya menambah tempat yang bisa salah.
      await client.query(
        'DELETE FROM world_character_traits WHERE world_id = $1 AND world_version = $2 AND npc_id = $3',
        [worldId, worldVersion, npcId],
      );
      for (const [position, trait] of input.traits.entries()) {
        if (trait.trim().length === 0) {
          continue;
        }
        await client.query(
          `INSERT INTO world_character_traits (world_id, world_version, npc_id, position, trait)
           VALUES ($1,$2,$3,$4,$5)`,
          [worldId, worldVersion, npcId, position, clamp(trait, MAX_NAME)],
        );
      }

      // Daftar NAMA ekspresi tetap diisi: kontrak katalog pemain membacanya dari
      // tabel ini (`NPCPublicDTO.expressions`).
      await client.query(
        'DELETE FROM world_character_expressions WHERE world_id = $1 AND world_version = $2 AND npc_id = $3',
        [worldId, worldVersion, npcId],
      );
      for (const [position, item] of expressions.entries()) {
        await client.query(
          `INSERT INTO world_character_expressions (world_id, world_version, npc_id, position, expression)
           VALUES ($1,$2,$3,$4,$5)`,
          [worldId, worldVersion, npcId, position, clamp(item.expression, MAX_NAME)],
        );
      }

      // Potret: satu baris aset per ekspresi. Baris lama dibuang lebih dulu
      // supaya ekspresi yang dihapus benar-benar hilang, bukan tertinggal.
      await client.query(
        `DELETE FROM world_assets
         WHERE world_id = $1 AND world_version = $2 AND kind = 'portrait' AND npc_id = $3`,
        [worldId, worldVersion, npcId],
      );

      let portraitPosition = 0;
      for (const item of expressions) {
        if (!item.mediaId) {
          continue;
        }
        await client.query(
          `INSERT INTO world_assets (
             world_id, world_version, asset_id, kind, label, uri, media_id,
             npc_id, expression, usage_note, position
           ) VALUES ($1,$2,$3,'portrait',$4,$5,$6,$7,$8,$9,$10)`,
          [
            worldId,
            worldVersion,
            portraitAssetId(npcId, item.expression),
            `${input.name} — ${item.expression}`,
            mediaUri(item.mediaId),
            item.mediaId,
            npcId,
            clamp(item.expression, MAX_NAME),
            clamp(item.usageNote, MAX_USAGE),
            portraitPosition++,
          ],
        );
      }

      return { npcId };
    });
  }

  async deleteNpc(worldId: string, worldVersion: number, npcId: string): Promise<boolean> {
    return this.db.transaction(async (client) => {
      // Potret tidak ikut terhapus lewat kunci asing — ia menunjuk NPC lewat
      // kolom biasa, bukan lewat relasi. Jadi ia dibuang lebih dulu.
      await client.query(
        `DELETE FROM world_assets
         WHERE world_id = $1 AND world_version = $2 AND kind = 'portrait' AND npc_id = $3`,
        [worldId, worldVersion, npcId],
      );
      const { rowCount } = await client.query(
        'DELETE FROM world_characters WHERE world_id = $1 AND world_version = $2 AND npc_id = $3',
        [worldId, worldVersion, npcId],
      );
      return rowCount > 0;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Terbit                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Jumlah NPC yang belum punya satu pun potret ekspresi.
   *
   * Dipakai sebagai gerbang penerbitan. NPC tanpa potret akan tampil tanpa
   * wajah di cerita pemain, sementara AI tetap memperlakukannya sebagai
   * karakter yang hadir — hasilnya adegan yang jelas rusak, dan baru terlihat
   * setelah dunia terbit.
   *
   * Dihitung lewat dua kueri terpisah, bukan satu kueri dengan sub-kueri:
   * pg-mem tidak dapat menangani sub-kueri yang merujuk tabel induk, dan
   * selisih dua himpunan kecil sama benarnya.
   */
  async countNpcsWithoutPortrait(worldId: string, worldVersion: number): Promise<number> {
    const { rows: npcs } = await this.db.query<{ npc_id: string }>(
      `SELECT npc_id FROM world_characters WHERE world_id = $1 AND world_version = $2`,
      [worldId, worldVersion],
    );
    const { rows: portraits } = await this.db.query<{ npc_id: string | null }>(
      `SELECT DISTINCT npc_id FROM world_assets
       WHERE world_id = $1 AND world_version = $2 AND kind = 'portrait'`,
      [worldId, worldVersion],
    );

    const withPortrait = new Set(portraits.map((row) => row.npc_id).filter((id) => id !== null));
    return npcs.filter((row) => !withPortrait.has(row.npc_id)).length;
  }

  /**
   * Menerbitkan draf.
   *
   * Barisnya TIDAK disalin ke versi baru: yang berubah hanya status dan tanggal
   * terbit. Menyalin akan menghasilkan dua baris berisi hal yang sama, dan
   * perjalanan pemain akan menunjuk nomor versi yang berbeda dari yang terlihat
   * di riwayat — perbedaan yang tidak ada gunanya.
   */
  async publishDraft(worldId: string, worldVersion: number): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE world_versions
       SET status = 'published', published_at = now()
       WHERE world_id = $1 AND world_version = $2 AND status = 'draft'`,
      [worldId, worldVersion],
    );
    return rowCount > 0;
  }

  /* ---------------------------------------------------------------- */
  /* Bagian dalam                                                      */
  /* ---------------------------------------------------------------- */

  private async hydrate(row: {
    world_id: string;
    world_version: number;
    title: string;
    synopsis: string;
    premise: string;
    cover_asset_id: string;
    content_rating: string;
    created_at: Date | string;
  }): Promise<DraftWorld> {
    const [genres, locales, backgrounds, npcs, cover, updated] = await Promise.all([
      this.strings('world_genres', 'genre', row.world_id, row.world_version),
      this.strings('world_response_locales', 'locale', row.world_id, row.world_version),
      this.countAssets(row.world_id, row.world_version, 'background'),
      this.countNpcs(row.world_id, row.world_version),
      this.coverMedia(row.world_id, row.world_version),
      this.draftUpdatedAt(row.world_id, row.world_version),
    ]);

    return {
      worldId: row.world_id,
      worldVersion: row.world_version,
      title: row.title,
      synopsis: row.synopsis,
      premise: row.premise,
      coverAssetId: row.cover_asset_id,
      coverMediaId: cover,
      contentRating: row.content_rating as ContentRating,
      genres: genres as GenreId[],
      locales: locales as ResponseLocale[],
      backgroundCount: backgrounds,
      npcCount: npcs,
      createdAt: row.created_at,
      updatedAt: updated,
    };
  }

  /**
   * Kapan draf terakhir disentuh.
   *
   * Diambil dari waktu unggahan berkas terbaru yang dipakai versi ini, bukan
   * dari `world_versions.created_at`: baris versi draf TIDAK dibuat ulang setiap
   * kali disimpan — itulah inti berkas ini — sehingga `created_at` akan terus
   * menunjukkan kapan draf pertama dibuat, bukan kapan terakhir disunting.
   */
  private async draftUpdatedAt(worldId: string, worldVersion: number): Promise<Date | string> {
    const { rows } = await this.db.query<{ updated_at: Date | string }>(
      `SELECT max(created_at) AS updated_at
       FROM media_blobs
       WHERE media_id IN (
         SELECT media_id FROM world_assets
         WHERE world_id = $1 AND world_version = $2 AND media_id IS NOT NULL
       )`,
      [worldId, worldVersion],
    );

    if (rows[0]?.updated_at) {
      return rows[0].updated_at;
    }

    const { rows: versionRows } = await this.db.query<{ created_at: Date | string }>(
      'SELECT created_at FROM world_versions WHERE world_id = $1 AND world_version = $2',
      [worldId, worldVersion],
    );
    return versionRows[0]?.created_at ?? new Date();
  }

  private async coverMedia(worldId: string, worldVersion: number): Promise<string | null> {
    const { rows } = await this.db.query<{ media_id: string | null }>(
      `SELECT media_id FROM world_assets
       WHERE world_id = $1 AND world_version = $2 AND kind = 'cover' LIMIT 1`,
      [worldId, worldVersion],
    );
    return rows[0]?.media_id ?? null;
  }

  private async countAssets(
    worldId: string,
    worldVersion: number,
    kind: string,
  ): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM world_assets
       WHERE world_id = $1 AND world_version = $2 AND kind = $3`,
      [worldId, worldVersion, kind],
    );
    return rows[0]?.total ?? 0;
  }

  private async countNpcs(worldId: string, worldVersion: number): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM world_characters
       WHERE world_id = $1 AND world_version = $2`,
      [worldId, worldVersion],
    );
    return rows[0]?.total ?? 0;
  }

  private async strings(
    table: string,
    column: string,
    worldId: string,
    worldVersion: number,
  ): Promise<string[]> {
    const { rows } = await this.db.query<{ value: string }>(
      `SELECT ${column} AS value FROM ${table}
       WHERE world_id = $1 AND world_version = $2 ORDER BY ${column} ASC`,
      [worldId, worldVersion],
    );
    return rows.map((row) => row.value);
  }

  /** Potret dasar (media yang dipakai `default_portrait_asset_id`) dan per ekspresi. */
  private async listPortraits(
    worldId: string,
    worldVersion: number,
  ): Promise<{
    base: Map<string, { mediaId: string | null; uri: string }>;
    expressions: Map<string, NpcExpressionRow[]>;
  }> {
    const { rows } = await this.db.query<{
      asset_id: string;
      media_id: string | null;
      uri: string;
      npc_id: string;
      expression: string;
      usage_note: string;
      position: number;
    }>(
      `SELECT asset_id, media_id, uri, npc_id, expression, usage_note, position
       FROM world_assets
       WHERE world_id = $1 AND world_version = $2 AND kind = 'portrait'
       ORDER BY position ASC, asset_id ASC`,
      [worldId, worldVersion],
    );

    const { rows: defaults } = await this.db.query<{ npc_id: string; default_portrait_asset_id: string }>(
      'SELECT npc_id, default_portrait_asset_id FROM world_characters WHERE world_id = $1 AND world_version = $2',
      [worldId, worldVersion],
    );
    const defaultByNpc = new Map(defaults.map((row) => [row.npc_id, row.default_portrait_asset_id]));

    const base = new Map<string, { mediaId: string | null; uri: string }>();
    const expressions = new Map<string, NpcExpressionRow[]>();

    for (const row of rows) {
      const list = expressions.get(row.npc_id) ?? [];
      list.push({
        assetId: row.asset_id,
        expression: row.expression,
        usageNote: row.usage_note,
        mediaId: row.media_id,
        uri: row.uri,
        position: row.position,
      });
      expressions.set(row.npc_id, list);

      // Potret "dasar" adalah yang ditunjuk `default_portrait_asset_id`.
      if (defaultByNpc.get(row.npc_id) === row.asset_id) {
        base.set(row.npc_id, { mediaId: row.media_id, uri: row.uri });
      }
    }

    return { base, expressions };
  }
}

/* ------------------------------------------------------------------ */
/* Pembantu                                                            */
/* ------------------------------------------------------------------ */

/** Alamat berkas unggahan. Relatif: alamat dasar digabung saat respons dibuat. */
export function mediaUri(mediaId: string): string {
  return `/v1/media/${mediaId}`;
}

/** Id aset potret. Diturunkan dari NPC dan nama ekspresinya. */
export function portraitAssetId(npcId: string, expression: string): string {
  return `p_${npcId}_${slug(expression).slice(0, 24)}`;
}

/**
 * Nama ekspresi tetap untuk "gambar dasar karakter".
 *
 * Gambar dasar TIDAK dapat disimpan sebagai aset tanpa nama ekspresi. Tiga
 * lapisan menghalanginya, dan ketiganya benar:
 *   - `world_assets_portrait_shape` menuntut `expression IS NOT NULL`;
 *   - `catalogRepository` menyaring potret yang ekspresinya kosong dari manifest,
 *     sehingga klien tidak akan pernah menemukan berkasnya;
 *   - `showCharacter` selalu membawa nama ekspresi, dan `validation.ts` menolak
 *     ekspresi yang tidak terdaftar pada karakter itu.
 *
 * Jadi gambar dasar disimpan sebagai ekspresi bernama `dasar`, diletakkan paling
 * depan supaya menjadi `default_portrait_asset_id`. Dengan begitu ia tetap
 * terjangkau mesin cerita, bukan data mati.
 */
export const BASE_EXPRESSION = 'dasar';

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function clampBlur(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampFocal(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

function normaliseLikelihood(value: string | null): string | null {
  if (!value || !isLikelihood(value)) {
    return null;
  }
  return value;
}

/** Hubungan awal harus salah satu dari daftar; yang lain jatuh ke `normal`. */
export function isRelationStatus(value: string): value is RelationStatus {
  return (RELATION_STATUSES as readonly string[]).includes(value);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Menulis ulang daftar bernilai tunggal (genre, lokale).
 *
 * Dipakai bersama supaya bentuk "hapus lalu isi ulang" hanya ada di satu tempat.
 */
async function replaceList(
  client: DbClient,
  table: string,
  column: string,
  worldId: string,
  worldVersion: number,
  values: readonly string[],
): Promise<void> {
  await client.query(`DELETE FROM ${table} WHERE world_id = $1 AND world_version = $2`, [
    worldId,
    worldVersion,
  ]);
  for (const value of values) {
    await client.query(
      `INSERT INTO ${table} (world_id, world_version, ${column}) VALUES ($1,$2,$3)`,
      [worldId, worldVersion, value],
    );
  }
}

/** Membungkus `Database` agar dapat dipakai fungsi yang menerima `DbClient`. */
function clientOf(db: Database): DbClient {
  return { query: db.query };
}

/** Sifat per NPC, dikelompokkan. Dihitung lewat kueri terpisah seperti kebiasaan berkas ini. */
async function groupedStrings(
  client: DbClient,
  table: string,
  column: string,
  worldId: string,
  worldVersion: number,
): Promise<Map<string, string[]>> {
  const { rows } = await client.query<{ npc_id: string; value: string }>(
    `SELECT npc_id, ${column} AS value FROM ${table}
     WHERE world_id = $1 AND world_version = $2 ORDER BY position ASC`,
    [worldId, worldVersion],
  );

  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.npc_id) ?? [];
    list.push(row.value);
    grouped.set(row.npc_id, list);
  }
  return grouped;
}
