/**
 * Pengujian autentikasi pemain.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA PENGUJIAN INI PENTING
 * ---------------------------------------------------------------------------
 * Sebelum 9 Oktober 2026, identitas pemain ditentukan header `x-account-id` yang
 * dikirim klien dan dipercaya apa adanya. Buktinya diukur terhadap produksi: satu
 * permintaan `GET /v1/journeys` dengan id akun orang lain mengembalikan HTTP 200
 * beserta perjalanan akun itu.
 *
 * Uji terpenting di berkas ini bukan "login berhasil", melainkan "klaim identitas
 * TIDAK diterima". Tanpa itu, kelemahannya dapat kembali tanpa ada yang menyadari.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseConfig, type AppConfig } from '../src/config';
import { AccountRepository } from '../src/repositories/accountRepository';
import { AuthRepository } from '../src/repositories/authRepository';
import { CatalogRepository } from '../src/repositories/catalogRepository';
import { JourneyRepository } from '../src/repositories/journeyRepository';
import { OperationRepository } from '../src/repositories/operationRepository';
import { ReportRepository } from '../src/repositories/reportRepository';
import { UsageRepository } from '../src/repositories/usageRepository';
import { buildApp } from '../src/server';
import { JourneyService } from '../src/services/journeyService';
import { DeterministicStoryEngine } from '../src/services/storyEngine';
import { resetLoginAttempts } from '../src/routes/auth';

import { createTestDatabase, type TestDatabase } from './helpers/testDb';
import { bearer } from './helpers/auth';

let ctx: TestDatabase;
let app: FastifyInstance;

function testConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): AppConfig {
  return parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused',
    PORT: '8080',
    LOG_LEVEL: 'error',
    RUN_MIGRATIONS_ON_START: 'false',
    FREE_DAILY_TOKENS: '100000',
    RATE_LIMIT_MAX: '1000',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

async function buildTestApp(config: AppConfig = testConfig()): Promise<FastifyInstance> {
  const usage = new UsageRepository(ctx.db, config.plan);
  const catalog = new CatalogRepository(ctx.db);
  const journeys = new JourneyRepository(ctx.db);
  const operations = new OperationRepository(ctx.db);
  const reports = new ReportRepository(ctx.db);

  const journeyService = new JourneyService({
    catalog,
    journeys,
    operations,
    usage,
    engine: new DeterministicStoryEngine(),
    newId: () => `id_${Math.random().toString(36).slice(2, 12)}`,
    now: () => new Date(),
  });

  return buildApp({
    config,
    db: ctx.db,
    accounts: new AccountRepository(ctx.db),
    auth: new AuthRepository(ctx.db),
    catalog,
    usage,
    reports,
    journeys: journeyService,
  });
}

/** Kata sandi yang memenuhi syarat minimum. */
const SANDI = 'rahasia-ku-123';

async function register(email: string, password = SANDI): Promise<{ token: string; accountId: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password, displayName: 'Arfan', age: 24 },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { token: string; account: { accountId: string } };
  return { token: body.token, accountId: body.account.accountId };
}

beforeEach(async () => {
  ctx = await createTestDatabase();
  app = await buildTestApp();
  resetLoginAttempts();
});

afterEach(async () => {
  await app.close();
  await ctx.close();
});

