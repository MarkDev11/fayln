/**
 * Pengujian master genre.
 *
 * Yang dibuktikan di sini bukan "halaman dapat dibuka", melainkan bahwa janji
 * halaman Genre benar-benar berlaku setelah seluruh lapisan disatukan:
 *
 * 1. Genre yang dibuat admin dapat dipakai — di formulir dunia, di wizard, dan
 *    di penyaringan katalog. Sebelum genre menjadi data, semua ini gagal secara
 *    SENYAP: genrenya tersimpan sebagai dunia tanpa genre, atau dibuang dari
 *    saringan tanpa pesan.
 * 2. Id genre tidak dapat diubah. Ia dirujuk `world_genres`, termasuk versi lama
 *    yang sedang dibaca pemain.
 * 3. Genre yang masih dipakai tidak dapat dihapus — dan penolakannya dapat
 *    dibaca admin, bukan sekadar gagal.
 * 4. `/v1/genres` hanya menawarkan genre yang DIPAKAI cerita terbit. Chip
 *    saringan yang selalu mengembalikan daftar kosong terasa seperti kerusakan.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AccountsAdminRepository } from '../src/admin/accountsAdminRepository';
import { AdminRepository } from '../src/admin/adminRepository';
import { CatalogAdminRepository } from '../src/admin/catalogAdminRepository';
import { GenresRepository, GENRE_ID_PATTERN } from '../src/admin/genresRepository';
import { ModelsRepository } from '../src/admin/modelsRepository';
import type { AdminPageContext } from '../src/admin/pages/context';
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
let genres: GenresRepository;

const ADMIN_USERNAME = 'operator-genre';
const ADMIN_PASSWORD = 'kata-sandi-uji-123';

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

function form(payload: Record<string, string | string[]>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
    }
  }
  return parts.join('&');
}

async function buildTestApp(): Promise<FastifyInstance> {
  const config = testConfig();
  const usage = new UsageRepository(ctx.db, config.plan);
  const catalogRepo = new CatalogRepository(ctx.db);
  const journeys = new JourneyRepository(ctx.db);
  const operations = new OperationRepository(ctx.db);
  const reports = new ReportRepository(ctx.db);

  admins = new AdminRepository(ctx.db);
  genres = new GenresRepository(ctx.db);

  const pages: AdminPageContext = {
    admins,
    settings: new SettingsRepository(ctx.db),
    catalog: new CatalogAdminRepository(ctx.db),
    accounts: new AccountsAdminRepository(ctx.db),
    promotions: new PromotionsRepository(ctx.db),
    models: new ModelsRepository(ctx.db),
    drafts: new WorldDraftRepository(ctx.db),
    genres,
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

/** Membuat genre lewat halaman, seperti yang dilakukan admin. */
async function createGenre(
  cookie: string,
  input: { genreId: string; labelId?: string; labelEn?: string; active?: 'true' | 'false' },
): Promise<{ status: number; location: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/genres',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: form({
      genreId: input.genreId,
      labelId: input.labelId ?? 'Label Indonesia',
      labelEn: input.labelEn ?? 'English Label',
      active: input.active ?? 'true',
    }),
  });
  return { status: response.statusCode, location: String(response.headers.location) };
}

async function get(cookie: string, url: string) {
  return app.inject({ method: 'GET', url, headers: { cookie } });
}

beforeEach(async () => {
  ctx = await createTestDatabase();
  resetLoginAttempts();
  app = await buildTestApp();
  await admins.createAdmin({
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    displayName: 'Operator Genre',
    role: 'owner',
  });
});

afterEach(async () => {
  await app.close();
  await ctx.close();
});

/* ------------------------------------------------------------------ */

