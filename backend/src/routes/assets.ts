/**
 * Penyajian berkas aset statis.
 *
 * Aset gambar disimpan di dalam image Docker (folder `assets/`), ikut berversi
 * bersama kode, dan disajikan pada `/assets/*`. Tidak ada mekanisme unggah:
 * menambah atau mengganti gambar dilakukan lewat commit lalu deploy ulang.
 *
 * Keamanan — dua lapis, karena ini satu-satunya tempat server membaca berkas
 * dari permintaan pengguna:
 *   1. Nama berkas dibatasi pada karakter yang aman saja.
 *   2. Setelah jalur digabung, hasilnya HARUS masih berada di dalam folder aset.
 *      Pemeriksaan kedua ini yang mencegah pelintasan jalur (`../`).
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';

import type { FastifyInstance, FastifyReply } from 'fastify';

/** Hanya nama berkas yang tersusun dari karakter aman yang diterima. */
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;
const SAFE_EXTENSION = /^\.(png|jpg|jpeg|webp)$/;

/** Peta jenis isi berdasarkan akhiran berkas. */
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export type AssetRouteDeps = {
  /** Folder aset, sudah absolut. */
  assetsRoot: string;
  /** Berapa lama klien boleh menyimpan tembolok. Detik. */
  maxAgeSec: number;
};

/**
 * Mengubah jalur aset menjadi nama berkas yang aman.
 *
 * Mengembalikan `null` bila jalurnya tidak dapat dipercaya.
 */
export function safeAssetPath(requested: string, assetsRoot: string): string | null {
  // Pisahkan menjadi bagian-bagian dan buang yang kosong serta `.`/`..`.
  const parts = requested
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== '.' && part !== '..');

  if (parts.length === 0 || parts.length > 3) {
    return null;
  }

  for (const part of parts) {
    const isLast = part === parts[parts.length - 1];
    if (isLast) {
      // Bagian terakhir boleh mengandung titik sebagai akhiran berkas.
      const withoutExtension = part.slice(0, Math.max(0, part.lastIndexOf('.')));
      const extension = part.slice(Math.max(0, part.lastIndexOf('.')));
      if (!SAFE_NAME.test(withoutExtension) || !SAFE_EXTENSION.test(extension)) {
        return null;
      }
    } else if (!SAFE_NAME.test(part)) {
      return null;
    }
  }

  // Lapis kedua: pastikan hasil akhir masih di dalam folder aset.
  const root = resolve(assetsRoot);
  const candidate = resolve(join(root, ...parts));
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }

  return candidate;
}

export function registerAssetRoutes(app: FastifyInstance, deps: AssetRouteDeps): void {
  app.get('/assets/*', async (request, reply) => {
    // `*` menangkap sisa alamat, mis. `/assets/portrait/p_elysia_netral.png`.
    const wildcard = (request.params as { '*'?: string })['*'] ?? '';

    const filePath = safeAssetPath(wildcard, deps.assetsRoot);
    if (!filePath) {
      return sendAssetError(reply, 400, 'Nama aset tidak valid.');
    }

    if (!existsSync(filePath)) {
      // Klien menampilkan placeholder sendiri bila aset belum ada; 404 sudah cukup.
      return sendAssetError(reply, 404, 'Aset tidak ditemukan.');
    }

    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return sendAssetError(reply, 404, 'Aset tidak ditemukan.');
    }

    const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';

    reply.header('content-type', contentType);
    reply.header('content-length', String(stats.size));
    reply.header('cache-control', `public, max-age=${deps.maxAgeSec}`);
    // Aset bersifat publik dan tidak pernah berubah untuk satu versi aplikasi.
    reply.header('x-content-type-options', 'nosniff');

    return reply.send(createReadStream(filePath));
  });
}

function sendAssetError(reply: FastifyReply, status: number, message: string): FastifyReply {
  return reply.status(status).type('application/json').send({
    code: status === 404 ? 'NOT_FOUND' : 'VALIDATION',
    message,
    retryable: false,
  });
}

/** Folder aset: di sebelah `dist/` saat berjalan dari hasil kompilasi. */
export function defaultAssetsRoot(): string {
  return normalize(join(__dirname, '..', '..', 'assets'));
}
