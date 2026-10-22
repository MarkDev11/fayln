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

import { DEFAULT_RELATION_STATUSES } from '../src/contracts/types';

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
import {
  DeterministicStoryEngine,
  type StoryContext,
  type StoryEngine,
} from '../src/services/storyEngine';

import { createTestDatabase, type TestDatabase } from './helpers/testDb';
import { bearer, createTestAccount } from './helpers/auth';

let ctx: TestDatabase;
let app: FastifyInstance;

/**
 * Akun yang dipakai seluruh pengujian di berkas ini.
 *
 * Sejak identitas dibuktikan dengan token, setiap permintaan perlu akun yang
 * benar-benar terdaftar. Akun ini dibuat sekali per pengujian, dan tokennya
 * dipasang sebagai header bawaan pada `inject`.
 */
let auth: { accountId: string; token: string; email: string };

/** Membungkus `app.inject` agar setiap permintaan membawa token akun uji. */
function inject(
  options: Parameters<FastifyInstance['inject']>[0],
): ReturnType<FastifyInstance['inject']> {
  const withAuth = options as { headers?: Record<string, string> };
  return app.inject({
    ...options,
    headers: { ...bearer(auth.token), ...(withAuth.headers ?? {}) },
  });
}

/** Operation id harus cukup panjang sesuai skema validasi. */
function operationId(label: string): string {
  return `op-test-${label}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Membuat akun uji lalu MENGKLAIM poin hariannya.
 *
 * docs/17: tanpa klaim, saldo hari itu nol dan setiap giliran dijawab 402.
 * Klaim di sini adalah bagian dari persiapan akun — sama seperti login — bukan
 * pelonggaran aturan. Perilaku "belum klaim ditolak" diuji tersendiri di blok
 * kuota, memakai akun yang sengaja TIDAK melewati helper ini.
 *
 * Helper ini ada karena hook bersarang pernah membuat akun baru tanpa klaim,
 * dan akibatnya delapan uji jatuh dengan 402 yang tidak ada hubungannya dengan
 * yang sedang diuji.
 */
async function createClaimedAccount(
  target: FastifyInstance = app,
  options: { email?: string } = {},
): Promise<{ accountId: string; token: string; email: string }> {
  const akun = await createTestAccount(target, ctx.db, options);
  auth = akun;

  const klaim = await target.inject({
    method: 'POST',
    url: '/v1/usage/claim',
    headers: bearer(akun.token),
  });
  if (klaim.statusCode !== 201) {
    throw new Error(`klaim harian gagal disiapkan: HTTP ${String(klaim.statusCode)}`);
  }

  return akun;
}

function testConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): AppConfig {
  return parseConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused',
    PORT: '8080',
    LOG_LEVEL: 'error',
    RUN_MIGRATIONS_ON_START: 'false',
    RATE_LIMIT_MAX: '1000',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

async function buildTestApp(
  config: AppConfig = testConfig(),
  engine: StoryEngine = new DeterministicStoryEngine(),
  resolveAssetUri: (path: string) => string = (path) => path,
): Promise<FastifyInstance> {
  const usage = new UsageRepository(ctx.db, config.points);
  const catalog = new CatalogRepository(ctx.db, resolveAssetUri);
  const journeys = new JourneyRepository(ctx.db, resolveAssetUri);
  const operations = new OperationRepository(ctx.db);
  const reports = new ReportRepository(ctx.db);

  const journeyService = new JourneyService({
    catalog,
    journeys,
    operations,
    usage,
    engine,
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

beforeEach(async () => {
  ctx = await createTestDatabase();
  app = await buildTestApp();
  await createClaimedAccount();
});

afterEach(async () => {
  await app.close();
  await ctx.close();
});

describe('kesehatan', () => {
  it('menjawab /health tanpa menyentuh database', async () => {
    const response = await inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('menjawab /health/ready setelah database tersambung', async () => {
    const response = await inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ready', database: 'ok' });
  });

  it('menyatakan mode identitas dan simulator secara terbuka', async () => {
    const response = await inject({ method: 'GET', url: '/v1/meta' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      storyEngine: { simulator: true },
      /*
       * Berubah dari 'placeholder' menjadi 'authenticated' pada 9 Oktober 2026.
       * Nilai ini memang dimaksudkan terbaca publik: klien memakainya untuk tahu
       * apakah identitas masih berupa klaim (dan karena itu tidak aman) atau
       * sudah dibuktikan.
       */
      identityMode: 'authenticated',
    });
  });
});

describe('katalog', () => {
  it('menyembunyikan dunia berstatus draf', async () => {
    const response = await inject({ method: 'GET', url: '/v1/worlds' });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { items: { status: string }[]; total: number };
    expect(body.total).toBe(4);
    expect(body.items.every((item) => item.status !== 'draft')).toBe(true);
  });

  it('mencari judul tanpa memperhatikan huruf besar-kecil', async () => {
    const response = await inject({ method: 'GET', url: '/v1/worlds?search=MANTAN' });
    const body = response.json() as { items: { worldId: string }[] };
    expect(body.items.map((item) => item.worldId)).toEqual(['w_bosku-mantan']);
  });

  it('menerapkan filter genre dengan semantik OR', async () => {
    const fantasy = await inject({ method: 'GET', url: '/v1/worlds?genres=fantasy' });
    expect((fantasy.json() as { items: unknown[] }).items).toHaveLength(1);

    const combined = await inject({ method: 'GET', url: '/v1/worlds?genres=fantasy,mystery' });
    expect((combined.json() as { total: number }).total).toBe(2);
  });

  /**
   * Perilaku ini BERUBAH dengan sengaja.
   *
   * Dulu saringan terhadap daftar tetap membuat genre tak dikenal dibuang, dan
   * permintaannya mengembalikan SELURUH katalog. Itu jawaban yang menyesatkan:
   * pemain memilih saringan lalu melihat katalog tanpa saringan, tanpa tanda
   * apa pun bahwa saringannya tidak dipakai.
   *
   * Sekarang genre yang tidak ada menghasilkan daftar kosong — jawaban yang
   * jujur ("tidak ada cerita bergenre itu"). Cacat lama yang ikut hilang: genre
   * yang baru dibuat admin dulu ikut dibuang di sini, sehingga dunianya
   * tersimpan tanpa genre tanpa satu pun pesan galat.
   */
  it('mengembalikan hasil kosong untuk genre yang tidak ada, bukan seluruh katalog', async () => {
    const response = await inject({ method: 'GET', url: '/v1/worlds?genres=horor' });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { total: number }).total).toBe(0);
  });

  it('menyaring dengan genre yang dibuat admin, bukan hanya genre bawaan', async () => {
    await ctx.db.query(
      `INSERT INTO genres (genre_id, label_id, label_en, position, active)
       VALUES ('slice_of_life', 'Keseharian', 'Slice of Life', 90, true)`,
    );
    // Versi diambil dari basis data, bukan ditulis di sini: nomor versi seed
    // berubah setiap kali migrasi menambah versi baru, dan uji yang menulisnya
    // tetap akan lulus sampai tiba-tiba tidak — tanpa hubungan dengan genre.
    await ctx.db.query(
      `INSERT INTO world_genres (world_id, world_version, genre)
       SELECT 'w_bosku-mantan', MAX(world_version), 'slice_of_life'
       FROM world_versions WHERE world_id = 'w_bosku-mantan'`,
    );

    const response = await inject({ method: 'GET', url: '/v1/worlds?genres=slice_of_life' });
    expect(response.statusCode).toBe(200);
    expect(
      (response.json() as { items: { worldId: string }[] }).items.map((item) => item.worldId),
    ).toEqual(['w_bosku-mantan']);
  });

  it('mengembalikan hasil kosong tanpa gagal', async () => {
    const response = await inject({ method: 'GET', url: '/v1/worlds?search=tidakada' });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { items: unknown[] }).items).toEqual([]);
  });

  it('menyajikan detail dunia lengkap dengan karakter dan manifest', async () => {
    const response = await inject({ method: 'GET', url: '/v1/worlds/w_bosku-mantan' });
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
    const response = await inject({ method: 'GET', url: '/v1/worlds/w_tidak-ada' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('rail beranda', () => {
  describe('Top 10 Minggu Ini', () => {
    it('mengurutkan menurut jumlah perjalanan minggu ini, menurun', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/top' });
      expect(response.statusCode).toBe(200);

      const body = response.json() as {
        items: { worldId: string; rank: number; startCount: number }[];
        windowDays: number;
      };

      // Data contoh (005_seed_top_weekly.sql): bosku 4, lentera 2, rapat 1.
      expect(body.windowDays).toBe(7);
      expect(body.items.map((item) => item.worldId)).toEqual([
        'w_bosku-mantan',
        'w_lentera-terakhir',
        'w_rapat-tengah-malam',
      ]);
      expect(body.items.map((item) => item.startCount)).toEqual([4, 2, 1]);
      expect(body.items.map((item) => item.rank)).toEqual([1, 2, 3]);
    });

    it('mengabaikan perjalanan yang lebih tua dari jendela mingguan', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/top' });
      const body = response.json() as { items: { worldId: string; rank: number }[] };

      // w_rapat-tengah-malam punya 2 perjalanan berumur 20 dan 45 hari. Bila
      // saringan waktu hilang, jumlahnya menjadi 3 dan ia naik ke peringkat 1.
      // Uji ini memastikan hal itu tidak terjadi.
      const rapat = body.items.find((item) => item.worldId === 'w_rapat-tengah-malam');
      expect(rapat?.rank).toBe(3);
    });

    it('tidak memasukkan dunia yang diarsipkan', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/top' });
      const body = response.json() as { items: { worldId: string; status: string }[] };

      expect(body.items.every((item) => item.status === 'published')).toBe(true);
      expect(body.items.some((item) => item.worldId === 'w_arsip-lama')).toBe(false);
    });

    it('menghormati batas limit dan menolak nilai di luar rentang', async () => {
      const limited = await inject({ method: 'GET', url: '/v1/worlds/top?limit=2' });
      expect((limited.json() as { items: unknown[] }).items).toHaveLength(2);

      const tooBig = await inject({ method: 'GET', url: '/v1/worlds/top?limit=500' });
      expect(tooBig.statusCode).toBe(400);
    });

    it('memperlakukan "top" sebagai rute sendiri, bukan sebagai ID dunia', async () => {
      // Bila rute statis kalah oleh /v1/worlds/:worldId, permintaan ini akan
      // menjawab 404 "Cerita tidak ditemukan" alih-alih daftar peringkat.
      const response = await inject({ method: 'GET', url: '/v1/worlds/top' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('items');
    });
  });

  describe('Terbaru Dirilis', () => {
    it('mengembalikan dunia terbit, diurutkan menurut tanggal terbit menurun', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/new' });
      expect(response.statusCode).toBe(200);

      const body = response.json() as { items: { worldId: string; publishedAt: string }[] };
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((item) => item.publishedAt.length > 0)).toBe(true);

      const dates = body.items.map((item) => item.publishedAt);
      const sorted = [...dates].sort().reverse();
      expect(dates).toEqual(sorted);
    });

    it('tidak menawarkan dunia yang diarsipkan', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/new' });
      const body = response.json() as { items: { worldId: string }[] };
      expect(body.items.some((item) => item.worldId === 'w_arsip-lama')).toBe(false);
    });
  });

  describe('Baru Diperbarui', () => {
    it('mengurutkan menurut waktu revisi terakhir, bukan tanggal terbit', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/updated' });
      expect(response.statusCode).toBe(200);

      const body = response.json() as { items: { worldId: string; updatedAt: string }[] };
      expect(body.items.length).toBeGreaterThan(0);

      const dates = body.items.map((item) => item.updatedAt);
      const sorted = [...dates].sort().reverse();
      expect(dates).toEqual(sorted);
    });

    /*
     * Penjaga regresi untuk cacat yang sebenarnya: rail ini pernah diturunkan
     * dari katalog dan memakai `published_at`, sehingga isinya kembar dengan
     * "Terbaru Dirilis" — nama berbeda, isi sama. Data contoh sengaja disusun
     * (migrasi 006) supaya urutan keduanya BERBEDA; kalau suatu saat keduanya
     * kembali sama, uji ini gagal.
     */
    it('menghasilkan urutan yang berbeda dari Terbaru Dirilis', async () => {
      const updated = await inject({ method: 'GET', url: '/v1/worlds/updated' });
      const fresh = await inject({ method: 'GET', url: '/v1/worlds/new' });

      const orderOf = (response: { json: () => { items: { worldId: string }[] } }): string[] =>
        response.json().items.map((item) => item.worldId);

      expect(orderOf(updated)).not.toEqual(orderOf(fresh));
    });

    it('menempatkan dunia yang terbit lama tetapi baru direvisi di puncak', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/updated' });
      const body = response.json() as { items: { worldId: string }[] };

      // Migrasi 006: terbit 90 hari lalu, direvisi 2 hari lalu.
      expect(body.items[0]?.worldId).toBe('w_bosku-mantan');
    });

    it('membedakan updatedAt dari publishedAt', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/updated' });
      const body = response.json() as {
        items: { worldId: string; updatedAt: string; publishedAt: string }[];
      };

      const bosku = body.items.find((item) => item.worldId === 'w_bosku-mantan');
      expect(bosku).toBeDefined();
      // Dua makna berbeda: kapan terbit versus kapan terakhir disunting.
      expect(bosku!.updatedAt).not.toBe(bosku!.publishedAt);
    });

    it('tidak menawarkan dunia yang diarsipkan', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/updated' });
      const body = response.json() as { items: { worldId: string }[] };
      expect(body.items.some((item) => item.worldId === 'w_arsip-lama')).toBe(false);
    });

    it('menolak batas yang di luar jangkauan', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/updated?limit=500' });
      expect(response.statusCode).toBe(400);
    });

    it('tidak direbut oleh rute dunia berbasis id', async () => {
      const response = await inject({ method: 'GET', url: '/v1/worlds/updated' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('items');
    });
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
    const response = await inject({ method: 'POST', url: '/v1/journeys', payload: body('a') });
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

  /**
   * Regresi produksi: perangkat baru mengirim ID buatannya sendiri, dan baris
   * `accounts`-nya belum ada. Sebelum perbaikan, pembuatan perjalanan pertama
   * gagal di kunci asing `operations_account_fk` dan muncul sebagai HTTP 500 —
   * tepat pada langkah pertama setiap pengguna baru.
   *
   * Pengujian lain tidak menangkap ini karena semuanya memakai akun demo yang
   * sudah dibuat oleh migrasi seed.
   */
  it('MENOLAK permintaan tanpa token, bukan memakai akun demo', async () => {
    /*
     * Perilaku lama: permintaan tanpa header apa pun menjadi `acc_demo`, sehingga
     * pemain yang belum masuk melihat perjalanan akun demo dan mengira itu
     * ceritanya sendiri. Sekarang harus ditolak.
     */
    const response = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: body('tanpa-token'),
    });

    expect(response.statusCode).toBe(401);
    expect((response.json() as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('MENOLAK header x-account-id sebagai identitas', async () => {
    /*
     * Inti perbaikan keamanan. Sebelumnya header ini cukup untuk menjadi akun
     * mana pun — terbukti terhadap produksi: satu permintaan dengan id akun orang
     * lain mengembalikan seluruh perjalanannya.
     */
    const response = await app.inject({
      method: 'GET',
      url: '/v1/journeys',
      headers: { 'x-account-id': auth.accountId },
    });

    expect(response.statusCode).toBe(401);
  });

  it('MENOLAK token yang tidak dikenal', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/journeys',
      headers: bearer('token-yang-dikarang'),
    });

    expect(response.statusCode).toBe(401);
  });

  /**
   * Regresi produksi kedua: `beats.beat_id` adalah kunci utama tabel, tetapi ID
   * beat semula diturunkan hanya dari nomor turn. Pembukaan setiap perjalanan
   * menghasilkan `t001-b001` yang sama, sehingga perjalanan KEDUA selalu gagal
   * dengan `duplicate key value violates unique constraint "beats_pkey"`.
   *
   * Bug ini semula tersembunyi di balik galat kunci asing `accounts`, jadi baru
   * terlihat setelah perbaikan sebelumnya masuk. Sekarang diuji langsung.
   */
  it('mengizinkan perjalanan pada dunia berbeda tanpa tabrakan ID beat', async () => {
    const first = await inject({ method: 'POST', url: '/v1/journeys', payload: body('dua-a') });
    expect(first.statusCode).toBe(201);

    // Dunia berbeda supaya aturan "satu perjalanan aktif per dunia" (D-12) tidak
    // menutupi masalahnya dengan balasan 409.
    const second = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: body('dua-b', 'w_lentera-terakhir'),
    });
    expect(second.statusCode).toBe(201);

    const a = first.json() as { journeyId: string };
    const b = second.json() as { journeyId: string };
    expect(b.journeyId).not.toBe(a.journeyId);

    // Tidak ada satu pun beat_id yang terpakai dua kali. Dihitung di sisi Node
    // supaya tidak bergantung pada GROUP BY ... HAVING yang tidak didukung
    // mesin database in-memory yang dipakai pengujian.
    const { rows } = await ctx.db.query<{ beat_id: string }>('SELECT beat_id FROM beats');
    const seen = new Set<string>();
    const duplicates = rows.filter((row) => {
      if (seen.has(row.beat_id)) {
        return true;
      }
      seen.add(row.beat_id);
      return false;
    });
    expect(duplicates).toHaveLength(0);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('bersifat idempotent untuk operation id yang sama (FR-52)', async () => {
    const payload = body('idem');
    const first = await inject({ method: 'POST', url: '/v1/journeys', payload });
    const second = await inject({ method: 'POST', url: '/v1/journeys', payload });

    expect(second.statusCode).toBe(201);
    const a = first.json() as { journeyId: string; opening: { turnId: string } };
    const b = second.json() as { journeyId: string; opening: { turnId: string } };
    expect(b.journeyId).toBe(a.journeyId);
    expect(b.opening.turnId).toBe(a.opening.turnId);
  });

  it('menolak perjalanan kedua pada dunia yang sama (D-12)', async () => {
    await inject({ method: 'POST', url: '/v1/journeys', payload: body('satu') });
    const second = await inject({ method: 'POST', url: '/v1/journeys', payload: body('dua') });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: 'CONFLICT' });
  });

  it('menolak dunia yang sudah diarsipkan (AC-04)', async () => {
    const response = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: body('arsip', 'w_arsip-lama'),
    });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: 'WORLD_RETIRED' });
  });

  it('menolak persona yang tidak sah', async () => {
    const response = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: { ...body('bad'), persona: { name: '', age: 5 } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION' });
  });
});

/**
 * Sampul pada DTO perjalanan.
 *
 * BUKTI MERAH: sebelum `coverUri` ditambahkan, `/v1/journeys` dan
 * `/v1/journeys/:id` hanya mengirim `coverAssetId` (`a_cover_kantor`). Hapus
 * kedua baris `coverUri:` di `journeyRepository.ts`, lalu kedua uji di bawah
 * memerah dengan `expected undefined to be ...`.
 *
 * Mengapa ini penting sampai diuji: `assetUri()` di frontend hanya memuat URL
 * absolut. Nilai `a_cover_kantor` diberi awalan `asset://` dan menjadi
 * placeholder — daftar Perjalanan tampak "tidak punya gambar" TANPA galat apa
 * pun. Katalog dunia sudah benar sejak awal; perjalanan tertinggal.
 */
/**
 * Regresi: PILIHAN PEMAIN tidak pernah sampai ke mesin cerita.
 *
 * Gejala yang dilaporkan pemilik produk: "aku melakukan pilihan malah looping
 * ke narasi awal" — pertanyaan, latar, dan kalimatnya berulang persis.
 *
 * Akarnya satu kata. Mesin cerita menentukan apakah prompt berbunyi
 * "Lanjutkan cerita dari tindakan itu" atau "Tulis ADEGAN PEMBUKA" dari
 * `aksiPemain(context)`:
 *
 *     if (context.customText)  return context.customText;
 *     if (context.optionLabel) return context.optionLabel;   // <-- dibaca
 *     return null;                                            // <-- selalu ini
 *
 * `submitTurn` hanya mengirim `optionId`, sedangkan yang dibaca `optionLabel`.
 * Jadi pemain yang MEMILIH OPSI selalu menghasilkan `null`, prompt jatuh ke
 * cabang "Tulis ADEGAN PEMBUKA", dan model menulis ulang pembuka setiap giliran.
 * Pilihan pemain tidak pernah diketahui model.
 *
 * BUKTI MERAH: hapus baris `...(opsiTerpilih ? { optionLabel: ... })` di
 * `journeyService.ts`, lalu kedua uji ini memerah — `optionLabel` menjadi
 * `undefined` dan `recentBeats` menjadi `[]`.
 *
 * Mengapa mesin deterministik tidak menangkapnya: ia memakai `optionId` lewat
 * fungsi lokalnya sendiri (`optionLabel(context.optionId)`), sehingga perilakunya
 * benar meski konteksnya cacat. Hanya mesin berbasis model yang membaca
 * `context.optionLabel`. Karena itu yang diperiksa di sini adalah KONTEKS yang
 * dikirim, bukan keluaran ceritanya.
 */
describe('pilihan pemain sampai ke mesin cerita', () => {
  /** Mesin yang merekam setiap konteks yang diterimanya. */
  class MesinPerekam extends DeterministicStoryEngine {
    readonly konteks: StoryContext[] = [];

    override async generateTurn(context: StoryContext) {
      this.konteks.push(context);
      return super.generateTurn(context);
    }
  }

  let mesin: MesinPerekam;

  beforeEach(async () => {
    await app.close();
    mesin = new MesinPerekam();
    app = await buildTestApp(testConfig(), mesin);
    await createClaimedAccount();
  });

  /** Membuat perjalanan dan mengembalikan keputusan pembukanya. */
  async function playToDecision() {
    const created = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('konteks'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });

    const hasil = created.json() as {
      journeyId: string;
      opening: {
        beats: {
          event: {
            type: string;
            decisionId?: string;
            prompt?: string;
            options?: { optionId: string; label: string }[];
          };
        }[];
      };
    };

    const beat = hasil.opening.beats.find((b) => b.event.type === 'presentChoices');
    return { journeyId: hasil.journeyId, keputusan: beat?.event };
  }

  it('mengirim LABEL opsi yang dipilih, bukan hanya id-nya', async () => {
    const { journeyId, keputusan } = await playToDecision();
    const opsi = keputusan?.options?.[0];
    expect(opsi?.label).toBeTruthy();

    const response = await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('label'),
        decisionId: keputusan?.decisionId,
        selection: { optionId: opsi?.optionId },
        responseLocale: 'id-ID',
      },
    });
    expect(response.statusCode).toBe(201);

    expect(mesin.konteks).toHaveLength(1);
    expect(mesin.konteks[0]?.optionLabel).toBe(opsi?.label);
    // Tanpa label, mesin menganggap ini adegan pembuka dan menulis ulang pembuka.
    expect(mesin.konteks[0]?.optionLabel).not.toBeUndefined();
  });

  it('mengirim recentBeats supaya cerita punya kesinambungan', async () => {
    const { journeyId, keputusan } = await playToDecision();

    await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('riwayat'),
        decisionId: keputusan?.decisionId,
        selection: { optionId: keputusan?.options?.[1]?.optionId },
        responseLocale: 'id-ID',
      },
    });

    const konteks = mesin.konteks[0];
    expect(konteks?.recentBeats).toBeDefined();
    expect((konteks?.recentBeats ?? []).length).toBeGreaterThan(0);
    // Isinya kalimat nyata, bukan daftar kosong.
    expect((konteks?.recentBeats ?? []).join(' ').length).toBeGreaterThan(20);
  });

  it('aksi teks bebas tetap memakai customText, bukan label', async () => {
    const { journeyId, keputusan } = await playToDecision();

    await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('bebas'),
        decisionId: keputusan?.decisionId,
        customText: 'aku duduk diam dan memperhatikan',
        responseLocale: 'id-ID',
      },
    });

    expect(mesin.konteks[0]?.customText).toBe('aku duduk diam dan memperhatikan');
  });

  it('melanjutkan sesi turn demi turn dan memakai masukan terbaru, bukan mengulang pilihan lama', async () => {
    const { journeyId, keputusan } = await playToDecision();
    const initialResponse = await inject({
      method: 'GET',
      url: `/v1/journeys/${journeyId}/session`,
    });
    expect(initialResponse.statusCode).toBe(200);

    type ApiBeat = {
      beatId: string;
      turnId: string;
      sequence: number;
      event: {
        type: string;
        decisionId?: string;
        options?: { optionId: string; label: string }[];
        inputKind?: 'choice' | 'custom';
        text?: string;
      };
    };
    type TurnResponse = {
      turnId: string;
      simulator: boolean;
      modelId: string;
      beats: ApiBeat[];
    };
    const initial = initialResponse.json() as { beats: ApiBeat[]; simulator: boolean };
    const openingCount = initial.beats.length;
    const openingTurnIds = new Set(initial.beats.map((beat) => beat.turnId));
    const firstOption = keputusan?.options?.[1];
    expect(firstOption).toBeDefined();
    if (!firstOption || !keputusan) {
      throw new Error('Keputusan pembuka harus menyediakan opsi kedua.');
    }

    const firstResponse = await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('lanjut-1'),
        decisionId: keputusan.decisionId,
        selection: { optionId: firstOption.optionId },
        responseLocale: 'id-ID',
      },
    });
    expect(firstResponse.statusCode).toBe(201);
    const firstTurn = firstResponse.json() as TurnResponse;
    expect(firstTurn.simulator).toBe(true);
    expect(firstTurn.modelId).toBe('simulator/deterministic-v1');
    expect(new Set(firstTurn.beats.map((beat) => beat.turnId))).toEqual(new Set([firstTurn.turnId]));
    expect(firstTurn.beats.map((beat) => beat.sequence)).toEqual(
      firstTurn.beats.map((_, index) => index + 1),
    );
    const firstPlayerInput = firstTurn.beats.find((beat) => beat.event.type === 'playerInput');
    const firstAiResponse = firstTurn.beats.find(
      (beat) => beat.event.type === 'narrate' || beat.event.type === 'say',
    );
    expect(firstPlayerInput).toBeDefined();
    expect(firstAiResponse).toBeDefined();
    expect(firstPlayerInput?.event.inputKind).toBe('choice');
    expect(firstPlayerInput?.event.text).toBe(firstOption.label);
    expect(firstPlayerInput?.sequence).toBe(1);
    if (firstPlayerInput && firstAiResponse) {
      expect(firstTurn.beats.indexOf(firstPlayerInput)).toBeLessThan(
        firstTurn.beats.indexOf(firstAiResponse),
      );
    }

    // Posisi baca yang tersimpan menandai pembuka sudah dibaca, sedangkan beat
    // turn terbaru masih belum dibaca. Inilah cursor yang Continue Journey pakai.
    const lastOpeningBeat = initial.beats.at(-1);
    expect(lastOpeningBeat).toBeDefined();
    const progressResponse = await inject({
      method: 'PUT',
      url: `/v1/journeys/${journeyId}/progress`,
      payload: {
        lastReadSequence: openingCount,
        lastReadBeatId: lastOpeningBeat?.beatId ?? '',
        decisionCount: 1,
        hasUnreadBeats: true,
      },
    });
    expect(progressResponse.statusCode).toBe(204);
    const savedDetailResponse = await inject({
      method: 'GET',
      url: `/v1/journeys/${journeyId}`,
    });
    expect((savedDetailResponse.json() as { lastReadSequence: number }).lastReadSequence).toBe(
      openingCount,
    );

    const reopenedAfterFirst = await inject({

      method: 'GET',
      url: `/v1/journeys/${journeyId}/session`,
    });
    const sessionAfterFirst = reopenedAfterFirst.json() as {
      beats: ApiBeat[];
      simulator: boolean;
    };
    expect(sessionAfterFirst.simulator).toBe(true);
    expect(sessionAfterFirst.beats.map((beat) => beat.beatId)).toEqual([
      ...initial.beats.map((beat) => beat.beatId),
      ...firstTurn.beats.map((beat) => beat.beatId),
    ]);
    expect(new Set(sessionAfterFirst.beats.map((beat) => beat.beatId)).size).toBe(
      sessionAfterFirst.beats.length,
    );
    expect(
      sessionAfterFirst.beats.find((beat) => beat.beatId === firstPlayerInput?.beatId)?.event.text,
    ).toBe(firstOption.label);

    const decisionAfterFirst = [...sessionAfterFirst.beats]
      .reverse()
      .find((beat) => beat.event.type === 'presentChoices');
    expect(decisionAfterFirst?.turnId).toBe(firstTurn.turnId);
    expect(decisionAfterFirst?.event.decisionId).toBe('d002');
    expect(decisionAfterFirst?.event.options?.length).toBeGreaterThan(0);
    const secondOption = decisionAfterFirst?.event.options?.[2];
    expect(secondOption).toBeDefined();
    if (!decisionAfterFirst?.event.decisionId || !secondOption) {
      throw new Error('Sesi yang dibuka kembali harus memuat keputusan turn terbaru.');
    }

    const secondResponse = await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('lanjut-2'),
        decisionId: decisionAfterFirst.event.decisionId,
        selection: { optionId: secondOption.optionId },
        responseLocale: 'id-ID',
      },
    });
    expect(secondResponse.statusCode).toBe(201);
    const secondTurn = secondResponse.json() as TurnResponse;
    expect(secondTurn.simulator).toBe(true);
    const secondPlayerInput = secondTurn.beats.find((beat) => beat.event.type === 'playerInput');
    const secondAiResponse = secondTurn.beats.find(
      (beat) => beat.event.type === 'narrate' || beat.event.type === 'say',
    );
    expect(secondPlayerInput?.event.inputKind).toBe('choice');
    expect(secondPlayerInput?.event.text).toBe(secondOption.label);
    expect(secondPlayerInput?.sequence).toBe(1);
    expect(secondPlayerInput?.beatId).not.toBe(firstPlayerInput?.beatId);
    expect(secondAiResponse).toBeDefined();
    if (secondPlayerInput && secondAiResponse) {
      expect(secondTurn.beats.indexOf(secondPlayerInput)).toBeLessThan(
        secondTurn.beats.indexOf(secondAiResponse),
      );
    }

    // Konteks mesin untuk turn kedua wajib memuat pilihan layar kedua, sementara
    // narasi turn pertama tetap hanya menjadi riwayat, bukan intent yang dipakai ulang.
    expect(mesin.konteks).toHaveLength(2);
    expect(mesin.konteks[0]?.optionId).toBe(firstOption.optionId);
    expect(mesin.konteks[0]?.optionLabel).toBe(firstOption.label);
    expect(mesin.konteks[1]?.optionId).toBe(secondOption.optionId);
    expect(mesin.konteks[1]?.optionLabel).toBe(secondOption.label);
    expect(mesin.konteks[1]?.optionLabel).not.toBe(mesin.konteks[0]?.optionLabel);
    expect(mesin.konteks[1]?.customText).toBeUndefined();
    expect((mesin.konteks[1]?.recentBeats ?? []).join(' ')).toContain(firstOption.label);

    const reopenedAfterSecond = await inject({
      method: 'GET',
      url: `/v1/journeys/${journeyId}/session`,
    });
    const sessionAfterSecond = reopenedAfterSecond.json() as { beats: ApiBeat[] };
    const decisionAfterSecond = [...sessionAfterSecond.beats]
      .reverse()
      .find((beat) => beat.event.type === 'presentChoices');
    expect(decisionAfterSecond?.turnId).toBe(secondTurn.turnId);
    expect(decisionAfterSecond?.event.decisionId).toBeTruthy();
    expect(decisionAfterSecond?.event.decisionId).not.toBe(decisionAfterFirst.event.decisionId);
    if (!decisionAfterSecond?.event.decisionId) {
      throw new Error('Turn kedua harus menyajikan keputusan berikutnya.');
    }

    const customText = 'aku meminta jadwal onboarding yang jelas untuk hari ini';
    const customResponse = await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('lanjut-custom'),
        decisionId: decisionAfterSecond.event.decisionId,
        customText,
        responseLocale: 'id-ID',
      },
    });
    expect(customResponse.statusCode).toBe(201);
    const customTurn = customResponse.json() as TurnResponse;
    expect(customTurn.simulator).toBe(true);
    const customPlayerInput = customTurn.beats.find((beat) => beat.event.type === 'playerInput');
    const customAiResponse = customTurn.beats.find(
      (beat) => beat.event.type === 'narrate' || beat.event.type === 'say',
    );
    expect(customPlayerInput).toBeDefined();
    expect(customPlayerInput?.event.inputKind).toBe('custom');
    expect(customPlayerInput?.event.text).toBe(customText);
    expect(customPlayerInput?.sequence).toBe(1);
    expect(customAiResponse).toBeDefined();
    if (customPlayerInput && customAiResponse) {
      expect(customTurn.beats.indexOf(customPlayerInput)).toBeLessThan(
        customTurn.beats.indexOf(customAiResponse),
      );
    }
    expect(mesin.konteks).toHaveLength(3);
    expect(mesin.konteks[2]?.customText).toBe(customText);
    expect(mesin.konteks[2]?.optionId).toBeUndefined();
    expect(mesin.konteks[2]?.optionLabel).toBeUndefined();

    const finalSessionResponse = await inject({
      method: 'GET',
      url: `/v1/journeys/${journeyId}/session`,
    });
    const finalSession = finalSessionResponse.json() as {
      beats: ApiBeat[];
      simulator: boolean;
    };
    expect(finalSession.simulator).toBe(true);
    expect(finalSession.beats.map((beat) => beat.beatId)).toEqual([
      ...initial.beats.map((beat) => beat.beatId),
      ...firstTurn.beats.map((beat) => beat.beatId),
      ...secondTurn.beats.map((beat) => beat.beatId),
      ...customTurn.beats.map((beat) => beat.beatId),
    ]);
    expect(new Set(finalSession.beats.map((beat) => beat.beatId)).size).toBe(
      finalSession.beats.length,
    );
    const persistedInputs = finalSession.beats.filter((beat) => beat.event.type === 'playerInput');
    expect(persistedInputs.map((beat) => beat.event)).toEqual([
      { type: 'playerInput', inputKind: 'choice', text: firstOption.label },
      { type: 'playerInput', inputKind: 'choice', text: secondOption.label },
      { type: 'playerInput', inputKind: 'custom', text: customText },
    ]);
    for (const inputBeat of persistedInputs) {
      const responseBeat = finalSession.beats.find(
        (beat) =>
          beat.turnId === inputBeat.turnId &&
          (beat.event.type === 'narrate' || beat.event.type === 'say'),
      );
      expect(responseBeat).toBeDefined();
      if (responseBeat) {
        expect(inputBeat.sequence).toBeLessThan(responseBeat.sequence);
      }
    }
    expect(finalSession.beats.slice(0, openingCount).every((beat) => openingTurnIds.has(beat.turnId))).toBe(
      true,
    );
  });

  /*
   * Bahasa pilihan pemain harus sampai ke mesin cerita.
   *
   * Sebelumnya bahasa DIPATOK di system prompt ("Write in Indonesian") dan tidak
   * ada jalur yang membawa pilihan pemain ke sana — opsi "English" di lembar
   * persona dan di Pengaturan tidak berpengaruh apa pun.
   *
   * BUKTI MERAH: hapus `responseLocale` di konteks `submitTurn`
   * (`journeyService.ts`), lalu uji pertama memerah.
   */
  it('meneruskan bahasa PERJALANAN ke mesin cerita', async () => {
    const created = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('locale'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'en-US',
      },
    });

    const hasil = created.json() as {
      journeyId: string;
      opening: { beats: { event: { type: string; decisionId?: string } }[] };
    };
    const beat = hasil.opening.beats.find((b) => b.event.type === 'presentChoices');

    await inject({
      method: 'POST',
      url: `/v1/journeys/${hasil.journeyId}/turns`,
      payload: {
        clientOperationId: operationId('locale-turn'),
        decisionId: beat?.event.decisionId,
        selection: { optionId: 'opt1' },
        // Klien boleh mengirim apa pun; yang dipakai adalah nilai PERJALANAN.
        responseLocale: 'id-ID',
      },
    });

    expect(mesin.konteks[0]?.responseLocale).toBe('en-US');
  });

  it('sesi membawa bahasa perjalanan', async () => {
    const created = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('locale-session'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'en-US',
      },
    });
    const journeyId = (created.json() as { journeyId: string }).journeyId;

    const sesi = await inject({ method: 'GET', url: `/v1/journeys/${journeyId}/session` });

    expect(sesi.statusCode).toBe(200);
    expect((sesi.json() as { responseLocale: string }).responseLocale).toBe('en-US');
  });
});

