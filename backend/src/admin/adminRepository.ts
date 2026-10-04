/**
 * Akses data panel admin: akun, sesi, dan catatan audit.
 *
 * Semua ID dibuat di kode dengan `randomUUID()` (ADR-B05/B09), tidak diturunkan
 * dari nomor urut apa pun.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { Database } from '../db/pool';
import { hashPassword, verifyPassword } from './password';

/** Umur sesi. Setelah ini, admin harus masuk lagi. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

export type AdminUser = {
  adminId: string;
  username: string;
  displayName: string;
  role: 'owner' | 'editor' | 'support';
  isActive: boolean;
  createdAt: Date | string;
  lastLoginAt: Date | string | null;
};

export type AdminSession = {
  adminId: string;
  username: string;
  displayName: string;
  role: 'owner' | 'editor' | 'support';
  expiresAt: Date;
};

/**
 * Token sesi di-hash sebelum disimpan.
 *
 * Yang dikirim ke peramban adalah token mentah; yang ada di database hanya
 * SHA-256-nya. Jadi bila isi tabel bocor, sesi yang sedang berjalan tidak dapat
 * dibajak. SHA-256 tanpa salt dipakai dengan sadar: token sudah acak 32 byte,
 * sehingga tidak ada yang perlu dipecahkan lewat kamus.
 */
