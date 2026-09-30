/**
 * Akses data laporan masalah.
 *
 * Isi cerita TIDAK pernah disalin ke laporan. Yang disimpan hanya kategori dan
 * keterangan yang ditulis pemain sendiri (NFR-10, R-15).
 */

import type { Database } from '../db/pool';
import type { ReportCategory } from '../contracts/types';

export class ReportRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    reportId: string;
    accountId: string;
    category: ReportCategory;
    detail: string;
    journeyId?: string;
    beatId?: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO reports (report_id, account_id, journey_id, beat_id, category, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.reportId,
        input.accountId,
        input.journeyId ?? null,
        input.beatId ?? null,
        input.category,
        input.detail,
      ],
    );
  }

  async countByAccount(accountId: string): Promise<number> {
    const { rows } = await this.db.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM reports WHERE account_id = $1',
      [accountId],
    );
    return Number.parseInt(rows[0]?.count ?? '0', 10);
  }
}
