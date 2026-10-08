/**
 * Akses data katalog dan kanon dunia.
 *
 * Aturan: repository tidak mengetahui HTTP, dan route tidak menulis SQL.
 * Semua nilai masuk sebagai parameter, tidak pernah dirangkai ke dalam SQL.
 */

import type { Database } from '../db/pool';
import type {
  AssetManifest,
  AssetRef,
  ContentRating,
  GenreId,
  GenreOption,
  NPCPublicDTO,
  PortraitRef,
  RelationStatus,
  ResponseLocale,
  WorldCatalogItem,
  WorldDetailDTO,
  WorldStatus,
} from '../contracts/types';

type WorldVersionRow = {
  world_id: string;
  world_version: number;
  title: string;
  synopsis: string;
  premise: string;
  cover_asset_id: string;
  status: string;
  content_rating: string;
  published_at: Date | null;
  created_at: Date;
};

export type CatalogQuery = {
  search?: string;
  genres?: GenreId[];
  page: number;
  pageSize: number;
};

export type CatalogPage = {
  items: WorldCatalogItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

/**
 * Item katalog dengan peringkat mingguan.
 *
 * `startCount` adalah jumlah perjalanan NYATA dalam jendela waktu, bukan angka
 * hiasan. `rank` diturunkan dari urutan hasil, bukan disimpan di database —
 * peringkat adalah kesimpulan sesaat, dan menyimpannya akan membuatnya basi.
 */
export type RankedWorldItem = WorldCatalogItem & {
  rank: number;
  startCount: number;
};

/**
 * Dunia untuk rail "Baru Diperbarui", beserta waktu revisi terakhirnya.
 *
 * `updatedAt` di sini BUKAN `publishedAt`. Nilainya adalah `created_at` dari
 * versi terakhir dunia — saat versi itu dibuat, yaitu saat terakhir kali isinya
 * disunting. Inilah yang membuat rail ini berbeda dari "Terbaru Dirilis":
 * dunia yang terbit lama tetapi baru direvisi naik ke atas di sini, dan hanya
 * di sini.
 */
export type UpdatedWorldItem = WorldCatalogItem & {
  updatedAt: string;
};

/**
 * Memilih versi terbit terbaru untuk setiap dunia.
 *
 * Memakai derived table, bukan sub-kueri berkorelasi per baris. Bentuk ini
 * menghitung versi terbaru SEKALI untuk seluruh dunia, sehingga lebih murah
 * daripada mengulang sub-kueri pada setiap baris.
 */
const LATEST_PUBLISHED_JOIN = `
  JOIN (
    SELECT world_id, MAX(world_version) AS latest_version
    FROM world_versions
    WHERE status <> 'draft'
    GROUP BY world_id
  ) latest
    ON latest.world_id = wv.world_id
   AND latest.latest_version = wv.world_version
`;

export class CatalogRepository {
  /**
   * @param db Koneksi database.
   * @param resolveAssetUri Mengubah jalur aset tersimpan menjadi URL yang dapat
   *   dimuat klien. Database menyimpan jalur relatif saja supaya satu baris data
   *   dapat dipakai di lokal maupun produksi tanpa menyimpan nama host.
   */
  constructor(
    private readonly db: Database,
    private readonly resolveAssetUri: (path: string) => string = (path) => path,
  ) {}

  async listWorlds(query: CatalogQuery): Promise<CatalogPage> {
    const conditions: string[] = [`wv.status <> 'draft'`];
    const joins: string[] = [LATEST_PUBLISHED_JOIN];
    const values: unknown[] = [];

    if (query.search && query.search.trim().length > 0) {
      values.push(`%${query.search.trim().toLowerCase()}%`);
      conditions.push(`lower(wv.title) LIKE $${values.length}`);
    }

    // Semantik OR: cukup satu genre yang cocok (AC-02).
    //
    // Disaring lewat derived table yang berbeda, bukan sub-kueri berkorelasi.
    // `DISTINCT` menjamin satu baris per dunia, sehingga hasil tidak berlipat
    // ketika beberapa genre cocok sekaligus.
    const genres = query.genres ?? [];
    if (genres.length > 0) {
      const placeholders = genres.map((genre) => {
        values.push(genre);
        return `$${values.length}`;
      });
      joins.push(`
        JOIN (
          SELECT DISTINCT world_id FROM world_genres
          WHERE genre IN (${placeholders.join(', ')})
        ) matched_genre ON matched_genre.world_id = wv.world_id
      `);
    }

    const where = conditions.join(' AND ');
    const joinClause = joins.join('\n');

    const countResult = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM world_versions wv
       ${joinClause}
       WHERE ${where}`,
      values,
    );
    const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);

    const offset = (query.page - 1) * query.pageSize;
    const rowsResult = await this.db.query<WorldVersionRow>(
      `SELECT wv.world_id, wv.world_version, wv.title, wv.synopsis, wv.premise,
              wv.cover_asset_id, wv.status, wv.content_rating, wv.published_at, wv.created_at
       FROM world_versions wv
       ${joinClause}
       WHERE ${where}
       ORDER BY wv.title ASC
       LIMIT ${query.pageSize} OFFSET ${offset}`,
      values,
    );

    const items = await this.attachCatalogRelations(rowsResult.rows);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Genre yang layak ditawarkan ke pemain.
   *
   * DUA syarat, dan keduanya disengaja:
   *
   * 1. `genres.active` — admin dapat menonaktifkan genre yang tidak lagi
   *    diinginkan tanpa menghapusnya. Dunia lama yang memakainya tetap utuh,
   *    tetapi genre itu tidak lagi ditawarkan.
   * 2. Ada MINIMAL SATU versi terbit yang memakainya. Inilah yang diminta
   *    pemilik produk: chip genre muncul di aplikasi pemain hanya bila ada
   *    cerita di baliknya. Genre tanpa cerita tampil sebagai saringan yang
   *    selalu mengembalikan daftar kosong — dan itu terasa seperti kerusakan.
   *
   * Genre yang dipakai hanya oleh versi `draft` sengaja TIDAK ikut: pemain
   * tidak dapat melihat dunia itu, jadi menawarkan genrenya hanya akan
   * menyesatkan.
   *
   * Dihitung dengan JOIN + GROUP BY, bukan sub-kueri berkorelasi — pg-mem yang
   * menjalankan seluruh uji tidak mendukung sub-kueri yang merujuk tabel induk.
   */
  async listGenres(): Promise<GenreOption[]> {
    const { rows } = await this.db.query<{
      genre_id: string;
      label_id: string;
      label_en: string;
    }>(
      `SELECT g.genre_id, g.label_id, g.label_en
       FROM genres g
       JOIN world_genres wg ON wg.genre = g.genre_id
       JOIN world_versions wv
         ON wv.world_id = wg.world_id AND wv.world_version = wg.world_version
       WHERE g.active = true AND wv.status = 'published'
       GROUP BY g.genre_id, g.label_id, g.label_en, g.position
       ORDER BY g.position ASC, g.genre_id ASC`,
    );

    return rows.map((row) => ({
      genreId: row.genre_id,
      labelId: row.label_id,
      labelEn: row.label_en,
    }));
  }

  /**
   * Rail "Top 10 Minggu Ini": dunia TERBIT yang paling banyak dimulai.
   *
   * Dasar peringkatnya JUMLAH PERJALANAN yang dibuat dalam jendela waktu, bukan
   * angka yang disimpan di kolom. Karena itu angkanya selalu dapat ditelusuri ke
   * baris `journeys` yang nyata — tidak ada metrik yang dikarang.
   *
   * Mengapa bukan "jumlah pembaca": fayLN tidak mencatat pembacaan per dunia.
   * Yang dicatat adalah perjalanan, jadi itulah yang dipakai. Menyebutnya
   * "paling banyak dimainkan" lebih tepat daripada "paling banyak dibaca".
   *
   * Hanya dunia dengan `status = 'published'` yang masuk. Dunia yang diarsipkan
   * tidak boleh ditawarkan untuk dimulai (jalan buntu), dan data lama tidak boleh
   * membuatnya naik peringkat.
   */
  async listTopWorlds(limit: number, windowDays: number): Promise<RankedWorldItem[]> {
    const { rows } = await this.db.query<WorldVersionRow & { start_count: string }>(
      `SELECT wv.world_id, wv.world_version, wv.title, wv.synopsis, wv.premise,
              wv.cover_asset_id, wv.status, wv.content_rating, wv.published_at, wv.created_at,
              counted.start_count::text AS start_count
       FROM world_versions wv
       ${LATEST_PUBLISHED_JOIN}
       JOIN (
         SELECT world_id, COUNT(*) AS start_count
         FROM journeys
         WHERE created_at >= now() - ($1 || ' days')::interval
         GROUP BY world_id
       ) counted ON counted.world_id = wv.world_id
       WHERE wv.status = 'published'
       -- Tie-break oleh world_id supaya urutan tidak berubah antar pemanggilan
       -- ketika dua dunia punya jumlah yang sama.
       ORDER BY counted.start_count DESC, wv.world_id ASC
       LIMIT $2`,
      [String(windowDays), limit],
    );

    const items = await this.attachCatalogRelations(rows);
    return items.map((item, index) => ({
      ...item,
      rank: index + 1,
      startCount: Number.parseInt(rows[index]?.start_count ?? '0', 10),
    }));
  }

  /**
   * Rail "Terbaru Dirilis": dunia terbit yang paling baru diterbitkan.
   *
   * Memakai `published_at` — kolom yang memang mencatat saat dunia diterbitkan.
   * Sebelumnya kolom ini tidak pernah dipakai untuk pengurutan; rail "Baru
   * Diperbarui" mengurutkan dengan nilainya tetapi MENYEBUTNYA "diperbarui",
   * sehingga dunia yang belum pernah disunting pun tampil sebagai "baru diperbarui".
   * Rail ini memisahkan dua makna itu dengan benar.
   *
   * `published_at` boleh NULL pada baris lama; baris seperti itu diletakkan paling
   * belakang, bukan dibuang, supaya dunia yang sah tidak hilang dari daftar.
   */
  async listNewWorlds(limit: number): Promise<WorldCatalogItem[]> {
    const { rows } = await this.db.query<WorldVersionRow>(
      `SELECT wv.world_id, wv.world_version, wv.title, wv.synopsis, wv.premise,
              wv.cover_asset_id, wv.status, wv.content_rating, wv.published_at, wv.created_at
       FROM world_versions wv
       ${LATEST_PUBLISHED_JOIN}
       WHERE wv.status = 'published'
       -- NULLS LAST: baris tanpa tanggal terbit tidak boleh menyerobot puncak.
       ORDER BY wv.published_at DESC NULLS LAST, wv.world_id ASC
       LIMIT $1`,
      [limit],
    );

    return this.attachCatalogRelations(rows);
  }

  /**
   * Rail "Baru Diperbarui": dunia terbit yang isinya paling baru disunting.
   *
   * Diurutkan menurut `created_at` dari versi TERAKHIR tiap dunia, bukan
   * `published_at`. Keduanya sempat dianggap sama, dan akibatnya rail ini
   * menampilkan daftar yang identik dengan "Terbaru Dirilis" — nama berbeda,
   * isi kembar.
   *
   * Menyunting dunia terbit memang membuat baris versi baru (lihat panel admin),
   * jadi `created_at` versi terakhir memang mencatat waktu revisi terakhir.
   * Tidak perlu kolom baru.
   *
   * `LATEST_PUBLISHED_JOIN` sudah menyambung ke baris versi terakhir, sehingga
   * `wv.created_at` di sini adalah milik versi itu — bukan versi lama mana pun.
   */
  async listUpdatedWorlds(limit: number): Promise<UpdatedWorldItem[]> {
    const { rows } = await this.db.query<WorldVersionRow>(
      `SELECT wv.world_id, wv.world_version, wv.title, wv.synopsis, wv.premise,
              wv.cover_asset_id, wv.status, wv.content_rating, wv.published_at, wv.created_at
       FROM world_versions wv
       ${LATEST_PUBLISHED_JOIN}
       WHERE wv.status = 'published'
       ORDER BY wv.created_at DESC, wv.world_id ASC
       LIMIT $1`,
      [limit],
    );

    const items = await this.attachCatalogRelations(rows);

    return items.map((item, index) => ({
      ...item,
      updatedAt: rows[index]!.created_at.toISOString(),
    }));
  }

  /** Mengambil genre dan locale untuk sekumpulan dunia dalam satu query. */
  private async attachCatalogRelations(rows: WorldVersionRow[]): Promise<WorldCatalogItem[]> {
    if (rows.length === 0) {
      return [];
    }

    const genresByWorld = await this.groupedValues('world_genres', 'genre', rows);
    const localesByWorld = await this.groupedValues('world_response_locales', 'locale', rows);
    const coverUris = await this.coverUris(rows);

    return rows.map((row) => {
      const key = `${row.world_id}@${row.world_version}`;
      return {
        worldId: row.world_id,
        title: row.title,
        synopsis: row.synopsis,
        genres: (genresByWorld.get(key) ?? []) as GenreId[],
        coverAssetId: row.cover_asset_id,
        coverUri: coverUris.get(key) ?? '',
        worldVersion: row.world_version,
        status: row.status as WorldStatus,
        contentRating: row.content_rating as ContentRating,
        supportedResponseLocales: (localesByWorld.get(key) ?? []) as ResponseLocale[],
        publishedAt: (row.published_at ?? row.created_at).toISOString(),
      };
    });
  }

  /** Mengambil nilai dari tabel anak dan mengelompokkannya per dunia. */
  /**
   * URL sampul untuk sekumpulan versi dunia, dikunci `worldId@worldVersion`.
   *
   * Diambil dari `world_assets` — tempat URL itu memang sudah tersimpan sejak
   * unggahan. Daftar katalog sebelumnya hanya mengirim ID asetnya, sehingga
   * klien tidak punya cara mengubahnya menjadi gambar: SETIAP sampul di beranda
   * tampil sebagai placeholder, tanpa satu pun galat dan tanpa permintaan
   * jaringan yang gagal.
   *
   * Dikueri sekaligus untuk semua baris, bukan satu per baris: katalog memuat
   * puluhan dunia, dan satu kueri per dunia akan membuat beranda bergantung pada
   * jumlah dunia yang ditampilkan.
   */
  private async coverUris(rows: WorldVersionRow[]): Promise<Map<string, string>> {
    if (rows.length === 0) {
      return new Map();
    }

    const values: unknown[] = [];
    const pairs = rows.map((row) => {
      values.push(row.world_id, row.world_version, row.cover_asset_id);
      return `(world_id = $${String(values.length - 2)} AND world_version = $${String(
        values.length - 1,
      )} AND asset_id = $${String(values.length)})`;
    });

    const { rows: found } = await this.db.query<{
      world_id: string;
      world_version: number;
      uri: string;
    }>(
      `SELECT world_id, world_version, uri FROM world_assets
       WHERE kind = 'cover' AND (${pairs.join(' OR ')})`,
      values,
    );

    return new Map(
      found.map((row) => [`${row.world_id}@${String(row.world_version)}`, row.uri]),
    );
  }

  private async groupedValues(
    table: 'world_genres' | 'world_response_locales',
    column: 'genre' | 'locale',
    rows: WorldVersionRow[],
  ): Promise<Map<string, string[]>> {
    const values: unknown[] = [];
    const pairs = rows.map((row) => {
      values.push(row.world_id, row.world_version);
      return `(world_id = $${values.length - 1} AND world_version = $${values.length})`;
    });

    const result = await this.db.query<{
      world_id: string;
      world_version: number;
      value: string;
    }>(
      `SELECT world_id, world_version, ${column} AS value
       FROM ${table}
       WHERE ${pairs.join(' OR ')}
       ORDER BY world_id, world_version, ${column}`,
      values,
    );

    const grouped = new Map<string, string[]>();
    for (const row of result.rows) {
      const key = `${row.world_id}@${row.world_version}`;
      const list = grouped.get(key) ?? [];
      list.push(row.value);
      grouped.set(key, list);
    }
    return grouped;
  }

  /**
   * Versi terbit terbaru untuk satu dunia.
   *
   * Memakai ORDER BY + LIMIT, bukan sub-kueri berkorelasi: bentuknya lebih
   * sederhana, memakai indeks kunci primer (world_id, world_version), dan tidak
   * bergantung pada dukungan sub-kueri berkorelasi di mesin uji.
   */
  async findWorldVersion(worldId: string): Promise<WorldVersionRow | null> {
    const { rows } = await this.db.query<WorldVersionRow>(
      `SELECT wv.world_id, wv.world_version, wv.title, wv.synopsis, wv.premise,
              wv.cover_asset_id, wv.status, wv.content_rating, wv.published_at, wv.created_at
       FROM world_versions wv
       WHERE wv.world_id = $1 AND wv.status <> 'draft'
       ORDER BY wv.world_version DESC
       LIMIT 1`,
      [worldId],
    );
    return rows[0] ?? null;
  }

  async getWorldDetail(worldId: string, worldVersion: number): Promise<WorldDetailDTO | null> {
    const versionRow = await this.findWorldVersionAt(worldId, worldVersion);
    if (!versionRow) {
      return null;
    }

    const [genres, locales, locations, characters, assets] = await Promise.all([
      this.simpleList('world_genres', 'genre', worldId, worldVersion),
      this.simpleList('world_response_locales', 'locale', worldId, worldVersion),
      this.db.query<{ location_id: string; label: string }>(
        `SELECT location_id, label FROM world_locations
         WHERE world_id = $1 AND world_version = $2
         ORDER BY position ASC`,
        [worldId, worldVersion],
      ),
      this.loadCharacters(worldId, worldVersion),
      this.db.query<{
        asset_id: string;
        kind: string;
        label: string;
        uri: string;
        npc_id: string | null;
        expression: string | null;
      }>(
        `SELECT asset_id, kind, label, uri, npc_id, expression
         FROM world_assets
         WHERE world_id = $1 AND world_version = $2
         ORDER BY position ASC`,
        [worldId, worldVersion],
      ),
    ]);

    const coverRow = assets.rows.find((asset) => asset.kind === 'cover');
    const cover: AssetRef = coverRow
      ? { assetId: coverRow.asset_id, label: coverRow.label, uri: this.resolveAssetUri(coverRow.uri) }
      : {
          assetId: versionRow.cover_asset_id,
          label: versionRow.title,
          uri: this.resolveAssetUri(`/assets/cover/${versionRow.cover_asset_id}.png`),
        };

    const backgrounds: AssetRef[] = assets.rows
      .filter((asset) => asset.kind === 'background')
      .map((asset) => ({
        assetId: asset.asset_id,
        label: asset.label,
        uri: this.resolveAssetUri(asset.uri),
      }));

    const portraits: PortraitRef[] = assets.rows
      .filter((asset) => asset.kind === 'portrait' && asset.npc_id && asset.expression)
      .map((asset) => ({
        assetId: asset.asset_id,
        label: asset.label,
        uri: this.resolveAssetUri(asset.uri),
        npcId: asset.npc_id as string,
        expression: asset.expression as string,
      }));

    const manifest: AssetManifest = { cover, backgrounds, portraits };

    return {
      worldId: versionRow.world_id,
      worldVersion: versionRow.world_version,
      title: versionRow.title,
      synopsis: versionRow.synopsis,
      premise: versionRow.premise,
      genres: genres as GenreId[],
      coverAssetId: versionRow.cover_asset_id,
      // Sampul sudah dirakit di atas sebagai `cover`; dipakai ulang, bukan
      // dikueri lagi — dua sumber untuk hal yang sama akan bercabang.
      coverUri: cover?.uri ?? '',
      status: versionRow.status as WorldStatus,
      contentRating: versionRow.content_rating as ContentRating,
      supportedResponseLocales: locales as ResponseLocale[],
      publishedAt: (versionRow.published_at ?? versionRow.created_at).toISOString(),
      locations: locations.rows.map((row) => ({ locationId: row.location_id, label: row.label })),
      characters,
      assetManifest: manifest,
    };
  }

  async findWorldVersionAt(worldId: string, worldVersion: number): Promise<WorldVersionRow | null> {
    const { rows } = await this.db.query<WorldVersionRow>(
      `SELECT world_id, world_version, title, synopsis, premise, cover_asset_id,
              status, content_rating, published_at, created_at
       FROM world_versions
       WHERE world_id = $1 AND world_version = $2
       LIMIT 1`,
      [worldId, worldVersion],
    );
    return rows[0] ?? null;
  }

  private async simpleList(
    table: 'world_genres' | 'world_response_locales',
    column: 'genre' | 'locale',
    worldId: string,
    worldVersion: number,
  ): Promise<string[]> {
    const { rows } = await this.db.query<{ value: string }>(
      `SELECT ${column} AS value FROM ${table}
       WHERE world_id = $1 AND world_version = $2
       ORDER BY ${column} ASC`,
      [worldId, worldVersion],
    );
    return rows.map((row) => row.value);
  }

  private async loadCharacters(worldId: string, worldVersion: number): Promise<NPCPublicDTO[]> {
    const { rows } = await this.db.query<{
      npc_id: string;
      name: string;
      role: string;
      public_backstory: string;
      soul: string;
      initial_relation: string;
      default_portrait_asset_id: string;
    }>(
      `SELECT npc_id, name, role, public_backstory, soul, initial_relation, default_portrait_asset_id
       FROM world_characters
       WHERE world_id = $1 AND world_version = $2
       ORDER BY position ASC`,
      [worldId, worldVersion],
    );

    if (rows.length === 0) {
      return [];
    }

    /*
     * Hanya ekspresi yang dibaca. Tabel `world_character_traits` tidak lagi dipakai
     * sejak jiwa (soul) menggantikan sifat — dan membacanya akan mengirim daftar
     * kosong ke pemain, yang lebih buruk daripada tidak mengirim apa pun.
     */
    const expressions = await this.characterChildList(
      'world_character_expressions',
      'expression',
      worldId,
      worldVersion,
    );

    return rows.map((row) => ({
      npcId: row.npc_id,
      name: row.name,
      role: row.role,
      soul: row.soul,
      publicBackstory: row.public_backstory,
      initialRelation: row.initial_relation as RelationStatus,
      expressions: expressions.get(row.npc_id) ?? [],
      defaultPortraitAssetId: row.default_portrait_asset_id,
    }));
  }

  private async characterChildList(
    table: 'world_character_traits' | 'world_character_expressions',
    column: 'trait' | 'expression',
    worldId: string,
    worldVersion: number,
  ): Promise<Map<string, string[]>> {
    const { rows } = await this.db.query<{ npc_id: string; value: string }>(
      `SELECT npc_id, ${column} AS value FROM ${table}
       WHERE world_id = $1 AND world_version = $2
       ORDER BY npc_id, position ASC`,
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
}
