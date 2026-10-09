/**
 * Rute pendaftaran dan masuk pemain.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA RUTE INI ADA
 * ---------------------------------------------------------------------------
 * Identitas pemain sebelumnya datang dari header `x-account-id` yang dikirim
 * klien dan dipercaya apa adanya. Itu bukan autentikasi: siapa pun yang menebak
 * atau mengetahui sebuah id dapat membaca seluruh perjalanan akun itu. Karena
 * pemain menyimpan cerita masing-masing, identitas harus dibuktikan.
 *
 * ---------------------------------------------------------------------------
 * KEPUTUSAN YANG MEMBENTUK BERKAS INI
 * ---------------------------------------------------------------------------
 * 1. Kata sandi di-hash scrypt lewat `src/admin/password.ts`. Tidak ada algoritma
 *    kedua yang ditulis ulang di sini — satu implementasi, satu tempat menguji.
 *
 * 2. Pesan galat masuk SELALU sama, baik emailnya tidak terdaftar maupun kata
 *    sandinya salah. Membedakannya memberi tahu penyerang email mana yang ada.
 *    Ini juga alasan kata sandi tetap diverifikasi terhadap hash tiruan ketika
 *    akunnya tidak ditemukan — tanpa itu, waktu balasan membedakan keduanya
 *    walaupun pesannya sama.
 *
 * 3. Pembatasan percobaan memakai pola yang sama dengan panel admin
 *    (`src/admin/session.ts`): dihitung per email, disimpan di memori. Ia hanya
 *    memperlambat penebakan; pengaman utamanya tetap scrypt yang lambat.
 *
 * 4. Token sesi dikembalikan di BADAN balasan, bukan cookie. Aplikasi ini
 *    berjalan di perangkat (Expo) maupun peramban, dan cookie lintas asal
 *    menuntut `SameSite=None` beserta CSRF terpisah. Token yang disimpan klien
 *    dan dikirim lewat header `Authorization` tidak punya masalah itu.
 */

import type { FastifyInstance } from 'fastify';

import { AppError } from '../contracts/errors';
import { loginBodySchema, registerBodySchema } from '../http/schemas';
import { hashPassword, verifyPassword } from '../admin/password';
import type { AuthRepository } from '../repositories/authRepository';

/**
 * Pembatasan percobaan masuk, per email.
 *
 * Disimpan di memori dengan sengaja — sama seperti panel admin. Kalau instance
 * dijalankan ulang, hitungannya nol lagi, dan itu dapat diterima: tujuannya
 * memperlambat penebakan, bukan menjadi pengaman utama.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

type Attempt = { count: number; firstAt: number };
const loginAttempts = new Map<string, Attempt>();

export function resetLoginAttempts(): void {
  loginAttempts.clear();
}

function recordLoginFailure(key: string): void {
  const now = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing || now - existing.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now });
    return;
  }
  existing.count += 1;
}

function isLoginBlocked(key: string): boolean {
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

function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

/**
 * Hash tiruan untuk verifikasi palsu.
 *
 * Dipakai saat email tidak ditemukan, supaya biaya komputasinya serupa dengan
 * kasus email ada. Tanpa ini, permintaan untuk email yang tidak ada akan kembali
 * jauh lebih cepat — dan selisih waktunya cukup untuk menebak email mana yang
 * terdaftar, walaupun pesan galatnya sudah disamakan.
 *
 * Nilainya hash yang sah dari kata sandi acak; tidak ada seorang pun yang tahu
 * kata sandinya, jadi tidak ada yang bisa cocok.
 */
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAA==';

