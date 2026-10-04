/**
 * Manajemen akun pemain dari panel admin.
 *
 * Yang dapat dilakukan di sini: mencari akun, melihat pemakaian dan perjalanannya,
 * serta menyesuaikan kuota (tier, tambahan token, pemulihan saldo bonus).
 *
 * Yang SENGAJA TIDAK ada: menghapus akun dari panel. Penghapusan akun menghapus
 * perjalanan dan riwayat beat lewat kias-asing `ON DELETE CASCADE`, dan itu
 * operasi yang tidak dapat dibatalkan dari antarmuka. Menonaktifkan pemakaian
 * (mengosongkan kuota) sudah cukup untuk kasus penyalahgunaan.
 */

import type { Database } from '../db/pool';
import { utcDateKey } from '../repositories/usageRepository';

export type AccountAdminRow = {
  accountId: string;
  displayName: string | null;
  age: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  tier: string;
  spentToday: number;
  reservedToday: number;
  journeyCount: number;
  bonusBalance: number;
  bonusLifetimeGranted: number;
  bonusLifetimeUsed: number;
  hasBonusRow: boolean;
};

export type AccountDetail = AccountAdminRow & {
  usageHistory: { usageDate: string; tier: string; spentTokens: number; reservedTokens: number }[];
  journeys: {
    journeyId: string;
    worldId: string;
    worldVersion: number;
    personaName: string;
    decisionCount: number;
    createdAt: Date | string;
    updatedAt: Date | string;
  }[];
  redemptions: { code: string; tokensGranted: number; createdAt: Date | string }[];
  recentEntries: {
    usageDate: string;
    chargedTotal: number;
    promptTokens: number;
    completionTokens: number;
    createdAt: Date | string;
  }[];
};

export class AccountsAdminRepository {
  constructor(private readonly db: Database) {}

  /**
   * Daftar akun dengan pencarian sederhana.
   *
   * Pencarian mencocokkan ID, nama tampilan, atau perjalanannya. Memakai
   * `ILIKE` supaya pencarian sebagian huruf pun menemukan hasil — panel ini
   * dipakai untuk menjawab "akun siapa ini", bukan untuk kueri presisi.
   *
   * Jumlah perjalanan dihitung lewat kueri terpisah, BUKAN sub-kueri berkorelasi
   * di dalam SELECT: mesin database in-memory yang dipakai pengujian tidak
   * menyelesaikan alias tabel induk di dalam sub-kueri, sehingga bentuk itu
   * tampak gagal di pengujian padahal sah di PostgreSQL.
   */
  async listAccounts(input: { search: string; limit?: number }): Promise<AccountAdminRow[]> {
    const limit = input.limit ?? 100;
    const search = input.search.trim();
    const today = utcDateKey();

    const { rows } = await this.db.query<{
      account_id: string;
      display_name: string | null;
      age: number | null;
      created_at: Date | string;
      updated_at: Date | string;
      tier: string | null;
      spent_tokens: string | null;
      reserved_tokens: string | null;
      bonus_balance: string | null;
      lifetime_granted: string | null;
      lifetime_used: string | null;
    }>(
      `SELECT a.account_id, a.display_name, a.age, a.created_at, a.updated_at,
              ud.tier, ud.spent_tokens, ud.reserved_tokens,
              bb.balance_tokens AS bonus_balance,
              bb.lifetime_granted, bb.lifetime_used
       FROM accounts a
       LEFT JOIN usage_days ud
         ON ud.account_id = a.account_id AND ud.usage_date = $1
       LEFT JOIN bonus_balances bb ON bb.account_id = a.account_id
       WHERE $2 = ''
          OR lower(a.account_id) LIKE lower($3)
          OR lower(coalesce(a.display_name, '')) LIKE lower($3)
       ORDER BY a.created_at DESC
       LIMIT $4`,
      [today, search, `%${search}%`, limit],
    );

    const journeyCounts = await this.countJourneysByAccount();

    return rows.map((row) => ({
      ...this.mapRow({ ...row, journey_count: journeyCounts.get(row.account_id) ?? 0 }),
    }));
  }

