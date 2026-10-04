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
import { charactersForm, charactersList, worldsForm, worldsList } from './pages/catalogPages';
import { auditList, dashboard, settingsList } from './pages/dashboardPages';
import { modelForm, modelsList } from './pages/modelPages';
import { promotionForm, promotionsList } from './pages/promotionPages';
import type { SafeHtml } from './html';
import { esc, html, inputValue, layout, safe } from './html';
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
  charactersForm: (ctx: AdminPageContext, worldId: string | null, npcId: string | null) => Promise<SafeHtml>;
  accountsList: (ctx: AdminPageContext, query: { search: string }) => Promise<SafeHtml>;
  accountDetail: (ctx: AdminPageContext, accountId: string) => Promise<SafeHtml>;
  modelsList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  modelForm: (ctx: AdminPageContext, modelId: string | null) => Promise<SafeHtml>;
  promotionsList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  promotionForm: (ctx: AdminPageContext, promotionId: string | null) => Promise<SafeHtml>;
  settingsList: (ctx: AdminPageContext) => Promise<SafeHtml>;
  auditList: (ctx: AdminPageContext) => Promise<SafeHtml>;
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
  promotionsList,
  promotionForm,
  settingsList,
  auditList,
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

const worldBody = z.object({
  worldId: z.string().optional().default(''),
  title: z.string().trim().min(1).max(120),
  synopsis: z.string().trim().min(1).max(240),
  premise: z.string().trim().min(1).max(2000),
  coverAssetId: z.string().trim().min(1).max(120),
  status: z.enum(['draft', 'published']),
  contentRating: z.enum(['all', '13_plus', '18_plus']),
  genres: z.union([z.string(), z.array(z.string())]).optional(),
  locales: z.union([z.string(), z.array(z.string())]).optional(),
});

const characterBody = z.object({
  worldId: z.string().trim().min(1).max(120),
  npcId: z.string().optional().default(''),
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().min(1).max(80),
  publicBackstory: z.string().trim().min(1).max(1200),
  initialRelation: z.enum([
    'normal',
    'hangat',
    'waspada',
    'tegang',
    'renggang',
    'dekat',
    'sayang',
    'cinta',
  ]),
  defaultPortraitAssetId: z.string().trim().min(1).max(120),
  traits: z.string().optional(),
  expressions: z.string().optional(),
});

