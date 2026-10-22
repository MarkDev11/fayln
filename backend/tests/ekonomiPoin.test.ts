/**
 * Penjaga ekonomi poin harian (docs/17).
 *
 * Semua uji di berkas ini memakai JAM TERINJEKSI. Tanpa itu, uji streak hanya
 * hijau pada jam tertentu dan merah pada jam lain — kelas kegagalan yang paling
 * mahal karena tampak seperti kerusakan acak.
 *
 * Aturan proyek: setiap penjaga wajib punya bukti mutasi (mekanisme dirusak →
 * uji MERAH → dipulihkan → HIJAU). Bukti itu ditulis di komentar tiap uji.
 */

import { describe, expect, it } from 'vitest';

import { parseConfig } from '../src/config';
import { UsageRepository, jakartaDateKey, nextJakartaReset } from '../src/repositories/usageRepository';
import { createTestDatabase, type TestDatabase } from './helpers/testDb';

const config = parseConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused',
  PORT: '8080',
  LOG_LEVEL: 'error',
  RUN_MIGRATIONS_ON_START: 'false',
  RATE_LIMIT_MAX: '1000',
} as NodeJS.ProcessEnv);

/** Jam WIB tertentu pada tanggal tertentu; WIB = UTC+7. */
function wib(hari: number, jam: number, menit = 0): Date {
  // 2026-10-01 00:00 WIB = 2026-09-30T17:00:00Z
  return new Date(Date.UTC(2026, 8, 30, 17 + jam, menit, 0, 0) + (hari - 1) * 86_400_000);
}

async function siapkan(): Promise<{ ctx: TestDatabase; usage: UsageRepository; akun: string }> {
  const ctx = await createTestDatabase();
  const akun = `a_${Math.random().toString(36).slice(2, 8)}`;
  await ctx.db.query(
    `INSERT INTO accounts (account_id, email, password_hash) VALUES ($1, $2, 'x')`,
    [akun, `${akun}@contoh.test`],
  );
  return { ctx, usage: new UsageRepository(ctx.db, config.points), akun };
}

describe('kunci tanggal WIB', () => {
  it('23:59 dan 00:01 WIB adalah DUA hari berbeda', () => {
    const sebelumTengahMalam = new Date('2026-10-20T16:59:00Z'); // 23:59 WIB, 20 Okt
    const sesudahTengahMalam = new Date('2026-10-20T17:01:00Z'); // 00:01 WIB, 21 Okt

    // Keduanya bertanggal UTC 20 Oktober — itulah sebabnya kunci UTC salah.
    expect(sebelumTengahMalam.toISOString().slice(0, 10)).toBe('2026-10-20');
    expect(sesudahTengahMalam.toISOString().slice(0, 10)).toBe('2026-10-20');

    expect(jakartaDateKey(sebelumTengahMalam)).toBe('2026-10-20');
    expect(jakartaDateKey(sesudahTengahMalam)).toBe('2026-10-21');

    // BUKTI MUTASI: ganti `jakartaDateKey` kembali ke `toISOString().slice(0,10)`
    // (kunci UTC), lalu uji ini memerah pada baris kedua.
  });

  it('waktu reset jatuh tepat tengah malam WIB', () => {
    const siang = new Date('2026-10-20T05:00:00Z'); // 12:00 WIB
    expect(nextJakartaReset(siang)).toBe('2026-10-20T17:00:00.000Z'); // 00:00 WIB 21 Okt
  });

  it('klaim di dua sisi tengah malam menghasilkan dua klaim sah', async () => {
    const { usage, akun } = await siapkan();

    const pertama = await usage.claim(akun, new Date('2026-10-20T16:59:00Z'));
    const kedua = await usage.claim(akun, new Date('2026-10-20T17:01:00Z'));

    /*
     * Ini pembeda kunci WIB dari kunci UTC. Dengan kunci UTC, kedua klaim
     * jatuh pada tanggal yang SAMA sehingga klaim kedua tidak berhadiah.
     *
     * BUKTI MUTASI: kembalikan kunci tanggal ke UTC → `kedua.awarded` menjadi 0
     * dan uji ini memerah.
     */
    expect(pertama.awarded).toBe(100);
    expect(kedua.awarded).toBe(100);
  });
});

