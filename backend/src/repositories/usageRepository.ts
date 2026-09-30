/**
 * Akses data kuota dan pemakaian.
 *
 * Keputusan penting (docs/14 bagian 5): reset harian DIHITUNG SAAT DIBACA, bukan
 * dijalankan oleh pekerjaan terjadwal. blitz.cloud menidurkan aplikasi setelah
 * dua jam tanpa pengunjung, jadi cron apa pun akan terlewat. Karena kunci baris
 * memuat tanggal UTC, hari baru berarti baris baru — dan baris baru berarti
 * pemakaian mulai dari nol tanpa perlu ada yang berjalan tengah malam.
 */

import type { Database } from '../db/pool';
import type { Tier, UsageDTO } from '../contracts/types';

/** Tanggal UTC dalam bentuk YYYY-MM-DD. */
export function utcDateKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** Awal hari UTC berikutnya; dipakai frontend untuk menampilkan waktu reset. */
export function nextUtcReset(at: Date = new Date()): string {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1, 0, 0, 0, 0),
  ).toISOString();
}

export type PlanLimits = {
  free: { dailyTokens: number; contextTokens: number };
  paid: { dailyTokens: number; contextTokens: number };
};

export type UsageRow = {
  tier: Tier;
  spent: number;
  reserved: number;
};

export class UsageRepository {
  constructor(
    private readonly db: Database,
    private readonly limits: PlanLimits,
  ) {}

  /** Membaca pemakaian hari ini; nol bila belum ada pemakaian. */
  async today(accountId: string, at: Date = new Date()): Promise<UsageRow> {
    const { rows } = await this.db.query<{ tier: string; spent_tokens: string; reserved_tokens: string }>(
      `SELECT tier, spent_tokens, reserved_tokens
       FROM usage_days WHERE account_id = $1 AND usage_date = $2 LIMIT 1`,
      [accountId, utcDateKey(at)],
    );

    const row = rows[0];
    if (!row) {
      return { tier: 'free', spent: 0, reserved: 0 };
    }

    return {
      tier: row.tier === 'paid' ? 'paid' : 'free',
      spent: Number.parseInt(row.spent_tokens, 10),
      reserved: Number.parseInt(row.reserved_tokens, 10),
    };
  }

  async usage(accountId: string, at: Date = new Date()): Promise<UsageDTO> {
    const row = await this.today(accountId, at);
    const limit = this.limits[row.tier].dailyTokens;

    return {
      tier: row.tier,
      spent: row.spent,
      reserved: row.reserved,
      available: Math.max(0, limit - row.spent - row.reserved),
      allowanceLimit: limit,
      resetAt: nextUtcReset(at),
      isEstimate: false,
    };
  }

  /**
   * Menagih pemakaian satu operasi.
   *
   * `usage_entries` memiliki indeks unik pada `operation_id`, jadi penagihan
   * ganda ditolak oleh database — bukan oleh pemeriksaan di aplikasi yang dapat
   * terlewat saat dua permintaan datang bersamaan.
   */
  async charge(input: {
    accountId: string;
    operationId: string;
    entryId: string;
    promptTokens: number;
    completionTokens: number;
    chargedTotal: number;
    at?: Date;
  }): Promise<void> {
    const at = input.at ?? new Date();
    const dateKey = utcDateKey(at);

    await this.db.transaction(async (client) => {
      // Pastikan baris hari ini ada sebelum menautkan entri ke sana.
      await client.query(
        `INSERT INTO usage_days (account_id, usage_date, tier, spent_tokens, reserved_tokens)
         VALUES ($1, $2, 'free', 0, 0)
         ON CONFLICT (account_id, usage_date) DO NOTHING`,
        [input.accountId, dateKey],
      );

      await client.query(
        `INSERT INTO usage_entries (
           entry_id, account_id, usage_date, operation_id,
           prompt_tokens, completion_tokens, charged_total
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.entryId,
          input.accountId,
          dateKey,
          input.operationId,
          input.promptTokens,
          input.completionTokens,
          input.chargedTotal,
        ],
      );

      await client.query(
        `UPDATE usage_days
         SET spent_tokens = spent_tokens + $3, updated_at = now()
         WHERE account_id = $1 AND usage_date = $2`,
        [input.accountId, dateKey, input.chargedTotal],
      );
    });
  }

  /** Batas konteks untuk paket yang sedang aktif. */
  contextWindowFor(tier: Tier): number {
    return this.limits[tier].contextTokens;
  }
}
