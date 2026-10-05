/**
 * Pengujian panel admin.
 *
 * Yang dibuktikan di sini bukan "halaman dapat dibuka", melainkan bahwa janji
 * keamanan dan aturan katalog benar-benar berlaku setelah seluruh lapisan
 * disatukan:
 *
 * 1. Tidak ada halaman /admin yang dapat dibuka tanpa sesi.
 * 2. Cookie sesi tidak dapat dibaca JavaScript dan tidak dikirim lintas situs.
 * 3. Kata sandi tidak pernah tersimpan sebagai teks biasa.
 * 4. Menyunting dunia yang terbit membuat VERSI BARU — cerita yang sedang
 *    berjalan tidak berubah (FR-54).
 * 5. Penukaran promosi ganda ditolak oleh DATABASE, bukan hanya oleh pemeriksaan
 *    di aplikasi.
 *
 * Poin 1 sengaja diuji dengan menyapu SELURUH halaman, bukan satu contoh. Satu
 * route yang lupa dilindungi sudah cukup untuk membuka seluruh panel, dan
 * daftar route berubah tanpa disadari.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountsAdminRepository } from '../src/admin/accountsAdminRepository';
import { AdminRepository } from '../src/admin/adminRepository';
import { CatalogAdminRepository } from '../src/admin/catalogAdminRepository';
import { GenresRepository } from '../src/admin/genresRepository';
import { CharactersRepository } from '../src/admin/charactersRepository';
import { LocationsRepository } from '../src/admin/locationsRepository';
import { ProvidersRepository } from '../src/admin/providersRepository';
import { SECRETS_KEY_ENV } from '../src/admin/secretBox';
import { ModelsRepository, resolvedModelId } from '../src/admin/modelsRepository';
import type { AdminPageContext } from '../src/admin/pages/context';
import { hashPassword, verifyPassword } from '../src/admin/password';
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
let promotions: PromotionsRepository;
let catalogAdmin: CatalogAdminRepository;
let characters: CharactersRepository;
let locations: LocationsRepository;

const ADMIN_USERNAME = 'operator';
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

async function buildTestApp(): Promise<FastifyInstance> {
  const config = testConfig();
  const usage = new UsageRepository(ctx.db, config.plan);
  const catalogRepo = new CatalogRepository(ctx.db);
  const journeys = new JourneyRepository(ctx.db);
  const operations = new OperationRepository(ctx.db);
  const reports = new ReportRepository(ctx.db);

  admins = new AdminRepository(ctx.db);
  promotions = new PromotionsRepository(ctx.db);
  catalogAdmin = new CatalogAdminRepository(ctx.db);
  characters = new CharactersRepository(ctx.db);
  locations = new LocationsRepository(ctx.db);

  const pages: AdminPageContext = {
    admins,
    settings: new SettingsRepository(ctx.db),
    catalog: catalogAdmin,
    accounts: new AccountsAdminRepository(ctx.db),
    promotions,
    models: new ModelsRepository(ctx.db),
    drafts: new WorldDraftRepository(ctx.db),
    genres: new GenresRepository(ctx.db),
    characters,
    locations,
    providers: new ProvidersRepository(ctx.db),
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

/** Mengambil cookie sesi dari header Set-Cookie balasan. */
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

/** Masuk dan mengembalikan cookie yang siap dipakai permintaan berikutnya. */
async function login(instance: FastifyInstance = app): Promise<string> {
  const response = await instance.inject({
    method: 'POST',
    url: '/admin/login',
    payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(response.statusCode).toBe(302);
  return readCookie(response.headers['set-cookie']);
}

/**
 * Membuat dunia uji dan mengembalikan id-nya.
 *
 * Dinaikkan ke tingkat modul karena dipakai lebih dari satu kelompok
 * pengujian: karakter, lokasi, dan riwayat versi semuanya butuh dunia.
 */
async function createWorld(
  cookie: string,
  title = 'Dunia Karakter',
  status: 'draft' | 'published' | 'retired' | 'revoked' = 'published',
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/worlds',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: form({
      worldId: '',
      title,
      synopsis: 'S',
      premise: 'P',
      coverAssetId: 'a_cover_lentera',
      status,
      contentRating: 'all',
      genres: ['drama'],
      locales: ['id-ID'],
    }),
  });
  return String(response.headers.location).split('/admin/worlds/')[1]?.split('?')[0] ?? '';
}

/** Masuk sebagai admin tertentu. Dipakai untuk menguji saringan audit. */
async function loginAs(username: string, password: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/login',
    payload: { username, password },
  });
  expect(response.statusCode).toBe(302);
  return readCookie(response.headers['set-cookie']);
}

/**
 * Memastikan halaman tersusun sebagai HTML, bukan sebagai teks markup.
 *
 * Inilah pengujian yang membedakan "halaman aman" dari "halaman rusak".
 * `html()` meng-escape string, sehingga potongan yang dikirim dengan cara yang
 * salah (mis. hasil `.join('')`) tampil sebagai `&lt;td&gt;` — tanpa galat,
 * tanpa tag hidup, dan pengujian XSS yang hanya memeriksa "tidak ada tag
 * hidup" tetap lolos walau tabelnya rusak total.
 */
function expectRenderedMarkup(body: string, needles: string[]): void {
  for (const broken of ['&lt;td&gt;', '&lt;table', '&lt;tr&gt;', '&lt;option']) {
    expect(body, `markup tampil sebagai teks: ${broken}`).not.toContain(broken);
  }
  for (const needle of needles) {
    expect(body, `seharusnya memuat: ${needle}`).toContain(needle);
  }
}

/** Menghitung berapa kali satu tindakan muncul sebagai pil pada baris tabel audit. */
function auditPillCount(body: string, action: string): number {
  const pattern = `<span class="pill">${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`;
  return (body.match(new RegExp(pattern, 'g')) ?? []).length;
}

/** Formulir HTML dikirim sebagai urlencoded, bukan JSON. */
function form(payload: Record<string, string | string[]>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
    }
  }
  return parts.join('&');
}

/** PNG minimal yang cukup untuk dikenali `inspectImage`. */
function png(width: number, height: number, marker = ''): Buffer {
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write('IHDR', 12, 'latin1');
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  head[24] = 8;
  head[25] = 6; // RGBA
  return marker.length > 0 ? Buffer.concat([head, Buffer.from(marker, 'latin1')]) : head;
}

/** Mengunggah satu berkas gambar dan mengembalikan id medianya. */
async function upload(cookie: string, bytes: Buffer): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/media',
    headers: { cookie, 'content-type': 'image/png' },
    payload: bytes,
  });
  expect(response.statusCode).toBe(200);
  return response.json().mediaId as string;
}

beforeEach(async () => {
  ctx = await createTestDatabase();
  resetLoginAttempts();
  app = await buildTestApp();
  await admins.createAdmin({
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    displayName: 'Operator Uji',
    role: 'owner',
  });
});

afterEach(async () => {
  await app.close();
  await ctx.close();
});

/* ------------------------------------------------------------------ */

describe('kata sandi admin', () => {
  it('tidak menyimpan kata sandi sebagai teks biasa', async () => {
    const { rows } = await ctx.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM admin_users LIMIT 1',
    );
    const stored = rows[0]?.password_hash ?? '';

    expect(stored).not.toContain(ADMIN_PASSWORD);
    expect(stored.startsWith('scrypt$')).toBe(true);
    // Parameter ikut tersimpan supaya hash lama tetap dapat diverifikasi setelah
    // biayanya dinaikkan di masa depan.
    expect(stored.split('$')).toHaveLength(6);
  });

  it('menerima kata sandi yang benar dan menolak yang salah', async () => {
    const hash = await hashPassword('rahasia-yang-benar');
    expect(await verifyPassword('rahasia-yang-benar', hash)).toBe(true);
    expect(await verifyPassword('rahasia-yang-salah', hash)).toBe(false);
  });

  it('tidak melempar untuk hash yang bentuknya rusak, tetapi menolak masuk', async () => {
    expect(await verifyPassword('apa pun', 'bukan-hash')).toBe(false);
    expect(await verifyPassword('apa pun', '')).toBe(false);
    expect(await verifyPassword('apa pun', 'scrypt$x$y$z$a$b')).toBe(false);
  });

  it('menghasilkan hash berbeda untuk kata sandi yang sama (salt acak)', async () => {
    const first = await hashPassword('sama');
    const second = await hashPassword('sama');
    expect(first).not.toBe(second);
    expect(await verifyPassword('sama', first)).toBe(true);
    expect(await verifyPassword('sama', second)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe('perlindungan halaman admin', () => {
  /**
   * Daftar ini sengaja lengkap. Menambah halaman baru ke panel tanpa
   * memperbarui daftar berarti halaman itu tidak teruji perlindungannya —
   * karena itu daftarnya ditulis apa adanya, bukan diturunkan dari kode.
   */
  const PROTECTED_PAGES = [
    '/admin',
    '/admin/worlds',
    '/admin/worlds-new',
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

  it('mengalihkan setiap halaman ke halaman masuk bila belum masuk', async () => {
    for (const url of PROTECTED_PAGES) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, `${url} seharusnya dialihkan`).toBe(302);
      expect(response.headers.location, `${url} seharusnya menuju halaman masuk`).toContain(
        '/admin/login',
      );
    }
  });

  it('menolak tindakan perubahan tanpa sesi', async () => {
    const mutations: { url: string; payload: Record<string, string> }[] = [
      { url: '/admin/worlds', payload: { title: 'x' } },
      { url: '/admin/characters', payload: { worldId: 'x' } },
      { url: '/admin/characters/delete', payload: { worldId: 'x', npcId: 'y' } },
      { url: '/admin/locations', payload: { worldId: 'x', label: 'y' } },
      { url: '/admin/locations/delete', payload: { worldId: 'x', locationId: 'y' } },
      { url: '/admin/genres', payload: { genreId: 'x_y' } },
      { url: '/admin/genres/update', payload: { genreId: 'x_y' } },
      { url: '/admin/genres/delete', payload: { genreId: 'x_y' } },
      { url: '/admin/genres/move', payload: { genreId: 'x_y', direction: 'up' } },
      { url: '/admin/admins', payload: { username: 'x', password: 'y' } },
      { url: '/admin/admins/toggle', payload: { adminId: 'x' } },
      { url: '/admin/settings', payload: { key: 'a.b', value: '1' } },
      { url: '/admin/models', payload: { label: 'x' } },
      { url: '/admin/promotions', payload: { code: 'X' } },
      { url: '/admin/password', payload: { currentPassword: 'a', newPassword: 'b' } },
    ];

    for (const item of mutations) {
      const response = await app.inject({
        method: 'POST',
        url: item.url,
        payload: form(item.payload),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      expect(response.statusCode, `${item.url} seharusnya ditolak`).toBe(302);
      expect(response.headers.location).toContain('/admin/login');
    }
  });

  it('mengirim 401 JSON, bukan pengalihan, bila klien meminta JSON', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { accept: 'application/json' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('menolak token sesi yang dikarang', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie: `${SESSION_COOKIE}=token-yang-tidak-pernah-dibuat` },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/admin/login');
  });

  it('membebaskan halaman masuk', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/login' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('membalas halaman HTML yang menjelaskan untuk alamat admin yang tidak ada', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/alamat-tidak-ada' });
    // Dialihkan karena belum masuk; setelah masuk harus berupa HTML 404.
    expect(response.statusCode).toBe(302);

    const cookie = await login();
    const authed = await app.inject({
      method: 'GET',
      url: '/admin/alamat-tidak-ada',
      headers: { cookie },
    });
    expect(authed.statusCode).toBe(404);
    expect(authed.headers['content-type']).toContain('text/html');
    expect(authed.body).toContain('Kembali ke ringkasan');
  });

  it('tetap membalas JSON 404 untuk alamat API yang tidak ada', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/tidak-ada' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});

/* ------------------------------------------------------------------ */

describe('cookie sesi', () => {
  it('diberi HttpOnly dan SameSite=Strict', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });

    const raw = String(response.headers['set-cookie']);
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Strict');
    expect(raw).toContain('Path=/admin');
    // Di pengujian bukan produksi, sehingga Secure tidak boleh ada — kalau ada,
    // panel tidak dapat dipakai lewat http di localhost.
    expect(raw).not.toContain('Secure');
  });

  it('menyimpan hash token, bukan token mentah', async () => {
    const cookie = await login();
    const token = cookie.slice(`${SESSION_COOKIE}=`.length);

    const { rows } = await ctx.db.query<{ session_hash: string }>(
      'SELECT session_hash FROM admin_sessions LIMIT 1',
    );
    // Inilah janjinya: isi tabel tidak dapat dipakai membajak sesi.
    expect(rows[0]?.session_hash).toBeDefined();
    expect(rows[0]?.session_hash).not.toBe(token);
    expect(rows[0]?.session_hash).toHaveLength(64);
  });

  it('menerima cookie yang sah dan menampilkan nama admin', async () => {
    const cookie = await login();
    const response = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Operator Uji');
    expect(response.body).toContain('Ringkasan');
  });

  it('mencabut sesi saat keluar', async () => {
    const cookie = await login();

    const logout = await app.inject({
      method: 'POST',
      url: '/admin/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(302);

    // Cookie lama tidak boleh lagi diterima.
    const after = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
    expect(after.statusCode).toBe(302);

    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM admin_sessions',
    );
    expect(rows[0]?.total).toBe(0);
  });

  it('menolak sesi yang akunnya dinonaktifkan', async () => {
    const cookie = await login();
    const admin = await admins.findAdminByUsername(ADMIN_USERNAME);
    await admins.setAdminActive(admin!.adminId, false);

    const response = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/admin/login');
  });

  it('mencabut seluruh sesi saat kata sandi berganti', async () => {
    const cookie = await login();
    const admin = await admins.findAdminByUsername(ADMIN_USERNAME);

    const changed = await admins.changePassword(admin!.adminId, ADMIN_PASSWORD, 'kata-sandi-baru-456');
    expect(changed).toBe(true);

    const response = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
    expect(response.statusCode).toBe(302);

    // Kata sandi lama tidak lagi berlaku; yang baru berlaku.
    expect(await admins.findAdminByUsername(ADMIN_USERNAME)).not.toBeNull();
    const stored = (await admins.findAdminByUsername(ADMIN_USERNAME))!.passwordHash;
    expect(await verifyPassword(ADMIN_PASSWORD, stored)).toBe(false);
    expect(await verifyPassword('kata-sandi-baru-456', stored)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe('masuk', () => {
  it('menolak kata sandi yang salah tanpa membocorkan mana yang salah', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: { username: ADMIN_USERNAME, password: 'salah-sekali' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).toContain('Nama pengguna atau kata sandi salah');
  });

  it('memberi pesan yang sama untuk nama pengguna yang tidak ada', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: { username: 'tidak-ada-orang-ini', password: 'apa pun' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).toContain('Nama pengguna atau kata sandi salah');
  });

  it('membatasi percobaan berulang', async () => {
    let blocked = false;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/admin/login',
        payload: { username: ADMIN_USERNAME, password: `salah-${String(attempt)}` },
      });
      if (response.statusCode === 429) {
        blocked = true;
        expect(response.body).toContain('Terlalu banyak percobaan');
        break;
      }
    }
    expect(blocked).toBe(true);
  });

  it('tidak mengalihkan ke luar panel meski diminta', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: {
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        next: 'https://situs-jahat.example/curi',
      },
    });
    expect(response.statusCode).toBe(302);
    // Alamat luar diabaikan; hanya alamat internal yang dihormati.
    expect(response.headers.location).toBe('/admin');
  });

  it('tidak mengizinkan masuk dua kali dalam satu sesi', async () => {
    const cookie = await login();
    const response = await app.inject({
      method: 'GET',
      url: '/admin/login',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/admin');
  });
});

/* ------------------------------------------------------------------ */

describe('audit', () => {
  it('mencatat percobaan masuk yang gagal', async () => {
    await app.inject({
      method: 'POST',
      url: '/admin/login',
      payload: { username: ADMIN_USERNAME, password: 'salah' },
    });

    const { rows } = await ctx.db.query<{ action: string }>(
      'SELECT action FROM admin_audit_log ORDER BY created_at DESC',
    );
    expect(rows.map((row) => row.action)).toContain('login.failed');
  });

  it('mencatat tindakan yang mengubah keadaan melalui halaman', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/settings',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ key: 'promo.banner_text', value: 'Diskon peluncuran', description: 'Banner beranda' }),
    });

    const { rows } = await ctx.db.query<{ action: string; target_id: string }>(
      'SELECT action, target_id FROM admin_audit_log ORDER BY created_at DESC LIMIT 1',
    );
    expect(rows[0]?.action).toBe('setting.update');
    expect(rows[0]?.target_id).toBe('promo.banner_text');
  });

  it('tidak mencatat kata sandi di catatan audit', async () => {
    const cookie = await login();
    await app.inject({
      method: 'POST',
      url: '/admin/password',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ currentPassword: ADMIN_PASSWORD, newPassword: 'kata-sandi-baru-789' }),
    });

    const { rows } = await ctx.db.query<{ detail: unknown; action: string }>(
      'SELECT detail, action FROM admin_audit_log',
    );
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(ADMIN_PASSWORD);
    expect(serialized).not.toContain('kata-sandi-baru-789');
  });
});

