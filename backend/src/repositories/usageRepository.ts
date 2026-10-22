/**
 * Akses data kuota dan pemakaian — ekonomi poin harian (docs/17).
 *
 * Keputusan penting (docs/14 bagian 5) yang DIPERTAHANKAN: reset harian
 * dihitung saat dibaca, bukan dijalankan pekerjaan terjadwal. blitz.cloud
 * menidurkan aplikasi setelah 30 menit tanpa pengunjung, jadi cron apa pun
 * akan terlewat. Hari baru = kunci tanggal baru = baris baru.
 *
 * Yang BERUBAH sejak docs/17: mata uangnya poin, bukan token, dan harinya
 * WIB (Asia/Jakarta, UTC+7, tanpa DST), bukan UTC. Tanpa klaim harian,
 * saldo hari itu nol — jatah tidak lagi diberikan otomatis.
 */

import type { Database } from '../db/pool';
import type { ClaimResultDTO, Tier, UsageDTO } from '../contracts/types';

/**
 * Geser milidetik ke waktu WIB.
 *
 * Asia/Jakarta tetap UTC+7 sepanjang tahun (tanpa DST), jadi penjumlahan
 * konstanta cukup — tidak perlu tabel zona waktu. Menggeser lalu membaca
 * tanggal UTC-nya memberi tanggal WIB yang benar untuk semua jam.
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Tanggal WIB dalam bentuk YYYY-MM-DD. */
export function jakartaDateKey(at: Date = new Date()): string {
  return new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Tengah malam WIB berikutnya; dipakai frontend menampilkan waktu reset.
 *
 * 00:00 WIB = 17:00 UTC hari sebelumnya. Dihitung dari awal hari WIB saat
 * ini ditambah satu hari, lalu digeser balik ke UTC.
 */
export function nextJakartaReset(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + WIB_OFFSET_MS);
  const startOfShiftedDay = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(startOfShiftedDay + 24 * 60 * 60 * 1000 - WIB_OFFSET_MS).toISOString();
}

/** Aturan ekonomi poin, dibaca dari konfigurasi server (docs/17 bagian 4.1). */
export type PointRules = {
  dailyPoints: number;
  sceneCost: number;
  streakBonusPoints: number;
  streakCycleDays: number;
};

export type UsageRow = {
  tier: Tier;
  spent: number;
  reserved: number;
};

type DayRow = { tier: string; spent_tokens: string; reserved_tokens: string };
type ClaimRow = { base_points: string; bonus_points: string; streak_day: string };

/** Antarmuka kueri minimal, dipakai baik oleh pool maupun klien transaksi. */
type Queryable = Pick<Database, 'query'>;

export class UsageRepository {
  constructor(
    private readonly db: Database,
    private readonly rules: PointRules,
    /**
     * Pengali kuota promosi dari panel admin (settingsRepository).
     *
     * Port sempit berupa fungsi: repositori ini tidak boleh bergantung pada
     * repositori panel admin. Nilai di bawah 1 sudah dijepit menjadi 1 oleh
     * pemanggilnya. Bawaan 1 supaya pengujian tanpa promosi tidak perlu
     * menyiapkan apa pun.
     */
    private readonly quotaMultiplier: () => Promise<number> = async () => 1,
  ) {}

  /** Biaya poin satu giliran; dipakai layanan perjalanan untuk pra-pemeriksaan. */
  get sceneCost(): number {
    return this.rules.sceneCost;
  }