describe('sampul pada perjalanan', () => {
  const BASE = 'https://contoh.test';

  /*
   * Aplikasi dibangun ulang dengan resolver yang menghasilkan alamat lengkap,
   * supaya hasilnya dapat ditegaskan persis — bukan sekadar "ada isinya".
   */
  beforeEach(async () => {
    await app.close();
    app = await buildTestApp(testConfig(), new DeterministicStoryEngine(), (p) => `${BASE}${p}`);
    await createClaimedAccount();
  });

  const buat = () =>
    inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('cover'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });

  it('daftar Perjalanan mengirim coverUri yang SIAP DIMUAT', async () => {
    await buat();
    const response = await inject({ method: 'GET', url: '/v1/journeys' });

    const item = (response.json() as { items: { coverAssetId: string; coverUri: string }[] }).items[0];
    expect(item.coverAssetId).toBe('a_cover_kantor');
    // Inti perbaikannya: bukan ID mentah, melainkan alamat lengkap.
    expect(item.coverUri).toBe(`${BASE}/assets/cover/a_cover_kantor.png`);
  });

  it('detail perjalanan juga mengirim coverUri yang SIAP DIMUAT', async () => {
    const created = await buat();
    const journeyId = (created.json() as { journeyId: string }).journeyId;

    const response = await inject({ method: 'GET', url: `/v1/journeys/${journeyId}` });
    const detail = response.json() as { coverAssetId: string; coverUri: string };

    expect(detail.coverAssetId).toBe('a_cover_kantor');
    expect(detail.coverUri).toBe(`${BASE}/assets/cover/a_cover_kantor.png`);
  });
});