describe('halaman genre', () => {
  it('menampilkan lima genre bawaan setelah migrasi', async () => {
    const cookie = await login();
    const response = await get(cookie, '/admin/genres');
    expect(response.statusCode).toBe(200);

    const body = response.body;
    for (const id of ['romance', 'drama', 'office', 'fantasy', 'mystery']) {
      expect(body, `genre bawaan ${id} seharusnya terdaftar`).toContain(id);
    }
    expect(body).toContain('Romansa');
    expect(body).toContain('Kehidupan Kantor');
  });

  it('menyusun tabel sebagai markup, bukan teks yang ter-escape', async () => {
    const cookie = await login();
    const body = (await get(cookie, '/admin/genres')).body;

    // Markup yang ter-escape TIDAK melempar galat — ia hanya tampil sebagai teks.
    // Karena itu pemeriksaannya harus dua arah: tidak ada entitas, DAN ada tag.
    for (const broken of ['&lt;td&gt;', '&lt;table', '&lt;tr&gt;', '&lt;input']) {
      expect(body, `markup tampil sebagai teks: ${broken}`).not.toContain(broken);
    }
    expect(body).toContain('<table>');
    expect(body).toContain('action="/admin/genres/update"');
  });
});

describe('membuat genre', () => {
  it('menambahkan genre baru dan menawarkannya di formulir dunia', async () => {
    const cookie = await login();
    const created = await createGenre(cookie, {
      genreId: 'slice_of_life',
      labelId: 'Keseharian',
      labelEn: 'Slice of Life',
    });

    expect(created.status).toBe(302);
    expect(created.location).toContain('notice=created');

    // Inilah inti perubahan: genre buatan admin harus muncul di formulir dunia.
    // Sebelum genre menjadi data, formulir menawarkan daftar tetap dan genre ini
    // tidak akan pernah terlihat di sana.
    const formBody = (await get(cookie, '/admin/worlds-wizard')).body;
    expect(formBody).toContain('value="slice_of_life"');
    expect(formBody).toContain('Keseharian');
  });

  it('menolak id yang bentuknya salah, dengan pesan yang menyebut sebabnya', async () => {
    const cookie = await login();

    for (const bad of ['1awali_angka', 'ada-tanda-hubung', 'a', 'ada spasi']) {
      const result = await createGenre(cookie, { genreId: bad });
      expect(result.location, `${bad} seharusnya ditolak`).toContain('notice=genre-invalid');
    }

    // Genre bawaan tidak bertambah, dan yang gagal tidak setengah tersimpan.
    expect(await genres.list()).toHaveLength(5);
  });

  it('menormalkan huruf besar menjadi huruf kecil, bukan menolaknya', async () => {
    const cookie = await login();
    const result = await createGenre(cookie, { genreId: 'SliceOfLife' });

    // Server sengaja memaafkan: menolak karena huruf besar akan membuat admin
    // mengetik ulang id yang sudah benar maksudnya. Yang penting id yang
    // TERSIMPAN sama dengan yang dirujuk `world_genres`.
    expect(result.location).toContain('notice=created');
    expect(await genres.find('sliceoflife')).not.toBeNull();
    expect(await genres.find('SliceOfLife')).toBeNull();
  });

  it('menolak id yang sudah dipakai', async () => {
    const cookie = await login();
    const result = await createGenre(cookie, { genreId: 'romance' });
    expect(result.location).toContain('notice=genre-exists');
    expect(await genres.list()).toHaveLength(5);
  });

  it('mengisi label yang dikosongkan dengan id-nya', async () => {
    const cookie = await login();
    await createGenre(cookie, { genreId: 'horor', labelId: '', labelEn: '' });

    const row = await genres.find('horor');
    expect(row?.labelId).toBe('horor');
    expect(row?.labelEn).toBe('horor');
  });

  it('menempatkan genre baru di urutan paling belakang', async () => {
    const cookie = await login();
    await createGenre(cookie, { genreId: 'horor' });

    const list = await genres.list();
    expect(list[list.length - 1]?.genreId).toBe('horor');
  });

  it('mencatat pembuatan di audit', async () => {
    const cookie = await login();
    await createGenre(cookie, { genreId: 'slice_of_life' });

    const { rows } = await ctx.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM admin_audit_log WHERE action = 'genre.create'`,
    );
    expect(rows[0]?.total).toBe(1);
  });
});

describe('mengubah genre', () => {
  it('mengubah label tanpa mengubah id', async () => {
    const cookie = await login();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/genres/update',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ genreId: 'romance', labelId: 'Percintaan', labelEn: 'Love Story', active: 'true' }),
    });

    expect(response.statusCode).toBe(302);
    expect(String(response.headers.location)).toContain('notice=saved');

    const row = await genres.find('romance');
    expect(row?.labelId).toBe('Percintaan');
    // Id tetap: ia dirujuk `world_genres`, termasuk oleh versi dunia lama.
    expect(row?.genreId).toBe('romance');

    // Dan rujukan yang sudah ada tidak rusak.
    const { rows } = await ctx.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM world_genres WHERE genre = 'romance'`,
    );
    expect(rows[0]?.total).toBeGreaterThan(0);
  });

  it('menolak mengubah genre yang tidak ada', async () => {
    const cookie = await login();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/genres/update',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ genreId: 'tidak_ada', labelId: 'X', labelEn: 'X', active: 'true' }),
    });
    expect(String(response.headers.location)).toContain('notice=not-found');
  });

  it('menyembunyikan genre nonaktif dari formulir, tetapi tetap memuat centangnya bila sudah dipakai', async () => {
    const cookie = await login();
    await genres.create({ genreId: 'slice_of_life', labelId: 'Keseharian', labelEn: 'Slice of Life', active: true });
    await genres.create({ genreId: 'horor', labelId: 'Horor', labelEn: 'Horror', active: false });

    const formBody = (await get(cookie, '/admin/worlds-wizard')).body;
    expect(formBody, 'genre aktif seharusnya ditawarkan').toContain('value="slice_of_life"');
    expect(formBody, 'genre nonaktif tidak boleh ditawarkan').not.toContain('value="horor"');

    // Sekarang pasang genre nonaktif itu pada sebuah dunia, lalu buka dunianya.
    const created = await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: 'Dunia Genre',
        synopsis: 'S',
        premise: 'P',
        coverAssetId: 'a_cover_lentera',
        status: 'draft',
        contentRating: 'all',
        genres: ['horor'],
        locales: ['id-ID'],
      }),
    });
    const worldId = String(created.headers.location).split('/admin/worlds/')[1]?.split('?')[0] ?? '';
    expect(worldId).not.toBe('');

    const editBody = (await get(cookie, `/admin/worlds/${worldId}`)).body;
    expect(editBody, 'genre yang sudah dipakai harus tetap tercentang').toContain('value="horor"');
    expect(editBody).toContain('checked');
  });

  it('menolak masukan yang bentuknya salah, bukan menyimpannya setengah', async () => {
    const cookie = await login();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/genres/update',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ genreId: '', labelId: 'X', labelEn: 'X', active: 'true' }),
    });
    expect(String(response.headers.location)).toContain('notice=genre-invalid');
  });
});