  /** Membaca pemakaian hari ini; nol bila belum ada pemakaian. */
  async today(accountId: string, at: Date = new Date()): Promise<UsageRow> {
    const row = await this.readDay(this.db, accountId, jakartaDateKey(at));
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
    const dateKey = jakartaDateKey(at);
    const [day, claim, multiplier] = await Promise.all([
      this.readDay(this.db, accountId, dateKey),
      this.readClaim(this.db, accountId, dateKey),
      this.quotaMultiplier(),
    ]);

    const spent = day ? Number.parseInt(day.spent_tokens, 10) : 0;
    const reserved = day ? Number.parseInt(day.reserved_tokens, 10) : 0;
    const awarded = claim
      ? Number.parseInt(claim.base_points, 10) + Number.parseInt(claim.bonus_points, 10)
      : 0;
    const streakDay = claim ? Number.parseInt(claim.streak_day, 10) : 0;

    return {
      tier: day?.tier === 'paid' ? 'paid' : 'free',
      spent,
      reserved,
      /*
       * Sisa dihitung dari POIN YANG BENAR-BENAR DIKLAIM, bukan dari batas
       * paket: tanpa klaim, sisa memang nol (docs/17 bagian 3 butir 1), dan
       * mengubah pengali promosi di tengah hari tidak boleh menambah poin
       * yang sudah diklaim secara retroaktif.
       */
      available: Math.max(0, awarded - spent - reserved),
      allowanceLimit: Math.round(this.rules.dailyPoints * multiplier),
      claimableToday: claim === null,
      streakDay,
      sceneCost: this.rules.sceneCost,
      resetAt: nextJakartaReset(at),
      isEstimate: false,
    };
  }

  /**
   * Klaim poin harian.
   *
   * Satu INSERT; `ON CONFLICT (account_id, claim_date) DO NOTHING` membuat
   * klaim kedua pada hari yang sama menjadi jawaban TANPA hadiah, bukan
   * galat — supaya percobaan ulang dari klien selalu aman. Keunikan hari
   * tetap ditegakkan kunci utama tabel (bukti di tests/schema.test.ts);
   * tanpa kunci itu, `ON CONFLICT` ini sendiri akan ditolak basis data.
   *
   * Streak dibaca saat klaim: klaim kemarin ada → hari ke-n+1; tidak ada → 1.
   * Bonus diberikan pada hari kelipatan siklus (7, 14, …), sehingga siklusnya
   * berulang, bukan sekali selamanya.
   */
  async claim(accountId: string, at: Date = new Date()): Promise<ClaimResultDTO> {
    const dateKey = jakartaDateKey(at);
    const multiplier = await this.quotaMultiplier();
    const base = Math.round(this.rules.dailyPoints * multiplier);

    return this.db.transaction(async (client) => {
      /*
       * Periksa DULU, jangan bersandar pada `rowCount` dari
       * `ON CONFLICT DO NOTHING`: pg-mem melaporkan rowCount 1 walau barisnya
       * tidak bertambah (terukur — klaim kedua sempat memberi 100 poin lagi
       * padahal tabel tetap satu baris). Jawaban tanpa hadiah harus diputuskan
       * dari ISI TABEL, bukan dari jumlah baris yang diklaim penulis SQL.
       * `ON CONFLICT` tetap dipertahankan sebagai jaring pengaman balapan:
       * dua permintaan bersamaan tidak dapat menyisipkan dua baris.
       */
      const sudah = await this.readClaim(client, accountId, dateKey);
      if (sudah) {
        return this.answerWithoutAward(client, accountId, dateKey, sudah, at);
      }

      // Kemarin menurut kalender WIB. Pengurangan 24 jam aman karena baik UTC
      // maupun WIB tidak punya pergeseran jam musiman.
      const yesterdayKey = jakartaDateKey(new Date(at.getTime() - 24 * 60 * 60 * 1000));
      const kemarin = await this.readClaim(client, accountId, yesterdayKey);
      const streakDay = kemarin ? Number.parseInt(kemarin.streak_day, 10) + 1 : 1;
      const bonus =
        streakDay % this.rules.streakCycleDays === 0 ? this.rules.streakBonusPoints : 0;

      const { rowCount } = await client.query(
        `INSERT INTO daily_point_claims (account_id, claim_date, base_points, bonus_points, streak_day)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id, claim_date) DO NOTHING`,
        [accountId, dateKey, base, bonus, streakDay],
      );

      if (rowCount === 0) {
        // Balapan: permintaan lain menyisipkan lebih dulu. Baca hasilnya.
        const pemenang = await this.readClaim(client, accountId, dateKey);
        if (pemenang) {
          return this.answerWithoutAward(client, accountId, dateKey, pemenang, at);
        }
      }

      const day = await this.readDay(client, accountId, dateKey);
      const spent = day ? Number.parseInt(day.spent_tokens, 10) : 0;
      const reserved = day ? Number.parseInt(day.reserved_tokens, 10) : 0;

      return {
        awarded: base,
        bonus,
        streakDay,
        available: Math.max(0, base + bonus - spent - reserved),
        resetAt: nextJakartaReset(at),
      };
    });
  }

