/**
 * Pengujian integrasi HTTP.
 *
 * Menguji route, layanan, dan repository bersama-sama, karena yang penting bukan
 * setiap lapisan secara terpisah melainkan apakah aturannya masih berlaku setelah
 * disatukan. Misalnya: idempotensi hanya bermakna bila benar-benar terlihat
 * melalui endpoint.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseConfig, type AppConfig } from '../src/config';
import { CatalogRepository } from '../src/repositories/catalogRepository';
import { JourneyRepository } from '../src/repositories/journeyRepository';
import { OperationRepository } from '../src/repositories/operationRepository';
import { ReportRepository } from '../src/repositories/reportRepository';
import { UsageRepository } from '../src/repositories/usageRepository';
import { buildApp } from '../src/server';
import { JourneyService } from '../src/services/journeyService';
import { DeterministicStoryEngine } from '../src/services/storyEngine';

import { createTestDatabase, type TestDatabase } from './helpers/testDb';

let ctx: TestDatabase;
let app: FastifyInstance;

/** Operation id harus cukup panjang sesuai skema validasi. */
function operationId(label: string): string {
  return `op-test-${label}-${Math.random().toString(36).slice(2, 10)}`;
}

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

  return buildApp({ config, db: ctx.db, catalog, usage, reports, journeys: journeyService });
}

beforeEach(async () => {
  ctx = await createTestDatabase();
  app = await buildTestApp();
});

afterEach(async () => {
  await app.close();
  await ctx.close();
});

describe('kesehatan', () => {
  it('menjawab /health tanpa menyentuh database', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('menjawab /health/ready setelah database tersambung', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ready', database: 'ok' });
  });

  it('menyatakan mode simulator secara terbuka', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/meta' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      storyEngine: { simulator: true },
      identityMode: 'placeholder',
    });
  });
});

describe('katalog', () => {
  it('menyembunyikan dunia berstatus draf', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/worlds' });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { items: { status: string }[]; total: number };
    expect(body.total).toBe(4);
    expect(body.items.every((item) => item.status !== 'draft')).toBe(true);
  });

  it('mencari judul tanpa memperhatikan huruf besar-kecil', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/worlds?search=MANTAN' });
    const body = response.json() as { items: { worldId: string }[] };
    expect(body.items.map((item) => item.worldId)).toEqual(['w_bosku-mantan']);
  });

  it('menerapkan filter genre dengan semantik OR', async () => {
    const fantasy = await app.inject({ method: 'GET', url: '/v1/worlds?genres=fantasy' });
    expect((fantasy.json() as { items: unknown[] }).items).toHaveLength(1);

    const combined = await app.inject({ method: 'GET', url: '/v1/worlds?genres=fantasy,mystery' });
    expect((combined.json() as { total: number }).total).toBe(2);
  });

  it('mengabaikan genre yang tidak dikenal', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/worlds?genres=horor' });
    expect((response.json() as { total: number }).total).toBe(4);
  });

  it('mengembalikan hasil kosong tanpa gagal', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/worlds?search=tidakada' });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { items: unknown[] }).items).toEqual([]);
  });

  it('menyajikan detail dunia lengkap dengan karakter dan manifest', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/worlds/w_bosku-mantan' });
    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      worldVersion: number;
      characters: { npcId: string; traits: string[]; expressions: string[] }[];
      assetManifest: { backgrounds: unknown[]; portraits: unknown[] };
      genres: string[];
      supportedResponseLocales: string[];
    };

    expect(body.worldVersion).toBe(7);
    expect(body.characters.map((character) => character.npcId)).toEqual(['npc_elysia', 'npc_leo']);
    expect(body.characters[0]?.expressions).toContain('kesal');
    expect(body.assetManifest.backgrounds).toHaveLength(3);
    expect(body.assetManifest.portraits).toHaveLength(7);
    expect(body.genres).toEqual(['drama', 'office', 'romance']);
    expect(body.supportedResponseLocales).toEqual(['en-US', 'id-ID']);
  });

  it('mengembalikan 404 untuk dunia yang tidak ada', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/worlds/w_tidak-ada' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('pembuatan perjalanan', () => {
  const body = (label: string, worldId = 'w_bosku-mantan') => ({
    clientOperationId: operationId(label),
    worldId,
    persona: { name: 'Arfan', age: 24 },
    responseLocale: 'id-ID',
  });

  it('membuat perjalanan beserta giliran pembuka yang valid', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/journeys', payload: body('a') });
    expect(response.statusCode).toBe(201);

    const result = response.json() as {
      journeyId: string;
      worldVersion: number;
      opening: { beats: { event: { type: string } }[]; simulator: boolean };
    };

    expect(result.journeyId).toMatch(/^j_/);
    expect(result.worldVersion).toBe(7);
    expect(result.opening.beats.length).toBeGreaterThan(0);
    expect(result.opening.simulator).toBe(true);
  });

  it('bersifat idempotent untuk operation id yang sama (FR-52)', async () => {
    const payload = body('idem');
    const first = await app.inject({ method: 'POST', url: '/v1/journeys', payload });
    const second = await app.inject({ method: 'POST', url: '/v1/journeys', payload });

    expect(second.statusCode).toBe(201);
    const a = first.json() as { journeyId: string; opening: { turnId: string } };
    const b = second.json() as { journeyId: string; opening: { turnId: string } };
    expect(b.journeyId).toBe(a.journeyId);
    expect(b.opening.turnId).toBe(a.opening.turnId);
  });

  it('menolak perjalanan kedua pada dunia yang sama (D-12)', async () => {
    await app.inject({ method: 'POST', url: '/v1/journeys', payload: body('satu') });
    const second = await app.inject({ method: 'POST', url: '/v1/journeys', payload: body('dua') });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: 'CONFLICT' });
  });

  it('menolak dunia yang sudah diarsipkan (AC-04)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: body('arsip', 'w_arsip-lama'),
    });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: 'WORLD_RETIRED' });
  });

  it('menolak persona yang tidak sah', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: { ...body('bad'), persona: { name: '', age: 5 } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });
});

