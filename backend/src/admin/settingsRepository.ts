/**
 * Pengaturan aplikasi dan statistik ringkasan.
 *
 * Pengaturan disimpan sebagai baris `app_settings` (key-value JSON) supaya dapat
 * diubah tanpa deploy. Yang penting di sini: kunci yang dikenal didaftarkan
 * eksplisit beserta keterangannya, sehingga panel dapat menampilkan pilihan yang
 * bermakna alih-alih meminta admin mengetik nama kunci dari hafal.
 */

import type { Database } from '../db/pool';

export type KnownSetting = {
  key: string;
  label: string;
  description: string;
  /** Nilai bawaan bila belum pernah disetel. */
  fallback: unknown;
};

/**
 * Pengaturan yang dikenal.
 *
 * Menambah pengaturan baru = menambah satu baris di sini. Halaman admin membaca
 * daftar ini, jadi tidak ada nama kunci yang perlu dihafal.
 */
export const KNOWN_SETTINGS: KnownSetting[] = [
  {
    key: 'engine.simulator',
    label: 'Mesin masih simulator',
    description:
      'true = cerita dihasilkan simulator deterministik. Harus false sebelum dirilis ke pemain.',
    fallback: true,
  },
  {
    key: 'display.token_label',
    label: 'Sebutan satuan di antarmuka',
    description:
      'Kata yang dilihat pemain untuk satuan konsumsi. Satuan internalnya tetap token; ini hanya label.',
    fallback: 'token',
  },
  {
    key: 'display.tokens_per_unit',
    label: 'Token per satu satuan tampilan',
    description:
      'Mis. 1000 berarti antarmuka menampilkan "1" untuk setiap 1.000 token. Atur 1 bila ingin menampilkan token apa adanya.',
    fallback: 1,
  },
  {
    key: 'promo.banner_text',
    label: 'Teks banner promosi',
    description: 'Teks bebas yang ditampilkan di halaman promosi. Kosongkan untuk menyembunyikan.',
    fallback: '',
  },
  {
    key: 'promo.free_tier_multiplier',
    label: 'Pengali kuota Free selama promosi',
    description:
      'Angka desimal. 1 = tanpa perubahan, 2 = kuota Free dua kali lipat. Berlaku saat dibaca, tanpa mengubah baris pemakaian.',
    fallback: 1,
  },
  {
    key: 'promo.paid_tier_multiplier',
    label: 'Pengali kuota Paid selama promosi',
    description: 'Sama seperti pengali Free, tetapi untuk tier Paid.',
    fallback: 1,
  },
  {
    key: 'signup.bonus_tokens',
    label: 'Token bonus pendaftaran',
    description: 'Bonus yang diberikan sekali saat akun baru pertama kali terlihat. 0 = tidak ada.',
    fallback: 0,
  },
];

export type SettingsRow = {
  key: string;
  value: unknown;
  description: string;
  updatedAt: Date | string;
};

export class SettingsRepository {
  constructor(private readonly db: Database) {}

  async listSettings(): Promise<SettingsRow[]> {
    const { rows } = await this.db.query<{
      setting_key: string;
      value: unknown;
      description: string;
      updated_at: Date | string;
    }>('SELECT setting_key, value, description, updated_at FROM app_settings ORDER BY setting_key ASC');

    return rows.map((row) => ({
      key: row.setting_key,
      value: row.value,
      description: row.description,
      updatedAt: row.updated_at,
    }));
  }

  /** Mengembalikan nilai tersimpan, atau nilai bawaan bila belum disetel. */
  async getSetting(key: string): Promise<unknown> {
    const { rows } = await this.db.query<{ value: unknown }>(
      'SELECT value FROM app_settings WHERE setting_key = $1 LIMIT 1',
      [key],
    );
    if (rows.length > 0) {
      return rows[0]?.value;
    }
    return KNOWN_SETTINGS.find((item) => item.key === key)?.fallback ?? null;
  }

