/**
 * Wizard "Dunia baru" — tiga langkah, draf yang dapat dilanjutkan, dan terbit.
 *
 * Yang dibuktikan di sini bukan "halamannya terbuka", melainkan aturan yang
 * membuat wizard ini aman dipakai:
 *
 * 1. Draf dapat dimulai dari formulir KOSONG dan dilanjutkan kapan saja.
 * 2. "Lanjut" menuntut kelengkapan; "Simpan & keluar" tidak.
 * 3. Sampul hanya diterima bila berkasnya benar-benar ada di basis data.
 * 4. Batas 50 latar belakang ditegakkan di SERVER, bukan oleh tampilan.
 * 5. Dimensi latar belakang dibaca dari basis data, bukan dari kiriman klien.
 * 6. Terbit menuntut isi, dan sesudah terbit draf tidak lagi dapat disunting
 *    di tempat — aturan salin-saat-simpan kembali berlaku.
 *
 * Poin 4 dan 5 adalah dua tempat di mana "tampilan menyembunyikan tombolnya"
 * mudah disalahartikan sebagai pengaman. Keduanya diuji lewat permintaan HTTP
 * langsung, tanpa melewati halaman.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AccountsAdminRepository } from '../src/admin/accountsAdminRepository';
import { AdminRepository } from '../src/admin/adminRepository';
import { CatalogAdminRepository } from '../src/admin/catalogAdminRepository';
import { GenresRepository } from '../src/admin/genresRepository';
import { LocationsRepository } from '../src/admin/locationsRepository';
import { ProvidersRepository } from '../src/admin/providersRepository';
import { CharactersRepository } from '../src/admin/charactersRepository';
import { ModelsRepository } from '../src/admin/modelsRepository';
import type { AdminPageContext } from '../src/admin/pages/context';
import { stepOfDraft } from '../src/admin/pages/wizardPages';
import { PromotionsRepository } from '../src/admin/promotionsRepository';
import { SettingsRepository } from '../src/admin/settingsRepository';
import { MAX_BACKGROUNDS, WorldDraftRepository } from '../src/admin/worldDraftRepository';
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

/* ------------------------------------------------------------------ */
/* Contoh berkas                                                       */
/* ------------------------------------------------------------------ */

/**
 * PNG dengan dimensi tertentu, ditambah penanda unik.
 *
 * Penanda unik dipakai supaya setiap berkas punya SHA-256 yang berbeda —
 * penyimpanan bersifat content-addressed, jadi dua berkas identik akan
 * berbagi satu baris dan uji batas 50 tidak akan pernah mencapai 50.
 */
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

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let ctx: TestDatabase;
let app: FastifyInstance;
let admins: AdminRepository;
let drafts: WorldDraftRepository;
let locations: LocationsRepository;
let characters: CharactersRepository;

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

async function build(): Promise<FastifyInstance> {
  const config = testConfig();
  const usage = new UsageRepository(ctx.db, config.plan);
  admins = new AdminRepository(ctx.db);
  drafts = new WorldDraftRepository(ctx.db);
  locations = new LocationsRepository(ctx.db);
  characters = new CharactersRepository(ctx.db);

  const pages: AdminPageContext = {
    admins,
    settings: new SettingsRepository(ctx.db),
    catalog: new CatalogAdminRepository(ctx.db),
    accounts: new AccountsAdminRepository(ctx.db),
    promotions: new PromotionsRepository(ctx.db),
    models: new ModelsRepository(ctx.db),
    drafts,
    genres: new GenresRepository(ctx.db),
    characters,
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
  testCategoryId = null;
  app = await build();
  await admins.createAdmin({
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    displayName: 'Operator',
    role: 'owner',
  });
});

afterEach(async () => {
  await app.close();
  await ctx.close();
});

function form(payload: Record<string, string | string[]>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
    }
  }
  return parts.join('&');
}

async function login(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/login',
    payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(response.statusCode).toBe(302);
  const match = /fayln_admin_session=([^;]+)/.exec(String(response.headers['set-cookie']));
  return `${SESSION_COOKIE}=${match?.[1] ?? ''}`;
}

/** Mengunggah satu berkas dan mengembalikan id medianya. */
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

function post(cookie: string, url: string, payload: Record<string, string | string[]>) {
  return app.inject({
    method: 'POST',
    url,
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: form(payload),
  });
}

/** Membuat draf lengkap sampai langkah 2 siap. */
async function createDraftToStep2(cookie: string): Promise<string> {
  const cover = await upload(cookie, png(600, 800, 'cover'));
  const response = await post(cookie, '/admin/worlds-wizard/1', {
    worldId: '',
    title: 'Aula Kantor',
    synopsis: 'Sinopsis uji.',
    premise: 'Premis uji.',
    coverMediaId: cover,
    contentRating: 'all',
    genres: ['drama'],
    locales: ['id-ID'],
    intent: 'next',
  });
  expect(response.statusCode).toBe(302);
  const worldId = /\/admin\/worlds\/([^/]+)\/wizard\/2/.exec(String(response.headers.location))?.[1];
  expect(worldId, `lokasi tidak seperti diharapkan: ${String(response.headers.location)}`).toBeTruthy();
  return worldId!;
}

function location(response: { headers: Record<string, unknown> }): string {
  return String(response.headers.location ?? '');
}

