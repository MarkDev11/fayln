/**
 * Sapuan render seluruh halaman panel.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA BERKAS INI ADA
 * ---------------------------------------------------------------------------
 * Kontrak renderer ini punya satu mode kegagalan yang tidak melempar galat:
 * potongan HTML yang seharusnya disambung APA ADANYA malah di-escape, sehingga
 * halamannya menampilkan markup mentah sebagai teks — `<span class="muted">0</span>`
 * yang terbaca apa adanya oleh admin.
 *
 * Penyebabnya selalu sama: sebuah string BIASA berisi HTML disisipkan ke
 * template `html`. `html()` meng-escape setiap skalar, jadi string biasa
 * diperlakukan sebagai teks. Yang benar adalah membungkusnya dengan `html\`\``
 * agar bertanda `SafeHtml` dan diteruskan utuh.
 *
 * Bahayanya: uji XSS yang hanya memeriksa "tidak ada tag hidup" tetap LULUS
 * pada halaman yang rusak seperti ini — justru karena tidak ada tag hidup.
 * Karena itu uji di sini memeriksa hal yang sebaliknya: bahwa markup yang
 * SEHARUSNYA hidup benar-benar hidup.
 *
 * Sapuan ini menemukan tiga pelanggaran nyata saat pertama dijalankan:
 * saldo bonus nol di daftar akun, tombol "Bersihkan" saat pencarian aktif, dan
 * pesan "belum ada dunia" di halaman karakter. Ketiganya hanya muncul pada
 * keadaan tertentu, sehingga tidak terlihat pada pemakaian biasa.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AccountsAdminRepository } from '../src/admin/accountsAdminRepository';
import { AdminRepository } from '../src/admin/adminRepository';
import { CatalogAdminRepository } from '../src/admin/catalogAdminRepository';
import { GenresRepository } from '../src/admin/genresRepository';
import { ModelsRepository } from '../src/admin/modelsRepository';
import type { AdminPageContext } from '../src/admin/pages/context';
import { charactersList } from '../src/admin/pages/catalogPages';
import { PromotionsRepository } from '../src/admin/promotionsRepository';
import { SettingsRepository } from '../src/admin/settingsRepository';
import { WorldDraftRepository } from '../src/admin/worldDraftRepository';
import { resetLoginAttempts, SESSION_COOKIE } from '../src/admin/session';
import { parseConfig, type AppConfig } from '../src/config';
import { AccountRepository } from '../src/repositories/accountRepository';
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

let ctx: TestDatabase;
let app: FastifyInstance;
let admins: AdminRepository;
let pages: AdminPageContext;

const ADMIN_USERNAME = 'operator-render';
const ADMIN_PASSWORD = 'kata-sandi-uji-123';

/**
 * Tag yang bila muncul dalam bentuk ter-escape berarti ada potongan HTML yang
 * salah diperlakukan sebagai teks.
 *
 * Daftarnya sengaja memuat tag yang dipakai panel ini sehari-hari. Tag di luar
 * daftar ini bisa saja muncul sebagai teks yang MEMANG disengaja — mis. nilai
 * dari basis data yang memuat tanda `<` — dan itu bukan pelanggaran.
 */
const ESCAPED_TAG = /&lt;(span|div|table|tr|td|th|form|input|a|button|p|h1|h2|h3|ul|ol|li|strong|em|code|pre|label|select|option|textarea|nav|aside|main|header|section|style|script|br)\b/;

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

async function buildTestApp(): Promise<FastifyInstance> {
  const config = testConfig();
  const usage = new UsageRepository(ctx.db, config.plan);
  const catalogRepo = new CatalogRepository(ctx.db);
  const journeys = new JourneyRepository(ctx.db);
  const operations = new OperationRepository(ctx.db);
  const reports = new ReportRepository(ctx.db);

  admins = new AdminRepository(ctx.db);

  pages = {
    admins,
    settings: new SettingsRepository(ctx.db),
    catalog: new CatalogAdminRepository(ctx.db),
    accounts: new AccountsAdminRepository(ctx.db),
    promotions: new PromotionsRepository(ctx.db),
    models: new ModelsRepository(ctx.db),
    drafts: new WorldDraftRepository(ctx.db),
    genres: new GenresRepository(ctx.db),
    media: new MediaRepository(ctx.db),
  };

  const journeyService = new JourneyService({
    catalog: catalogRepo,
    journeys,
    operations,
    usage,
    engine: new DeterministicStoryEngine(),
    newId: () => `id_${Math.random().toString(36).slice(2, 14)}`,
    now: () => new Date(),
  });

  return buildApp({
    config,
    db: ctx.db,
    accounts: new AccountRepository(ctx.db),
    catalog: catalogRepo,
    usage,
    reports,
    journeys: journeyService,
    admin: { repository: admins, pages },
  });
}

function readCookie(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) {
    throw new Error('Tidak ada Set-Cookie pada balasan.');
  }
  const match = /fayln_admin_session=([^;]+)/.exec(raw);
  if (!match?.[1]) {
    throw new Error(`Cookie sesi tidak ditemukan pada: ${raw}`);
  }
  return `${SESSION_COOKIE}=${match[1]}`;
}

async function login(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/login',
    payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(response.statusCode).toBe(302);
  return readCookie(response.headers['set-cookie']);
}

/** Menyatakan bahwa halaman benar-benar merender markup, bukan menulisnya. */
function expectLiveMarkup(body: string, label: string): void {
  const escaped = ESCAPED_TAG.exec(body);
  expect(
    escaped,
    `Halaman ${label} menampilkan markup sebagai teks: "${body.slice(
      Math.max(0, (escaped?.index ?? 0) - 70),
      (escaped?.index ?? 0) + 70,
    )}"`,
  ).toBeNull();
}