  async setSetting(input: {
    key: string;
    value: unknown;
    description: string;
    updatedBy: string;
  }): Promise<void> {
    // `ON CONFLICT` membuat ini aman dipanggil untuk kunci baru maupun lama.
    await this.db.query(
      `INSERT INTO app_settings (setting_key, value, description, updated_at, updated_by)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (setting_key) DO UPDATE
         SET value = $2, description = $3, updated_at = now(), updated_by = $4`,
      [input.key, JSON.stringify(input.value), input.description, input.updatedBy],
    );
  }

  async deleteSetting(key: string): Promise<void> {
    await this.db.query('DELETE FROM app_settings WHERE setting_key = $1', [key]);
  }

  async knownSettings(): Promise<KnownSetting[]> {
    return KNOWN_SETTINGS;
  }

  /* ---------------------------------------------------------------- */
  /* Statistik ringkasan                                               */
  /* ---------------------------------------------------------------- */

  async dashboardStats(): Promise<{
    worlds: number;
    publishedWorlds: number;
    characters: number;
    accounts: number;
    journeys: number;
    activePromotions: number;
  }> {
    // Dihitung sebagai sub-kueri terpisah, bukan satu kueri gabungan: jauh lebih
    // mudah dibaca, dan jumlah barisnya kecil sehingga biayanya tidak berarti.
    const [worlds, published, characters, accounts, journeys, promotions] = await Promise.all([
      this.countQuery('SELECT count(*)::int AS total FROM worlds'),
      this.countQuery(
        `SELECT count(DISTINCT world_id)::int AS total
         FROM world_versions WHERE status = 'published'`,
      ),
      this.countQuery('SELECT count(*)::int AS total FROM world_characters'),
      this.countQuery('SELECT count(*)::int AS total FROM accounts'),
      this.countQuery('SELECT count(*)::int AS total FROM journeys'),
      this.countQuery('SELECT count(*)::int AS total FROM promotions WHERE is_active = true'),
    ]);

    return {
      worlds,
      publishedWorlds: published,
      characters,
      accounts,
      journeys,
      activePromotions: promotions,
    };
  }

  async todayUsage(): Promise<
    { tier: string; accounts: number; spentTokens: string; reservedTokens: string }[]
  > {
    const today = new Date().toISOString().slice(0, 10);
    const { rows } = await this.db.query<{
      tier: string;
      accounts: number;
      spent_tokens: string;
      reserved_tokens: string;
    }>(
      `SELECT tier,
              count(*)::int AS accounts,
              coalesce(sum(spent_tokens), 0)::text AS spent_tokens,
              coalesce(sum(reserved_tokens), 0)::text AS reserved_tokens
       FROM usage_days
       WHERE usage_date = $1
       GROUP BY tier
       ORDER BY tier ASC`,
      [today],
    );

    return rows.map((row) => ({
      tier: row.tier,
      accounts: row.accounts,
      spentTokens: row.spent_tokens,
      reservedTokens: row.reserved_tokens,
    }));
  }

  private async countQuery(sql: string): Promise<number> {
    const { rows } = await this.db.query<{ total: number }>(sql);
    return rows[0]?.total ?? 0;
  }

  /**
   * Pengali kuota yang sedang berlaku.
   *
   * Dibaca saat menghitung sisa, sehingga mengubahnya langsung berpengaruh tanpa
   * menyentuh baris pemakaian pemain. Nilai di bawah 1 diabaikan agar promosi
   * tidak dapat dipakai memotong kuota diam-diam.
   */
  async quotaMultiplier(tier: 'free' | 'paid'): Promise<number> {
    const key = tier === 'free' ? 'promo.free_tier_multiplier' : 'promo.paid_tier_multiplier';
    const raw = await this.getSetting(key);
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value) || value < 1) {
      return 1;
    }
    return value;
  }
}
