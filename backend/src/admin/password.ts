/**
 * Kata sandi admin.
 *
 * Memakai `scrypt` dari `node:crypto` — bukan bcrypt/argon2. Alasannya: tidak
 * menambah dependensi sama sekali, dan scrypt adalah algoritma yang memang
 * dirancang tahan terhadap serangan GPU (berbeda dari PBKDF2 biasa). Untuk satu
 * sampai beberapa akun admin, ini lebih dari cukup.
 *
 * Parameter disimpan DI DALAM nilai hash, sehingga hash lama tetap dapat
 * diverifikasi setelah parameternya dinaikkan. Tanpa itu, menaikkan biaya berarti
 * memaksa semua admin mengganti kata sandi.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * `promisify(scrypt)` tidak dapat memakai tanda tangan dengan pilihan.
 *
 * Versi promisify dari `scrypt` hanya menerima (password, salt, keylen), sehingga
 * memanggilnya dengan objek `{ N, r, p }` akan mengabaikan parameter itu diam-diam
 * dan memakai nilai bawaan Node. Untuk kasus ini nilai bawaannya sama, tetapi
 * mengandalkan kebetulan itu berarti kenaikan biaya di masa depan tidak akan
 * berpengaruh. Karena itu pembungkusnya dibuat eksplisit di bawah.
 */
const scryptAsync = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** N = biaya CPU/memori, r = ukuran blok, p = paralelisasi. */
const DEFAULT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Panjang kata sandi minimum. Rendah sengaja: ini akun admin, bukan pemain. */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordHash = string;

/**
 * Membuat hash dari kata sandi.
 *
 * Bentuk: `scrypt$N$r$p$<salt-base64>$<hash-base64>`
 */
export async function hashPassword(
  password: string,
  params: { N: number; r: number; p: number } = DEFAULT_PARAMS,
): Promise<PasswordHash> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
  })) as Buffer;

  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Memeriksa kata sandi terhadap hash tersimpan.
 *
 * Mengembalikan `false` untuk hash yang bentuknya tidak dikenal, bukan melempar.
 * Alasannya: hash rusak tidak boleh membedakan dirinya dari kata sandi salah —
 * keduanya sama-sama "tidak boleh masuk".
 */
export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) {
    return false;
  }

  try {
    const derived = (await scryptAsync(password, parsed.salt, KEY_LENGTH, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
    })) as Buffer;

    // Panjang harus sama sebelum timingSafeEqual, kalau tidak ia akan melempar.
    if (derived.length !== parsed.hash.length) {
      return false;
    }
    // Perbandingan waktu-tetap: perbandingan biasa membocorkan berapa banyak
    // bit awal yang cocok lewat selisih waktu.
    return timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

type ParsedHash = {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
};

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return null;
  }

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }
  if (N <= 0 || r <= 0 || p <= 0) {
    return null;
  }

  try {
    return {
      N,
      r,
      p,
      salt: Buffer.from(parts[4] ?? '', 'base64'),
      hash: Buffer.from(parts[5] ?? '', 'base64'),
    };
  } catch {
    return null;
  }
}

/**
 * Kebutuhan kata sandi.
 *
 * Sengaja sederhana: panjang minimum saja. Aturan kerumitan (harus ada angka,
 * simbol, huruf besar) terbukti mendorong orang memakai pola yang mudah ditebak.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  }
  if (password.length > 200) {
    return 'Kata sandi terlalu panjang.';
  }
  return null;
}
