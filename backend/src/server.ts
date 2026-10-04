/**
 * Pabrik aplikasi Fastify.
 *
 * Dipisahkan dari `index.ts` supaya pengujian dapat membuat instance tanpa
 * membuka port dan tanpa proses panjang.
 */

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';

import { AppError } from './contracts/errors';
import type { AppConfig } from './config';
import type { Database } from './db/pool';
import { registerAdminRoutes } from './admin/adminRoutes';
import type { AdminRepository } from './admin/adminRepository';
import type { AdminPageContext } from './admin/pages/context';
import { registerAdminAuthHook } from './admin/session';
import { defaultAssetsRoot, registerAssetRoutes } from './routes/assets';
import { registerCatalogRoutes } from './routes/catalog';
import { registerHealthRoutes } from './routes/health';
import { registerJourneyRoutes } from './routes/journeys';
import { registerMediaRoutes } from './routes/media';
import { registerUsageAndReportRoutes } from './routes/usage';
import type { CatalogRepository } from './repositories/catalogRepository';
import { MediaRepository } from './repositories/mediaRepository';
import type { ReportRepository } from './repositories/reportRepository';
import type { UsageRepository } from './repositories/usageRepository';
import type { JourneyService } from './services/journeyService';
import { STORY_ENGINE_IS_SIMULATOR } from './services/storyEngine';
import { CURRENT_IDENTITY_MODE, registerIdentityHook } from './http/identity';

export const SERVICE_VERSION = '0.1.0';

export type AppDeps = {
  config: AppConfig;
  db: Database;
  /** Folder aset gambar. Bawaan: folder `assets/` di sebelah hasil kompilasi. */
  assetsRoot?: string;
  /**
   * Penyedia akun. Dipakai hook identitas untuk memastikan akun dari header
   * benar-benar ada sebelum route menyentuh tabel yang berkias-asing padanya.
   */
  accounts: { ensure: (accountId: string) => Promise<void> };
  catalog: CatalogRepository;
  /**
   * Penyimpanan berkas gambar unggahan. Opsional: bawaannya dibangun dari `db`,
   * sehingga pengujian yang tidak menyentuh unggahan tidak perlu menyiapkannya.
   */
  media?: MediaRepository;
  usage: UsageRepository;
  reports: ReportRepository;
  journeys: JourneyService;
  /**
   * Panel admin. Opsional supaya pengujian yang hanya menguji jalur pemain tidak
   * perlu menyiapkan seluruh repositori admin.
   */
  admin?: {
    repository: AdminRepository;
    pages: AdminPageContext;
  };
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

  /* ---------------- Cookie sesi admin ---------------- */
  // Hanya dipakai panel admin (cookie sesi). Jalur pemain tidak memakai cookie
  // sama sekali — identitasnya diambil dari header `x-account-id`.
  await app.register(cookie);

  /*
   * Pengurai badan formulir HTML.
   *
   * Fastify hanya mengurai JSON secara bawaan. Tanpa ini, setiap formulir panel
   * admin ditolak dengan HTTP 415 sebelum sampai ke handler — dan pesannya
   * ("Unsupported Media Type") tidak menunjukkan bahwa yang kurang adalah
   * pengurai, bukan formulirnya.
   */
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      try {
        done(null, parseFormBody(body as string));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

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

  /*
   * Penanganan alamat tidak dikenal.
   *
   * Dua bentuk balasan yang sengaja dibedakan:
   * - Jalur /admin/ yang tidak ada: halaman HTML yang menjelaskan, karena
   *   pengguna panel memakai peramban dan JSON mentah akan membingungkan.
   * - Jalur lain: JSON, mengikuti bentuk kesalahan yang sama dengan seluruh API.
   */
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/admin')) {
      return reply.status(404).type('text/html; charset=utf-8').send(
        [
          '<!doctype html><html lang="id"><head><meta charset="utf-8">',
          '<title>Tidak ditemukan — fayLN admin</title>',
          '<style>body{margin:0;background:#0f1416;color:#e6edef;font:14px/1.6 ui-sans-serif,system-ui,sans-serif}',
          'main{max-width:520px;margin:14vh auto;padding:24px}a{color:#2fb894}</style>',
          '</head><body><main><h1 style="font-size:20px">Halaman tidak ada</h1>',
          '<p style="color:#8fa1a6">Alamat yang diminta tidak ada di panel admin.</p>',
          '<p><a href="/admin">Kembali ke ringkasan</a></p></main></body></html>',
        ].join(''),
      );
    }

    return reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Alamat yang diminta tidak ada.',
      retryable: false,
    });
  });

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

  // Berkas unggahan dibaca dari basis data, bukan dari disk. Kontainer blitz
  // bersifat sementara: berkas yang ditulis saat berjalan hilang begitu aplikasi
  // dibangun ulang atau bangun kembali. Karena alamatnya memuat hash isi, isi di
  // balik satu alamat tidak akan pernah berubah — temboloknya boleh abadi.
  const media = deps.media ?? new MediaRepository(deps.db);
  registerMediaRoutes(app, { media, maxAgeSec: 31_536_000 });

  // Akun diadakan sebelum route mana pun berjalan. Tanpa ini, perangkat baru
  // yang mengirim ID buatannya sendiri akan ditolak kunci asing saat membuat
  // perjalanan pertama (terlihat sebagai HTTP 500).
  registerIdentityHook(app, deps.accounts);

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
      // Sumbernya satu konstanta, bukan angka yang diketik ulang — panel admin
      // membaca konstanta yang sama.
      simulator: STORY_ENGINE_IS_SIMULATOR,
    },
  }));

  /* ---------------- Panel admin ---------------- */
  // Dipasang TERAKHIR dan setelah hook identitas. Keduanya tidak saling ganggu:
  // hook identitas hanya bekerja pada jalur `/v1/`, sedangkan panel ini hanya
  // pada `/admin`. Keduanya diperiksa dari `request.url`, sehingga urutan
  // pendaftaran tidak berpengaruh pada perilakunya.
  if (deps.admin) {
    registerAdminAuthHook(app, deps.admin.repository, deps.config.isProduction);
    registerAdminRoutes(app, {
      admins: deps.admin.repository,
      pages: deps.admin.pages,
      media,
      isProduction: deps.config.isProduction,
    });
  }

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

/**
 * Mengurai badan `application/x-www-form-urlencoded` menjadi objek.
 *
 * Ditulis sendiri, bukan memakai `querystring.parse`, karena ada dua hal yang
 * harus benar dan mudah terlewat:
 *
 * 1. Nama yang muncul berulang menjadi LARIK, bukan saling menimpa. Ini yang
 *    membuat kotak centang "genre" dapat mengirim beberapa nilai sekaligus.
 * 2. `+` berarti spasi. Tidak menerjemahkannya membuat "Dunia Baru" tersimpan
 *    sebagai "Dunia+Baru".
 */
function parseFormBody(body: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  for (const pair of body.split('&')) {
    if (pair.length === 0) {
      continue;
    }
    const separator = pair.indexOf('=');
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? '' : pair.slice(separator + 1);

    const key = decodeFormComponent(rawKey);
    const value = decodeFormComponent(rawValue);
    if (key.length === 0) {
      continue;
    }

    const existing = result[key];
    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }

  return result;
}

/** `decodeURIComponent` dengan `+` sebagai spasi, dan tanpa melempar. */
function decodeFormComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    // Persen-escape yang rusak tidak boleh menggagalkan seluruh permintaan.
    return value;
  }
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
