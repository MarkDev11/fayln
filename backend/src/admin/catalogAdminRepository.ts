/**
 * CRUD katalog dari panel admin: dunia, versi, karakter, dan lokasi.
 *
 * ATURAN PALING PENTING DI BERKAS INI (FR-54 / D-23):
 * versi dunia TIDAK PERNAH diubah di tempat. Perjalanan pemain menyimpan
 * `world_version`, sehingga mengubah baris yang sedang dipakai akan mengubah
 * cerita orang yang sedang membacanya di tengah jalan.
 *
 * Karena itu setiap penyuntingan mengikuti pola:
 *   1. Baca versi terbaru.
 *   2. Salin seluruh isinya (genre, lokale, lokasi, karakter, sifat, ekspresi,
 *      aset) ke nomor versi berikutnya.
 *   3. Terapkan perubahan pada salinan itu saja.
 *   4. Bila dunia sebelumnya terbit, versi baru diterbitkan dan yang lama
 *      ditandai `retired` — halaman detail pemain memakai versi TERBIT terbaru.
 *
 * Baris `worlds` sendiri tidak menyimpan data yang dapat berubah; ia hanya
 * identitas stabil lintas versi.
 */

import { randomUUID } from 'node:crypto';

import type { Database } from '../db/pool';
import type { ContentRating, GenreId, RelationStatus, ResponseLocale } from '../contracts/types';

export type WorldAdminRow = {
  worldId: string;
  worldVersion: number;
  title: string;
  synopsis: string;
  premise: string;
  coverAssetId: string;
  status: 'draft' | 'published' | 'retired' | 'revoked';
  contentRating: ContentRating;
  publishedAt: Date | string | null;
  createdAt: Date | string;
  genres: GenreId[];
  locales: ResponseLocale[];
  characterCount: number;
  locationCount: number;
  /** Berapa perjalanan pemain yang mengunci versi ini. Menentukan boleh-tidaknya dihapus. */
  journeyCount: number;
};

export type CharacterAdminRow = {
  worldId: string;
  worldVersion: number;
  npcId: string;
  name: string;
  role: string;
  publicBackstory: string;
  initialRelation: RelationStatus;
  defaultPortraitAssetId: string;
  position: number;
  traits: string[];
  expressions: string[];
};

export type LocationAdminRow = {
  locationId: string;
  label: string;
  position: number;
};

export type WorldSaveInput = {
  worldId: string | null;
  title: string;
  synopsis: string;
  premise: string;
  coverAssetId: string;
  contentRating: ContentRating;
  status: 'draft' | 'published';
  genres: GenreId[];
  locales: ResponseLocale[];
};

export type CharacterSaveInput = {
  worldId: string;
  npcId: string | null;
  name: string;
  role: string;
  publicBackstory: string;
  initialRelation: RelationStatus;
  defaultPortraitAssetId: string;
  traits: string[];
  expressions: string[];
};

export class CatalogAdminRepository {
  constructor(private readonly db: Database) {}