describe('sesi bermain', () => {
  async function createJourney(worldId = 'w_bosku-mantan'): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('sesi'),
        worldId,
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    return (response.json() as { journeyId: string }).journeyId;
  }

  it('mengirim baseline hubungan, bukan keadaan kanonik (anti bocor R-04)', async () => {
    const journeyId = await createJourney();

    const response = await app.inject({ method: 'GET', url: `/v1/journeys/${journeyId}/session` });
    expect(response.statusCode).toBe(200);

    const session = response.json() as {
      world: { worldId: string };
      relationsBaseline: { npcId: string; status: string }[];
      beats: unknown[];
    };

    expect(session.world.worldId).toBe('w_bosku-mantan');
    expect(session.relationsBaseline.map((entry) => entry.status)).toEqual(['normal', 'normal']);
    expect(session.beats.length).toBeGreaterThan(0);
  });

  it('mengembalikan 404 untuk perjalanan milik akun lain', async () => {
    const journeyId = await createJourney();

    const response = await app.inject({
      method: 'GET',
      url: `/v1/journeys/${journeyId}/session`,
      headers: { 'x-account-id': 'acc_orang-lain' },
    });

    // Sengaja NOT_FOUND, bukan FORBIDDEN: keberadaan perjalanan akun lain tidak
    // boleh terbaca dari kode kesalahan.
    expect(response.statusCode).toBe(404);
  });
});

describe('giliran dan hubungan', () => {
  async function playToDecision(): Promise<{ journeyId: string; decisionId: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('main'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });

    const opening = created.json() as {
      journeyId: string;
      opening: { beats: { event: { type: string; decisionId?: string } }[] };
    };

    const decision = opening.opening.beats.find(
      (beat) => beat.event.type === 'presentChoices',
    );
    return { journeyId: opening.journeyId, decisionId: decision?.event.decisionId ?? 'd001' };
  }

  it('menghasilkan teguran dan Waspada untuk aksi yang melewati batas (FR-16, AC-11)', async () => {
    const { journeyId, decisionId } = await playToDecision();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('kabedon'),
        decisionId,
        customText: '*aku mendekati Elysia dan mengkabedonnya*',
        responseLocale: 'id-ID',
      },
    });

    expect(response.statusCode).toBe(201);
    const envelope = response.json() as {
      beats: { event: { type: string; status?: string; reasonPublic?: string } }[];
    };

    const delta = envelope.beats.find((beat) => beat.event.type === 'relationshipDelta');
    expect(delta?.event.status).toBe('waspada');
    expect(delta?.event.reasonPublic).toBeTruthy();
  });

  it('menolak keputusan yang sudah dijawab', async () => {
    const { journeyId, decisionId } = await playToDecision();

    await app.inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('jawab-1'),
        decisionId,
        selection: { optionId: 'opt1' },
        responseLocale: 'id-ID',
      },
    });

    const again = await app.inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('jawab-2'),
        decisionId,
        selection: { optionId: 'opt1' },
        responseLocale: 'id-ID',
      },
    });

    expect(again.statusCode).toBe(409);
  });

  it('menolak pengiriman dengan pilihan dan teks sekaligus', async () => {
    const { journeyId, decisionId } = await playToDecision();

    const response = await app.inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('dua-duanya'),
        decisionId,
        selection: { optionId: 'opt1' },
        customText: 'sekaligus',
        responseLocale: 'id-ID',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('mencatat hubungan kanonik setelah beat ter-commit (AC-12)', async () => {
    const { journeyId, decisionId } = await playToDecision();

    await app.inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('kanonik'),
        decisionId,
        customText: '*aku mendekati Elysia dan mengkabedonnya*',
        responseLocale: 'id-ID',
      },
    });

    const detail = await app.inject({ method: 'GET', url: `/v1/journeys/${journeyId}` });
    const body = detail.json() as { relations: { npcId: string; status: string }[] };

    expect(body.relations.find((entry) => entry.npcId === 'npc_elysia')?.status).toBe('waspada');
  });
});