describe('menghapus genre', () => {
  it('menghapus genre yang belum dipakai', async () => {
    const cookie = await login();
    await createGenre(cookie, { genreId: 'horor' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/genres/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ genreId: 'horor' }),
    });

    expect(String(response.headers.location)).toContain('notice=deleted');
    expect(await genres.find('horor')).toBeNull();
  });

  it('menolak menghapus genre yang masih dipakai, dan menyebut jalan keluarnya', async () => {
    const cookie = await login();
    await createGenre(cookie, { genreId: 'slice_of_life' });

    const created = await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: 'Dunia Genre',
        synopsis: 'S',
        premise: 'P',
        coverAssetId: 'a_cover_lentera',
        status: 'draft',
        contentRating: 'all',
        genres: ['slice_of_life'],
        locales: ['id-ID'],
      }),
    });
    expect(String(created.headers.location)).toContain('/admin/worlds/');

    const response = await app.inject({
      method: 'POST',
      url: '/admin/genres/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ genreId: 'slice_of_life' }),
    });

    expect(String(response.headers.location)).toContain('notice=genre-in-use');
    expect(await genres.find('slice_of_life')).not.toBeNull();

    // Pesannya harus menyebut alternatifnya; "tidak dapat dihapus" saja membuat
    // admin mencoba lagi.
    const page = (await get(cookie, '/admin/genres?notice=genre-in-use')).body;
    expect(page).toContain('tidak ditawarkan');
  });

  it('tidak menawarkan tombol hapus pada baris genre yang masih dipakai', async () => {
    const cookie = await login();
    const body = (await get(cookie, '/admin/genres')).body;

    // `drama` dipakai oleh dunia seed; barisnya tidak boleh punya form hapus.
    const dramaRow = body.split('<tr>').find((row) => row.includes('>drama<'));
    expect(dramaRow).toBeDefined();
    expect(dramaRow).not.toContain('action="/admin/genres/delete"');
  });

  it('tidak dapat dihapus di tingkat basis data walau pemeriksaan aplikasi dilewati', async () => {
    // Jaring pengaman: foreign key, bukan hanya pemeriksaan di repositori.
    await expect(
      ctx.db.query(`DELETE FROM genres WHERE genre_id = 'drama'`),
    ).rejects.toThrow();
  });
});

