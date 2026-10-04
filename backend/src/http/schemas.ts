/**
 * Skema masukan HTTP.
 *
 * Setiap masukan dari klien divalidasi di sini sebelum menyentuh layanan. Skema
 * Zod juga menghasilkan tipe, sehingga validasi dan tipe tidak dapat berbeda.
 */

import { z } from 'zod';

import { REPORT_CATEGORIES, RESPONSE_LOCALES } from '../contracts/types';

/**
 * Saringan genre pada katalog publik.
 *
 * Daftar genre adalah DATA (tabel `genres`), bukan konstanta. Versi sebelumnya
 * menyaring masukan terhadap konstanta yang tertulis di kode — dan itu berarti
 * genre yang baru dibuat admin dari panel DIBUANG diam-diam di sini, sebelum
 * kueri sempat berjalan. Gejalanya membingungkan: genre tampil di formulir,
 * tersimpan di basis data, tetapi menyaring katalog dengannya mengembalikan
 * seluruh dunia seolah saringan tidak dipasang.
 *
 * Karena itu tidak ada lagi daftar yang dicocokkan. Yang tersisa hanya batas
 * BENTUK — panjang, jumlah, dan duplikat — karena nilai ini masuk ke kueri.
 * Keabsahan sebuah id diperiksa terhadap tabel, dan genre yang tidak ada cukup
 * menghasilkan katalog kosong, bukan masukan yang dibuang tanpa jejak.
 */
const MAX_GENRE_FILTERS = 10;
const MAX_GENRE_ID_LENGTH = 32;

export const catalogQuerySchema = z.object({
  search: z.string().max(120).optional(),
  genres: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim().length === 0) {
        return [];
      }
      return [
        ...new Set(
          value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && item.length <= MAX_GENRE_ID_LENGTH),
        ),
      ].slice(0, MAX_GENRE_FILTERS);
    }),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const worldParamsSchema = z.object({
  worldId: z.string().min(1).max(80),
});

/**
 * Parameter untuk rail beranda ("Top 10 Minggu Ini", "Terbaru Dirilis").
 *
 * Batas atas 20, bukan 10: rail memang menampilkan 10, tetapi mengizinkan klien
 * meminta lebih sedikit atau sedikit lebih banyak membuat rail dapat dipakai
 * ulang tanpa mengubah kontrak. Batas ini juga menahan permintaan yang meminta
 * seluruh katalog sekaligus.
 */
export const railQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const journeyParamsSchema = z.object({
  journeyId: z.string().min(1).max(80),
});

export const operationParamsSchema = z.object({
  operationId: z.string().min(1).max(120),
});

export const createJourneyBodySchema = z.object({
  clientOperationId: z.string().min(8).max(120),
  worldId: z.string().min(1).max(80),
  persona: z.object({
    name: z.string().trim().min(1).max(30),
    age: z.number().int().min(13).max(99),
  }),
  responseLocale: z.enum(RESPONSE_LOCALES),
});

export const submitTurnBodySchema = z
  .object({
    clientOperationId: z.string().min(8).max(120),
    decisionId: z.string().min(1).max(80),
    selection: z.object({ optionId: z.string().min(1).max(80) }).optional(),
    customText: z.string().trim().min(1).max(600).optional(),
    responseLocale: z.enum(RESPONSE_LOCALES),
  })
  .refine(
    (value) => (value.selection !== undefined) !== (value.customText !== undefined),
    {
      message: 'Isi tepat satu dari "selection" atau "customText".',
      path: ['selection'],
    },
  );

export const syncProgressBodySchema = z.object({
  lastReadSequence: z.number().int().min(0).max(1_000_000),
  lastReadBeatId: z.string().max(120),
  decisionCount: z.number().int().min(0).max(100_000),
  hasUnreadBeats: z.boolean(),
});

export const reportBodySchema = z.object({
  clientOperationId: z.string().min(8).max(120),
  category: z.enum(REPORT_CATEGORIES),
  detail: z.string().max(600).default(''),
  journeyId: z.string().max(80).optional(),
  beatId: z.string().max(120).optional(),
});