describe('daftar dan penghapusan perjalanan', () => {
  it('mengurutkan yang terakhir dimainkan lebih dahulu', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('urut-1'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    const firstId = (first.json() as { journeyId: string }).journeyId;

    await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('urut-2'),
        worldId: 'w_lentera-terakhir',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/v1/journeys/${firstId}/progress`,
      payload: { lastReadSequence: 5, lastReadBeatId: 'b', decisionCount: 1, hasUnreadBeats: false },
    });

    const list = await app.inject({ method: 'GET', url: '/v1/journeys' });
    const body = list.json() as { items: { journeyId: string }[] };
    expect(body.items[0]?.journeyId).toBe(firstId);
  });

  it('menghapus perjalanan dan mengosongkan daftar', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('hapus'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    const journeyId = (created.json() as { journeyId: string }).journeyId;

    const deleted = await app.inject({ method: 'DELETE', url: `/v1/journeys/${journeyId}` });
    expect(deleted.statusCode).toBe(204);

    const list = await app.inject({ method: 'GET', url: '/v1/journeys' });
    expect((list.json() as { items: unknown[] }).items).toHaveLength(0);
  });
});

describe('kuota', () => {
  it('melaporkan pemakaian sebagai angka pasti dari server', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/usage' });
    expect(response.statusCode).toBe(200);

    const usage = response.json() as {
      tier: string;
      spent: number;
      available: number;
      allowanceLimit: number;
      isEstimate: boolean;
      resetAt: string;
    };

    expect(usage.tier).toBe('free');
    expect(usage.allowanceLimit).toBe(100_000);
    expect(usage.available).toBe(100_000);
    // Angka dari server bukan perkiraan; perkiraan adalah istilah untuk sisi klien.
    expect(usage.isEstimate).toBe(false);
    expect(new Date(usage.resetAt).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('menaikkan pemakaian setelah giliran berhasil', async () => {
    const before = await app.inject({ method: 'GET', url: '/v1/usage' });
    const beforeSpent = (before.json() as { spent: number }).spent;

    const created = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('kuota'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    expect(created.statusCode).toBe(201);

    const after = await app.inject({ method: 'GET', url: '/v1/usage' });
    expect((after.json() as { spent: number }).spent).toBeGreaterThan(beforeSpent);
  });

  it('menolak giliran ketika kuota tidak mencukupi', async () => {
    // Kuota sangat kecil sehingga giliran pertama pun tidak muat.
    const tightApp = await buildTestApp(testConfig({ FREE_DAILY_TOKENS: '10' }));

    const response = await tightApp.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('sempit'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({ code: 'QUOTA_EXHAUSTED' });

    await tightApp.close();
  });
});

describe('laporan', () => {
  it('menyimpan laporan dan menandainya tersimpan di server', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/reports',
      payload: {
        clientOperationId: operationId('lapor'),
        category: 'character',
        detail: 'Leo bersikap tidak sesuai.',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ accepted: true, localOnly: false });
  });

  it('menolak kategori yang tidak dikenal', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/reports',
      payload: {
        clientOperationId: operationId('lapor-bad'),
        category: 'entah',
        detail: '',
      },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('bentuk kesalahan', () => {
  it('memakai bentuk yang sama untuk kesalahan dan rate limit', async () => {
    const notFoundResponse = await app.inject({ method: 'GET', url: '/v1/tidak-ada' });
    expect(notFoundResponse.statusCode).toBe(404);
    expect(notFoundResponse.json()).toMatchObject({ code: 'NOT_FOUND', retryable: false });
  });

  it('tidak membocorkan detail internal pada kesalahan tak terduga', async () => {
    const brokenApp = await buildTestApp();
    brokenApp.get('/v1/rusak', async () => {
      throw new Error('detail rahasia: tabel accounts, kredensial abc123');
    });

    const response = await brokenApp.inject({ method: 'GET', url: '/v1/rusak' });
    expect(response.statusCode).toBe(500);

    const body = response.body;
    expect(body).not.toContain('rahasia');
    expect(body).not.toContain('abc123');
    expect(body).not.toContain('accounts');

    await brokenApp.close();
  });
});
