/**
 * Dukungan pengujian identitas pemain.
 *
 * Sejak 9 Oktober 2026 identitas tidak lagi berasal dari header `x-account-id`
 * yang dikirim klien — server membuktikannya lewat token sesi. Pengujian yang
 * dulu memakai header karena itu harus mendaftarkan akun dan memakai tokennya.
 *
 * Berkas ini menyediakan satu jalan untuk itu, supaya setiap harness tidak
 * menulis alur pendaftarannya sendiri (dan supaya mengubah cara identitas
 * diselesaikan nanti hanya menyentuh satu tempat).
 */

import type { FastifyInstance } from 'fastify';

import { AuthRepository } from '../../src/repositories/authRepository';
import { hashPassword } from '../../src/admin/password';

/** Kata sandi bawaan untuk akun pengujian. */
export const TEST_PASSWORD = 'sandi-uji-12345';

/**
 * Membuat akun uji langsung di basis data, tanpa melewati HTTP.
 *
 * Sengaja tidak memakai `POST /v1/auth/register`: beberapa pengujian memang
 * menguji rute itu, dan memakainya di sini akan membuat kegagalannya tampak
 * sebagai kegagalan pengujian lain.
 */
export async function createTestAccount(
  app: FastifyInstance,
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  options: { email?: string; password?: string; displayName?: string; age?: number | null } = {},
): Promise<{ accountId: string; token: string; email: string }> {
  const auth = new AuthRepository(db as never);
  const email = options.email ?? `uji-${Math.random().toString(36).slice(2, 10)}@contoh.test`;
  const password = options.password ?? TEST_PASSWORD;

  const account = await auth.createWithCredentials({
    email,
    passwordHash: await hashPassword(password),
    displayName: options.displayName ?? 'Penguji',
    age: options.age ?? 25,
  });

  const session = await auth.createSession({ accountId: account.accountId, userAgent: 'vitest' });

  // `app` belum dibutuhkan di sini, tetapi parameternya dipertahankan agar
  // pemanggil tidak perlu tahu dari mana akunnya dibuat bila nanti berubah.
  void app;

  return { accountId: account.accountId, token: session.token, email };
}

/** Header `Authorization` untuk sebuah token. */
export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
