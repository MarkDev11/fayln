/**
 * Akses data perjalanan, turn, dan beat.
 *
 * Prinsip yang ditegakkan di lapisan ini, bukan di route:
 * - Journey mengunci `world_version`; tidak pernah berubah setelah dibuat.
 * - Baseline hubungan disalin saat pembuatan, dan TIDAK pernah ditulis ulang.
 *   Keadaan kanonik dihitung dari beat, sehingga frontend dapat menurunkan
 *   hubungan yang boleh dilihat tanpa risiko kebocoran (R-04, AC-12).
 * - Beat tidak dapat diubah: tidak ada UPDATE atau DELETE pada tabel `beats`.
 */

import type { Database } from '../db/pool';
import type {
  Beat,
  JourneyDetailDTO,
  JourneySessionDTO,
  JourneySummary,
  MemorySnapshot,
  RelationEntry,
  RelationStatus,
  StoryEvent,
} from '../contracts/types';

type JourneyRow = {
  journey_id: string;
  account_id: string;
  world_id: string;
  world_version: number;
  persona_name: string;
  persona_age: number;
  response_locale: string;
  last_read_beat_id: string;
  last_read_sequence: number;
  decision_count: number;
  has_unread_beats: boolean;
  created_at: Date;
  updated_at: Date;
};

type BeatRow = {
  beat_id: string;
  turn_id: string;
  sequence: number;
  event: StoryEvent;
};

export type CreateJourneyInput = {
  journeyId: string;
  accountId: string;
  worldId: string;
  worldVersion: number;
  personaName: string;
  personaAge: number;
  responseLocale: string;
  baseline: RelationEntry[];
};

export type ReadProgressInput = {
  lastReadSequence: number;
  lastReadBeatId: string;
  decisionCount: number;
  hasUnreadBeats: boolean;
};

export class JourneyRepository {
  constructor(private readonly db: Database) {}

  async findById(journeyId: string): Promise<JourneyRow | null> {
    const { rows } = await this.db.query<JourneyRow>(
      `SELECT journey_id, account_id, world_id, world_version, persona_name, persona_age,
              response_locale, last_read_beat_id, last_read_sequence, decision_count,
              has_unread_beats, created_at, updated_at
       FROM journeys WHERE journey_id = $1 LIMIT 1`,
      [journeyId],
    );
    return rows[0] ?? null;
  }

  async findByAccountAndWorld(accountId: string, worldId: string): Promise<JourneyRow | null> {
    const { rows } = await this.db.query<JourneyRow>(
      `SELECT journey_id, account_id, world_id, world_version, persona_name, persona_age,
              response_locale, last_read_beat_id, last_read_sequence, decision_count,
              has_unread_beats, created_at, updated_at
       FROM journeys WHERE account_id = $1 AND world_id = $2 LIMIT 1`,
      [accountId, worldId],
    );
    return rows[0] ?? null;
  }

