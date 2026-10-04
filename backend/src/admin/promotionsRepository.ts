/**
 * Promosi: CRUD dari panel, dan penukaran dari sisi pemain.
 *
 * Keputusan yang membentuk berkas ini:
 *
 * 1. Hadiah promosi adalah TOKEN, bukan mata uang terpisah. Token sejajar dengan
 *    biaya model, sehingga "kuota habis" tetap punya satu arti di seluruh sistem.
 *    Sistem bintang sebagai mata uang akan menuntut pembukuan kedua dan membuat
 *    pemeriksaan anggaran (FR-50) tidak lagi satu perbandingan sederhana.
 *
 * 2. Bonus masuk ke `bonus_balances`, BUKAN `usage_days`. Baris `usage_days`
 *    berkunci (account_id, usage_date) dan hangus tiap tengah malam; menaruh
 *    hadiah di sana berarti pemain kehilangan hadiahnya hanya karena hari
 *    berganti.
 *
 * 3. Penukaran ganda dicegah DATABASE lewat indeks unik parsial
 *    `promotion_redemptions_once_per_account`. Logika aplikasi boleh memeriksa
 *    lebih dulu untuk memberi pesan yang enak dibaca, tetapi pemeriksaan itu
 *    BUKAN pengamannya — dua permintaan bersamaan dapat melewatinya.
 */

import { randomUUID } from 'node:crypto';

import type { Database } from '../db/pool';

export type PromotionRow = {
  promotionId: string;
  code: string;
  label: string;
  bonusTokens: number;
  maxRedemptions: number;
  redemptionCount: number;
  oncePerAccount: boolean;
  tierRequirement: 'any' | 'free' | 'paid';
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  isActive: boolean;
  notes: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  /** Dihitung saat dibaca: apakah promosi sedang berlaku sekarang. */
  isLive: boolean;
};

export type PromotionSaveInput = {
  promotionId: string | null;
  code: string;
  label: string;
  bonusTokens: number;
  maxRedemptions: number;
  oncePerAccount: boolean;
  tierRequirement: 'any' | 'free' | 'paid';
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  notes: string;
};

export type RedemptionResult =
  | { ok: true; tokensGranted: number; newBalance: number }
  | { ok: false; code: string; message: string };

export class PromotionsRepository {
  constructor(private readonly db: Database) {}

  /* ---------------------------------------------------------------- */
  /* Baca                                                              */
  /* ---------------------------------------------------------------- */

  async listPromotions(): Promise<PromotionRow[]> {
    const { rows } = await this.db.query<{
      promotion_id: string;
      code: string;
      label: string;
      bonus_tokens: string;
      max_redemptions: number;
      redemption_count: number;
      once_per_account: boolean;
      tier_requirement: string;
      starts_at: Date | string | null;
      ends_at: Date | string | null;
      is_active: boolean;
      notes: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT promotion_id, code, label, bonus_tokens, max_redemptions, redemption_count,
              once_per_account, tier_requirement, starts_at, ends_at, is_active, notes,
              created_at, updated_at
       FROM promotions ORDER BY created_at DESC`,
    );

    const now = Date.now();
    return rows.map((row) => this.mapRow(row, now));
  }

  async findPromotion(promotionId: string): Promise<PromotionRow | null> {
    const all = await this.listPromotions();
    return all.find((row) => row.promotionId === promotionId) ?? null;
  }

  async listRedemptions(promotionId: string, limit = 100): Promise<
    { accountId: string; tokensGranted: number; createdAt: Date | string }[]
  > {
    const { rows } = await this.db.query<{
      account_id: string;
      tokens_granted: string;
      created_at: Date | string;
    }>(
      `SELECT account_id, tokens_granted, created_at FROM promotion_redemptions
       WHERE promotion_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [promotionId, limit],
    );
    return rows.map((row) => ({
      accountId: row.account_id,
      tokensGranted: Number.parseInt(row.tokens_granted, 10),
      createdAt: row.created_at,
    }));
  }

  /* ---------------------------------------------------------------- */
  /* Tulis                                                             */
  /* ---------------------------------------------------------------- */

