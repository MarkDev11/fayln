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
   * Mengembalikan `null` bila operasi sudah pernah diklaim — pemanggil harus
   * memperlakukan itu sebagai "sudah ada yang mengerjakan", bukan sebagai galat.
   */
  async claim(input: {
    operationId: string;
    accountId: string;
    journeyId: string | null;
    kind: OperationKind;
  }): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `INSERT INTO operations (operation_id, account_id, journey_id, kind, state)
       VALUES ($1, $2, $3, $4, 'running')
       ON CONFLICT (operation_id) DO NOTHING`,
      [input.operationId, input.accountId, input.journeyId, input.kind],
    );
    return rowCount > 0;
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
