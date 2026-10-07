/**
 * Route panel admin.
 *
 * Seluruh berkas ini dilindungi hook di `session.ts` kecuali halaman masuk.
 * Perlindungan sengaja TIDAK diulang di setiap handler: satu handler yang lupa
 * memeriksa sudah cukup untuk membuka seluruh panel.
 *
 * Bentuk alurnya sengaja "POST lalu alihkan" (bukan membalas HTML langsung),
 * supaya menyegarkan halaman setelah menyimpan tidak mengirim ulang perubahan.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AdminRepository } from './adminRepository';
import type { AdminPageContext } from './pages/context';
import { accountDetail, accountsList } from './pages/accountPages';
import { adminsList, type AdminViewer } from './pages/adminPages';
import { assetsList } from './pages/assetPages';
import { charactersForm, charactersList } from './pages/characterPages';
import { worldsForm, worldsList } from './pages/catalogPages';
import { auditList, dashboard, settingsList } from './pages/dashboardPages';
import {
  locationCategoriesList,
  locationsForm,
  locationsList,
} from './pages/locationPages';
import { genresList } from './pages/genrePages';
import { wizardStep1, wizardStep2, wizardStep3 } from './pages/wizardPages';
import { WIZARD_CSS, WIZARD_JS } from './wizardClient';
import { modelForm, modelsList, providerForm, providersList } from './pages/modelPages';
import { promotionForm, promotionsList } from './pages/promotionPages';
import type { SafeHtml } from './html';
import { ACCEPTED_IMAGE_TYPES, inspectImage } from '../media/imageFile';
import { isMediaId, type MediaRepository } from '../repositories/mediaRepository';
import { BASE_EXPRESSION, isRelationStatus } from './worldDraftRepository';
import type { CharacterFailure } from './charactersRepository';
import type { CategoryFailure, LocationFailure } from './locationsRepository';
import type { ModelFailure } from './modelsRepository';
import { fetchProviderModels } from './providerModels';
import { describeCharacterPortrait, describeLocationImage } from './visionClient';
import type { ProviderFailure } from './providersRepository';
import { html, inputValue, layout } from './html';
import { validatePassword, verifyPassword } from './password';
import {
  clearSessionCookie,
  isLoginBlocked,
  loginBlockedForSec,
  readSessionToken,
  recordLoginFailure,
  setSessionCookie,
} from './session';

export type AdminRouteDeps = {
  /** Repository akun admin, untuk masuk/keluar dan audit. */
  admins: AdminRepository;
  /** Konteks yang diteruskan ke setiap halaman. */
  pages: AdminPageContext;
  /** Penyimpanan berkas gambar unggahan. */
  media: MediaRepository;
  isProduction: boolean;
  /** Nama pengguna yang boleh masuk. Dipakai untuk membuat admin pertama. */
  bootstrapUsername?: string;
};

/** Halaman yang disediakan modul lain, dipetakan ke fungsi render. */
type AdminPages = {
  dashboard: (ctx: AdminPageContext) => Promise<SafeHtml>;
  worldsList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  worldsForm: (ctx: AdminPageContext, worldId: string | null) => Promise<SafeHtml>;
  charactersList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  charactersForm: (ctx: AdminPageContext, characterId: string | null) => Promise<SafeHtml>;
  accountsList: (ctx: AdminPageContext, query: { search: string }) => Promise<SafeHtml>;
  accountDetail: (ctx: AdminPageContext, accountId: string) => Promise<SafeHtml>;
  modelsList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  modelForm: (ctx: AdminPageContext, modelId: string | null) => Promise<SafeHtml>;
  providersList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  providerForm: (ctx: AdminPageContext, providerId: string | null) => Promise<SafeHtml>;
  promotionsList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  promotionForm: (ctx: AdminPageContext, promotionId: string | null) => Promise<SafeHtml>;
  settingsList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  adminsList: (ctx: AdminPageContext, viewer: AdminViewer) => Promise<SafeHtml>;
  auditList: (
    ctx: AdminPageContext,
    filter: { username: string; action: string },
  ) => Promise<SafeHtml>;
  locationsList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  locationsForm: (ctx: AdminPageContext, locationId: string | null) => Promise<SafeHtml>;
  locationCategoriesList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  genresList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  assetsList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  wizardStep1: (ctx: AdminPageContext, worldId: string | null) => Promise<SafeHtml>;
  wizardStep2: (ctx: AdminPageContext, worldId: string) => Promise<SafeHtml>;
  wizardStep3: (ctx: AdminPageContext, worldId: string) => Promise<SafeHtml>;
};

const DEFAULT_PAGES: AdminPages = {
  dashboard,
  worldsList,
  worldsForm,
  charactersList,
  charactersForm,
  accountsList,
  accountDetail,
  modelsList,
  modelForm,
  providersList,
  providerForm,
  promotionsList,
  promotionForm,
  settingsList,
  adminsList,
  auditList,
  locationsList,
  locationsForm,
  locationCategoriesList,
  genresList,
  assetsList,
  wizardStep1,
  wizardStep2,
  wizardStep3,
};

/* ------------------------------------------------------------------ */
/* Skema masukan                                                       */
/* ------------------------------------------------------------------ */

const loginBody = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

/**
 * Batas ukuran satu berkas unggahan: 1 MiB.
 *
 * Nilai ini muncul di tiga tempat yang harus sepakat — batas badan route,
 * pemeriksaan di sini, dan `media_blobs_size_check` di basis data. Klien sudah
 * memperkecil gambar sebelum mengirim, jadi batas ini bukan batas yang wajar
 * untuk sebuah gambar melainkan jaring terakhir terhadap klien yang tidak
 * mengikuti aturan.
 */
const MAX_UPLOAD_BYTES = 1024 * 1024;

/**
 * Isian langkah 1 wizard.
 *
 * Judul, sinopsis, dan premis sengaja TIDAK wajib di sini. "Simpan & keluar"
 * harus dapat ditekan bahkan pada formulir yang masih kosong — kalau tidak,
 * permintaan pemilik proyek bahwa "draf dapat dilanjutkan sewaktu-waktu" tidak
 * terpenuhi untuk draf yang paling awal. Kelengkapan diperiksa di route, dan
 * hanya ketika tombolnya "Lanjut".
 */
const wizardIdentityBody = z.object({
  worldId: z.string().optional().default(''),
  title: z.string().trim().max(120).optional().default(''),
  synopsis: z.string().trim().max(240).optional().default(''),
  premise: z.string().trim().max(2000).optional().default(''),
  coverMediaId: z.string().optional().default(''),
  contentRating: z.enum(['all', '13_plus', '18_plus']).optional().default('all'),
  genres: z.union([z.string(), z.array(z.string())]).optional(),
  locales: z.union([z.string(), z.array(z.string())]).optional(),
  intent: z.enum(['next', 'draft']),
});

