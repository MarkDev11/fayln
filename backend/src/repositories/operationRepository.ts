/**
 * Idempotensi operasi (FR-52).
 *
 * Setiap permintaan yang mengubah keadaan membawa `clientOperationId`. Operasi
 * dicatat lebih dahulu dengan state `running`; bila operasi yang sama datang lagi,
 * hasil yang tersimpan dikembalikan apa adanya alih-alih dikerjakan ulang.
 *
 * Ini yang membuat tap ganda dan percobaan ulang tidak pernah menghasilkan dua
 * giliran atau dua penagihan.
 */

import type { Database } from '../db/pool';
import type { TurnResultEnvelope } from '../contracts/types';

export type OperationKind = 'create_journey' | 'submit_choice' | 'submit_custom' | 'compaction';
export type OperationState = 'running' | 'succeeded' | 'failed';

/**
 * Usia klaim yang dianggap mati.
 *
 * Jauh di atas durasi giliran sehat (21-35 detik) dan di atas batas waktu
 * provider (45 detik per percobaan, dua percobaan), sehingga klaim yang masih
 * benar-benar dikerjakan tidak mungkin tersentuh.
 */
const STALE_CLAIM_MS = 10 * 60 * 1000;

export type OperationRow = {
  operationId: string;
  accountId: string;
  journeyId: string | null;
  kind: OperationKind;
  state: OperationState;
  result: TurnResultEnvelope | null;
  errorCode: string | null;
};

export class OperationRepository {
  constructor(private readonly db: Database) {}

