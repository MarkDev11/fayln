/**
 * Akun pemain dan sesinya.
 *
 * Menggantikan identitas lewat header `x-account-id`, yang tidak membuktikan
 * apa pun: server hanya mempercayai klaim klien, sehingga siapa pun dapat membaca
 * perjalanan akun lain dengan mengetik id-nya. Terbukti terhadap produksi
 * 9 Oktober 2026.
 *
 * Pola di sini SENGAJA mengikuti `adminRepository.ts`, karena masalahnya sama
 * dan penyelesaiannya sudah terbukti:
 * - kata sandi di-hash scrypt (lihat `src/admin/password.ts`), bukan disimpan;
 * - token sesi dikirim mentah ke perangkat, hanya hash SHA-256-nya disimpan;
 * - masa berlaku disimpan sebagai kolom, bukan disimpulkan dari waktu dibuat.
 *
 * Yang TIDAK diikuti dari panel admin: peran. Pemain tidak punya peran, dan
 * menambahkannya sekarang berarti menebak kebutuhan yang belum ada.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Database } from '../db/pool';

/**
 * Masa berlaku sesi pemain: 30 hari.
 *
 * Jauh lebih panjang daripada sesi admin (12 jam) karena sifatnya berbeda.
 * Panel admin mengubah katalog dan sebaiknya tidak dibiarkan terbuka; pemain
 * membuka aplikasi untuk melanjutkan cerita, dan memaksa masuk ulang setiap
 * beberapa jam akan membuat orang berhenti membaca.
 */
export const PLAYER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type PlayerAccount = {
  accountId: string;
  email: string;
  displayName: string;
  age: number | null;
};

type AccountRow = {
  account_id: string;
  email: string | null;
  display_name: string | null;
  age: number | null;
};

/**
 * Hash token sesi.
 *
 * Token mentah tidak pernah disimpan. Kalau tabel `player_sessions` bocor, isinya
 * tidak dapat dipakai untuk membajak sesi siapa pun.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Token acak kriptografis. 32 byte = 256 bit, jauh di luar jangkauan tebakan. */
function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export class AuthRepository {
  constructor(private readonly db: Database) {}

  /**
   * Mencari akun berdasarkan email.
   *
   * Mengembalikan hash kata sandi juga, karena pemanggilnya (rute login) memang
   * perlu memverifikasinya. Fungsi ini tidak boleh dipakai untuk menampilkan
   * data akun — gunakan `findById` untuk itu.
   */
  async findByEmail(
    email: string,
  ): Promise<{ accountId: string; passwordHash: string; displayName: string; age: number | null } | null> {
    const { rows } = await this.db.query<AccountRow & { password_hash: string | null }>(
      `SELECT account_id, email, password_hash, display_name, age
       FROM accounts
       WHERE lower(email) = lower($1) AND password_hash IS NOT NULL
       LIMIT 1`,
      [email],
    );

    const row = rows[0];
    if (!row || !row.password_hash) {
      return null;
    }

    return {
      accountId: row.account_id,
      passwordHash: row.password_hash,
      displayName: row.display_name ?? '',
      age: row.age,
    };
  }

  /** Membuat akun pemain berkredensial. Melempar bila email sudah dipakai. */
  async createWithCredentials(input: {
    email: string;
    passwordHash: string;
    displayName: string;
    age: number | null;
  }): Promise<PlayerAccount> {
    const accountId = `acc_${randomUUID()}`;

    await this.db.query(
      `INSERT INTO accounts (account_id, email, password_hash, display_name, age)
       VALUES ($1, $2, $3, $4, $5)`,
      [accountId, input.email, input.passwordHash, input.displayName, input.age],
    );

    return {
      accountId,
      email: input.email,
      displayName: input.displayName,
      age: input.age,
    };
  }

  async updateLastLogin(accountId: string): Promise<void> {
    await this.db.query('UPDATE accounts SET last_login_at = now(), updated_at = now() WHERE account_id = $1', [
      accountId,
    ]);
  }

  /** Membuat sesi baru; mengembalikan token MENTAH yang dikirim ke perangkat. */
  async createSession(input: {
    accountId: string;
    userAgent: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + PLAYER_SESSION_TTL_MS);

    await this.db.query(
      `INSERT INTO player_sessions (session_hash, account_id, expires_at, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [hashSessionToken(token), input.accountId, expiresAt, input.userAgent],
    );

    return { token, expiresAt };
  }

  /**
   * Menyelesaikan token menjadi akun.
   *
   * Mengembalikan `null` untuk token yang tidak dikenal MAUPUN yang kedaluwarsa —
   * pemanggil tidak perlu membedakannya, dan membedakannya hanya akan memberi
   * tahu penyerang apakah sebuah token pernah ada.
   */
  async resolveSession(token: string): Promise<PlayerAccount | null> {
    const { rows } = await this.db.query<AccountRow & { expires_at: Date | string }>(
      `SELECT a.account_id, a.email, a.display_name, a.age, s.expires_at
       FROM player_sessions s
       JOIN accounts a ON a.account_id = s.account_id
       WHERE s.session_hash = $1
       LIMIT 1`,
      [hashSessionToken(token)],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }

    return {
      accountId: row.account_id,
      email: row.email ?? '',
      displayName: row.display_name ?? '',
      age: row.age,
    };
  }

  /** Memperbarui `last_seen_at`. Kegagalannya tidak boleh menggagalkan permintaan. */
  async touchSession(token: string): Promise<void> {
    await this.db.query('UPDATE player_sessions SET last_seen_at = now() WHERE session_hash = $1', [
      hashSessionToken(token),
    ]);
  }

  /** Keluar: mencabut satu sesi. Idempoten. */
  async deleteSession(token: string): Promise<void> {
    await this.db.query('DELETE FROM player_sessions WHERE session_hash = $1', [hashSessionToken(token)]);
  }

  /**
   * Membuang sesi yang sudah kedaluwarsa.
   *
   * Tanpa ini tabelnya tumbuh selamanya. Dipanggil saat masuk, bukan lewat
   * penjadwal — jumlahnya kecil dan pembersihannya murah.
   */
  async deleteExpiredSessions(): Promise<void> {
    await this.db.query('DELETE FROM player_sessions WHERE expires_at <= now()');
  }
}