describe('sesi bermain', () => {
  async function createJourney(worldId = 'w_bosku-mantan'): Promise<string> {
    const response = await inject({
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

    const response = await inject({ method: 'GET', url: `/v1/journeys/${journeyId}/session` });
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

  /**
   * Regresi produksi: `GET /v1/journeys/:id/session` MENGKLAIM simulator.
   *
   * Bugnya bukan sekadar label yang salah. Yang dilaporkan pemain adalah "masih
   * terasa seperti templat" — dan sebagian sebabnya ada di sini: layar pemain
   * diberi tahu bahwa cerita di bawahnya berasal dari contoh bawaan, padahal
   * mesin AI sungguhan yang menulisnya. Klaim palsu itu datang dari satu kata
   * yang ditulis mati di repositori (`simulator: true`), lalu diteruskan apa
   * adanya oleh lapisan layanan ke perangkat.
   *
   * Bukti produksi saat perbaikan (9 Okt 2026):
   *
   *   CREATE  -> opening.simulator = false | modelId = ai-story
   *   SESSION -> simulator = true            <-- inilah yang bertentangan
   *
   * Pengujian ini memasang MESIN yang mengaku simulator, lalu memeriksa bahwa
   * jawabannya di kedua pintu masuk — giliran pembuka DAN sesi — sama. Sebelum
   * perbaikan, pintu pertama menjawab `true` dan pintu kedua menjawab `false`:
   * dua jawaban untuk satu pertanyaan yang sama.
   */
  it('menyatakan simulator dari MESIN, bukan dari konstanta (pembuka = sesi)', async () => {
    /*
     * Mesin palsu yang mengaku simulator. Yang diuji bukan apakah dirinya benar,
     * melainkan apakah pengakuannya SAMPAI ke klien lewat kedua rute. Dengan
     * mesin sungguhan keduanya kebetulan sama-sama `false`, sehingga nilai yang
     * ditulis mati pun akan lulus — karena itu mesinnya harus dibalik.
     *
     * Memakai SUBKELAS, bukan `{ ...new DeterministicStoryEngine() }`: mesin ini
     * menyimpan metodenya di prototipe, sehingga spread hanya menyalin bidang
     * (`isSimulator`, `estimatedTurnCost`) dan membuang `generateOpening` —
     * yang muncul sebagai HTTP 500, bukan sebagai kegagalan yang terbaca.
     */
    class MesinYangMengakuSimulator extends DeterministicStoryEngine {
      override readonly isSimulator = true;
    }
    app = await buildTestApp(testConfig(), new MesinYangMengakuSimulator());

    const created = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('mengaku'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    expect(created.statusCode).toBe(201);

    const { journeyId, opening } = created.json() as {
      journeyId: string;
      opening: { simulator: boolean };
    };
    expect(opening.simulator).toBe(true);

    const sessionResponse = await inject({
      method: 'GET',
      url: `/v1/journeys/${journeyId}/session`,
    });
    expect(sessionResponse.statusCode).toBe(200);

    const session = sessionResponse.json() as { simulator: boolean };
    expect(session.simulator).toBe(true);
  });

  it('mengembalikan 404 untuk perjalanan milik akun lain', async () => {
    const journeyId = await createJourney();

    /*
     * Akun KEDUA yang benar-benar terdaftar. Sebelumnya pengujian ini cukup
     * mengirim header `x-account-id: acc_orang-lain` — dan itulah kelemahannya:
     * identitas hanya berupa klaim, sehingga siapa pun bisa menjadi siapa pun.
     * Sekarang pemisahan akun harus dibuktikan dengan token yang berbeda.
     */
    const akunLain = await createTestAccount(app, ctx.db, { email: 'orang-lain@contoh.test' });

    const response = await inject({
      method: 'GET',
      url: `/v1/journeys/${journeyId}/session`,
      headers: bearer(akunLain.token),
    });

    // Sengaja NOT_FOUND, bukan FORBIDDEN: keberadaan perjalanan akun lain tidak
    // boleh terbaca dari kode kesalahan.
    expect(response.statusCode).toBe(404);
  });
});

describe('giliran dan hubungan', () => {
  async function playToDecision(): Promise<{ journeyId: string; decisionId: string }> {
    const created = await inject({
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

    const response = await inject({
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

  /**
   * Regresi: pemain yang MEMILIH OPSI semula menghasilkan narasi dengan kutipan
   * kosong — `Kamu memilih bertindak: ""` — karena mesin selalu membaca
   * `customText`, padahal masukan datang lewat `selection.optionId`.
   */
  it('menyebut label opsi yang dipilih, bukan kutipan kosong', async () => {
    const { journeyId, decisionId } = await playToDecision();

    const response = await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('label-opsi'),
        decisionId,
        selection: { optionId: 'opt1' },
        responseLocale: 'id-ID',
      },
    });

    expect(response.statusCode).toBe(201);
    const envelope = response.json() as { beats: { event: { type: string; text?: string } }[] };
    const narration = envelope.beats.find((beat) => beat.event.type === 'narrate')?.event.text ?? '';

    expect(narration).toContain('Minta maaf secara profesional');
    expect(narration).not.toContain('""');
  });

  it('menolak keputusan yang sudah dijawab', async () => {
    const { journeyId, decisionId } = await playToDecision();

    await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('jawab-1'),
        decisionId,
        selection: { optionId: 'opt1' },
        responseLocale: 'id-ID',
      },
    });

    const again = await inject({
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

    const response = await inject({
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

    await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('kanonik'),
        decisionId,
        customText: '*aku mendekati Elysia dan mengkabedonnya*',
        responseLocale: 'id-ID',
      },
    });

    const detail = await inject({ method: 'GET', url: `/v1/journeys/${journeyId}` });
    const body = detail.json() as { relations: { npcId: string; status: string }[] };

    expect(body.relations.find((entry) => entry.npcId === 'npc_elysia')?.status).toBe('waspada');
  });
});

describe('daftar dan penghapusan perjalanan', () => {
  it('mengurutkan yang terakhir dimainkan lebih dahulu', async () => {
    const first = await inject({
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

    await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('urut-2'),
        worldId: 'w_lentera-terakhir',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });

    await inject({
      method: 'PUT',
      url: `/v1/journeys/${firstId}/progress`,
      payload: { lastReadSequence: 5, lastReadBeatId: 'b', decisionCount: 1, hasUnreadBeats: false },
    });

    const list = await inject({ method: 'GET', url: '/v1/journeys' });
    const body = list.json() as { items: { journeyId: string }[] };
    expect(body.items[0]?.journeyId).toBe(firstId);
  });

  it('menghapus perjalanan dan mengosongkan daftar', async () => {
    const created = await inject({
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

    const deleted = await inject({ method: 'DELETE', url: `/v1/journeys/${journeyId}` });
    expect(deleted.statusCode).toBe(204);

    const list = await inject({ method: 'GET', url: '/v1/journeys' });
    expect((list.json() as { items: unknown[] }).items).toHaveLength(0);
  });
});

describe('kuota', () => {
  /**
   * Mesin yang BERPERILAKU seperti AI sungguhan dari sisi penagihan.
   *
   * `DeterministicStoryEngine` adalah simulator, dan giliran simulator memang
   * TIDAK ditagih (docs/17 bagian 3 butir 3). Memakai simulator untuk menguji
   * penagihan berarti menguji jalur yang sengaja gratis — uji akan hijau tanpa
   * membuktikan apa pun. Kelas ini hanya membalik penandanya dan memberi
   * `modelId` yang bukan id simulator.
   */
  class MesinSepertiAI extends DeterministicStoryEngine {
    override readonly isSimulator = false;

    override async generateOpening(context: StoryContext) {
      const hasil = await super.generateOpening(context);
      return { ...hasil, modelId: 'model-uji' };
    }

    override async generateTurn(context: StoryContext) {
      const hasil = await super.generateTurn(context);
      return { ...hasil, modelId: 'model-uji' };
    }
  }

  it('melaporkan pemakaian sebagai angka pasti dari server', async () => {
    const response = await inject({ method: 'GET', url: '/v1/usage' });
    expect(response.statusCode).toBe(200);

    const usage = response.json() as {
      tier: string;
      spent: number;
      available: number;
      allowanceLimit: number;
      isEstimate: boolean;
      resetAt: string;
      claimableToday: boolean;
      streakDay: number;
      sceneCost: number;
    };

    expect(usage.tier).toBe('free');
    // docs/17: mata uangnya POIN — 100 per hari, bukan 100.000 token.
    expect(usage.allowanceLimit).toBe(100);
    expect(usage.available).toBe(100);
    expect(usage.sceneCost).toBe(10);
    // Sudah diklaim di persiapan akun; streak hari pertama selalu 1.
    expect(usage.claimableToday).toBe(false);
    expect(usage.streakDay).toBe(1);
    // Angka dari server bukan perkiraan; perkiraan adalah istilah untuk sisi klien.
    expect(usage.isEstimate).toBe(false);
    expect(new Date(usage.resetAt).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('tidak menagih adegan pembuka — mulai cerita gratis', async () => {
    const before = await inject({ method: 'GET', url: '/v1/usage' });
    const beforeSpent = (before.json() as { spent: number }).spent;

    const created = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('pembuka-gratis'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    expect(created.statusCode).toBe(201);

    const after = await inject({ method: 'GET', url: '/v1/usage' });
    expect((after.json() as { spent: number }).spent).toBe(beforeSpent);
  });

  it('menagih TEPAT satu biaya adegan untuk satu giliran berhasil', async () => {
    /*
     * Memakai mesin ber-`isSimulator = false`: dengan simulator, penagihan
     * memang dilewati, sehingga uji ini akan hijau tanpa membuktikan apa pun.
     */
    const appAi = await buildTestApp(testConfig(), new MesinSepertiAI());
    try {
      const akun = await createClaimedAccount(appAi, { email: 'tagih-ai@contoh.test' });

      const created = await appAi.inject({
        method: 'POST',
        url: '/v1/journeys',
        headers: bearer(akun.token),
        payload: {
          clientOperationId: operationId('tagih'),
          worldId: 'w_bosku-mantan',
          persona: { name: 'Arfan', age: 24 },
          responseLocale: 'id-ID',
        },
      });
      expect(created.statusCode).toBe(201);
      const hasil = created.json() as {
        journeyId: string;
        opening: {
          beats: {
            event: { type: string; decisionId?: string; options?: { optionId: string }[] };
          }[];
        };
      };
      const keputusan = hasil.opening.beats.find((b) => b.event.type === 'presentChoices')?.event;

      const giliran = await appAi.inject({
        method: 'POST',
        url: `/v1/journeys/${hasil.journeyId}/turns`,
        headers: bearer(akun.token),
        payload: {
          clientOperationId: operationId('tagih-giliran'),
          decisionId: keputusan?.decisionId,
          selection: { optionId: keputusan?.options?.[0]?.optionId },
          responseLocale: 'id-ID',
        },
      });
      expect(giliran.statusCode).toBe(201);

      const usage = await appAi.inject({
        method: 'GET',
        url: '/v1/usage',
        headers: bearer(akun.token),
      });
      const body = usage.json() as { spent: number; available: number; sceneCost: number };
      // Mutasi: mengganti `chargedTotal: sceneCost` dengan biaya token membuat
      // angka ini jauh di atas 10 dan uji memerah.
      expect(body.spent).toBe(body.sceneCost);
      expect(body.available).toBe(100 - body.sceneCost);
    } finally {
      await appAi.close();
    }
  });

  it('tidak menagih giliran yang jatuh ke simulator cadangan', async () => {
    /*
     * App bawaan memakai `DeterministicStoryEngine`, yaitu simulator. Pemain
     * tidak membayar untuk giliran yang tidak ditulis mesin AI (docs/17 bagian
     * 3 butir 3). BUKTI MUTASI: hapus pemeriksaan `simulatorTurn` di
     * `journeyService` → `spent` menjadi 10 dan uji ini memerah.
     */
    const created = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('simulator'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    expect(created.statusCode).toBe(201);
    const hasil = created.json() as {
      journeyId: string;
      opening: {
        beats: { event: { type: string; decisionId?: string; options?: { optionId: string }[] } }[];
      };
    };
    const keputusan = hasil.opening.beats.find((b) => b.event.type === 'presentChoices')?.event;

    const giliran = await inject({
      method: 'POST',
      url: `/v1/journeys/${hasil.journeyId}/turns`,
      payload: {
        clientOperationId: operationId('simulator-giliran'),
        decisionId: keputusan?.decisionId,
        selection: { optionId: keputusan?.options?.[0]?.optionId },
        responseLocale: 'id-ID',
      },
    });
    expect(giliran.statusCode).toBe(201);

    const usage = await inject({ method: 'GET', url: '/v1/usage' });
    expect((usage.json() as { spent: number }).spent).toBe(0);
  });

  it('menolak klaim kedua pada hari yang sama tanpa menambah poin', async () => {
    const kedua = await inject({ method: 'POST', url: '/v1/usage/claim' });
    expect(kedua.statusCode).toBe(201);
    const body = kedua.json() as { awarded: number; available: number };

    // Idempoten: bukan galat, tetapi tidak memberi hadiah kedua.
    expect(body.awarded).toBe(0);
    expect(body.available).toBe(100);
  });

  it('menolak giliran ketika kuota tidak mencukupi', async () => {
    /*
     * Akun baru TANPA klaim: saldo hari itu nol (docs/17 bagian 3 butir 1).
     * Adegan pembuka tetap gratis, jadi perjalanan berhasil dibuat — yang
     * ditolak adalah GILIRAN, bukan pembuatan perjalanan.
     */
    const belumKlaim = await createTestAccount(app, ctx.db, { email: 'belum-klaim@contoh.test' });
    const created = await app.inject({
      method: 'POST',
      url: '/v1/journeys',
      headers: bearer(belumKlaim.token),
      payload: {
        clientOperationId: operationId('sempit'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    expect(created.statusCode).toBe(201);
    const hasil = created.json() as {
      journeyId: string;
      opening: {
        beats: { event: { type: string; decisionId?: string; options?: { optionId: string }[] } }[];
      };
    };
    const keputusan = hasil.opening.beats.find((b) => b.event.type === 'presentChoices')?.event;

    const response = await app.inject({
      method: 'POST',
      url: `/v1/journeys/${hasil.journeyId}/turns`,
      headers: bearer(belumKlaim.token),
      payload: {
        clientOperationId: operationId('sempit-giliran'),
        decisionId: keputusan?.decisionId,
        selection: { optionId: keputusan?.options?.[0]?.optionId },
        responseLocale: 'id-ID',
      },
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({ code: 'QUOTA_EXHAUSTED' });
  });
});

describe('laporan', () => {
  it('menyimpan laporan dan menandainya tersimpan di server', async () => {
    const response = await inject({
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
    const response = await inject({
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
    const notFoundResponse = await inject({ method: 'GET', url: '/v1/tidak-ada' });
    expect(notFoundResponse.statusCode).toBe(404);
    expect(notFoundResponse.json()).toMatchObject({ code: 'NOT_FOUND', retryable: false });
  });

  it('tidak membocorkan detail internal pada kesalahan tak terduga', async () => {
    const brokenApp = await buildTestApp();
    brokenApp.get('/v1/rusak', async () => {
      throw new Error('detail rahasia: tabel accounts, kredensial abc123');
    });

    // Akunnya dibuat pada aplikasi ini, karena token hanya berlaku di basis data
    // yang sama dengan yang dipakai aplikasi itu.
    const brokenAuth = await createTestAccount(brokenApp, ctx.db, { email: 'rusak@contoh.test' });

    const response = await brokenApp.inject({
      method: 'GET',
      url: '/v1/rusak',
      headers: bearer(brokenAuth.token),
    });
    expect(response.statusCode).toBe(500);

    const body = response.body;
    expect(body).not.toContain('rahasia');
    expect(body).not.toContain('abc123');
    expect(body).not.toContain('accounts');

    await brokenApp.close();
  });
});

/**
 * Penanda nama diganti sistem, di PEMBUKA dan di GILIRAN.
 *
 * Model menulis `@user` (pemain) dan `@<nama>` (karakter di dunia itu) — bukan
 * nama sungguhan, supaya satu teks dunia dapat dipakai beberapa pemain. Yang
 * menggantinya adalah sistem. Sebelum ini TIDAK ADA yang menggantinya: terukur
 * di produksi 11 Okt 2026, teks beat berisi `"@user duduk di meja 47"` pada
 * perjalanan dengan persona bernama "Arfan", sehingga pemain melihat `@user`
 * di layar padahal namanya sudah diisi.
 *
 * Diuji di DUA jalur sekaligus — pembuka dan giliran — karena keduanya memanggil
 * mesin secara terpisah, dan satu jalur yang lupa mengganti tidak akan terlihat
 * dari jalur yang lain.
 *
 * BUKTI MERAH: buat `siapkan()` di `journeyService.ts` mengembalikan `hasil` apa
 * adanya, lalu uji ini memerah di kedua jalur.
 */
describe('penanda nama diganti sistem', () => {
  /** Mesin yang menulis PENANDA, seperti model sungguhan. */
  class MesinBerpenanda extends DeterministicStoryEngine {
    private tandai(hasil: Awaited<ReturnType<DeterministicStoryEngine['generateOpening']>>) {
      let sudah = false;
      return {
        ...hasil,
        beats: hasil.beats.map((beat) => {
          if (sudah || beat.event.type !== 'narrate') return beat;
          sudah = true;
          return { ...beat, event: { ...beat.event, text: '@user membuka pintu, @npc_1 menyusul.' } };
        }),
      };
    }

    override async generateOpening(context: StoryContext) {
      return this.tandai(await super.generateOpening(context));
    }

    override async generateTurn(context: StoryContext) {
      return this.tandai(await super.generateTurn(context));
    }
  }

  beforeEach(async () => {
    await app.close();
    app = await buildTestApp(testConfig(), new MesinBerpenanda());
    await createClaimedAccount();
  });

  it('pemain tidak pernah melihat "@user" mentah — pembuka MAUPUN giliran', async () => {
    const buat = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('penanda'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    expect(buat.statusCode).toBe(201);

    const hasil = buat.json() as {
      journeyId: string;
      opening: { beats: { event: { type: string; text?: string; prompt?: string } }[] };
    };

    const teksPembuka = hasil.opening.beats
      .map((b) => b.event.text ?? '')
      .join(' ');
    expect(teksPembuka).toContain('Arfan');
    expect(teksPembuka).not.toContain('@user');

    /* ---- Giliran: jalur KEDUA, dipanggil terpisah dari pembuka ---- */
    const keputusan = hasil.opening.beats.find((b) => b.event.type === 'presentChoices');
    void keputusan;

    const sesi = await inject({
      method: 'GET',
      url: `/v1/journeys/${hasil.journeyId}/session`,
    });
    const beatsSesi = (sesi.json() as { beats: { event: { type: string; text?: string } }[] }).beats;
    const pilihan = beatsSesi.find((b) => b.event.type === 'presentChoices');
    void pilihan;

    // Ambil decisionId dari beat presentChoices yang tersimpan.
    const lengkap = beatsSesi as unknown as {
      event: { type: string; decisionId?: string };
    }[];
    const dec = lengkap.find((b) => b.event.type === 'presentChoices')?.event.decisionId;
    expect(dec).toBeDefined();

    const giliran = await inject({
      method: 'POST',
      url: `/v1/journeys/${hasil.journeyId}/turns`,
      payload: {
        clientOperationId: operationId('penanda-turn'),
        decisionId: dec,
        selection: { optionId: 'opt1' },
        responseLocale: 'id-ID',
      },
    });
    expect(giliran.statusCode).toBe(201);

    const beatsGiliran = (giliran.json() as { beats: { event: { type: string; text?: string } }[] })
      .beats;
    const teksGiliran = beatsGiliran.map((b) => b.event.text ?? '').join(' ');

    // Jalur kedua juga harus sudah bersih.
    expect(teksGiliran).not.toContain('@user');
    expect(teksGiliran).toContain('Arfan');
  });
});

/**
 * Keadaan hubungan sampai ke mesin cerita.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA INI DIUJI DI TINGKAT KONTEKS, BUKAN KELUARAN
 * ---------------------------------------------------------------------------
 * Keluhan pemilik produk: "cek fitur hubungan sudah full fungsional apa belum".
 * Jawabannya tidak, dan salah satu sebabnya: `StoryContext` TIDAK PERNAH membawa
 * keadaan hubungan, sehingga model diminta memutuskan apakah seorang tokoh
 * tersinggung tanpa tahu bagaimana hubungan mereka sekarang — dan prompt bahkan
 * tidak memuat daftar status yang sah.
 *
 * Mesin deterministik tidak dapat menangkap cacat ini: ia tidak membaca keadaan
 * hubungan dari konteks sama sekali. Karena itu yang diperiksa di sini adalah
 * KONTEKS yang benar-benar dikirim ke mesin, persis seperti uji `optionLabel`.
 *
 * BUKTI MUTASI: hapus `relations:` dari konteks di `journeyService` (pembuka
 * atau giliran), lalu uji yang bersangkutan memerah.
 */
describe('keadaan hubungan sampai ke mesin cerita', () => {
  class MesinPerekamRelasi extends DeterministicStoryEngine {
    readonly pembuka: StoryContext[] = [];
    readonly giliran: StoryContext[] = [];

    override async generateOpening(context: StoryContext) {
      this.pembuka.push(context);
      return super.generateOpening(context);
    }

    override async generateTurn(context: StoryContext) {
      this.giliran.push(context);
      return super.generateTurn(context);
    }
  }

  let mesin: MesinPerekamRelasi;

  beforeEach(async () => {
    await app.close();
    mesin = new MesinPerekamRelasi();
    app = await buildTestApp(testConfig(), mesin);
    await createClaimedAccount();
  });

  it('pembuka membawa hubungan AWAL yang ditetapkan dunia', async () => {
    const created = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('relasi-buka'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    expect(created.statusCode).toBe(201);

    const konteks = mesin.pembuka[0];
    expect(konteks).toBeDefined();
    expect(konteks?.relations?.length ?? 0).toBeGreaterThan(0);

    for (const relasi of konteks?.relations ?? []) {
      // Statusnya harus nilai yang SAH, dan alasannya tidak boleh kosong —
      // prompt menuliskannya sebagai kalimat yang dibaca model.
      expect(DEFAULT_RELATION_STATUSES).toContain(relasi.status);
      expect(relasi.reasonPublic.trim().length).toBeGreaterThan(0);
    }
  });

  it('giliran berikutnya membawa status yang SUDAH BERUBAH, bukan yang lama', async () => {
    const created = await inject({
      method: 'POST',
      url: '/v1/journeys',
      payload: {
        clientOperationId: operationId('relasi-giliran'),
        worldId: 'w_bosku-mantan',
        persona: { name: 'Arfan', age: 24 },
        responseLocale: 'id-ID',
      },
    });
    const journeyId = (created.json() as { journeyId: string }).journeyId;

    const sesi = await inject({ method: 'GET', url: `/v1/journeys/${journeyId}/session` });
    const keputusanAwal = (sesi.json() as { beats: { event: { type: string; decisionId?: string } }[] })
      .beats.find((beat) => beat.event.type === 'presentChoices')?.event.decisionId;
    expect(keputusanAwal).toBeTruthy();

    // Giliran 1: aksi yang melewati batas — mesin deterministik menaikkan
    // hubungan menjadi "waspada" untuk aksi ini (lihat uji FR-16 di atas).
    const giliran1 = await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('relasi-1'),
        decisionId: keputusanAwal,
        customText: '*aku mendekati Elysia dan mengkabedonnya*',
        responseLocale: 'id-ID',
      },
    });
    expect(giliran1.statusCode).toBe(201);

    const delta = (giliran1.json() as {
      beats: { event: { type: string; npcId?: string; status?: string } }[];
    }).beats.find((beat) => beat.event.type === 'relationshipDelta');
    expect(delta?.event.status).toBe('waspada');

    const keputusanBerikut = (giliran1.json() as {
      beats: { event: { type: string; decisionId?: string } }[];
    }).beats.find((beat) => beat.event.type === 'presentChoices')?.event.decisionId;
    expect(keputusanBerikut).toBeTruthy();

    // Giliran 2: konteksnya HARUS sudah memuat status baru.
    const giliran2 = await inject({
      method: 'POST',
      url: `/v1/journeys/${journeyId}/turns`,
      payload: {
        clientOperationId: operationId('relasi-2'),
        decisionId: keputusanBerikut,
        selection: { optionId: 'opt1' },
        responseLocale: 'id-ID',
      },
    });
    expect(giliran2.statusCode).toBe(201);

    const konteksGiliran2 = mesin.giliran[1];
    expect(konteksGiliran2).toBeDefined();

    const relasi = (konteksGiliran2?.relations ?? []).find(
      (item) => item.npcId === delta?.event.npcId,
    );
    expect(relasi).toBeDefined();
    /*
     * Yang dijaga: statusnya yang BARU. Kalau `canonicalRelations` tidak
     * dipanggil, konteks akan membawa status awal dunia ("normal") dan model
     * akan memutuskan arah perubahan dari keadaan yang sudah basi.
     */
    expect(relasi?.status).toBe('waspada');
    expect(relasi?.reasonPublic.trim().length).toBeGreaterThan(0);
  });
});
