/**
 * Unggahan dan penyajian berkas gambar.
 *
 * Uji yang paling penting di berkas ini adalah KESETIAAN BYTE. Probe pada
 * `007_media.sql` membuktikan pg-mem merusak `bytea` secara senyap: setiap byte
 * yang bukan UTF-8 sah diganti U+FFFD. Uji "unggah lalu sajikan, isinya harus
 * sama persis" akan menangkapnya — dan itulah alasan isi disimpan sebagai teks
 * base64. Tanpa uji ini, kerusakannya tidak akan terlihat sampai ada pemain yang
 * melihat gambar rusak.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { AdminRepository } from '../src/admin/adminRepository';
import { AccountsAdminRepository } from '../src/admin/accountsAdminRepository';
import { CatalogAdminRepository } from '../src/admin/catalogAdminRepository';
import { GenresRepository } from '../src/admin/genresRepository';
import { CharactersRepository } from '../src/admin/charactersRepository';
import { LocationsRepository } from '../src/admin/locationsRepository';
import { ProvidersRepository } from '../src/admin/providersRepository';
import { ModelsRepository } from '../src/admin/modelsRepository';
import type { AdminPageContext } from '../src/admin/pages/context';
import { PromotionsRepository } from '../src/admin/promotionsRepository';
import { SettingsRepository } from '../src/admin/settingsRepository';
import { WorldDraftRepository } from '../src/admin/worldDraftRepository';
import { resetLoginAttempts, SESSION_COOKIE } from '../src/admin/session';
import { parseConfig, type AppConfig } from '../src/config';
import { AccountRepository } from '../src/repositories/accountRepository';
import { AuthRepository } from '../src/repositories/authRepository';
import { CatalogRepository } from '../src/repositories/catalogRepository';
import { JourneyRepository } from '../src/repositories/journeyRepository';
import { MediaRepository } from '../src/repositories/mediaRepository';
import { OperationRepository } from '../src/repositories/operationRepository';
import { ReportRepository } from '../src/repositories/reportRepository';
import { UsageRepository } from '../src/repositories/usageRepository';
import { buildApp } from '../src/server';
import { JourneyService } from '../src/services/journeyService';
import { DeterministicStoryEngine } from '../src/services/storyEngine';
import { createTestDatabase, type TestDatabase } from './helpers/testDb';

/* ------------------------------------------------------------------ */
/* Contoh berkas                                                       */
/* ------------------------------------------------------------------ */

/**
 * PNG 1x1 yang sungguhan.
 *
 * Dipilih karena memuat byte bukan-UTF-8 di dalam tanda tangannya
 * (`0x89`) — persis byte yang akan dirusak `bytea` di pg-mem.
 */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * PNG dengan ukuran yang ditentukan, cukup untuk diuji pembaca dimensinya.
 *
 * Hanya tanda tangan dan blok IHDR yang dibangun — bagian yang memang dibaca
 * server. Berkas ini tidak dimaksudkan dapat dibuka penampil gambar.
 */
function pngWithSize(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8); // panjang blok IHDR
  header.write('IHDR', 12, 'latin1');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8; // kedalaman bit
  header[25] = 6; // tipe warna RGBA — berarti punya alfa
  header[26] = 0;
  header[27] = 0;
  header[28] = 0;
  header.writeUInt32BE(0, 29); // CRC (tidak diperiksa pembaca kami)
  return header;
}

/** JPEG minimal dengan penanda SOF0 pada ukuran yang ditentukan. */
function jpegWithSize(width: number, height: number): Buffer {
  const sof = Buffer.alloc(11);
  sof[0] = 0xff;
  sof[1] = 0xc0; // SOF0
  sof.writeUInt16BE(9, 2); // panjang segmen
  sof[4] = 8; // presisi
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 1; // jumlah komponen
  sof[10] = 0;
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]), sof, Buffer.from([0xff, 0xd9])]);
}