  async savePromotion(input: PromotionSaveInput): Promise<{ promotionId: string }> {
    const promotionId = input.promotionId ?? `promo_${randomUUID()}`;

    await this.db.query(
      `INSERT INTO promotions (
         promotion_id, code, label, bonus_tokens, max_redemptions, once_per_account,
         tier_requirement, starts_at, ends_at, is_active, notes, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (promotion_id) DO UPDATE SET
         code = $2, label = $3, bonus_tokens = $4, max_redemptions = $5,
         once_per_account = $6, tier_requirement = $7, starts_at = $8, ends_at = $9,
         is_active = $10, notes = $11, updated_at = now()`,
      [
        promotionId,
        input.code,
        input.label,
        input.bonusTokens,
        input.maxRedemptions,
        input.oncePerAccount,
        input.tierRequirement,
        input.startsAt,
        input.endsAt,
        input.isActive,
        input.notes,
      ],
    );

    return { promotionId };
  }

  /**
   * Menghapus promosi.
   *
   * Riwayat penukaran ikut terhapus lewat kias-asing. Itu disengaja: promosi
   * yang salah dibuat tidak boleh meninggalkan baris penukaran yang menunjuk
   * ke dirinya yang sudah tidak ada.
   */
  async deletePromotion(promotionId: string): Promise<void> {
    await this.db.query('DELETE FROM promotions WHERE promotion_id = $1', [promotionId]);
  }

  /* ---------------------------------------------------------------- */
  /* Penukaran (dipanggil sisi pemain)                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Menukar kode promosi untuk sebuah akun.
   *
   * Urutan pemeriksaan disusun dari yang paling murah ke paling mahal, tetapi
   * pengaman sesungguhnya ada di database: bila penukaran ganda lolos dari
   * pemeriksaan aplikasi (dua permintaan bersamaan), indeks unik parsial akan
   * menolaknya dan galat itu diterjemahkan menjadi pesan "sudah pernah ditukar".
   */
  async redeem(input: { code: string; accountId: string; tier: 'free' | 'paid' }): Promise<RedemptionResult> {
    const code = input.code.trim();
    if (code.length === 0) {
      return { ok: false, code: 'EMPTY_CODE', message: 'Kode promosi kosong.' };
    }

    const { rows } = await this.db.query<{
      promotion_id: string;
      code: string;
      bonus_tokens: string;
      max_redemptions: number;
      redemption_count: number;
      once_per_account: boolean;
      tier_requirement: string;
      starts_at: Date | string | null;
      ends_at: Date | string | null;
      is_active: boolean;
    }>(
      `SELECT promotion_id, code, bonus_tokens, max_redemptions, redemption_count,
              once_per_account, tier_requirement, starts_at, ends_at, is_active
       FROM promotions WHERE upper(code) = upper($1) LIMIT 1`,
      [code],
    );

    const promo = rows[0];
    if (!promo) {
      return { ok: false, code: 'NOT_FOUND', message: 'Kode promosi tidak dikenal.' };
    }
    if (!promo.is_active) {
      return { ok: false, code: 'INACTIVE', message: 'Promosi ini sudah tidak berlaku.' };
    }

    const now = Date.now();
    if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
      return { ok: false, code: 'NOT_STARTED', message: 'Promosi ini belum dimulai.' };
    }
    if (promo.ends_at && new Date(promo.ends_at).getTime() < now) {
      return { ok: false, code: 'EXPIRED', message: 'Promosi ini sudah berakhir.' };
    }
    if (promo.max_redemptions > 0 && promo.redemption_count >= promo.max_redemptions) {
      return { ok: false, code: 'EXHAUSTED', message: 'Kuota promosi ini sudah habis.' };
    }
    if (promo.tier_requirement !== 'any' && promo.tier_requirement !== input.tier) {
      return {
        ok: false,
        code: 'TIER_MISMATCH',
        message: `Promosi ini hanya untuk pengguna ${promo.tier_requirement}.`,
      };
    }

    const tokensGranted = Number.parseInt(promo.bonus_tokens, 10);

