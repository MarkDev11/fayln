/**
 * Sesi admin: cookie, hook perlindungan, dan pembatasan percobaan masuk.
 *
 * Keputusan yang membentuk berkas ini:
 * - Cookie `HttpOnly` supaya JavaScript di halaman tidak dapat membacanya.
 * - `SameSite=Strict` supaya permintaan dari situs lain tidak ikut membawa sesi
 *   (pertahanan CSRF tanpa token terpisah; cukup karena panel ini tidak pernah
 *   dipanggil lintas situs).
 * - `Secure` hanya di produksi, kalau tidak panel tidak dapat dipakai di
 *   localhost lewat http.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AdminRepository, type AdminSession } from './adminRepository';

export const SESSION_COOKIE = 'fayln_admin_session';

/** Jalan keluar panel. Dipakai hook untuk membebaskan halaman masuk. */
const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/logout']);

/**
 * Pembatas percobaan masuk.
 *
 * Disimpan di memori dengan sengaja: kalau instance dijalankan ulang, hitungannya
 * nol lagi. Itu dapat diterima — pembatas ini hanya memperlambat penebakan kata
 * sandi, bukan pengaman utama (pengaman utamanya scrypt yang lambat).
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

type Attempt = { count: number; firstAt: number };
const loginAttempts = new Map<string, Attempt>();

export function resetLoginAttempts(): void {
  loginAttempts.clear();
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing || now - existing.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now });
    return;
  }
  existing.count += 1;
}

export function isLoginBlocked(key: string): boolean {
  const now = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing) {
    return false;
  }
  if (now - existing.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return existing.count >= LOGIN_MAX_ATTEMPTS;
}

/** Berapa detik lagi sebelum percobaan berikutnya diizinkan. */
export function loginBlockedForSec(key: string): number {
  const existing = loginAttempts.get(key);
  if (!existing) {
    return 0;
  }
  const remaining = existing.firstAt + LOGIN_WINDOW_MS - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/* ---------------------------------------------------------------- */
/* Cookie                                                            */
/* ---------------------------------------------------------------- */

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  isProduction: boolean,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/admin',
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, isProduction: boolean): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/admin',
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
  });
}

export function readSessionToken(request: FastifyRequest): string | null {
  const value = request.cookies?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/* ---------------------------------------------------------------- */
/* Dekorasi permintaan                                              */
/* ---------------------------------------------------------------- */

declare module 'fastify' {
  interface FastifyRequest {
    /** Diisi hook autentikasi untuk jalur /admin yang terlindungi. */
    adminSession?: AdminSession;
  }
}

/**
 * Memasang hook yang melindungi seluruh `/admin/*` kecuali halaman masuk.
 *
 * Perlindungan diletakkan di satu tempat ini, bukan di setiap route. Alasannya
 * sama dengan pemeriksaan kepemilikan perjalanan: satu route yang lupa diperiksa
 * sudah cukup untuk membuka seluruh panel.
 */
export function registerAdminAuthHook(
  app: FastifyInstance,
  admins: AdminRepository,
  isProduction: boolean,
): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/admin')) {
      return;
    }

    // Halaman masuk dan keluar harus dapat diakses tanpa sesi — kalau tidak,
    // tidak ada cara masuk sama sekali.
    const path = request.url.split('?')[0] ?? '';
    if (PUBLIC_ADMIN_PATHS.has(path)) {
      return;
    }

    const token = readSessionToken(request);
    if (!token) {
      return redirectToLogin(request, reply);
    }

    const session = await admins.findSession(token);
    if (!session) {
      clearSessionCookie(reply, isProduction);
      return redirectToLogin(request, reply);
    }

    request.adminSession = session;
  });
}

/**
 * Mengalihkan ke halaman masuk.
 *
 * Untuk permintaan yang mengharapkan HTML, kirim 302 supaya peramban menampilkan
 * halaman masuk. Untuk yang mengharapkan JSON (mis. form yang dikirim lewat
 * fetch), kirim 401 supaya penanganannya jelas di sisi klien.
 */
function redirectToLogin(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const wantsJson = (request.headers.accept ?? '').includes('application/json');
  if (wantsJson) {
    return reply.status(401).send({
      code: 'UNAUTHORIZED',
      message: 'Sesi tidak ada atau sudah berakhir.',
      retryable: false,
    });
  }

  const next = encodeURIComponent(request.url);
  return reply.redirect(`/admin/login?next=${next}`, 302);
}
