/**
 * Master genre.
 *
 * Daftar genre adalah DATA, bukan konstanta. Sebelumnya ia hidup di tiga tempat
 * sekaligus — konstanta di kode, `CHECK` di skema, dan kunci terjemahan di
 * aplikasi pemain — sehingga menambah satu genre berarti menyunting ketiganya,
 * dan melewatkan satu berarti kegagalan senyap.
 *
 * Di sini ia menjadi satu tabel, dan admin dapat mengelolanya sendiri.
 *
 * ---------------------------------------------------------------------------
 * DUA KEPUTUSAN YANG PERLU DIKETAHUI SEBELUM MENYUNTING BERKAS INI
 * ---------------------------------------------------------------------------
 *
 * 1. `genre_id` TIDAK DAPAT DIUBAH setelah dibuat.
 *
 *    Ia dirujuk `world_genres.genre`, dan mengganti nama id berarti menulis
 *    ulang seluruh rujukannya — termasuk pada VERSI LAMA dunia, yang justru
 *    tidak boleh berubah karena perjalanan pemain menunjuk ke sana. Yang dapat
 *    diubah adalah labelnya, dan label itulah yang dilihat orang. Id adalah
 *    urusan mesin; label adalah urusan manusia.
 *
 * 2. MENGHAPUS genre yang masih dipakai DITOLAK, bukan dipaksa.
 *
 *    `ON DELETE RESTRICT` pada foreign key sudah menolaknya di tingkat
 *    database; berkas ini menerjemahkan penolakan itu menjadi alasan yang dapat
 *    dibaca admin. Genre yang sudah tidak diinginkan dinonaktifkan, bukan
 *    dihapus — genre nonaktif hilang dari formulir, tetapi dunia lama yang
 *    memakainya tetap utuh.
 *
 * Bentuk `genre_id` diperiksa di sini, bukan dengan `CHECK`, karena pg-mem
 * tidak mengenal operator `~` maupun fungsi `length()` — `CHECK` seperti itu
 * membuat MIGRASI gagal, bukan sekadar tidak menegakkan apa pun. Di sini pula
 * pesannya dapat menjelaskan KENAPA sebuah id ditolak.
 */

import type { Database } from '../db/pool';
import type { GenreId } from '../contracts/types';

/** Huruf kecil, angka, garis bawah. Diawali huruf. 2–32 karakter. */
export const GENRE_ID_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

export type GenreRow = {
  genreId: GenreId;
  labelId: string;
  labelEn: string;
  position: number;
  active: boolean;
  /** Berapa DUNIA (bukan versi) yang memakai genre ini. */
  worldCount: number;
  createdAt: Date | string;
};

export type GenreInput = {
  genreId: string;
  labelId: string;
  labelEn: string;
  active: boolean;
};

/** Sebab sebuah tindakan ditolak, agar halaman dapat menampilkan pesan tepat. */
export type GenreFailure = 'invalid-id' | 'duplicate' | 'not-found' | 'in-use';

export type GenreResult = { ok: true } | { ok: false; reason: GenreFailure; usedBy?: number };

const MAX_LABEL = 60;

export class GenresRepository {
  constructor(private readonly db: Database) {}

  /**
   * Seluruh genre beserta jumlah pemakainya.
   *
   * Jumlahnya dihitung lewat satu kueri `GROUP BY` terpisah, bukan sub-kueri
   * berkorelasi: pg-mem tidak dapat sub-kueri yang merujuk tabel induk, dan
   * selisihnya tidak terasa karena jumlah genre kecil.
   */
  async list(): Promise<GenreRow[]> {
    const { rows } = await this.db.query<{
      genre_id: string;
      label_id: string;
      label_en: string;
      position: number;
      active: boolean;
      created_at: Date | string;
    }>(
      `SELECT genre_id, label_id, label_en, position, active, created_at
       FROM genres
       ORDER BY position ASC, genre_id ASC`,
    );

    const counts = await this.usageCounts();

    return rows.map((row) => ({
      genreId: row.genre_id,
      labelId: row.label_id,
      labelEn: row.label_en,
      position: row.position,
      active: row.active,
      worldCount: counts.get(row.genre_id) ?? 0,
      createdAt: row.created_at,
    }));
  }

  /**
   * Genre yang pantas ditawarkan pada formulir, untuk satu pilihan tertentu.
   *
   * Isinya: seluruh genre AKTIF, ditambah genre yang sudah dipilih walau sudah
   * nonaktif. Penambahan itu bukan kelonggaran — tanpanya, menyunting dunia lama
   * yang memakai genre nonaktif akan menghilangkan centangnya tanpa suara, dan
   * menyimpan formulir itu diam-diam membuang genre dari dunia tersebut.
   *
   * Yang diperiksa adalah keberadaan, bukan keaktifan; genre nonaktif tetap
   * muncul di sini hanya bila ia memang sudah terpasang di dunia yang dibuka.
   */
  async listOfferable(selected: readonly string[] = []): Promise<GenreRow[]> {
    const chosen = new Set(selected);
    return (await this.list()).filter((genre) => genre.active || chosen.has(genre.genreId));
  }

