/**
 * Master lokasi: kategori (era/setting), tempat, dan latar belakangnya.
 *
 * Sebelum ini tempat dan latar belakang hanya hidup di dalam SATU versi dunia:
 * `world_locations` menyimpan label, `world_assets` menyimpan gambar. Tempat
 * yang sama pada dua cerita berarti mengunggah gambar yang sama dua kali.
 * Berkas ini memindahkan bagian yang TIDAK khas satu cerita ke satu tempat:
 *
 *   kategori (era)  →  lokasi (tempat)  →  latar (gambar per era)
 *
 * Yang khas satu cerita — keterangan yang dibaca mesin cerita, kekuatan blur,
 * titik fokus, peluang kemunculan — tetap tinggal di `world_assets`. Dunia
 * boleh menyesuaikan latar yang dipungutnya tanpa mengubah master.
 *
 * ---------------------------------------------------------------------------
 * TIGA KEPUTUSAN YANG PERLU DIKETAHUI SEBELUM MENYUNTING BERKAS INI
 * ---------------------------------------------------------------------------
 *
 * 1. SATU GAMBAR PER (LOKASI, KATEGORI) — dan yang kedua DITOLAK, bukan dibuang.
 *
 *    Kunci utama `location_backgrounds` adalah pasangan itu. Karena itu baris
 *    kembar akan muncul sebagai galat kunci utama yang tidak dapat dibaca admin,
 *    jadi ia ditolak lebih dulu di `prepare()` dengan nama kategorinya. Membuang
 *    baris kedua tanpa suara jauh lebih buruk: admin mengunggah dua gambar,
 *    menekan Simpan, dan satu gambar hilang tanpa penjelasan — persis alasan
 *    yang sama seperti `duplicate-expression` pada master karakter.
 *
 * 2. BARIS YANG BELUM DIUNGGAH DIBUANG; BARIS YANG KATEGORINYA BELUM DIPILIH
 *    DITOLAK.
 *
 *    Keduanya tampak serupa, tetapi artinya berbeda. Baris tanpa gambar adalah
 *    baris yang memang belum jadi dipakai — sama seperti ekspresi karakter yang
 *    dikosongkan. Baris yang SUDAH punya gambar tetapi kategorinya kosong atau
 *    tidak dikenal adalah pekerjaan yang akan hilang: admin sudah mengunggah,
 *    lalu memilih kategori yang ternyata sudah dihapus di tab lain. Yang kedua
 *    harus berisik.
 *
 * 3. `location_id` DAN `category_id` DIBUAT SISTEM dan tidak pernah berubah.
 *
 *    Berbeda dari genre, tidak ada nilai yang lebih baik daripada id buatan:
 *    nama tempat bebas ("Aula Kantor", "Hutan Utara") dan nama era bebas
 *    ("masa kini", "era dinasti"), jadi menurunkannya menjadi id akan menabrak
 *    dua nama berbeda yang sama. Yang dapat diubah adalah namanya.
 *
 * ---------------------------------------------------------------------------
 * MENGHAPUS: DIPERIKSA, KARENA DUNIA MENUNJUK KE SINI
 * ---------------------------------------------------------------------------
 * `world_assets.master_location_id` dan `master_category_id` berkunci asing ke
 * sini dengan `ON DELETE RESTRICT`. `remove()` dan `removeCategory()` tetap
 * memeriksa pemakaian LEBIH DULU supaya alasannya dapat disebutkan; kunci asing
 * hanya menjadi jaring pengaman bila ada yang menyisipkan di antara pemeriksaan
 * dan penghapusan — pola yang sama seperti `GenresRepository.remove()`.
 */

import { randomUUID } from 'node:crypto';

import type { Database, DbClient } from '../db/pool';
import { isMediaId } from '../repositories/mediaRepository';

export const MAX_LOCATION_NAME = 120;
export const MAX_CATEGORY_NAME = 60;
export const MAX_BACKGROUND_DESCRIPTION = 200;
export const MAX_BACKGROUND_USAGE = 500;

export const ENCOUNTER_LIKELIHOODS = ['none', 'low', 'medium', 'high'] as const;
export type EncounterLikelihood = (typeof ENCOUNTER_LIKELIHOODS)[number];

export type LocationCategoryRow = {
  categoryId: string;
  name: string;
  position: number;
  createdAt: Date | string;
  /** Berapa LOKASI yang punya latar pada kategori ini. */
  locationCount: number;
};