describe('mengurutkan genre', () => {
  it('menaikkan dan menurunkan satu langkah', async () => {
    const cookie = await login();
    const before = (await genres.list()).map((genre) => genre.genreId);
    expect(before).toEqual(['romance', 'drama', 'office', 'fantasy', 'mystery']);

    const up = await app.inject({
      method: 'POST',
      url: '/admin/genres/move',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ genreId: 'drama', direction: 'up' }),
    });
    expect(up.statusCode).toBe(302);
    expect((await genres.list()).map((genre) => genre.genreId)).toEqual([
      'drama',
      'romance',
      'office',
      'fantasy',
      'mystery',
    ]);

    const down = await app.inject({
      method: 'POST',
      url: '/admin/genres/move',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ genreId: 'drama', direction: 'down' }),
    });
    expect(down.statusCode).toBe(302);
    expect((await genres.list()).map((genre) => genre.genreId)).toEqual(before);
  });

  it('tidak mengubah apa pun bila digeser melewati ujung', async () => {
    const cookie = await login();
    const before = (await genres.list()).map((genre) => genre.genreId);

    await app.inject({
      method: 'POST',
      url: '/admin/genres/move',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ genreId: 'romance', direction: 'up' }),
    });

    expect((await genres.list()).map((genre) => genre.genreId)).toEqual(before);
  });
});