function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AdminRepository {
  constructor(private readonly db: Database) {}

  /* ---------------------------------------------------------------- */
  /* Akun                                                              */
  /* ---------------------------------------------------------------- */

  async countAdmins(): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM admin_users',
    );
    return rows[0]?.total ?? 0;
  }

  async listAdmins(): Promise<AdminUser[]> {
    const { rows } = await this.db.query<{
      admin_id: string;
      username: string;
      display_name: string;
      role: string;
      is_active: boolean;
      created_at: Date | string;
      last_login_at: Date | string | null;
    }>(
      `SELECT admin_id, username, display_name, role, is_active, created_at, last_login_at
       FROM admin_users ORDER BY created_at ASC`,
    );

    return rows.map((row) => ({
      adminId: row.admin_id,
      username: row.username,
      displayName: row.display_name,
      role: row.role as AdminUser['role'],
      isActive: row.is_active,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    }));
  }

  async findAdminByUsername(username: string): Promise<
    (AdminUser & { passwordHash: string }) | null
  > {
    // Dibandingkan tanpa memandang besar-kecil huruf, mengikuti indeks uniknya.
    const { rows } = await this.db.query<{
      admin_id: string;
      username: string;
      password_hash: string;
      display_name: string;
      role: string;
      is_active: boolean;
      created_at: Date | string;
      last_login_at: Date | string | null;
    }>(
      `SELECT admin_id, username, password_hash, display_name, role, is_active,
              created_at, last_login_at
       FROM admin_users WHERE lower(username) = lower($1) LIMIT 1`,
      [username],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      adminId: row.admin_id,
      username: row.username,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      role: row.role as AdminUser['role'],
      isActive: row.is_active,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };
  }

  async createAdmin(input: {
    username: string;
    password: string;
    displayName: string;
    role: AdminUser['role'];
  }): Promise<AdminUser> {
    const adminId = `adm_${randomUUID()}`;
    const passwordHash = await hashPassword(input.password);

    await this.db.query(
      `INSERT INTO admin_users (admin_id, username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminId, input.username, passwordHash, input.displayName, input.role],
    );

    return {
      adminId,
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      isActive: true,
      createdAt: new Date(),
      lastLoginAt: null,
    };
  }

  /** Mengembalikan false bila tidak ada perubahan, mis. kata sandi lama salah. */
  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const { rows } = await this.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM admin_users WHERE admin_id = $1 LIMIT 1',
      [adminId],
    );
    const stored = rows[0]?.password_hash;
    if (!stored) {
      return false;
    }

    if (!(await verifyPassword(currentPassword, stored))) {
      return false;
    }

    await this.db.query(
      'UPDATE admin_users SET password_hash = $2, updated_at = now() WHERE admin_id = $1',
      [adminId, await hashPassword(newPassword)],
    );
    // Sesi lain dicabut: kata sandi berganti berarti sesi lama tidak lagi sah.
    await this.deleteSessionsForAdmin(adminId);
    return true;
  }

  async setAdminActive(adminId: string, isActive: boolean): Promise<void> {
    await this.db.query(
      'UPDATE admin_users SET is_active = $2, updated_at = now() WHERE admin_id = $1',
      [adminId, isActive],
    );
    if (!isActive) {
      await this.deleteSessionsForAdmin(adminId);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sesi                                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Membuat sesi baru dan mengembalikan token MENTAH.
   *
   * Token hanya ada di sini dan di cookie peramban — tidak pernah disimpan.
   */
  async createSession(input: {
    adminId: string;
    userAgent: string;
    ipAddress: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytesToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.db.query(
      `INSERT INTO admin_sessions
         (session_hash, admin_id, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [hashSessionToken(token), input.adminId, expiresAt, input.userAgent, input.ipAddress],
    );

    await this.db.query('UPDATE admin_users SET last_login_at = now() WHERE admin_id = $1', [
      input.adminId,
    ]);

    return { token, expiresAt };
  }

  /** Mengembalikan sesi yang sah, atau null bila token tidak ada/kedaluwarsa. */
  async findSession(token: string): Promise<AdminSession | null> {
    const { rows } = await this.db.query<{
      admin_id: string;
      username: string;
      display_name: string;
      role: string;
      expires_at: Date | string;
      is_active: boolean;
    }>(
      `SELECT s.admin_id, u.username, u.display_name, u.role, s.expires_at, u.is_active
       FROM admin_sessions s
       JOIN admin_users u ON u.admin_id = s.admin_id
       WHERE s.session_hash = $1 LIMIT 1`,
      [hashSessionToken(token)],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      // Bersihkan baris yang sudah mati saat ditemukan — tidak perlu pekerjaan
      // terjadwal untuk itu (docs/14 bagian 5).
      await this.deleteSession(token);
      return null;
    }

    // Akun yang dinonaktifkan tidak boleh tetap masuk lewat sesi lama.
    if (!row.is_active) {
      await this.deleteSessionsForAdmin(row.admin_id);
      return null;
    }

    await this.db.query(
      'UPDATE admin_sessions SET last_seen_at = now() WHERE session_hash = $1',
      [hashSessionToken(token)],
    );

    return {
      adminId: row.admin_id,
      username: row.username,
      displayName: row.display_name,
      role: row.role as AdminSession['role'],
      expiresAt,
    };
  }

  async deleteSession(token: string): Promise<void> {
    await this.db.query('DELETE FROM admin_sessions WHERE session_hash = $1', [
      hashSessionToken(token),
    ]);
  }

  async deleteSessionsForAdmin(adminId: string): Promise<void> {
    await this.db.query('DELETE FROM admin_sessions WHERE admin_id = $1', [adminId]);
  }

  /* ---------------------------------------------------------------- */
  /* Audit                                                             */
  /* ---------------------------------------------------------------- */

  async recordAudit(input: {
    adminId: string | null;
    username: string;
    action: string;
    targetKind?: string;
    targetId?: string;
    detail?: unknown;
    ipAddress?: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO admin_audit_log
         (entry_id, admin_id, username, action, target_kind, target_id, detail, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `aud_${randomUUID()}`,
        input.adminId,
        input.username,
        input.action,
        input.targetKind ?? '',
        input.targetId ?? '',
        // `pg` mengubah objek menjadi JSON secara otomatis untuk kolom jsonb.
        input.detail === undefined ? null : JSON.stringify(input.detail),
        input.ipAddress ?? '',
      ],
    );
  }

  /**
   * Catatan audit terbaru, dengan saringan opsional.
   *
   * Saringan dibangun sebagai kondisi SQL yang digabung, BUKAN dengan menarik
   * seluruh baris lalu menyaringnya di JavaScript. Log audit tumbuh tanpa batas;
   * menyaring di memori berarti membaca semuanya untuk menampilkan lima puluh
   * baris. Nilai kosong berarti "jangan disaring", sehingga pemanggil tidak
   * perlu memilih antara dua fungsi.
   */
  async listAudit(
    limit = 100,
    filter: { username?: string; action?: string } = {},
  ): Promise<
    { action: string; username: string; targetKind: string; targetId: string; createdAt: Date | string }[]
  > {
    const values: unknown[] = [limit];
    const conditions: string[] = [];

    if (filter.username) {
      values.push(filter.username);
      conditions.push(`username = $${values.length}`);
    }
    if (filter.action) {
      values.push(filter.action);
      conditions.push(`action = $${values.length}`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await this.db.query<{
      action: string;
      username: string;
      target_kind: string;
      target_id: string;
      created_at: Date | string;
    }>(
      `SELECT action, username, target_kind, target_id, created_at
       FROM admin_audit_log${where} ORDER BY created_at DESC LIMIT $1`,
      values,
    );

    return rows.map((row) => ({
      action: row.action,
      username: row.username,
      targetKind: row.target_kind,
      targetId: row.target_id,
      createdAt: row.created_at,
    }));
  }

  /**
   * Nilai yang tersedia untuk saringan audit.
   *
   * Diambil dari basis data, bukan dari daftar yang ditulis di kode: daftar
   * aksi bertambah setiap ada tindakan baru, dan daftar yang ditulis tangan
   * akan tertinggal diam-diam.
   */
  async auditFacets(): Promise<{ usernames: string[]; actions: string[] }> {
    const [usernames, actions] = await Promise.all([
      this.distinctValues('SELECT DISTINCT username AS value FROM admin_audit_log ORDER BY value ASC'),
      this.distinctValues('SELECT DISTINCT action AS value FROM admin_audit_log ORDER BY value ASC'),
    ]);
    return { usernames, actions };
  }

  private async distinctValues(sql: string): Promise<string[]> {
    const { rows } = await this.db.query<{ value: string }>(sql);
    return rows.map((row) => row.value).filter((value) => typeof value === 'string' && value !== '');
  }
}

/** Token acak 32 byte dalam bentuk base64url — aman dipakai di cookie. */
function randomBytesToken(): string {
  // randomBytes dari node:crypto, bukan Math.random: token ini adalah satu-satunya
  // hal yang memisahkan peramban seseorang dari seluruh panel admin.
  return randomBytes(32).toString('base64url');
}