  /* ---------------------------------------------------------------- */
  /* Dunia                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Daftar dunia dengan versi TERBARU masing-masing.
   *
   * Memakai derived table seperti CatalogRepository: versi terbaru dihitung
   * sekali untuk semua dunia, bukan diulang per baris.
   *
   * Hitungan karakter, lokasi, dan perjalanan diambil lewat kueri terpisah di
   * JavaScript, BUKAN sub-kueri berkorelasi di dalam SELECT. Alasannya bukan
   * selera: mesin database in-memory yang dipakai pengujian tidak menyelesaikan
   * alias tabel induk di dalam sub-kueri, sehingga bentuk itu tampak gagal di
   * pengujian padahal sah di PostgreSQL. Memisahkannya juga membuat kueri ini
   * lebih mudah dibaca.
   */
  async listWorlds(): Promise<WorldAdminRow[]> {
    const { rows } = await this.db.query<{
      world_id: string;
      world_version: number;
      title: string;
      synopsis: string;
      premise: string;
      cover_asset_id: string;
      status: string;
      content_rating: string;
      published_at: Date | string | null;
      created_at: Date | string;
    }>(
      /*
       * Kolom derived table diberi nama SENDIRI (`latest_world`, `latest_version`)
       * alih-alih memakai `world_id`/`latest`. Bila namanya sama dengan kolom
       * tabel induk, PostgreSQL menyelesaikannya sendiri tetapi mesin database
       * in-memory yang dipakai pengujian melaporkannya sebagai ambigu. Menamai
       * ulang menghilangkan ambiguitasnya untuk kedua mesin.
       */
      `SELECT wv.world_id, wv.world_version, wv.title, wv.synopsis, wv.premise,
              wv.cover_asset_id, wv.status, wv.content_rating, wv.published_at, wv.created_at
       FROM world_versions wv
       JOIN (
         SELECT world_id AS latest_world, MAX(world_version) AS latest_version
         FROM world_versions GROUP BY world_id
       ) latest ON latest.latest_world = wv.world_id
                AND latest.latest_version = wv.world_version
       ORDER BY wv.created_at DESC`,
    );

    if (rows.length === 0) {
      return [];
    }

    const genres = await this.groupedStrings('world_genres', 'genre', rows);
    const locales = await this.groupedStrings('world_response_locales', 'locale', rows);

    // Hitungan diambil sekaligus untuk seluruh dunia, lalu dipetakan di memori.
    const characters = await this.countByWorldVersion('world_characters');
    const locations = await this.countByWorldVersion('world_locations');
    const journeys = await this.countJourneysByWorld();

    return rows.map((row) => {
      const key = `${row.world_id}#${row.world_version}`;
      return {
        worldId: row.world_id,
        worldVersion: row.world_version,
        title: row.title,
        synopsis: row.synopsis,
        premise: row.premise,
        coverAssetId: row.cover_asset_id,
        status: row.status as WorldAdminRow['status'],
        contentRating: row.content_rating as ContentRating,
        publishedAt: row.published_at,
        createdAt: row.created_at,
        genres: (genres.get(key) ?? []) as GenreId[],
        locales: (locales.get(key) ?? []) as ResponseLocale[],
        characterCount: characters.get(key) ?? 0,
        locationCount: locations.get(key) ?? 0,
        journeyCount: journeys.get(row.world_id) ?? 0,
      };
    });
  }

  /** Versi terbaru satu dunia, lengkap dengan relasinya. */
  async findWorld(worldId: string): Promise<WorldAdminRow | null> {
    const all = await this.listWorlds();
    return all.find((row) => row.worldId === worldId) ?? null;
  }

