/**
 * Penyajian berkas gambar unggahan.
 *
 * Berbeda dari `/assets/*` yang menyajikan berkas dari dalam image Docker, route
 * ini membaca dari basis data. Ia PUBLIK — aplikasi pemain yang memuatnya, dan
 * ia tidak memuat apa pun yang bersifat rahasia: hanya gambar yang sudah
 * dimasukkan ke katalog.
 *
 * Alamatnya memuat SHA-256 isi berkas, jadi isi di balik satu alamat tidak akan
 * pernah berubah. Karena itu responsnya boleh ditembolok selamanya. Ini bukan
 * sekadar optimasi: setiap byte yang tidak perlu dikirim ulang adalah byte yang
 * tidak keluar dari database yang kapasitasnya terbatas.
 *
 * Tiga header dipasang dengan sengaja:
 *   - `x-content-type-options: nosniff` — peramban tidak boleh menebak jenis
 *     berkas dari isinya dan memutuskan sendiri untuk menampilkannya sebagai
 *     HTML. Ini yang mengubah "berkas aneh" menjadi "skrip yang berjalan".
 *   - `content-security-policy: default-src 'none'; sandbox` — bila seseorang
 *     membuka alamat berkas ini langsung, isinya tidak boleh memuat apa pun dan
 *     tidak boleh menjalankan skrip. Berkas yang menyamar sebagai gambar tidak
 *     berdaya di sini.
 *   - `content-disposition: inline` — ditampilkan, bukan diunduh.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';

import type { MediaRepository } from '../repositories/mediaRepository';

export type MediaRouteDeps = {
  media: MediaRepository;
  /** Berapa lama klien boleh menyimpan tembolok. Detik. */
  maxAgeSec: number;
};

export function registerMediaRoutes(app: FastifyInstance, deps: MediaRouteDeps): void {
  app.get<{ Params: { mediaId: string } }>('/v1/media/:mediaId', async (request, reply) => {
    const found = await deps.media.readBytes(request.params.mediaId);

    if (!found) {
      return reply.status(404).type('application/json').send({
        code: 'NOT_FOUND',
        message: 'Berkas tidak ditemukan.',
        retryable: false,
      });
    }

    return sendMedia(reply, found.media.contentType, found.bytes, found.media.mediaId, deps.maxAgeSec);
  });
}

function sendMedia(
  reply: FastifyReply,
  contentType: string,
  bytes: Buffer,
  etag: string,
  maxAgeSec: number,
): FastifyReply {
  reply.header('content-type', contentType);
  reply.header('content-length', String(bytes.length));
  reply.header('cache-control', `public, max-age=${maxAgeSec}, immutable`);
  reply.header('etag', `"${etag}"`);
  reply.header('x-content-type-options', 'nosniff');
  reply.header('content-disposition', 'inline');
  reply.header('content-security-policy', "default-src 'none'; sandbox");

  return reply.send(bytes);
}