const modelBody = z.object({
  modelId: z.string().optional().default(''),
  label: z.string().trim().min(1).max(120),
  provider: z.string().trim().max(60).optional().default(''),
  estimatedTurnCost: z.coerce.number().int().positive(),
  contextTokens: z.coerce.number().int().positive(),
  position: z.coerce.number().int().min(0),
  tier: z.enum(['free', 'paid']),
  notes: z.string().trim().max(240).optional().default(''),
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
  const { admins, isProduction } = deps;
  const pages: AdminPages = DEFAULT_PAGES;
  const ctx = deps.pages;

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

  app.get('/admin/worlds', async (request, reply) =>
    send(reply, request, 'Dunia', await pages.worldsList(ctx), 'worlds'),
  );

  app.get<{ Params: { worldId: string } }>('/admin/worlds/:worldId', async (request, reply) =>
    send(reply, request, 'Ubah dunia', await pages.worldsForm(ctx, request.params.worldId), 'worlds'),
  );

  app.get('/admin/worlds-new', async (request, reply) =>
    send(reply, request, 'Dunia baru', await pages.worldsForm(ctx, null), 'worlds'),
  );

  app.get('/admin/characters', async (request, reply) =>
    send(reply, request, 'Karakter', await pages.charactersList(ctx), 'characters'),
  );

  app.get<{ Querystring: { world?: string; npc?: string } }>(
    '/admin/characters-form',
    async (request, reply) =>
      send(
        reply,
        request,
        'Karakter',
        await pages.charactersForm(ctx, request.query.world ?? null, request.query.npc ?? null),
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

  app.get('/admin/models', async (request, reply) =>
    send(reply, request, 'Model', await pages.modelsList(ctx), 'models'),
  );

  app.get<{ Querystring: { model?: string } }>('/admin/models-form', async (request, reply) =>
    send(reply, request, 'Model', await pages.modelForm(ctx, request.query.model ?? null), 'models'),
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

  app.get('/admin/audit', async (request, reply) =>
    send(reply, request, 'Audit', await pages.auditList(ctx), 'audit'),
  );

  /* ---------------------------------------------------------------- */
  /* Perubahan: dunia                                                  */
  /* ---------------------------------------------------------------- */

  app.post('/admin/worlds', async (request, reply) => {
    const session = request.adminSession;
    const parsed = worldBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/worlds-new?notice=invalid-input', 302);
    }

    const genres = toArray(parsed.data.genres).filter(isGenre);
    const locales = toArray(parsed.data.locales).filter(isLocale);
    if (genres.length === 0 || locales.length === 0) {
      return reply.redirect('/admin/worlds-new?notice=invalid-input', 302);
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

  app.post('/admin/characters', async (request, reply) => {
    const session = request.adminSession;
    const parsed = characterBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect('/admin/characters?notice=invalid-input', 302);
    }

    const result = await ctx.catalog.saveCharacter({
      worldId: parsed.data.worldId,
      npcId: parsed.data.npcId || null,
      name: parsed.data.name,
      role: parsed.data.role,
      publicBackstory: parsed.data.publicBackstory,
      initialRelation: parsed.data.initialRelation,
      defaultPortraitAssetId: parsed.data.defaultPortraitAssetId,
      traits: toLines(parsed.data.traits),
      expressions: toLines(parsed.data.expressions),
    });

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: parsed.data.npcId ? 'character.update' : 'character.create',
      targetKind: 'character',
      targetId: `${parsed.data.worldId}/${result.npcId}`,
      detail: { worldVersion: result.worldVersion, name: parsed.data.name },
      ipAddress: request.ip,
    });

    return reply.redirect(
      `/admin/characters-form?world=${encodeURIComponent(parsed.data.worldId)}&npc=${encodeURIComponent(result.npcId)}&notice=${
        result.worldVersion > 1 ? 'saved' : 'created'
      }`,
      302,
    );
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

    const { modelId } = await ctx.models.saveModel({
      modelId: parsed.data.modelId || null,
      label: parsed.data.label,
      provider: parsed.data.provider,
      estimatedTurnCost: parsed.data.estimatedTurnCost,
      contextTokens: parsed.data.contextTokens,
      position: parsed.data.position,
      tier: parsed.data.tier,
      isActive: parsed.data.isActive !== undefined,
      notes: parsed.data.notes,
    });

    await admins.recordAudit({
      adminId: session?.adminId ?? null,
      username: session?.username ?? '',
      action: parsed.data.modelId ? 'model.update' : 'model.create',
      targetKind: 'model',
      targetId: modelId,
      ipAddress: request.ip,
    });

    return reply.redirect('/admin/models?notice=saved', 302);
  });

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
      return reply.redirect('/admin/settings?notice=invalid-input', 302);
    }

    const existing = await admins.findAdminByUsername(body.data.username);
    if (existing) {
      return reply.redirect('/admin/settings?notice=conflict', 302);
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

    return reply.redirect('/admin/settings?notice=created', 302);
  });

  app.post('/admin/admins/toggle', async (request, reply) => {
    const session = request.adminSession;
    if (session?.role !== 'owner') {
      return reply.redirect('/admin/settings?notice=invalid-input', 302);
    }

    const body = z
      .object({ adminId: z.string().trim().min(1), isActive: z.enum(['true', 'false']) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.redirect('/admin/settings?notice=invalid-input', 302);
    }

    // Mengunci diri sendiri akan mengakhiri sesi ini juga; tolak supaya tidak
    // ada admin yang terkunci dari panelnya sendiri.
    if (body.data.adminId === session.adminId && body.data.isActive === 'false') {
      return reply.redirect('/admin/settings?notice=conflict', 302);
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

    return reply.redirect('/admin/settings?notice=saved', 302);
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
  };
  return MAP[raw] ?? null;
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
function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

const GENRE_SET = new Set(['romance', 'drama', 'office', 'fantasy', 'mystery']);
function isGenre(value: string): value is 'romance' | 'drama' | 'office' | 'fantasy' | 'mystery' {
  return GENRE_SET.has(value);
}

const LOCALE_SET = new Set(['id-ID', 'en-US']);
function isLocale(value: string): value is 'id-ID' | 'en-US' {
  return LOCALE_SET.has(value);
}

/** Memecah textarea menjadi baris tak kosong. */
function toLines(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Mengurai nilai `<input type="datetime-local">` menjadi Date, atau null. */
function parseLocalDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
