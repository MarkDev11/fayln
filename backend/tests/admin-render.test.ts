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
import { CharactersRepository } from '../src/admin/charactersRepository';
import { LocationsRepository } from '../src/admin/locationsRepository';
import { ProvidersRepository } from '../src/admin/providersRepository';
import { SECRETS_KEY_ENV } from '../src/admin/secretBox';
import { ModelsRepository } from '../src/admin/modelsRepository';
import { formatNumber } from '../src/admin/pages/dashboardPages';
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
    characters: new CharactersRepository(ctx.db),
    locations: new LocationsRepository(ctx.db),
    providers: new ProvidersRepository(ctx.db),

    plan: testConfig().plan,
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

  /*
   * Atribut yang ter-escape, bukan tag.
   *
   * Pemeriksaan tag di atas MELEWATKAN cacat satu ini: sebuah string biasa
   * berisi ` class="on"` disisipkan ke template `html`, jadi tanda kutipnya
   * menjadi &quot; dan nilai kelasnya berisi tanda kutip itu sendiri. Tidak
   * ada satu pun tag yang tampil sebagai teks, sehingga uji tag lolos — padahal
   * tidak ada satu pun menu bilah sisi yang tersorot, dan cacat itu hidup lama
   * justru karena tampilannya hanya "kurang", bukan "salah".
   *
   * Yang dicari adalah `=&quot;`, bukan `&quot;` begitu saja. Teks isi memang
   * boleh memuat tanda kutip lurus dan memang HARUS ter-escape — mis. kalimat
   * "HEMAT" dan "hemat" dianggap sama pada halaman promosi. Tanda kutip yang
   * muncul persis setelah tanda sama-dengan, di dalam sebuah tag, adalah tanda
   * bahwa pembatas atribut ikut ter-escape.
   */
  const rusak = (body.match(/<[^>]*>/g) ?? []).filter((tag) => tag.includes('=&quot;'));
  expect(rusak, `Halaman ${label} memuat atribut yang ter-escape`).toEqual([]);
}

async function sweep(cookie: string, url: string): Promise<string> {
  const response = await app.inject({ method: 'GET', url, headers: { cookie } });
  expect(response.statusCode, `${url} mengembalikan ${response.statusCode}`).toBe(200);
  expectLiveMarkup(response.body, url);
  return response.body;
}

/**
 * Isi sebuah formulir, dari tag pembukanya sampai `</form>` pertamanya.
 *
 * Dipakai untuk membuktikan letak sebuah potongan DI DALAM formulir — hal yang
 * tidak dapat dibuktikan oleh pencarian biasa, karena `toContain` juga cocok
 * untuk potongan yang berada di luar formulir.
 */
function formWith(body: string, marker: string): string {
  const start = body.indexOf(marker);
  expect(start, `penanda "${marker}" tidak ditemukan di halaman`).toBeGreaterThan(-1);
  // Penanda berada di dalam tag pembuka; mundur ke awal tag itu.
  const open = body.lastIndexOf('<form', start);
  expect(open, `tag <form> sebelum "${marker}" tidak ditemukan`).toBeGreaterThan(-1);
  const end = body.indexOf('</form>', start);
  expect(end, `</form> setelah "${marker}" tidak ditemukan`).toBeGreaterThan(-1);
  return body.slice(open, end);
}

/**
 * Menyisipkan satu berkas media agar sebuah baris bergambar dapat dirender.
 *
 * Berkasnya PNG 1×1 yang SAH, dan `byte_size` dihitung dari isinya — bukan
 * angka yang dikarang. `MediaRepository.readBytes` menolak baris yang
 * `byte_size`-nya tidak sama dengan panjang isi yang didekode, jadi baris yang
 * tidak konsisten akan menghasilkan 404 tanpa penjelasan: gambarnya tampak
 * terpasang di markup, tetapi tidak pernah dapat dimuat.
 *
 * Hanya baris media-nya yang disiapkan begini; isi masternya tetap dibuat lewat
 * repositori sungguhan. Jalur unggahannya sendiri sudah diuji di `admin.test.ts`
 * dan `wizard.test.ts`.
 */
async function seedMedia(mediaId: string): Promise<void> {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  );
  await ctx.db.query(
    `INSERT INTO media_blobs (media_id, content_type, byte_size, width, height, content_base64)
     VALUES ($1, 'image/png', $2, 1, 1, $3)`,
    [mediaId, bytes.length, bytes.toString('base64')],
  );
}

/**
 * Id media yang sah: SHA-256 heksadesimal, sama seperti hasil unggahan.
 *
 * Bentuknya penting. Penyaji berkas menolak bentuk lain, jadi id yang dikarang
 * bebas akan menghasilkan gambar yang terpasang di markup tetapi selalu gagal
 * dimuat — dan uji yang memakai id karangan tidak akan pernah menangkapnya.
 */
const MEDIA_ID = `${'a1'.repeat(32)}`;

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

/**
 * Pasangan "kosong" dan "ada isi".
 *
 * Halaman bersyarat adalah tempat cacat bersembunyi: memeriksa halaman saat
 * datanya KOSONG tidak membuktikan bahwa daftarnya benar-benar terbentuk saat
 * ada isi — dan sebaliknya, memeriksa saat ada isi tidak membuktikan cabang
 * kosongnya hidup. Keduanya karena itu diperiksa berpasangan.
 */
describe('master karakter: keadaan kosong dan berisi', () => {
  it('menampilkan pesan kosong saat belum ada karakter', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/characters');

    expect(body).toContain('Belum ada karakter');
    // Pesannya harus hidup sebagai elemen, bukan tertulis sebagai tag.
    expect(body).not.toContain('&lt;div');
    expect(body).not.toContain('class="list__item"');
  });

  it('menampilkan baris sungguhan beserta jumlah ekspresinya saat ada isi', async () => {
    const cookie = await login();
    await seedMedia(MEDIA_ID);
    await pages.characters.create({
      name: 'Elysia',
      expressions: [{ expression: 'netral', mediaId: MEDIA_ID, usageNote: '' }],
    });

    const body = await sweep(cookie, '/admin/characters');

    expect(body, 'pesan kosong masih tampil padahal ada karakter').not.toContain(
      'Belum ada karakter',
    );
    expect(body).toContain('class="list__item"');
    expect(body).toContain('Elysia');
    expect(body).toContain('1 ekspresi');
    // Potretnya benar-benar dipasang, bukan kotak kosong.
    expect(body).toContain(`src="/v1/media/${MEDIA_ID}"`);

    // Dan alamat itu benar-benar menyajikan gambar. Tanpa pemeriksaan ini,
    // markup-nya dapat menunjuk berkas yang tidak pernah dapat dimuat — cacat
    // yang hanya terlihat sebagai potret rusak di layar admin.
    const image = await app.inject({ method: 'GET', url: `/v1/media/${MEDIA_ID}` });
    expect(image.statusCode, 'potret yang dipasang daftar tidak dapat dimuat').toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
  });
});