async function sweep(cookie: string, url: string): Promise<string> {
  const response = await app.inject({ method: 'GET', url, headers: { cookie } });
  expect(response.statusCode, `${url} mengembalikan ${response.statusCode}`).toBe(200);
  expectLiveMarkup(response.body, url);
  return response.body;
}

beforeEach(async () => {
  ctx = await createTestDatabase();
  resetLoginAttempts();
  app = await buildTestApp();
  await admins.createAdmin({
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    displayName: 'Operator Render',
    role: 'owner',
  });
});

afterEach(async () => {
  await app.close();
  await ctx.close();
});

/* ------------------------------------------------------------------ */

describe('sapuan render: tidak ada markup yang tampil sebagai teks', () => {
  /**
   * Daftar ini harus memuat SETIAP halaman GET yang menggambar markup.
   * Halaman yang tidak diuji di sini adalah halaman yang pelanggarannya hanya
   * akan ketahuan dari laporan admin.
   */
  const HALAMAN: string[] = [
    '/admin',
    '/admin/worlds',
    // Halaman masuk wizard; langkah 1–3 diuji terpisah karena butuh draf nyata.
    '/admin/worlds-wizard',
    '/admin/characters',
    '/admin/characters-form',
    '/admin/locations',
    '/admin/genres',
    '/admin/assets',
    '/admin/accounts',
    '/admin/models',
    '/admin/models-form',
    '/admin/promotions',
    '/admin/promotions-new',
    '/admin/settings',
    '/admin/admins',
    '/admin/audit',
  ];

  it.each(HALAMAN)('merender %s dengan markup hidup', async (url) => {
    const cookie = await login();
    await sweep(cookie, url);
  });

  it('menghidupkan notifikasi pada halaman yang menerimanya', async () => {
    const cookie = await login();
    for (const url of [
      '/admin/genres?notice=created',
      '/admin/genres?notice=genre-invalid',
      '/admin/worlds?notice=published',
      '/admin/models?notice=saved',
      '/admin/settings?notice=saved',
      '/admin/admins?notice=created',
    ]) {
      const body = await sweep(cookie, url);
      expect(body, `${url} tidak menampilkan notifikasi`).toContain('notice');
    }
  });

  it('menghidupkan tombol Bersihkan saat pencarian akun aktif', async () => {
    const cookie = await login();
    // Cabang ini hanya aktif ketika ada kata kunci, jadi halaman tanpa
    // pencarian tidak akan pernah memperlihatkan kerusakannya.
    const body = await sweep(cookie, '/admin/accounts?search=tidak-ada-akun-ini');
    expect(body).toContain('<button class="ghost" type="button">Bersihkan</button>');
    expect(body).toContain('Tidak ada akun yang cocok.');
  });

  it('menghidupkan ringkasan saringan pada catatan audit', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/audit?username=operator-render&action=login');
    expect(body).toContain('Saringan:');
  });

  it('menghidupkan angka nol bergaya pada saldo bonus akun', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/accounts');
    // Akun yang belum pernah menerima bonus harus menampilkan nol yang diredupkan,
    // bukan tulisan `<span class="muted">0</span>`.
    expect(body).toContain('<span class="muted">0</span>');
  });

  it('menghidupkan halaman rincian akun', async () => {
    const cookie = await login();
    const list = await sweep(cookie, '/admin/accounts');
    const match = /\/admin\/accounts\/([A-Za-z0-9_-]+)"/.exec(list);
    expect(match, 'Tidak menemukan satu pun tautan rincian akun.').not.toBeNull();
    await sweep(cookie, `/admin/accounts/${match![1]}`);
  });

  it('menghidupkan halaman rincian dunia', async () => {
    const cookie = await login();
    const list = await sweep(cookie, '/admin/worlds');
    const match = /\/admin\/worlds\/([A-Za-z0-9_-]+)"/.exec(list);
    expect(match, 'Tidak menemukan satu pun tautan rincian dunia.').not.toBeNull();
    await sweep(cookie, `/admin/worlds/${match![1]}`);
  });

  it('menghidupkan ketiga langkah wizard pada draf yang baru dibuat', async () => {
    const cookie = await login();
    // Draf dibuat langsung lewat repositori, bukan lewat unggahan sampul:
    // yang diuji di sini adalah render langkahnya, bukan alur unggahnya.
    const { worldId } = await pages.drafts.createDraft();

    for (const step of [1, 2, 3]) {
      await sweep(cookie, `/admin/worlds/${worldId}/wizard/${step}`);
    }

    // Langkah 1 memuat kotak centang genre, dan itu salah satu tempat yang
    // pernah menuliskan entitasnya sebagai teks.
    const step1 = await sweep(cookie, `/admin/worlds/${worldId}/wizard/1`);
    expect(step1).toContain('name="genres"');
    expect(step1).toContain('value="romance"');
  });
});

describe('cabang yang hanya aktif saat basis data kosong', () => {
  /**
   * Halaman karakter tidak menerima parameter kueri: ia selalu memuat seluruh
   * dunia. Artinya cabang "belum ada dunia" tidak dapat dipicu lewat HTTP pada
   * basis data yang sudah terseed, dan justru cabang itulah yang pernah salah.
   * Karena itu fungsinya dipanggil langsung dengan konteks yang dipalsukan.
   */
  it('menghidupkan pesan "belum ada dunia" alih-alih menuliskan tag-nya', async () => {
    const kosong = {
      catalog: { listWorlds: async () => [] },
    } as unknown as AdminPageContext;

    const body = String(await charactersList(kosong));

    expect(body).toContain('<div class="empty">Belum ada dunia, jadi belum ada karakter.</div>');
    expect(body).not.toContain('&lt;div');
  });
});
