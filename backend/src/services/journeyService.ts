/**
 * Layanan perjalanan.
 *
 * Lapisan ini menyusun urutan yang benar antara idempotensi, kuota, pembuatan
 * cerita, validasi, penyimpanan, dan penagihan. Route hanya memanggil layanan ini.
 *
 * Urutan tersebut penting dan disengaja:
 *   1. Operasi yang sudah selesai dikembalikan apa adanya (FR-52).
 *   2. Kuota diperiksa SEBELUM cerita dibuat, bukan sesudah.
 *   3. Keluaran mesin divalidasi terhadap dunia SEBELUM disimpan (FR-55).
 *   4. Penagihan memakai operation_id yang sama, sehingga tidak dapat ganda.
 */

import { randomUUID } from 'node:crypto';

import { AppError, conflict, notFound, quotaExhausted, worldRetired } from '../contracts/errors';
import type {
  Beat,
  JourneyDetailDTO,
  JourneySessionDTO,
  JourneySummary,
  RelationEntry,
  ResponseLocale,
  TurnResultEnvelope,
  WorldDetailDTO,
} from '../contracts/types';
import type { CatalogRepository } from '../repositories/catalogRepository';
import type { JourneyRepository } from '../repositories/journeyRepository';
import type { OperationRepository } from '../repositories/operationRepository';
import type { UsageRepository } from '../repositories/usageRepository';
import {
  validateEngineBeats,
  type StoryContext,
  type StoryEngine,
} from './storyEngine';

export type JourneyServiceDeps = {
  catalog: CatalogRepository;
  journeys: JourneyRepository;
  operations: OperationRepository;
  usage: UsageRepository;
  engine: StoryEngine;
  newId: () => string;
  now: () => Date;
};

export type CreateJourneyCommand = {
  operationId: string;
  accountId: string;
  worldId: string;
  persona: { name: string; age: number };
  responseLocale: ResponseLocale;
};

export type SubmitTurnCommand = {
  operationId: string;
  accountId: string;
  journeyId: string;
  decisionId: string;
  optionId?: string;
  customText?: string;
  responseLocale: ResponseLocale;
};

export type CreateJourneyResult = {
  journeyId: string;
  worldVersion: number;
  opening: TurnResultEnvelope;
};

export class JourneyService {
  constructor(private readonly deps: JourneyServiceDeps) {}

  /* ------------------------------------------------------------------ */
  /* Perjalanan                                                          */
  /* ------------------------------------------------------------------ */