/**
 * Master lokasi — pasangan "kosong" dan "berisi", dengan alasan yang sama
 * seperti master karakter.
 *
 * Yang khas halaman ini: pemilih latar di langkah 2 wizard HANYA dirender bila
 * master punya latar bergambar. Jadi halaman itu punya dua cabang, dan
 * keduanya harus dibuktikan — bukan hanya cabang yang kebetulan tampak di
 * produksi saat datanya sudah terisi.
 */
describe('master lokasi: keadaan kosong dan berisi', () => {
  /** Membuat satu kategori dan satu lokasi bergambar, lalu mengembalikan idnya. */
  async function seedLocation(name: string, categoryName: string): Promise<void> {
    const category = await pages.locations.createCategory(categoryName);
    if (!category.ok) {
      throw new Error(`kategori uji gagal dibuat: ${category.reason}`);
    }
    const created = await pages.locations.create({
      name,
      categoryId: category.categoryId,
      description: '',
      mediaId: MEDIA_ID,
    });
    if (!created.ok) {
      throw new Error(`lokasi uji gagal dibuat: ${created.reason}`);
    }
  }

  it('menampilkan pesan kosong saat belum ada lokasi', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/locations');

    expect(body).toContain('Belum ada lokasi');
    // Dan memperingatkan bahwa kategori belum ada: tanpa kategori, latar tidak
    // dapat diunggah sama sekali — halaman yang diam saja akan menyesatkan.
    expect(body).toContain('Belum ada kategori');
    expect(body).not.toContain('class="list__item"');
    expect(body).not.toContain('&lt;div');
  });

  it('menampilkan baris sungguhan beserta jumlah eranya saat ada isi', async () => {
    const cookie = await login();
    await seedMedia(MEDIA_ID);
    await seedLocation('Aula Kantor', 'masa kini');

    const body = await sweep(cookie, '/admin/locations');

    expect(body, 'pesan kosong masih tampil padahal ada lokasi').not.toContain('Belum ada lokasi');
    expect(body).toContain('class="list__item"');
    expect(body).toContain('Aula Kantor');
    expect(body, 'kategori tidak tampil di baris daftar').toContain('masa kini');
    // Latarnya benar-benar dipasang di markup...
    expect(body).toContain(`src="/v1/media/${MEDIA_ID}"`);

    // ...dan alamat itu benar-benar menyajikan gambar. Tanpa pemeriksaan ini,
    // markupnya dapat menunjuk berkas yang tidak pernah dapat dimuat — cacat
    // yang hanya terlihat sebagai gambar rusak di layar admin.
    const image = await app.inject({ method: 'GET', url: `/v1/media/${MEDIA_ID}` });
    expect(image.statusCode, 'latar yang dipasang daftar tidak dapat dimuat').toBe(200);
  });

  it('tidak menawarkan pemilih di langkah 2 selama master belum punya latar', async () => {
    const cookie = await login();
    const { worldId } = await pages.drafts.createDraft();
    const body = await sweep(cookie, `/admin/worlds/${worldId}/wizard/2`);

    // Menawarkan pemilih kosong berarti admin menekan Simpan dan tidak terjadi
    // apa-apa — bentuk kegagalan senyap yang paling mudah lolos.
    expect(body).not.toContain('<select name="pick"');
    expect(body, 'halaman diam saja padahal master masih kosong').toContain(
      'Master lokasi masih kosong',
    );
    expect(body).toContain('/admin/locations');
  });

  it('menawarkan pemilih berisi lokasi yang dikelompokkan per kategori', async () => {
    const cookie = await login();
    await seedMedia(MEDIA_ID);
    await seedLocation('Aula Kerajaan', 'era dinasti');

    const { worldId } = await pages.drafts.createDraft();
    const body = await sweep(cookie, `/admin/worlds/${worldId}/wizard/2`);

    expect(body, 'pemilih latar tidak dirender').toContain('<select name="pick"');
    expect(body, 'lokasi tidak muncul sebagai pilihan').toContain('Aula Kerajaan');
    // Dikelompokkan memakai elemen bawaan HTML, jadi era-nya terbaca tanpa
    // satu baris pun JavaScript.
    expect(body, 'pilihan tidak dikelompokkan menurut kategori').toContain(
      '<optgroup label="era dinasti">',
    );
    expect(body).not.toContain('Master lokasi masih kosong');
  });
});

/* ------------------------------------------------------------------ */

describe('sakelar tema', () => {
  it('menawarkan tiga pilihan tema di halaman yang sudah masuk', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin');

    for (const mode of ['light', 'dark', 'auto']) {
      expect(body).toContain(`data-theme-set="${mode}"`);
    }
    expect(body).toContain('Terang');
    expect(body).toContain('Gelap');
    expect(body).toContain('Otomatis');
  });

  it('memasang tema tersimpan di dalam kepala halaman, bukan di akhir badan', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin');

    // Kalau skrip ini diletakkan di akhir <body>, halaman akan berkedip terang
    // lebih dahulu lalu berubah gelap pada setiap pemuatan.
    const head = body.slice(0, body.indexOf('</head>'));
    expect(head).toContain("localStorage.getItem('fayln.admin.theme')");
    expect(head).toContain('data-theme');
  });

  it('membiarkan pilihan eksplisit mengalahkan preferensi sistem', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin');

    // Blok [data-theme] harus berada SETELAH blok media; spesifisitas keduanya
    // sama, jadi urutannya yang menentukan siapa yang menang.
    const darkRule = body.indexOf(':root[data-theme=dark]{');
    const mediaRule = body.indexOf('@media (prefers-color-scheme:dark)');
    expect(mediaRule).toBeGreaterThan(-1);
    expect(darkRule).toBeGreaterThan(mediaRule);
  });

  it('tidak menawarkan sakelar tema pada halaman masuk', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/login' });
    expect(response.statusCode).toBe(200);
    // Yang diperiksa adalah TOMBOLNYA, bukan nama atributnya: skrip klien memuat
    // teks "data-theme-set" sebagai selektor, jadi mencarinya sebagai teks akan
    // selalu menemukannya di mana pun.
    expect(response.body).not.toContain('data-theme-set="');
  });
});