    // Pemeriksaan ramah sebelum menabrak indeks unik: memberi pesan yang jelas
    // tanpa memicu galat database. Ini BUKAN pengamannya.
    if (promo.once_per_account) {
      const { rows: existing } = await this.db.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM promotion_redemptions
         WHERE promotion_id = $1 AND account_id = $2`,
        [promo.promotion_id, input.accountId],
      );
      if ((existing[0]?.total ?? 0) > 0) {
        return { ok: false, code: 'ALREADY_REDEEMED', message: 'Kamu sudah pernah menukar kode ini.' };
      }
    }

    try {
      return await this.db.transaction(async (client) => {
        await client.query(
          `INSERT INTO promotion_redemptions
             (redemption_id, promotion_id, account_id, tokens_granted, uniqueness_guard)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            `red_${randomUUID()}`,
            promo.promotion_id,
            input.accountId,
            tokensGranted,
            // NULL berarti "tidak dibatasi", sehingga indeks parsial mengabaikan
            // baris ini dan penukaran berulang tetap mungkin.
            promo.once_per_account ? input.accountId : null,
          ],
        );

        await client.query(
          `UPDATE promotions SET redemption_count = redemption_count + 1, updated_at = now()
           WHERE promotion_id = $1`,
          [promo.promotion_id],
        );

        await client.query(
          `INSERT INTO bonus_balances (account_id, balance_tokens, lifetime_granted, lifetime_used)
           VALUES ($1, $2, $2, 0)
           ON CONFLICT (account_id) DO UPDATE SET
             balance_tokens = bonus_balances.balance_tokens + $2,
             lifetime_granted = bonus_balances.lifetime_granted + $2,
             updated_at = now()`,
          [input.accountId, tokensGranted],
        );

        const { rows: balanceRows } = await client.query<{ balance_tokens: string }>(
          'SELECT balance_tokens FROM bonus_balances WHERE account_id = $1 LIMIT 1',
          [input.accountId],
        );

        return {
          ok: true as const,
          tokensGranted,
          newBalance: Number.parseInt(balanceRows[0]?.balance_tokens ?? '0', 10),
        };
      });
    } catch (error) {
      // Kode 23505 = pelanggaran keunikan. Itu berarti indeks parsial bekerja:
      // permintaan bersamaan yang lolos pemeriksaan di atas berhasil ditolak.
      if (isUniqueViolation(error)) {
        return { ok: false, code: 'ALREADY_REDEEMED', message: 'Kamu sudah pernah menukar kode ini.' };
      }
      throw error;
    }
  }

  /** Saldo bonus yang dimiliki akun. Dibaca jalur pemain saat menghitung sisa. */
  async bonusBalance(accountId: string): Promise<number> {
    const { rows } = await this.db.query<{ balance_tokens: string }>(
      'SELECT balance_tokens FROM bonus_balances WHERE account_id = $1 LIMIT 1',
      [accountId],
    );
    return Number.parseInt(rows[0]?.balance_tokens ?? '0', 10);
  }

  private mapRow(
    row: {
      promotion_id: string;
      code: string;
      label: string;
      bonus_tokens: string;
      max_redemptions: number;
      redemption_count: number;
      once_per_account: boolean;
      tier_requirement: string;
      starts_at: Date | string | null;
      ends_at: Date | string | null;
      is_active: boolean;
      notes: string;
      created_at: Date | string;
      updated_at: Date | string;
    },
    now: number,
  ): PromotionRow {
    const startsOk = !row.starts_at || new Date(row.starts_at).getTime() <= now;
    const endsOk = !row.ends_at || new Date(row.ends_at).getTime() >= now;
    const quotaOk = row.max_redemptions === 0 || row.redemption_count < row.max_redemptions;

    return {
      promotionId: row.promotion_id,
      code: row.code,
      label: row.label,
      bonusTokens: Number.parseInt(row.bonus_tokens, 10),
      maxRedemptions: row.max_redemptions,
      redemptionCount: row.redemption_count,
      oncePerAccount: row.once_per_account,
      tierRequirement: row.tier_requirement as PromotionRow['tierRequirement'],
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      isActive: row.is_active,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isLive: row.is_active && startsOk && endsOk && quotaOk,
    };
  }
}

/** Pelanggaran keunikan PostgreSQL. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