  /**
   * Menyimpan dunia: membuat versi pertama, atau menyalin ke versi baru.
   *
   * Mengembalikan nomor versi yang baru ditulis beserta penanda apakah ini
   * versi baru — panel memakainya untuk memberi tahu admin bahwa cerita yang
   * sedang berjalan TIDAK ikut berubah.
   */
  async saveWorld(input: WorldSaveInput): Promise<{ worldId: string; worldVersion: number; isNewVersion: boolean }> {
    return this.db.transaction(async (client) => {
      const worldId = input.worldId ?? `w_${slug(randomUUID())}`;

      // Dunia baru: buat baris identitas lebih dulu.
      await client.query(
        `INSERT INTO worlds (world_id) VALUES ($1) ON CONFLICT (world_id) DO NOTHING`,
        [worldId],
      );

      /*
       * Versi terbaru dan statusnya dibaca dengan DUA kueri biasa, bukan satu
       * kueri dengan sub-kueri skalar di dalam SELECT.
       *
       * Alasannya bukan gaya: mesin database in-memory yang dipakai pengujian
       * mengembalikan sub-kueri skalar sebagai LARIK (`["published"]`), bukan
       * sebagai teks. Perbandingan `status === 'published'` lalu selalu salah,
       * dan versi lama tidak pernah diarsipkan — kegagalan yang diam-diam dan
       * hanya terlihat pada pemeriksaan status. Dua kueri sederhana terbaca
       * sama jelasnya dan berperilaku sama di kedua mesin.
       */
      const { rows: versionRows } = await client.query<{ max_version: number | null }>(
        'SELECT MAX(world_version)::int AS max_version FROM world_versions WHERE world_id = $1',
        [worldId],
      );

      const previousMax = versionRows[0]?.max_version ?? null;
      let previousStatus: string | null = null;
      if (previousMax !== null) {
        const { rows: statusRows } = await client.query<{ status: string }>(
          'SELECT status FROM world_versions WHERE world_id = $1 AND world_version = $2 LIMIT 1',
          [worldId, previousMax],
        );
        previousStatus = statusRows[0]?.status ?? null;
      }

      // Belum ada versi sama sekali: versi 1 adalah pembuatan, bukan penyuntingan.
      const isFirstVersion = previousMax === null;
      const worldVersion = isFirstVersion ? 1 : previousMax + 1;
      const isNewVersion = !isFirstVersion;

      // Versi baru selalu lahir sebagai draft, lalu dinaikkan bila diminta.
      // Alasannya: menulis versi terbit secara langsung akan membuat perubahan
      // setengah jadi terlihat pemain.
      const finalStatus = input.status === 'published' ? 'published' : 'draft';

      /*
       * URUTAN PENTING: baris `world_versions` ditulis SEBELUM salinan isinya.
       * Seluruh tabel anak (genre, lokale, lokasi, karakter, aset) berkunci
       * asing ke (world_id, world_version), sehingga menyalin isinya lebih dulu
       * akan ditolak kunci asing — versi tujuannya belum ada.
       */
      await client.query(
        `INSERT INTO world_versions (
           world_id, world_version, title, synopsis, premise, cover_asset_id,
           status, content_rating, published_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (world_id, world_version) DO UPDATE SET
           title = $3, synopsis = $4, premise = $5, cover_asset_id = $6,
           status = $7, content_rating = $8, published_at = $9`,
        [
          worldId,
          worldVersion,
          input.title,
          input.synopsis,
          input.premise,
          input.coverAssetId,
          finalStatus,
          input.contentRating,
          finalStatus === 'published' ? new Date() : null,
        ],
      );

      if (!isFirstVersion) {
        // Salin seluruh isi versi sebelumnya ke versi baru SEBELUM diubah, lalu
        // hapus genre dan lokale hasil salinan karena keduanya akan ditulis
        // ulang di bawah mengikuti pilihan admin.
        await this.copyVersionInto(client, worldId, previousMax, worldVersion);
      }

      // Genre dan lokale adalah himpunan: lebih mudah dihapus lalu ditulis ulang
      // daripada membandingkan satu per satu.
      await client.query('DELETE FROM world_genres WHERE world_id = $1 AND world_version = $2', [
        worldId,
        worldVersion,
      ]);
      for (const genre of input.genres) {
        await client.query(
          'INSERT INTO world_genres (world_id, world_version, genre) VALUES ($1,$2,$3)',
          [worldId, worldVersion, genre],
        );
      }

      await client.query(
        'DELETE FROM world_response_locales WHERE world_id = $1 AND world_version = $2',
        [worldId, worldVersion],
      );
      for (const locale of input.locales) {
        await client.query(
          'INSERT INTO world_response_locales (world_id, world_version, locale) VALUES ($1,$2,$3)',
          [worldId, worldVersion, locale],
        );
      }

      // Bila versi baru diterbitkan, versi terbit sebelumnya diarsipkan. Barisnya
      // TIDAK dihapus: perjalanan lama masih menunjuk ke sana.
      if (finalStatus === 'published' && previousStatus === 'published' && previousMax !== null) {
        await client.query(
          `UPDATE world_versions SET status = 'retired'
           WHERE world_id = $1 AND world_version <> $2 AND status = 'published'`,
          [worldId, worldVersion],
        );
      }

      return { worldId, worldVersion, isNewVersion };
    });
  }

  /**
   * Menghapus seluruh dunia beserta versinya.
   *
   * Ditolak bila ada perjalanan pemain yang menunjuk dunia ini — penghapusan
   * akan memutus riwayat orang lain. Pesannya menjelaskan alasannya, bukan
   * sekadar "gagal".
   */
  async deleteWorld(worldId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const { rows } = await this.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM journeys WHERE world_id = $1',
      [worldId],
    );
    const journeys = rows[0]?.total ?? 0;
    if (journeys > 0) {
      return {
        ok: false,
        reason: `Dunia ini dipakai ${journeys} perjalanan pemain. Arsipkan (status retired) alih-alih menghapus.`,
      };
    }