  async createJourney(command: CreateJourneyCommand): Promise<CreateJourneyResult> {
    const cached = await this.replayIfDone(command.operationId, 'create_journey');
    if (cached) {
      const replayJourney = await this.deps.journeys.findById(cached.journeyId);
      return {
        journeyId: cached.journeyId,
        worldVersion: replayJourney?.world_version ?? 0,
        opening: cached,
      };
    }

    const world = await this.deps.catalog.findWorldVersion(command.worldId);
    if (!world) {
      throw notFound('Cerita tidak ditemukan.');
    }
    if (world.status !== 'published') {
      throw worldRetired();
    }

    // MVP: satu perjalanan aktif per dunia (D-12). Diperiksa sebelum klaim operasi
    // agar konflik tidak meninggalkan operasi yang menggantung.
    const existing = await this.deps.journeys.findByAccountAndWorld(
      command.accountId,
      command.worldId,
    );
    if (existing) {
      throw conflict('Kamu sudah punya perjalanan aktif di dunia ini.');
    }

    const detail = await this.deps.catalog.getWorldDetail(command.worldId, world.world_version);
    if (!detail) {
      throw notFound('Cerita tidak ditemukan.');
    }

    await this.assertQuotaAvailable(command.accountId);

    const claimed = await this.deps.operations.claim({
      operationId: command.operationId,
      accountId: command.accountId,
      journeyId: null,
      kind: 'create_journey',
    });
    if (!claimed) {
      // Ada permintaan bersamaan dengan operation_id sama; ambil hasilnya bila ada.
      const replay = await this.replayIfDone(command.operationId, 'create_journey');
      if (replay) {
        const replayJourney = await this.deps.journeys.findById(replay.journeyId);
        return {
          journeyId: replay.journeyId,
          worldVersion: replayJourney?.world_version ?? 0,
          opening: replay,
        };
      }
      throw conflict('Permintaan ini sedang diproses. Coba lagi sebentar lagi.');
    }

    const journeyId = `j_${randomUUID()}`;

    try {
      const context: StoryContext = {
        worldTitle: detail.title,
        premise: detail.premise,
        characters: detail.characters,
        manifest: detail.assetManifest,
        personaName: command.persona.name,
        turnOrdinal: 1,
      };

      const generated = await this.deps.engine.generateOpening(context);
      const issues = validateEngineBeats(generated.beats, context);
      if (issues.length > 0) {
        throw new AppError({
          code: 'INTERNAL',
          message: 'Cerita yang disusun tidak lolos pemeriksaan. Tidak ada yang disimpan.',
          internalDetail: issues.map((issue) => `${issue.beatId}: ${issue.reason}`).join(' | '),
        });
      }

      const baseline: RelationEntry[] = detail.characters.map((character) => ({
        npcId: character.npcId,
        status: character.initialRelation,
        reasonPublic: 'Hubungan awal yang ditetapkan dunia.',
        updatedAtTurnId: '',
      }));

      await this.deps.journeys.create({
        journeyId,
        accountId: command.accountId,
        worldId: command.worldId,
        worldVersion: world.world_version,
        personaName: command.persona.name,
        personaAge: command.persona.age,
        responseLocale: command.responseLocale,
        baseline,
      });

      const turnId = `t_${randomUUID()}`;
      const revision = await this.deps.journeys.appendTurn({
        turnId,
        journeyId,
        operationId: command.operationId,
        inputKind: 'opening',
        inputOptionId: null,
        beats: generated.beats,
      });

      await this.charge(command.accountId, command.operationId, generated.usage);

      const envelope = await this.buildEnvelope({
        accountId: command.accountId,
        operationId: command.operationId,
        journeyId,
        turnId,
        revision,
        modelId: generated.modelId,
        modelVersion: generated.modelVersion,
        usage: generated.usage,
      });

      await this.deps.operations.complete(command.operationId, envelope);
      return { journeyId, worldVersion: world.world_version, opening: envelope };
    } catch (error) {
      // Operasi gagal dilepas agar percobaan ulang dapat dikerjakan (FR-52).
      await this.deps.operations.fail(command.operationId, toErrorCode(error));
      await this.deps.operations.releaseFailed(command.operationId);
      throw error;
    }
  }

  async listJourneys(accountId: string): Promise<JourneySummary[]> {
    return this.deps.journeys.listByAccount(accountId);
  }

  async journeyDetail(journeyId: string, accountId: string): Promise<JourneyDetailDTO> {
    const journey = await this.deps.journeys.findById(journeyId);
    this.assertOwnership(journey, accountId);

    const detail = await this.deps.journeys.detail(journeyId);
    if (!detail) {
      throw notFound('Perjalanan tidak ditemukan.');
    }
    return detail;
  }

  /**
   * Membuka sesi bermain.
   *
   * `relationsBaseline` sengaja berisi hubungan SEBELUM beat mana pun, bukan
   * keadaan kanonik. Frontend menurunkan hubungan yang boleh dilihat dari beat
   * yang sudah dibaca; mengirim keadaan kanonik di sini akan membocorkan
   * perubahan dari beat yang belum dibaca (R-04, AC-12).
   */
  async openSession(journeyId: string, accountId: string): Promise<JourneySessionDTO> {
    const journey = await this.deps.journeys.findById(journeyId);
    this.assertOwnership(journey, accountId);

    const session = await this.deps.journeys.sessionData(journeyId);
    if (!session || !journey) {
      throw notFound('Perjalanan tidak ditemukan.');
    }

    const world = await this.deps.catalog.getWorldDetail(journey.world_id, journey.world_version);
    if (!world) {
      throw worldRetired();
    }

    return { ...session, world: world satisfies WorldDetailDTO };
  }