describe('bilah sisi ala System Settings', () => {
  it('memberi setiap menu sebuah ikon berwarna, bukan gambar dari jaringan', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin');

    const icons = body.match(/class="nav__icon"/g) ?? [];
    expect(icons.length, 'jumlah ikon tidak sama dengan jumlah menu').toBe(14);
    expect(body).toContain('--i-a:#0a84ff;--i-b:#0055c4');
    expect(body).toMatch(/nav__icon[^>]*>\s*<svg/);
    expect(body, 'ikon tidak boleh dimuat dari jaringan').not.toMatch(/<img[^>]+src="https?:/);
  });
});

describe('gaya panel', () => {
  function cssOf(body: string): string {
    const match = /<style>([\s\S]*?)<\/style>/.exec(body);
    expect(match, 'Halaman tidak memuat blok gaya.').not.toBeNull();
    return match![1];
  }

  it('mendefinisikan token warna yang dipakai halamannya', async () => {
    const cookie = await login();
    const css = cssOf(await sweep(cookie, '/admin'));

    for (const token of [
      '--window',
      '--panel',
      '--field',
      '--line',
      '--accent',
      '--danger',
      '--ok',
      '--warn',
      '--track',
      '--seg-active',
      '--radius',
      '--content',
    ]) {
      expect(css, `token ${token} tidak didefinisikan`).toContain(`${token}:`);
    }
    expect(css).toContain('@media (prefers-color-scheme:dark)');
    expect(css).toContain(':root[data-theme=dark]');
  });

  /**
   * Penjaga untuk kelas cacat yang sudah dua kali terjadi.
   *
   * Ketika `--surface` dihapus dari daftar token, `WIZARD_CSS` tetap memakainya.
   * Memakai variabel yang tidak didefinisikan TIDAK menghasilkan galat apa pun —
   * hanya latar yang tembus, dan tidak ada satu baris pun yang terlihat salah.
   * Karena itu kesamaannya diperiksa di sini, bukan diserahkan pada mata.
   *
   * Halaman wizard ikut diperiksa karena `WIZARD_CSS` hanya disisipkan di sana.
   */
  it('tidak memakai token CSS yang tidak didefinisikan', async () => {
    const cookie = await login();
    const { worldId } = await pages.drafts.createDraft();

    const halaman = ['/admin', `/admin/worlds/${worldId}/wizard/1`, `/admin/worlds/${worldId}/wizard/3`];
    const dipakai = new Set<string>();

    for (const url of halaman) {
      const css = cssOf(await sweep(cookie, url));
      const defined = new Set(Array.from(css.matchAll(/(--[a-z0-9-]+)\s*:/g), (m) => m[1]));
      for (const match of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
        const token = match[1]!;
        // Disetel inline pada setiap ikon menu, jadi memang tidak ada di sini.
        if (token === '--i-a' || token === '--i-b') {
          continue;
        }
        if (!defined.has(token)) {
          dipakai.add(`${token} (di ${url})`);
        }
      }
    }

    expect([...dipakai], 'token CSS dipakai tetapi tidak pernah didefinisikan').toEqual([]);
  });
});

describe('sheet konfirmasi', () => {
  it('membawa tiga tombol jendela yang benar-benar berfungsi', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin');

    expect(body).toContain('data-sheet-root');
    for (const action of ['close', 'min', 'zoom']) {
      expect(body).toContain(`data-sheet-action="${action}"`);
    }
    // Titik di bilah judul jendela utama tetap hiasan.
    expect(body).toContain('class="traffic" aria-hidden="true"');
  });

  it('tidak menyisipkan sheet pada halaman masuk', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/login' });
    // Sama seperti sakelar tema: yang diperiksa elemennya, bukan nama atributnya.
    expect(response.body).not.toContain('class="sheet-layer"');
  });

  /**
   * Uji paling penting di blok ini.
   *
   * Ia tidak memeriksa satu formulir yang sudah diketahui, melainkan MENYAPU
   * seluruh halaman dan menuntut setiap formulir destruktif memawa konfirmasi.
   * Formulir baru yang ditambahkan kelak tanpa `data-confirm` akan langsung
   * ketahuan — itulah bedanya dengan uji yang hanya menyebut satu alamat.
   */
  it('tidak membiarkan satu pun formulir destruktif lolos tanpa konfirmasi', async () => {
    const cookie = await login();

    // Siapkan data yang membuat formulir destruktif benar-benar muncul.
    // Tanpa ini, sebagian besar halaman hanya menampilkan tabel kosong dan
    // ujinya lulus tanpa membuktikan apa pun.
    await pages.genres.create({
      genreId: 'uji_hapus',
      labelId: 'Uji Hapus',
      labelEn: 'Delete Test',
      active: true,
    });
    await admins.createAdmin({
      username: 'operator-kedua',
      password: ADMIN_PASSWORD,
      displayName: 'Operator Kedua',
      role: 'editor',
    });
    const { worldId } = await pages.drafts.createDraft();

    // Sebagian besar aksi destruktif berada di halaman RINCIAN, bukan di daftar.
    // Alamatnya diturunkan dari daftarnya sendiri supaya tidak ada id yang
    // ditulis tetap di sini — id dunia berubah setiap kali seed berubah.
    const daftarDunia = await sweep(cookie, '/admin/worlds');
    const idDunia = /\/admin\/worlds\/([A-Za-z0-9_-]+)"/.exec(daftarDunia)?.[1];
    expect(idDunia, 'Tidak menemukan satu pun dunia untuk disapu.').toBeTruthy();

    const daftarAkun = await sweep(cookie, '/admin/accounts');
    const idAkun = /\/admin\/accounts\/([A-Za-z0-9_-]+)"/.exec(daftarAkun)?.[1];
    expect(idAkun, 'Tidak menemukan satu pun akun untuk disapu.').toBeTruthy();

    const halaman = [
      '/admin/genres',
      '/admin/admins',
      '/admin/models',
      '/admin/settings',
      '/admin/accounts',
      '/admin/locations',
      '/admin/promotions',
      '/admin/worlds',
      '/admin/characters',
      `/admin/worlds/${idDunia}`,
      `/admin/accounts/${idAkun}`,
      `/admin/worlds/${worldId}/wizard/2`,
      `/admin/worlds/${worldId}/wizard/3`,
    ];

    // Sengaja TANPA bendera global: regex dengan /g menyimpan posisi terakhir,
    // sehingga .test() yang dipanggil berulang kali akan melewatkan kecocokan.
    const destruktif = /action="\/admin\/[a-zA-Z0-9/_-]*(delete|toggle|reset|remove|revoke)[a-zA-Z0-9/_-]*"/;

    let ditemukan = 0;
    for (const url of halaman) {
      const body = await sweep(cookie, url);
      for (const tag of body.match(/<form[^>]*>/g) ?? []) {
        if (!destruktif.test(tag)) {
          continue;
        }
        ditemukan += 1;
        expect(tag, `formulir destruktif tanpa konfirmasi di ${url}: ${tag}`).toContain(
          'data-confirm=',
        );
      }
    }

    expect(
      ditemukan,
      'Tidak menemukan cukup banyak formulir destruktif — uji ini tidak membuktikan apa-apa.',
    ).toBeGreaterThanOrEqual(4);
  });

  it('menyebut sasaran tindakan di dalam pesan konfirmasi', async () => {
    const cookie = await login();
    await pages.genres.create({
      genreId: 'uji_hapus',
      labelId: 'Uji Hapus',
      labelEn: 'Delete Test',
      active: true,
    });

    const body = await sweep(cookie, '/admin/genres');
    expect(body).toMatch(/data-confirm="Hapus genre “[^”]+”\?/);
  });
});