  async findAccount(accountId: string): Promise<AccountDetail | null> {
    const today = utcDateKey();
    const { rows } = await this.db.query<{
      account_id: string;
      display_name: string | null;
      age: number | null;
      created_at: Date | string;
      updated_at: Date | string;
      tier: string | null;
      spent_tokens: string | null;
      reserved_tokens: string | null;
      bonus_balance: string | null;
      lifetime_granted: string | null;
      lifetime_used: string | null;
    }>(
      `SELECT a.account_id, a.display_name, a.age, a.created_at, a.updated_at,
              ud.tier, ud.spent_tokens, ud.reserved_tokens,
              bb.balance_tokens AS bonus_balance,
              bb.lifetime_granted, bb.lifetime_used
       FROM accounts a
       LEFT JOIN usage_days ud ON ud.account_id = a.account_id AND ud.usage_date = $1
       LEFT JOIN bonus_balances bb ON bb.account_id = a.account_id
       WHERE a.account_id = $2 LIMIT 1`,
      [today, accountId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const journeyCounts = await this.countJourneysByAccount();
    const base = this.mapRow({ ...row, journey_count: journeyCounts.get(row.account_id) ?? 0 });

    // Kueri rincian dijalankan berurutan, bukan bersamaan: `pg` memakai satu
    // koneksi per kueri, dan empat kueri serentak pada satu akun tidak
    // mempercepat apa pun secara berarti.
    const usageHistory = await this.db.query<{
      usage_date: string;
      tier: string;
      spent_tokens: string;
      reserved_tokens: string;
    }>(
      `SELECT usage_date, tier, spent_tokens, reserved_tokens FROM usage_days
       WHERE account_id = $1 ORDER BY usage_date DESC LIMIT 30`,
      [accountId],
    );

    const journeys = await this.db.query<{
      journey_id: string;
      world_id: string;
      world_version: number;
      persona_name: string;
      decision_count: number;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT journey_id, world_id, world_version, persona_name, decision_count, created_at, updated_at
       FROM journeys WHERE account_id = $1 ORDER BY updated_at DESC LIMIT 50`,
      [accountId],
    );

    const redemptions = await this.db.query<{
      code: string;
      tokens_granted: string;
      created_at: Date | string;
    }>(
      `SELECT p.code, r.tokens_granted, r.created_at
       FROM promotion_redemptions r
       JOIN promotions p ON p.promotion_id = r.promotion_id
       WHERE r.account_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
      [accountId],
    );

    const entries = await this.db.query<{
      usage_date: string;
      charged_total: string;
      prompt_tokens: number;
      completion_tokens: number;
      created_at: Date | string;
    }>(
      `SELECT usage_date, charged_total, prompt_tokens, completion_tokens, created_at
       FROM usage_entries WHERE account_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [accountId],
    );

    return {
      ...base,
      usageHistory: usageHistory.rows.map((r) => ({
        usageDate: r.usage_date,
        tier: r.tier,
        spentTokens: Number.parseInt(r.spent_tokens, 10),
        reservedTokens: Number.parseInt(r.reserved_tokens, 10),
      })),
      journeys: journeys.rows.map((r) => ({
        journeyId: r.journey_id,
        worldId: r.world_id,
        worldVersion: r.world_version,
        personaName: r.persona_name,
        decisionCount: r.decision_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      redemptions: redemptions.rows.map((r) => ({
        code: r.code,
        tokensGranted: Number.parseInt(r.tokens_granted, 10),
        createdAt: r.created_at,
      })),
      recentEntries: entries.rows.map((r) => ({
        usageDate: r.usage_date,
        chargedTotal: Number.parseInt(r.charged_total, 10),
        promptTokens: r.prompt_tokens,
        completionTokens: r.completion_tokens,
        createdAt: r.created_at,
      })),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Tindakan                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Mengubah tier akun untuk hari ini.
   *
   * Hanya berlaku pada baris hari ini, bukan menyeluruh: `usage_days` berkunci
   * per tanggal, dan tier adalah keadaan harian dalam model ini. Menjadikan
   * seseorang Paid permanen adalah keputusan yang belum diambil (B-01/B-02),
   * jadi panel tidak boleh berpura-pura sudah bisa.
   */
  async setTierForToday(accountId: string, tier: 'free' | 'paid'): Promise<void> {
    const today = utcDateKey();
    await this.db.query(
      `INSERT INTO usage_days (account_id, usage_date, tier, spent_tokens, reserved_tokens)
       VALUES ($1, $2, $3, 0, 0)
       ON CONFLICT (account_id, usage_date) DO UPDATE SET tier = $3, updated_at = now()`,
      [accountId, today, tier],
    );
  }

  /**
   * Mengosongkan pemakaian hari ini.
   *
   * Dipakai untuk pemulihan setelah gangguan layanan: pemakaian nol berarti
   * pemain mendapat kembali kuota hariannya. Entri buku besar TIDAK dihapus —
   * jejak penagihan tetap ada, hanya hitungan hariannya yang direset. Tanpa
   * pemisahan ini, penghapusan entri akan membuat indeks unik per operasi
   * menolak penagihan ulang yang sah.
   */
  async resetTodayUsage(accountId: string): Promise<void> {
    const today = utcDateKey();
    await this.db.query(
      `UPDATE usage_days SET spent_tokens = 0, reserved_tokens = 0, updated_at = now()
       WHERE account_id = $1 AND usage_date = $2`,
      [accountId, today],
    );
  }

  /**
   * Menambah (atau mengurangi) saldo bonus.
   *
   * `lifetime_granted` hanya naik untuk penambahan, dan `balance_tokens` tidak
   * pernah boleh negatif — penyesuaian negatif dijepit di nol, bukan ditolak,
   * supaya admin tidak perlu menghitung sendiri berapa sisa saldonya.
   */
  async adjustBonus(input: {
    accountId: string;
    delta: number;
    reason: string;
  }): Promise<{ newBalance: number }> {
    return this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO bonus_balances (account_id, balance_tokens, lifetime_granted, lifetime_used)
         VALUES ($1, 0, 0, 0)
         ON CONFLICT (account_id) DO NOTHING`,
        [input.accountId],
      );

      const { rows } = await client.query<{ balance_tokens: string }>(
        'SELECT balance_tokens FROM bonus_balances WHERE account_id = $1 LIMIT 1',
        [input.accountId],
      );
      const current = Number.parseInt(rows[0]?.balance_tokens ?? '0', 10);
      const next = Math.max(0, current + input.delta);
      const grantedDelta = Math.max(0, input.delta);

      await client.query(
        `UPDATE bonus_balances
         SET balance_tokens = $2,
             lifetime_granted = lifetime_granted + $3,
             updated_at = now()
         WHERE account_id = $1`,
        [input.accountId, next, grantedDelta],
      );

      return { newBalance: next };
    });
  }