/* ------------------------------------------------------------------ */

describe('pengaturan', () => {
  it('menyimpan nilai JSON dan membacanya kembali', async () => {
    const cookie = await login();
    const settings = new SettingsRepository(ctx.db);

    await app.inject({
      method: 'POST',
      url: '/admin/settings',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ key: 'promo.free_tier_multiplier', value: '2', description: 'Kuota dua kali' }),
    });

    expect(await settings.getSetting('promo.free_tier_multiplier')).toBe(2);
    expect(await settings.quotaMultiplier('free')).toBe(2);
  });

  it('menyimpan teks biasa ketika nilainya bukan JSON', async () => {
    const cookie = await login();
    const settings = new SettingsRepository(ctx.db);

    await app.inject({
      method: 'POST',
      url: '/admin/settings',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      // Tanpa tanda kutip: admin bermaksud menulis teks, bukan membuat galat.
      payload: form({ key: 'display.token_label', value: 'koin' }),
    });

    expect(await settings.getSetting('display.token_label')).toBe('koin');
  });

  it('menolak kunci pengaturan yang bentuknya salah', async () => {
    const cookie = await login();
    await app.inject({
      method: 'POST',
      url: '/admin/settings',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ key: 'TanpaTitik', value: '1' }),
    });

    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM app_settings',
    );
    expect(rows[0]?.total).toBe(0);
  });

  it('mengabaikan pengali kuota di bawah 1', async () => {
    const settings = new SettingsRepository(ctx.db);
    await settings.setSetting({
      key: 'promo.free_tier_multiplier',
      value: 0.5,
      description: '',
      updatedBy: 'uji',
    });
    // Pengali tidak boleh dipakai memotong kuota diam-diam.
    expect(await settings.quotaMultiplier('free')).toBe(1);
  });

  it('memakai nilai bawaan untuk pengaturan yang belum pernah disetel', async () => {
    const settings = new SettingsRepository(ctx.db);
    // Sesuai KNOWN_SETTINGS: mesin masih simulator sebelum dinyatakan sebaliknya.
    expect(await settings.getSetting('engine.simulator')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe('CRUD dunia', () => {
  it('membuat dunia baru sebagai versi 1', async () => {
    const cookie = await login();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: 'Lentera di Ujung Jalan',
        synopsis: 'Seorang penjaga desa menemukan cahaya yang tidak seharusnya ada.',
        premise: 'Desa kecil di tepi hutan, tiga hari sebelum purnama.',
        coverAssetId: 'a_cover_lentera',
        status: 'draft',
        contentRating: 'all',
        genres: ['drama', 'mystery'],
        locales: ['id-ID'],
      }),
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/admin/worlds/w_');

    const worlds = await catalogAdmin.listWorlds();
    const created = worlds.find((world) => world.title === 'Lentera di Ujung Jalan');
    expect(created).toBeDefined();
    expect(created?.worldVersion).toBe(1);
    expect(created?.status).toBe('draft');
    expect(created?.genres.sort()).toEqual(['drama', 'mystery']);
    expect(created?.locales).toEqual(['id-ID']);
  });

  it('menolak dunia tanpa genre atau tanpa bahasa balasan', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: 'Tanpa Genre',
        synopsis: 'Sinopsis',
        premise: 'Premis',
        coverAssetId: 'a_cover_lentera',
        status: 'draft',
        contentRating: 'all',
        locales: ['id-ID'],
      }),
    });

    const worlds = await catalogAdmin.listWorlds();
    expect(worlds.find((world) => world.title === 'Tanpa Genre')).toBeUndefined();
  });

  /**
   * Inilah aturan FR-54. Yang diuji bukan "versi bertambah", melainkan bahwa
   * perjalanan pemain yang sudah ada TIDAK berubah setelah katalog disunting —
   * itulah alasan versi baru dibuat.
   */
  it('menyunting dunia terbit membuat versi baru dan tidak mengubah versi lama', async () => {
    const cookie = await login();

    // Dunia versi 1, diterbitkan.
    const create = await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: 'Judul Awal',
        synopsis: 'Sinopsis awal',
        premise: 'Premis awal',
        coverAssetId: 'a_cover_lentera',
        status: 'published',
        contentRating: 'all',
        genres: ['drama'],
        locales: ['id-ID'],
      }),
    });
    const location = String(create.headers.location);
    const worldId = location.split('/admin/worlds/')[1]?.split('?')[0] ?? '';
    expect(worldId).not.toBe('');

    const before = await catalogAdmin.findWorld(worldId);
    expect(before?.worldVersion).toBe(1);
    expect(before?.title).toBe('Judul Awal');

    // Perjalanan pemain mengunci versi 1. Akunnya dibuat lebih dulu karena
    // `journeys.account_id` berkunci asing ke `accounts`.
    await ctx.db.query("INSERT INTO accounts (account_id) VALUES ('acc_uji')");
    await ctx.db.query(
      `INSERT INTO journeys (journey_id, account_id, world_id, world_version, persona_name,
                             persona_age, response_locale)
       VALUES ('jr_uji', 'acc_uji', $1, 1, 'Rani', 24, 'id-ID')`,
      [worldId],
    );

    // Sunting dunianya.
    await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId,
        title: 'Judul Sudah Diubah',
        synopsis: 'Sinopsis baru',
        premise: 'Premis baru',
        coverAssetId: 'a_cover_lentera',
        status: 'published',
        contentRating: 'all',
        genres: ['mystery'],
        locales: ['id-ID'],
      }),
    });

    // Versi 1 tetap utuh — inilah janji kepada pemain yang sedang membaca.
    const { rows: oldRows } = await ctx.db.query<{ title: string; status: string }>(
      'SELECT title, status FROM world_versions WHERE world_id = $1 AND world_version = 1',
      [worldId],
    );
    expect(oldRows[0]?.title).toBe('Judul Awal');

    // Versi 2 memuat perubahan, dan versi 1 diarsipkan (bukan dihapus).
    const { rows: newRows } = await ctx.db.query<{ title: string; status: string }>(
      'SELECT title, status FROM world_versions WHERE world_id = $1 AND world_version = 2',
      [worldId],
    );
    expect(newRows[0]?.title).toBe('Judul Sudah Diubah');
    expect(newRows[0]?.status).toBe('published');

    const { rows: archived } = await ctx.db.query<{ status: string }>(
      'SELECT status FROM world_versions WHERE world_id = $1 AND world_version = 1',
      [worldId],
    );
    expect(archived[0]?.status).toBe('retired');

    // Perjalanan lama masih menunjuk versi 1.
    const { rows: journeys } = await ctx.db.query<{ world_version: number }>(
      'SELECT world_version FROM journeys WHERE journey_id = $1',
      ['jr_uji'],
    );
    expect(journeys[0]?.world_version).toBe(1);
  });

  it('mengarsipkan versi terbit sebelumnya, bukan menghapusnya', async () => {
    const cookie = await login();

    const worlds = await catalogAdmin.listWorlds();
    const target = worlds.find((world) => world.journeyCount === 0);
    expect(target).toBeDefined();

    await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: target!.worldId,
        title: `${target!.title} (revisi)`,
        synopsis: target!.synopsis,
        premise: target!.premise,
        coverAssetId: target!.coverAssetId,
        status: 'published',
        contentRating: target!.contentRating,
        genres: target!.genres,
        locales: target!.locales,
      }),
    });

    // Seluruh versi lama masih ada; tidak satu pun hilang.
    const { rows } = await ctx.db.query<{ world_version: number }>(
      'SELECT world_version FROM world_versions WHERE world_id = $1 ORDER BY world_version ASC',
      [target!.worldId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((row) => row.world_version === target!.worldVersion)).toBe(true);
  });

  it('menolak menghapus dunia yang dipakai perjalanan pemain', async () => {
    const cookie = await login();

    const create = await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: 'Dunia Berpenghuni',
        synopsis: 'S',
        premise: 'P',
        coverAssetId: 'a_cover_lentera',
        status: 'published',
        contentRating: 'all',
        genres: ['drama'],
        locales: ['id-ID'],
      }),
    });
    const worldId = String(create.headers.location).split('/admin/worlds/')[1]?.split('?')[0] ?? '';

    await ctx.db.query("INSERT INTO accounts (account_id) VALUES ('acc_ada')");
    await ctx.db.query(
      `INSERT INTO journeys (journey_id, account_id, world_id, world_version, persona_name,
                             persona_age, response_locale)
       VALUES ('jr_ada', 'acc_ada', $1, 1, 'Bagas', 30, 'id-ID')`,
      [worldId],
    );

    await app.inject({
      method: 'POST',
      url: '/admin/worlds/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ worldId }),
    });

    // Dunia harus tetap ada; penghapusan akan memutus riwayat orang lain.
    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM worlds WHERE world_id = $1',
      [worldId],
    );
    expect(rows[0]?.total).toBe(1);
  });

  it('menghapus dunia yang belum pernah dipakai siapa pun', async () => {
    const cookie = await login();

    const create = await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: 'Dunia Sementara',
        synopsis: 'S',
        premise: 'P',
        coverAssetId: 'a_cover_lentera',
        status: 'draft',
        contentRating: 'all',
        genres: ['drama'],
        locales: ['id-ID'],
      }),
    });
    const worldId = String(create.headers.location).split('/admin/worlds/')[1]?.split('?')[0] ?? '';

    await app.inject({
      method: 'POST',
      url: '/admin/worlds/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ worldId }),
    });

    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM worlds WHERE world_id = $1',
      [worldId],
    );
    expect(rows[0]?.total).toBe(0);
  });

  it('menolak status yang tidak dikenal', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: 'Status Aneh',
        synopsis: 'S',
        premise: 'P',
        coverAssetId: 'a_cover_lentera',
        status: 'sudah-terbit-lama',
        contentRating: 'all',
        genres: ['drama'],
        locales: ['id-ID'],
      }),
    });

    const worlds = await catalogAdmin.listWorlds();
    expect(worlds.find((world) => world.title === 'Status Aneh')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */

/**
 * Master karakter.
 *
 * Berbeda dari uji wizard — yang menguji karakter DI DALAM sebuah versi dunia —
 * uji di sini menguji karakter sebagai data yang berdiri sendiri: nama dan
 * gambar-gambar ekspresinya, tanpa dunia. Perilaku "menambah karakter membuat
 * versi baru dunianya" sudah tidak ada di sini karena memang sudah tidak ada di
 * produk: itu pekerjaan wizard, dan diujikan di `wizard.test.ts`.
 */
describe('master karakter', () => {
  /** Mengirim formulir master dan mengembalikan URL pengalihannya. */
  async function createCharacter(
    cookie: string,
    name: string,
    expressions: { name: string; mediaId: string; usage?: string }[],
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/characters',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        characterId: '',
        name,
        expression: expressions.map((item) => item.name),
        expressionMedia: expressions.map((item) => item.mediaId),
        expressionUsage: expressions.map((item) => item.usage ?? ''),
      }),
    });
    expect(response.statusCode).toBe(302);
    return String(response.headers.location);
  }

  it('membuat karakter dari nama dan gambar ekspresinya', async () => {
    const cookie = await login();
    const netral = await upload(cookie, png(512, 768, 'netral'));
    const senyum = await upload(cookie, png(512, 768, 'senyum'));

    const location = await createCharacter(cookie, 'Elysia', [
      { name: 'netral', mediaId: netral, usage: 'dipakai saat tenang' },
      { name: 'senyum', mediaId: senyum },
    ]);
    expect(location).toContain('notice=created');

    const elysia = (await characters.list()).find((row) => row.name === 'Elysia');
    expect(elysia).toBeDefined();
    expect(elysia?.expressions.map((item) => item.expression)).toEqual(['netral', 'senyum']);
    expect(elysia?.expressions[0]?.mediaId).toBe(netral);
    expect(elysia?.expressions[0]?.usageNote).toBe('dipakai saat tenang');
    // Urutan bermakna: ekspresi pertama menjadi potret bawaan.
    expect(elysia?.expressions.map((item) => item.position)).toEqual([0, 1]);
  });

  it('menolak ekspresi yang gambarnya belum diunggah', async () => {
    const cookie = await login();
    const location = await createCharacter(cookie, 'Tanpa Gambar', [
      { name: 'netral', mediaId: '' },
    ]);
    expect(location).toContain('notice=character-no-expression');
    expect(await characters.list()).toHaveLength(0);
  });

  it('menolak id media yang bentuknya tidak sah, walau barisnya ada', async () => {
    const cookie = await login();

    // Baris ini sengaja disisipkan langsung, meniru baris yang bentuknya salah.
    // Id media selalu SHA-256 heksadesimal, dan penyaji berkas menolak bentuk
    // lain — jadi baris seperti ini akan menghasilkan potret yang terpasang di
    // markup tetapi tidak pernah dapat dimuat. Keberadaannya saja tidak cukup;
    // bentuknya harus diperiksa.
    await ctx.db.query(
      `INSERT INTO media_blobs (media_id, content_type, byte_size, width, height, content_base64)
       VALUES ('m_bukan_hash', 'image/png', 8, 1, 1, 'iVBORw0KGgo=')`,
    );

    const location = await createCharacter(cookie, 'Bentuk Salah', [
      { name: 'netral', mediaId: 'm_bukan_hash' },
    ]);
    expect(location).toContain('notice=character-no-expression');
    expect(await characters.list()).toHaveLength(0);
  });

  it('menolak dua ekspresi bernama sama, dan menyebut nama yang kembar', async () => {
    const cookie = await login();
    const first = await upload(cookie, png(512, 768, 'a'));
    const second = await upload(cookie, png(512, 768, 'b'));

    // Bedanya HANYA huruf besar-kecil. Dua baris "netral" dan "Netral" tampak
    // sama bagi pembaca, dan pemilih ekspresi menjadi ambigu — jadi
    // perbandingannya sengaja tidak membedakan huruf besar-kecil.
    const location = await createCharacter(cookie, 'Kembar', [
      { name: 'netral', mediaId: first },
      { name: 'Netral', mediaId: second },
    ]);
    expect(location).toContain('notice=character-duplicate-expression');
    // Perinciannya menyebut nama yang kembar, bukan sekadar "ada yang kembar".
    // Yang disebut adalah baris KEDUA — baris yang memperkenalkan kembarnya,
    // dan itulah baris yang perlu diubah atau dihapus admin.
    expect(location).toContain('detail=Netral');
    expect(await characters.list()).toHaveLength(0);
  });

  it('menolak nama kosong', async () => {
    const cookie = await login();
    const media = await upload(cookie, png(512, 768, 'c'));
    const location = await createCharacter(cookie, '   ', [{ name: 'netral', mediaId: media }]);
    expect(location).toContain('notice=character-name-invalid');
    expect(await characters.list()).toHaveLength(0);
  });

  it('mengganti seluruh daftar ekspresi saat disunting, bukan menumpuknya', async () => {
    const cookie = await login();
    const a = await upload(cookie, png(512, 768, 'x'));
    const b = await upload(cookie, png(512, 768, 'y'));

    await createCharacter(cookie, 'Awal', [{ name: 'netral', mediaId: a }]);
    const created = (await characters.list())[0];
    expect(created).toBeDefined();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/characters',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        characterId: created!.characterId,
        name: 'Sudah Diubah',
        expression: ['tenang', 'marah'],
        expressionMedia: [a, b],
        expressionUsage: ['', ''],
      }),
    });
    expect(response.statusCode).toBe(302);
    expect(String(response.headers.location)).toContain('notice=saved');

    const list = await characters.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Sudah Diubah');
    // Daftar lama DIGANTI: 'netral' tidak boleh tersisa di samping yang baru.
    expect(list[0]?.expressions.map((item) => item.expression)).toEqual(['tenang', 'marah']);
  });

  it('menghapus karakter beserta baris ekspresinya', async () => {
    const cookie = await login();
    const media = await upload(cookie, png(512, 768, 'z'));
    await createCharacter(cookie, 'Akan Dihapus', [{ name: 'netral', mediaId: media }]);

    const created = (await characters.list())[0];
    const response = await app.inject({
      method: 'POST',
      url: '/admin/characters/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ characterId: created!.characterId }),
    });
    expect(response.statusCode).toBe(302);
    expect(String(response.headers.location)).toContain('notice=deleted');
    expect(await characters.list()).toHaveLength(0);

    // Baris ekspresinya ikut hilang — tidak boleh ada sisa yang menunjuk
    // karakter yang sudah tidak ada.
    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM character_expressions',
    );
    expect(rows[0]?.total).toBe(0);
  });

  it('mencatat penghapusan karakter di audit, dengan id karakternya', async () => {
    const cookie = await login();
    const media = await upload(cookie, png(512, 768, 'audit'));
    await createCharacter(cookie, 'Beraudit', [{ name: 'netral', mediaId: media }]);

    const created = (await characters.list())[0];
    await app.inject({
      method: 'POST',
      url: '/admin/characters/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ characterId: created!.characterId }),
    });

    const { rows } = await ctx.db.query<{ action: string; target_id: string }>(
      "SELECT action, target_id FROM admin_audit_log WHERE action = 'character.delete'",
    );
    expect(rows).toHaveLength(1);
    // Sasaran audit adalah id KARAKTER, bukan gabungan dunia/karakter seperti
    // dulu — master karakter tidak hidup di dalam dunia mana pun.
    expect(rows[0]?.target_id).toBe(created!.characterId);
  });

  it('melaporkan karakter yang tidak ada saat dihapus, tanpa membuat baris baru', async () => {
    const cookie = await login();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/characters/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ characterId: 'char_tidak_pernah_ada' }),
    });
    expect(response.statusCode).toBe(302);
    expect(String(response.headers.location)).toContain('notice=not-found');
    expect(await characters.list()).toHaveLength(0);
  });

  it('menyajikan daftar dan formulir master sebagai halaman yang hidup', async () => {
    const cookie = await login();
    const media = await upload(cookie, png(512, 768, 'w'));
    await createCharacter(cookie, 'Tampil', [{ name: 'netral', mediaId: media }]);

    const list = await app.inject({ method: 'GET', url: '/admin/characters', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.body).toContain('Tampil');
    expect(list.body).toContain('1 ekspresi');

    const created = (await characters.list())[0];
    const formPage = await app.inject({
      method: 'GET',
      url: `/admin/characters-form?character=${created!.characterId}`,
      headers: { cookie },
    });
    expect(formPage.statusCode).toBe(200);
    // Baris ekspresi yang sudah ada dirender LENGKAP dengan gambarnya, bukan
    // sebagai kotak kosong yang menuntut unggahan ulang.
    expect(formPage.body).toContain(`value="${media}"`);
    expect(formPage.body).toContain('data-expression-scope');
  });
});