/* ------------------------------------------------------------------ */
/* Langkah 1 — identitas dan sampul                                    */
/* ------------------------------------------------------------------ */

describe('langkah 1: identitas dan sampul', () => {
  it('membuat draf dari formulir kosong dan menyimpannya sebagai draf', async () => {
    const cookie = await login();

    // Justru INI janji "draf dapat dilanjutkan sewaktu-waktu": formulir yang
    // belum diisi apa pun tetap dapat ditinggalkan.
    const response = await post(cookie, '/admin/worlds-wizard/1', {
      worldId: '',
      intent: 'draft',
    });

    expect(response.statusCode).toBe(302);
    expect(location(response)).toContain('/admin/worlds?notice=draft');

    const list = await drafts.listDrafts();
    expect(list).toHaveLength(1);
    expect(list[0]?.worldVersion).toBe(1);
    expect(list[0]?.title).toBe('');
    expect(stepOfDraft(list[0]!)).toBe(1);
  });

  it('menolak "Lanjut" bila isian belum lengkap, tanpa memindahkan langkah', async () => {
    const cookie = await login();
    const cover = await upload(cookie, png(600, 800, 'cover-a'));

    // Premis sengaja dikosongkan.
    const response = await post(cookie, '/admin/worlds-wizard/1', {
      worldId: '',
      title: 'Judul',
      synopsis: 'Sinopsis',
      premise: '',
      coverMediaId: cover,
      genres: ['drama'],
      locales: ['id-ID'],
      intent: 'next',
    });

    expect(location(response)).toContain('/wizard/1?notice=incomplete');
    const list = await drafts.listDrafts();
    expect(list).toHaveLength(1);
    // Isian yang sudah benar tetap tersimpan — menolak "Lanjut" bukan membuang.
    // Ini janji "draf dapat dilanjutkan sewaktu-waktu", dan ia paling mudah
    // dilanggar justru di jalur yang paling sering dilalui: validasi gagal.
    expect(list[0]?.title).toBe('Judul');
    expect(list[0]?.coverMediaId).toBe(cover);
    expect(list[0]?.premise).toBe('');
  });

  it('menolak "Lanjut" bila sampul belum ada', async () => {
    const cookie = await login();
    const response = await post(cookie, '/admin/worlds-wizard/1', {
      worldId: '',
      title: 'Judul',
      synopsis: 'Sinopsis',
      premise: 'Premis',
      coverMediaId: '',
      genres: ['drama'],
      locales: ['id-ID'],
      intent: 'next',
    });
    expect(location(response)).toContain('/wizard/1?notice=incomplete');
  });

  it('mengabaikan id sampul yang tidak ada di basis data', async () => {
    const cookie = await login();

    // Berbentuk SHA-256 yang sah, tetapi tidak pernah diunggah. Kalau nilai ini
    // lolos, katalog pemain menampilkan gambar rusak — kegagalan yang baru
    // terlihat jauh dari tempat penyebabnya.
    const ghost = 'a'.repeat(64);
    const response = await post(cookie, '/admin/worlds-wizard/1', {
      worldId: '',
      title: 'Judul',
      synopsis: 'Sinopsis',
      premise: 'Premis',
      coverMediaId: ghost,
      genres: ['drama'],
      locales: ['id-ID'],
      intent: 'next',
    });

    expect(location(response)).toContain('/wizard/1?notice=incomplete');
    const list = await drafts.listDrafts();
    expect(list[0]?.coverMediaId).toBeNull();

    const worldId = list[0]!.worldId;
    const { rows } = await ctx.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM world_assets WHERE world_id = $1 AND kind = 'cover'`,
      [worldId],
    );
    expect(rows[0]?.total).toBe(0);
  });

  it('menyimpan genre dan lokale yang sah saja', async () => {
    const cookie = await login();
    const cover = await upload(cookie, png(600, 800, 'cover-b'));

    await post(cookie, '/admin/worlds-wizard/1', {
      worldId: '',
      title: 'Judul',
      synopsis: 'Sinopsis',
      premise: 'Premis',
      coverMediaId: cover,
      contentRating: '13_plus',
      // `bukan-genre` tidak ada dalam daftar; ia harus hilang, bukan tersimpan.
      genres: ['drama', 'bukan-genre'],
      locales: ['id-ID'],
      intent: 'next',
    });

    const draft = (await drafts.listDrafts())[0]!;
    expect(draft.genres).toEqual(['drama']);
    expect(draft.locales).toEqual(['id-ID']);
    expect(draft.contentRating).toBe('13_plus');
  });

  it('melanjutkan draf yang sama, bukan membuat draf baru', async () => {
    const cookie = await login();
    const cover = await upload(cookie, png(600, 800, 'cover-c'));

    const first = await post(cookie, '/admin/worlds-wizard/1', {
      worldId: '',
      intent: 'draft',
    });
    const worldId = (await drafts.listDrafts())[0]!.worldId;

    const second = await post(cookie, '/admin/worlds-wizard/1', {
      worldId,
      title: 'Judul',
      synopsis: 'Sinopsis',
      premise: 'Premis',
      coverMediaId: cover,
      genres: ['drama'],
      locales: ['id-ID'],
      intent: 'next',
    });

    expect(first.statusCode).toBe(302);
    expect(location(second)).toContain(`/admin/worlds/${worldId}/wizard/2`);
    expect(await drafts.listDrafts()).toHaveLength(1);
  });

  it('menolak melanjutkan dunia yang versi terbarunya bukan draf', async () => {
    const cookie = await login();

    // Dunia dari jalur lama: langsung dibuat dengan status `published`.
    const created = await post(cookie, '/admin/worlds', {
      worldId: '',
      title: 'Dunia Terbit',
      synopsis: 'S',
      premise: 'P',
      coverAssetId: 'a_cover_lentera',
      status: 'published',
      contentRating: 'all',
      genres: ['drama'],
      locales: ['id-ID'],
    });
    const worldId = /\/admin\/worlds\/([^/?]+)/.exec(location(created))?.[1] ?? '';
    expect(worldId).not.toBe('');

    const hijack = await post(cookie, '/admin/worlds-wizard/1', {
      worldId,
      title: 'Dibajak',
      intent: 'draft',
    });

    expect(location(hijack)).toContain('notice=not-draft');

    // Judul versi terbit tidak boleh tersentuh.
    const { rows } = await ctx.db.query<{ title: string }>(
      'SELECT title FROM world_versions WHERE world_id = $1',
      [worldId],
    );
    expect(rows.map((row) => row.title)).toEqual(['Dunia Terbit']);
  });
});

/* ------------------------------------------------------------------ */
/* Master lokasi: latar langkah 2 sekarang DIPUNGUT, bukan diunggah     */
/* ------------------------------------------------------------------ */

/**
 * Kategori (era) uji, dibuat sekali per basis data.
 *
 * Satu kategori cukup untuk seluruh berkas: yang diuji di sini adalah perilaku
 * langkah 2, bukan pengelolaan kategori.
 */
let testCategoryId: string | null = null;

async function testCategory(): Promise<string> {
  if (testCategoryId === null) {
    const created = await locations.createCategory('era uji');
    if (!created.ok) {
      throw new Error(`kategori uji gagal dibuat: ${created.reason}`);
    }
    testCategoryId = created.categoryId;
  }
  return testCategoryId;
}

/**
 * Membuat satu lokasi master bergambar.
 *
 * Setiap panggilan membuat LOKASI BARU. Di bentuk sekarang satu lokasi memang
 * satu tempat pada satu era, jadi beberapa latar dalam satu dunia berarti
 * beberapa lokasi — persis seperti pemakaian sebenarnya.
 */
async function masterLocation(mediaId: string): Promise<string> {
  const created = await locations.create({
    name: `Tempat uji ${mediaId.slice(0, 6)}`,
    categoryId: await testCategory(),
    description: '',
    mediaId,
  });
  if (!created.ok) {
    throw new Error(`lokasi uji gagal dibuat: ${created.reason}`);
  }
  return created.locationId;
}

/** Menyiapkan satu lokasi di master, lalu memungutnya ke dalam dunia. */

/* ------------------------------------------------------------------ */
/* Langkah 2 — latar belakang                                          */
/* ------------------------------------------------------------------ */

/**
 * Menyiapkan satu lokasi di master, lalu menjadikannya latar dunia.
 *
 * Namanya dipertahankan supaya uji-uji yang sudah ada — yang memakainya untuk
 * menyiapkan PRASYARAT, bukan untuk menguji pemungutan — tidak perlu diubah
 * semuanya. Sejak langkah 2 memakai kategori, satu panggilan ini menyusun
 * SELURUH lokasi kategori uji, bukan hanya satu.
 */
/**
 * Karakter master siap pakai, lalu dipungut ke dalam dunia.
 *
 * Menggantikan penyusunan NPC di dalam uji: sejak langkah 3 memungut dari master,
 * karakter TIDAK DAPAT dibuat langsung di wizard — dan itulah yang dijaga di sini.
 */
async function tambahKarakter(
  cookie: string,
  worldId: string,
  name: string,
  ekspresi: string[],
): Promise<void> {
  const daftar = [];
  for (const [index, label] of ekspresi.entries()) {
    const mediaId = await upload(cookie, png(512, 768, `${name}-${label}-${String(index)}`));
    daftar.push({ expression: label, mediaId, usageNote: '' });
  }
  const created = await characters.create({ name, expressions: daftar });
  if (!created.ok) {
    throw new Error(`karakter master gagal dibuat: ${created.reason}`);
  }
  await post(cookie, '/admin/worlds-wizard/3/npc', {
    worldId,
    characterId: created.characterId,
    role: '',
  });
}

async function addBackground(cookie: string, worldId: string, mediaId: string) {
  await masterLocation(mediaId);
  return simpanKategori(cookie, worldId, await testCategory());
}

/* ------------------------------------------------------------------ */
/* Langkah 2 — latar dari kategori                                     */
/* ------------------------------------------------------------------ */

/**
 * Menyimpan kategori lokasi dunia.
 *
 * Menggantikan `addBackground`, yang memungut satu lokasi per permintaan. Sekarang
 * satu permintaan menentukan KATEGORI, dan seluruh lokasi di dalamnya menjadi
 * latar dunia.
 */
async function simpanKategori(
  cookie: string,
  worldId: string,
  categoryId: string,
  intent: 'next' | 'draft' = 'draft',
) {
  return post(cookie, '/admin/worlds-wizard/2', { worldId, categoryId, intent });
}

describe('langkah 2: latar dari kategori', () => {
  it('menyusun latar dari SELURUH lokasi kategori, berurut seperti master', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    const a = await upload(cookie, png(1280, 720, 'kat-1'));
    const b = await upload(cookie, png(1280, 720, 'kat-2'));
    await masterLocation(a);
    await masterLocation(b);

    const response = await simpanKategori(cookie, worldId, await testCategory());
    expect(location(response)).toContain('notice=draft');

    const rows = await drafts.listBackgrounds(worldId, 1);
    expect(rows, 'seluruh lokasi kategori seharusnya menjadi latar').toHaveLength(2);
    // Urutan ditentukan `position`, bukan urutan penyisipan yang kebetulan.
    expect(rows.map((row) => row.position)).toEqual([1, 2]);
    expect(rows.every((row) => row.uri === `/v1/media/${row.mediaId}`)).toBe(true);
  });

  it('memberi blur 30 dan titik fokus netral, tanpa disunting satu per satu', async () => {
    /*
     * Nilai bawaannya ditentukan di sini, bukan oleh admin per baris. Blur 0
     * membuat latar bersaing dengan teks di atasnya; 30 melembutkannya tanpa
     * membuat tempatnya tidak dikenali.
     */
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);
    const mediaId = await upload(cookie, png(1280, 720, 'blur-30'));
    await masterLocation(mediaId);

    await simpanKategori(cookie, worldId, await testCategory());

    const [row] = await drafts.listBackgrounds(worldId, 1);
    expect(row?.blurStrength, 'blur bawaan bukan 30').toBe(30);
    expect(row?.focalX).toBe(0.5);
    expect(row?.focalY).toBe(0.5);
    // Dimensi dibaca dari basis data media, bukan dari kiriman klien.
    expect(row?.width).toBe(1280);
    expect(row?.height).toBe(720);
  });

  it('MENGGANTI latar saat kategorinya diganti, bukan menambah', async () => {
    /*
     * Ini yang membedakannya dari memungut satu per satu: daftarnya TURUNAN, jadi
     * mengganti kategori berarti mengganti seluruh isinya. Menambahkan akan
     * menumpuk latar dari dua era sekaligus, dan tidak ada yang menyadarinya
     * sampai ada adegan yang muncul di tempat yang salah.
     */
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    const lama = await upload(cookie, png(1280, 720, 'era-lama'));
    await masterLocation(lama);
    await simpanKategori(cookie, worldId, await testCategory());
    expect(await drafts.listBackgrounds(worldId, 1)).toHaveLength(1);

    const kategoriBaru = await locations.createCategory('era kedua');
    expect(kategoriBaru.ok).toBe(true);
    if (!kategoriBaru.ok) {
      return;
    }
    const baru = await upload(cookie, png(1280, 720, 'era-baru'));
    await locations.create({
      name: 'Tempat era kedua',
      categoryId: kategoriBaru.categoryId,
      description: '',
      mediaId: baru,
    });

    await simpanKategori(cookie, worldId, kategoriBaru.categoryId);

    const rows = await drafts.listBackgrounds(worldId, 1);
    expect(rows, 'latar era lama seharusnya sudah tidak ada').toHaveLength(1);
    expect(rows[0]?.mediaId).toBe(baru);
  });

  it('lokasi tanpa gambar TIDAK MUNGKIN ada, jadi tidak ada yang dilewati', async () => {
    /*
     * Penyusun latar melewati lokasi yang gambarnya belum ada — tetapi jalur itu
     * tidak pernah tercapai, dan uji ini menjelaskan MENGAPA: kunci asing
     * `locations_media_fk` menolak lokasi yang medianya tidak ada di `media_blobs`.
     *
     * Dokumentasinya penting justru karena jalur itu tidak dapat diuji: pembaca
     * berikutnya yang menemukan `skipped` di kode akan menduga ada data seperti itu
     * di produksi, dan mencarinya sia-sia.
     */
    const categoryId = await testCategory();
    await expect(
      ctx.db.query(
        `INSERT INTO locations (location_id, name, category_id, description, media_id, position)
         VALUES ('loc_tanpa_gambar', 'Tempat tanpa gambar', $1, '', '', 99)`,
        [categoryId],
      ),
    ).rejects.toThrow();
  });

  it('TIDAK menghapus sampul dan potret saat menyusun ulang latar', async () => {
    /*
     * Sampul, latar, dan potret berada di TABEL YANG SAMA (`world_assets`) dan
     * dibedakan oleh `kind`. Menyusun ulang latar dengan menghapus seluruh baris
     * versi ini akan menghapus sampul dan potret karakter tanpa satu pun galat —
     * dan admin baru menyadarinya saat dunianya tampil tanpa gambar.
     */
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    const mediaId = await upload(cookie, png(1280, 720, 'latar'));
    await masterLocation(mediaId);

    const { rows: sebelum } = await ctx.db.query<{ jumlah: number }>(
      `SELECT count(*)::int AS jumlah FROM world_assets
       WHERE world_id = $1 AND world_version = 1 AND kind = 'cover'`,
      [worldId],
    );
    expect(sebelum[0]?.jumlah, 'sampul tidak ada sebelum uji ini dimulai').toBe(1);

    await simpanKategori(cookie, worldId, await testCategory());

    const { rows: sesudah } = await ctx.db.query<{ jumlah: number }>(
      `SELECT count(*)::int AS jumlah FROM world_assets
       WHERE world_id = $1 AND world_version = 1 AND kind = 'cover'`,
      [worldId],
    );
    expect(sesudah[0]?.jumlah, 'sampul ikut terhapus').toBe(1);
  });

  it('menolak kategori yang tidak ada, tanpa mengubah latarnya', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    const mediaId = await upload(cookie, png(1280, 720, 'tetap'));
    await masterLocation(mediaId);
    await simpanKategori(cookie, worldId, await testCategory());

    const response = await simpanKategori(cookie, worldId, 'kat_tidak_ada');
    expect(location(response)).toContain('notice=category-not-found');

    const rows = await drafts.listBackgrounds(worldId, 1);
    expect(rows, 'latar lama seharusnya tidak tersentuh').toHaveLength(1);
  });

  it('mencatat kategori pilihannya pada draf', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);
    const mediaId = await upload(cookie, png(1280, 720, 'catat'));
    await masterLocation(mediaId);

    const categoryId = await testCategory();
    await simpanKategori(cookie, worldId, categoryId);

    const draft = await drafts.findDraft(worldId);
    expect(draft?.locationCategoryId).toBe(categoryId);
  });
});

/* ------------------------------------------------------------------ */
/* Langkah 3 — karakter                                                */
/* ------------------------------------------------------------------ */

describe('langkah 3: karakter dari master', () => {
  /** Dunia yang sudah melewati langkah 2 — langkah 3 menuntut latarnya ada. */
  async function step3(cookie: string): Promise<string> {
    const worldId = await createDraftToStep2(cookie);
    const bg = await upload(cookie, png(1280, 720, 'bg-npc'));
    await addBackground(cookie, worldId, bg);
    return worldId;
  }

  /** Satu karakter master beserta ekspresinya, siap dipungut. */
  async function masterCharacter(cookie: string, name: string, ekspresi: string[]): Promise<string> {
    const daftar = [];
    for (const [index, label] of ekspresi.entries()) {
      const mediaId = await upload(cookie, png(512, 768, `${name}-${label}-${String(index)}`));
      daftar.push({ expression: label, mediaId, usageNote: '' });
    }
    const created = await characters.create({ name, expressions: daftar });
    if (!created.ok) {
      throw new Error(`karakter master gagal dibuat: ${created.reason}`);
    }
    return created.characterId;
  }

  it('menyalin nama dan SELURUH ekspresi dari master', async () => {
    /*
     * Inilah alasan perubahan ini: master sudah punya potretnya, dan sebelumnya
     * setiap dunia mengunggah ulang gambar yang sama.
     */
    const cookie = await login();
    const worldId = await step3(cookie);
    const characterId = await masterCharacter(cookie, 'Elysia', ['dasar', 'marah']);

    const response = await post(cookie, '/admin/worlds-wizard/3/npc', { worldId, characterId, role: 'bosmu' });
    expect(String(response.headers.location ?? ''), JSON.stringify({ status: response.statusCode, body: response.body.slice(0, 200) })).toContain('notice=picked');

    const npcs = await drafts.listNpcs(worldId, 1);
    expect(npcs).toHaveLength(1);

    const npc = npcs[0]!;
    expect(npc.name, 'nama tidak disalin dari master').toBe('Elysia');
    expect(npc.role).toBe('bosmu');
    expect(npc.masterCharacterId, 'asal karakter tidak dicatat').toBe(characterId);
    expect(npc.expressions.map((item) => item.expression)).toEqual(['dasar', 'marah']);
    // Potret bawaannya ekspresi pertama — aturan yang sama dengan `dasar`.
    expect(npc.baseMediaId).toBe(npc.expressions[0]?.mediaId);
  });

  it('mengizinkan nama diganti tanpa mengubah master', async () => {
    const cookie = await login();
    const worldId = await step3(cookie);
    const characterId = await masterCharacter(cookie, 'Elysia', ['dasar']);

    await post(cookie, '/admin/worlds-wizard/3/npc', { worldId, characterId, role: 'bosmu' });
    const [npc] = await drafts.listNpcs(worldId, 1);

    await post(cookie, '/admin/worlds-wizard/3/npc/save', {
      worldId,
      npcId: npc!.npcId,
      name: 'Bu Ratna',
      role: 'bosmu',
      background: 'Mantan pacar @user saat SMP dulu.',
      soul: 'Pendiam karena terbiasa mengamati.',
    });

    const [sesudah] = await drafts.listNpcs(worldId, 1);
    expect(sesudah?.name).toBe('Bu Ratna');
    expect(sesudah?.publicBackstory).toContain('@user');
    expect(sesudah?.soul).toContain('terbiasa mengamati');

    // Master TIDAK ikut berubah — itu janji halaman ini.
    const master = await characters.find(characterId);
    expect(master?.name, 'master ikut berubah').toBe('Elysia');
  });

  it('menyimpan soul, yang menggantikan sifat', async () => {
    const cookie = await login();
    const worldId = await step3(cookie);
    const characterId = await masterCharacter(cookie, 'Elysia', ['dasar']);

    await post(cookie, '/admin/worlds-wizard/3/npc', { worldId, characterId, role: 'bosmu' });
    const [npc] = await drafts.listNpcs(worldId, 1);

    await post(cookie, '/admin/worlds-wizard/3/npc/save', {
      worldId,
      npcId: npc!.npcId,
      name: 'Elysia',
      role: 'bosmu',
      background: 'Latar.',
      soul: 'Ia menahan kesal dengan diam.',
    });

    const [sesudah] = await drafts.listNpcs(worldId, 1);
    expect(sesudah?.soul).toBe('Ia menahan kesal dengan diam.');
  });

  it('menolak karakter master yang tidak ada', async () => {
    const cookie = await login();
    const worldId = await step3(cookie);

    const response = await post(cookie, '/admin/worlds-wizard/3/npc', {
      worldId,
      characterId: 'char_tidak_ada',
      role: '',
    });

    expect(location(response)).toContain('notice=not-found');
    expect(await drafts.listNpcs(worldId, 1)).toHaveLength(0);
  });

  it('menghapus karakter dunia tanpa menyentuh master', async () => {
    const cookie = await login();
    const worldId = await step3(cookie);
    const characterId = await masterCharacter(cookie, 'Elysia', ['dasar']);

    await post(cookie, '/admin/worlds-wizard/3/npc', { worldId, characterId, role: 'bosmu' });
    const [npc] = await drafts.listNpcs(worldId, 1);

    await post(cookie, '/admin/worlds-wizard/3/npc/delete', { worldId, npcId: npc!.npcId });

    expect(await drafts.listNpcs(worldId, 1)).toHaveLength(0);
    expect(await characters.find(characterId), 'master ikut terhapus').not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Terbit                                                              */
/* ------------------------------------------------------------------ */

describe('penerbitan', () => {
  it('menolak terbit tanpa latar belakang atau tanpa NPC', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    // Tanpa latar belakang sama sekali.
    const kosong = await post(cookie, '/admin/worlds-wizard/3', { worldId, intent: 'next' });
    expect(location(kosong)).toContain('/wizard/3?notice=incomplete');

    // Ada latar belakang, belum ada NPC.
    const bg = await upload(cookie, png(1280, 720, 'pub-bg'));
    await addBackground(cookie, worldId, bg);

    const tanpaNpc = await post(cookie, '/admin/worlds-wizard/3', { worldId, intent: 'next' });
    expect(location(tanpaNpc)).toContain('/wizard/3?notice=incomplete');

    const { rows } = await ctx.db.query<{ status: string }>(
      'SELECT status FROM world_versions WHERE world_id = $1',
      [worldId],
    );
    expect(rows[0]?.status).toBe('draft');
  });

  it('karakter tanpa potret TIDAK MUNGKIN ada, jadi tidak ada yang menahan terbit', async () => {
    /*
     * Penjaga "tolak terbit bila ada karakter tanpa potret" tidak dapat diuji
     * lagi, dan uji ini menjelaskan MENGAPA: sejak langkah 3 memungut karakter
     * dari master, dan master menuntut setiap karakter punya minimal satu
     * ekspresi bergambar, karakter tanpa wajah tidak dapat masuk ke sebuah dunia.
     *
     * Penjaganya sendiri tetap ada di `publishDraft` — ia murah, dan ia menahan
     * baris LAMA yang dibuat sebelum aturan ini berlaku. Yang berubah hanya
     * kenyataan bahwa jalur itu tidak lagi dapat dicapai lewat wizard.
     */
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    const bg = await upload(cookie, png(1280, 720, 'faceless-bg'));
    await addBackground(cookie, worldId, bg);
    await tambahKarakter(cookie, worldId, 'Belum Ada Wajah', ['netral']);

    expect(await drafts.countNpcsWithoutPortrait(worldId, 1)).toBe(0);

    const response = await post(cookie, '/admin/worlds-wizard/3', { worldId, intent: 'next' });
    expect(location(response)).toContain('/admin/worlds?notice=published');
  });

  it('menerbitkan draf dan mencatat tanggal terbitnya', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    const bg = await upload(cookie, png(1280, 720, 'pub-bg-2'));
    await addBackground(cookie, worldId, bg);

    await tambahKarakter(cookie, worldId, 'Elysia', ['netral']);

    const response = await post(cookie, '/admin/worlds-wizard/3', { worldId, intent: 'next' });
    expect(location(response)).toContain('/admin/worlds?notice=published');

    const { rows } = await ctx.db.query<{ status: string; published_at: unknown }>(
      'SELECT status, published_at FROM world_versions WHERE world_id = $1',
      [worldId],
    );
    expect(rows[0]?.status).toBe('published');
    expect(rows[0]?.published_at).not.toBeNull();

    // Tidak ada versi kedua: penerbitan mengubah status, bukan menyalin baris.
    const { rows: versions } = await ctx.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM world_versions WHERE world_id = $1',
      [worldId],
    );
    expect(versions[0]?.total).toBe(1);

    // Dan draf itu tidak lagi dapat dilanjutkan lewat wizard.
    expect(await drafts.findDraft(worldId)).toBeNull();
  });

  it('tidak lagi menyunting di tempat setelah terbit', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    const bg = await upload(cookie, png(1280, 720, 'pub-bg-3'));
    await addBackground(cookie, worldId, bg);
    await tambahKarakter(cookie, worldId, 'Elysia', ['netral']);
    await post(cookie, '/admin/worlds-wizard/3', { worldId, intent: 'next' });

    const judulSebelum = (await ctx.db.query<{ title: string }>(
      'SELECT title FROM world_versions WHERE world_id = $1',
      [worldId],
    )).rows[0]!.title;

    // Seluruh jalur penyuntingan draf harus menolak, bukan diam-diam berhasil.
    const identity = await post(cookie, '/admin/worlds-wizard/1', {
      worldId,
      title: 'Judul Baru',
      intent: 'draft',
    });
    expect(location(identity)).toContain('notice=not-draft');

    const background = await addBackground(cookie, worldId, bg);
    expect(location(background)).toContain('notice=not-draft');

    const publish = await post(cookie, '/admin/worlds-wizard/3', { worldId, intent: 'next' });
    expect(location(publish)).toContain('notice=not-draft');

    const { rows } = await ctx.db.query<{ title: string; status: string }>(
      'SELECT title, status FROM world_versions WHERE world_id = $1',
      [worldId],
    );
    expect(rows[0]?.title).toBe(judulSebelum);
    expect(rows[0]?.status).toBe('published');
  });

  it('mencatat penyimpanan draf dan penerbitan di audit', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    const bg = await upload(cookie, png(1280, 720, 'audit-bg'));
    await addBackground(cookie, worldId, bg);
    await tambahKarakter(cookie, worldId, 'Elysia', ['netral']);
    await post(cookie, '/admin/worlds-wizard/3', { worldId, intent: 'next' });

    for (const action of [
      'world.draft.save',
      'world.location_category.save',
      'world.npc.pick',
      'world.publish',
    ]) {
      const entries = await admins.listAudit(50, { action });
      expect(entries.length, `audit untuk ${action}`).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Panel "lanjutkan draf" di daftar dunia                              */
/* ------------------------------------------------------------------ */

describe('panel draf di halaman daftar dunia', () => {
  it('tidak menampilkan panel saat belum ada draf', async () => {
    const cookie = await login();
    const page = await app.inject({ method: 'GET', url: '/admin/worlds', headers: { cookie } });

    // Judul bagian kosong lebih buruk daripada tidak ada bagian sama sekali.
    expect(page.body).not.toContain('Draf belum selesai');
  });

  it('menampilkan draf sebagai tabel sungguhan dengan langkah yang diturunkan', async () => {
    const cookie = await login();
    const cover = await upload(cookie, png(600, 800, 'panel-cover'));

    // Identitas lengkap, belum ada latar belakang -> langkah yang pantas = 2.
    await post(cookie, '/admin/worlds-wizard/1', {
      worldId: '',
      title: 'Draf Panel',
      synopsis: 'Sinopsis',
      premise: 'Premis',
      coverMediaId: cover,
      genres: ['drama'],
      locales: ['id-ID'],
      intent: 'draft',
    });
    const worldId = (await drafts.listDrafts())[0]!.worldId;

    const page = await app.inject({ method: 'GET', url: '/admin/worlds', headers: { cookie } });

    // `table()` menerima larik `SafeHtml`. Kalau barisnya di-`join` lebih dulu,
    // tabelnya tampil sebagai `&lt;td&gt;` — tanpa galat, dan tanpa tag hidup.
    for (const broken of ['&lt;td&gt;', '&lt;table', '&lt;tr&gt;', '&lt;button']) {
      expect(page.body, `markup tampil sebagai teks: ${broken}`).not.toContain(broken);
    }

    expect(page.body).toContain('Draf belum selesai');
    expect(page.body).toContain('Draf Panel');
    // Langkahnya DITURUNKAN dari isi draf, bukan dari kolom yang disimpan.
    expect(page.body).toContain('langkah 2 dari 3');
    expect(page.body).toContain('belum ada latar');
    expect(page.body).toContain(`/admin/worlds/${worldId}/wizard/2`);
  });

  it('menaikkan langkah panel begitu latar belakang ditambahkan', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    const before = await app.inject({ method: 'GET', url: '/admin/worlds', headers: { cookie } });
    expect(before.body).toContain('langkah 2 dari 3');

    const bg = await upload(cookie, png(1280, 720, 'panel-bg'));
    await addBackground(cookie, worldId, bg);

    const after = await app.inject({ method: 'GET', url: '/admin/worlds', headers: { cookie } });
    // Isi draf berubah -> langkahnya ikut berubah tanpa ada yang menulisinya.
    expect(after.body).toContain('langkah 3 dari 3');
    expect(after.body).toContain(`/admin/worlds/${worldId}/wizard/3`);
    expect(after.body).toContain('1 latar');
  });
});

/* ------------------------------------------------------------------ */
/* Perlindungan dan render                                             */
/* ------------------------------------------------------------------ */

describe('perlindungan dan render halaman wizard', () => {
  const WIZARD_PAGES = [
    '/admin/worlds-wizard',
    '/admin/worlds/w_apa-saja/wizard/1',
    '/admin/worlds/w_apa-saja/wizard/2',
    '/admin/worlds/w_apa-saja/wizard/3',
  ];

  it('mengalihkan seluruh halaman wizard ke halaman masuk tanpa sesi', async () => {
    for (const url of WIZARD_PAGES) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, `${url} seharusnya dialihkan`).toBe(302);
      expect(location(response)).toContain('/admin/login');
    }
  });

  it('menolak seluruh tindakan wizard tanpa sesi', async () => {
    const mutations: [string, Record<string, string>][] = [
      ['/admin/worlds-wizard/1', { worldId: '', intent: 'draft' }],
      ['/admin/worlds-wizard/2', { worldId: 'w_x', intent: 'draft' }],
      ['/admin/worlds-wizard/2/backgrounds/pick', { worldId: 'w_x', pick: 'loc_x|cat_y' }],
      ['/admin/worlds-wizard/2/background', { worldId: 'w_x', assetId: 'bg_x' }],
      ['/admin/worlds-wizard/3', { worldId: 'w_x', intent: 'next' }],
      ['/admin/worlds-wizard/3/npc', { worldId: 'w_x', name: 'X' }],
      ['/admin/worlds-wizard/3/npc/delete', { worldId: 'w_x', npcId: 'npc_x' }],
    ];

    for (const [url, payload] of mutations) {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: form(payload),
      });
      expect(response.statusCode, `${url} seharusnya dialihkan`).toBe(302);
      expect(location(response)).toContain('/admin/login');
    }
  });

  it('menyusun halaman wizard sebagai markup, bukan teks yang ter-escape', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    /*
     * Master diisi lebih dulu supaya pemilihnya benar-benar dirender.
     * Memeriksa halaman yang menampilkan kartu peringatan "master masih kosong"
     * tidak membuktikan apa pun tentang markup pemilihnya — persis kelas cacat
     * yang membuat panel bersyarat mudah lolos dari uji.
     */
    await masterLocation(await upload(cookie, png(1280, 720, 'bg-markup')));

    const page = await app.inject({
      method: 'GET',
      url: `/admin/worlds/${worldId}/wizard/2`,
      headers: { cookie },
    });
    const body = page.body;

    // Kalau `html()` menerima potongan yang sudah di-`join`, tabelnya tampil
    // sebagai `&lt;td&gt;` — tanpa galat, tanpa tag hidup, dan uji XSS yang
    // hanya mencari "tidak ada skrip" tetap lolos. Karena itu diperiksa di sini.
    for (const broken of ['&lt;table', '&lt;td&gt;', '&lt;li&gt;', '&lt;input', '&lt;select']) {
      expect(body, `markup tampil sebagai teks: ${broken}`).not.toContain(broken);
    }
    expect(body).toContain('Latar belakang');
    expect(body, 'pemilih kategori tidak dirender sebagai elemen').toContain('<select name="categoryId"');
    expect(body, 'pilihan pemilih harus berisi pasangan lokasi-kategori').toContain(
      'Tempat uji',
    );
  });

  /**
   * Entitas HTML pada label tombol.
   *
   * Cacat yang dijaga di sini konkret dan pernah terjadi: label tombol dikirim
   * sebagai `string` biasa, lalu `html()` meng-escape-nya — sehingga tombolnya
   * berbunyi "Lanjut ke latar belakang &rarr;" apa adanya, bukan dengan tanda
   * panah. Tidak ada galat apa pun; hanya teks yang salah.
   *
   * Karena itu pemeriksaannya HARUS melihat kedua arah: entitasnya tidak muncul
   * sebagai teks, DAN panahnya benar-benar tergambar. Memeriksa salah satu saja
   * akan lolos pada salah satu dari dua kesalahan yang berlawanan — entitas yang
   * tidak ter-escape (panah tampil sebagai `&rarr;` di dalam atribut) dan markup
   * yang ter-escape ganda (`&amp;rarr;`).
   */
  it('menggambar panah pada tombol aksi, bukan menuliskan entitasnya', async () => {
    const cookie = await login();
    const worldId = await createDraftToStep2(cookie);

    for (const [step, expected] of [
      [1, 'Lanjut ke latar belakang'],
      [2, 'Lanjut ke karakter'],
      [3, 'Simpan &amp; terbitkan'],
    ] as [number, string][]) {
      const page = await app.inject({
        method: 'GET',
        url: `/admin/worlds/${worldId}/wizard/${String(step)}`,
        headers: { cookie },
      });
      expect(page.statusCode, `langkah ${String(step)}`).toBe(200);

      const body = page.body;
      expect(body, `langkah ${String(step)} kehilangan labelnya`).toContain(expected);

      if (step !== 3) {
        // Panahnya benar-benar ada sebagai karakter, bukan sebagai entitas.
        expect(body, `langkah ${String(step)} tidak menggambar panah`).toContain('&rarr;');
        expect(body, `langkah ${String(step)} menuliskan entitas sebagai teks`).not.toContain(
          '&amp;rarr;',
        );
      }
    }
  });

  it('meng-escape judul draf sehingga tidak dapat menyuntikkan skrip', async () => {
    const cookie = await login();
    const cover = await upload(cookie, png(600, 800, 'xss-cover'));

    await post(cookie, '/admin/worlds-wizard/1', {
      worldId: '',
      title: '<script>alert(1)</script>',
      synopsis: 'Sinopsis',
      premise: 'Premis',
      coverMediaId: cover,
      genres: ['drama'],
      locales: ['id-ID'],
      intent: 'draft',
    });

    const page = await app.inject({
      method: 'GET',
      url: '/admin/worlds',
      headers: { cookie },
    });

    expect(page.body).not.toContain('<script>alert(1)</script>');
    expect(page.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
