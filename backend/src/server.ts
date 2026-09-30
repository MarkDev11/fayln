/**
 * Pabrik aplikasi Fastify.
 *
 * Dipisahkan dari `index.ts` supaya pengujian dapat membuat instance tanpa
 * membuka port dan tanpa proses panjang.
 */

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

import { AppError } from './contracts/errors';
import type { AppConfig } from './config';
import type { Database } from './db/pool';
import { defaultAssetsRoot, registerAssetRoutes } from './routes/assets';
import { registerCatalogRoutes } from './routes/catalog';
import { registerHealthRoutes } from './routes/health';
import { registerJourneyRoutes } from './routes/journeys';
import { registerUsageAndReportRoutes } from './routes/usage';
import type { CatalogRepository } from './repositories/catalogRepository';
import type { ReportRepository } from './repositories/reportRepository';
import type { UsageRepository } from './repositories/usageRepository';
import type { JourneyService } from './services/journeyService';
import { CURRENT_IDENTITY_MODE } from './http/identity';

export const SERVICE_VERSION = '0.1.0';

export type AppDeps = {
  config: AppConfig;
  db: Database;
  /** Folder aset gambar. Bawaan: folder `assets/` di sebelah hasil kompilasi. */
  assetsRoot?: string;
  catalog: CatalogRepository;
  usage: UsageRepository;
  reports: ReportRepository;
  journeys: JourneyService;
  logger?: boolean;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Log disediakan pemanggil; di pengujian dimatikan agar keluaran bersih.
    logger: deps.logger ?? false,
    // Di belakang reverse proxy platform, alamat asli ada di header.
    trustProxy: true,
    // Membatasi ukuran badan permintaan: tindakan bebas dibatasi 600 karakter.
    bodyLimit: 64 * 1024,
  });

  /* ---------------- CORS ---------------- */
  // Asal kosong berarti hanya permintaan tanpa Origin yang dilayani, yaitu
  // aplikasi native. Origin web harus didaftarkan secara eksplisit.
  await app.register(cors, {
    origin: deps.config.corsOrigins.length > 0 ? deps.config.corsOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['content-type', 'x-account-id'],
    maxAge: 600,
  });

  /* ---------------- Rate limit (FR-73) ---------------- */
  await app.register(rateLimit, {
    max: deps.config.rateLimit.max,
    timeWindow: deps.config.rateLimit.windowMs,
    // Kunci per akun, bukan per alamat IP: satu kantor dengan satu IP publik
    // tidak boleh saling memblokir.
    keyGenerator: (request) => {
      const raw = request.headers['x-account-id'];
      const value = Array.isArray(raw) ? raw[0] : raw;
      return typeof value === 'string' && value.length > 0 ? value : request.ip;
    },
    // Balasan 429 memakai bentuk kesalahan yang sama dengan kesalahan lain,
    // sehingga frontend tidak perlu menangani dua bentuk.
    errorResponseBuilder: (_request, context) => ({
      code: 'RATE_LIMITED',
      message: 'Kamu mengirim permintaan terlalu cepat. Tunggu sebentar, lalu coba lagi.',
      retryable: true,
      retryAfterSec: Math.ceil(context.ttl / 1000),
    }),
  });

  /* ---------------- Penanganan galat ---------------- */
  app.setErrorHandler((error, request, reply) => {
    // Kesalahan domain: pesannya sudah aman untuk pemain.
    if (error instanceof AppError) {
      request.log?.warn(
        { code: error.code, detail: error.internalDetail },
        'Permintaan ditolak oleh aturan domain.',
      );
      return reply.status(error.statusCode).send(error.toResponse());
    }

    // Kesalahan validasi Zod.
    if (isZodError(error)) {
      return reply.status(400).send({
        code: 'VALIDATION',
        message: 'Data yang dikirim tidak lengkap atau tidak sesuai.',
        retryable: false,
      });
    }

    // Kesalahan Fastify yang sudah membawa status, misalnya badan terlalu besar.
    const statusCode = readStatusCode(error);
    if (statusCode !== null && statusCode < 500) {
      return reply.status(statusCode).send({
        code: 'VALIDATION',
        message: 'Permintaan tidak dapat diproses.',
        retryable: false,
      });
    }

    // Kesalahan tak terduga: detail hanya masuk log, tidak pernah ke klien.
    request.log?.error({ err: error }, 'Kesalahan tak terduga.');
    return reply.status(500).send({
      code: 'INTERNAL',
      message: 'Terjadi kesalahan di server. Coba lagi sebentar lagi.',
      retryable: true,
    });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Alamat yang diminta tidak ada.',
      retryable: false,
    }),
  );

  /* ---------------- Route ---------------- */
  registerHealthRoutes(app, {
    db: deps.db,
    startedAt: Date.now(),
    version: SERVICE_VERSION,
  });

  // Aset disajikan sebelum route lain yang memakai pola alamat.
  registerAssetRoutes(app, {
    assetsRoot: deps.assetsRoot ?? defaultAssetsRoot(),
    // Sehari. Aset bersifat publik dan tidak berubah untuk satu versi aplikasi.
    maxAgeSec: 86_400,
  });

  registerCatalogRoutes(app, { catalog: deps.catalog });
  registerJourneyRoutes(app, { journeys: deps.journeys });
  registerUsageAndReportRoutes(app, { usage: deps.usage, reports: deps.reports });

  /** Ringkasan konfigurasi publik. Tidak memuat rahasia apa pun. */
  app.get('/v1/meta', async () => ({
    service: 'fayln-backend',
    version: SERVICE_VERSION,
    identityMode: CURRENT_IDENTITY_MODE,
    plans: {
      free: deps.config.plan.free,
      paid: deps.config.plan.paid,
    },
    storyEngine: {
      // Dinyatakan terbuka supaya tidak ada yang menyangka ini AI produksi.
      simulator: true,
    },
  }));

  return app;
}

function isZodError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'ZodError'
  );
}

/** Membaca `statusCode` dari kesalahan yang bentuknya belum diketahui. */
function readStatusCode(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
  }
  return null;
}