  async syncReadProgress(
    journeyId: string,
    accountId: string,
    input: {
      lastReadSequence: number;
      lastReadBeatId: string;
      decisionCount: number;
      hasUnreadBeats: boolean;
    },
  ): Promise<void> {
    const journey = await this.deps.journeys.findById(journeyId);
    this.assertOwnership(journey, accountId);
    await this.deps.journeys.syncReadProgress(journeyId, input);
  }

  async deleteJourney(journeyId: string, accountId: string): Promise<void> {
    const journey = await this.deps.journeys.findById(journeyId);
    this.assertOwnership(journey, accountId);
    await this.deps.journeys.delete(journeyId);
  }

  /* ------------------------------------------------------------------ */
  /* Giliran                                                             */
  /* ------------------------------------------------------------------ */

  async submitTurn(command: SubmitTurnCommand): Promise<TurnResultEnvelope> {
    const kind = command.optionId ? 'submit_choice' : 'submit_custom';
    const cached = await this.replayIfDone(command.operationId, kind);
    if (cached) {
      return cached;
    }

    const journey = await this.deps.journeys.findById(command.journeyId);
    this.assertOwnership(journey, command.accountId);
    if (!journey) {
      throw notFound('Perjalanan tidak ditemukan.');
    }

    const world = await this.deps.catalog.getWorldDetail(journey.world_id, journey.world_version);
    if (!world) {
      throw worldRetired();
    }

    await this.assertQuotaAvailable(command.accountId);

    const claimed = await this.deps.operations.claim({
      operationId: command.operationId,
      accountId: command.accountId,
      journeyId: command.journeyId,
      kind,
    });
    if (!claimed) {
      const replay = await this.replayIfDone(command.operationId, kind);
      if (replay) {
        return replay;
      }
      throw conflict('Permintaan ini sedang diproses. Coba lagi sebentar lagi.');
    }

    try {
      const existingBeats = await this.deps.journeys.beats(command.journeyId);
      const pending = existingBeats.find(
        (beat) =>
          beat.event.type === 'presentChoices' &&
          beat.event.decisionId === command.decisionId &&
          !hasResolution(existingBeats, beat),
      );
      if (!pending) {
        throw conflict('Keputusan ini sudah dijawab atau tidak lagi berlaku.');
      }

      const context: StoryContext = {
        worldTitle: world.title,
        premise: world.premise,
        characters: world.characters,
        manifest: world.assetManifest,
        personaName: journey.persona_name,
        turnOrdinal: countTurns(existingBeats) + 1,
        ...(command.customText !== undefined ? { customText: command.customText } : null),
        ...(command.optionId !== undefined ? { optionId: command.optionId } : null),
      };

      const generated = await this.deps.engine.generateTurn(context);
      const issues = validateEngineBeats(generated.beats, context);
      if (issues.length > 0) {
        throw new AppError({
          code: 'INTERNAL',
          message: 'Cerita yang disusun tidak lolos pemeriksaan. Tidak ada yang disimpan.',
          internalDetail: issues.map((issue) => `${issue.beatId}: ${issue.reason}`).join(' | '),
        });
      }

      const turnId = `t_${randomUUID()}`;
      const revision = await this.deps.journeys.appendTurn({
        turnId,
        journeyId: command.journeyId,
        operationId: command.operationId,
        inputKind: command.optionId ? 'option' : 'custom',
        inputOptionId: command.optionId ?? null,
        beats: generated.beats,
      });

      await this.charge(command.accountId, command.operationId, generated.usage);

      const envelope = await this.buildEnvelope({
        accountId: command.accountId,
        operationId: command.operationId,
        journeyId: command.journeyId,
        turnId,
        revision,
        modelId: generated.modelId,
        modelVersion: generated.modelVersion,
        usage: generated.usage,
      });

      await this.deps.operations.complete(command.operationId, envelope);
      return envelope;
    } catch (error) {
      await this.deps.operations.fail(command.operationId, toErrorCode(error));
      await this.deps.operations.releaseFailed(command.operationId);
      throw error;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Internal                                                            */
  /* ------------------------------------------------------------------ */

  private async replayIfDone(
    operationId: string,
    expectedKind: string,
  ): Promise<TurnResultEnvelope | null> {
    const operation = await this.deps.operations.find(operationId);
    if (!operation || operation.kind !== expectedKind) {
      return null;
    }
    if (operation.state === 'succeeded' && operation.result) {
      return operation.result;
    }
    return null;
  }

  /**
   * Memastikan kuota cukup untuk SATU giliran sebelum cerita disusun.
   *
   * Memeriksa `available > 0` saja tidak cukup: dengan sisa 10 token, generasi
   * tetap berjalan lalu menagih jauh melebihi batas paket. Karena itu biaya satu
   * giliran diperkirakan lebih dahulu (FR-50).
   */
  private async assertQuotaAvailable(accountId: string): Promise<void> {
    const usage = await this.deps.usage.usage(accountId, this.deps.now());
    const estimate = this.deps.engine.estimatedTurnCost;

    if (usage.available < estimate) {
      throw quotaExhausted(
        'Sisa kuota harianmu tidak cukup untuk melanjutkan cerita. Riwayat dan pengaturan tetap bisa dibuka, dan kuota diperbarui otomatis.',
      );
    }
  }

  private async charge(
    accountId: string,
    operationId: string,
    usage: { promptTokens: number; completionTokens: number; chargedTotal: number },
  ): Promise<void> {
    await this.deps.usage.charge({
      accountId,
      operationId,
      entryId: `ue_${randomUUID()}`,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      chargedTotal: usage.chargedTotal,
      at: this.deps.now(),
    });
  }

  private async buildEnvelope(input: {
    accountId: string;
    operationId: string;
    journeyId: string;
    turnId: string;
    revision: number;
    modelId: string;
    modelVersion: string;
    usage: { promptTokens: number; completionTokens: number; chargedTotal: number };
  }): Promise<TurnResultEnvelope> {
    const allBeats = await this.deps.journeys.beats(input.journeyId);
    const beats: Beat[] = allBeats.filter((beat) => beat.turnId === input.turnId);

    // Anggaran dibaca SETELAH penagihan, sehingga angka yang dikirim ke pemain
    // adalah sisa yang sebenarnya, bukan perkiraan.
    const usage = await this.deps.usage.usage(input.accountId, this.deps.now());

    return {
      operationId: input.operationId,
      journeyId: input.journeyId,
      turnId: input.turnId,
      revision: input.revision,
      beats,
      usage: input.usage,
      memory: await this.deps.journeys.memorySnapshot(input.journeyId),
      budget: {
        availableAfter: usage.available,
        allowanceLimit: usage.allowanceLimit,
        resetAt: usage.resetAt,
      },
      modelId: input.modelId,
      modelVersion: input.modelVersion,
      simulator: this.deps.engine.isSimulator,
    };
  }

  private assertOwnership(
    journey: { account_id: string } | null,
    accountId: string,
  ): asserts journey is { account_id: string } {
    if (!journey) {
      throw notFound('Perjalanan tidak ditemukan.');
    }
    if (journey.account_id !== accountId) {
      // Sengaja memakai NOT_FOUND, bukan FORBIDDEN: keberadaan perjalanan milik
      // akun lain tidak boleh terbaca dari kode kesalahan.
      throw notFound('Perjalanan tidak ditemukan.');
    }
  }
}

/** Giliran baru dihitung dari jumlah keputusan yang sudah ada. */
function countTurns(beats: Beat[]): number {
  const turnIds = new Set(beats.map((beat) => beat.turnId));
  return turnIds.size;
}

/** Keputusan dianggap sudah dijawab bila ada turn setelahnya di perjalanan. */
function hasResolution(beats: Beat[], decisionBeat: Beat): boolean {
  const index = beats.findIndex((beat) => beat.beatId === decisionBeat.beatId);
  if (index === -1) {
    return false;
  }
  return beats.slice(index + 1).some((beat) => beat.turnId !== decisionBeat.turnId);
}

function toErrorCode(error: unknown): string {
  if (error instanceof AppError) {
    return error.code;
  }
  return 'INTERNAL';
}

export type { TurnResultEnvelope };