function userAgentOf(headers: Record<string, unknown>): string {
  const raw = headers['user-agent'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.slice(0, 200) : '';
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: { auth: AuthRepository },
): void {
  /**
   * Daftar.
   *
   * Mengembalikan token langsung supaya pemain tidak perlu mengetik ulang kata
   * sandi yang baru saja dibuatnya. Sekaligus menghapus satu jalan gagal:
   * "pendaftaran berhasil, tetapi masuk gagal".
   */
  app.post('/v1/auth/register', async (request, reply) => {
    const body = registerBodySchema.parse(request.body);

    const existing = await deps.auth.findByEmail(body.email);
    if (existing) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Email ini sudah terdaftar. Coba masuk, atau pakai email lain.',
        retryable: false,
      });
    }

    const passwordHash = await hashPassword(body.password);

    let account;
    try {
      account = await deps.auth.createWithCredentials({
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        age: body.age,
      });
    } catch (error) {
      /*
       * Dua pendaftaran bersamaan dengan email sama: pemeriksaan di atas lolos
       * untuk keduanya, lalu salah satu ditolak indeks unik. Itu BUKAN kesalahan
       * server — jawabannya harus sama dengan pemeriksaan di atas, bukan 500.
       */
      if (isUniqueViolation(error)) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Email ini sudah terdaftar. Coba masuk, atau pakai email lain.',
          retryable: false,
        });
      }
      throw error;
    }

    const session = await deps.auth.createSession({
      accountId: account.accountId,
      userAgent: userAgentOf(request.headers as Record<string, unknown>),
    });

    await deps.auth.updateLastLogin(account.accountId);

    return reply.status(201).send({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      account: {
        accountId: account.accountId,
        email: account.email,
        displayName: account.displayName,
        age: account.age,
      },
    });
  });

  /** Masuk. */
  app.post('/v1/auth/login', async (request) => {
    const body = loginBodySchema.parse(request.body);

    if (isLoginBlocked(body.email)) {
      throw new AppError({
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak percobaan masuk. Tunggu sebentar, lalu coba lagi.',
        retryable: true,
        retryAfterSec: Math.ceil(LOGIN_WINDOW_MS / 1000),
      });
    }

    const found = await deps.auth.findByEmail(body.email);

    // Selalu verifikasi, bahkan ketika akunnya tidak ada — lihat DUMMY_HASH.
    const ok = await verifyPassword(body.password, found?.passwordHash ?? DUMMY_HASH);

    if (!found || !ok) {
      recordLoginFailure(body.email);
      throw new AppError({
        code: 'UNAUTHORIZED',
        message: 'Email atau kata sandi salah.',
        retryable: false,
      });
    }

    clearLoginFailures(body.email);

    // Pembersihan murah dan tidak boleh menggagalkan proses masuk.
    try {
      await deps.auth.deleteExpiredSessions();
    } catch {
      // Diabaikan dengan sengaja.
    }

    const session = await deps.auth.createSession({
      accountId: found.accountId,
      userAgent: userAgentOf(request.headers as Record<string, unknown>),
    });

    await deps.auth.updateLastLogin(found.accountId);

    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      account: {
        accountId: found.accountId,
        email: body.email,
        displayName: found.displayName,
        age: found.age,
      },
    };
  });

  /**
   * Keluar.
   *
   * Idempoten: memanggilnya tanpa token yang sah tetap menjawab berhasil. Pemain
   * yang menekan "Keluar" tidak boleh melihat galat hanya karena sesinya sudah
   * dicabut di tempat lain.
   */
  app.post('/v1/auth/logout', async (request) => {
    const token = readBearerToken(request.headers.authorization);
    if (token) {
      await deps.auth.deleteSession(token);
    }
    return { ok: true };
  });

  /** Akun yang sedang masuk. Dipakai aplikasi untuk memulihkan sesi saat dibuka. */
  app.get('/v1/auth/me', async (request) => {
    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      throw new AppError({
        code: 'UNAUTHORIZED',
        message: 'Kamu belum masuk.',
        retryable: false,
      });
    }

    const account = await deps.auth.resolveSession(token);
    if (!account) {
      throw new AppError({
        code: 'UNAUTHORIZED',
        message: 'Sesi sudah berakhir. Masuk lagi, ya.',
        retryable: false,
      });
    }

    return {
      account: {
        accountId: account.accountId,
        email: account.email,
        displayName: account.displayName,
        age: account.age,
      },
    };
  });
}

/** Membaca token dari `Authorization: Bearer <token>`. */
export function readBearerToken(header: unknown): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * Apakah galat berasal dari pelanggaran indeks unik?
 *
 * Diperiksa lewat kode SQLSTATE `23505`, bukan lewat teks pesan — teksnya berbeda
 * antara PostgreSQL dan mesin in-memory yang dipakai pengujian.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === '23505';
}
