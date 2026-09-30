/**
 * Skema masukan HTTP.
 *
 * Setiap masukan dari klien divalidasi di sini sebelum menyentuh layanan. Skema
 * Zod juga menghasilkan tipe, sehingga validasi dan tipe tidak dapat berbeda.
 */

import { z } from 'zod';

import { GENRES, REPORT_CATEGORIES, RESPONSE_LOCALES } from '../contracts/types';

export const catalogQuerySchema = z.object({
  search: z.string().max(120).optional(),
  genres: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim().length === 0
        ? []
        : value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => (GENRES as readonly string[]).includes(item)),
    ),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const worldParamsSchema = z.object({
  worldId: z.string().min(1).max(80),
});

export const journeyParamsSchema = z.object({
  journeyId: z.string().min(1).max(80),
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
