/**
 * Identitas akun.
 *
 * PERINGATAN: ini BUKAN autentikasi. Metode masuk belum diputuskan (B-02).
 * Sementara, akun ditentukan oleh header `x-account-id`, dan bila tidak ada,
 * dipakai akun demo.
 *
 * Konsekuensinya harus disadari: siapa pun yang mengetahui atau menebak sebuah
 * account_id dapat membaca perjalanan akun itu. Karena itu:
 * - Nilai ini TIDAK boleh dipakai untuk data nyata sebelum B-02 selesai.
 * - Route yang memakainya diberi tanda `identityMode: 'placeholder'`.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

export const ACCOUNT_HEADER = 'x-account-id';

/** Akun demo yang dibuat oleh migrasi seed. */
export const DEMO_ACCOUNT_ID = 'acc_demo';

export type IdentityMode = 'placeholder' | 'authenticated';

/** Mode identitas yang berlaku saat ini. Berubah setelah B-02 diputuskan. */
export const CURRENT_IDENTITY_MODE: IdentityMode = 'placeholder';

export function resolveAccountId(request: FastifyRequest): string {
  const raw = request.headers[ACCOUNT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value === 'string' && value.trim().length > 0) {
    // Dibatasi panjang dan karakternya agar tidak menjadi jalur penyisipan.
    const trimmed = value.trim();
    if (/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
      return trimmed;
    }
  }

  return DEMO_ACCOUNT_ID;
}

/**
 * Memastikan akun dari header benar-benar ada sebelum route memakainya.
 *
 * Mengapa ini perlu: banyak tabel (operations, journeys, usage_entries) memiliki
 * kunci asing ke accounts. Klien membuat ID perangkat sendiri, sehingga perangkat
 * baru mengirim ID yang belum pernah terdaftar. Tanpa langkah ini, permintaan
 * pertama setiap pengguna baru gagal dengan galat kunci asing tingkat database —
 * yang muncul sebagai HTTP 500 dan bukan pesan yang dapat dimengerti pemain.
 *
 * Dipasang sebagai hook `onRequest`, bukan di dalam resolveAccountId, supaya
 * fungsi pembaca header tetap sinkron dan tidak perlu diubah di setiap route.
 * `ON CONFLICT DO NOTHING` membuatnya aman dipanggil berulang dan bersamaan.
 */
export function registerIdentityHook(
  app: FastifyInstance,
  accounts: { ensure: (accountId: string) => Promise<void> },
): void {
  app.addHook('onRequest', async (request) => {
    // Hanya permintaan API yang butuh akun; berkas aset dan pemeriksaan kesehatan
    // tidak boleh menyentuh database sama sekali.
    if (!request.url.startsWith('/v1/')) {
      return;
    }

    await accounts.ensure(resolveAccountId(request));
  });
}