describe('pendaftaran', () => {
  it('membuat akun dan langsung memberi token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'baru@contoh.test', password: SANDI, displayName: 'Arfan', age: 24 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { token: string; account: { email: string; accountId: string } };
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.account.email).toBe('baru@contoh.test');
    expect(body.account.accountId).toMatch(/^acc_/);
  });

  it('menolak email yang sudah terdaftar', async () => {
    await register('kembar@contoh.test');

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'kembar@contoh.test', password: SANDI, displayName: 'Lain', age: 30 },
    });

    expect(second.statusCode).toBe(409);
    expect((second.json() as { code: string }).code).toBe('CONFLICT');
  });

  it('memperlakukan email tanpa pandang besar-kecil huruf', async () => {
    await register('huruf@contoh.test');

    const upper = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'HURUF@CONTOH.TEST', password: SANDI, displayName: 'Lain', age: 30 },
    });

    // Kalau email dibandingkan apa adanya, dua akun berbeda akan tercipta untuk
    // satu orang — dan orang itu akan bingung kenapa ceritanya terbelah dua.
    expect(upper.statusCode).toBe(409);
  });

  it('menolak kata sandi yang terlalu pendek', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'pendek@contoh.test', password: 'abc', displayName: 'Arfan', age: 24 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('menolak email yang bentuknya salah', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'bukan-email', password: SANDI, displayName: 'Arfan', age: 24 },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('masuk', () => {
  it('memberi token untuk kata sandi yang benar', async () => {
    await register('masuk@contoh.test');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'masuk@contoh.test', password: SANDI },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { token: string }).token.length).toBeGreaterThan(20);
  });

  it('menolak kata sandi yang salah tanpa membocorkan apakah emailnya ada', async () => {
    await register('ada@contoh.test');

    const salahSandi = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'ada@contoh.test', password: 'sandi-yang-salah' },
    });

    const emailTiada = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'tidak-ada@contoh.test', password: 'sandi-yang-salah' },
    });

    expect(salahSandi.statusCode).toBe(401);
    expect(emailTiada.statusCode).toBe(401);
    // Pesannya HARUS sama. Pesan yang berbeda memberi tahu penyerang email mana
    // yang terdaftar, dan itu cukup untuk menyusun daftar sasaran.
    expect(salahSandi.json()).toEqual(emailTiada.json());
  });

  it('menerima email tanpa pandang besar-kecil huruf', async () => {
    await register('campur@contoh.test');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'CaMpUr@Contoh.Test', password: SANDI },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('identitas tidak dapat diklaim', () => {
  it('MENOLAK x-account-id sebagai identitas', async () => {
    const { accountId } = await register('pemilik@contoh.test');

    /*
     * Inti perbaikan. Sebelumnya permintaan ini mengembalikan seluruh perjalanan
     * akun tersebut. Sekarang harus ditolak.
     */
    const response = await app.inject({
      method: 'GET',
      url: '/v1/journeys',
      headers: { 'x-account-id': accountId },
    });

    expect(response.statusCode).toBe(401);
    expect((response.json() as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('MENOLAK permintaan tanpa token sama sekali', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/journeys' });
    expect(response.statusCode).toBe(401);
  });

  it('MENOLAK token yang dikarang', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/journeys',
      headers: bearer('token-palsu-yang-tidak-pernah-diterbitkan'),
    });

    expect(response.statusCode).toBe(401);
  });

  it('tidak dapat membaca perjalanan akun lain walaupun tahu account_id-nya', async () => {
    const a = await register('a@contoh.test');

    const created = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      headers: bearer(a.token),
      payload: {
        clientOperationId: 'op-uji-pribadi-123456',
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    expect(created.statusCode).toBe(201);
    const journeyId = (created.json() as { journeyId: string }).journeyId;

    const b = await register('b@contoh.test');

    // Akun B tahu id perjalanan akun A, tetapi tidak boleh membacanya.
    const bocor = await app.inject({
      method: 'GET',
      url: `/v1/journeys/${journeyId}/session`,
      headers: bearer(b.token),
    });

    expect(bocor.statusCode).toBe(404);
  });
});

describe('sesi', () => {
  it('mengembalikan akun yang sedang masuk', async () => {
    const { token } = await register('aku@contoh.test');

    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: bearer(token),
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { account: { email: string } }).account.email).toBe('aku@contoh.test');
  });

  it('mencabut token setelah keluar', async () => {
    const { token } = await register('keluar@contoh.test');

    const keluar = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: bearer(token),
    });
    expect(keluar.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/v1/journeys', headers: bearer(token) });
    expect(after.statusCode).toBe(401);
  });

  it('menerima keluar walau tokennya sudah tidak sah', async () => {
    // Pemain yang menekan "Keluar" tidak boleh melihat galat hanya karena
    // sesinya sudah dicabut di tempat lain.
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: bearer('token-yang-sudah-tidak-ada'),
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('katalog tetap terbuka', () => {
  it('menyajikan katalog tanpa perlu masuk', async () => {
    // Etalase: orang harus dapat melihat ada cerita apa saja sebelum mendaftar.
    const response = await app.inject({ method: 'GET', url: '/v1/worlds' });
    expect(response.statusCode).toBe(200);
  });

  it('menyajikan genre tanpa perlu masuk', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/genres' });
    expect(response.statusCode).toBe(200);
  });
});

describe('alamat yang tidak ada', () => {
  it('tetap menjawab 404, bukan 401', async () => {
    /*
     * Hook identitas berjalan SEBELUM perutean. Tanpa pemeriksaan rute, alamat
     * yang salah ketik akan dijawab 401, dan pemain akan mengira sesinya yang
     * bermasalah lalu keluar-masuk tanpa hasil.
     */
    const response = await app.inject({ method: 'GET', url: '/v1/tidak-ada-sama-sekali' });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { code: string }).code).toBe('NOT_FOUND');
  });
});