  async find(operationId: string): Promise<OperationRow | null> {
    const { rows } = await this.db.query<{
      operation_id: string;
      account_id: string;
      journey_id: string | null;
      kind: string;
      state: string;
      result: TurnResultEnvelope | null;
      error_code: string | null;
    }>(
      `SELECT operation_id, account_id, journey_id, kind, state, result, error_code
       FROM operations WHERE operation_id = $1 LIMIT 1`,
      [operationId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      operationId: row.operation_id,
      accountId: row.account_id,
      journeyId: row.journey_id,
      kind: row.kind as OperationKind,
      state: row.state as OperationState,
      result: row.result,
      errorCode: row.error_code,
    };
  }

  /**
   * Mengklaim operasi.
   *
   * Mengembalikan `false` bila operasi sudah pernah diklaim dan klaimnya masih
   * hidup — pemanggil harus memperlakukan itu sebagai "sudah ada yang
   * mengerjakan", bukan sebagai galat.
   *
   * ---------------------------------------------------------------------------
   * PENGECEUANGAN: klaim basi diambil alih
   * ---------------------------------------------------------------------------
   * `running` yang tertinggal adalah jebakan diam-diam. Proses yang mati di
   * tengah giliran (deploy ulang, crash, koneksi terputus) meninggalkan
   * operasi dengan state `running` SELAMANYA: tidak ada yang akan menandainya
   * `succeeded` atau `failed`, dan pemain yang menekan ulang mendapat "sudah ada
   * yang mengerjakan" sampai selamanya — terkunci dari ceritanya sendiri tanpa
   * satu pun galat.
   *
   * Aturannya: klaim pada operasi `running` yang usianya melewati
   * `STALE_CLAIM_MS` dianggap mati dan BOLEH diambil alih. Angka itu jauh di
   * atas durasi giliran sehat (21-35 detik) dan di atas batas waktu provider,
   * sehingga klaim yang masih benar-benar dikerjakan tidak mungkin tersentuh.
   *
   * Idempotensi tetap utuh: ambil alih hanya terjadi pada operasi yang TIDAK
   * punya hasil (`completed_at IS NULL`). Operasi `succeeded` tidak pernah
   * disentuh — hasilnya tetap dikembalikan untuk pengulangan yang sama (FR-52).
   *
   * BUKTI MUTASI: hapus klausa `WHERE operations.state = 'running' ...` (kembali
   * ke `DO NOTHING` tanpa syarat), lalu uji "MENGAMBIL ALIH klaim basi" di
   * tests/api.test.ts memerah pada pengambilan alih klaim basi.
   */
  async claim(input: {
    operationId: string;
    accountId: string;
    journeyId: string | null;
    kind: OperationKind;
  }): Promise<boolean> {
    /*
     * Ambang waktunya DIHITUNG DI SINI, dan pengambilan alihnya DUA LANGKAH.
     *
     * Dua keputusan yang terlihat teknis tetapi menyelamatkan pengujian:
     *
     * 1. Ambang dikirim sebagai satu parameter `timestamptz`, bukan dihitung
     *    di dalam SQL. Bentuk pertama memakai `now() - ($5 || ' milliseconds')
     *    ::interval` dan `make_interval(...)`; keduanya membuat pg-mem salah
     *    menghitung parameter, dan ujinya berhenti dengan galat yang tidak
     *    menunjuk penyebabnya.
     *
     * 2. Pengambilan alih BUKAN `ON CONFLICT ... DO UPDATE ... WHERE`.
     *    pg-mem MENGABAIKAN klausa `WHERE` pada `DO UPDATE` — klaim muda dan
     *    klaim yang sudah berhasil sama-sama "berhasil direbut". Ujinya merah
     *    dengan alasan yang salah, dan di produksi PostgreSQL perilakunya
     *    berbeda dari yang dites. Karena itu: masukkan baru lebih dulu, lalu
     *    satu `UPDATE` berkondisi — jalur yang didukung penuh di kedua mesin,
     *    dan tetap atomik untuk kasus pengambilan alih.
     */
    const ambangBasi = new Date(Date.now() - STALE_CLAIM_MS);

    /*
     * ---------------------------------------------------------------------------
     * JANGAN PERCAYA `rowCount` HASIL INSERT DI MESIN UJI
     * ---------------------------------------------------------------------------
     * Terukur: pg-mem melaporkan `rowCount = 1` untuk INSERT ... ON CONFLICT DO
     * NOTHING yang justru KONFLIK — seharusnya 0. Bila keputusan klaim diambil
     * dari rowCount itu, klaim kedua pada operasi yang sama selalu dianggap
     * berhasil, idempotensi FR-52 runtuh, dan satu giliran dapat ditagih dua
     * kali. Karena itu keberadaannya diperiksa dengan SELECT lebih dulu, dan
     * rowCount hanya dipercaya pada UPDATE berkondisi — yang terukur benar.
     */
    const ada = await this.db.query<{ state: string; completed_at: Date | null; created_at: Date }>(
      'SELECT state, completed_at, created_at FROM operations WHERE operation_id = $1',
      [input.operationId],
    );
    const baris = ada.rows[0];

    if (!baris) {
      // Belum ada. Sisipkan TANPA ON CONFLICT, dan tangkap pelanggaran kunci
      // utama sebagai kekalahan perlombaan yang sah: proses lain lebih dulu.
      try {
        await this.db.query(
          `INSERT INTO operations (operation_id, account_id, journey_id, kind, state, created_at)
           VALUES ($1, $2, $3, $4, 'running', $5)`,
          [input.operationId, input.accountId, input.journeyId, input.kind, new Date()],
        );
        return true;
      } catch (galat) {
        if (String((galat as { code?: unknown }).code) === '23505') {
          return false;
        }
        throw galat;
      }
    }

    /*
     * Sudah ada. Dua keadaan yang TIDAK boleh direbut:
     * - `succeeded` / `failed` dengan hasil — pengulangan harus mengembalikan
     *   hasil yang sama (FR-52);
     * - `running` yang MASIH MUDA — ia mungkin sedang benar-benar dikerjakan
     *   proses lain.
     *
     * BUKTI MUTASI: hapus syarat `AND operations.created_at < $2` pada UPDATE
     * di bawah, lalu uji "MENGAMBIL ALIH klaim basi" di tests/api.test.ts
     * memerah pada pengambilan alih klaim basi.
     */
    if (baris.state !== 'running' || baris.completed_at !== null) {
      return false;
    }
    const ambil = await this.db.query(
      `UPDATE operations
       SET state = 'running'
       WHERE operation_id = $1
         AND state = 'running'
         AND completed_at IS NULL
         AND created_at < $2`,
      [input.operationId, ambangBasi],
    );
    return ambil.rowCount !== null && ambil.rowCount > 0;
  }

  async complete(operationId: string, result: TurnResultEnvelope): Promise<void> {
    await this.db.query(
      `UPDATE operations
       SET state = 'succeeded', result = $2, completed_at = now()
       WHERE operation_id = $1`,
      [operationId, JSON.stringify(result)],
    );
  }

  async fail(operationId: string, errorCode: string): Promise<void> {
    await this.db.query(
      `UPDATE operations
       SET state = 'failed', error_code = $2, completed_at = now()
       WHERE operation_id = $1`,
      [operationId, errorCode],
    );
  }

  /**
   * Melepas klaim yang gagal agar percobaan ulang dapat dikerjakan.
   *
   * Hanya berlaku untuk operasi yang belum selesai. Operasi yang sudah berhasil
   * tidak pernah dilepas, karena hasilnya harus tetap dapat dikembalikan.
   */
  async releaseFailed(operationId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM operations WHERE operation_id = $1 AND state = 'failed'`,
      [operationId],
    );
  }
}