/** WebP varian VP8X — kanvas disimpan sebagai nilai minus satu. */
function webpWithSize(width: number, height: number, alpha: boolean): Buffer {
  const head = Buffer.alloc(30);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(22, 4);
  head.write('WEBP', 8, 'latin1');
  head.write('VP8X', 12, 'latin1');
  head.writeUInt32LE(10, 16);
  head[20] = alpha ? 0x10 : 0x00;
  const w = width - 1;
  const h = height - 1;
  head[24] = w & 0xff;
  head[25] = (w >> 8) & 0xff;
  head[26] = (w >> 16) & 0xff;
  head[27] = h & 0xff;
  head[28] = (h >> 8) & 0xff;
  head[29] = (h >> 16) & 0xff;
  return head;
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let ctx: TestDatabase;
let app: FastifyInstance;
let admins: AdminRepository;

function testConfig(): AppConfig {
  return parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused',
    PORT: '8080',
    LOG_LEVEL: 'error',
    RUN_MIGRATIONS_ON_START: 'false',
    FREE_DAILY_TOKENS: '100000',
    RATE_LIMIT_MAX: '1000',
  } as NodeJS.ProcessEnv);
}

async function build(): Promise<FastifyInstance> {
  const config = testConfig();
  const usage = new UsageRepository(ctx.db, config.plan);
  admins = new AdminRepository(ctx.db);
  const pages: AdminPageContext = {
    admins,
    settings: new SettingsRepository(ctx.db),
    catalog: new CatalogAdminRepository(ctx.db),
    accounts: new AccountsAdminRepository(ctx.db),
    promotions: new PromotionsRepository(ctx.db),
    models: new ModelsRepository(ctx.db),
    drafts: new WorldDraftRepository(ctx.db),
    genres: new GenresRepository(ctx.db),
    characters: new CharactersRepository(ctx.db),
    locations: new LocationsRepository(ctx.db),
    providers: new ProvidersRepository(ctx.db),

    plan: testConfig().plan,
    media: new MediaRepository(ctx.db),
  };
  const journeyService = new JourneyService({
    catalog: new CatalogRepository(ctx.db),
    journeys: new JourneyRepository(ctx.db),
    operations: new OperationRepository(ctx.db),
    usage,
    engine: new DeterministicStoryEngine(),
    newId: () => `id_${Math.random().toString(36).slice(2, 14)}`,
    now: () => new Date(),
  });
  return buildApp({
    config,
    db: ctx.db,
    accounts: new AccountRepository(ctx.db),
    auth: new AuthRepository(ctx.db),
    catalog: new CatalogRepository(ctx.db),
    usage,
    reports: new ReportRepository(ctx.db),
    journeys: journeyService,
    admin: { repository: admins, pages },
  });
}

beforeEach(async () => {
  ctx = await createTestDatabase();
  resetLoginAttempts();
  app = await build();
  await admins.createAdmin({
    username: 'operator',
    password: 'kata-sandi-uji-123',
    displayName: 'Operator',
    role: 'owner',
  });
});

afterEach(async () => {
  await app.close();
  await ctx.close();
});

async function login(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/login',
    payload: { username: 'operator', password: 'kata-sandi-uji-123' },
  });
  const match = /fayln_admin_session=([^;]+)/.exec(String(response.headers['set-cookie']));
  return `${SESSION_COOKIE}=${match?.[1] ?? ''}`;
}

function upload(cookie: string, bytes: Buffer, contentType: string) {
  return app.inject({
    method: 'POST',
    url: '/admin/media',
    headers: { cookie, 'content-type': contentType },
    payload: bytes,
  });
}

/* ------------------------------------------------------------------ */
/* Uji                                                                 */
/* ------------------------------------------------------------------ */