    await this.db.query('DELETE FROM worlds WHERE world_id = $1', [worldId]);
    return { ok: true };
  }

  /* ---------------------------------------------------------------- */
  /* Karakter                                                          */
  /* ---------------------------------------------------------------- */

  async listCharacters(worldId: string): Promise<CharacterAdminRow[]> {
    const world = await this.findWorld(worldId);
    if (!world) {
      return [];
    }

    const { rows } = await this.db.query<{
      npc_id: string;
      name: string;
      role: string;
      public_backstory: string;
      initial_relation: string;
      default_portrait_asset_id: string;
      position: number;
    }>(
      `SELECT npc_id, name, role, public_backstory, initial_relation,
              default_portrait_asset_id, position
       FROM world_characters
       WHERE world_id = $1 AND world_version = $2
       ORDER BY position ASC, npc_id ASC`,
      [worldId, world.worldVersion],
    );

    const traits = await this.characterStrings(worldId, world.worldVersion, 'world_character_traits', 'trait');
    const expressions = await this.characterStrings(
      worldId,
      world.worldVersion,
      'world_character_expressions',
      'expression',
    );

    return rows.map((row) => ({
      worldId,
      worldVersion: world.worldVersion,
      npcId: row.npc_id,
      name: row.name,
      role: row.role,
      publicBackstory: row.public_backstory,
      initialRelation: row.initial_relation as RelationStatus,
      defaultPortraitAssetId: row.default_portrait_asset_id,
      position: row.position,
      traits: traits.get(row.npc_id) ?? [],
      expressions: expressions.get(row.npc_id) ?? [],
    }));
  }

  async findCharacter(worldId: string, npcId: string): Promise<CharacterAdminRow | null> {
    const all = await this.listCharacters(worldId);
    return all.find((row) => row.npcId === npcId) ?? null;
  }

  /**
   * Menyimpan karakter.
   *
   * Penyuntingan karakter pada dunia yang sudah terbit tetap membuat versi baru
   * dunia: satu baris `world_characters` berkias-asing ke (world_id,
   * world_version), jadi mustahil mengubah karakter tanpa versi baru.
   * Inilah alasan operasi ini menyalin versi lebih dulu.
   */
  async saveCharacter(input: CharacterSaveInput): Promise<{ npcId: string; worldVersion: number }> {
    return this.db.transaction(async (client) => {
      const { rows: latest } = await client.query<{
        world_version: number;
        status: string;
        title: string;
        synopsis: string;
        premise: string;
        cover_asset_id: string;
        content_rating: string;
      }>(
        `SELECT world_version, status, title, synopsis, premise, cover_asset_id, content_rating
         FROM world_versions WHERE world_id = $1 ORDER BY world_version DESC LIMIT 1`,
        [input.worldId],
      );

      const current = latest[0];
      if (!current) {
        throw new Error('Dunia belum punya versi. Buat dunianya lebih dulu.');
      }

      // Karakter SELALU ditulis ke versi baru, berapa pun status dunia itu.
      // Menyimpannya ke versi berjalan akan mengubah kanon yang dikunci perjalanan.
      const worldVersion = current.world_version + 1;

      // Salinan versi mewarisi status asal, kecuali draft yang tetap draft.
      const inheritedStatus = current.status === 'draft' ? 'draft' : current.status;

      // Baris versi ditulis SEBELUM salinan isinya — lihat catatan urutan pada
      // saveWorld: seluruh tabel anak berkunci asing ke (world_id, world_version).
      await client.query(
        `INSERT INTO world_versions (
           world_id, world_version, title, synopsis, premise, cover_asset_id,
           status, content_rating, published_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          input.worldId,
          worldVersion,
          current.title,
          current.synopsis,
          current.premise,
          current.cover_asset_id,
          inheritedStatus,
          current.content_rating,
          inheritedStatus === 'published' ? new Date() : null,
        ],
      );

      // Seluruh karakter dari versi sebelumnya ikut tersalin, sehingga
      // menyunting satu karakter tidak menghapus karakter lain.
      await this.copyVersionInto(client, input.worldId, current.world_version, worldVersion);

      const npcId = input.npcId ?? `npc_${slug(randomUUID())}`;

      const { rows: posRows } = await client.query<{ next_position: number }>(
        `SELECT coalesce(max(position), 0)::int + 1 AS next_position
         FROM world_characters WHERE world_id = $1 AND world_version = $2`,
        [input.worldId, worldVersion],
      );
      const position = posRows[0]?.next_position ?? 1;

      await client.query(
        `INSERT INTO world_characters (
           world_id, world_version, npc_id, name, role, public_backstory,
           initial_relation, default_portrait_asset_id, position
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (world_id, world_version, npc_id) DO UPDATE SET
           name = $4, role = $5, public_backstory = $6,
           initial_relation = $7, default_portrait_asset_id = $8`,
        [
          input.worldId,
          worldVersion,
          npcId,
          input.name,
          input.role,
          input.publicBackstory,
          input.initialRelation,
          input.defaultPortraitAssetId,
          position,
        ],
      );

      await client.query(
        'DELETE FROM world_character_traits WHERE world_id = $1 AND world_version = $2 AND npc_id = $3',
        [input.worldId, worldVersion, npcId],
      );
      let traitPosition = 0;
      for (const trait of input.traits) {
        await client.query(
          `INSERT INTO world_character_traits (world_id, world_version, npc_id, position, trait)
           VALUES ($1,$2,$3,$4,$5)`,
          [input.worldId, worldVersion, npcId, traitPosition, trait],
        );
        traitPosition += 1;
      }

      await client.query(
        'DELETE FROM world_character_expressions WHERE world_id = $1 AND world_version = $2 AND npc_id = $3',
        [input.worldId, worldVersion, npcId],
      );
      let expressionPosition = 0;
      for (const expression of input.expressions) {
        await client.query(
          `INSERT INTO world_character_expressions (world_id, world_version, npc_id, position, expression)
           VALUES ($1,$2,$3,$4,$5)`,
          [input.worldId, worldVersion, npcId, expressionPosition, expression],
        );
        expressionPosition += 1;
      }

      if (inheritedStatus === 'published' && current.status === 'published') {
        await client.query(
          `UPDATE world_versions SET status = 'retired'
           WHERE world_id = $1 AND world_version <> $2 AND status = 'published'`,
          [input.worldId, worldVersion],
        );
      }

      return { npcId, worldVersion };
    });
  }

  /* ---------------------------------------------------------------- */
  /* Lokasi                                                            */
  /* ---------------------------------------------------------------- */

  async listLocations(worldId: string, worldVersion: number): Promise<LocationAdminRow[]> {
    const { rows } = await this.db.query<{ location_id: string; label: string; position: number }>(
      `SELECT location_id, label, position FROM world_locations
       WHERE world_id = $1 AND world_version = $2 ORDER BY position ASC`,
      [worldId, worldVersion],
    );
    return rows.map((row) => ({
      locationId: row.location_id,
      label: row.label,
      position: row.position,
    }));
  }

  /* ---------------------------------------------------------------- */
  /* Aset yang tersedia untuk dipilih                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Aset yang dapat dipilih sebagai sampul atau potret bawaan.
   *
   * Sengaja membaca SELURUH aset lintas dunia: berkas gambar disajikan dari
   * satu folder bersama, dan admin sering memakai ulang sampul yang sudah ada
   * alih-alih mengunggah yang baru.
   */
  async listAssets(): Promise<{
    covers: { assetId: string; label: string; uri: string }[];
    portraits: { assetId: string; label: string; uri: string; npcId: string }[];
  }> {
    const { rows } = await this.db.query<{
      asset_id: string;
      kind: string;
      label: string;
      uri: string;
      npc_id: string | null;
    }>(
      `SELECT DISTINCT ON (asset_id) asset_id, kind, label, uri, npc_id
       FROM world_assets ORDER BY asset_id, world_version DESC`,
    );

    return {
      covers: rows
        .filter((row) => row.kind === 'cover')
        .map((row) => ({ assetId: row.asset_id, label: row.label, uri: row.uri })),
      portraits: rows
        .filter((row) => row.kind === 'portrait')
        .map((row) => ({
          assetId: row.asset_id,
          label: row.label,
          uri: row.uri,
          npcId: row.npc_id ?? '',
        })),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Salinan versi                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Menyalin SELURUH isi satu versi ke nomor versi lain.
   *
   * Dipanggil sebelum setiap penyuntingan. Bila ada tabel anak baru di masa
   * depan, salinan ini yang harus diperbarui — dan justru itulah gunanya
   * dikumpulkan di satu tempat: satu titik yang perlu diingat, bukan lima.
   */
  private async copyVersionInto(
    client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
    worldId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<void> {
    const children: { table: string; columns: string[] }[] = [
      { table: 'world_genres', columns: ['genre'] },
      { table: 'world_response_locales', columns: ['locale'] },
      { table: 'world_locations', columns: ['location_id', 'label', 'position'] },
      {
        table: 'world_characters',
        columns: [
          'npc_id',
          'name',
          'role',
          'public_backstory',
          'initial_relation',
          'default_portrait_asset_id',
          'position',
        ],
      },
      { table: 'world_character_traits', columns: ['npc_id', 'position', 'trait'] },
      { table: 'world_character_expressions', columns: ['npc_id', 'position', 'expression'] },
      { table: 'world_assets', columns: ['asset_id', 'kind', 'label', 'uri', 'npc_id', 'expression', 'position'] },
    ];

    for (const child of children) {
      const columnList = child.columns.join(', ');
      /*
       * `$3::int` bukan hiasan. Tanpa cast, driver menyimpulkan tipe parameter
       * dari konteksnya; pada `SELECT world_id, $3, ...` tidak ada konteks yang
       * cukup, sehingga nilainya dikirim sebagai teks dan PostgreSQL menolak
       * menulisnya ke kolom integer. Cast eksplisit membuat tipenya pasti.
       */
      await client.query(
        `INSERT INTO ${child.table} (world_id, world_version, ${columnList})
         SELECT world_id, $3::int, ${columnList} FROM ${child.table}
         WHERE world_id = $1 AND world_version = $2`,
        [worldId, fromVersion, toVersion],
      );
    }
  }

  /** Mengambil kolom teks tunggal yang dikelompokkan per (world_id, version). */
  private async groupedStrings(
    table: string,
    column: string,
    rows: { world_id: string; world_version: number }[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (rows.length === 0) {
      return result;
    }

    const { rows: data } = await this.db.query<{
      world_id: string;
      world_version: number;
      value: string;
    }>(
      `SELECT world_id, world_version, ${column} AS value FROM ${table}
       WHERE world_version > 0 ORDER BY world_id, world_version`,
    );

    for (const row of data) {
      const key = `${row.world_id}#${row.world_version}`;
      const list = result.get(key) ?? [];
      list.push(row.value);
      result.set(key, list);
    }
    return result;
  }

  /** Menghitung baris tabel anak per (world_id, world_version). */
  private async countByWorldVersion(table: string): Promise<Map<string, number>> {
    const { rows } = await this.db.query<{
      world_id: string;
      world_version: number;
      total: number;
    }>(
      `SELECT world_id, world_version, count(*)::int AS total
       FROM ${table} GROUP BY world_id, world_version`,
    );

    const result = new Map<string, number>();
    for (const row of rows) {
      result.set(`${row.world_id}#${row.world_version}`, row.total);
    }
    return result;
  }

  /** Menghitung perjalanan per dunia — tidak per versi, karena itu yang ditampilkan. */
  private async countJourneysByWorld(): Promise<Map<string, number>> {
    const { rows } = await this.db.query<{ world_id: string; total: number }>(
      'SELECT world_id, count(*)::int AS total FROM journeys GROUP BY world_id',
    );

    const result = new Map<string, number>();
    for (const row of rows) {
      result.set(row.world_id, row.total);
    }
    return result;
  }

  /** Sama, tetapi berkunci tiga tingkat: (world_id, version, npc_id). */
  private async characterStrings(
    worldId: string,
    worldVersion: number,
    table: string,
    column: string,
  ): Promise<Map<string, string[]>> {
    const { rows } = await this.db.query<{ npc_id: string; value: string }>(
      `SELECT npc_id, ${column} AS value FROM ${table}
       WHERE world_id = $1 AND world_version = $2 ORDER BY position ASC`,
      [worldId, worldVersion],
    );

    const result = new Map<string, string[]>();
    for (const row of rows) {
      const list = result.get(row.npc_id) ?? [];
      list.push(row.value);
      result.set(row.npc_id, list);
    }
    return result;
  }
}

/** Membentuk potongan yang aman dipakai sebagai bagian ID. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);
}