describe('streak klaim harian', () => {
  it('hari ke-7 beruntun memberi bonus 300, hari ke-8 tidak', async () => {
    const { usage, akun } = await siapkan();

    const hasil = [];
    for (let hari = 1; hari <= 8; hari += 1) {
      hasil.push(await usage.claim(akun, wib(hari, 10)));
    }

    expect(hasil.map((h) => h.streakDay)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(hasil.map((h) => h.bonus)).toEqual([0, 0, 0, 0, 0, 0, 300, 0]);
    expect(hasil[6]?.awarded).toBe(100);
    expect(hasil[6]?.available).toBe(400); // 100 + bonus 300

    // BUKTI MUTASI: ubah `streakDay % cycle === 0` menjadi `streakDay === 1`,
    // atau hapus bonus → uji ini memerah di hari ke-7.
  });

  it('sebelum klaim, streak menyebut hari yang AKAN berlaku — bukan 0', async () => {
    const { usage, akun } = await siapkan();

    // Pemain baru: klaim pertama akan menjadi hari ke-1.
    const baru = await usage.usage(akun, wib(1, 9));
    expect(baru.claimableToday).toBe(true);
    expect(baru.streakDay).toBe(1);

    /*
     * Pemain yang sudah 6 hari beruntun dan belum mengklaim hari ini: popup
     * harus menyebut 7 supaya titik bonus +300 menyala SEBELUM klaim. Nilai 0
     * menyembunyikan justru momen yang paling menarik.
     *
     * BUKTI MUTASI: kembalikan `streakDay` menjadi `claim ? … : 0` → uji ini
     * memerah (0, bukan 7).
     */
    for (let hari = 1; hari <= 6; hari += 1) {
      await usage.claim(akun, wib(hari, 10));
    }
    const hariKetujuh = await usage.usage(akun, wib(7, 9));
    expect(hariKetujuh.claimableToday).toBe(true);
    expect(hariKetujuh.streakDay).toBe(7);
  });

  it('bolong satu hari mengembalikan streak ke 1', async () => {
    const { usage, akun } = await siapkan();

    await usage.claim(akun, wib(1, 10));
    const hariKedua = await usage.claim(akun, wib(2, 10));
    // Lewati hari ke-3; klaim lagi di hari ke-4.
    const setelahBolong = await usage.claim(akun, wib(4, 10));

    expect(hariKedua.streakDay).toBe(2);
    expect(setelahBolong.streakDay).toBe(1);

    // BUKTI MUTASI: hapus pemeriksaan klaim kemarin (anggap selalu beruntun) →
    // `setelahBolong.streakDay` menjadi 3 dan uji memerah.
  });

  it('klaim kedua hari yang sama tidak menambah poin', async () => {
    const { usage, akun } = await siapkan();

    const pertama = await usage.claim(akun, wib(1, 9));
    const kedua = await usage.claim(akun, wib(1, 20));

    expect(pertama.awarded).toBe(100);
    expect(kedua.awarded).toBe(0);
    expect(kedua.available).toBe(100);

    /*
     * BUKTI MUTASI: percayai `rowCount` dari `ON CONFLICT DO NOTHING` sebagai
     * penentu "sudah diklaim" — pg-mem melaporkan 1 walau baris tidak
     * bertambah, sehingga klaim kedua memberi 100 poin lagi dan uji memerah.
     */
  });
});

describe('saldo dan pemakaian', () => {
  it('tanpa klaim, saldo nol dan biaya adegan tidak terjangkau', async () => {
    const { usage, akun } = await siapkan();

    const hariIni = await usage.usage(akun, wib(1, 12));
    expect(hariIni.available).toBe(0);
    expect(hariIni.claimableToday).toBe(true);
    expect(hariIni.sceneCost).toBe(10);
  });

  it('pemakaian mengurangi saldo hari itu saja, bukan hari berikutnya', async () => {
    const { ctx, usage, akun } = await siapkan();

    await usage.claim(akun, wib(1, 8));
    /*
     * `usage_entries.operation_id` ber-kunci asing ke `operations`, jadi baris
     * operasi harus ada lebih dulu. Ini bukan pelonggaran: justru membuktikan
     * penagihan menempel pada operasi sungguhan, bukan pada angka lepas.
     */
    await ctx.db.query(
      `INSERT INTO operations (operation_id, account_id, kind, state)
       VALUES ('op-1', $1, 'submit_choice', 'succeeded')`,
      [akun],
    );
    await usage.charge({
      accountId: akun,
      operationId: 'op-1',
      entryId: 'ue-1',
      promptTokens: 5000,
      completionTokens: 1000,
      chargedTotal: 10,
      at: wib(1, 9),
    });

    const hariIni = await usage.usage(akun, wib(1, 10));
    expect(hariIni.spent).toBe(10);
    expect(hariIni.available).toBe(90);

    await usage.claim(akun, wib(2, 8));
    const besok = await usage.usage(akun, wib(2, 10));
    // Poin tidak menumpuk: hari baru mulai dari klaim baru, bukan 90 + 100.
    expect(besok.spent).toBe(0);
    expect(besok.available).toBe(100);
  });
});