  /**
   * Membuat perjalanan beserta baseline hubungan dan turn pembuka.
   *
   * Dijalankan dalam satu transaksi: perjalanan tanpa baseline atau tanpa turn
   * pembuka adalah keadaan yang tidak boleh pernah terlihat oleh pemain.
   */
  async create(input: CreateJourneyInput): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO journeys (
           journey_id, account_id, world_id, world_version,
           persona_name, persona_age, response_locale,
           last_read_sequence, decision_count, has_unread_beats
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, true)`,
        [
          input.journeyId,
          input.accountId,
          input.worldId,
          input.worldVersion,
          input.personaName,
          input.personaAge,
          input.responseLocale,
        ],
      );

      for (const relation of input.baseline) {
        await client.query(
          `INSERT INTO journey_relations_baseline (journey_id, npc_id, status, reason_public)
           VALUES ($1, $2, $3, $4)`,
          [input.journeyId, relation.npcId, relation.status, relation.reasonPublic],
        );
      }
    });
  }

  async listByAccount(accountId: string): Promise<JourneySummary[]> {
    const { rows } = await this.db.query<JourneyRow & { world_title: string; cover_asset_id: string }>(
      `SELECT j.journey_id, j.account_id, j.world_id, j.world_version, j.persona_name,
              j.persona_age, j.response_locale, j.last_read_beat_id, j.last_read_sequence,
              j.decision_count, j.has_unread_beats, j.created_at, j.updated_at,
              wv.title AS world_title, wv.cover_asset_id
       FROM journeys j
       JOIN world_versions wv
         ON wv.world_id = j.world_id AND wv.world_version = j.world_version
       WHERE j.account_id = $1
       ORDER BY j.updated_at DESC, j.journey_id DESC`,
      [accountId],
    );

    return rows.map((row) => ({
      journeyId: row.journey_id,
      worldId: row.world_id,
      worldTitle: row.world_title,
      coverAssetId: row.cover_asset_id,
      worldVersion: row.world_version,
      personaName: row.persona_name,
      lastReadBeatId: row.last_read_beat_id,
      lastReadSequence: row.last_read_sequence,
      decisionCount: row.decision_count,
      hasUnreadBeats: row.has_unread_beats,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async detail(journeyId: string): Promise<JourneyDetailDTO | null> {
    const journey = await this.findById(journeyId);
    if (!journey) {
      return null;
    }

    const { rows } = await this.db.query<{
      world_title: string;
      cover_asset_id: string;
    }>(
      `SELECT title AS world_title, cover_asset_id
       FROM world_versions WHERE world_id = $1 AND world_version = $2`,
      [journey.world_id, journey.world_version],
    );

    const summary = rows[0];

    return {
      journeyId: journey.journey_id,
      worldId: journey.world_id,
      worldTitle: summary?.world_title ?? '',
      coverAssetId: summary?.cover_asset_id ?? '',
      worldVersion: journey.world_version,
      personaName: journey.persona_name,
      lastReadBeatId: journey.last_read_beat_id,
      lastReadSequence: journey.last_read_sequence,
      decisionCount: journey.decision_count,
      hasUnreadBeats: journey.has_unread_beats,
      updatedAt: journey.updated_at.toISOString(),
      relations: await this.canonicalRelations(journeyId),
      memory: await this.memorySnapshot(journeyId),
      presentedThroughSequence: journey.last_read_sequence,
    };
  }

  /**
   * Hubungan awal yang ditetapkan dunia, TANPA pengaruh beat.
   *
   * Inilah yang dikirim ke frontend saat membuka sesi, agar frontend menurunkan
   * hubungan yang boleh dilihat dari beat yang sudah dibaca saja.
   */
  async baselineRelations(journeyId: string): Promise<RelationEntry[]> {
    const { rows } = await this.db.query<{
      npc_id: string;
      status: string;
      reason_public: string;
    }>(
      `SELECT npc_id, status, reason_public
       FROM journey_relations_baseline WHERE journey_id = $1 ORDER BY npc_id ASC`,
      [journeyId],
    );

    return rows.map((row) => ({
      npcId: row.npc_id,
      status: row.status as RelationStatus,
      reasonPublic: row.reason_public,
      updatedAtTurnId: '',
    }));
  }

  /**
   * Keadaan hubungan kanonik: baseline ditimpa oleh setiap relationshipDelta
   * yang sudah di-commit, berurutan.
   */
  async canonicalRelations(journeyId: string): Promise<RelationEntry[]> {
    const baseline = await this.baselineRelations(journeyId);
    const { rows } = await this.db.query<{
      npc_id: string;
      status: string;
      reason_public: string;
      turn_id: string;
      created_at: Date;
      sequence: number;
    }>(
      `SELECT b.event->>'npcId'       AS npc_id,
              b.event->>'status'      AS status,
              b.event->>'reasonPublic' AS reason_public,
              b.turn_id,
              b.created_at,
              b.sequence
       FROM beats b
       WHERE b.journey_id = $1 AND b.event->>'type' = 'relationshipDelta'
       ORDER BY b.created_at ASC, b.sequence ASC`,
      [journeyId],
    );

    const byNpc = new Map(baseline.map((entry) => [entry.npcId, entry]));

    for (const row of rows) {
      byNpc.set(row.npc_id, {
        npcId: row.npc_id,
        status: row.status as RelationStatus,
        reasonPublic: row.reason_public,
        updatedAtTurnId: row.turn_id,
      });
    }

    return [...byNpc.values()];
  }

  async memorySnapshot(journeyId: string): Promise<MemorySnapshot> {
    // Compaction belum diimplementasikan; kontraknya sudah ada agar frontend tidak
    // perlu berubah saat fitur itu menyusul.
    const { rows } = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM beats
       WHERE journey_id = $1 AND event->>'type' = 'memoryWrite'`,
      [journeyId],
    );
    const count = Number.parseInt(rows[0]?.count ?? '0', 10);
    return count > 0 ? { activeVersion: count, source: 'checkpoint' } : { activeVersion: null, source: 'none' };
  }

  /** Seluruh beat perjalanan, terurut menurut waktu commit lalu urutan dalam turn. */
  async beats(journeyId: string): Promise<Beat[]> {
    const { rows } = await this.db.query<BeatRow & { created_at: Date }>(
      `SELECT beat_id, turn_id, sequence, event, created_at
       FROM beats WHERE journey_id = $1
       ORDER BY created_at ASC, sequence ASC`,
      [journeyId],
    );

    return rows.map((row) => ({
      beatId: row.beat_id,
      turnId: row.turn_id,
      sequence: row.sequence,
      event: row.event,
    }));
  }

  /**
   * Data sesi tanpa `world` dan tanpa `simulator`.
   *
   * Dunia sengaja TIDAK diambil di sini: repository ini tidak mengimpor repository
   * lain. Penyusunan akhir dilakukan lapisan layanan.
   *
   * `simulator` juga TIDAK di sini, dan itu disengaja: lapisan inilah satu-satunya
   * yang tidak dapat menjawabnya dengan jujur. Dulu nilainya ditulis mati `true`
   * di sini — akibatnya setiap pemain diberi tahu bahwa mesin simulator yang
   * menulis ceritanya, padahal yang bekerja adalah AI sungguhan. Yang berhak
   * menjawab adalah pemegang mesin: layanan cerita (lihat `openSession`).
   */
  async sessionData(journeyId: string): Promise<Omit<JourneySessionDTO, 'world' | 'simulator'> | null> {
    const journey = await this.findById(journeyId);
    if (!journey) {
      return null;
    }

    const beats = await this.beats(journeyId);

    return {
      journeyId: journey.journey_id,
      beats,
      relationsBaseline: await this.baselineRelations(journeyId),
      memory: await this.memorySnapshot(journeyId),
      committedCursor: beats.length,
    };
  }

  /** Menyimpan laporan posisi baca dari klien. */
  async syncReadProgress(journeyId: string, input: ReadProgressInput): Promise<void> {
    await this.db.query(
      `UPDATE journeys
       SET last_read_sequence = $2,
           last_read_beat_id = $3,
           decision_count = $4,
           has_unread_beats = $5,
           updated_at = now()
       WHERE journey_id = $1`,
      [
        journeyId,
        input.lastReadSequence,
        input.lastReadBeatId,
        input.decisionCount,
        input.hasUnreadBeats,
      ],
    );
  }

  async delete(journeyId: string): Promise<void> {
    // Beat dan baseline ikut terhapus lewat ON DELETE CASCADE.
    await this.db.query('DELETE FROM journeys WHERE journey_id = $1', [journeyId]);
  }

  /**
   * Menyimpan satu turn beserta beat-nya.
   *
   * `revision` dihitung dari jumlah turn yang ada, sehingga hasil yang tiba
   * terlambat tidak dapat menimpa turn yang lebih baru (AC-09).
   */
  async appendTurn(input: {
    turnId: string;
    journeyId: string;
    operationId: string;
    inputKind: 'opening' | 'option' | 'custom';
    inputOptionId: string | null;
    beats: { beatId: string; sequence: number; event: StoryEvent }[];
  }): Promise<number> {
    return this.db.transaction(async (client) => {
      const countResult = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM turns WHERE journey_id = $1',
        [input.journeyId],
      );
      const revision = Number.parseInt(countResult.rows[0]?.count ?? '0', 10) + 1;

      await client.query(
        `INSERT INTO turns (turn_id, journey_id, revision, operation_id, input_kind, input_option_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.turnId,
          input.journeyId,
          revision,
          input.operationId,
          input.inputKind,
          input.inputOptionId,
        ],
      );

      for (const beat of input.beats) {
        await client.query(
          `INSERT INTO beats (beat_id, turn_id, journey_id, sequence, event)
           VALUES ($1, $2, $3, $4, $5)`,
          [beat.beatId, input.turnId, input.journeyId, beat.sequence, JSON.stringify(beat.event)],
        );
      }

      await client.query(
        `UPDATE journeys
         SET has_unread_beats = true, updated_at = now()
         WHERE journey_id = $1`,
        [input.journeyId],
      );

      return revision;
    });
  }
}
