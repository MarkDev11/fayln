/**
 * Akses data akun.
 *
 * Autentikasi belum diputuskan (B-02). Untuk sementara akun disediakan lewat
 * header `x-account-id`, dan bila belum ada, sebuah akun tamu dibuat. Ini
 * SENGAJA belum aman untuk produksi dan ditandai jelas di route.
 */

import type { Database } from '../db/pool';

export class AccountRepository {
  constructor(private readonly db: Database) {}

  async exists(accountId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ account_id: string }>(
      'SELECT account_id FROM accounts WHERE account_id = $1 LIMIT 1',
      [accountId],
    );
    return rows.length > 0;
  }

  /** Membuat akun bila belum ada. Aman dipanggil berulang. */
  async ensure(accountId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO accounts (account_id) VALUES ($1)
       ON CONFLICT (account_id) DO NOTHING`,
      [accountId],
    );
  }
}