describe('unggah gambar', () => {
  it('menyimpan PNG dan mengembalikan dimensinya dari isi berkas', async () => {
    const cookie = await login();
    const response = await upload(cookie, pngWithSize(1280, 720), 'image/png');

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.contentType).toBe('image/png');
    expect(body.width).toBe(1280);
    expect(body.height).toBe(720);
    expect(body.hasAlpha).toBe(true);
    expect(body.mediaId).toMatch(/^[0-9a-f]{64}$/);
    expect(body.deduplicated).toBe(false);
  });

  it('menolak berkas yang menyamar, termasuk SVG', async () => {
    const cookie = await login();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    // Klaim jenisnya PNG, tetapi isinya SVG — yang dipercaya isinya.
    const response = await upload(cookie, svg, 'image/png');
    expect(response.statusCode).toBe(415);
    expect(response.json().code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('menolak unggahan tanpa sesi admin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/media',
      headers: { 'content-type': 'image/png' },
      payload: pngWithSize(10, 10),
    });

    // Yang menolak adalah hook sesi panel, sebelum handler sempat berjalan:
    // permintaan dialihkan ke halaman masuk. Pemeriksaan di dalam handler tetap
    // ada sebagai lapis kedua, tetapi jalur inilah yang sesungguhnya bekerja.
    expect(response.statusCode).toBe(302);
    expect(String(response.headers.location)).toContain('/admin/login');

    // Yang penting: tidak ada yang tersimpan.
    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM media_blobs',
    );
    expect(rows[0]?.total).toBe(0);
  });

  it('membaca dimensi JPEG dari penanda SOF', async () => {
    const cookie = await login();
    const response = await upload(cookie, jpegWithSize(800, 600), 'image/jpeg');
    expect(response.statusCode).toBe(200);
    expect(response.json().width).toBe(800);
    expect(response.json().height).toBe(600);
    expect(response.json().hasAlpha).toBe(false);
  });

  it('membaca dimensi WebP varian VP8X beserta bendera alfanya', async () => {
    const cookie = await login();
    const opaque = await upload(cookie, webpWithSize(1600, 900, false), 'image/webp');
    expect(opaque.statusCode).toBe(200);
    expect(opaque.json().width).toBe(1600);
    expect(opaque.json().height).toBe(900);
    expect(opaque.json().hasAlpha).toBe(false);

    const withAlpha = await upload(cookie, webpWithSize(512, 768, true), 'image/webp');
    expect(withAlpha.json().hasAlpha).toBe(true);
  });
});

describe('penyajian gambar', () => {
  it('mengembalikan isi yang SAMA PERSIS dengan yang diunggah', async () => {
    const cookie = await login();
    const created = await upload(cookie, PNG_1X1, 'image/png');
    expect(created.statusCode).toBe(200);

    const served = await app.inject({ method: 'GET', url: created.json().url });
    expect(served.statusCode).toBe(200);

    // Inti uji ini: byte demi byte. Penyimpanan yang merusak byte akan gugur
    // di sini, dan hanya di sini.
    expect(Buffer.from(served.rawPayload).equals(PNG_1X1)).toBe(true);
  });

  it('memasang header yang mencegah berkas diperlakukan sebagai dokumen', async () => {
    const cookie = await login();
    const created = await upload(cookie, PNG_1X1, 'image/png');
    const served = await app.inject({ method: 'GET', url: created.json().url });

    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-security-policy']).toContain('sandbox');
    // Alamat memuat hash isi, jadi isinya tidak akan pernah berubah.
    expect(served.headers['cache-control']).toContain('immutable');
  });

  it('menjawab 404 untuk berkas yang tidak ada dan untuk alamat yang tidak sah', async () => {
    const missing = await app.inject({ method: 'GET', url: `/v1/media/${'a'.repeat(64)}` });
    expect(missing.statusCode).toBe(404);

    // Bukan SHA-256: ditolak tanpa menyentuh basis data.
    const malformed = await app.inject({ method: 'GET', url: '/v1/media/bukan-hash' });
    expect(malformed.statusCode).toBe(404);
  });
});

describe('dedupe berkas', () => {
  it('tidak menyimpan berkas yang sama dua kali', async () => {
    const cookie = await login();

    const first = await upload(cookie, PNG_1X1, 'image/png');
    const second = await upload(cookie, PNG_1X1, 'image/png');

    expect(second.json().mediaId).toBe(first.json().mediaId);
    expect(first.json().deduplicated).toBe(false);
    expect(second.json().deduplicated).toBe(true);

    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM media_blobs',
    );
    expect(rows[0]?.total).toBe(1);
  });

  it('menyimpan berkas berbeda secara terpisah', async () => {
    const cookie = await login();
    const a = await upload(cookie, pngWithSize(100, 100), 'image/png');
    const b = await upload(cookie, pngWithSize(200, 200), 'image/png');

    expect(a.json().mediaId).not.toBe(b.json().mediaId);
    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM media_blobs',
    );
    expect(rows[0]?.total).toBe(2);
  });

  it('mencatat unggahan di audit, tetapi tidak mengulanginya saat dedupe', async () => {
    const cookie = await login();
    await upload(cookie, PNG_1X1, 'image/png');
    await upload(cookie, PNG_1X1, 'image/png');

    const entries = await admins.listAudit(50, { action: 'media.upload' });
    expect(entries.length).toBe(1);
  });
});
