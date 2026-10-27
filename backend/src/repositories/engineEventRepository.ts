/**
 * Pencatat kejadian mesin cerita.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA INI ADA
 * ---------------------------------------------------------------------------
 * Dulu satu-satunya jejak "mesin AI gagal lalu simulator mengambil alih"
 * adalah baris log warn. Log platform bergulir dan hilang; pemilik tidak
 * punya cara menjawab "berapa sering simulator menulis cerita minggu ini"
 * tanpa skrip verifikasi manual. Kejadian itu kini JADI DATA, dan halaman
 * /admin/mesin membacanya.
 *
 * ---------------------------------------------------------------------------
 * SATU ATURAN YANG TIDAK BOLEH DILANGGAR
 * ---------------------------------------------------------------------------
 * Pencatatan TIDAK PERNAH menggagalkan permintaan. `record()` menelan galatnya
 * sendiri: kegagalan menulis log tidak boleh menggagalkan giliran yang sedang
 * dilayani. Karena itu `record()` sengaja tidak melempar apa pun, dan pemanggil
 * tidak perlu try/catch sendiri.
 */

import { randomUUID } from 'node:crypto';

import type { Database } from '../db/pool';

/** Jenis kejadian; harus sama dengan CHECK di migrasi 023. */
export type EngineEventKind =
  | 'engine_failed'
  | 'scene_rejected'
  | 'simulator_used'
  | 'events_skipped';

export type EngineEventRow = {
  id: string;
  kind: EngineEventKind;
  detail: string | null;
  journeyId: string | null;
  turnId: string | null;
  createdAt: Date | string;
};

export class EngineEventRepository {
  constructor(private readonly db: Database) {}

  /**
   * Mencatat satu kejadian. Tidak pernah melempar.
   *
   * BUKTI MUTASI: ganti isi metode ini menjadi pelempar galat biasa
   * (`await this.db.query(...)` tanpa try/catch), lalu uji
   * "TIDAK menggagalkan pemanggil saat basis data menolak" memerah.
   */
  async record(event: {
    kind: EngineEventKind;
    detail?: string;
    journeyId?: string | null;
    turnId?: string | null;
  }): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO engine_events (id, kind, detail, journey_id, turn_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `ee_${randomUUID()}`,
          event.kind,
          event.detail ?? null,
          event.journeyId ?? null,
          event.turnId ?? null,
        ],
      );
    } catch {
      // Sengaja kosong: kegagalan pencatatan tidak boleh menggagalkan apa pun.
      // Lihat catatan di kepala berkas.
    }
  }

  /** Kejadian TERBARU lebih dulu, dibatasi untuk halaman admin. */
  async recent(limit = 50): Promise<EngineEventRow[]> {
    const { rows } = await this.db.query<{
      id: string;
      kind: string;
      detail: string | null;
      journey_id: string | null;
      turn_id: string | null;
      created_at: Date | string;
    }>(
      `SELECT id, kind, detail, journey_id, turn_id, created_at
       FROM engine_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as EngineEventKind,
      detail: row.detail,
      journeyId: row.journey_id,
      turnId: row.turn_id,
      createdAt: row.created_at,
    }));
  }

  /** Hitungan kejadian per jenis, untuk ringkasan di atas halaman. */
  async countsByKind(): Promise<Map<EngineEventKind, number>> {
    const { rows } = await this.db.query<{ kind: string; total: number }>(
      `SELECT kind, count(*)::int AS total
       FROM engine_events
       GROUP BY kind`,
    );

    const counts = new Map<EngineEventKind, number>();
    for (const row of rows) {
      counts.set(row.kind as EngineEventKind, row.total);
    }
    return counts;
  }
}
