/**
 * Konfigurasi dari variabel lingkungan.
 *
 * Aturan: server tidak boleh gagal karena variabel yang tidak penting. Hanya
 * `DATABASE_URL` yang wajib; sisanya punya nilai bawaan yang aman. `PORT` wajib
 * dibaca dari lingkungan karena blitz.cloud menyuntikkannya (ADR-B01 platform).
 */

import { z } from 'zod';

/** Mengubah string kosong menjadi `undefined` agar nilai bawaan berlaku. */
const optionalString = z
  .string()
  .transform((value) => (value.trim().length === 0 ? undefined : value))
  .optional();

const booleanish = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(['true', 'false', '1', '0', 'yes', 'no']))
  .transform((value) => value === 'true' || value === '1' || value === 'yes');

const positiveInt = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? fallback : Number(value)))
    .pipe(z.number().int().positive());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Wajib di produksi; di uji boleh kosong karena database disuntikkan pengujian.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi.'),

  // blitz.cloud menyuntikkan PORT. Bawaan 8080 hanya untuk lokal.
  PORT: positiveInt(8080),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  CORS_ORIGINS: optionalString,

  /**
   * Alamat publik aplikasi, mis. `https://fayln-api.marky.blitz.cloud`.
   *
   * Dipakai mengubah jalur aset menjadi URL absolut yang dapat dimuat klien.
   * Kosong berarti alamat diturunkan dari permintaan yang sedang dilayani —
   * cukup untuk pengembangan, tetapi sebaiknya diisi di produksi.
   */
  PUBLIC_BASE_URL: optionalString,

  RUN_MIGRATIONS_ON_START: booleanish.default(true),

  FREE_DAILY_TOKENS: positiveInt(100_000),
  PAID_DAILY_TOKENS: positiveInt(1_000_000),
  FREE_CONTEXT_TOKENS: positiveInt(64_000),
  PAID_CONTEXT_TOKENS: positiveInt(256_000),

  RATE_LIMIT_MAX: positiveInt(60),
  RATE_LIMIT_WINDOW_MS: positiveInt(60_000),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  databaseUrl: string;
  port: number;
  logLevel: string;
  corsOrigins: string[];
  publicBaseUrl: string | undefined;
  runMigrationsOnStart: boolean;
  plan: {
    free: { dailyTokens: number; contextTokens: number };
    paid: { dailyTokens: number; contextTokens: number };
  };
  rateLimit: { max: number; windowMs: number };
};

export function parseConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(akar)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Konfigurasi tidak valid — ${details}`);
  }

  const value = parsed.data;

  return {
    nodeEnv: value.NODE_ENV,
    isProduction: value.NODE_ENV === 'production',
    databaseUrl: value.DATABASE_URL,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    corsOrigins: (value.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    // Buang garis miring di akhir agar tidak menjadi alamat ganda.
    publicBaseUrl: value.PUBLIC_BASE_URL?.replace(/\/+$/, ''),
    runMigrationsOnStart: value.RUN_MIGRATIONS_ON_START,
    plan: {
      free: { dailyTokens: value.FREE_DAILY_TOKENS, contextTokens: value.FREE_CONTEXT_TOKENS },
      paid: { dailyTokens: value.PAID_DAILY_TOKENS, contextTokens: value.PAID_CONTEXT_TOKENS },
    },
    rateLimit: { max: value.RATE_LIMIT_MAX, windowMs: value.RATE_LIMIT_WINDOW_MS },
  };
}
