/**
 * Master lokasi: kategori (era/setting), tempat, dan satu gambar latarnya.
 *
 * Sebelum ini tempat dan latar belakang hanya hidup di dalam SATU versi dunia:
 * `world_locations` menyimpan label, `world_assets` menyimpan gambar. Tempat
 * yang sama pada dua cerita berarti mengunggah gambar yang sama dua kali.
 * Berkas ini memindahkan bagian yang TIDAK khas satu cerita ke satu tempat.
 *
 * Bentuknya sengaja datar — satu lokasi adalah satu nama, satu kategori, satu
 * keterangan, dan satu gambar:
 *
 *     kategori (era)  →  lokasi (tempat + gambar)
 *
 * Versi sebelumnya memakai tabel latar tersendiri sehingga satu tempat dapat
 * memuat banyak gambar (satu per era). Itu dibuang: yang diisi sehari-hari
 * adalah satu tempat pada satu era, dan baris berulang hanya menambah satu
 * pertanyaan yang harus dijawab admin setiap kali tanpa ada yang memakainya.
 * Tempat yang sama pada era lain sekarang adalah LOKASI LAIN — dan itu memang
 * cara berpikirnya: "Aula Kantor pada era dinasti" bukan "Aula Kantor".
 *
 * Yang khas satu cerita — keterangan yang dibaca mesin cerita, kekuatan blur,
 * titik fokus, peluang kemunculan — tetap tinggal di `world_assets`. Dunia boleh
 * menyesuaikan latar yang dipungutnya tanpa mengubah master.
 *
 * ---------------------------------------------------------------------------
 * TIGA KEPUTUSAN YANG PERLU DIKETAHUI SEBELUM MENYUNTING BERKAS INI
 * ---------------------------------------------------------------------------
 *
 * 1. GAMBAR DAN KATEGORI WAJIB — dan penolakannya BERBEDA untuk keduanya.
 *
 *    Lokasi tanpa gambar tidak dapat dirender, dan lokasi tanpa kategori tidak
 *    dapat ditawarkan di pemilih wizard. Keduanya ditolak, tetapi dengan sebab
 *    yang berbeda supaya halaman dapat menunjuk baris yang salah. Basis data
 *    menegakkannya lagi lewat `NOT NULL` dan kunci asing — jaring pengaman,
 *    bukan satu-satunya penjaga.
 *
 * 2. `location_id` DAN `category_id` DIBUAT SISTEM dan tidak pernah berubah.
 *
 *    Berbeda dari genre, tidak ada nilai yang lebih baik daripada id buatan:
 *    nama tempat bebas ("Aula Kantor", "Hutan Utara") dan nama era bebas
 *    ("masa kini", "era dinasti"), jadi menurunkannya menjadi id akan menabrak
 *    dua nama berbeda yang sama. Yang dapat diubah adalah namanya.
 *
 * 3. MENGHAPUS DIPERIKSA, KARENA DUNIA MENUNJUK KE SINI.
 *
 *    `world_assets.master_location_id` dan `master_category_id` berkunci asing
 *    ke sini dengan `ON DELETE RESTRICT`. `remove()` dan `removeCategory()`
 *    tetap memeriksa pemakaian LEBIH DULU supaya alasannya dapat disebutkan;
 *    kunci asing hanya menjadi jaring pengaman bila ada yang menyisipkan di
 *    antara pemeriksaan dan penghapusan.
 */

import { randomUUID } from 'node:crypto';

import type { Database } from '../db/pool';
import { isMediaId } from '../repositories/mediaRepository';

export const MAX_LOCATION_NAME = 120;
export const MAX_CATEGORY_NAME = 60;
export const MAX_LOCATION_DESCRIPTION = 200;

export type LocationCategoryRow = {
  categoryId: string;
  name: string;
  position: number;
  createdAt: Date | string;
  /** Berapa lokasi yang memakai kategori ini. */
  locationCount: number;
};

