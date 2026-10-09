/**
 * Autentikasi pemain.
 *
 * Berkas ini menyediakan panggilan HTTP ke `/v1/auth/*`, ditambah state sesi
 * yang dipakai layar masuk dan pengaturan.
 *
 * Mengapa tidak lewat `StoryGateway`: gateway itu adalah abstraksi CERITA
 * (katalog, perjalanan, giliran), dan pengujiannya menyuntikkan gateway contoh
 * yang tidak menyentuh jaringan. Menambahkan masuk/daftar ke sana akan membuat
 * setiap pengujian cerita harus ikut meniru autentikasi — padahal keduanya tidak
 * berhubungan. Panggilan di sini berdiri sendiri dan hanya menyentuh jaringan
 * ketika benar-benar dipakai.
 */

import { clearToken, readToken, saveToken } from '@/data/http/authSession';
import { apiBaseUrl } from '@/data/http/apiConfig';

export type AuthAccount = {
  accountId: string;
  email: string;
  displayName: string;
  age: number | null;
};

export type AuthResult =
  | { ok: true; account: AuthAccount }
  | { ok: false; reason: AuthFailureReason };

export type AuthFailureReason =
  | 'emailTaken'
  | 'credentials'
  | 'rateLimited'
  | 'emailInvalid'
  | 'passwordShort'
  | 'nameEmpty'
  | 'ageRange'
  | 'network'
  | 'unknown';

type ErrorBody = { code?: string; message?: string };

/** Memetakan kode kesalahan server ke alasan yang dapat ditampilkan. */
function classify(status: number, body: ErrorBody): AuthFailureReason {
  if (status === 409) {
    return 'emailTaken';
  }
  if (status === 401) {
    return 'credentials';
  }
  if (status === 429) {
    return 'rateLimited';
  }
  if (status === 400 || body.code === 'VALIDATION') {
    /*
     * Server tidak memberi tahu kolom mana yang salah untuk semua kasus, jadi
     * pesan diperiksa dari teksnya. Ini rapuh, tetapi hanya memengaruhi pesan
     * mana yang ditampilkan — bukan apakah pendaftaran berhasil.
     */
    const text = (body.message ?? '').toLowerCase();
    if (text.includes('email')) {
      return 'emailInvalid';
    }
    if (text.includes('sandi') || text.includes('password')) {
      return 'passwordShort';
    }
    if (text.includes('nama') || text.includes('name')) {
      return 'nameEmpty';
    }
    if (text.includes('umur') || text.includes('age') || text.includes('usia')) {
      return 'ageRange';
    }
    return 'unknown';
  }
  return 'unknown';
}

async function postJson(
  path: string,
  payload: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const baseUrl = apiBaseUrl();
  if (baseUrl === null) {
    // Mode contoh: tidak ada server. Perlakuan sebagai kegagalan jaringan supaya
    // pesannya jujur.
    return { status: 0, body: {} };
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  return { status: response.status, body };
}

function toAccount(raw: unknown): AuthAccount | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const accountId = typeof value.accountId === 'string' ? value.accountId : null;
  const email = typeof value.email === 'string' ? value.email : null;
  if (!accountId || !email) {
    return null;
  }
  return {
    accountId,
    email,
    displayName: typeof value.displayName === 'string' ? value.displayName : '',
    age: typeof value.age === 'number' ? value.age : null,
  };
}

/** Daftar akun baru. Token yang diterima langsung disimpan. */
export async function register(input: {
  email: string;
  password: string;
  displayName: string;
  age: number | null;
}): Promise<AuthResult> {
  try {
    const { status, body } = await postJson('/v1/auth/register', input);

    if (status === 201 || status === 200) {
      const token = typeof body.token === 'string' ? body.token : null;
      const account = toAccount(body.account);
      if (!token || !account) {
        return { ok: false, reason: 'unknown' };
      }
      await saveToken(token);
      return { ok: true, account };
    }

    return { ok: false, reason: classify(status, body as ErrorBody) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Masuk ke akun yang sudah ada. */
export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  try {
    const { status, body } = await postJson('/v1/auth/login', input);

    if (status === 200) {
      const token = typeof body.token === 'string' ? body.token : null;
      const account = toAccount(body.account);
      if (!token || !account) {
        return { ok: false, reason: 'unknown' };
      }
      await saveToken(token);
      return { ok: true, account };
    }

    return { ok: false, reason: classify(status, body as ErrorBody) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Keluar.
 *
 * Token lokal SELALU dihapus, bahkan bila permintaan ke server gagal. Kalau
 * tidak, pemain yang menekan "Keluar" saat jaringan mati akan tetap masuk — dan
 * itu bertentangan dengan apa yang baru saja ia minta.
 */
export async function logout(): Promise<void> {
  const token = await readToken();
  try {
    if (token) {
      const baseUrl = apiBaseUrl();
      if (baseUrl !== null) {
        await fetch(`${baseUrl}/v1/auth/logout`, {
          method: 'POST',
          headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        });
      }
    }
  } catch {
    // Diabaikan dengan sengaja — lihat catatan di atas.
  } finally {
    await clearToken();
  }
}

/** Akun yang sedang masuk, dibaca dari server. Null bila belum masuk. */
export async function currentAccount(): Promise<AuthAccount | null> {
  const token = await readToken();
  if (!token) {
    return null;
  }

  const baseUrl = apiBaseUrl();
  if (baseUrl === null) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/v1/auth/me`, {
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      // Token kedaluwarsa atau dicabut: bersihkan agar tidak dipakai lagi.
      if (response.status === 401) {
        await clearToken();
      }
      return null;
    }
    const body = (await response.json()) as { account?: unknown };
    return toAccount(body.account);
  } catch {
    return null;
  }
}