/**
 * Cacat yang tidak melempar galat dan tidak terlihat pada tangkapan layar.
 *
 * Skrip unggahan mencari templat baris lewat `scope.querySelector`, dengan
 * `scope` adalah elemen ber-`data-*-scope`. Templat yang diletakkan sebagai
 * SAUDARA formulir tidak akan pernah ditemukan; fungsinya keluar lebih awal
 * tanpa satu pun galat, dan tombol "+ Tambah ekspresi" hanya diam ketika
 * ditekan. Halaman tetap sah, uji "tidak ada tag hidup" tetap lulus, dan
 * tangkapan layarnya tampak normal — yang hilang hanya kemampuan menambah
 * ekspresi kedua, sehingga karakter berekspresi banyak mustahil dibuat.
 */
describe('templat baris ekspresi berada di dalam formulirnya', () => {
  it('pada wizard langkah 3', async () => {
    const cookie = await login();
    const { worldId } = await pages.drafts.createDraft();
    const body = await sweep(cookie, `/admin/worlds/${worldId}/wizard/3`);

    const form = formWith(body, 'data-npc-scope');
    expect(form, 'daftar ekspresi berada di luar formulir').toContain('data-expression-list');
    expect(form, 'tombol tambah ekspresi berada di luar formulir').toContain('data-expression-add');
    expect(
      form,
      'templat ekspresi berada di luar formulir — tombol "+ Tambah ekspresi" tidak akan bekerja',
    ).toContain('data-expression-template');
  });

  it('pada halaman master karakter', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/characters-form');

    // Halaman master memakai atribut scope yang berbeda dari wizard, jadi ia
    // harus diuji sendiri — skrip unggahan menerima keduanya.
    const form = formWith(body, 'data-expression-scope');
    expect(form, 'daftar ekspresi berada di luar formulir').toContain('data-expression-list');
    expect(form, 'tombol tambah ekspresi berada di luar formulir').toContain('data-expression-add');
    expect(
      form,
      'templat ekspresi berada di luar formulir — tombol "+ Tambah ekspresi" tidak akan bekerja',
    ).toContain('data-expression-template');
  });

  it('memuat skrip unggahan di halaman master', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/characters-form');

    // Tanpa skrip ini, memilih berkas tidak mengunggah apa pun dan bidang
    // tersembunyinya tetap kosong. Halaman tetap tampak benar; yang terjadi
    // hanyalah Simpan menolak karena tidak ada gambar.
    expect(body, 'skrip unggahan tidak ikut dimuat').toContain("'/admin/media'");
    expect(body, 'kolom unggahan tidak dirender').toContain('data-upload="portrait"');
    expect(body, 'bidang tersembunyi id media tidak dirender').toContain('data-portrait-media');
  });

  /*
   * Halaman master lokasi adalah kebalikannya: bentuknya SENGAJA datar.
   *
   * Versi sebelumnya memakai baris berulang sehingga satu tempat dapat memuat
   * banyak gambar (satu per era). Itu dibuang karena yang diisi sehari-hari
   * adalah satu tempat pada satu era. Uji ini menjaga agar bentuknya tidak
   * diam-diam kembali berulang — perubahan seperti itu tidak menghasilkan galat
   * apa pun, hanya formulir yang berbeda dari yang disepakati.
   */
  it('pada halaman master lokasi justru tidak ada baris berulang', async () => {
    const cookie = await login();

    // Kategori dibuat lebih dulu: tanpa kategori, halaman formulir menampilkan
    // peringatan dan tidak merender bidang apa pun — sehingga ujinya akan lulus
    // secara palsu tanpa pernah memeriksa isinya.
    const category = await pages.locations.createCategory('masa kini');
    expect(category.ok).toBe(true);

    const body = await sweep(cookie, '/admin/locations-form');
    const form = formWith(body, 'data-background-scope');

    expect(form, 'nama lokasi tidak ada di formulir').toContain('name="name"');
    expect(form, 'pemilih kategori tidak ada di formulir').toContain('name="categoryId"');
    expect(form, 'keterangan tidak ada di formulir').toContain('name="description"');
    expect(form, 'bidang id media tidak ada di formulir').toContain('name="mediaId"');
    expect(form, 'formulir ini seharusnya tidak punya baris berulang').not.toContain(
      'data-expression-row',
    );
    expect(form, 'formulir ini seharusnya tidak punya templat baris').not.toContain(
      'data-expression-template',
    );
  });

  it('memuat skrip unggahan dan slot gambar latar di halaman master lokasi', async () => {
    const cookie = await login();
    await pages.locations.createCategory('masa kini');
    const body = await sweep(cookie, '/admin/locations-form');

    // Tanpa skrip ini, memilih berkas tidak mengunggah apa pun dan bidang
    // tersembunyinya tetap kosong. Halaman tetap tampak benar; yang terjadi
    // hanyalah Simpan menolak karena tidak ada gambar.
    expect(body, 'skrip unggahan tidak ikut dimuat').toContain("'/admin/media'");
    expect(body, 'kolom unggahan latar tidak dirender').toContain('data-upload="background"');
    expect(body, 'bidang tersembunyi id media latar tidak dirender').toContain(
      'data-background-media',
    );
    // Slot latar memakai awalan sendiri: memakai slot potret akan memperkecil
    // gambar latar ke ukuran potret, tanpa galat apa pun.
    expect(body, 'slot latar memakai awalan potret').not.toContain('data-portrait-media');
  });

  it('menghidupkan pesan "tidak ditemukan" saat id lokasi tidak ada', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/locations-form?location=loc_tidak_ada');

    expect(body).toContain('Tidak ditemukan');
    expect(body).toContain('Kembali ke daftar lokasi');
    expect(body).not.toContain('&lt;div');
  });

  it('menghidupkan pesan "tidak ditemukan" saat id karakter tidak ada', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/characters-form?character=char_tidak_ada');

    expect(body).toContain('Tidak ditemukan');
    expect(body).toContain('Kembali ke daftar karakter');
    expect(body).not.toContain('&lt;div');
  });
});