/** Isian satu NPC beserta ekspresinya. Nama berulang menjadi larik. */
const wizardNpcBody = z.object({
  worldId: z.string().trim().min(1),
  npcId: z.string().optional().default(''),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120).optional().default(''),
  traits: z.string().optional().default(''),
  initialRelation: z.string().optional().default('normal'),
  publicBackstory: z.string().max(2000).optional().default(''),
  baseMediaId: z.string().optional().default(''),
  expression: z.union([z.string(), z.array(z.string())]).optional(),
  expressionUsage: z.union([z.string(), z.array(z.string())]).optional(),
  expressionMedia: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * Empat status dunia diterima di sini karena skema mengizinkan keempatnya.
 *
 * Dulu hanya `draft` dan `published` yang diterima, padahal halaman dunia
 * menyuruh admin memakai `retired` untuk menarik dunia yang dipakai perjalanan
 * pemain. Permintaan itu berakhir sebagai penolakan tanpa pesan — cacat yang
 * tidak pernah muncul sebagai galat, hanya sebagai perubahan yang tidak terjadi.
 */
const worldBody = z.object({
  worldId: z.string().optional().default(''),
  title: z.string().trim().min(1).max(120),
  synopsis: z.string().trim().min(1).max(240),
  premise: z.string().trim().min(1).max(2000),
  coverAssetId: z.string().trim().min(1).max(120),
  status: z.enum(['draft', 'published', 'retired', 'revoked']),
  contentRating: z.enum(['all', '13_plus', '18_plus']),
  genres: z.union([z.string(), z.array(z.string())]).optional(),
  locales: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * Isian master karakter.
 *
 * Nama dan gambar ekspresi dikirim sebagai LARIK sejajar: `expression[0]`,
 * `expressionMedia[0]`, dan `expressionUsage[0]` adalah satu baris yang sama.
 * Itu cara HTML mengirim beberapa nilai dari satu formulir, dan cara yang sama
 * dipakai unggahan latar belakang pada wizard.
 *
 * `name` sengaja TIDAK wajib di sini. Nama kosong ditolak oleh repositori, yang
 * dapat mengembalikan sebab yang tepat (`invalid-name`) — sesuatu yang tidak
 * dapat dilakukan skema Zod tanpa mengubah pesannya menjadi "isian tidak
 * sesuai" yang tidak menjelaskan apa pun.
 */
const characterBody = z.object({
  characterId: z.string().optional().default(''),
  name: z.string().max(200).optional().default(''),
  expression: z.union([z.string(), z.array(z.string())]).optional(),
  expressionMedia: z.union([z.string(), z.array(z.string())]).optional(),
  expressionUsage: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * Isian master lokasi.
 *
 * Datar: satu lokasi adalah satu nama, satu kategori, satu keterangan, dan satu
 * gambar. Tidak ada bidang berulang, jadi tidak ada larik paralel yang harus
 * dipasangkan berdasarkan indeks.
 */
const locationMasterBody = z.object({
  locationId: z.string().optional().default(''),
  name: z.string().max(200).optional().default(''),
  categoryId: z.string().optional().default(''),
  description: z.string().max(300).optional().default(''),
  mediaId: z.string().optional().default(''),
});

/**
 * Isian genre.
 *
 * `genreId` diperiksa panjangnya di sini, tetapi BENTUKNYA (huruf kecil,
 * diawali huruf) diperiksa di repositori. Sebabnya: repositori dapat
 * mengembalikan alasan yang dapat dibaca admin — "id harus diawali huruf" —
 * sedangkan penolakan Zod berakhir sebagai `notice=invalid-input` yang tidak
 * menyebutkan apa pun tentang id.
 */
const genreBody = z.object({
  genreId: z.string().trim().min(2).max(32),
  labelId: z.string().trim().max(60).optional().default(''),
  labelEn: z.string().trim().max(60).optional().default(''),
  active: z.enum(['true', 'false']).optional().default('true'),
});

const modelBody = z.object({
  modelId: z.string().optional().default(''),
  label: z.string().trim().min(1).max(120),
  // Provider dan nama model diperiksa di repositori, bukan di sini: repositori
  // dapat menyebutkan APA yang salah ("provider itu sudah dihapus"), sedangkan
  // penolakan Zod berakhir sebagai `notice=invalid-input` yang tidak menjelaskan
  // apa pun. Bentuknya tetap dijaga di sini sebagai lapis pertama.
  providerId: z.string().optional().default(''),
  modelKey: z.string().optional().default(''),
  contextTokens: z.coerce.number().int().positive(),
  position: z.coerce.number().int().min(0),
  tier: z.enum(['free', 'paid']),
  notes: z.string().trim().max(240).optional().default(''),
  isActive: z.union([z.literal('on'), z.literal('true'), z.undefined()]).optional(),
});

/**
 * Isian provider.
 *
 * Semuanya opsional di sini dengan alasan yang sama seperti model: penolakan
 * yang menjelaskan sebabnya datang dari repositori.
 */
const providerBody = z.object({
  providerId: z.string().optional().default(''),
  name: z.string().max(200).optional().default(''),
  prefix: z.string().max(60).optional().default(''),
  apiType: z.string().max(40).optional().default(''),
  baseUrl: z.string().max(300).optional().default(''),
  /*
   * Kunci API dikirim sekali dan langsung dienkripsi. Batasnya longgar karena
   * panjang kunci berbeda-beda per penyedia; yang memeriksa kebenarannya
   * bukan panel, melainkan panggilan pertamanya nanti.
   */
  apiKey: z.string().max(2000).optional().default(''),
  imagePart: z.string().max(20).optional().default('object'),
  apiKeyEnv: z.string().max(120).optional().default(''),
  notes: z.string().max(300).optional().default(''),
  isActive: z.union([z.literal('on'), z.literal('true'), z.undefined()]).optional(),
});

const promotionBody = z.object({
  promotionId: z.string().optional().default(''),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Kode hanya boleh huruf, angka, garis bawah, dan tanda hubung.'),
  label: z.string().trim().max(120).optional().default(''),
  bonusTokens: z.coerce.number().int().positive(),
  maxRedemptions: z.coerce.number().int().min(0),
  tierRequirement: z.enum(['any', 'free', 'paid']),
  startsAt: z.string().optional().default(''),
  endsAt: z.string().optional().default(''),
  notes: z.string().trim().max(240).optional().default(''),
  oncePerAccount: z.string().optional(),
  isActive: z.string().optional(),
});

const settingBody = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().max(2000),
  description: z.string().trim().max(240).optional().default(''),
});

/**
 * Kunci pengaturan wajib berbentuk `bagian.nama` dengan huruf kecil.
 *
 * Ditegakkan di sini, bukan di CHECK constraint, karena mesin database in-memory
 * yang dipakai pengujian tidak mendukung operator regex `~`.
 */
const SETTING_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/* ------------------------------------------------------------------ */

export function registerAdminRoutes(app: FastifyInstance, deps: AdminRouteDeps): void {
  const { admins, media, isProduction } = deps;
  const pages: AdminPages = DEFAULT_PAGES;
  const ctx = deps.pages;

  /*
   * Badan permintaan berupa gambar mentah.
   *
   * Bawaannya Fastify hanya mengurai JSON dan teks, dan batas badan global
   * aplikasi ini hanya 64 KB — jauh di bawah satu gambar. Karena itu jenis isi
   * gambar didaftarkan di sini dengan `parseAs: 'buffer'`, dan route unggahnya
   * memasang batas badan sendiri. Tanpa keduanya, unggahan ditolak sebelum
   * sempat mencapai handler, dengan galat yang membingungkan.
   */
  app.addContentTypeParser(
    [...ACCEPTED_IMAGE_TYPES],
    { parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  /* ---------------------------------------------------------------- */
  /* Masuk dan keluar                                                  */
  /* ---------------------------------------------------------------- */

  app.get('/admin/login', async (request, reply) => {
    const token = readSessionToken(request);
    if (token) {
      const session = await admins.findSession(token);
      if (session) {
        return reply.redirect('/admin', 302);
      }
    }
    return reply.type('text/html; charset=utf-8').send(renderLogin(request, null));
  });

  app.post('/admin/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .type('text/html; charset=utf-8')
        .send(renderLogin(request, 'Data masuk tidak lengkap.'));
    }

    const { username, password, next } = parsed.data;
    // Kunci pembatas: nama pengguna + alamat IP, supaya menebak satu nama
    // pengguna dari satu alamat tidak dapat mencoba ribuan kali.
    const key = `${username.toLowerCase()}|${request.ip}`;

    if (isLoginBlocked(key)) {
      const waitSec = loginBlockedForSec(key);
      await admins.recordAudit({
        adminId: null,
        username,
        action: 'login.blocked',
        ipAddress: request.ip,
      });
      return reply
        .status(429)
        .type('text/html; charset=utf-8')
        .send(renderLogin(request, `Terlalu banyak percobaan. Coba lagi dalam ${waitSec} detik.`));
    }

    const admin = await admins.findAdminByUsername(username);
    // Verifikasi tetap dijalankan meski admin tidak ada, supaya waktu balasan
    // tidak membedakan "nama pengguna salah" dari "kata sandi salah".
    const stored = admin?.passwordHash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
    const passwordOk = await verifyPassword(password, stored);

    if (!admin || !passwordOk || !admin.isActive) {
      recordLoginFailure(key);
      await admins.recordAudit({
        adminId: admin?.adminId ?? null,
        username,
        action: 'login.failed',
        ipAddress: request.ip,
      });
      return reply
        .status(401)
        .type('text/html; charset=utf-8')
        .send(renderLogin(request, 'Nama pengguna atau kata sandi salah.'));
    }

    const { token, expiresAt } = await admins.createSession({
      adminId: admin.adminId,
      userAgent: request.headers['user-agent'] ?? '',
      ipAddress: request.ip,
    });
    setSessionCookie(reply, token, expiresAt, isProduction);

    await admins.recordAudit({
      adminId: admin.adminId,
      username: admin.username,
      action: 'login.ok',
      ipAddress: request.ip,
    });

    // Hanya alamat internal yang boleh jadi tujuan, supaya tidak ada open redirect.
    const target = next && next.startsWith('/admin') ? next : '/admin';
    return reply.redirect(target, 302);
  });

  app.post('/admin/logout', async (request, reply) => {
    const token = readSessionToken(request);
    if (token) {
      const session = await admins.findSession(token);
      await admins.deleteSession(token);
      if (session) {
        await admins.recordAudit({
          adminId: session.adminId,
          username: session.username,
          action: 'logout',
          ipAddress: request.ip,
        });
      }
    }
    clearSessionCookie(reply, isProduction);
    return reply.redirect('/admin/login', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Ganti kata sandi sendiri                                          */
  /* ---------------------------------------------------------------- */

  app.post('/admin/password', async (request, reply) => {
    const session = request.adminSession;
    if (!session) {
      return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Belum masuk.' });
    }

    const parsed = passwordBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/settings?notice=password-invalid', 302);
    }

    const problem = validatePassword(parsed.data.newPassword);
    if (problem) {
      return reply.redirect('/admin/settings?notice=password-weak', 302);
    }

    const ok = await admins.changePassword(
      session.adminId,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    if (!ok) {
      return reply.redirect('/admin/settings?notice=password-wrong', 302);
    }

    await admins.recordAudit({
      adminId: session.adminId,
      username: session.username,
      action: 'password.changed',
      ipAddress: request.ip,
    });

    // Kata sandi berganti berarti semua sesi dicabut — termasuk yang ini.
    clearSessionCookie(reply, isProduction);
    return reply.redirect('/admin/login?changed=1', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Halaman                                                           */
  /* ---------------------------------------------------------------- */

  app.get('/admin', async (request, reply) => {
    return send(reply, request, 'Ringkasan', await pages.dashboard(ctx), 'dashboard');
  });

  app.get('/admin/worlds', async (request, reply) => {
    /*
     * Bagian draf TIDAK lagi ditempelkan dari sini.
     *
     * Dulu rute ini menyusun `draftResumePanel(drafts)` di DEPAN
     * `worldsList(ctx)`, dan karena panel draf memulai dengan `<h2>` sementara
     * daftar dunia memulai dengan `<h1>`, urutan judul halamannya terbalik —
     * pembaca layar mengumumkan bagian draf sebagai tingkat teratas, dan judul
     * besar "Dunia" muncul di tengah halaman. Sekarang halaman itu menyusun
     * dirinya sendiri, sehingga urutannya tidak dapat lagi terbalik dari luar.
     */
    return send(reply, request, 'Dunia', await pages.worldsList(ctx), 'worlds');
  });

  app.get<{ Params: { worldId: string } }>('/admin/worlds/:worldId', async (request, reply) =>
    send(reply, request, 'Ubah dunia', await pages.worldsForm(ctx, request.params.worldId), 'worlds'),
  );

  // `GET /admin/worlds-new` sengaja TIDAK di sini: alamat itu kini dialihkan ke
  // wizard dan didaftarkan bersama rute wizard di bawah, supaya hanya ada satu
  // pemilik alamat. Mendaftarkannya dua kali membuat Fastify menolak seluruh
  // aplikasi saat dibangun.

  /*
   * Halaman master karakter dikirim lewat `sendWizard`, bukan `send`.
   *
   * Bukan karena ia bagian dari wizard, melainkan karena keduanya membutuhkan
   * hal yang sama: potongan gaya dan skrip unggahan. Skrip itulah yang
   * memperkecil gambar di peramban, mengunggahnya satu per satu, dan mengisi
   * bidang tersembunyi yang dibaca server.
   */
  app.get('/admin/characters', async (request, reply) =>
    sendWizard(reply, request, 'Karakter', await pages.charactersList(ctx), 'characters'),
  );

  app.get<{ Querystring: { character?: string } }>(
    '/admin/characters-form',
    async (request, reply) =>
      sendWizard(
        reply,
        request,
        'Karakter',
        await pages.charactersForm(ctx, request.query.character ?? null),
        'characters',
      ),
  );

  app.get<{ Querystring: { search?: string } }>('/admin/accounts', async (request, reply) =>
    send(
      reply,
      request,
      'Akun',
      await pages.accountsList(ctx, { search: request.query.search ?? '' }),
      'accounts',
    ),
  );

  app.get<{ Params: { accountId: string } }>('/admin/accounts/:accountId', async (request, reply) =>
    send(reply, request, 'Detail akun', await pages.accountDetail(ctx, request.params.accountId), 'accounts'),
  );

  app.get('/admin/locations', async (request, reply) =>
    send(reply, request, 'Lokasi', await pages.locationsList(ctx), 'locations'),
  );

  /*
   * Formulir master memakai `sendWizard`, bukan `send`: baris latar yang dapat
   * ditambah dan dihapus membutuhkan WIZARD_CSS dan WIZARD_JS — mekanisme yang
   * sama dipakai baris ekspresi karakter dan langkah 3 wizard.
   */
  app.get<{ Querystring: { location?: string } }>('/admin/locations-form', async (request, reply) =>
    sendWizard(
      reply,
      request,
      'Lokasi',
      await pages.locationsForm(ctx, request.query.location ?? null),
      'locations',
    ),
  );

  app.get('/admin/location-categories', async (request, reply) =>
    send(
      reply,
      request,
      'Kategori lokasi',
      await pages.locationCategoriesList(ctx),
      'locationCategories',
    ),
  );

  app.get('/admin/genres', async (request, reply) =>
    send(reply, request, 'Genre', await pages.genresList(ctx), 'genres'),
  );

  app.get('/admin/assets', async (request, reply) =>
    send(reply, request, 'Aset', await pages.assetsList(ctx), 'assets'),
  );

  app.get('/admin/models', async (request, reply) =>
    send(reply, request, 'Model', await pages.modelsList(ctx), 'models'),
  );

  /*
   * Formulir model memakai sendWizard, bukan send.
   *
   * Yang dibutuhkan adalah WIZARD_JS: ia yang mengisi daftar saran nama model
   * dari provider yang dipilih. Tanpa itu, <datalist>-nya tetap kosong dan
   * bidangnya tampak seperti isian biasa — tanpa galat apa pun.
   */
  app.get<{ Querystring: { model?: string } }>('/admin/models-form', async (request, reply) =>
    sendWizard(reply, request, 'Model', await pages.modelForm(ctx, request.query.model ?? null), 'models'),
  );

  app.get('/admin/providers', async (request, reply) =>
    send(reply, request, 'Provider', await pages.providersList(ctx), 'providers'),
  );

  /*
   * Formulir provider memakai sendWizard, bukan send.
   *
   * Bukan karena ia punya baris berulang — ia tidak punya. Yang dibutuhkan
   * adalah WIZARD_JS, yang memasang perilaku umum panel: penjaga perubahan
   * belum tersimpan dan penyetel tinggi textarea. Tanpa itu, meninggalkan
   * formulir yang setengah diisi tidak memperingatkan apa pun.
   */
  app.get<{ Querystring: { provider?: string } }>('/admin/providers-form', async (request, reply) =>
    sendWizard(
      reply,
      request,
      'Provider',
      await pages.providerForm(ctx, request.query.provider ?? null),
      'providers',
    ),
  );

  app.get('/admin/promotions', async (request, reply) =>
    send(reply, request, 'Promosi', await pages.promotionsList(ctx), 'promotions'),
  );

  app.get<{ Params: { promotionId: string } }>(
    '/admin/promotions/:promotionId',
    async (request, reply) =>
      send(
        reply,
        request,
        'Ubah promosi',
        await pages.promotionForm(ctx, request.params.promotionId),
        'promotions',
      ),
  );

  app.get('/admin/promotions-new', async (request, reply) =>
    send(reply, request, 'Promosi baru', await pages.promotionForm(ctx, null), 'promotions'),
  );

  app.get('/admin/settings', async (request, reply) =>
    send(reply, request, 'Pengaturan', await pages.settingsList(ctx), 'settings'),
  );

  app.get('/admin/admins', async (request, reply) =>
    send(reply, request, 'Akun admin', await pages.adminsList(ctx, viewerOf(request)), 'admins'),
  );

  app.get<{ Querystring: { username?: string; action?: string } }>(
    '/admin/audit',
    async (request, reply) =>
      send(
        reply,
        request,
        'Audit',
        await pages.auditList(ctx, {
          username: request.query.username ?? '',
          action: request.query.action ?? '',
        }),
        'audit',
      ),
  );

  /* ---------------------------------------------------------------- */
  /* Perubahan: dunia                                                  */
  /* ---------------------------------------------------------------- */

  app.post('/admin/worlds', async (request, reply) => {
    const session = request.adminSession;
    const parsed = worldBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/worlds-wizard?notice=invalid-input', 302);
    }

    // Genre diperiksa terhadap TABEL, bukan terhadap konstanta di kode. Dulu
    // daftarnya tetap, dan genre yang baru dibuat admin dibuang diam-diam di
    // sini — dunia tersimpan tanpa genre, tanpa satu pun pesan galat.
    const genres = await ctx.genres.existingIds(toArray(parsed.data.genres));
    const locales = toArray(parsed.data.locales).filter(isLocale);
    if (genres.length === 0 || locales.length === 0) {
      return reply.redirect('/admin/worlds-wizard?notice=invalid-input', 302);
    }

    const result = await ctx.catalog.saveWorld({
      worldId: parsed.data.worldId || null,
      title: parsed.data.title,
      synopsis: parsed.data.synopsis,
      premise: parsed.data.premise,
      coverAssetId: parsed.data.coverAssetId,
      contentRating: parsed.data.contentRating,
      status: parsed.data.status,
      genres,
      locales,
    });

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: result.isNewVersion ? 'world.version.create' : 'world.create',
      targetKind: 'world',
      targetId: result.worldId,
      detail: { worldVersion: result.worldVersion, title: parsed.data.title },
      ipAddress: request.ip,
    });

    return reply.redirect(`/admin/worlds/${result.worldId}?notice=saved`, 302);
  });

  app.post('/admin/worlds/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ worldId: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/worlds?notice=invalid-input', 302);
    }

    const result = await ctx.catalog.deleteWorld(body.data.worldId);
    if (!result.ok) {
      return reply.redirect(`/admin/worlds/${body.data.worldId}?notice=conflict`, 302);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'world.delete',
      targetKind: 'world',
      targetId: body.data.worldId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/worlds?notice=deleted', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: karakter                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Menyimpan master karakter: nama, lalu seluruh baris ekspresinya.
   *
   * Baris ekspresi dibaca sebagai tiga larik sejajar. Indeks yang sama berarti
   * baris yang sama — jadi larik yang lebih pendek dari yang lain hanya berarti
   * baris itu tidak lengkap, dan repositori yang memutuskan apa yang terjadi
   * padanya (dibuang, karena ekspresi tanpa gambar tidak dapat dirender).
   */
  app.post('/admin/characters', async (request, reply) => {
    const session = request.adminSession;
    const parsed = characterBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/characters?notice=invalid-input', 302);
    }
    const data = parsed.data;

    const names = toArray(data.expression);
    const mediaIds = toArray(data.expressionMedia);
    const usages = toArray(data.expressionUsage);

    const expressions = names.map((expression, index) => ({
      expression,
      mediaId: mediaIds[index] ?? '',
      usageNote: usages[index] ?? '',
    }));

    const isNew = data.characterId.length === 0;
    const input = { name: data.name, expressions };

    const result = isNew
      ? await ctx.characters.create(input)
      : await ctx.characters.update(data.characterId, input);

    const base = isNew
      ? '/admin/characters'
      : `/admin/characters-form?character=${encodeURIComponent(data.characterId)}`;

    if (!result.ok) {
      return reply.redirect(
        noticeRedirect(base, characterNotice(result.reason), result.detail),
        302,
      );
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: isNew ? 'character.create' : 'character.update',
      targetKind: 'character',
      targetId: result.characterId,
      detail: { name: data.name, expressions: expressions.length },
      ipAddress: request.ip,
    });

    return reply.redirect(
      noticeRedirect(
        `/admin/characters-form?character=${encodeURIComponent(result.characterId)}`,
        isNew ? 'created' : 'saved',
      ),
      302,
    );
  });

  app.post('/admin/characters/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({ characterId: z.string().trim().min(1) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/characters?notice=invalid-input', 302);
    }

    const result = await ctx.characters.remove(body.data.characterId);
    if (!result.ok) {
      return reply.redirect('/admin/characters?notice=not-found', 302);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'character.delete',
      targetKind: 'character',
      targetId: body.data.characterId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/characters?notice=deleted', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: lokasi                                                 */
  /* ---------------------------------------------------------------- */

  app.post('/admin/locations', async (request, reply) => {
    const session = request.adminSession;
    const parsed = locationMasterBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/locations?notice=invalid-input', 302);
    }
    const data = parsed.data;

    const isNew = data.locationId.length === 0;
    const input = {
      name: data.name,
      categoryId: data.categoryId,
      description: data.description,
      mediaId: data.mediaId,
    };

    const result = isNew
      ? await ctx.locations.create(input)
      : await ctx.locations.update(data.locationId, input);

    const base = isNew
      ? '/admin/locations'
      : `/admin/locations-form?location=${encodeURIComponent(data.locationId)}`;

    if (!result.ok) {
      return reply.redirect(
        noticeRedirect(base, locationNotice(result.reason), undefined),
        302,
      );
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: isNew ? 'location.create' : 'location.update',
      targetKind: 'location',
      targetId: result.locationId,
      detail: { name: data.name, categoryId: data.categoryId },
      ipAddress: request.ip,
    });

    return reply.redirect(
      noticeRedirect(
        `/admin/locations-form?location=${encodeURIComponent(result.locationId)}`,
        isNew ? 'created' : 'saved',
      ),
      302,
    );
  });

  app.post('/admin/locations/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ locationId: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/locations?notice=invalid-input', 302);
    }

    const result = await ctx.locations.remove(body.data.locationId);
    if (!result.ok) {
      const code = result.reason === 'in-use' ? 'location-in-use' : 'not-found';
      return reply.redirect(noticeRedirect('/admin/locations', code), 302);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'location.delete',
      targetKind: 'location',
      targetId: body.data.locationId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/locations?notice=deleted', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: master kategori lokasi                                 */
  /* ---------------------------------------------------------------- */

  app.post('/admin/location-categories', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({ name: z.string().max(80).optional().default('') })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/location-categories?notice=invalid-input', 302);
    }

    const result = await ctx.locations.createCategory(body.data.name);
    if (!result.ok) {
      return reply.redirect(
        `/admin/location-categories?notice=${categoryNotice(result.reason)}`,
        302,
      );
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'locationCategory.create',
      targetKind: 'locationCategory',
      targetId: result.categoryId,
      detail: { name: body.data.name },
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/location-categories?notice=created', 302);
  });

  app.post('/admin/location-categories/rename', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({ categoryId: z.string().trim().min(1), name: z.string().max(80).optional().default('') })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/location-categories?notice=invalid-input', 302);
    }

    const result = await ctx.locations.renameCategory(body.data.categoryId, body.data.name);
    if (!result.ok) {
      return reply.redirect(
        `/admin/location-categories?notice=${categoryNotice(result.reason)}`,
        302,
      );
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'locationCategory.rename',
      targetKind: 'locationCategory',
      targetId: body.data.categoryId,
      detail: { name: body.data.name },
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/location-categories?notice=saved', 302);
  });

  app.post('/admin/location-categories/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ categoryId: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/location-categories?notice=invalid-input', 302);
    }

    const result = await ctx.locations.removeCategory(body.data.categoryId);
    if (!result.ok) {
      return reply.redirect(
        `/admin/location-categories?notice=${categoryNotice(result.reason)}`,
        302,
      );
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'locationCategory.delete',
      targetKind: 'locationCategory',
      targetId: body.data.categoryId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/location-categories?notice=deleted', 302);
  });

  app.post('/admin/location-categories/move', async (request, reply) => {
    const body = z
      .object({ categoryId: z.string().trim().min(1), direction: z.enum(['up', 'down']) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/location-categories?notice=invalid-input', 302);
    }

    await ctx.locations.moveCategory(body.data.categoryId, body.data.direction);
    return reply.redirect('/admin/location-categories', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: master genre                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Menambah genre.
   *
   * Terpisah dari `POST /admin/genres/update` dengan sengaja. Satu route yang
   * menebak sendiri apakah ini penambahan atau perubahan akan menebak salah
   * pada satu kasus: genre yang baru saja dihapus lalu dibuat ulang dengan id
   * yang sama. Dengan dua alamat, niatnya tertulis di formulirnya sendiri.
   */
  app.post('/admin/genres', async (request, reply) => {
    const session = request.adminSession;
    const parsed = genreBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/genres?notice=genre-invalid', 302);
    }

    const result = await ctx.genres.create({
      genreId: parsed.data.genreId,
      labelId: parsed.data.labelId,
      labelEn: parsed.data.labelEn,
      active: parsed.data.active === 'true',
    });

    if (!result.ok) {
      const notice = result.reason === 'invalid-id' ? 'genre-invalid' : 'genre-exists';
      return reply.redirect(`/admin/genres?notice=${notice}`, 302);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'genre.create',
      targetKind: 'genre',
      targetId: parsed.data.genreId.trim().toLowerCase(),
      detail: { labelId: parsed.data.labelId, labelEn: parsed.data.labelEn },
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/genres?notice=created', 302);
  });

  /** Mengubah label dan keaktifan. Id TIDAK diubah — lihat catatan di halaman. */
  app.post('/admin/genres/update', async (request, reply) => {
    const session = request.adminSession;
    const parsed = genreBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/genres?notice=genre-invalid', 302);
    }

    const result = await ctx.genres.update(parsed.data.genreId, {
      labelId: parsed.data.labelId,
      labelEn: parsed.data.labelEn,
      active: parsed.data.active === 'true',
    });

    if (!result.ok) {
      return reply.redirect('/admin/genres?notice=not-found', 302);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'genre.update',
      targetKind: 'genre',
      targetId: parsed.data.genreId,
      detail: {
        labelId: parsed.data.labelId,
        labelEn: parsed.data.labelEn,
        active: parsed.data.active === 'true',
      },
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/genres?notice=saved', 302);
  });

  /**
   * Menghapus genre.
   *
   * Genre yang masih dipakai ditolak, dan pesannya menyebut jalan keluarnya
   * (nonaktifkan) — bukan sekadar "tidak dapat dihapus". Foreign key di basis
   * data tetap menjadi jaring pengaman bila ada penyisipan di antara
   * pemeriksaan dan penghapusan.
   */
  app.post('/admin/genres/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ genreId: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/genres?notice=genre-invalid', 302);
    }

    const result = await ctx.genres.remove(body.data.genreId);
    if (!result.ok) {
      const notice = result.reason === 'in-use' ? 'genre-in-use' : 'not-found';
      return reply.redirect(`/admin/genres?notice=${notice}`, 302);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'genre.delete',
      targetKind: 'genre',
      targetId: body.data.genreId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/genres?notice=deleted', 302);
  });

  app.post('/admin/genres/move', async (request, reply) => {
    const body = z
      .object({ genreId: z.string().trim().min(1), direction: z.enum(['up', 'down']) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/genres?notice=genre-invalid', 302);
    }

    await ctx.genres.move(body.data.genreId, body.data.direction);
    return reply.redirect('/admin/genres?notice=saved', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Wizard "Dunia baru"                                               */
  /* ---------------------------------------------------------------- */

  // Alamat lama diarahkan ke wizard, supaya tautan dan penanda buku yang sudah
  // ada tidak mati. Dunia yang sudah terbit tetap disunting lewat jalur versi.
  app.get('/admin/worlds-new', async (_request, reply) =>
    reply.redirect('/admin/worlds-wizard', 302),
  );

  app.get('/admin/worlds-wizard', async (request, reply) =>
    sendWizard(reply, request, 'Dunia baru', await pages.wizardStep1(ctx, null), 'worlds'),
  );

  app.get<{ Params: { worldId: string; step: string } }>(
    '/admin/worlds/:worldId/wizard/:step',
    async (request, reply) => {
      const { worldId } = request.params;
      const draft = await ctx.drafts.findDraft(worldId);
      if (!draft) {
        return reply.redirect(`/admin/worlds/${encodeURIComponent(worldId)}?notice=not-draft`, 302);
      }

      const step = Number(request.params.step);
      if (step === 2) {
        return sendWizard(reply, request, 'Latar belakang', await pages.wizardStep2(ctx, worldId), 'worlds');
      }
      if (step === 3) {
        return sendWizard(reply, request, 'Karakter', await pages.wizardStep3(ctx, worldId), 'worlds');
      }
      return sendWizard(reply, request, 'Identitas dunia', await pages.wizardStep1(ctx, worldId), 'worlds');
    },
  );

  app.post('/admin/worlds-wizard/1', async (request, reply) => {
    const session = request.adminSession;
    const parsed = wizardIdentityBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/worlds-wizard?notice=invalid-input', 302);
    }
    const data = parsed.data;

    let worldId = data.worldId;
    let worldVersion: number;

    if (worldId.length > 0) {
      // Draf dicari ulang dari basis data; `worldId` dari klien hanya dipakai
      // untuk MENUNJUK, bukan untuk menentukan boleh atau tidak.
      const draft = await ctx.drafts.findDraft(worldId);
      if (!draft) {
        return reply.redirect(`/admin/worlds/${encodeURIComponent(worldId)}?notice=not-draft`, 302);
      }
      worldVersion = draft.worldVersion;
    } else {
      const created = await ctx.drafts.createDraft();
      worldId = created.worldId;
      worldVersion = created.worldVersion;
    }

    // Sampul hanya diterima bila berkasnya benar-benar ada. Tanpa pemeriksaan
    // ini, satu id yang salah ketik tersimpan dan katalog pemain menampilkan
    // gambar rusak — kegagalan yang baru terlihat jauh dari tempat penyebabnya.
    const coverMediaId =
      data.coverMediaId.length > 0 &&
      isMediaId(data.coverMediaId) &&
      (await ctx.media.findById(data.coverMediaId)) !== null
        ? data.coverMediaId
        : null;

    // Disimpan LEBIH DULU, baru diperiksa. Urutan ini disengaja: menolak
    // "Lanjut" karena satu kolom kosong tidak boleh membuang seluruh isian yang
    // sudah diketik. Pemilik proyek meminta draf yang dapat dilanjutkan
    // sewaktu-waktu — dan isian yang hilang karena validasi adalah kebalikannya.
    await ctx.drafts.saveIdentity(worldId, worldVersion, {
      title: data.title,
      synopsis: data.synopsis,
      premise: data.premise,
      contentRating: data.contentRating,
      genres: await ctx.genres.existingIds(toArray(data.genres)),
      locales: toArray(data.locales).filter(isLocale),
      coverMediaId,
    });

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'world.draft.save',
      targetKind: 'world',
      targetId: worldId,
      detail: { step: 1, intent: data.intent },
      ipAddress: request.ip,
    });

    if (data.intent === 'next') {
      const missing =
        data.title.length === 0 ||
        data.synopsis.length === 0 ||
        data.premise.length === 0 ||
        coverMediaId === null;
      if (missing) {
        return reply.redirect(
          `/admin/worlds/${encodeURIComponent(worldId)}/wizard/1?notice=incomplete`,
          302,
        );
      }
      return reply.redirect(`/admin/worlds/${encodeURIComponent(worldId)}/wizard/2?notice=saved`, 302);
    }
    return reply.redirect('/admin/worlds?notice=draft', 302);
  });

  app.post('/admin/worlds-wizard/2', async (request, reply) => {
    const body = z
      .object({ worldId: z.string().trim().min(1), intent: z.enum(['next', 'draft']) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/worlds?notice=invalid-input', 302);
    }

    const draft = await ctx.drafts.findDraft(body.data.worldId);
    if (!draft) {
      return reply.redirect(`/admin/worlds?notice=not-draft`, 302);
    }

    if (body.data.intent === 'next' && draft.backgroundCount === 0) {
      return reply.redirect(
        `/admin/worlds/${encodeURIComponent(draft.worldId)}/wizard/2?notice=incomplete`,
        302,
      );
    }

    return reply.redirect(
      body.data.intent === 'next'
        ? `/admin/worlds/${encodeURIComponent(draft.worldId)}/wizard/3?notice=saved`
        : '/admin/worlds?notice=draft',
      302,
    );
  });

  /**
   * Memungut satu latar dari master lokasi ke dalam draf dunia.
   *
   * Gambar dan keterangannya DISALIN, bukan dirujuk: dunia boleh menyesuaikan
   * keterangan, blur, dan peluang kemunculannya tanpa mengubah master, dan versi
   * dunia lama tidak boleh ikut berubah ketika master disunting. Yang tetap
   * menunjuk master adalah `master_location_id`/`master_category_id` — itulah
   * yang membuat "latar ini dari lokasi dan era mana" dapat dijawab, dan yang
   * membuat lokasi serta kategori yang masih dipakai tidak dapat dihapus.
   *
   * Dimensi gambar dibaca dari basis data media, BUKAN dari angka kiriman klien:
   * server sudah menyimpannya saat unggahan, dan angka itu dipakai menghitung
   * titik fokus — salahnya akan terlihat sebagai gambar yang tidak pada
   * tempatnya.
   */
  app.post('/admin/worlds-wizard/2/backgrounds/pick', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({
        worldId: z.string().trim().min(1),
        // Cukup id lokasinya: setiap lokasi master sudah membawa kategorinya
        // sendiri, jadi tidak ada dua daftar yang harus dicocokkan admin.
        pick: z.string().trim().min(1),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/worlds?notice=invalid-input', 302);
    }

    const draft = await ctx.drafts.findDraft(body.data.worldId);
    if (!draft) {
      return reply.redirect('/admin/worlds?notice=not-draft', 302);
    }

    const base = `/admin/worlds/${encodeURIComponent(draft.worldId)}/wizard/2`;

    const location = await ctx.locations.find(body.data.pick);
    if (!location) {
      return reply.redirect(`${base}?notice=not-found`, 302);
    }

    const media = await ctx.media.findById(location.mediaId);
    if (!media) {
      return reply.redirect(`${base}?notice=not-found`, 302);
    }

    /*
     * Keterangan dan penyetelan DISALIN dari master sebagai titik awal; dunia
     * boleh menyesuaikannya tanpa mengubah master. Peluang kemunculan, blur, dan
     * titik fokus mulai dari netral karena ketiganya keputusan CERITA, bukan
     * sifat tempatnya — master tidak punya pendapat tentang keduanya.
     */
    const created = await ctx.drafts.addBackground(draft.worldId, draft.worldVersion, {
      mediaId: location.mediaId,
      label: location.name,
      description: location.description,
      usageNote: '',
      encounterLikelihood: null,
      blurStrength: 0,
      focalX: 0.5,
      focalY: 0.5,
      width: media.width,
      height: media.height,
      masterLocationId: location.locationId,
      masterCategoryId: location.categoryId,
    });

    if (!created) {
      return reply.redirect(`${base}?notice=limit`, 302);
    }

    /*
     * Daftar lokasi dunia TUMBUH dari latar yang dipungut — ia tidak lagi
     * diketik admin. Satu tempat punya satu identitas di seluruh sistem, jadi
     * id-nya sama persis dengan id master.
     */
    await ctx.drafts.ensureLocation(
      draft.worldId,
      draft.worldVersion,
      location.locationId,
      location.name,
    );

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'world.background.pick',
      targetKind: 'world',
      targetId: draft.worldId,
      detail: {
        assetId: created.assetId,
        locationId: location.locationId,
        categoryId: location.categoryId,
      },
      ipAddress: request.ip,
    });

    return reply.redirect(`${base}?notice=picked`, 302);
  });

  app.post('/admin/worlds-wizard/2/background', async (request, reply) => {
    const body = z
      .object({
        worldId: z.string().trim().min(1),
        assetId: z.string().trim().min(1),
        description: z.string().max(200).optional().default(''),
        usageNote: z.string().max(500).optional().default(''),
        encounterLikelihood: z.string().optional().default(''),
        blurStrength: z.string().optional().default('0'),
        focalX: z.string().optional().default('0.5'),
        focalY: z.string().optional().default('0.5'),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/worlds?notice=invalid-input', 302);
    }

    const draft = await ctx.drafts.findDraft(body.data.worldId);
    if (!draft) {
      return reply.redirect('/admin/worlds?notice=not-draft', 302);
    }

    const updated = await ctx.drafts.updateBackground(
      draft.worldId,
      draft.worldVersion,
      body.data.assetId,
      {
        mediaId: null,
        label: body.data.description,
        description: body.data.description,
        usageNote: body.data.usageNote,
        encounterLikelihood: body.data.encounterLikelihood,
        blurStrength: Number(body.data.blurStrength),
        focalX: Number(body.data.focalX),
        focalY: Number(body.data.focalY),
        width: null,
        height: null,
      },
    );

    return reply.redirect(
      `/admin/worlds/${encodeURIComponent(draft.worldId)}/wizard/2?notice=${updated ? 'saved' : 'not-found'}`,
      302,
    );
  });

  app.post('/admin/worlds-wizard/2/background/move', async (request, reply) => {
    const body = z
      .object({
        worldId: z.string().trim().min(1),
        assetId: z.string().trim().min(1),
        direction: z.enum(['up', 'down']),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/worlds?notice=invalid-input', 302);
    }

    const draft = await ctx.drafts.findDraft(body.data.worldId);
    if (!draft) {
      return reply.redirect('/admin/worlds?notice=not-draft', 302);
    }

    await ctx.drafts.moveBackground(
      draft.worldId,
      draft.worldVersion,
      body.data.assetId,
      body.data.direction,
    );

    return reply.redirect(`/admin/worlds/${encodeURIComponent(draft.worldId)}/wizard/2`, 302);
  });

  app.post('/admin/worlds-wizard/2/background/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({ worldId: z.string().trim().min(1), assetId: z.string().trim().min(1) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/worlds?notice=invalid-input', 302);
    }

    const draft = await ctx.drafts.findDraft(body.data.worldId);
    if (!draft) {
      return reply.redirect('/admin/worlds?notice=not-draft', 302);
    }

    const deleted = await ctx.drafts.deleteBackground(
      draft.worldId,
      draft.worldVersion,
      body.data.assetId,
    );

    if (deleted) {
      await admins.recordAudit({
        adminId: session?.adminId ?? null,
        username: session?.username ?? '',
        action: 'world.background.delete',
        targetKind: 'world',
        targetId: draft.worldId,
        detail: { assetId: body.data.assetId },
        ipAddress: request.ip,
      });
    }

    return reply.redirect(
      `/admin/worlds/${encodeURIComponent(draft.worldId)}/wizard/2?notice=${deleted ? 'deleted' : 'not-found'}`,
      302,
    );
  });

  app.post('/admin/worlds-wizard/3', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({ worldId: z.string().trim().min(1), intent: z.enum(['next', 'draft']) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/worlds?notice=invalid-input', 302);
    }

    const draft = await ctx.drafts.findDraft(body.data.worldId);
    if (!draft) {
      return reply.redirect('/admin/worlds?notice=not-draft', 302);
    }

    if (body.data.intent === 'draft') {
      return reply.redirect('/admin/worlds?notice=draft', 302);
    }

    // Penerbitan diperiksa terhadap ISI draf di basis data, bukan terhadap apa
    // yang tampak di layar: halaman bisa saja sudah usang.
    //
    // NPC tanpa potret ikut menahan penerbitan. Tanpa pemeriksaan ini, dunia
    // dapat terbit dengan karakter yang tidak punya satu pun gambar ekspresi —
    // dan pemain akan melihat adegan dengan karakter tanpa wajah.
    const faceless = await ctx.drafts.countNpcsWithoutPortrait(draft.worldId, draft.worldVersion);
    if (draft.backgroundCount === 0 || draft.npcCount === 0 || faceless > 0) {
      return reply.redirect(
        `/admin/worlds/${encodeURIComponent(draft.worldId)}/wizard/3?notice=incomplete`,
        302,
      );
    }

    await ctx.drafts.publishDraft(draft.worldId, draft.worldVersion);

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'world.publish',
      targetKind: 'world',
      targetId: draft.worldId,
      detail: { worldVersion: draft.worldVersion },
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/worlds?notice=published', 302);
  });

  app.post('/admin/worlds-wizard/3/npc', async (request, reply) => {
    const session = request.adminSession;
    const parsed = wizardNpcBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/worlds?notice=invalid-input', 302);
    }
    const data = parsed.data;

    const draft = await ctx.drafts.findDraft(data.worldId);
    if (!draft) {
      return reply.redirect('/admin/worlds?notice=not-draft', 302);
    }

    const names = toArray(data.expression);
    const usages = toArray(data.expressionUsage);
    const mediaIds = toArray(data.expressionMedia);

    // Ekspresi tanpa gambar DIBUANG, bukan disimpan namanya saja.
    //
    // Tiga alasan, dan ketiganya saling menguatkan:
    //   1. Halaman sudah menjanjikannya kepada pengguna: "yang belum diunggah
    //      gambarnya tidak akan tersimpan".
    //   2. `listNpcs` menurunkan daftar ekspresi dari BARIS ASET potret. Nama
    //      tanpa gambar karena itu tidak akan pernah tampil di panel — lalu
    //      hilang senyap pada penyimpanan berikutnya, karena formulir hanya
    //      mengirim apa yang terlihat.
    //   3. Kontrak katalog pemain menjanjikan setiap ekspresi punya gambar.
    //      Nama tanpa gambar berarti AI boleh memilih ekspresi yang tidak dapat
    //      dirender klien.
    const expressions: { expression: string; usageNote: string; mediaId: string | null }[] = [];
    for (const [index, name] of names.entries()) {
      if (name.trim().length === 0) {
        continue;
      }
      const candidate = mediaIds[index] ?? '';
      const mediaId =
        isMediaId(candidate) && (await ctx.media.findById(candidate)) !== null ? candidate : null;
      if (mediaId === null) {
        continue;
      }
      expressions.push({ expression: name, usageNote: usages[index] ?? '', mediaId });
    }

    const baseMediaId =
      isMediaId(data.baseMediaId) && (await ctx.media.findById(data.baseMediaId)) !== null
        ? data.baseMediaId
        : null;

    // Gambar dasar diletakkan PALING DEPAN sebagai ekspresi `dasar`, sehingga ia
    // menjadi potret bawaan. Tanpa langkah ini, berkas yang diunggah pengguna
    // diterima lalu dibuang tanpa jejak — kolom `default_portrait_asset_id`
    // hanya menunjuk aset potret, dan tidak ada tempat lain untuk menyimpannya.
    //
    // Bila pengguna kebetulan menamai salah satu ekspresinya `dasar`, entri itu
    // digantikan: dua aset dengan id yang sama tidak dapat hidup berdampingan.
    const ordered =
      baseMediaId === null
        ? expressions
        : [
            { expression: BASE_EXPRESSION, usageNote: '', mediaId: baseMediaId },
            ...expressions.filter(
              (item) => item.expression.trim().toLowerCase() !== BASE_EXPRESSION,
            ),
          ];

    const saved = await ctx.drafts.saveNpc(draft.worldId, draft.worldVersion, {
      npcId: data.npcId.length > 0 ? data.npcId : null,
      name: data.name,
      role: data.role,
      traits: data.traits
        .split(',')
        .map((trait) => trait.trim())
        .filter((trait) => trait.length > 0),
      publicBackstory: data.publicBackstory,
      initialRelation: isRelationStatus(data.initialRelation) ? data.initialRelation : 'normal',
      expressions: ordered,
    });

    if (saved) {
      await admins.recordAudit({
        adminId: session?.adminId ?? null,
        username: session?.username ?? '',
        action: data.npcId.length > 0 ? 'world.npc.update' : 'world.npc.create',
        targetKind: 'character',
        targetId: `${draft.worldId}/${saved.npcId}`,
        detail: { expressions: ordered.length },
        ipAddress: request.ip,
      });
    }

    return reply.redirect(
      `/admin/worlds/${encodeURIComponent(draft.worldId)}/wizard/3?notice=created`,
      302,
    );
  });

  app.post('/admin/worlds-wizard/3/npc/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({ worldId: z.string().trim().min(1), npcId: z.string().trim().min(1) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/worlds?notice=invalid-input', 302);
    }

    const draft = await ctx.drafts.findDraft(body.data.worldId);
    if (!draft) {
      return reply.redirect('/admin/worlds?notice=not-draft', 302);
    }

    const deleted = await ctx.drafts.deleteNpc(draft.worldId, draft.worldVersion, body.data.npcId);

    if (deleted) {
      await admins.recordAudit({
        adminId: session?.adminId ?? null,
        username: session?.username ?? '',
        action: 'world.npc.delete',
        targetKind: 'character',
        targetId: `${draft.worldId}/${body.data.npcId}`,
        ipAddress: request.ip,
      });
    }

    return reply.redirect(
      `/admin/worlds/${encodeURIComponent(draft.worldId)}/wizard/3?notice=${deleted ? 'deleted' : 'not-found'}`,
      302,
    );
  });

  /* ---------------------------------------------------------------- */
  /* Unggahan gambar                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Menerima satu berkas gambar mentah.
   *
   * SATU berkas per permintaan, dengan sengaja. Mengunggah lima puluh latar
   * belakang dalam satu permintaan berarti satu kegagalan membatalkan
   * seluruhnya, dan kemajuannya tidak dapat ditampilkan. Dengan satu berkas per
   * permintaan, klien dapat memperlihatkan kemajuan per gambar dan mengulang
   * hanya yang gagal.
   *
   * Jenis berkas ditentukan dari ISINYA, bukan dari `content-type` yang dikirim
   * klien — header itu dapat dikarang siapa saja. Yang tidak dikenali ditolak,
   * termasuk SVG: SVG adalah dokumen yang dapat memuat skrip, dan menyajikannya
   * dari domain yang sama sama dengan menyerahkan panel admin.
   */
  app.post('/admin/media', { bodyLimit: MAX_UPLOAD_BYTES }, async (request, reply) => {
    const session = request.adminSession;
    if (!session) {
      return sendJson(reply, 401, 'UNAUTHORIZED', 'Sesi tidak berlaku.');
    }

    const body: unknown = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return sendJson(reply, 400, 'VALIDATION', 'Badan permintaan harus berupa berkas gambar.');
    }

    const inspection = inspectImage(body);
    if (!inspection) {
      return sendJson(
        reply,
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Hanya berkas PNG, JPEG, atau WebP yang diterima.',
      );
    }

    const { mediaId, isNew } = await media.put({
      bytes: body,
      inspection,
      uploadedBy: session.username,
    });

    // Hanya unggahan yang benar-benar menyimpan berkas baru yang dicatat.
    // Mengunggah ulang gambar yang sama tidak mengubah apa pun, jadi mencatatnya
    // hanya akan mengaburkan catatan audit.
    if (isNew) {
      await admins.recordAudit({
        adminId: session.adminId,
        username: session.username,
        action: 'media.upload',
        targetKind: 'media',
        targetId: mediaId,
        detail: {
          contentType: inspection.contentType,
          byteSize: body.length,
          width: inspection.width,
          height: inspection.height,
        },
        ipAddress: request.ip,
      });
    }

    return reply.send({
      mediaId,
      url: `/v1/media/${mediaId}`,
      contentType: inspection.contentType,
      byteSize: body.length,
      width: inspection.width,
      height: inspection.height,
      hasAlpha: inspection.hasAlpha,
      deduplicated: !isNew,
    });
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: akun                                                   */
  /* ---------------------------------------------------------------- */

  app.post('/admin/accounts/tier', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({ accountId: z.string().trim().min(1), tier: z.enum(['free', 'paid']) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/accounts?notice=invalid-input', 302);
    }

    await ctx.accounts.setTierForToday(body.data.accountId, body.data.tier);
    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'account.tier',
      targetKind: 'account',
      targetId: body.data.accountId,
      detail: { tier: body.data.tier },
      ipAddress: request.ip,
    });

    return reply.redirect(`/admin/accounts/${encodeURIComponent(body.data.accountId)}?notice=saved`, 302);
  });

  app.post('/admin/accounts/reset', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ accountId: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/accounts?notice=invalid-input', 302);
    }

    await ctx.accounts.resetTodayUsage(body.data.accountId);
    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'account.reset-usage',
      targetKind: 'account',
      targetId: body.data.accountId,
      ipAddress: request.ip,
    });

    return reply.redirect(`/admin/accounts/${encodeURIComponent(body.data.accountId)}?notice=saved`, 302);
  });

  app.post('/admin/accounts/bonus', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({
        accountId: z.string().trim().min(1),
        delta: z.coerce.number().int(),
        reason: z.string().trim().max(120).optional().default(''),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/accounts?notice=invalid-input', 302);
    }

    const result = await ctx.accounts.adjustBonus({
      accountId: body.data.accountId,
      delta: body.data.delta,
      reason: body.data.reason,
    });

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'account.bonus-adjust',
      targetKind: 'account',
      targetId: body.data.accountId,
      detail: { delta: body.data.delta, newBalance: result.newBalance, reason: body.data.reason },
      ipAddress: request.ip,
    });

    return reply.redirect(`/admin/accounts/${encodeURIComponent(body.data.accountId)}?notice=saved`, 302);
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: model                                                  */
  /* ---------------------------------------------------------------- */

  app.post('/admin/models', async (request, reply) => {
    const session = request.adminSession;
    const parsed = modelBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/models-form?notice=invalid-input', 302);
    }

    const result = await ctx.models.saveModel({
      modelId: parsed.data.modelId || null,
      label: parsed.data.label,
      providerId: parsed.data.providerId,
      modelKey: parsed.data.modelKey,
      contextTokens: parsed.data.contextTokens,
      position: parsed.data.position,
      tier: parsed.data.tier,
      isActive: parsed.data.isActive !== undefined,
      notes: parsed.data.notes,
    });

    if (!result.ok) {
      // Kembali ke formulir yang sedang diisi, bukan ke daftar: isian yang
      // panjang tidak boleh hilang hanya karena satu bidang ditolak.
      const base = parsed.data.modelId
        ? `/admin/models-form?model=${encodeURIComponent(parsed.data.modelId)}`
        : '/admin/models-form';
      return reply.redirect(noticeRedirect(base, modelNotice(result.reason)), 302);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: parsed.data.modelId ? 'model.update' : 'model.create',
      targetKind: 'model',
      targetId: result.modelId,
      detail: { providerId: parsed.data.providerId, tier: parsed.data.tier },
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/models?notice=saved', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: provider                                               */
  /* ---------------------------------------------------------------- */

  app.post('/admin/providers', async (request, reply) => {
    const session = request.adminSession;
    const parsed = providerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/providers-form?notice=invalid-input', 302);
    }
    const data = parsed.data;

    const isNew = data.providerId.length === 0;
    const input = {
      name: data.name,
      prefix: data.prefix,
      apiType: data.apiType,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      apiKeyEnv: data.apiKeyEnv,
      imagePart: data.imagePart,
      isActive: data.isActive !== undefined,
      notes: data.notes,
    };

    const result = isNew
      ? await ctx.providers.create(input)
      : await ctx.providers.update(data.providerId, input);

    // Kembali ke formulir yang sedang diisi, bukan ke daftar: alamat dan prefix
    // panjang, dan tidak boleh hilang hanya karena satu bidang ditolak.
    const base = isNew
      ? '/admin/providers-form'
      : `/admin/providers-form?provider=${encodeURIComponent(data.providerId)}`;

    if (!result.ok) {
      return reply.redirect(
        noticeRedirect(base, providerNotice(result.reason), result.detail),
        302,
      );
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: isNew ? 'provider.create' : 'provider.update',
      targetKind: 'provider',
      targetId: result.providerId,
      /*
       * Sengaja TIDAK mencatat apa pun tentang kuncinya — bahkan tidak panjangnya,
       * dan tidak juga "apakah diisi". Catatan audit dapat dibaca peran `support`,
       * dan jejak paling kecil sekalipun (mis. "kunci diganti pada 14:02") masih
       * mengatakan sesuatu tentang rahasia yang tidak seharusnya ia ketahui.
       */
      detail: { prefix: data.prefix, apiType: data.apiType },
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/providers?notice=saved', 302);
  });

  app.post('/admin/providers/key/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ providerId: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/providers?notice=invalid-input', 302);
    }

    const result = await ctx.providers.clearKey(body.data.providerId);
    if (!result.ok) {
      // `clearKey` hanya dapat gagal karena barisnya tidak ada.
      const base = `/admin/providers-form?provider=${encodeURIComponent(body.data.providerId)}`;
      return reply.redirect(noticeRedirect(base, 'not-found'), 302);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'provider.key.delete',
      targetKind: 'provider',
      targetId: body.data.providerId,
      ipAddress: request.ip,
    });

    return reply.redirect(
      `/admin/providers-form?provider=${encodeURIComponent(body.data.providerId)}&notice=key-cleared`,
      302,
    );
  });

  app.post('/admin/providers/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ providerId: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/providers?notice=invalid-input', 302);
    }

    const result = await ctx.providers.remove(body.data.providerId);
    if (!result.ok) {
      const code = result.reason === 'in-use' ? 'provider-in-use' : 'not-found';
      return reply.redirect(noticeRedirect('/admin/providers', code), 302);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'provider.delete',
      targetKind: 'provider',
      targetId: body.data.providerId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/providers?notice=deleted', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Impor massal lokasi dengan AI                                     */
  /* ---------------------------------------------------------------- */

  /*
   * Dua rute, bukan satu, dan pemisahan itu disengaja.
   *
   * `/describe` memanggil model visi; `/create` menyimpan hasilnya. Kalau
   * keduanya digabung, satu percobaan ulang setelah gagal menyimpan akan
   * memanggil model sekali lagi — dan lebih buruk: jawaban yang hilang di
   * jaringan dapat menghasilkan DUA lokasi untuk satu gambar. Dengan dipisah,
   * percobaan ulang hanya mengulang bagian yang gagal.
   *
   * Satu gambar per permintaan. Peramban yang mengulanginya berkelompok, dan itu
   * yang membuat satu gambar gagal tidak menggagalkan sisanya.
   */

  app.post('/admin/locations-bulk/describe', async (request, reply) => {
    const body = z
      .object({
        mediaId: z.string().trim().min(1),
        providerId: z.string().trim().min(1),
        modelKey: z.string().trim().min(1).max(120),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ ok: false, reason: 'bad-request', detail: '' });
    }

    const provider = await ctx.providers.find(body.data.providerId);
    if (!provider) {
      return reply.code(404).send({ ok: false, reason: 'provider-not-found', detail: '' });
    }

    const media = await ctx.media.readBytes(body.data.mediaId);
    if (!media) {
      return reply.code(404).send({ ok: false, reason: 'media-not-found', detail: '' });
    }

    const apiKey = await ctx.providers.apiKeyFor(provider.providerId);
    if (!apiKey) {
      return reply.send({
        ok: false,
        reason: 'no-key',
        detail: 'Provider ini belum punya kunci API, jadi modelnya tidak dapat dipanggil.',
      });
    }

    const result = await describeLocationImage(
      {
        baseUrl: provider.baseUrl,
        apiType: provider.apiType,
        imagePart: provider.imagePart,
        modelKey: body.data.modelKey,
        imageBase64: media.bytes.toString('base64'),
        contentType: media.media.contentType,
      },
      apiKey,
    );

    if (!result.ok) {
      /*
       * Kegagalan di sini tercatat di log server, bukan hanya di layar.
       *
       * Sebabnya: pesan yang tampil di halaman sengaja pendek, sedangkan yang
       * dibutuhkan untuk mendiagnosis — "gambarnya sampai atau tidak" — kadang
       * baru terjawab oleh jawaban penuh modelnya. Log ini tidak memuat kunci
       * API dan tidak memuat isi gambarnya.
       */
      request.log.warn(
        {
          reason: result.reason,
          model: body.data.modelKey,
          provider: provider.providerId,
          mediaId: body.data.mediaId,
          imageBytes: media.bytes.length,
          imagePart: provider.imagePart,
          detail: result.detail,
        },
        'Analisis gambar lokasi gagal.',
      );
    }

    return reply.send(result);
  });

  app.post('/admin/locations-bulk/create', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({
        mediaId: z.string().trim().min(1),
        categoryId: z.string().trim().min(1),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(600).optional().default(''),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ ok: false, reason: 'bad-request', detail: '' });
    }

    const result = await ctx.locations.create({
      name: body.data.name,
      categoryId: body.data.categoryId,
      description: body.data.description,
      mediaId: body.data.mediaId,
    });

    if (!result.ok) {
      return reply.send({ ok: false, reason: result.reason, detail: '' });
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'location.create',
      targetKind: 'location',
      targetId: result.locationId,
      // Ditandai supaya jejaknya dapat dibedakan dari pembuatan satu per satu.
      detail: { via: 'bulk-ai' },
      ipAddress: request.ip,
    });

    return reply.send({ ok: true, locationId: result.locationId });
  });

  /* ---------------------------------------------------------------- */
  /* Impor massal potret karakter dengan AI                            */
  /* ---------------------------------------------------------------- */

  /*
   * Sama seperti impor lokasi: satu gambar per permintaan, dua fase terpisah.
   *
   * HANYA ANALISIS YANG PUNYA RUTE DI SINI, dan itu disengaja.
   *
   * Versi pertama punya rute `/create` juga: ia membaca daftar ekspresi yang ada,
   * menambahkan satu, lalu menulis ulang. Itu bekerja, tetapi memaksa alur yang
   * tidak mungkin — repositori MENOLAK karakter tanpa ekspresi bergambar, jadi
   * karakternya harus disimpan lebih dulu, dan menyimpan nama saja akan gagal.
   * Halaman pun menampilkan petunjuk "simpan nama dulu" yang membingungkan.
   *
   * Sekarang hasil model masuk ke BARIS FORMULIR, sama seperti yang diisi tangan,
   * dan formulirnya menyimpan semuanya sekaligus lewat `POST /admin/characters`.
   * Akibatnya:
   *
   *   - tidak ada karakter setengah jadi, karena tidak ada penyimpanan antara;
   *   - barisnya dapat disunting sebelum disimpan;
   *   - dan kekhawatiran "dua permintaan berbarengan saling menimpa" hilang
   *     seluruhnya, karena hanya ada SATU penulisan.
   *
   * Fase analisis tetap boleh berkelompok: ia hanya membaca dan memanggil model.
   */

  app.post('/admin/characters-bulk/describe', async (request, reply) => {
    const body = z
      .object({
        mediaId: z.string().trim().min(1),
        providerId: z.string().trim().min(1),
        modelKey: z.string().trim().min(1).max(120),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ ok: false, reason: 'bad-request', detail: '' });
    }

    const provider = await ctx.providers.find(body.data.providerId);
    if (!provider) {
      return reply.code(404).send({ ok: false, reason: 'provider-not-found', detail: '' });
    }

    const media = await ctx.media.readBytes(body.data.mediaId);
    if (!media) {
      return reply.code(404).send({ ok: false, reason: 'media-not-found', detail: '' });
    }

    const apiKey = await ctx.providers.apiKeyFor(provider.providerId);
    if (!apiKey) {
      return reply.send({
        ok: false,
        reason: 'no-key',
        detail: 'Provider ini belum punya kunci API, jadi modelnya tidak dapat dipanggil.',
      });
    }

    const result = await describeCharacterPortrait(
      {
        baseUrl: provider.baseUrl,
        apiType: provider.apiType,
        imagePart: provider.imagePart,
        modelKey: body.data.modelKey,
        imageBase64: media.bytes.toString('base64'),
        contentType: media.media.contentType,
      },
      apiKey,
    );

    if (!result.ok) {
      request.log.warn(
        {
          reason: result.reason,
          model: body.data.modelKey,
          provider: provider.providerId,
          mediaId: body.data.mediaId,
          imageBytes: media.bytes.length,
          imagePart: provider.imagePart,
          detail: result.detail,
        },
        'Analisis potret karakter gagal.',
      );
    }

    return reply.send(result);
  });

  app.post('/admin/providers/move', async (request, reply) => {
    const body = z
      .object({ providerId: z.string().trim().min(1), direction: z.enum(['up', 'down']) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/providers?notice=invalid-input', 302);
    }

    await ctx.providers.move(body.data.providerId, body.data.direction);
    return reply.redirect('/admin/providers', 302);
  });

  /**
   * Daftar model sebuah provider, untuk saran di formulir model.
   *
   * Mengembalikan 200 dengan `ok:false` ketika gagal, bukan kode galat: bagi
   * halaman, "provider tidak menjawab" adalah keadaan biasa yang perlu
   * DITAMPILKAN, bukan kesalahan permintaan. Kode galat hanya untuk provider
   * yang memang tidak ada.
   *
   * Kuncinya diambil di sini dan tidak pernah ikut ke jawaban — lihat catatan
   * di `providerModels.ts`.
   */
  app.get<{ Params: { providerId: string } }>(
    '/admin/providers/:providerId/models',
    async (request, reply) => {
      const provider = await ctx.providers.find(request.params.providerId);
      if (!provider) {
        return reply.code(404).send({ ok: false, reason: 'not-found', detail: '' });
      }

      const apiKey = await ctx.providers.apiKeyFor(provider.providerId);
      if (!apiKey) {
        return reply.send({ ok: false, reason: 'no-key', detail: '' });
      }

      const result = await fetchProviderModels(
        { baseUrl: provider.baseUrl, apiType: provider.apiType },
        apiKey,
      );
      return reply.send(result);
    },
  );

  app.post('/admin/models/toggle', async (request, reply) => {
    const session = request.adminSession;
    const body = z
      .object({ modelId: z.string().trim().min(1), isActive: z.enum(['true', 'false']) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/models?notice=invalid-input', 302);
    }

    const activate = body.data.isActive === 'true';
    if (activate) {
      // Mengaktifkan satu model mematikan model lain pada tier yang sama, supaya
      // rantai fallback tidak punya dua model pada posisi yang sama.
      await ctx.models.activateOnly(body.data.modelId);
    } else {
      await ctx.models.setActive(body.data.modelId, false);
    }

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: activate ? 'model.activate' : 'model.deactivate',
      targetKind: 'model',
      targetId: body.data.modelId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/models?notice=saved', 302);
  });

  app.post('/admin/models/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ modelId: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/models?notice=invalid-input', 302);
    }

    await ctx.models.deleteModel(body.data.modelId);
    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'model.delete',
      targetKind: 'model',
      targetId: body.data.modelId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/models?notice=deleted', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: promosi                                                */
  /* ---------------------------------------------------------------- */

  app.post('/admin/promotions', async (request, reply) => {
    const session = request.adminSession;
    const parsed = promotionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/promotions-new?notice=invalid-input', 302);
    }

    const startsAt = parseLocalDate(parsed.data.startsAt);
    const endsAt = parseLocalDate(parsed.data.endsAt);
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      return reply.redirect('/admin/promotions-new?notice=invalid-input', 302);
    }

    const { promotionId } = await ctx.promotions.savePromotion({
      promotionId: parsed.data.promotionId || null,
      code: parsed.data.code.toUpperCase(),
      label: parsed.data.label,
      bonusTokens: parsed.data.bonusTokens,
      maxRedemptions: parsed.data.maxRedemptions,
      oncePerAccount: parsed.data.oncePerAccount === 'on',
      tierRequirement: parsed.data.tierRequirement,
      startsAt,
      endsAt,
      isActive: parsed.data.isActive === 'on',
      notes: parsed.data.notes,
    });

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: parsed.data.promotionId ? 'promotion.update' : 'promotion.create',
      targetKind: 'promotion',
      targetId: promotionId,
      detail: { code: parsed.data.code.toUpperCase(), bonusTokens: parsed.data.bonusTokens },
      ipAddress: request.ip,
    });

    return reply.redirect(`/admin/promotions/${promotionId}?notice=saved`, 302);
  });

  app.post('/admin/promotions/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ promotionId: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/promotions?notice=invalid-input', 302);
    }

    await ctx.promotions.deletePromotion(body.data.promotionId);
    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'promotion.delete',
      targetKind: 'promotion',
      targetId: body.data.promotionId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/promotions?notice=deleted', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: pengaturan                                             */
  /* ---------------------------------------------------------------- */

  app.post('/admin/settings', async (request, reply) => {
    const session = request.adminSession;
    const parsed = settingBody.safeParse(request.body);
    if (!parsed.success || !SETTING_KEY_PATTERN.test(parsed.data.key)) {
      return reply.redirect('/admin/settings?notice=invalid-input', 302);
    }

    let value: unknown;
    try {
      value = JSON.parse(parsed.data.value);
    } catch {
      // Bukan JSON: simpan sebagai teks biasa. Admin yang menulis `hemat` tanpa
      // tanda kutip bermaksud menyimpan teks, bukan membuat galat.
      value = parsed.data.value;
    }

    await ctx.settings.setSetting({
      key: parsed.data.key,
      value,
      description: parsed.data.description,
      updatedBy: session?.username ?? '',
    });

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'setting.update',
      targetKind: 'setting',
      targetId: parsed.data.key,
      detail: { value },
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/settings?notice=saved', 302);
  });

  app.post('/admin/settings/delete', async (request, reply) => {
    const session = request.adminSession;
    const body = z.object({ key: z.string().trim().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/settings?notice=invalid-input', 302);
    }

    await ctx.settings.deleteSetting(body.data.key);
    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: 'setting.delete',
      targetKind: 'setting',
      targetId: body.data.key,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/settings?notice=deleted', 302);
  });

  /* ---------------------------------------------------------------- */
  /* Perubahan: akun admin                                             */
  /* ---------------------------------------------------------------- */

  app.post('/admin/admins', async (request, reply) => {
    const session = request.adminSession;
    // Peran owner adalah satu-satunya yang boleh menambah akun admin; kalau
    // tidak, siapa pun yang masuk dapat membuat akun untuk dirinya sendiri.
    if (session?.role !== 'owner') {
      return reply.redirect('/admin/settings?notice=invalid-input', 302);
    }

    const body = z
      .object({
        username: z.string().trim().min(3).max(32).regex(/^[a-z0-9_.-]+$/),
        displayName: z.string().trim().max(60).optional().default(''),
        password: z.string().min(8).max(200),
        role: z.enum(['owner', 'editor', 'support']),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/admins?notice=invalid-input', 302);
    }

    const existing = await admins.findAdminByUsername(body.data.username);
    if (existing) {
      return reply.redirect('/admin/admins?notice=conflict', 302);
    }

    const created = await admins.createAdmin({
      username: body.data.username,
      password: body.data.password,
      displayName: body.data.displayName,
      role: body.data.role,
    });

    await admins.recordAudit({
      adminId: session.adminId,
      username: session.username,
      action: 'admin.create',
      targetKind: 'admin',
      targetId: created.adminId,
      detail: { username: created.username, role: created.role },
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/admins?notice=created', 302);
  });

  app.post('/admin/admins/toggle', async (request, reply) => {
    const session = request.adminSession;
    if (session?.role !== 'owner') {
      return reply.redirect('/admin/admins?notice=invalid-input', 302);
    }

    const body = z
      .object({ adminId: z.string().trim().min(1), isActive: z.enum(['true', 'false']) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/admins?notice=invalid-input', 302);
    }

    // Mengunci diri sendiri akan mengakhiri sesi ini juga; tolak supaya tidak
    // ada admin yang terkunci dari panelnya sendiri.
    if (body.data.adminId === session.adminId && body.data.isActive === 'false') {
      return reply.redirect('/admin/admins?notice=conflict', 302);
    }

    const target = body.data.adminId;
    await admins.setAdminActive(target, body.data.isActive === 'true');

    await admins.recordAudit({
      adminId: session.adminId,
      username: session.username,
      action: body.data.isActive === 'true' ? 'admin.activate' : 'admin.deactivate',
      targetKind: 'admin',
      targetId: target,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/admins?notice=saved', 302);
  });
}

/* ------------------------------------------------------------------ */

/**
 * Mengirim halaman lengkap.
 *
 * Notice dibaca dari query di dalam helper ini supaya setiap route tidak perlu
 * mengulanginya — dan supaya pesan hasil tindakan tampil konsisten di mana pun
 * pengalihan berakhir.
 */
function send(
  reply: FastifyReply,
  request: FastifyRequest,
  title: string,
  body: SafeHtml,
  active: string,
): FastifyReply {
  return reply.type('text/html; charset=utf-8').send(
    layout({
      title,
      body,
      admin: request.adminSession
        ? {
            displayName: request.adminSession.displayName,
            username: request.adminSession.username,
            role: request.adminSession.role,
          }
        : null,
      active,
      notice: readNotice(request),
    }),
  );
}

/**
 * Mengirim halaman wizard.
 *
 * Berbeda dari `send()` hanya pada dua hal: gaya dan skrip wizard ikut
 * disisipkan. Keduanya konstanta yang ditulis di kode, bukan nilai dari basis
 * data — `layout()` menyisipkannya mentah tanpa `esc()`.
 */
function sendWizard(
  reply: FastifyReply,
  request: FastifyRequest,
  title: string,
  body: SafeHtml,
  active: string,
): FastifyReply {
  return reply.type('text/html; charset=utf-8').send(
    layout({
      title,
      body,
      admin: request.adminSession
        ? {
            displayName: request.adminSession.displayName,
            username: request.adminSession.username,
            role: request.adminSession.role,
          }
        : null,
      active,
      notice: readNotice(request),
      styles: WIZARD_CSS,
      scripts: WIZARD_JS,
    }),
  );
}

/**
 * Galat untuk route yang berbicara JSON, bukan HTML.
 *
 * Halaman panel menjawab dengan HTML dan pengalihan; unggahan gambar dijawab
 * klien lewat `fetch`, yang membaca kode status dan badan JSON. Karena itu
 * galatnya memakai bentuk yang sama dengan API pemain — bukan halaman HTML yang
 * akan membingungkan pemanggil `fetch`.
 */
function sendJson(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.status(status).type('application/json').send({ code, message, retryable: false });
}

/**
 * Admin yang sedang masuk, untuk diserahkan ke halaman yang menerapkannya.
 *
 * Diperlukan karena halaman kelola admin harus menyembunyikan tombol
 * "nonaktifkan" pada barisnya sendiri. Penolakannya tetap dilakukan server;
 * menyembunyikan tombolnya hanya mencegah admin mencoba sesuatu yang pasti
 * ditolak.
 */
function viewerOf(request: FastifyRequest): AdminViewer {
  const session = request.adminSession;
  if (!session) {
    return null;
  }
  return { adminId: session.adminId, username: session.username, role: session.role };
}

/** Menerjemahkan penanda ?notice= menjadi pesan yang dapat dibaca. */
function readNotice(request: FastifyRequest): { kind: 'ok' | 'error'; text: string } | null {
  const raw = (request.query as { notice?: string } | undefined)?.notice;
  if (!raw) {
    return null;
  }
  const MAP: Record<string, { kind: 'ok' | 'error'; text: string }> = {
    saved: { kind: 'ok', text: 'Perubahan tersimpan.' },
    created: { kind: 'ok', text: 'Data baru dibuat.' },
    deleted: { kind: 'ok', text: 'Data dihapus.' },
    'password-invalid': { kind: 'error', text: 'Isian kata sandi tidak lengkap.' },
    'password-weak': { kind: 'error', text: 'Kata sandi minimal 8 karakter.' },
    'password-wrong': { kind: 'error', text: 'Kata sandi lama salah.' },
    'not-found': { kind: 'error', text: 'Data yang diminta tidak ada.' },
    'invalid-input': { kind: 'error', text: 'Isian tidak sesuai. Periksa kembali.' },
    conflict: { kind: 'error', text: 'Perubahan tidak dapat diterapkan pada keadaan saat ini.' },
    draft: { kind: 'ok', text: 'Draf disimpan. Dapat dilanjutkan kapan saja dari daftar dunia.' },
    published: { kind: 'ok', text: 'Dunia diterbitkan dan sudah tampil di katalog pemain.' },
    incomplete: {
      kind: 'error',
      // Pesan ini muncul di ketiga langkah, jadi ia menyebut syarat ketiganya —
      // bukan hanya langkah 1. Isian yang sudah diketik tetap tersimpan.
      text:
        'Masih ada yang kurang. Langkah 1: judul, sinopsis, premis, dan sampul. ' +
        'Langkah 2: minimal satu latar belakang. Langkah 3: minimal satu karakter, ' +
        'dan setiap karakter harus punya minimal satu gambar ekspresi. ' +
        'Isian Anda sudah tersimpan sebagai draf.',
    },
    limit: { kind: 'error', text: 'Batas jumlah tercapai. Hapus salah satu sebelum menambah.' },
    picked: {
      kind: 'ok',
      text:
        'Latar ditambahkan dari master lokasi. Keterangan, blur, titik fokus, dan ' +
        'peluang kemunculannya boleh disesuaikan untuk dunia ini tanpa mengubah master.',
    },
    'genre-invalid': {
      kind: 'error',
      text:
        'ID genre harus diawali huruf, dan hanya boleh berisi huruf kecil, angka, ' +
        'atau garis bawah (2–32 karakter).',
    },
    'genre-exists': { kind: 'error', text: 'ID genre itu sudah dipakai.' },
    'genre-in-use': {
      kind: 'error',
      // Menyebutkan jalan keluarnya, bukan hanya penolakannya: admin yang
      // membaca "tidak dapat dihapus" tanpa alternatif akan mencoba lagi.
      text:
        'Genre ini masih dipakai dunia, jadi tidak dihapus — dunia yang memakainya ' +
        'akan kehilangan genrenya. Ubah keadaannya menjadi "tidak ditawarkan": ' +
        'genre hilang dari formulir, tetapi dunia lama tetap utuh.',
    },
    'not-draft': {
      kind: 'error',
      text: 'Dunia ini sudah pernah diterbitkan, jadi tidak dapat disunting lewat wizard.',
    },
    'character-name-invalid': {
      kind: 'error',
      text: 'Nama karakter tidak boleh kosong.',
    },
    'character-no-expression': {
      kind: 'error',
      // Menyebut SYARATNYA, bukan hanya penolakannya: yang paling sering
      // terjadi adalah gambar yang belum selesai diunggah saat Simpan ditekan.
      text:
        'Setiap ekspresi harus punya gambar. Baris yang gambarnya belum diunggah ' +
        'tidak ikut tersimpan — tunggu sampai statusnya "Tersimpan", lalu simpan lagi.',
    },
    'character-duplicate-expression': {
      kind: 'error',
      text:
        'Ada nama ekspresi yang dipakai lebih dari sekali. Dalam satu karakter, ' +
        'setiap ekspresi harus punya nama yang berbeda.',
    },
    'category-name-invalid': {
      kind: 'error',
      text: 'Nama kategori tidak boleh kosong.',
    },
    'category-in-use': {
      kind: 'error',
      // Menyebutkan jalan keluarnya, bukan hanya penolakannya.
      text:
        'Kategori ini masih dipakai latar sebuah lokasi, jadi tidak dihapus — ' +
        'menghapusnya akan memutus gambar di seluruh lokasi sekaligus. Pindahkan ' +
        'latar itu ke kategori lain lebih dulu.',
    },
    'location-name-invalid': {
      kind: 'error',
      text: 'Nama lokasi tidak boleh kosong.',
    },
    'location-no-image': {
      kind: 'error',
      text:
        'Setiap lokasi harus punya gambar latar. Kalau gambarnya baru dipilih, tunggu ' +
        'sampai statusnya "Tersimpan" sebelum menekan Simpan.',
    },
    'location-category-invalid': {
      kind: 'error',
      // Keadaan ini berarti kategori yang dipilih sudah dihapus di tab lain.
      text:
        'Kategori belum dipilih, atau kategorinya sudah dihapus di tab lain. Pilih ' +
        'kategorinya — gambar yang sudah diunggah tidak ikut hilang.',
    },
    'location-in-use': {
      kind: 'error',
      text:
        'Lokasi ini sudah dipungut sebuah dunia, jadi tidak dihapus — menghapusnya ' +
        'akan memutus latar di cerita itu. Hapus latarnya dari dunia tersebut lebih dulu.',
    },
    'provider-name-invalid': {
      kind: 'error',
      text: 'Nama provider tidak boleh kosong.',
    },
    'provider-prefix-invalid': {
      kind: 'error',
      text:
        'Prefix harus diawali huruf atau angka, dan hanya boleh berisi huruf kecil, ' +
        'angka, atau tanda hubung (maksimal 32 karakter).',
    },
    'provider-prefix-taken': {
      kind: 'error',
      text:
        'Prefix itu sudah dipakai provider lain. Dua provider dengan prefix sama ' +
        'membuat id model menjadi ambigu.',
    },
    'provider-api-type-invalid': {
      kind: 'error',
      text: 'Jenis API harus dipilih salah satu dari daftar.',
    },
    'provider-base-url-invalid': {
      kind: 'error',
      text:
        'Base URL harus alamat http:// atau https:// yang lengkap, mis. ' +
        'https://api.openai.com/v1',
    },
    'provider-key-env-invalid': {
      kind: 'error',
      // Menyebut bentuk yang benar, bukan hanya menolak: yang diketik admin di
      // sini adalah NAMA variabel, dan itu mudah tertukar dengan nilainya.
      text:
        'Isi dengan NAMA variabel lingkungannya, bukan kuncinya — huruf besar, angka, ' +
        'dan garis bawah, mis. OPENAI_API_KEY. Kuncinya sendiri tidak pernah disimpan ' +
        'di basis data.',
    },
    'provider-in-use': {
      kind: 'error',
      text:
        'Provider ini masih dipakai model, jadi tidak dihapus — model itu akan ' +
        'kehilangan alamat tujuannya. Pindahkan modelnya ke provider lain lebih dulu.',
    },
    'provider-image-part-invalid': {
      kind: 'error',
      text: 'Bentuk lampiran gambar harus dipilih salah satu dari daftar.',
    },
    'provider-secrets-unavailable': {
      kind: 'error',
      text:
        'Kunci API tidak dapat disimpan: kunci enkripsinya belum terpasang di ' +
        'lingkungan server. Menyimpan tanpa enkripsi sengaja ditolak.',
    },
    'key-cleared': {
      kind: 'ok',
      text: 'Kunci tersimpan dihapus. Isi yang baru bila provider ini ingin dipakai lagi.',
    },
    'model-label-invalid': {
      kind: 'error',
      text: 'Nama model tidak boleh kosong.',
    },
    'model-provider-invalid': {
      kind: 'error',
      text:
        'Provider belum dipilih, atau providernya sudah dihapus di tab lain. ' +
        'Setiap model harus tahu ke alamat mana ia dikirim.',
    },
    'model-key-invalid': {
      kind: 'error',
      text:
        'Nama model di provider harus diawali huruf atau angka, dan hanya boleh berisi ' +
        'huruf, angka, titik, garis bawah, garis miring, atau titik dua.',
    },
  };

  const entry = MAP[raw];
  if (!entry) {
    return null;
  }

  // Perincian opsional, mis. nama ekspresi yang kembar. Nilainya dari query
  // string, jadi ia diperlakukan sebagai teks biasa — `layout()` meng-escape
  // seluruh isi notifikasi.
  const detail = (request.query as { detail?: string } | undefined)?.detail;
  return detail ? { kind: entry.kind, text: `${entry.text} (${detail})` } : entry;
}

function renderLogin(request: FastifyRequest, error: string | null): string {
  const query = request.query as { next?: string; changed?: string } | undefined;
  const next = query?.next ?? '';
  const changed = query?.changed;

  const body = html`<div class="login">
<div class="brand" style="margin-bottom:6px">fayLN <span>admin</span></div>
<p class="sub">Masuk untuk mengelola katalog, akun, dan promosi.</p>
<form method="post" action="/admin/login" class="card">
  <label><span>Nama pengguna</span>
    <input name="username" autocomplete="username" autofocus required>
  </label>
  <label><span>Kata sandi</span>
    <input name="password" type="password" autocomplete="current-password" required>
  </label>
  <input type="hidden" name="next" value="${inputValue(next)}">
  <button type="submit" style="width:100%">Masuk</button>
</form>
${changed ? html`<div class="notice ok">Kata sandi berganti. Silakan masuk lagi.</div>` : ''}
${error ? html`<div class="notice err">${error}</div>` : ''}
</div>`;

  return layout({ title: 'Masuk', body, admin: null });
}

/* ------------------------------------------------------------------ */
/* Pembantu masukan                                                    */
/* ------------------------------------------------------------------ */

/** Formulir HTML mengirim satu nilai sebagai teks, banyak nilai sebagai larik. */
/**
 * URL halaman master dengan notifikasi, beserta perinciannya bila ada.
 *
 * Perincian dipakai untuk menyebut hal yang spesifik — mis. nama ekspresi yang
 * kembar. Tanpa itu, pesannya hanya dapat berkata "ada yang kembar", dan admin
 * harus mencarinya sendiri di antara baris-baris yang ia ketik.
 */
function noticeRedirect(base: string, code: string, detail?: string): string {
  const separator = base.includes('?') ? '&' : '?';
  const extra = detail ? `&detail=${encodeURIComponent(detail)}` : '';
  return `${base}${separator}notice=${code}${extra}`;
}

/** Kode notifikasi untuk tiap sebab penolakan master karakter. */
function characterNotice(reason: CharacterFailure): string {
  switch (reason) {
    case 'invalid-name':
      return 'character-name-invalid';
    case 'no-expressions':
      return 'character-no-expression';
    case 'duplicate-expression':
      return 'character-duplicate-expression';
    case 'not-found':
      return 'not-found';
  }
}

/** Kode notifikasi untuk tiap sebab penolakan master kategori lokasi. */
function categoryNotice(reason: CategoryFailure): string {
  switch (reason) {
    case 'invalid-name':
      return 'category-name-invalid';
    case 'in-use':
      return 'category-in-use';
    case 'not-found':
      return 'not-found';
  }
}

/** Kode notifikasi untuk tiap sebab penolakan master lokasi. */
function locationNotice(reason: LocationFailure): string {
  switch (reason) {
    case 'invalid-name':
      return 'location-name-invalid';
    case 'invalid-category':
      return 'location-category-invalid';
    case 'no-image':
      return 'location-no-image';
    case 'in-use':
      return 'location-in-use';
    case 'not-found':
      return 'not-found';
  }
}

/** Kode notifikasi untuk tiap sebab penolakan provider. */
function providerNotice(reason: ProviderFailure): string {
  switch (reason) {
    case 'invalid-name':
      return 'provider-name-invalid';
    case 'invalid-prefix':
      return 'provider-prefix-invalid';
    case 'duplicate-prefix':
      return 'provider-prefix-taken';
    case 'invalid-api-type':
      return 'provider-api-type-invalid';
    case 'invalid-base-url':
      return 'provider-base-url-invalid';
    case 'invalid-key-env':
      return 'provider-key-env-invalid';
    case 'invalid-image-part':
      return 'provider-image-part-invalid';
    case 'secrets-unavailable':
      return 'provider-secrets-unavailable';
    case 'in-use':
      return 'provider-in-use';
    case 'not-found':
      return 'not-found';
  }
}

/** Kode notifikasi untuk tiap sebab penolakan model. */
function modelNotice(reason: ModelFailure): string {
  switch (reason) {
    case 'invalid-label':
      return 'model-label-invalid';
    case 'invalid-provider':
      return 'model-provider-invalid';
    case 'invalid-model-key':
      return 'model-key-invalid';
    case 'not-found':
      return 'not-found';
  }
}

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/*
 * Tidak ada lagi `isGenre()` di sini.
 *
 * Fungsi itu memeriksa keanggotaan pada daftar tetap yang ditulis di kode.
 * Sejak genre menjadi tabel (migrasi 009), pemeriksaan seperti itu justru
 * MERUSAK: genre yang baru dibuat admin akan ditolak oleh daftar yang basi, dan
 * penolakannya senyap — dunianya tersimpan, genrenya hilang. Penggantinya
 * `ctx.genres.existingIds()`, yang memeriksa ke tabel yang sama dengan yang
 * dipakai formulir untuk menawarkan pilihan.
 *
 * `isLocale` tetap ada: bahasa respons memang daftar tertutup, karena klien
 * harus tahu cara menerjemahkannya dan itu ditentukan saat aplikasi dibangun.
 */

const LOCALE_SET = new Set(['id-ID', 'en-US']);
function isLocale(value: string): value is 'id-ID' | 'en-US' {
  return LOCALE_SET.has(value);
}

/** Mengurai nilai `<input type="datetime-local">` menjadi Date, atau null. */
function parseLocalDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