export type LocationBackgroundRow = {
  categoryId: string;
  /** Nama kategori, diambil dari master — bukan disalin ke setiap baris. */
  categoryName: string;
  mediaId: string;
  description: string;
  usageNote: string;
  encounterLikelihood: EncounterLikelihood | null;
  blurStrength: number;
  focalX: number;
  focalY: number;
  width: number | null;
  height: number | null;
};

export type LocationRow = {
  locationId: string;
  name: string;
  position: number;
  createdAt: Date | string;
  /** Terurut menurut urutan kategori, bukan urutan penyimpanan. */
  backgrounds: LocationBackgroundRow[];
};

export type LocationBackgroundInput = {
  categoryId: string;
  mediaId: string;
  description: string;
  usageNote: string;
};

export type LocationInput = {
  name: string;
  backgrounds: readonly LocationBackgroundInput[];
};

/** Sebab sebuah tindakan ditolak, agar halaman dapat menampilkan pesan tepat. */
export type CategoryFailure = 'invalid-name' | 'not-found' | 'in-use';

export type LocationFailure =
  | 'invalid-name'
  | 'no-backgrounds'
  | 'invalid-category'
  | 'duplicate-category'
  | 'not-found'
  | 'in-use';

export type CategoryResult =
  | { ok: true; categoryId: string }
  | { ok: false; reason: CategoryFailure; usedBy?: number };

export type LocationResult =
  | { ok: true; locationId: string }
  | { ok: false; reason: LocationFailure; detail?: string; usedBy?: number };

type Prepared = { name: string; backgrounds: readonly LocationBackgroundInput[] };

export class LocationsRepository {
  constructor(private readonly db: Database) {}

  /* ---------------------------------------------------------------- */
  /* Kategori (era/setting)                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Seluruh kategori beserta jumlah lokasi yang memakainya.
   *
   * Jumlahnya dihitung lewat satu kueri `GROUP BY` terpisah, bukan sub-kueri
   * berkorelasi: pg-mem tidak dapat sub-kueri yang merujuk tabel induk.
   */
  async listCategories(): Promise<LocationCategoryRow[]> {
    const { rows } = await this.db.query<{
      category_id: string;
      name: string;
      position: number;
      created_at: Date | string;
    }>(
      `SELECT category_id, name, position, created_at
       FROM location_categories
       ORDER BY position ASC, category_id ASC`,
    );

    const { rows: counts } = await this.db.query<{ category_id: string; total: number }>(
      `SELECT category_id, count(DISTINCT location_id)::int AS total
       FROM location_backgrounds
       GROUP BY category_id`,
    );
    const byCategory = new Map(counts.map((row) => [row.category_id, row.total]));

    return rows.map((row) => ({
      categoryId: row.category_id,
      name: row.name,
      position: row.position,
      createdAt: row.created_at,
      locationCount: byCategory.get(row.category_id) ?? 0,
    }));
  }

  async findCategory(categoryId: string): Promise<LocationCategoryRow | null> {
    const all = await this.listCategories();
    return all.find((row) => row.categoryId === categoryId) ?? null;
  }

  async createCategory(name: string): Promise<CategoryResult> {
    const cleaned = clamp(name, MAX_CATEGORY_NAME);
    if (cleaned.length === 0) {
      return { ok: false, reason: 'invalid-name' };
    }

    const categoryId = newCategoryId();
    const { rows } = await this.db.query<{ next_position: number }>(
      'SELECT coalesce(max(position), 0)::int + 1 AS next_position FROM location_categories',
    );
    await this.db.query(
      'INSERT INTO location_categories (category_id, name, position) VALUES ($1, $2, $3)',
      [categoryId, cleaned, rows[0]?.next_position ?? 1],
    );
    return { ok: true, categoryId };
  }

  /** Mengubah nama. `category_id` TIDAK diubah — ia dirujuk latar dan dunia. */
  async renameCategory(categoryId: string, name: string): Promise<CategoryResult> {
    const cleaned = clamp(name, MAX_CATEGORY_NAME);
    if (cleaned.length === 0) {
      return { ok: false, reason: 'invalid-name' };
    }

    const { rowCount } = await this.db.query(
      'UPDATE location_categories SET name = $2 WHERE category_id = $1',
      [categoryId, cleaned],
    );
    return rowCount > 0
      ? { ok: true, categoryId }
      : { ok: false, reason: 'not-found' };
  }