  async find(genreId: string): Promise<GenreRow | null> {
    const all = await this.list();
    return all.find((genre) => genre.genreId === genreId) ?? null;
  }

  /**
   * Memeriksa bahwa setiap id benar-benar ada di tabel.
   *
   * Dipakai formulir dunia dan wizard. Yang diperiksa adalah KEBERADAAN, bukan
   * keaktifan: menyunting dunia lama yang memakai genre nonaktif tidak boleh
   * membuang genre itu diam-diam.
   */
  async existingIds(candidates: readonly string[]): Promise<GenreId[]> {
    if (candidates.length === 0) {
      return [];
    }
    const known = new Set((await this.list()).map((genre) => genre.genreId));
    // Urutan permintaan dipertahankan, duplikat dibuang.
    return [...new Set(candidates)].filter((id) => known.has(id));
  }

  async create(input: GenreInput): Promise<GenreResult> {
    const genreId = input.genreId.trim().toLowerCase();
    if (!GENRE_ID_PATTERN.test(genreId)) {
      return { ok: false, reason: 'invalid-id' };
    }

    const existing = await this.db.query<{ genre_id: string }>(
      'SELECT genre_id FROM genres WHERE genre_id = $1',
      [genreId],
    );
    if (existing.rows.length > 0) {
      return { ok: false, reason: 'duplicate' };
    }

    const { rows } = await this.db.query<{ next_position: number }>(
      'SELECT coalesce(max(position), 0)::int + 1 AS next_position FROM genres',
    );

    await this.db.query(
      `INSERT INTO genres (genre_id, label_id, label_en, position, active)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        genreId,
        clampLabel(input.labelId, genreId),
        clampLabel(input.labelEn, genreId),
        rows[0]?.next_position ?? 1,
        input.active,
      ],
    );
    return { ok: true };
  }

  /**
   * Mengubah label dan keaktifan. Id TIDAK diubah — lihat catatan di kepala berkas.
   */
  async update(genreId: string, input: Omit<GenreInput, 'genreId'>): Promise<GenreResult> {
    const { rowCount } = await this.db.query(
      `UPDATE genres SET label_id = $2, label_en = $3, active = $4 WHERE genre_id = $1`,
      [genreId, clampLabel(input.labelId, genreId), clampLabel(input.labelEn, genreId), input.active],
    );
    return rowCount > 0 ? { ok: true } : { ok: false, reason: 'not-found' };
  }

  /**
   * Menghapus genre.
   *
   * Ditolak bila masih dipakai. Pemeriksaannya dilakukan SEBELUM `DELETE` supaya
   * alasannya dapat disebutkan; foreign key tetap menjadi jaring pengaman bila
   * ada yang menyisipkan di antara pemeriksaan dan penghapusan.
   */
  async remove(genreId: string): Promise<GenreResult> {
    const used = await this.usageCount(genreId);
    if (used > 0) {
      return { ok: false, reason: 'in-use', usedBy: used };
    }

    const { rowCount } = await this.db.query('DELETE FROM genres WHERE genre_id = $1', [genreId]);
    return rowCount > 0 ? { ok: true } : { ok: false, reason: 'not-found' };
  }

  /**
   * Menggeser satu genre satu langkah ke atas atau ke bawah.
   *
   * Urutan ditulis ulang seluruhnya dari daftar yang sudah diurutkan, bukan
   * dengan menukar dua angka. Menukar dua angka tampak lebih murah, tetapi
   * menjadi salah begitu ada dua baris berposisi sama — dan itu terjadi setiap
   * kali genre dibuat bersamaan.
   */
  async move(genreId: string, direction: 'up' | 'down'): Promise<void> {
    await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ genre_id: string }>(
        'SELECT genre_id FROM genres ORDER BY position ASC, genre_id ASC',
      );
      const ids = rows.map((row) => row.genre_id);
      const index = ids.indexOf(genreId);
      if (index < 0) {
        return;
      }
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= ids.length) {
        return;
      }
      ids.splice(target, 0, ...ids.splice(index, 1));

      for (const [position, id] of ids.entries()) {
        await client.query('UPDATE genres SET position = $2 WHERE genre_id = $1', [id, position + 1]);
      }
    });
  }

  /** Berapa baris `world_genres` yang menunjuk genre ini. */
  async usageCount(genreId: string): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM world_genres WHERE genre = $1',
      [genreId],
    );
    return rows[0]?.total ?? 0;
  }

  /** Peta `genre_id -> jumlah DUNIA yang memakainya`. */
  private async usageCounts(): Promise<Map<string, number>> {
    const { rows } = await this.db.query<{ genre: string; total: number }>(
      `SELECT genre, count(DISTINCT world_id)::int AS total
       FROM world_genres
       GROUP BY genre`,
    );
    return new Map(rows.map((row) => [row.genre, row.total]));
  }
}

/**
 * Label kosong diisi id-nya.
 *
 * Kolomnya `NOT NULL`, dan genre tanpa label akan tampil sebagai baris kosong di
 * katalog — lebih buruk daripada menampilkan id apa adanya.
 */
function clampLabel(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  return trimmed.length > MAX_LABEL ? trimmed.slice(0, MAX_LABEL) : trimmed;
}