describe('endpoint /v1/genres', () => {
  it('hanya mengembalikan genre yang dipakai cerita terbit', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/genres' });
    expect(response.statusCode).toBe(200);

    const body = response.json() as { items: { genreId: string; labelId: string; labelEn: string }[] };
    // Dunia seed memakai kelimanya, jadi kelimanya muncul — lengkap dengan label.
    expect(body.items.map((item) => item.genreId)).toEqual([
      'romance',
      'drama',
      'office',
      'fantasy',
      'mystery',
    ]);
    expect(body.items[0]).toMatchObject({ labelId: 'Romansa', labelEn: 'Romance' });
    expect(body.items[2]).toMatchObject({ labelId: 'Kehidupan Kantor', labelEn: 'Office Life' });
  });

  it('menyembunyikan genre yang belum dipakai cerita mana pun', async () => {
    await genres.create({ genreId: 'horor', labelId: 'Horor', labelEn: 'Horror', active: true });

    const body = (await app.inject({ method: 'GET', url: '/v1/genres' })).json() as {
      items: { genreId: string }[];
    };
    expect(body.items.map((item) => item.genreId)).not.toContain('horor');
  });

  it('menyembunyikan genre yang dinonaktifkan admin', async () => {
    await genres.update('drama', { labelId: 'Drama', labelEn: 'Drama', active: false });

    const body = (await app.inject({ method: 'GET', url: '/v1/genres' })).json() as {
      items: { genreId: string }[];
    };
    expect(body.items.map((item) => item.genreId)).not.toContain('drama');
    // Dunia yang memakainya tetap utuh — hanya chip-nya yang hilang.
    const { rows } = await ctx.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM world_genres WHERE genre = 'drama'`,
    );
    expect(rows[0]?.total).toBeGreaterThan(0);
  });

  it('menyembunyikan genre yang hanya dipakai dunia draf atau yang ditarik', async () => {
    const cookie = await login();
    await createGenre(cookie, { genreId: 'slice_of_life', labelId: 'Keseharian', labelEn: 'Slice of Life' });
    await createGenre(cookie, { genreId: 'horor', labelId: 'Horor', labelEn: 'Horror' });

    for (const [worldId, genre, status] of [
      ['w_draf-genre', 'slice_of_life', 'draft'],
      ['w-tarik-genre', 'horor', 'retired'],
    ] as const) {
      const created = await app.inject({
        method: 'POST',
        url: '/admin/worlds',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        payload: form({
          worldId,
          title: `Dunia ${status}`,
          synopsis: 'S',
          premise: 'P',
          coverAssetId: 'a_cover_lentera',
          status,
          contentRating: 'all',
          genres: [genre],
          locales: ['id-ID'],
        }),
      });
      expect(String(created.headers.location), `${worldId} gagal dibuat`).toContain('/admin/worlds/');
    }

    const body = (await app.inject({ method: 'GET', url: '/v1/genres' })).json() as {
      items: { genreId: string }[];
    };
    const ids = body.items.map((item) => item.genreId);

    // Pemain tidak dapat melihat dunia draf, dan dunia yang ditarik sudah keluar
    // dari katalog. Menawarkan genrenya berarti menawarkan saringan yang selalu
    // mengembalikan daftar kosong.
    expect(ids).not.toContain('slice_of_life');
    expect(ids).not.toContain('horor');
  });

  it('menampilkan genre baru setelah ada cerita terbit yang memakainya', async () => {
    const cookie = await login();
    await createGenre(cookie, { genreId: 'slice_of_life', labelId: 'Keseharian', labelEn: 'Slice of Life' });

    const before = (await app.inject({ method: 'GET', url: '/v1/genres' })).json() as {
      items: { genreId: string }[];
    };
    expect(before.items.map((item) => item.genreId)).not.toContain('slice_of_life');

    await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: 'Cerita Keseharian',
        synopsis: 'S',
        premise: 'P',
        coverAssetId: 'a_cover_lentera',
        status: 'published',
        contentRating: 'all',
        genres: ['slice_of_life'],
        locales: ['id-ID'],
      }),
    });

    const after = (await app.inject({ method: 'GET', url: '/v1/genres' })).json() as {
      items: { genreId: string; labelId: string }[];
    };
    expect(after.items.map((item) => item.genreId)).toContain('slice_of_life');
    expect(after.items.find((item) => item.genreId === 'slice_of_life')?.labelId).toBe('Keseharian');
  });
});

describe('bentuk id genre', () => {
  it('menerima huruf kecil, angka, dan garis bawah; menolak sisanya', () => {
    for (const good of ['romance', 'slice_of_life', 'genre2', 'a1']) {
      expect(GENRE_ID_PATTERN.test(good), `${good} seharusnya diterima`).toBe(true);
    }
    for (const bad of ['Romance', '2genre', '_genre', 'genre-baru', 'a', 'genre baru', '']) {
      expect(GENRE_ID_PATTERN.test(bad), `${bad} seharusnya ditolak`).toBe(false);
    }
  });
});