  /**
   * Menghapus kategori.
   *
   * Ditolak bila masih ada latar yang memakainya. Menghapus kategori akan
   * memutus gambar di SEMUA lokasi sekaligus — terlalu mudah terjadi, dan
   * `ON DELETE RESTRICT` sudah menolaknya di tingkat basis data. Pemeriksaan di
   * sini membuat alasannya dapat dibaca admin.
   */
  async removeCategory(categoryId: string): Promise<CategoryResult> {
    const used = await this.categoryUsage(categoryId);
    if (used > 0) {
      return { ok: false, reason: 'in-use', usedBy: used };
    }

    const { rowCount } = await this.db.query(
      'DELETE FROM location_categories WHERE category_id = $1',
      [categoryId],
    );
    return rowCount > 0
      ? { ok: true, categoryId }
      : { ok: false, reason: 'not-found' };
  }

  /** Berapa latar (di seluruh lokasi) yang memakai kategori ini. */
  async categoryUsage(categoryId: string): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM location_backgrounds WHERE category_id = $1',
      [categoryId],
    );
    return rows[0]?.total ?? 0;
  }

  /**
   * Menggeser satu kategori satu langkah.
   *
   * Urutan ditulis ulang seluruhnya dari daftar yang sudah diurutkan, bukan
   * dengan menukar dua angka: menukar dua angka menjadi salah begitu ada dua
   * baris berposisi sama.
   */
  async moveCategory(categoryId: string, direction: 'up' | 'down'): Promise<void> {
    await this.reorder(
      'location_categories',
      'category_id',
      'position',
      categoryId,
      direction,
    );
  }

  /* ---------------------------------------------------------------- */
  /* Lokasi                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Seluruh lokasi beserta latarnya.
   *
   * Tiga kueri, bukan satu kueri ber-`JOIN`: pengelompokan di sisi JavaScript
   * tidak terasa karena jumlahnya kecil, dan `ORDER BY` pada kolom turunan
   * setelah `JOIN` tidak dapat diandalkan di pg-mem. Urutan kategori diterapkan
   * di sini memakai daftar kategori yang sudah terurut.
   */
  async list(): Promise<LocationRow[]> {
    const categories = await this.listCategories();
    const categoryById = new Map(categories.map((row) => [row.categoryId, row]));
    const categoryRank = new Map(categories.map((row, index) => [row.categoryId, index]));

    const { rows } = await this.db.query<{
      location_id: string;
      name: string;
      position: number;
      created_at: Date | string;
    }>(
      `SELECT location_id, name, position, created_at
       FROM locations
       ORDER BY position ASC, location_id ASC`,
    );

    const { rows: backgroundRows } = await this.db.query<{
      location_id: string;
      category_id: string;
      media_id: string;
      description: string;
      usage_note: string;
      encounter_likelihood: string | null;
      blur_strength: number;
      focal_x: number;
      focal_y: number;
      width: number | null;
      height: number | null;
    }>(
      `SELECT location_id, category_id, media_id, description, usage_note,
              encounter_likelihood, blur_strength, focal_x, focal_y, width, height
       FROM location_backgrounds`,
    );

    const byLocation = new Map<string, LocationBackgroundRow[]>();
    for (const row of backgroundRows) {
      const list = byLocation.get(row.location_id) ?? [];
      list.push({
        categoryId: row.category_id,
        categoryName: categoryById.get(row.category_id)?.name ?? row.category_id,
        mediaId: row.media_id,
        description: row.description,
        usageNote: row.usage_note,
        encounterLikelihood: asLikelihood(row.encounter_likelihood),
        blurStrength: row.blur_strength,
        focalX: row.focal_x,
        focalY: row.focal_y,
        width: row.width,
        height: row.height,
      });
      byLocation.set(row.location_id, list);
    }

    return rows.map((row) => {
      const backgrounds = byLocation.get(row.location_id) ?? [];
      backgrounds.sort(
        (a, b) =>
          (categoryRank.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER) -
          (categoryRank.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER),
      );
      return {
        locationId: row.location_id,
        name: row.name,
        position: row.position,
        createdAt: row.created_at,
        backgrounds,
      };
    });
  }

  async find(locationId: string): Promise<LocationRow | null> {
    const all = await this.list();
    return all.find((row) => row.locationId === locationId) ?? null;
  }

  /**
   * Latar satu pasangan (lokasi, kategori) — dipakai pemilih di wizard.
   *
   * Sengaja membaca lewat `list()` alih-alih kueri sendiri: satu bentuk
   * pembacaan berarti satu tempat yang bisa salah, dan jumlah lokasi kecil.
   */
  async findBackground(
    locationId: string,
    categoryId: string,
  ): Promise<LocationBackgroundRow | null> {
    const location = await this.find(locationId);
    if (!location) {
      return null;
    }
    return location.backgrounds.find((item) => item.categoryId === categoryId) ?? null;
  }

  async create(input: LocationInput): Promise<LocationResult> {
    const prepared = await this.prepare(input);
    if ('reason' in prepared) {
      return prepared;
    }

    const locationId = newLocationId();
    await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ next_position: number }>(
        'SELECT coalesce(max(position), 0)::int + 1 AS next_position FROM locations',
      );
      await client.query(
        'INSERT INTO locations (location_id, name, position) VALUES ($1, $2, $3)',
        [locationId, prepared.name, rows[0]?.next_position ?? 1],
      );
      await this.replaceBackgrounds(client, locationId, prepared.backgrounds);
    });

    return { ok: true, locationId };
  }

  /**
   * Mengubah nama dan mengganti seluruh daftar latar.
   *
   * Daftar latar ditulis ulang, bukan dicocokkan satu per satu: menyunting
   * daftar berarti menggantinya, dan mencocokkan baris lama dengan baris baru
   * hanya menambah tempat yang bisa salah.
   */
  async update(locationId: string, input: LocationInput): Promise<LocationResult> {
    const prepared = await this.prepare(input);
    if ('reason' in prepared) {
      return prepared;
    }

    return this.db.transaction(async (client) => {
      const { rowCount } = await client.query(
        'UPDATE locations SET name = $2 WHERE location_id = $1',
        [locationId, prepared.name],
      );
      if (rowCount === 0) {
        return { ok: false, reason: 'not-found' } as const;
      }
      await this.replaceBackgrounds(client, locationId, prepared.backgrounds);
      return { ok: true, locationId } as const;
    });
  }

  /**
   * Menghapus lokasi beserta latarnya.
   *
   * Ditolak bila ada dunia yang memungut latarnya. Baris latar dibuang LEBIH
   * DULU, tidak mengandalkan `ON DELETE CASCADE`: kode yang benar hanya
   * bergantung pada apa yang ia kerjakan sendiri.
   */
  async remove(locationId: string): Promise<LocationResult> {
    const used = await this.locationUsage(locationId);
    if (used > 0) {
      return { ok: false, reason: 'in-use', usedBy: used };
    }

    return this.db.transaction(async (client) => {
      const { rows } = await client.query<{ location_id: string }>(
        'SELECT location_id FROM locations WHERE location_id = $1',
        [locationId],
      );
      if (rows.length === 0) {
        return { ok: false, reason: 'not-found' } as const;
      }

      await client.query('DELETE FROM location_backgrounds WHERE location_id = $1', [locationId]);
      await client.query('DELETE FROM locations WHERE location_id = $1', [locationId]);
      return { ok: true, locationId } as const;
    });
  }

  async move(locationId: string, direction: 'up' | 'down'): Promise<void> {
    await this.reorder('locations', 'location_id', 'position', locationId, direction);
  }

  /** Berapa BARIS aset dunia yang memungut lokasi ini (di seluruh dunia). */
  async locationUsage(locationId: string): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM world_assets WHERE master_location_id = $1',
      [locationId],
    );
    return rows[0]?.total ?? 0;
  }

  /* ---------------------------------------------------------------- */
  /* Isian                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Menyaring dan menormalkan isian sebelum menyentuh basis data.
   *
   * Mengembalikan `reason` alih-alih melempar, supaya halaman dapat menjelaskan
   * penolakannya — dan supaya tidak ada satu pun jalur simpan yang dapat
   * menyelundupkan latar tanpa gambar atau tanpa kategori.
   */
  private async prepare(
    input: LocationInput,
  ): Promise<Prepared | { ok: false; reason: LocationFailure; detail?: string }> {
    const name = clamp(input.name, MAX_LOCATION_NAME);
    if (name.length === 0) {
      return { ok: false, reason: 'invalid-name' };
    }

    // Baris tanpa gambar belum jadi dipakai — dibuang tanpa suara.
    const uploaded = input.backgrounds.filter((item) => item.mediaId.trim().length > 0);
    if (uploaded.length === 0) {
      return { ok: false, reason: 'no-backgrounds' };
    }

    const categories = await this.listCategories();
    const knownCategories = new Map(categories.map((row) => [row.categoryId, row.name]));

    // Baris yang gambarnya ADA tetapi kategorinya belum dipilih adalah
    // pekerjaan yang akan hilang — jadi berisik, bukan dibuang.
    const missing = uploaded.find((item) => !knownCategories.has(item.categoryId.trim()));
    if (missing) {
      return { ok: false, reason: 'invalid-category', detail: missing.categoryId.trim() };
    }

    const seen = new Set<string>();
    for (const item of uploaded) {
      const key = item.categoryId.trim();
      if (seen.has(key)) {
        return {
          ok: false,
          reason: 'duplicate-category',
          detail: knownCategories.get(key) ?? key,
        };
      }
      seen.add(key);
    }

    const known = await this.knownMediaIds(uploaded.map((item) => item.mediaId.trim()));
    const withImage = uploaded.filter((item) => known.has(item.mediaId.trim()));
    if (withImage.length === 0) {
      return { ok: false, reason: 'no-backgrounds' };
    }

    return {
      name,
      backgrounds: withImage.map((item) => ({
        categoryId: item.categoryId.trim(),
        mediaId: item.mediaId.trim(),
        description: clamp(item.description ?? '', MAX_BACKGROUND_DESCRIPTION),
        usageNote: clamp(item.usageNote ?? '', MAX_BACKGROUND_USAGE),
      })),
    };
  }

  /**
   * Id berkas unggahan yang benar-benar ada.
   *
   * Bentuk id diperiksa lebih dulu, dan itu bukan kehati-hatian berlebihan:
   * `media_blobs.media_id` selalu SHA-256 heksadesimal hasil unggahan, dan
   * penyaji berkas menolak bentuk lain. Baris yang lolos di sini tetapi
   * berbentuk lain akan tersimpan sebagai latar yang TIDAK PERNAH dapat
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

  /** Hapus lalu isi ulang. Satu-satunya tempat latar master ditulis. */
  private async replaceBackgrounds(
    client: DbClient,
    locationId: string,
    backgrounds: readonly LocationBackgroundInput[],
  ): Promise<void> {
    await client.query('DELETE FROM location_backgrounds WHERE location_id = $1', [locationId]);

    for (const item of backgrounds) {
      await client.query(
        `INSERT INTO location_backgrounds
           (location_id, category_id, media_id, description, usage_note)
         VALUES ($1, $2, $3, $4, $5)`,
        [locationId, item.categoryId, item.mediaId, item.description, item.usageNote],
      );
    }
  }

  /** Menulis ulang urutan seluruh baris. Dipakai kategori dan lokasi. */
  private async reorder(
    table: 'location_categories' | 'locations',
    idColumn: 'category_id' | 'location_id',
    orderColumn: 'position',
    id: string,
    direction: 'up' | 'down',
  ): Promise<void> {
    await this.db.transaction(async (client) => {
      const { rows } = await client.query<Record<string, string>>(
        `SELECT ${idColumn} FROM ${table} ORDER BY ${orderColumn} ASC, ${idColumn} ASC`,
      );
      const ids = rows.map((row) => row[idColumn]!);
      const index = ids.indexOf(id);
      if (index < 0) {
        return;
      }
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= ids.length) {
        return;
      }
      ids.splice(target, 0, ...ids.splice(index, 1));

      for (const [position, each] of ids.entries()) {
        await client.query(
          `UPDATE ${table} SET ${orderColumn} = $2 WHERE ${idColumn} = $1`,
          [each, position + 1],
        );
      }
    });
  }
}

/**
 * Id kategori dan lokasi yang dibuat sistem.
 *
 * Berawalan `cat_` dan `loc_` supaya bentuknya dapat dikenali sekilas di URL
 * dan di log — keduanya muncul berdampingan di halaman yang sama.
 */
function newCategoryId(): string {
  return `cat_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function newLocationId(): string {
  return `loc_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function asLikelihood(value: string | null): EncounterLikelihood | null {
  return value && (ENCOUNTER_LIKELIHOODS as readonly string[]).includes(value)
    ? (value as EncounterLikelihood)
    : null;
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
