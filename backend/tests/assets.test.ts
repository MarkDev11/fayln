/**
 * Uji rute penyajian aset.
 *
 * Fokus utama berkas ini adalah keamanan: rute aset satu-satunya tempat server
 * membaca berkas dari alamat yang dikirim klien. Pelintasan jalur (`../`) harus
 * gagal, dan hanya nama berkas berkarakter aman yang boleh lewat.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { parseConfig, type AppConfig } from '../src/config';
import { CatalogRepository } from '../src/repositories/catalogRepository';
import { JourneyRepository } from '../src/repositories/journeyRepository';
import { OperationRepository } from '../src/repositories/operationRepository';
import { ReportRepository } from '../src/repositories/reportRepository';
import { UsageRepository } from '../src/repositories/usageRepository';
import { safeAssetPath } from '../src/routes/assets';
import { buildApp } from '../src/server';
import { JourneyService } from '../src/services/journeyService';
import { DeterministicStoryEngine } from '../src/services/storyEngine';

import { createTestDatabase, type TestDatabase } from './helpers/testDb';

/** Folder aset nyata di repositori ini, dipakai juga oleh uji integrasi. */
const REAL_ASSETS = 'C:/Users/arfandi/workspaces/Portofolio/project2/backend/assets';

let ctx: TestDatabase;
let app: FastifyInstance;

function testConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): AppConfig {
  return parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused',
    PORT: '8080',
    LOG_LEVEL: 'error',
    RUN_MIGRATIONS_ON_START: 'false',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

beforeEach(async () => {
  ctx = await createTestDatabase();
  const config = testConfig();

  app = await buildApp({
    config,
    db: ctx.db,
    assetsRoot: REAL_ASSETS,
    catalog: new CatalogRepository(ctx.db, (path) => `https://api.test${path}`),
    usage: new UsageRepository(ctx.db, config.plan),
    reports: new ReportRepository(ctx.db),
    journeys: new JourneyService({
      catalog: new CatalogRepository(ctx.db, (path) => `https://api.test${path}`),
      journeys: new JourneyRepository(ctx.db),
      operations: new OperationRepository(ctx.db),
      usage: new UsageRepository(ctx.db, config.plan),
      engine: new DeterministicStoryEngine(),
      newId: () => `id_${Math.random().toString(36).slice(2, 10)}`,
      now: () => new Date(),
    }),
  });
});

afterEach(async () => {
  await app.close();
  await ctx.close();
});

describe('keamanan jalur aset', () => {
  it('menerima jalur berkas yang wajar', () => {
    const result = safeAssetPath('portrait/p_elysia_netral.png', REAL_ASSETS);
    expect(result).toContain('portrait');
    expect(result?.endsWith('p_elysia_netral.png')).toBe(true);
  });

  it('menolak pelintasan jalur mundur', () => {
    expect(safeAssetPath('../../../etc/passwd', REAL_ASSETS)).toBeNull();
    expect(safeAssetPath('portrait/../../package.json', REAL_ASSETS)).toBeNull();
    expect(safeAssetPath('..%2f..%2fetc%2fpasswd', REAL_ASSETS)).toBeNull();
  });

  it('menormalkan titik di tengah jalur tanpa keluar dari folder aset', () => {
    // Titik tunggal tidak berbahaya: setelah dinormalkan hasilnya tetap berada di
    // dalam folder aset, dan itulah yang diperiksa lapis kedua.
    const result = safeAssetPath('portrait/./p_x.png', REAL_ASSETS);
    expect(result).toContain('portrait');
    expect(result?.endsWith('p_x.png')).toBe(true);
    expect(result?.startsWith(REAL_ASSETS.replace(/\//g, '\\'))).toBe(true);
  });

  it('menolak akhiran berkas yang tidak diizinkan', () => {
    expect(safeAssetPath('portrait/p_x.svg', REAL_ASSETS)).toBeNull();
    expect(safeAssetPath('portrait/p_x.exe', REAL_ASSETS)).toBeNull();
    expect(safeAssetPath('src/db/migrate.ts', REAL_ASSETS)).toBeNull();
  });

  it('menolak jalur kosong dan yang terlalu dalam', () => {
    expect(safeAssetPath('', REAL_ASSETS)).toBeNull();
    expect(safeAssetPath('a/b/c/d.png', REAL_ASSETS)).toBeNull();
  });
});

describe('penyajian aset', () => {
  it('menyajikan berkas yang ada dengan jenis isi yang benar', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/assets/portrait/p_elysia_netral.png',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    // Berkas PNG selalu diawali delapan byte tanda tangan ini.
    expect(response.rawPayload.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('mengirim kepala cache publik', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/assets/background/bg_gedung_luar.png',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('public');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('mengembalikan 404 untuk aset yang belum ada', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/assets/portrait/p_belum_ada.png',
    });
    expect(response.statusCode).toBe(404);
  });

  it('menolak alamat yang mencoba keluar dari folder aset', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/assets/../../package.json',
    });
    // 400 dari pemeriksaan nama, atau 404 bila perutean menormalkan lebih dahulu.
    expect([400, 404]).toContain(response.statusCode);
  });
});

describe('manifest memuat alamat absolut', () => {
  it('mengembalikan URL yang dapat dimuat klien, bukan jalur relatif', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/worlds/w_bosku-mantan' });
    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      assetManifest: { cover: { uri: string }; backgrounds: { uri: string }[]; portraits: { uri: string }[] };
    };

    expect(body.assetManifest.cover.uri).toBe('https://api.test/assets/cover/a_cover_kantor.png');
    expect(body.assetManifest.backgrounds[0]?.uri).toMatch(/^https:\/\/api\.test\/assets\//);
    expect(body.assetManifest.portraits[0]?.uri).toMatch(/^https:\/\/api\.test\/assets\//);
  });

  it('menyajikan berkas yang dirujuk manifest itu', async () => {
    const detail = await app.inject({ method: 'GET', url: '/v1/worlds/w_bosku-mantan' });
    const body = detail.json() as { assetManifest: { portraits: { uri: string }[] } };

    const uri = body.assetManifest.portraits[0]?.uri ?? '';
    const path = uri.replace('https://api.test', '');

    const asset = await app.inject({ method: 'GET', url: path });
    expect(asset.statusCode).toBe(200);
  });
});