/* ------------------------------------------------------------------ */

describe('manajemen akun', () => {
  /** Menyiapkan akun pemain dengan baris pemakaian hari ini. */
  async function seedAccount(accountId: string, spent: number): Promise<void> {
    await ctx.db.query('INSERT INTO accounts (account_id, display_name, age) VALUES ($1,$2,$3)', [
      accountId,
      'Pemain Uji',
      25,
    ]);
    const today = new Date().toISOString().slice(0, 10);
    await ctx.db.query(
      `INSERT INTO usage_days (account_id, usage_date, tier, spent_tokens, reserved_tokens)
       VALUES ($1,$2,'free',$3,0)`,
      [accountId, today, spent],
    );
  }

  /** Menyiapkan akun tanpa baris pemakaian — untuk menguji keadaan awal. */
  async function seedBareAccount(accountId: string): Promise<void> {
    await ctx.db.query('INSERT INTO accounts (account_id) VALUES ($1)', [accountId]);
  }

  it('menampilkan akun dan pemakaiannya', async () => {
    await seedAccount('acc_tampil', 12345);
    const cookie = await login();

    const response = await app.inject({ method: 'GET', url: '/admin/accounts', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('acc_tampil');
    expect(response.body).toContain('12.345');
  });

  it('mencari akun berdasarkan ID', async () => {
    await seedAccount('acc_alfabets', 10);
    await seedAccount('acc_beta', 20);
    const cookie = await login();

    const response = await app.inject({
      method: 'GET',
      url: '/admin/accounts?search=alfabets',
      headers: { cookie },
    });
    expect(response.body).toContain('acc_alfabets');
  });

  it('mengubah tier untuk hari ini', async () => {
    await seedAccount('acc_tier', 100);
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/accounts/tier',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ accountId: 'acc_tier', tier: 'paid' }),
    });

    const accounts = new AccountsAdminRepository(ctx.db);
    const account = await accounts.findAccount('acc_tier');
    expect(account?.tier).toBe('paid');
  });

  it('mengosongkan pemakaian hari ini tanpa menghapus buku besar', async () => {
    await seedAccount('acc_reset', 5000);
    const today = new Date().toISOString().slice(0, 10);

    // `usage_entries` berkunci asing ke `operations`, jadi operasinya dibuat
    // lebih dulu. Entri ini harus TETAP ADA setelah reset — hanya hitungan
    // hariannya yang dikosongkan.
    await ctx.db.query(
      `INSERT INTO operations (operation_id, account_id, kind, state)
       VALUES ('op_uji','acc_reset','submit_choice','succeeded')`,
    );
    await ctx.db.query(
      `INSERT INTO usage_entries (entry_id, account_id, usage_date, operation_id,
                                  prompt_tokens, completion_tokens, charged_total)
       VALUES ('en_uji','acc_reset',$1,'op_uji',100,200,300)`,
      [today],
    );

    const cookie = await login();
    await app.inject({
      method: 'POST',
      url: '/admin/accounts/reset',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ accountId: 'acc_reset' }),
    });

    const accounts = new AccountsAdminRepository(ctx.db);
    const account = await accounts.findAccount('acc_reset');
    expect(account?.spentToday).toBe(0);

    // Jejak penagihan tetap ada; hanya hitungan hariannya yang direset.
    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM usage_entries WHERE account_id = $1',
      ['acc_reset'],
    );
    expect(rows[0]?.total).toBe(1);
  });

  it('menambah dan mengurangi saldo bonus tanpa membuatnya negatif', async () => {
    await seedAccount('acc_bonus', 0);
    const accounts = new AccountsAdminRepository(ctx.db);

    const added = await accounts.adjustBonus({ accountId: 'acc_bonus', delta: 50_000, reason: 'kompensasi' });
    expect(added.newBalance).toBe(50_000);

    const reduced = await accounts.adjustBonus({ accountId: 'acc_bonus', delta: -20_000, reason: 'koreksi' });
    expect(reduced.newBalance).toBe(30_000);

    // Pengurangan melebihi saldo dijepit di nol, bukan menjadi negatif.
    const floored = await accounts.adjustBonus({ accountId: 'acc_bonus', delta: -999_999, reason: 'koreksi besar' });
    expect(floored.newBalance).toBe(0);
    expect(floored.newBalance).toBeGreaterThanOrEqual(0);
  });

  it('menampilkan rincian akun beserta perjalanannya', async () => {
    await seedAccount('acc_rinci', 777);
    await ctx.db.query(
      `INSERT INTO journeys (journey_id, account_id, world_id, world_version, persona_name,
                             persona_age, response_locale)
       VALUES ('jr_rinci','acc_rinci','w_lentera-terakhir',3,'Dewi',28,'id-ID')`,
    );

    const cookie = await login();
    const response = await app.inject({
      method: 'GET',
      url: '/admin/accounts/acc_rinci',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Dewi');
    expect(response.body).toContain('w_lentera-terakhir');
  });
});