  /** Jawaban klaim ulang: tanpa hadiah, dengan keadaan yang berlaku sekarang. */
  private async answerWithoutAward(
    client: Queryable,
    accountId: string,
    dateKey: string,
    claim: ClaimRow,
    at: Date,
  ): Promise<ClaimResultDTO> {
    const day = await this.readDay(client, accountId, dateKey);
    const spent = day ? Number.parseInt(day.spent_tokens, 10) : 0;
    const reserved = day ? Number.parseInt(day.reserved_tokens, 10) : 0;
    const total =
      Number.parseInt(claim.base_points, 10) + Number.parseInt(claim.bonus_points, 10);

    return {
      awarded: 0,
      bonus: 0,
      streakDay: Number.parseInt(claim.streak_day, 10),
      available: Math.max(0, total - spent - reserved),
      resetAt: nextJakartaReset(at),
    };
  }

  /**
   * Menagih poin satu operasi.
   *
   * `usage_entries` memiliki indeks unik pada `operation_id`, jadi penagihan
   * ganda ditolak oleh database — bukan oleh pemeriksaan di aplikasi yang
   * dapat terlewat saat dua permintaan datang bersamaan.
   *
   * PERUBAHAN MAKNA (docs/17 bagian 4.5): `usage_days.spent_tokens` kini
   * berarti POIN yang terpakai (10 per giliran sukses), bukan token. Kolom
   * `prompt_tokens`/`completion_tokens` di `usage_entries` tetap mencatat
   * token mentah untuk analitik biaya — tetapi bukan lagi untuk menagih
   * pemain.
   */
  async charge(input: {
    accountId: string;
    operationId: string;
    entryId: string;
    promptTokens: number;
    completionTokens: number;
    /** Poin yang ditagih; dipanggil dengan SCENE_POINT_COST, bukan estimasi token. */
    chargedTotal: number;
    at?: Date;
  }): Promise<void> {
    const at = input.at ?? new Date();
    const dateKey = jakartaDateKey(at);

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

      // `spent_tokens` = poin terpakai sejak docs/17 (lihat catatan di atas).
      await client.query(
        `UPDATE usage_days
         SET spent_tokens = spent_tokens + $3, updated_at = now()
         WHERE account_id = $1 AND usage_date = $2`,
        [input.accountId, dateKey, input.chargedTotal],
      );
    });
  }

  /** Baris `usage_days` hari terkait, atau null bila belum ada. */
  private async readDay(
    q: Queryable,
    accountId: string,
    dateKey: string,
  ): Promise<DayRow | null> {
    const { rows } = await q.query<DayRow>(
      `SELECT tier, spent_tokens, reserved_tokens
       FROM usage_days WHERE account_id = $1 AND usage_date = $2 LIMIT 1`,
      [accountId, dateKey],
    );
    return rows[0] ?? null;
  }

  /** Baris klaim hari terkait, atau null bila belum diklaim. */
  private async readClaim(
    q: Queryable,
    accountId: string,
    dateKey: string,
  ): Promise<ClaimRow | null> {
    const { rows } = await q.query<ClaimRow>(
      `SELECT base_points, bonus_points, streak_day
       FROM daily_point_claims WHERE account_id = $1 AND claim_date = $2 LIMIT 1`,
      [accountId, dateKey],
    );
    return rows[0] ?? null;
  }
}