/**
 * Cacat yang pernah ada di daftar dunia, masing-masing dengan penjaganya.
 *
 * Semuanya adalah cacat yang TIDAK melempar galat dan tidak terlihat oleh uji
 * "tidak ada tag hidup": halamannya tetap sah, hanya salah. Karena itu setiap
 * penjaga di bawah menegaskan hal yang seharusnya ADA, bukan yang seharusnya
 * tidak ada.
 */
describe('daftar dunia', () => {
  function cssOf(body: string): string {
    const match = /<style>([\s\S]*?)<\/style>/.exec(body);
    expect(match, 'Halaman tidak memuat blok gaya.').not.toBeNull();
    return match![1];
  }

  /** Mengambil isi satu aturan CSS berdasarkan selektornya, di awal baris. */
  function ruleFor(css: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Jangkar awal-baris, bukan awal-string: aturannya berdiri sendiri di
    // barisnya sendiri, sedangkan varian seperti `.page-head h1{` tidak.
    const match = new RegExp(`^${escaped}\\{([^}]*)\\}`, 'm').exec(css);
    expect(match, `aturan ${selector} tidak ditemukan di lembar gaya`).not.toBeNull();
    return match![1]!;
  }

  it('menaruh h1 sebelum h2 mana pun', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/worlds');

    const h1 = body.indexOf('<h1');
    const h2 = body.indexOf('<h2');
    expect(h1, 'Halaman tidak punya h1.').toBeGreaterThan(-1);
    expect(h2, 'Halaman tidak punya h2.').toBeGreaterThan(-1);
    expect(
      h1,
      'h2 muncul sebelum h1 — urutan judul halaman terbalik.',
    ).toBeLessThan(h2);
  });

  it('tidak mencetak nilai status mentah sebagai teks', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/worlds');

    // Nilai mentahnya masih ada sebagai tooltip dan di halaman rincian, jadi
    // yang diperiksa di sini adalah bahwa ia tidak berdiri sendiri sebagai
    // isi elemen — bentuk yang dulu mencetak "terbit" di atas "published".
    for (const raw of ['published', 'draft', 'retired', 'revoked']) {
      expect(body, `status mentah "${raw}" tampil sebagai teks`).not.toContain(`>${raw}<`);
    }
    // Dan pilnya benar-benar menyebutkan terjemahannya.
    expect(body).toMatch(/class="pill [a-z]*" title="[a-z]+">[A-Za-z ]+<\/span>/);
  });

  it('tidak menampilkan id internal dunia sebagai teks', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/worlds');
    expect(body, 'id internal tampil sebagai teks di daftar').not.toMatch(/>w_[A-Za-z0-9-]+</);
  });

  it('menampilkan sebuah draf satu kali saja', async () => {
    const cookie = await login();
    const { worldId } = await pages.drafts.createDraft();

    const body = await sweep(cookie, '/admin/worlds');

    // Draf hanya boleh muncul sebagai tautan wizard. Tautan ke halaman
    // rinciannya berarti ia ikut tercetak di daftar arsip — persis duplikasi
    // yang membuat satu dunia tampak seperti dua catatan.
    expect(
      body,
      'draf ikut tampil di daftar arsip, bukan hanya di bagian draf',
    ).not.toContain(`href="/admin/worlds/${worldId}"`);
    expect(body, 'draf tidak muncul sama sekali').toContain(
      `href="/admin/worlds/${worldId}/wizard/`,
    );
  });

  it('menandai menu bilah sisi yang sedang dibuka', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/worlds');

    // Kelasnya harus benar-benar menjadi atribut, bukan teks berisi tanda kutip.
    expect(body, 'kelas "on" tidak terpasang sebagai atribut').toContain(
      '<a href="/admin/worlds" class="on">',
    );
    // Dan tepat satu menu yang bertanda aktif.
    expect(body.match(/class="on"/g)?.length ?? 0).toBe(1);
  });

  it('menyejajarkan judul dengan kartu, bukan menggesernya ke tepi', async () => {
    const cookie = await login();
    const css = cssOf(await sweep(cookie, '/admin/worlds'));

    // `main>*` memusatkan isi dengan margin otomatis. Aturan h1/h2/.sub tidak
    // boleh memakai shorthand `margin`, sebab shorthand itu menimpa sisi
    // kiri-kanannya dengan 0 dan judul lalu menempel ke tepi kiri sementara
    // kartu tetap di tengah — terukur 207px pada lebar 1908px.
    expect(css, 'main>* harus memakai margin-inline').toMatch(
      /main>\*\{[^}]*margin-inline:auto/,
    );
    for (const selector of ['h1', 'h2', '.sub']) {
      expect(
        ruleFor(css, selector),
        `aturan ${selector} memakai shorthand margin dan akan menggeser judul`,
      ).not.toMatch(/(?:^|;)\s*margin:/);
    }
  });
});

/* ------------------------------------------------------------------ */

/**
 * Sheet "Bulk with AI" di halaman lokasi.
 *
 * Markupnya dirender server-side walaupun tersembunyi, dan itu disengaja: uji
 * sapuan hanya dapat memeriksa apa yang ada di HTML. Sheet yang dibuat
 * JavaScript tidak akan tersapu uji mana pun — dan cacat senyap di dalamnya
 * (atribut ter-escape, tag yang tampil sebagai teks) baru ketahuan saat dipakai.
 */