export type LocationRow = {
  locationId: string;
  name: string;
  categoryId: string;
  /** Nama kategori, diambil dari master — bukan disalin ke setiap baris. */
  categoryName: string;
  description: string;
  mediaId: string;
  position: number;
  createdAt: Date | string;
};

export type LocationInput = {
  name: string;
  categoryId: string;
  description: string;
  mediaId: string;
};

/** Sebab sebuah tindakan ditolak, agar halaman dapat menampilkan pesan tepat. */
export type CategoryFailure = 'invalid-name' | 'not-found' | 'in-use';

export type LocationFailure =
  | 'invalid-name'
  | 'invalid-category'
  | 'no-image'
  | 'not-found'
  | 'in-use';

export type CategoryResult =
  | { ok: true; categoryId: string }
  | { ok: false; reason: CategoryFailure; usedBy?: number };

export type LocationResult =
  | { ok: true; locationId: string }
  | { ok: false; reason: LocationFailure; usedBy?: number };

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
      `SELECT category_id, count(*)::int AS total
       FROM locations
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

  /** Mengubah nama. `category_id` TIDAK diubah — ia dirujuk lokasi dan dunia. */
  async renameCategory(categoryId: string, name: string): Promise<CategoryResult> {
    const cleaned = clamp(name, MAX_CATEGORY_NAME);
    if (cleaned.length === 0) {
      return { ok: false, reason: 'invalid-name' };
    }

    const { rowCount } = await this.db.query(
      'UPDATE location_categories SET name = $2 WHERE category_id = $1',
      [categoryId, cleaned],
    );
    return rowCount > 0 ? { ok: true, categoryId } : { ok: false, reason: 'not-found' };
  }

  /**
   * Menghapus kategori.
   *
   * Ditolak bila masih ada lokasi yang memakainya. Menghapus kategori akan
   * memutus seluruh lokasi di era itu sekaligus — terlalu mudah terjadi, dan
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
    return rowCount > 0 ? { ok: true, categoryId } : { ok: false, reason: 'not-found' };
  }

  /** Berapa lokasi yang memakai kategori ini. */
  async categoryUsage(categoryId: string): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM locations WHERE category_id = $1',
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
    await this.reorder('location_categories', 'category_id', categoryId, direction);
  }

  /* ---------------------------------------------------------------- */
  /* Lokasi                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Seluruh lokasi.
   *
   * Dua kueri, bukan satu kueri ber-`JOIN`: nama kategori diambil dari daftar
   * yang sudah dibaca, dan `ORDER BY` pada kolom turunan setelah `JOIN` tidak
   * dapat diandalkan di pg-mem.
   */
  async list(): Promise<LocationRow[]> {
    const categories = await this.listCategories();
    const nameById = new Map(categories.map((row) => [row.categoryId, row.name]));

    const { rows } = await this.db.query<{
      location_id: string;
      name: string;
      category_id: string;
      description: string;
      media_id: string;
      position: number;
      created_at: Date | string;
    }>(
      `SELECT location_id, name, category_id, description, media_id, position, created_at
       FROM locations
       ORDER BY position ASC, location_id ASC`,
    );

    return rows.map((row) => ({
      locationId: row.location_id,
      name: row.name,
      categoryId: row.category_id,
      categoryName: nameById.get(row.category_id) ?? row.category_id,
      description: row.description,
      mediaId: row.media_id,
      position: row.position,
      createdAt: row.created_at,
    }));
  }

  async find(locationId: string): Promise<LocationRow | null> {
    const all = await this.list();
    return all.find((row) => row.locationId === locationId) ?? null;
  }

  async create(input: LocationInput): Promise<LocationResult> {
    const prepared = await this.prepare(input);
    if ('reason' in prepared) {
      return prepared;
    }

    const locationId = newLocationId();
    const { rows } = await this.db.query<{ next_position: number }>(
      'SELECT coalesce(max(position), 0)::int + 1 AS next_position FROM locations',
    );
    await this.db.query(
      `INSERT INTO locations (location_id, name, category_id, description, media_id, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        locationId,
        prepared.name,
        prepared.categoryId,
        prepared.description,
        prepared.mediaId,
        rows[0]?.next_position ?? 1,
      ],
    );

    return { ok: true, locationId };
  }

  async update(locationId: string, input: LocationInput): Promise<LocationResult> {
    const prepared = await this.prepare(input);
    if ('reason' in prepared) {
      return prepared;
    }

    const { rowCount } = await this.db.query(
      `UPDATE locations
         SET name = $2, category_id = $3, description = $4, media_id = $5
       WHERE location_id = $1`,
      [
        locationId,
        prepared.name,
        prepared.categoryId,
        prepared.description,
        prepared.mediaId,
      ],
    );

    return rowCount > 0
      ? { ok: true, locationId }
      : { ok: false, reason: 'not-found' };
  }

  /**
   * Menghapus lokasi.
   *
   * Ditolak bila ada dunia yang memungut latarnya. Tidak ada tabel anak yang
   * harus dibersihkan lebih dulu: di bentuk ini lokasi tidak punya anak.
   */
  async remove(locationId: string): Promise<LocationResult> {
    const used = await this.locationUsage(locationId);
    if (used > 0) {
      return { ok: false, reason: 'in-use', usedBy: used };
    }

    const { rowCount } = await this.db.query('DELETE FROM locations WHERE location_id = $1', [
      locationId,
    ]);
    return rowCount > 0 ? { ok: true, locationId } : { ok: false, reason: 'not-found' };
  }

  async move(locationId: string, direction: 'up' | 'down'): Promise<void> {
    await this.reorder('locations', 'location_id', locationId, direction);
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
   * menyelundupkan lokasi tanpa gambar atau tanpa kategori.
   */
  private async prepare(
    input: LocationInput,
  ): Promise<
    | { name: string; categoryId: string; description: string; mediaId: string }
    | { ok: false; reason: LocationFailure }
  > {
    const name = clamp(input.name, MAX_LOCATION_NAME);
    if (name.length === 0) {
      return { ok: false, reason: 'invalid-name' };
    }

    const categoryId = input.categoryId.trim();
    const category = categoryId.length > 0 ? await this.findCategory(categoryId) : null;
    if (!category) {
      return { ok: false, reason: 'invalid-category' };
    }

    // Bentuk id diperiksa lebih dulu, dan itu bukan kehati-hatian berlebihan:
    // `media_blobs.media_id` selalu SHA-256 heksadesimal hasil unggahan, dan
    // penyaji berkas menolak bentuk lain. Baris yang lolos di sini tetapi
    // berbentuk lain akan tersimpan sebagai latar yang TIDAK PERNAH dapat
    // dimuat: markup-nya benar, gambarnya rusak, dan tidak ada galat di mana pun.
    const mediaId = input.mediaId.trim();
    if (!isMediaId(mediaId) || !(await this.mediaExists(mediaId))) {
      return { ok: false, reason: 'no-image' };
    }

    return {
      name,
      categoryId,
      description: clamp(input.description ?? '', MAX_LOCATION_DESCRIPTION),
      mediaId,
    };
  }

  /** Apakah berkas unggahan itu benar-benar ada. Kunci asing tetap jaring pengaman. */
  private async mediaExists(mediaId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ media_id: string }>(
      'SELECT media_id FROM media_blobs WHERE media_id = $1',
      [mediaId],
    );
    return rows.length > 0;
  }

  /** Menulis ulang urutan seluruh baris. Dipakai kategori dan lokasi. */
  private async reorder(
    table: 'location_categories' | 'locations',
    idColumn: 'category_id' | 'location_id',
    id: string,
    direction: 'up' | 'down',
  ): Promise<void> {
    await this.db.transaction(async (client) => {
      const { rows } = await client.query<Record<string, string>>(
        `SELECT ${idColumn} FROM ${table} ORDER BY position ASC, ${idColumn} ASC`,
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
          `UPDATE ${table} SET position = $2 WHERE ${idColumn} = $1`,
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

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
