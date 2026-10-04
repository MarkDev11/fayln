/**
 * Penyimpanan berkas gambar.
 *
 * Kunci utamanya adalah SHA-256 dari isi berkas, bukan nomor urut. Dua akibat
 * yang keduanya diinginkan:
 *   1. Berkas yang sama tidak pernah tersimpan dua kali. Ini bukan kemewahan:
 *      versi dunia bersifat TIDAK BERUBAH, jadi menerbitkan ulang sebuah dunia
 *      menyalin seluruh asetnya. Tanpa dedupe, satu latar belakang yang sama
 *      akan tersimpan sekali untuk setiap versi.
 *   2. Alamatnya ikut isi, sehingga responsnya boleh ditembolok selamanya
 *      (`immutable`) — isi di balik satu alamat tidak akan pernah berubah.
 *
 * Isi disimpan sebagai teks base64, bukan `bytea`. Alasannya dijelaskan
 * panjang di `007_media.sql`: pg-mem — mesin yang menjalankan SELURUH pengujian
 * — merusak `bytea` secara senyap dengan mengganti setiap byte bukan-UTF-8
 * menjadi U+FFFD. Header PNG dan JPEG penuh byte semacam itu, jadi `bytea`
 * akan lolos di pengujian sambil merusak setiap gambar di produksi.
 */

import { createHash } from 'node:crypto';

import type { Database } from '../db/pool';
import type { ImageInspection } from '../media/imageFile';

export type StoredMedia = {
  mediaId: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  createdAt: Date | string;
};

/** Bentuk media_id yang sah: SHA-256 heksadesimal huruf kecil. */
const MEDIA_ID = /^[0-9a-f]{64}$/;

export function isMediaId(value: string): boolean {
  return MEDIA_ID.test(value);
}

export class MediaRepository {
  constructor(private readonly db: Database) {}

  /**
   * Menyimpan gambar, atau mengembalikan yang sudah ada bila isinya sama.
   *
   * Mengembalikan `mediaId` beserta `isNew` supaya pemanggil dapat membedakan
   * unggahan baru dari pengulangan — berguna untuk catatan audit.
   *
   * Keberadaannya diperiksa LEBIH DULU, bukan disimpulkan dari `rowCount`.
   * Alasannya konkret: pg-mem — mesin yang menjalankan seluruh pengujian —
   * melaporkan `rowCount` 1 untuk `INSERT ... ON CONFLICT DO NOTHING` yang tidak
   * menyisipkan apa pun. Menyimpulkan "baru" dari angka itu membuat setiap
   * unggahan ulang tercatat sebagai berkas baru di audit, padahal tidak ada yang
   * berubah. `ON CONFLICT` tetap dipertahankan sebagai penjaga terhadap dua
   * unggahan bersamaan atas berkas yang sama.
   */
  async put(input: {
    bytes: Buffer;
    inspection: ImageInspection;
    uploadedBy: string | null;
  }): Promise<{ mediaId: string; isNew: boolean }> {
    const mediaId = createHash('sha256').update(input.bytes).digest('hex');

    const { rows: existing } = await this.db.query<{ present: number }>(
      'SELECT 1 AS present FROM media_blobs WHERE media_id = $1',
      [mediaId],
    );
    if (existing.length > 0) {
      return { mediaId, isNew: false };
    }

    await this.db.query(
      `INSERT INTO media_blobs (
         media_id, content_type, byte_size, width, height, has_alpha, content_base64, uploaded_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (media_id) DO NOTHING`,
      [
        mediaId,
        input.inspection.contentType,
        input.bytes.length,
        input.inspection.width,
        input.inspection.height,
        input.inspection.hasAlpha,
        input.bytes.toString('base64'),
        input.uploadedBy,
      ],
    );

    return { mediaId, isNew: true };
  }

  /** Metadata satu berkas, tanpa isinya. */
  async findById(mediaId: string): Promise<StoredMedia | null> {
    if (!isMediaId(mediaId)) {
      return null;
    }

    const { rows } = await this.db.query<{
      media_id: string;
      content_type: string;
      byte_size: number;
      width: number;
      height: number;
      has_alpha: boolean;
      created_at: Date | string;
    }>(
      `SELECT media_id, content_type, byte_size, width, height, has_alpha, created_at
       FROM media_blobs WHERE media_id = $1`,
      [mediaId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      mediaId: row.media_id,
      contentType: row.content_type,
      byteSize: row.byte_size,
      width: row.width,
      height: row.height,
      hasAlpha: row.has_alpha,
      createdAt: row.created_at,
    };
  }

  /**
   * Isi berkas, sudah didekode.
   *
   * `byte_size` dijadikan pemeriksaan terakhir: bila panjang hasil dekode tidak
   * sama dengan yang tercatat, ada yang rusak dan lebih baik gagal jelas
   * daripada menyajikan gambar separuh.
   */
  async readBytes(mediaId: string): Promise<{ media: StoredMedia; bytes: Buffer } | null> {
    if (!isMediaId(mediaId)) {
      return null;
    }

    const { rows } = await this.db.query<{
      media_id: string;
      content_type: string;
      byte_size: number;
      width: number;
      height: number;
      has_alpha: boolean;
      created_at: Date | string;
      content_base64: string;
    }>(
      `SELECT media_id, content_type, byte_size, width, height, has_alpha, created_at, content_base64
       FROM media_blobs WHERE media_id = $1`,
      [mediaId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const bytes = Buffer.from(row.content_base64, 'base64');
    if (bytes.length !== row.byte_size) {
      return null;
    }

    return {
      media: {
        mediaId: row.media_id,
        contentType: row.content_type,
        byteSize: row.byte_size,
        width: row.width,
        height: row.height,
        hasAlpha: row.has_alpha,
        createdAt: row.created_at,
      },
      bytes,
    };
  }

  /**
   * Berapa versi dunia yang memakai satu berkas.
   *
   * Dihitung lintas versi dan lintas dunia dengan sengaja: berkas yang sama
   * dapat dipakai beberapa dunia, dan menghapusnya saat masih dipakai akan
   * memutus gambar di tempat lain.
   */
  async usageCount(mediaId: string): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM world_assets WHERE media_id = $1',
      [mediaId],
    );
    return rows[0]?.total ?? 0;
  }

  /** Total byte isi yang tersimpan. Dipakai ringkasan agar pertumbuhan terlihat. */
  async totalBytes(): Promise<number> {
    const { rows } = await this.db.query<{ total: number | null }>(
      'SELECT coalesce(sum(byte_size), 0)::int AS total FROM media_blobs',
    );
    return rows[0]?.total ?? 0;
  }
}
