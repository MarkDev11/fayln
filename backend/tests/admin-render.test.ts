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
    expect(icons.length, 'jumlah ikon tidak sama dengan jumlah menu').toBe(12);
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