  /* ---------------------------------------------------------------- */

  /**
   * Menghitung perjalanan per akun dalam satu kueri.
   *
   * Hasilnya dipetakan di memori, bukan diambil per akun: daftar akun dibatasi
   * 100 baris, dan 100 kueri terpisah untuk angka yang dapat dihitung sekali
   * adalah pemborosan yang tidak perlu.
   */
  private async countJourneysByAccount(): Promise<Map<string, number>> {
    const { rows } = await this.db.query<{ account_id: string; total: number }>(
      'SELECT account_id, count(*)::int AS total FROM journeys GROUP BY account_id',
    );

    const result = new Map<string, number>();
    for (const row of rows) {
      result.set(row.account_id, row.total);
    }
    return result;
  }

  private mapRow(row: {
    account_id: string;
    display_name: string | null;
    age: number | null;
    created_at: Date | string;
    updated_at: Date | string;
    tier: string | null;
    spent_tokens: string | null;
    reserved_tokens: string | null;
    journey_count: number;
    bonus_balance: string | null;
    lifetime_granted: string | null;
    lifetime_used: string | null;
  }): AccountAdminRow {
    return {
      accountId: row.account_id,
      displayName: row.display_name,
      age: row.age,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tier: row.tier ?? 'free',
      spentToday: Number.parseInt(row.spent_tokens ?? '0', 10),
      reservedToday: Number.parseInt(row.reserved_tokens ?? '0', 10),
      journeyCount: row.journey_count,
      bonusBalance: Number.parseInt(row.bonus_balance ?? '0', 10),
      bonusLifetimeGranted: Number.parseInt(row.lifetime_granted ?? '0', 10),
      bonusLifetimeUsed: Number.parseInt(row.lifetime_used ?? '0', 10),
      hasBonusRow: row.bonus_balance !== null,
    };
  }
}