/* ------------------------------------------------------------------ */

describe('model dan rantai fallback', () => {
  /**
   * Satu provider uji.
   *
   * Basis data dibuat ulang sebelum SETIAP uji, jadi prefix yang sama aman
   * dipakai berulang — dan keunikan prefix tetap diuji di tempatnya sendiri.
   * Model tidak dapat disimpan tanpa provider, karena setiap model harus tahu
   * ke alamat mana ia dikirim.
   */
  async function seedProvider(): Promise<string> {
    const created = await new ProvidersRepository(ctx.db).create({
      name: 'Penyedia Uji',
      prefix: 'uji',
      apiType: 'chat-completions',
      baseUrl: 'https://example.test/v1',
      apiKeyEnv: '',
      isActive: true,
      notes: '',
    });
    if (!created.ok) {
      throw new Error();
    }
    return created.providerId;
  }

  it('menyimpan model beserta biaya per gilirannya', async () => {
    const cookie = await login();
    const providerId = await seedProvider();

    await app.inject({
      method: 'POST',
      url: '/admin/models',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        modelId: '',
        label: 'Model Uji',
        providerId,
        modelKey: 'model-uji-latest',
        estimatedTurnCost: '900',
        contextTokens: '64000',
        position: '0',
        tier: 'free',
        notes: 'hanya untuk pengujian',
        isActive: 'true',
      }),
    });

    const models = new ModelsRepository(ctx.db);
    const list = await models.listModels();
    const created = list.find((model) => model.label === 'Model Uji');
    expect(created).toBeDefined();
    expect(created?.estimatedTurnCost).toBe(900);
    expect(created?.isActive).toBe(true);
    // Id lengkap yang dikenal penyedia tersusun dari prefix provider + nama model.
    expect(resolvedModelId(created!)).toBe('uji/model-uji-latest');
  });

  it('menonaktifkan model lain pada tier yang sama saat satu diaktifkan', async () => {
    const cookie = await login();
    const models = new ModelsRepository(ctx.db);
    const providerId = await seedProvider();

    for (const label of ['Model Satu', 'Model Dua']) {
      await models.saveModel({
        modelId: null,
        label,
        providerId,
      modelKey: 'model-uji',
        estimatedTurnCost: 500,
        contextTokens: 32_000,
        position: 0,
        tier: 'free',
        isActive: false,
        notes: '',
      });
    }

    // Dua model aktif pada posisi 0 akan membuat urutan rantai tidak menentu.
    await app.inject({
      method: 'POST',
      url: '/admin/models/toggle',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ modelId: 'model-satu', isActive: 'true' }),
    });
    await app.inject({
      method: 'POST',
      url: '/admin/models/toggle',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ modelId: 'model-dua', isActive: 'true' }),
    });

    const free = await models.fallbackChain('free');
    expect(free).toHaveLength(1);
    expect(free[0]?.modelId).toBe('model-dua');
  });

  it('menyusun rantai fallback menurut posisi', async () => {
    const models = new ModelsRepository(ctx.db);
    const providerId = await seedProvider();
    for (const [label, position] of [
      ['Fallback Kedua', 2],
      ['Utama', 0],
      ['Fallback Pertama', 1],
    ] as [string, number][]) {
      await models.saveModel({
        modelId: null,
        label,
        providerId,
      modelKey: 'model-uji',
        estimatedTurnCost: 100,
        contextTokens: 16_000,
        position,
        tier: 'free',
        isActive: true,
        notes: '',
      });
    }

    const chain = await models.fallbackChain('free');
    expect(chain.map((model) => model.position)).toEqual([0, 1, 2]);
  });

  it('melaporkan rantai yang belum punya model utama', async () => {
    const models = new ModelsRepository(ctx.db);
    const providerId = await seedProvider();
    await models.saveModel({
      modelId: null,
      label: 'Hanya Fallback',
      providerId,
      modelKey: 'model-uji',
      estimatedTurnCost: 100,
      contextTokens: 16_000,
      position: 1,
      tier: 'paid',
      isActive: true,
      notes: '',
    });

    const health = await models.chainHealth();
    const paid = health.find((item) => item.tier === 'paid');
    expect(paid?.activeCount).toBe(1);
    expect(paid?.hasPrimary).toBe(false);
  });

  it('menolak biaya per giliran nol atau negatif', async () => {
    const cookie = await login();
    const providerId = await seedProvider();

    await app.inject({
      method: 'POST',
      url: '/admin/models',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        modelId: '',
        label: 'Model Gratis',
        providerId,
        modelKey: 'model-uji',
        estimatedTurnCost: '0',
        contextTokens: '32000',
        position: '0',
        tier: 'free',
      }),
    });

    const models = new ModelsRepository(ctx.db);
    const list = await models.listModels();
    // Biaya nol akan membuat pemeriksaan anggaran FR-50 selalu lolos.
    expect(list.find((model) => model.label === 'Model Gratis')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */

describe('promosi', () => {
  it('membuat promosi dan menormalkan kode menjadi huruf besar', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/promotions',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        promotionId: '',
        code: 'hemat2026',
        label: 'Peluncuran',
        bonusTokens: '50000',
        maxRedemptions: '100',
        tierRequirement: 'any',
        oncePerAccount: 'on',
        isActive: 'on',
      }),
    });

    const list = await promotions.listPromotions();
    const created = list.find((promo) => promo.bonusTokens === 50_000);
    expect(created?.code).toBe('HEMAT2026');
    expect(created?.oncePerAccount).toBe(true);
    expect(created?.isLive).toBe(true);
  });

  it('menolak periode yang berakhir sebelum dimulai', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/promotions',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        promotionId: '',
        code: 'TERBALIK',
        label: 'Periode salah',
        bonusTokens: '1000',
        maxRedemptions: '0',
        tierRequirement: 'any',
        startsAt: '2026-12-31T10:00',
        endsAt: '2026-01-01T10:00',
        isActive: 'on',
      }),
    });

    const list = await promotions.listPromotions();
    expect(list.find((promo) => promo.code === 'TERBALIK')).toBeUndefined();
  });

  it('menolak kode dengan karakter yang tidak diizinkan', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/promotions',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        promotionId: '',
        code: 'KODE JAHAT',
        bonusTokens: '1000',
        maxRedemptions: '0',
        tierRequirement: 'any',
        isActive: 'on',
      }),
    });

    const list = await promotions.listPromotions();
    expect(list.find((promo) => promo.code === 'KODE JAHAT')).toBeUndefined();
  });

  /** Menyiapkan akun pemain agar penukaran dapat diuji. */
  async function seedAccount(accountId: string): Promise<void> {
    await ctx.db.query('INSERT INTO accounts (account_id) VALUES ($1)', [accountId]);
  }

  it('menukar kode dan menambah saldo bonus', async () => {
    await seedAccount('acc_tukar');
    const { promotionId } = await promotions.savePromotion({
      promotionId: null,
      code: 'BONUS100',
      label: '',
      bonusTokens: 100_000,
      maxRedemptions: 0,
      oncePerAccount: true,
      tierRequirement: 'any',
      startsAt: null,
      endsAt: null,
      isActive: true,
      notes: '',
    });
    expect(promotionId).toBeDefined();

    const result = await promotions.redeem({ code: 'BONUS100', accountId: 'acc_tukar', tier: 'free' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokensGranted).toBe(100_000);
      expect(result.newBalance).toBe(100_000);
    }
    expect(await promotions.bonusBalance('acc_tukar')).toBe(100_000);
  });

  it('menerima kode tanpa memandang besar-kecil huruf', async () => {
    await seedAccount('acc_huruf');
    await promotions.savePromotion({
      promotionId: null,
      code: 'CAMPURAN',
      label: '',
      bonusTokens: 5_000,
      maxRedemptions: 0,
      oncePerAccount: true,
      tierRequirement: 'any',
      startsAt: null,
      endsAt: null,
      isActive: true,
      notes: '',
    });

    // Pemain tidak seharusnya gagal hanya karena menulis huruf kecil.
    const result = await promotions.redeem({ code: 'campuran', accountId: 'acc_huruf', tier: 'free' });
    expect(result.ok).toBe(true);
  });

  /**
   * Inilah yang membuktikan pengaman sesungguhnya ada di DATABASE.
   *
   * Pemeriksaan di aplikasi sengaja dilewati dengan memanggil `redeem` dua kali
   * TANPA jeda pembacaan — keduanya sama-sama lolos pemeriksaan "sudah pernah
   * ditukar?", lalu indeks unik parsial yang menolak yang kedua.
   */
  it('menolak penukaran ganda lewat indeks unik parsial', async () => {
    await seedAccount('acc_ganda');
    await promotions.savePromotion({
      promotionId: null,
      code: 'SEKALI',
      label: '',
      bonusTokens: 10_000,
      maxRedemptions: 0,
      oncePerAccount: true,
      tierRequirement: 'any',
      startsAt: null,
      endsAt: null,
      isActive: true,
      notes: '',
    });

    const [first, second] = await Promise.all([
      promotions.redeem({ code: 'SEKALI', accountId: 'acc_ganda', tier: 'free' }),
      promotions.redeem({ code: 'SEKALI', accountId: 'acc_ganda', tier: 'free' }),
    ]);

    const successes = [first, second].filter((result) => result.ok);
    expect(successes).toHaveLength(1);

    // Yang gagal membawa kode yang dapat diterjemahkan menjadi pesan jelas.
    const failure = [first, second].find((result) => !result.ok);
    expect(failure).toBeDefined();
    if (failure && !failure.ok) {
      expect(['ALREADY_REDEEMED']).toContain(failure.code);
    }

    // Saldo hanya bertambah sekali — tidak ada token yang diberikan dua kali.
    expect(await promotions.bonusBalance('acc_ganda')).toBe(10_000);
  });

  it('mengizinkan penukaran berulang bila batasnya dimatikan', async () => {
    await seedAccount('acc_berulang');
    await promotions.savePromotion({
      promotionId: null,
      code: 'BERULANG',
      label: '',
      bonusTokens: 1_000,
      maxRedemptions: 0,
      oncePerAccount: false,
      tierRequirement: 'any',
      startsAt: null,
      endsAt: null,
      isActive: true,
      notes: '',
    });

    const first = await promotions.redeem({ code: 'BERULANG', accountId: 'acc_berulang', tier: 'free' });
    const second = await promotions.redeem({ code: 'BERULANG', accountId: 'acc_berulang', tier: 'free' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // Inilah gunanya indeks parsial: baris ber-guard NULL tidak dibatasi.
    expect(await promotions.bonusBalance('acc_berulang')).toBe(2_000);
  });

  it('menolak kode yang tidak berlaku karena waktu', async () => {
    await seedAccount('acc_waktu');
    await promotions.savePromotion({
      promotionId: null,
      code: 'KEDALUWARSA',
      label: '',
      bonusTokens: 1_000,
      maxRedemptions: 0,
      oncePerAccount: true,
      tierRequirement: 'any',
      startsAt: new Date('2020-01-01'),
      endsAt: new Date('2020-02-01'),
      isActive: true,
      notes: '',
    });

    const result = await promotions.redeem({ code: 'KEDALUWARSA', accountId: 'acc_waktu', tier: 'free' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('EXPIRED');
    }
  });

  it('menolak kode yang belum mulai', async () => {
    await seedAccount('acc_belum');
    const future = new Date(Date.now() + 86_400_000);
    await promotions.savePromotion({
      promotionId: null,
      code: 'BESOK',
      label: '',
      bonusTokens: 1_000,
      maxRedemptions: 0,
      oncePerAccount: true,
      tierRequirement: 'any',
      startsAt: future,
      endsAt: null,
      isActive: true,
      notes: '',
    });

    const result = await promotions.redeem({ code: 'BESOK', accountId: 'acc_belum', tier: 'free' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_STARTED');
    }
  });

  it('menghormati batas jumlah penukaran', async () => {
    await seedAccount('acc_batas_a');
    await seedAccount('acc_batas_b');
    const { promotionId } = await promotions.savePromotion({
      promotionId: null,
      code: 'TERBATAS',
      label: '',
      bonusTokens: 1_000,
      maxRedemptions: 1,
      oncePerAccount: true,
      tierRequirement: 'any',
      startsAt: null,
      endsAt: null,
      isActive: true,
      notes: '',
    });

    const first = await promotions.redeem({ code: 'TERBATAS', accountId: 'acc_batas_a', tier: 'free' });
    const second = await promotions.redeem({ code: 'TERBATAS', accountId: 'acc_batas_b', tier: 'free' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe('EXHAUSTED');
    }

    const list = await promotions.listPromotions();
    const promo = list.find((item) => item.promotionId === promotionId);
    expect(promo?.redemptionCount).toBe(1);
    expect(promo?.isLive).toBe(false);
  });

  it('menolak promosi yang hanya untuk tier lain', async () => {
    await seedAccount('acc_tier_salah');
    await promotions.savePromotion({
      promotionId: null,
      code: 'HANYAPAID',
      label: '',
      bonusTokens: 1_000,
      maxRedemptions: 0,
      oncePerAccount: true,
      tierRequirement: 'paid',
      startsAt: null,
      endsAt: null,
      isActive: true,
      notes: '',
    });

    const result = await promotions.redeem({ code: 'HANYAPAID', accountId: 'acc_tier_salah', tier: 'free' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('TIER_MISMATCH');
    }
  });

  it('menolak promosi yang dimatikan', async () => {
    await seedAccount('acc_mati');
    await promotions.savePromotion({
      promotionId: null,
      code: 'MATI',
      label: '',
      bonusTokens: 1_000,
      maxRedemptions: 0,
      oncePerAccount: true,
      tierRequirement: 'any',
      startsAt: null,
      endsAt: null,
      isActive: false,
      notes: '',
    });

    const result = await promotions.redeem({ code: 'MATI', accountId: 'acc_mati', tier: 'free' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INACTIVE');
    }
  });

  it('menolak kode yang tidak dikenal maupun kosong', async () => {
    await seedAccount('acc_kosong');
    const missing = await promotions.redeem({ code: 'TIDAKADA', accountId: 'acc_kosong', tier: 'free' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe('NOT_FOUND');
    }

    const empty = await promotions.redeem({ code: '   ', accountId: 'acc_kosong', tier: 'free' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.code).toBe('EMPTY_CODE');
    }
  });

  it('menghapus promosi beserta riwayat penukarannya', async () => {
    await seedAccount('acc_hapus');
    const { promotionId } = await promotions.savePromotion({
      promotionId: null,
      code: 'DIHAPUS',
      label: '',
      bonusTokens: 2_000,
      maxRedemptions: 0,
      oncePerAccount: true,
      tierRequirement: 'any',
      startsAt: null,
      endsAt: null,
      isActive: true,
      notes: '',
    });
    await promotions.redeem({ code: 'DIHAPUS', accountId: 'acc_hapus', tier: 'free' });

    await promotions.deletePromotion(promotionId);

    const { rows } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM promotion_redemptions WHERE promotion_id = $1',
      [promotionId],
    );
    expect(rows[0]?.total).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe('akun admin', () => {
  it('menolak nama pengguna yang sudah dipakai tanpa memandang besar-kecil huruf', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/admins',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        username: 'OPERATOR',
        displayName: 'Kembar',
        password: 'kata-sandi-lain-1',
        role: 'editor',
      }),
    });

    const list = await admins.listAdmins();
    // "Operator" dan "operator" tidak boleh hidup berdampingan.
    expect(list).toHaveLength(1);
  });

  it('menolak kata sandi admin baru yang terlalu pendek', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/admins',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ username: 'pendek', password: '123', role: 'editor' }),
    });

    const list = await admins.listAdmins();
    expect(list.find((admin) => admin.username === 'pendek')).toBeUndefined();
  });

  it('menolak menonaktifkan akun sendiri', async () => {
    const cookie = await login();
    const me = await admins.findAdminByUsername(ADMIN_USERNAME);

    await app.inject({
      method: 'POST',
      url: '/admin/admins/toggle',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ adminId: me!.adminId, isActive: 'false' }),
    });

    // Mengunci diri sendiri akan mengakhiri sesi ini juga.
    const still = await admins.findAdminByUsername(ADMIN_USERNAME);
    expect(still?.isActive).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

/**
 * Siklus hidup dunia.
 *
 * Yang diuji di sini adalah cacat yang tidak pernah muncul sebagai galat:
 * halaman dunia menyuruh admin "ubah statusnya menjadi retired", tetapi
 * formulirnya tidak punya pilihan itu, sehingga permintaan itu berakhir
 * sebagai penolakan yang diam-diam.
 */
describe('siklus hidup dunia', () => {
  it('menyimpan keempat status dunia', async () => {
    const cookie = await login();
    const worldId = await createWorld(cookie, 'Dunia Siklus');

    for (const status of ['draft', 'published', 'retired', 'revoked'] as const) {
      await app.inject({
        method: 'POST',
        url: '/admin/worlds',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        payload: form({
          worldId,
          title: 'Dunia Siklus',
          synopsis: 'S',
          premise: 'P',
          coverAssetId: 'a_cover_lentera',
          status,
          contentRating: 'all',
          genres: ['drama'],
          locales: ['id-ID'],
        }),
      });

      const world = await catalogAdmin.findWorld(worldId);
      expect(world?.status, `status ${status} seharusnya tersimpan`).toBe(status);
    }
  });

  it('menampilkan keempat status pada formulir dunia', async () => {
    const cookie = await login();
    const worldId = await createWorld(cookie, 'Dunia Pilihan');

    const page = await app.inject({ method: 'GET', url: `/admin/worlds/${worldId}`, headers: { cookie } });
    expect(page.statusCode).toBe(200);

    // Keempatnya harus ADA sebagai pilihan, bukan hanya dua.
    for (const status of ['draft', 'published', 'retired', 'revoked']) {
      expect(page.body, `pilihan ${status} seharusnya ada`).toContain(`value="${status}"`);
    }
    // Dan bedanya dijelaskan, bukan diserahkan ke ingatan admin.
    expect(page.body).toContain('tetap bisa dilanjutkan');
    expect(page.body).toContain('tidak lagi dilayani');
  });

  it('menampilkan status dengan label yang dapat dibaca pada daftar dunia', async () => {
    const cookie = await login();
    await createWorld(cookie, 'Dunia Ditarik', 'revoked');

    const page = await app.inject({ method: 'GET', url: '/admin/worlds', headers: { cookie } });
    expect(page.statusCode).toBe(200);
    // Daftar dunia kini baris bergrup, bukan tabel: setiap barisnya satu
    // tautan yang dapat dibuka, bukan enam sel yang harus dibaca berkolom.
    expectRenderedMarkup(page.body, ['<a class="list__item"']);

    // Labelnya terbaca. Nilai mentahnya TIDAK lagi berdiri sebagai baris kedua
    // di bawah pil — dulu begitu, dan hasilnya satu baris memuat fakta yang
    // sama dua kali. Ia kini menjadi tooltip, tempat yang sama terjangkaunya
    // tanpa menggandakan tinggi baris.
    expect(page.body).toContain('dicabut');
    expect(page.body).toContain('title="revoked"');
    expect(page.body, 'nilai mentah masih tercetak sebagai teks').not.toContain('>revoked<');
  });

  it('menarik dunia mengeluarkan versi terbitnya dari katalog', async () => {
    const cookie = await login();
    const worldId = await createWorld(cookie, 'Dunia Yang Ditarik');

    // Versi 1 terbit. Perjalanan pemain menguncinya.
    await ctx.db.query("INSERT INTO accounts (account_id) VALUES ('acc_tarik')");
    await ctx.db.query(
      `INSERT INTO journeys (journey_id, account_id, world_id, world_version, persona_name,
                             persona_age, response_locale)
       VALUES ('jr_tarik', 'acc_tarik', $1, 1, 'Rani', 24, 'id-ID')`,
      [worldId],
    );

    await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId,
        title: 'Dunia Yang Ditarik',
        synopsis: 'S',
        premise: 'P',
        coverAssetId: 'a_cover_lentera',
        status: 'retired',
        contentRating: 'all',
        genres: ['drama'],
        locales: ['id-ID'],
      }),
    });

    // Inilah intinya: tidak boleh ada lagi versi terbit, kalau tidak pemain
    // tetap melihat dunia yang baru saja ditarik.
    const { rows } = await ctx.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM world_versions
       WHERE world_id = $1 AND status = 'published'`,
      [worldId],
    );
    expect(rows[0]?.total).toBe(0);

    // Perjalanan pemain tidak ikut berubah — itulah bedanya ditarik dari dihapus.
    const { rows: journeys } = await ctx.db.query<{ world_version: number }>(
      'SELECT world_version FROM journeys WHERE journey_id = $1',
      ['jr_tarik'],
    );
    expect(journeys[0]?.world_version).toBe(1);
  });

  it('menampilkan riwayat versi pada halaman dunia', async () => {
    const cookie = await login();
    const worldId = await createWorld(cookie, 'Dunia Berversi');

    await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId,
        title: 'Dunia Berversi (revisi)',
        synopsis: 'S',
        premise: 'P',
        coverAssetId: 'a_cover_lentera',
        status: 'published',
        contentRating: 'all',
        genres: ['drama'],
        locales: ['id-ID'],
      }),
    });

    const page = await app.inject({ method: 'GET', url: `/admin/worlds/${worldId}`, headers: { cookie } });
    expect(page.statusCode).toBe(200);
    expectRenderedMarkup(page.body, ['Riwayat versi', '<td', 'v2', 'v1']);

    const history = await catalogAdmin.listWorldVersions(worldId);
    expect(history.map((row) => row.worldVersion)).toEqual([2, 1]);
    // Versi lama diarsipkan, bukan dihapus, dan judulnya tetap yang lama.
    expect(history[1]?.status).toBe('retired');
    expect(history[1]?.title).toBe('Dunia Berversi');
    expect(history[0]?.title).toBe('Dunia Berversi (revisi)');
  });
});

/* ------------------------------------------------------------------ */

/**
 * Master lokasi.
 *
 * Lokasi tidak lagi hidup di dalam satu versi dunia: nama tempat dan gambar
 * latarnya berdiri sendiri, dan dunia MEMUNGUTNYA di langkah 2 wizard. Karena
 * itu uji di sini tidak memeriksa "versi baru dibuat", melainkan empat aturan
 * yang membuat master ini aman: gambar wajib ada, satu kategori hanya boleh
 * dipakai sekali per lokasi, kategori yang masih dipakai tidak dapat dihapus,
 * dan lokasi yang sudah dipungut dunia tidak dapat dihapus.
 */
/**
 * Master lokasi.
 *
 * Satu lokasi adalah satu nama, satu kategori, satu keterangan, dan satu
 * gambar. Bentuknya datar dengan sengaja — versi sebelumnya memakai baris
 * berulang sehingga satu tempat dapat memuat banyak gambar (satu per era), dan
 * itu dibuang karena yang diisi sehari-hari adalah satu tempat pada satu era.
 *
 * Uji di sini menjaga empat aturan yang membuat master ini aman: gambar wajib
 * ada, kategori wajib ada, kategori yang masih dipakai tidak dapat dihapus, dan
 * lokasi yang sudah dipungut dunia tidak dapat dihapus.
 */
describe('master lokasi', () => {
  /** Membuat satu kategori (era) lewat HTTP dan mengembalikan id yang dibuat. */
  async function addCategory(cookie: string, name: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/location-categories',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ name }),
    });
    expect(response.statusCode).toBe(302);

    const { rows } = await ctx.db.query<{ category_id: string }>(
      'SELECT category_id FROM location_categories WHERE name = $1',
      [name],
    );
    expect(rows[0]?.category_id, 'kategori tidak dibuat').toBeTruthy();
    return rows[0]!.category_id;
  }

  /** Menyimpan master lokasi lewat HTTP dan mengembalikan alamat tujuan. */
  async function saveLocation(
    cookie: string,
    payload: Record<string, string | string[]>,
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/locations',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form(payload),
    });
    expect(response.statusCode).toBe(302);
    return String(response.headers.location ?? '');
  }

  it('menyimpan lokasi, lalu mengubah dan menghapusnya', async () => {
    const cookie = await login();
    const fantasi = await addCategory(cookie, 'fantasy');
    const modern = await addCategory(cookie, 'masa kini');
    const bgFantasi = await upload(cookie, png(1280, 720, 'loc-fantasy'));

    const created = await saveLocation(cookie, {
      locationId: '',
      name: 'Aula Kantor',
      categoryId: fantasi,
      description: 'Aula zaman kerajaan',
      mediaId: bgFantasi,
    });
    expect(created).toContain('notice=created');

    const [row] = await locations.list();
    expect(row?.name).toBe('Aula Kantor');
    expect(row?.categoryName).toBe('fantasy');
    expect(row?.description).toBe('Aula zaman kerajaan');
    expect(row?.mediaId).toBe(bgFantasi);

    // Mengubah kategori sekaligus keterangan dan gambarnya.
    const bgModern = await upload(cookie, png(1280, 720, 'loc-modern'));
    const saved = await saveLocation(cookie, {
      locationId: row!.locationId,
      name: 'Aula Kantor Utama',
      categoryId: modern,
      description: 'Aula kantor modern',
      mediaId: bgModern,
    });
    expect(saved).toContain('notice=saved');

    const after = await locations.find(row!.locationId);
    expect(after?.name).toBe('Aula Kantor Utama');
    expect(after?.categoryName).toBe('masa kini');
    expect(after?.description).toBe('Aula kantor modern');
    expect(after?.mediaId).toBe(bgModern);

    await app.inject({
      method: 'POST',
      url: '/admin/locations/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ locationId: row!.locationId }),
    });
    expect(await locations.find(row!.locationId)).toBeNull();
  });

  it('menolak lokasi tanpa gambar dan tanpa kategori, dengan sebab berbeda', async () => {
    const cookie = await login();
    const fantasi = await addCategory(cookie, 'fantasy');

    // Gambarnya belum diunggah: itu pekerjaan yang belum jadi.
    const tanpaGambar = await saveLocation(cookie, {
      locationId: '',
      name: 'Tempat Kosong',
      categoryId: fantasi,
      mediaId: '',
    });
    expect(tanpaGambar).toContain('notice=location-no-image');
    expect(await locations.list()).toHaveLength(0);

    // Gambar ada, kategori belum dipilih: ini pekerjaan yang akan HILANG kalau
    // dibuang diam-diam, jadi penolakannya berbeda dan menyebut sebabnya.
    const tanpaKategori = await saveLocation(cookie, {
      locationId: '',
      name: 'Tempat Tanpa Kategori',
      categoryId: '',
      mediaId: await upload(cookie, png(1280, 720, 'loc-nocat')),
    });
    expect(tanpaKategori).toContain('notice=location-category-invalid');
    expect(await locations.list()).toHaveLength(0);
  });

  it('menolak menghapus kategori yang masih dipakai lokasi', async () => {
    const cookie = await login();
    const fantasi = await addCategory(cookie, 'fantasy');
    await saveLocation(cookie, {
      locationId: '',
      name: 'Aula Kantor',
      categoryId: fantasi,
      mediaId: await upload(cookie, png(1280, 720, 'loc-inuse')),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/location-categories/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ categoryId: fantasi }),
    });
    expect(String(response.headers.location ?? '')).toContain('notice=category-in-use');

    // Masih ada, dan lokasinya masih utuh.
    expect(await locations.findCategory(fantasi)).not.toBeNull();
    expect(await locations.list()).toHaveLength(1);
  });

  it('mencatat pembuatan lokasi dan kategori di audit', async () => {
    const cookie = await login();
    const fantasi = await addCategory(cookie, 'fantasy');
    await saveLocation(cookie, {
      locationId: '',
      name: 'Lobi Utama',
      categoryId: fantasi,
      mediaId: await upload(cookie, png(1280, 720, 'loc-audit')),
    });

    const { rows } = await ctx.db.query<{ action: string }>(
      `SELECT action FROM admin_audit_log
       WHERE target_kind IN ('location', 'locationCategory')
       ORDER BY created_at ASC`,
    );
    expect(rows.map((row) => row.action)).toEqual([
      'locationCategory.create',
      'location.create',
    ]);
  });

  it('merender halaman master lokasi dan kategori sebagai markup, bukan teks', async () => {
    const cookie = await login();
    const fantasi = await addCategory(cookie, 'fantasy');
    await saveLocation(cookie, {
      locationId: '',
      name: 'Teras Belakang',
      categoryId: fantasi,
      description: 'Teras di belakang rumah',
      mediaId: await upload(cookie, png(1280, 720, 'loc-render')),
    });

    const page = await app.inject({
      method: 'GET',
      url: '/admin/locations',
      headers: { cookie },
    });
    expect(page.statusCode).toBe(200);
    expectRenderedMarkup(page.body, ['<h1', 'Teras Belakang', '/admin/locations-form']);

    const categories = await app.inject({
      method: 'GET',
      url: '/admin/location-categories',
      headers: { cookie },
    });
    expect(categories.statusCode).toBe(200);
    expectRenderedMarkup(categories.body, ['<table', '<td', 'fantasy', '/admin/location-categories']);

    // Halaman formulir memakai WIZARD_CSS/WIZARD_JS: tanpa itu, memilih berkas
    // tidak mengunggah apa pun dan halaman tetap tampak benar.
    const [saved] = await locations.list();
    const formPage = await app.inject({
      method: 'GET',
      url: `/admin/locations-form?location=${encodeURIComponent(saved!.locationId)}`,
      headers: { cookie },
    });
    expect(formPage.statusCode).toBe(200);
    expectRenderedMarkup(formPage.body, [
      'data-background-scope',
      'data-upload="background"',
      '<select name="categoryId"',
      'Teras di belakang rumah',
      'name="mediaId"',
    ]);
  });

  /**
   * Tautan ke master harus SELAMAT saat versi dunia disalin.
   *
   * `copyVersionInto` menyalin setiap tabel anak dengan DAFTAR KOLOM TETAP.
   * Kolom yang terlewat tidak menghasilkan galat apa pun — latarnya tetap ada,
   * hanya asalnya yang hilang, dan itu baru terlihat ketika seseorang bertanya
   * "latar ini dari lokasi mana" atau mencoba menghapus lokasi masternya.
   */
  it('mempertahankan tautan master saat versi dunia disalin', async () => {
    const cookie = await login();
    const worldId = await createWorld(cookie, 'Dunia Salin Lokasi');
    const fantasi = await addCategory(cookie, 'fantasy');
    const mediaId = await upload(cookie, png(1280, 720, 'loc-copy'));

    await saveLocation(cookie, {
      locationId: '',
      name: 'Aula Kantor',
      categoryId: fantasi,
      description: '',
      mediaId,
    });
    const [location] = await locations.list();

    // Latar dipungut ke dunia, persis seperti yang dilakukan langkah 2 wizard.
    const world = await catalogAdmin.findWorld(worldId);
    const drafts = new WorldDraftRepository(ctx.db);
    const picked = await drafts.addBackground(worldId, world!.worldVersion, {
      mediaId,
      label: 'Aula Kantor',
      description: '',
      usageNote: '',
      encounterLikelihood: null,
      blurStrength: 0,
      focalX: 0.5,
      focalY: 0.5,
      width: 1280,
      height: 720,
      masterLocationId: location!.locationId,
      masterCategoryId: fantasi,
    });
    expect(picked).not.toBeNull();

    // Menyimpan dunia membuka versi baru, dan versi baru diisi dengan menyalin.
    await catalogAdmin.saveWorld({
      worldId,
      title: 'Dunia Salin Lokasi (revisi)',
      synopsis: 'S',
      premise: 'P',
      coverAssetId: 'a_cover_lentera',
      contentRating: 'all',
      status: 'draft',
      genres: ['drama'],
      locales: ['id-ID'],
    });

    const { rows } = await ctx.db.query<{
      world_version: number;
      master_location_id: string | null;
      master_category_id: string | null;
    }>(
      `SELECT world_version, master_location_id, master_category_id
       FROM world_assets WHERE world_id = $1 AND kind = 'background'
       ORDER BY world_version ASC`,
      [worldId],
    );

    expect(rows.length, 'latar tidak ikut tersalin ke versi baru').toBeGreaterThan(1);
    for (const row of rows) {
      expect(
        row.master_location_id,
        `tautan lokasi master hilang pada versi ${String(row.world_version)}`,
      ).toBe(location!.locationId);
      expect(row.master_category_id).toBe(fantasi);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('aset', () => {
  it('merender halaman aset sebagai tabel, bukan teks markup', async () => {
    const cookie = await login();
    const page = await app.inject({ method: 'GET', url: '/admin/assets', headers: { cookie } });

    expect(page.statusCode).toBe(200);
    expectRenderedMarkup(page.body, ['<table', '<td', 'a_cover_kantor', 'p_elysia_netral']);
  });

  it('hanya menampilkan aset yang benar-benar ada di basis data', async () => {
    const cookie = await login();
    const page = await app.inject({ method: 'GET', url: '/admin/assets', headers: { cookie } });

    const assets = await catalogAdmin.listAssets();
    const known = [...assets.covers, ...assets.backgrounds, ...assets.portraits].map((a) => a.assetId);
    expect(known.length).toBeGreaterThan(0);
    for (const assetId of known) {
      expect(page.body, `${assetId} seharusnya tampil`).toContain(assetId);
    }

    // Tidak ada jalur unggah: halaman ini hanya daftar, dan mengatakannya.
    expect(page.body).not.toContain('type="file"');
  });
});

/* ------------------------------------------------------------------ */

describe('halaman kelola admin', () => {
  it('menampilkan daftar admin yang terdaftar', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/admins',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        username: 'editor_satu',
        displayName: 'Editor Satu',
        password: 'kata-sandi-uji-999',
        role: 'editor',
      }),
    });

    const page = await app.inject({ method: 'GET', url: '/admin/admins', headers: { cookie } });
    expect(page.statusCode).toBe(200);
    expectRenderedMarkup(page.body, ['<table', '<td', 'editor_satu', 'Editor Satu', ADMIN_USERNAME]);
    expect(page.body).toContain('2 akun terdaftar');
  });

  it('tidak menawarkan tombol nonaktifkan untuk diri sendiri', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/admins',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        username: 'editor_dua',
        password: 'kata-sandi-uji-999',
        role: 'editor',
      }),
    });

    const page = await app.inject({ method: 'GET', url: '/admin/admins', headers: { cookie } });
    const toggleForms = page.body.match(/action="\/admin\/admins\/toggle"/g) ?? [];

    // Dua admin terdaftar, tetapi hanya SATU tombol: yang untuk admin lain.
    expect(toggleForms).toHaveLength(1);
    expect(page.body).toContain('tidak dapat menonaktifkan diri sendiri');
    // Barisnya sendiri ditandai, supaya jelas siapa "anda".
    expect(page.body).toContain('anda');
  });

  it('tetap menolak menonaktifkan diri sendiri bila diminta langsung', async () => {
    const cookie = await login();
    const me = await admins.findAdminByUsername(ADMIN_USERNAME);

    const response = await app.inject({
      method: 'POST',
      url: '/admin/admins/toggle',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ adminId: me!.adminId, isActive: 'false' }),
    });

    // Penolakan tetap di server; menyembunyikan tombol hanyalah kejelasan.
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/admin/admins');
    expect((await admins.findAdminByUsername(ADMIN_USERNAME))?.isActive).toBe(true);
  });

  it('menonaktifkan admin lain dan mencatatnya di audit', async () => {
    const cookie = await login();
    await admins.createAdmin({
      username: 'editor_tiga',
      password: 'kata-sandi-uji-999',
      displayName: 'Editor Tiga',
      role: 'editor',
    });
    const target = await admins.findAdminByUsername('editor_tiga');

    await app.inject({
      method: 'POST',
      url: '/admin/admins/toggle',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ adminId: target!.adminId, isActive: 'false' }),
    });

    expect((await admins.findAdminByUsername('editor_tiga'))?.isActive).toBe(false);

    const { rows } = await ctx.db.query<{ action: string }>(
      "SELECT action FROM admin_audit_log WHERE target_kind = 'admin' ORDER BY created_at DESC LIMIT 1",
    );
    expect(rows[0]?.action).toBe('admin.deactivate');
  });

  it('menolak menambah admin bila bukan owner', async () => {
    await admins.createAdmin({
      username: 'bukan_owner',
      password: 'kata-sandi-uji-999',
      displayName: 'Bukan Owner',
      role: 'editor',
    });
    const cookie = await loginAs('bukan_owner', 'kata-sandi-uji-999');

    await app.inject({
      method: 'POST',
      url: '/admin/admins',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ username: 'orang_lain', password: 'kata-sandi-uji-999', role: 'editor' }),
    });

    expect(await admins.findAdminByUsername('orang_lain')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('saringan catatan audit', () => {
  /** Menyiapkan dua admin yang masing-masing melakukan satu tindakan. */
  async function seedAudit(): Promise<void> {
    await admins.createAdmin({
      username: 'editor_audit',
      password: 'kata-sandi-uji-999',
      displayName: 'Editor Audit',
      role: 'editor',
    });

    const ownerCookie = await login();
    await app.inject({
      method: 'POST',
      url: '/admin/settings',
      headers: { cookie: ownerCookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ key: 'promo.banner_text', value: 'Diskon', description: 'uji' }),
    });

    const editorCookie = await loginAs('editor_audit', 'kata-sandi-uji-999');
    await app.inject({
      method: 'POST',
      url: '/admin/promotions',
      headers: { cookie: editorCookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        promotionId: '',
        code: 'AUDIT2026',
        bonusTokens: '1000',
        maxRedemptions: '0',
        tierRequirement: 'any',
        isActive: 'on',
      }),
    });
  }

  it('menyaring menurut tindakan', async () => {
    const cookie = await login();
    await seedAudit();

    const all = await app.inject({ method: 'GET', url: '/admin/audit', headers: { cookie } });
    expect(all.statusCode).toBe(200);
    expectRenderedMarkup(all.body, ['<table', '<td', '<option value="promotion.create"']);
    expect(auditPillCount(all.body, 'setting.update')).toBeGreaterThan(0);
    expect(auditPillCount(all.body, 'promotion.create')).toBeGreaterThan(0);

    const filtered = await app.inject({
      method: 'GET',
      url: '/admin/audit?action=promotion.create',
      headers: { cookie },
    });
    expect(filtered.statusCode).toBe(200);
    expectRenderedMarkup(filtered.body, ['<table', '<td']);
    expect(auditPillCount(filtered.body, 'promotion.create')).toBeGreaterThan(0);
    // Yang disaring keluar tidak boleh muncul sebagai baris. Pil pada MENU
    // saringan tetap ada — itulah yang membuat "tidak memuat teksnya" bukan
    // pemeriksaan yang benar di sini.
    expect(auditPillCount(filtered.body, 'setting.update')).toBe(0);
    expect(filtered.body).toContain('cocok dengan saringan');
  });

  it('menyaring menurut admin', async () => {
    const cookie = await login();
    await seedAudit();

    const filtered = await app.inject({
      method: 'GET',
      url: '/admin/audit?username=editor_audit',
      headers: { cookie },
    });
    expect(filtered.statusCode).toBe(200);
    expectRenderedMarkup(filtered.body, ['<table', '<td', 'editor_audit']);
    expect(auditPillCount(filtered.body, 'setting.update')).toBe(0);
    expect(auditPillCount(filtered.body, 'promotion.create')).toBeGreaterThan(0);
  });

  it('mengembalikan seluruh catatan bila saringan dikosongkan', async () => {
    const cookie = await login();
    await seedAudit();

    const filtered = await app.inject({
      method: 'GET',
      url: '/admin/audit?username=editor_audit&action=login.ok',
      headers: { cookie },
    });
    expect(auditPillCount(filtered.body, 'promotion.create')).toBe(0);

    const unfiltered = await app.inject({ method: 'GET', url: '/admin/audit', headers: { cookie } });
    expect(auditPillCount(unfiltered.body, 'promotion.create')).toBeGreaterThan(0);
    expect(unfiltered.body).not.toContain('cocok dengan saringan');
  });

  it('menyaring di basis data, bukan di memori', async () => {
    await seedAudit();
    // Bukti langsung pada repository: saringan mengubah hasil kuerinya.
    const all = await admins.listAudit(100);
    const onlyPromotions = await admins.listAudit(100, { action: 'promotion.create' });

    expect(onlyPromotions.length).toBeGreaterThan(0);
    expect(onlyPromotions.length).toBeLessThan(all.length);
    expect(onlyPromotions.every((entry) => entry.action === 'promotion.create')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe('ringkasan', () => {
  it('menampilkan jumlah dunia per status, akun, perjalanan, dan keadaan mesin', async () => {
    const cookie = await login();
    await createWorld(cookie, 'Dunia Ringkasan Draft', 'draft');
    await createWorld(cookie, 'Dunia Ringkasan Ditarik', 'revoked');

    const page = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
    expect(page.statusCode).toBe(200);
    expectRenderedMarkup(page.body, ['<div class="stat">']);

    // Keempat status selalu ditampilkan, termasuk yang jumlahnya nol.
    for (const label of ['terbit', 'draft', 'ditarik', 'dicabut']) {
      expect(page.body, `status ${label} seharusnya tampil di ringkasan`).toContain(`>${label} <`);
    }
    expect(page.body).toContain('Akun pemain');
    expect(page.body).toContain('Perjalanan');

    // Keadaan mesin cerita berasal dari fakta server, bukan tebakan.
    expect(page.body).toContain('storyEngine.simulator');
    expect(page.body).toContain('engine.simulator');
  });

  it('menghitung dunia menurut versi terbarunya', async () => {
    const cookie = await login();
    const before = await catalogAdmin.listWorlds();
    const publishedBefore = before.filter((world) => world.status === 'published').length;

    await createWorld(cookie, 'Dunia Terbit Baru', 'published');

    const after = await catalogAdmin.listWorlds();
    const publishedAfter = after.filter((world) => world.status === 'published').length;
    expect(publishedAfter).toBe(publishedBefore + 1);
  });
});

/* ------------------------------------------------------------------ */

describe('keamanan keluaran', () => {
  it('meng-escape judul dunia sehingga tidak dapat menyuntikkan skrip', async () => {
    const cookie = await login();

    const payloadTitle = '<script>alert(1)</script>';
    await app.inject({
      method: 'POST',
      url: '/admin/worlds',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        worldId: '',
        title: payloadTitle,
        synopsis: 'S',
        premise: 'P',
        coverAssetId: 'a_cover_lentera',
        status: 'draft',
        contentRating: 'all',
        genres: ['drama'],
        locales: ['id-ID'],
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/admin/worlds', headers: { cookie } });

    // Judul boleh muncul, tetapi TIDAK sebagai tag yang hidup.
    expect(response.body).not.toContain('<script>alert(1)</script>');
    expect(response.body).toContain('&lt;script&gt;');
  });

  it('meng-escape nilai pengaturan yang masuk ke halaman', async () => {
    const cookie = await login();

    await app.inject({
      method: 'POST',
      url: '/admin/settings',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({
        key: 'promo.banner_text',
        value: '<img src=x onerror=alert(1)>',
        description: 'uji',
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/admin/settings', headers: { cookie } });
    expect(response.body).not.toContain('<img src=x onerror=alert(1)>');
    expect(response.body).toContain('&lt;img');
  });

  it('tidak memuat satu pun resource dari luar', async () => {
    const cookie = await login();
    const response = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });

    // Panel harus dapat dibuka tanpa jaringan luar — sama seperti situs portofolio.
    expect(response.body).not.toMatch(/<script[^>]+src=/i);
    expect(response.body).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(response.body).not.toContain('cdn.');
  });
});

/* ------------------------------------------------------------------ */

/**
 * Provider model.
 *
 * Provider adalah tingkat di atas model: ia memegang alamat, jenis API, dan
 * awalan id. Uji di sini menjaga tiga hal yang membuatnya aman dipakai: prefix
 * tidak boleh kembar (id model menjadi ambigu), alamat harus benar-benar alamat,
 * dan yang diketik pada bidang kunci adalah NAMA variabel — bukan kuncinya.
 */
describe('provider', () => {
  /** Menyimpan provider lewat HTTP dan mengembalikan alamat tujuan. */
  async function saveProvider(
    cookie: string,
    payload: Record<string, string | string[]>,
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/providers',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form(payload),
    });
    expect(response.statusCode).toBe(302);
    return String(response.headers.location ?? '');
  }

  it('menyimpan provider, lalu mengubah dan menghapusnya', async () => {
    const cookie = await login();
    const providers = new ProvidersRepository(ctx.db);

    const created = await saveProvider(cookie, {
      providerId: '',
      name: 'OpenAI Compatible (Prod)',
      prefix: 'oc-prod',
      apiType: 'chat-completions',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnv: 'FAYLN_UJI_KUNCI',
      isActive: 'true',
    });
    expect(created).toContain('notice=saved');

    const [row] = await providers.list();
    expect(row?.name).toBe('OpenAI Compatible (Prod)');
    expect(row?.prefix).toBe('oc-prod');
    expect(row?.apiType).toBe('chat-completions');
    expect(row?.apiKeyEnv).toBe('FAYLN_UJI_KUNCI');
    // Variabelnya tidak ada di lingkungan uji, jadi panel harus mengatakannya
    // — bukan menampilkan seolah siap dipakai.
    expect(row?.keyPresent).toBe(false);

    const saved = await saveProvider(cookie, {
      providerId: row!.providerId,
      name: 'OpenAI (Prod)',
      prefix: 'oc-prod',
      apiType: 'responses',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnv: 'FAYLN_UJI_KUNCI',
      isActive: 'true',
    });
    expect(saved).toContain('notice=saved');

    const after = await providers.find(row!.providerId);
    expect(after?.name).toBe('OpenAI (Prod)');
    expect(after?.apiType).toBe('responses');

    await app.inject({
      method: 'POST',
      url: '/admin/providers/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ providerId: row!.providerId }),
    });
    expect(await providers.find(row!.providerId)).toBeNull();
  });

  it('menolak prefix yang sudah dipakai provider lain', async () => {
    const cookie = await login();
    await saveProvider(cookie, {
      providerId: '',
      name: 'Provider Satu',
      prefix: 'sama',
      apiType: 'chat-completions',
      baseUrl: 'https://satu.example.test/v1',
      isActive: 'true',
    });

    const kedua = await saveProvider(cookie, {
      providerId: '',
      name: 'Provider Dua',
      prefix: 'sama',
      apiType: 'chat-completions',
      baseUrl: 'https://dua.example.test/v1',
      isActive: 'true',
    });
    expect(kedua).toContain('notice=provider-prefix-taken');
    // Pesannya menyebut provider yang sudah memakainya, bukan sekadar menolak.
    expect(decodeURIComponent(kedua)).toContain('Provider Satu');

    expect(await new ProvidersRepository(ctx.db).list()).toHaveLength(1);
  });

  it('menormalkan base URL dan menolak yang bukan alamat', async () => {
    const cookie = await login();

    await saveProvider(cookie, {
      providerId: '',
      name: 'Dengan Garis Miring',
      prefix: 'miring',
      apiType: 'chat-completions',
      baseUrl: 'https://miring.example.test/v1/',
      isActive: 'true',
    });
    const [row] = await new ProvidersRepository(ctx.db).list();
    // Garis miring di ujung dibuang: dua bentuk alamat yang sama akan
    // menghasilkan path bergaris miring ganda saat disambung nanti.
    expect(row?.baseUrl).toBe('https://miring.example.test/v1');

    const bukanAlamat = await saveProvider(cookie, {
      providerId: '',
      name: 'Bukan Alamat',
      prefix: 'bukan',
      apiType: 'chat-completions',
      baseUrl: 'miring.example.test/v1',
      isActive: 'true',
    });
    expect(bukanAlamat).toContain('notice=provider-base-url-invalid');
  });

  it('menolak kunci API yang ditempelkan ke bidang nama variabel', async () => {
    const cookie = await login();

    // Kekeliruan yang paling mudah terjadi: yang diminta adalah NAMA variabel,
    // dan yang ditempelkan adalah kuncinya. Menyimpannya akan menaruh rahasia
    // di basis data — tepat hal yang dihindari bidang ini.
    const response = await saveProvider(cookie, {
      providerId: '',
      name: 'Salah Isi',
      prefix: 'salah',
      apiType: 'chat-completions',
      baseUrl: 'https://salah.example.test/v1',
      apiKeyEnv: 'sk-rahasia-yang-tidak-boleh-disimpan',
      isActive: 'true',
    });
    expect(response).toContain('notice=provider-key-env-invalid');
    expect(await new ProvidersRepository(ctx.db).list()).toHaveLength(0);
  });

  it('menolak menghapus provider yang masih dipakai model', async () => {
    const cookie = await login();
    await saveProvider(cookie, {
      providerId: '',
      name: 'Dipakai',
      prefix: 'dipakai',
      apiType: 'chat-completions',
      baseUrl: 'https://dipakai.example.test/v1',
      isActive: 'true',
    });
    const [provider] = await new ProvidersRepository(ctx.db).list();

    await new ModelsRepository(ctx.db).saveModel({
      modelId: null,
      label: 'Model Yang Menunjuk',
      providerId: provider!.providerId,
      modelKey: 'model-uji',
      estimatedTurnCost: 100,
      contextTokens: 16_000,
      position: 0,
      tier: 'free',
      isActive: true,
      notes: '',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/providers/delete',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: form({ providerId: provider!.providerId }),
    });
    expect(String(response.headers.location ?? '')).toContain('notice=provider-in-use');
    expect(await new ProvidersRepository(ctx.db).find(provider!.providerId)).not.toBeNull();
  });

  it('mencatat pembuatan provider tanpa jejak rahasia apa pun', async () => {
    const cookie = await login();
    await saveProvider(cookie, {
      providerId: '',
      name: 'Audit',
      prefix: 'audit',
      apiType: 'chat-completions',
      baseUrl: 'https://audit.example.test/v1',
      apiKeyEnv: 'FAYLN_UJI_KUNCI',
      isActive: 'true',
    });

    const { rows } = await ctx.db.query<{ action: string; detail: unknown }>(
      "SELECT action, detail FROM admin_audit_log WHERE target_kind = 'provider'",
    );
    expect(rows.map((row) => row.action)).toEqual(['provider.create']);

    /*
     * Catatan audit dapat dibaca peran `support`. Jejak sekecil apa pun tentang
     * rahasia tidak boleh ada di sini — termasuk NAMANYA. "Kunci diganti pada
     * 14:02" pun sudah mengatakan sesuatu yang bukan urusannya.
     */
    const detail = JSON.stringify(rows[0]?.detail);
    expect(detail).not.toContain('FAYLN_UJI_KUNCI');
    expect(detail).not.toContain('apiKey');
  });

  /**
   * Kunci API yang tersimpan.
   *
   * Enkripsinya sendiri diuji di `secretBox.test.ts`. Yang diuji di sini
   * KABELNYA — dan itu bagian yang paling mudah salah tanpa terlihat: kolom
   * yang berisi nilai terbaca, kunci yang hilang saat menyunting, atau
   * penyimpanan yang tetap jalan padahal kunci enkripsinya tidak ada.
   */
  describe('kunci API tersimpan', () => {
    /** Base64 persis 32 byte, sama seperti yang diharapkan secretBox. */
    const KUNCI_ENKRIPSI = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
    const KUNCI = 'sk-RAHASIA-yang-tidak-boleh-terbaca';
    let semula: string | undefined;

    beforeEach(() => {
      semula = process.env[SECRETS_KEY_ENV];
      process.env[SECRETS_KEY_ENV] = KUNCI_ENKRIPSI;
    });

    afterEach(() => {
      if (semula === undefined) {
        delete process.env[SECRETS_KEY_ENV];
      } else {
        process.env[SECRETS_KEY_ENV] = semula;
      }
    });

    function simpanDenganKunci(cookie: string, extra: Record<string, string>): Promise<string> {
      return saveProvider(cookie, {
        providerId: '',
        name: 'Dengan Kunci',
        prefix: 'kunci',
        apiType: 'chat-completions',
        baseUrl: 'https://kunci.example.test/v1',
        isActive: 'true',
        ...extra,
      });
    }

    it('menyimpan kunci terenkripsi, bukan apa adanya', async () => {
      const cookie = await login();
      expect(await simpanDenganKunci(cookie, { apiKey: KUNCI })).toContain('notice=saved');

      const { rows } = await ctx.db.query<{ api_key_enc: string }>(
        'SELECT api_key_enc FROM providers',
      );
      expect(rows[0]?.api_key_enc, 'kolom kuncinya kosong').not.toBe('');
      // Inti seluruh fitur ini: cadangan malam menyalin kolom ini.
      expect(rows[0]?.api_key_enc, 'kunci terbaca di basis data').not.toContain(KUNCI);

      const providers = new ProvidersRepository(ctx.db);
      const [provider] = await providers.list();
      expect(provider?.hasStoredKey).toBe(true);
      expect(provider?.keySource).toBe('stored');
      // Dan jalur cerita tetap memperoleh nilai aslinya.
      expect(await providers.apiKeyFor(provider!.providerId)).toBe(KUNCI);
    });

    it('mempertahankan kunci lama bila bidangnya dibiarkan kosong', async () => {
      const cookie = await login();
      await simpanDenganKunci(cookie, { apiKey: KUNCI });

      const providers = new ProvidersRepository(ctx.db);
      const [awal] = await providers.list();

      // Menyunting nama tanpa menyentuh kunci tidak boleh menghapusnya.
      await saveProvider(cookie, {
        providerId: awal!.providerId,
        name: 'Nama Baru',
        prefix: 'kunci',
        apiType: 'chat-completions',
        baseUrl: 'https://kunci.example.test/v1',
        isActive: 'true',
      });

      const sesudah = await providers.find(awal!.providerId);
      expect(sesudah?.name).toBe('Nama Baru');
      expect(sesudah?.hasStoredKey, 'kunci hilang saat menyunting').toBe(true);
      expect(await providers.apiKeyFor(awal!.providerId)).toBe(KUNCI);
    });

    it('menghapus kunci hanya lewat aksi tersendiri', async () => {
      const cookie = await login();
      await simpanDenganKunci(cookie, { apiKey: KUNCI });

      const providers = new ProvidersRepository(ctx.db);
      const [provider] = await providers.list();

      await app.inject({
        method: 'POST',
        url: '/admin/providers/key/delete',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        payload: form({ providerId: provider!.providerId }),
      });

      const sesudah = await providers.find(provider!.providerId);
      expect(sesudah?.hasStoredKey).toBe(false);
      expect(sesudah?.keySource).toBe('none');
      expect(await providers.apiKeyFor(provider!.providerId)).toBeNull();
    });

    it('menolak menyimpan bila kunci enkripsi belum terpasang', async () => {
      delete process.env[SECRETS_KEY_ENV];
      const cookie = await login();

      expect(await simpanDenganKunci(cookie, { apiKey: KUNCI })).toContain(
        'notice=provider-secrets-unavailable',
      );

      /*
       * Ditolak, BUKAN disimpan apa adanya. Menyimpan rahasia terbaca karena
       * "konfigurasinya belum lengkap" menghasilkan baris yang tampak sah, dan
       * tidak ada yang akan tahu sampai basis datanya tersalin ke tempat lain.
       */
      expect(await new ProvidersRepository(ctx.db).list()).toHaveLength(0);
    });

    it('tetap dapat memakai kunci dari variabel lingkungan', async () => {
      const cookie = await login();
      await simpanDenganKunci(cookie, { apiKeyEnv: 'FAYLN_UJI_KUNCI' });
      process.env.FAYLN_UJI_KUNCI = 'sk-dari-lingkungan';

      const providers = new ProvidersRepository(ctx.db);
      const [provider] = await providers.list();
      expect(provider?.keySource).toBe('env');
      expect(await providers.apiKeyFor(provider!.providerId)).toBe('sk-dari-lingkungan');

      delete process.env.FAYLN_UJI_KUNCI;
    });
  });

  /**
   * Saran nama model dari provider.
   *
   * Jaringan DIGANTI dengan fungsi palsu. Uji yang menghubungi penyedia model
   * sungguhan akan gagal di mesin tanpa internet dan lambat di mesin yang ada —
   * dan yang sedang diuji di sini adalah jalur panel, bukan penyedianya.
   */
  describe('saran nama model', () => {
    const KUNCI_ENKRIPSI = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
    let semula: string | undefined;

    beforeEach(() => {
      semula = process.env[SECRETS_KEY_ENV];
      process.env[SECRETS_KEY_ENV] = KUNCI_ENKRIPSI;
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      if (semula === undefined) {
        delete process.env[SECRETS_KEY_ENV];
      } else {
        process.env[SECRETS_KEY_ENV] = semula;
      }
    });

    /** Provider yang punya kunci tersimpan, jadi daftar modelnya dapat diambil. */
    async function providerDenganKunci(cookie: string): Promise<string> {
      const created = await saveProvider(cookie, {
        providerId: '',
        name: 'Sumber Model',
        prefix: 'sumber',
        apiType: 'chat-completions',
        baseUrl: 'https://sumber.example.test/v1',
        apiKey: 'sk-uji',
        isActive: 'true',
      });
      expect(created).toContain('notice=saved');

      const [provider] = await new ProvidersRepository(ctx.db).list();
      return provider!.providerId;
    }

    it('mengembalikan daftar model dari provider', async () => {
      const cookie = await login();
      const providerId = await providerDenganKunci(cookie);

      let dipanggil = '';
      vi.stubGlobal('fetch', async (url: string) => {
        dipanggil = url;
        return {
          status: 200,
          ok: true,
          text: async () => '{"data":[{"id":"model-a"},{"id":"model-b"}]}',
        };
      });

      const response = await app.inject({
        method: 'GET',
        url: `/admin/providers/${providerId}/models`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true, ids: ['model-a', 'model-b'] });
      // Alamat yang dipanggil diturunkan dari base URL provider, bukan dari
      // apa pun yang dikirim klien.
      expect(dipanggil).toBe('https://sumber.example.test/v1/models');
    });

    it('tidak menghubungi apa pun bila provider belum punya kunci', async () => {
      const cookie = await login();
      const created = await saveProvider(cookie, {
        providerId: '',
        name: 'Tanpa Kunci',
        prefix: 'tanpakunci',
        apiType: 'chat-completions',
        baseUrl: 'https://tanpa.example.test/v1',
        isActive: 'true',
      });
      expect(created).toContain('notice=saved');

      const [provider] = await new ProvidersRepository(ctx.db).list();

      let dipanggil = 0;
      vi.stubGlobal('fetch', async () => {
        dipanggil += 1;
        return { status: 200, ok: true, text: async () => '{}' };
      });

      const response = await app.inject({
        method: 'GET',
        url: `/admin/providers/${provider!.providerId}/models`,
        headers: { cookie },
      });

      expect(response.json()).toEqual({ ok: false, reason: 'no-key', detail: '' });
      // Tanpa kunci tidak ada yang dapat dikirim, jadi tidak ada permintaan yang
      // boleh keluar sama sekali.
      expect(dipanggil).toBe(0);
    });

    it('menolak provider yang tidak ada', async () => {
      const cookie = await login();
      const response = await app.inject({
        method: 'GET',
        url: '/admin/providers/prov_hantu/models',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it('menuntut sesi admin lebih dulu', async () => {
      // Kunci API dipakai di jalur ini, jadi halaman ini tidak boleh terbuka.
      const response = await app.inject({
        method: 'GET',
        url: '/admin/providers/prov_apa/models',
      });
      expect(response.statusCode).toBe(302);
    });
  });
});