describe('impor massal lokasi', () => {
  it('menyediakan pemicu, sheet, dan seluruh bidangnya', async () => {
    const cookie = await login();
    await pages.locations.createCategory('Era Uji');
    await pages.providers.create({
      name: 'Penyedia Visi',
      prefix: 'visi',
      apiType: 'chat-completions',
      baseUrl: 'https://visi.example.test/v1',
      apiKeyEnv: '',
      isActive: true,
      notes: '',
    });

    const body = await sweep(cookie, '/admin/locations-form');

    expect(body, 'tombol pemicu tidak ada').toContain('data-bulk-open');
    expect(body, 'sheet tidak dirender').toContain('data-bulk-root');
    expect(body, 'pemilih kategori tidak ada').toContain('data-bulk-category');
    expect(body, 'pemilih provider tidak ada').toContain('data-bulk-provider');
    expect(body, 'pemilih model tidak ada').toContain('data-bulk-model');
    expect(body, 'baris status model tidak ada').toContain('data-bulk-model-status');

    // `multiple` adalah inti fiturnya: tanpa itu hanya satu berkas yang dapat dipilih.
    expect(body, 'input berkas tidak menerima banyak berkas').toMatch(
      /<input[^>]*multiple[^>]*data-bulk-files/,
    );
    expect(body, 'daftar kemajuan tidak ada').toContain('data-bulk-list');

    // Sheet-nya digerakkan WIZARD_JS. Tanpa skrip itu ia tampak seperti tombol
    // mati — tanpa galat apa pun.
    expect(body, 'skrip sheet tidak dipanggil').toContain('bindBulkImport();');
    // Provider yang ada harus muncul sebagai pilihan, bukan daftar kosong.
    expect(body, 'provider tidak ditawarkan').toContain('Penyedia Visi');
  });

  it('memeriksa jenis hasil pengodean, bukan mempercayainya', async () => {
    /*
     * `toBlob` tidak melempar ketika peramban tidak mengenal jenis yang diminta
     * — ia diam-diam mengembalikan PNG. Diukur 6 Oktober 2026: meminta
     * image/avif menghasilkan PNG ENAM KALI lebih besar daripada WebP untuk
     * gambar yang sama.
     *
     * Jadi "pindah ke format yang lebih kecil" dapat dengan tenang menghasilkan
     * berkas yang jauh lebih besar. Yang dicari adalah PEMERIKSAANNYA, bukan
     * definisinya.
     */
    const cookie = await login();

    const body = await sweep(cookie, '/admin/locations-form');

    expect(body, 'jenis hasil pengodean tidak diperiksa').toContain('blob.type !== type');
  });

  it('memberi tahu saat belum ada provider, bukan menawarkan daftar kosong', async () => {
    const cookie = await login();
    await pages.locations.createCategory('Era Uji');

    const body = await sweep(cookie, '/admin/locations-form');

    expect(body).toContain('(belum ada provider)');
  });
});

/* ------------------------------------------------------------------ */

/**
 * Provider model.
 *
 * Pasangan "kosong" dan "berisi" dengan alasan yang sama seperti master lain,
 * ditambah dua penjaga yang khas halaman ini:
 *
 * 1. Model tidak boleh ditawarkan sebelum ada provider — menawarkan formulir
 *    yang pasti ditolak hanya membuat admin mengisi sesuatu dengan sia-sia.
 * 2. Setiap teks bantuan harus DITUNJUK `aria-describedby` oleh kontrolnya, dan
 *    setiap bidang wajib harus ber-atribut `required` SEKALIGUS menuliskan
 *    "Wajib.". Yang pertama tidak dapat diperiksa mata — bidang dengan bantuan
 *    yang tidak tertaut tetap tampak benar di layar, dan hanya pembaca layar
 *    yang kehilangan penjelasannya.
 */
describe('provider: keadaan kosong dan berisi', () => {
  async function seedProvider(name = 'OpenAI Compatible (Prod)', prefix = 'oc-prod') {
    const created = await pages.providers.create({
      name,
      prefix,
      apiType: 'chat-completions',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnv: '',
      isActive: true,
      notes: '',
    });
    if (!created.ok) {
      throw new Error(`provider uji gagal dibuat: ${created.reason}`);
    }
    return created.providerId;
  }

  it('menampilkan pesan kosong saat belum ada provider', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/providers');

    expect(body).toContain('Belum ada provider');
    expect(body).not.toContain('<table');
    expect(body).not.toContain('&lt;div');
  });

  it('menampilkan tabel sungguhan saat ada provider', async () => {
    const cookie = await login();
    await seedProvider();

    const body = await sweep(cookie, '/admin/providers');

    expect(body, 'pesan kosong masih tampil padahal ada provider').not.toContain(
      'Belum ada provider',
    );
    expect(body).toContain('<table');
    expect(body).toContain('OpenAI Compatible (Prod)');
    expect(body).toContain('oc-prod');
    expect(body).toContain('Chat Completions');
    expect(body).toContain('https://api.openai.com/v1');
  });

  it('tidak menawarkan formulir model selama belum ada provider', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/models-form');

    expect(body).toContain('Belum ada provider');
    expect(body).not.toContain('<select name="providerId"');
    expect(body).toContain('/admin/providers-form');
  });

  it('menawarkan provider di formulir model begitu ada provider aktif', async () => {
    const cookie = await login();
    await seedProvider();

    const body = await sweep(cookie, '/admin/models-form');

    // Select-nya merender id lebih dulu, jadi dicari dengan pola, bukan teks
    // persis — dan tetap menuntut elemennya select, bukan sekadar nama bidangnya.
    expect(body, 'pemilih provider tidak dirender').toMatch(/<select[^>]*name="providerId"/);
    expect(body).toContain('OpenAI Compatible (Prod)');
    expect(body).not.toContain('Belum ada provider');
  });

  it('menautkan setiap teks bantuan ke kontrolnya, dan menandai bidang wajib', async () => {
    const cookie = await login();
    await seedProvider();

    const body = await sweep(cookie, '/admin/providers-form');

    const hintIds = Array.from(body.matchAll(/class="field__hint" id="([^"]+)"/g), (m) => m[1]!);
    const described = new Set(
      Array.from(body.matchAll(/aria-describedby="([^"]+)"/g), (m) => m[1]!),
    );

    expect(hintIds.length, 'tidak ada bidang bergaya baru yang dirender').toBeGreaterThan(3);
    for (const id of hintIds) {
      expect(described.has(id), `bantuan ${id} tidak ditunjuk kontrol mana pun`).toBe(true);
    }

    /*
     * Bidang wajib ditandai DUA cara sekaligus: atribut `required` menahan
     * pengiriman, dan "Wajib." pada bantuannya terlihat admin. Menghitung
     * keduanya dan menuntut jumlahnya sama menangkap bidang yang hanya punya
     * salah satunya — bentuk kelalaian yang tidak menghasilkan galat apa pun.
     */
    const required = (body.match(/\srequired[\s>]/g) ?? []).length;
    const wajib = (body.match(/<b>Wajib\.<\/b>/g) ?? []).length;
    expect(required, 'tidak ada bidang wajib yang dirender').toBeGreaterThan(2);
    expect(wajib, 'penanda "Wajib." tidak sepadan dengan bidang ber-atribut required').toBe(
      required,
    );
  });

  /**
   * Kejelasan tiga bidang yang paling mudah disalahpahami.
   *
   * Penjaga yang paling penting di sini: jatah harian HARUS dibaca dari
   * konfigurasi. Sebelumnya halaman menulis "Free — 64.000 token/hari" secara
   * tetap, padahal yang benar-benar ditegakkan sistem adalah
   * `config.plan.free.dailyTokens` (100.000 pada konfigurasi bawaan). Halaman
   * yang menyebut jatah keliru lebih buruk daripada halaman yang diam: admin
   * mengisi biaya per giliran berdasarkan angka yang salah.
   */
  it('menyebut jatah harian yang benar-benar ditegakkan, bukan angka tetap', async () => {
    const cookie = await login();
    await seedProvider();

    const body = await sweep(cookie, '/admin/models-form');

    const jatahFree = formatNumber(testConfig().plan.free.dailyTokens);
    const jatahPaid = formatNumber(testConfig().plan.paid.dailyTokens);

    expect(body, 'jatah Free tidak muncul di pilihan tier').toContain(jatahFree);
    expect(body, 'jatah Paid tidak muncul di pilihan tier').toContain(jatahPaid);
    // Angka tetap yang dulu dipakai tidak boleh kembali.
    expect(body, 'jatah masih ditulis tetap di halaman').not.toContain('64.000 token/hari');

    // Skrip menghitung "≈ N giliran per hari" dari angka ini, jadi angkanya
    // harus ikut pada opsinya — bukan pada halamannya.
    expect(body, 'jatah tidak menempel pada opsi tier').toContain('data-daily-tokens=');
  });

  it('tidak lagi meminta perkiraan token per giliran', async () => {
    const cookie = await login();
    await seedProvider();

    const body = await sweep(cookie, '/admin/models-form');

    /*
     * Bidang itu dibuang karena ia TIDAK DIPAKAI: pemeriksaan anggaran
     * (`assertQuotaAvailable`) mengambil angkanya dari konstanta simulator, bukan
     * dari kolom ini. Halaman yang meminta angka yang tidak dipakai lebih buruk
     * daripada halaman yang tidak memintanya — ia menghabiskan perhatian dan
     * menimbulkan pertanyaan yang tidak dapat dijawab.
     */
    expect(body, 'bidang token per giliran masih diminta').not.toContain('estimatedTurnCost');
    expect(body, 'baris hitungan giliran per hari masih dirender').not.toContain('data-cost-helper');
    expect(body, 'skrip hitungan giliran masih ikut dimuat').not.toContain('bindCostHelper');
    expect(body, 'kolom token per giliran masih ada di daftar').not.toContain('Token/giliran');

    /*
     * Kata "biaya" menyiratkan UANG, dan di panel ini tidak ada uang sama sekali:
     * seluruh pemeriksaan anggaran membandingkan token dengan jatah token harian
     * pemain. Kata itu pernah membuat pemilik produk mengira ada kurs yang harus
     * diisi.
     *
     * Yang diperiksa hanya teks yang DILIHAT pengguna: skrip dan gaya dibuang
     * lebih dulu, karena di dalamnya kata itu muncul sebagai kiasan yang sah
     * ("menerima keduanya tidak berbiaya apa pun"). Memeriksa seluruh berkas akan
     * memerahkan uji karena komentar, dan uji yang memerahkan karena komentar
     * akan dimatikan orang.
     */
    const terlihat = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    expect(terlihat, 'kata "biaya" muncul lagi di teks halaman model').not.toMatch(/biaya/i);
  });

  it('menamai bidang konteks dengan istilah yang jelas', async () => {
    const cookie = await login();
    await seedProvider();

    const body = await sweep(cookie, '/admin/models-form');

    /*
     * Bidangnya bernama "Context window" — istilah yang dipakai dokumentasi
     * penyedia, dan yang dicari orang. "Max token" sengaja TIDAK dipakai: dalam
     * percakapan sehari-hari istilah itu berarti batas token KELUARAN, padahal
     * yang dimaksud di sini masukan DAN keluaran sekaligus.
     */
    expect(body, 'bidang konteks tidak memakai istilah context window').toMatch(
      /Context window \(token\)/,
    );
    expect(body, 'istilah "max token" yang menyesatkan muncul kembali').not.toContain('max token');
  });

  it('menawarkan bentuk lampiran gambar di formulir provider', async () => {
    /*
     * Bedanya hanya satu tingkat pembungkusan, tetapi salah pilih tidak
     * menghasilkan galat apa pun — modelnya hanya menjawab bahwa ia tidak
     * menerima gambar. Karena itu pilihannya harus terlihat dan dapat diubah.
     */
    const cookie = await login();
    await seedProvider();

    const body = await sweep(cookie, '/admin/providers-form');

    expect(body, 'bidang bentuk lampiran gambar tidak ada').toMatch(/name="imagePart"/);
    // Kedua nilai harus ditawarkan, dan disebutkan penyedianya — admin tidak
    // dapat menebak mana yang dipakai penyedianya.
    expect(body, 'pilihan bentuk objek tidak ada').toContain('OpenAI');
    expect(body, 'pilihan bentuk teks tidak ada').toContain('Mistral');
    // Salah pilih tidak menghasilkan galat, jadi peringatannya harus tertulis.
    expect(body, 'akibat salah pilih tidak dijelaskan').toMatch(/tidak menerima gambar apa pun/i);
  });

  it('menampilkan latar POTRET tanpa memotongnya', async () => {
    /*
     * Latar dapat potret maupun lanskap — dokumen desain menyebut sisi panjang
     * 1600 untuk lanskap dan 1200 untuk potret, dan aplikasinya sendiri
     * berorientasi potret. Jadi kotak 16:9 yang dipatok BUKAN bentuk latarnya.
     *
     * Kejadian 6 Oktober 2026: 22 latar potret tampil sebagai deretan jalur
     * lanskap yang nyaris identik, karena `cover` memotongnya sampai tinggal
     * seperenam bagian tengahnya.
     */
    const cookie = await login();

    const body = await sweep(cookie, '/admin/locations');

    expect(body, 'thumbnail latar memotong gambarnya').toMatch(
      /\.list__thumb--wide\{[^}]*object-fit:contain/,
    );
    expect(body, 'thumbnail latar masih dipatok nisbah lanskap').not.toMatch(
      /\.list__thumb--wide\{[^}]*height:36px/,
    );
  });

  it('menampilkan pratinjau latar di formulir tanpa memotongnya', async () => {
    const cookie = await login();
    await pages.locations.createCategory('Era Uji');

    const body = await sweep(cookie, '/admin/locations-form');

    // Kotak yang dipatok lanskap akan memotong latar potret; tingginya dipatok
    // dan lebarnya mengikuti bentuk gambarnya.
    expect(body, 'pratinjau latar memaksa kotak lanskap').not.toContain(
      'style="width:128px;height:72px"',
    );
    expect(body, 'pratinjau latar tidak mengikuti bentuk gambarnya').toContain(
      'style="height:96px;width:auto',
    );
  });

  it('menghidupkan pesan "tidak ditemukan" saat id provider tidak ada', async () => {
    const cookie = await login();
    const body = await sweep(cookie, '/admin/providers-form?provider=prov_tidak_ada');

    expect(body).toContain('Tidak ditemukan');
    expect(body).toContain('Kembali ke daftar provider');
    expect(body).not.toContain('&lt;div');
  });

  /**
   * Saran nama model di formulir model.
   *
   * Bidangnya tetap isian bebas — daftar tertutup akan menghalangi nama model
   * yang belum muncul di `/models` provider, dan penyedia menambah model lebih
   * cepat daripada halaman ini dimuat ulang. Karena itu daftarnya digambar
   * sendiri (combobox), bukan `<datalist>` atau `<select>`: keduanya dirender
   * peramban, dan daftar bawaannya tidak dapat digayakan sama sekali.
   */
  it('menyediakan saran nama model tanpa mengunci isiannya', async () => {
    const cookie = await login();
    await seedProvider();

    const body = await sweep(cookie, '/admin/models-form');

    // Isiannya harus tetap <input>, bukan <select>.
    expect(body).toMatch(/<input[^>]*name="modelKey"/);

    // Peran combobox mengaitkan isian dengan daftar yang muncul di bawahnya.
    expect(body, 'isian tidak mengumumkan dirinya sebagai combobox').toMatch(
      /role="combobox"/,
    );
    expect(body, 'daftar saran tidak dikaitkan ke isiannya').toContain('aria-controls="m-key-menu"');
    // Tanpa ini peramban menampilkan daftar riwayatnya sendiri di atas daftar
    // kita, dan keduanya berebut tempat yang sama.
    expect(body, 'autocomplete tidak dimatikan').toMatch(/autocomplete="off"/);

    expect(body, 'daftar saran tidak dirender').toContain('data-model-key-menu');
    expect(body, 'baris status tidak dirender').toContain('data-model-key-status');

    // Daftar yang tidak berada di dalam pembungkusnya akan menempel ke halaman,
    // bukan ke isiannya — dan itu hanya terlihat saat dipakai, bukan di markup.
    const combo = body.match(/<div class="combo">([\s\S]*?)<\/div>/);
    expect(combo, 'pembungkus .combo tidak ada').not.toBeNull();
    expect(combo![1], 'daftar saran berada di luar pembungkusnya').toContain('data-model-key-menu');

    // Daftarnya diisi oleh WIZARD_JS. Tanpa skrip itu ia tetap kosong dan
    // bidangnya tampak seperti isian biasa — tanpa galat apa pun.
    expect(body, 'skrip pengambil daftar model tidak ikut dimuat').toContain(
      "'/admin/providers/'",
    );
  });

  /**
   * Kunci tersimpan tidak boleh kembali ke HTML — dalam bentuk apa pun.
   *
   * Dua kebocoran yang mungkin, dan keduanya tampak wajar kalau tidak dijaga:
   * mengisi kembali nilai aslinya ke input (supaya admin "tidak perlu
   * mengetik ulang"), atau menaruh teks tersandinya di atribut untuk keperluan
   * pengembangan. Yang pertama membocorkan rahasia ke halaman, yang kedua
   * membocorkannya ke siapa pun yang dapat membuka halaman itu dan memegang
   * kunci enkripsinya.
   */
  it('tidak pernah mengembalikan kunci tersimpan ke halaman', async () => {
    const cookie = await login();
    const semula = process.env[SECRETS_KEY_ENV];
    process.env[SECRETS_KEY_ENV] = Buffer.from('0123456789abcdef0123456789abcdef').toString(
      'base64',
    );

    try {
      const KUNCI = 'sk-RAHASIA-yang-tidak-boleh-tampil';
      const created = await pages.providers.create({
        name: 'Dengan Kunci',
        prefix: 'kunci',
        apiType: 'chat-completions',
        baseUrl: 'https://kunci.example.test/v1',
        apiKeyEnv: '',
        apiKey: KUNCI,
        isActive: true,
        notes: '',
      });
      expect(created.ok, 'provider uji gagal dibuat').toBe(true);

      const { rows } = await ctx.db.query<{ api_key_enc: string }>(
        'SELECT api_key_enc FROM providers',
      );
      const tersandi = rows[0]?.api_key_enc ?? '';
      expect(tersandi, 'kuncinya tidak tersimpan').not.toBe('');

      const form = await sweep(
        cookie,
        `/admin/providers-form?provider=${(created as { providerId: string }).providerId}`,
      );
      const list = await sweep(cookie, '/admin/providers');

      for (const [nama, body] of [
        ['formulir', form],
        ['daftar', list],
      ] as [string, string][]) {
        expect(body, `nilai asli kunci tampil di ${nama}`).not.toContain(KUNCI);
        expect(body, `teks tersandi tampil di ${nama}`).not.toContain(tersandi);
      }

      // Bidangnya tetap ada — tetapi kosong dan bertipe password, jadi tidak ada
      // yang dapat membacanya dari layar.
      expect(form, 'bidang kunci tidak dirender').toMatch(/type="password"/);
      expect(form, 'halaman menyatakan kuncinya tersimpan').toContain('Kunci tersimpan');
    } finally {
      if (semula === undefined) {
        delete process.env[SECRETS_KEY_ENV];
      } else {
        process.env[SECRETS_KEY_ENV] = semula;
      }
    }
  });
});
