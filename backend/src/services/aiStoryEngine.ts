/**
 * Mesin cerita berbasis model.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA VALIDASINYA KETAT
 * ---------------------------------------------------------------------------
 * Keluaran model adalah DATA yang dirender program, bukan teks yang dibaca
 * manusia. Model yang mengarang `assetId` tidak menghasilkan kalimat aneh — ia
 * menghasilkan layar yang menampilkan placeholder, tanpa galat. Model yang lupa
 * menulis keputusan tidak menghasilkan adegan yang kurang bagus — ia membuat
 * pemain TIDAK PUNYA JALAN melanjutkan.
 *
 * Karena itu setiap adegan diperiksa sebelum disimpan, dan yang tidak lolos
 * DIBUANG SELURUHNYA — bukan diperbaiki sebagian. Adegan setengah benar lebih
 * berbahaya daripada adegan yang jelas gagal, karena yang pertama tidak terlihat
 * rusak.
 *
 * ---------------------------------------------------------------------------
 * CADANGAN BUKAN KEMEWAHAN
 * ---------------------------------------------------------------------------
 * Setiap giliran kini bergantung pada model. Tanpa cadangan, satu kegagalan
 * jaringan menghentikan cerita di tengah, dan pemain tidak dapat berbuat apa pun.
 * Simulator memang sederhana, tetapi ia selalu berhasil.
 */
import type {
  Beat,
  ChoiceOption,
  NPCPublicDTO,
  StoryEvent,
  AssetManifest,
} from '../contracts/types';

import type { StoryEngine, StoryEngineResult, StoryContext } from './storyEngine';
import {
  buildStoryUserPrompt,
  MAX_BEAT_WORDS,
  MAX_SCENE_BEATS,
  storySystemPrompt,
} from './storyPrompt';

/** Hasil pemanggilan model, apa adanya. */
export type StorySceneCall = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<{ ok: true; scene: unknown } | { ok: false; detail: string }>;

export type AiStoryEngineDeps = {
  call: StorySceneCall;
  /** Dipakai bila model gagal. Simulator selalu berhasil. */
  fallback: StoryEngine;
  /** Perkiraan biaya satu giliran, untuk anggaran. */
  estimatedTurnCost?: number;
  onFailure?: (sebab: string) => void;
};

/** Alasan sebuah adegan ditolak. Dipakai untuk log dan pengujian. */
export type RejectReason =
  | 'bukan-objek'
  | 'beats-bukan-array'
  | 'beats-kosong'
  | 'terlalu-banyak-beat'
  | 'event-tidak-dikenal'
  | 'asset-tidak-dikenal'
  | 'npc-tidak-dikenal'
  | 'ekspresi-tidak-dikenal'
  | 'tanpa-keputusan'
  | 'opsi-bukan-tiga';

export class AiStoryEngine implements StoryEngine {
  readonly isSimulator = false;
  readonly estimatedTurnCost: number;

  constructor(private readonly deps: AiStoryEngineDeps) {
    this.estimatedTurnCost = deps.estimatedTurnCost ?? 6_000;
  }

  async generateOpening(context: StoryContext): Promise<StoryEngineResult> {
    return this.tulis(context, null);
  }

  async generateTurn(context: StoryContext): Promise<StoryEngineResult> {
    return this.tulis(context, aksiPemain(context));
  }

  /**
   * Menulis satu adegan, atau menyerahkannya ke simulator.
   *
   * Kegagalan apa pun — jaringan, bentuk, id yang dikarang — berakhir sama:
   * simulator menulis adegannya. Pemain tidak pernah melihat galat.
   */
  private async tulis(
    context: StoryContext,
    playerAction: string | null,
  ): Promise<StoryEngineResult> {
    const userPrompt = buildStoryUserPrompt({
      worldTitle: context.worldTitle,
      premise: context.premise,
      synopsis: context.synopsis ?? '',
      persona: { name: context.personaName, age: context.personaAge ?? 0 },
      backgrounds: context.manifest.backgrounds.map((item) => ({
        assetId: item.assetId,
        label: item.label,
      })),
      characters: context.characters.map((item) => ({
        npcId: item.npcId,
        name: item.name,
        role: item.role,
        soul: item.soul,
        publicBackstory: item.publicBackstory,
        defaultPortraitAssetId: item.defaultPortraitAssetId,
        expressions: item.expressions,
      })),
      storySoFar: context.storySoFar ?? null,
      recentBeats: context.recentBeats ?? [],
      playerAction,
      // Bahasa pilihan pemain dibawa sampai ke prompt.
      responseLocale: context.responseLocale ?? 'id-ID',
    });

    /*
     * System prompt dibangun per permintaan, bukan konstanta.
     *
     * Aturan bahasanya harus mengikuti pilihan pemain; konstanta statis membuat
     * opsi "English" tidak berpengaruh apa pun.
     */
    const panggilan = await this.deps.call(
      storySystemPrompt(context.responseLocale ?? 'id-ID'),
      userPrompt,
    );
    if (!panggilan.ok) {
      return this.serahkanKeSimulator(context, playerAction, `panggilan gagal: ${panggilan.detail}`);
    }

    const diperiksa = periksaAdegan(panggilan.scene, context.manifest, context.characters);
    if (!diperiksa.ok) {
      return this.serahkanKeSimulator(context, playerAction, `adegan ditolak: ${diperiksa.reason}`);
    }

    return bungkusJadiHasil(diperiksa.events, context, this.estimatedTurnCost);
  }

  private async serahkanKeSimulator(
    context: StoryContext,
    playerAction: string | null,
    sebab: string,
  ): Promise<StoryEngineResult> {
    this.deps.onFailure?.(sebab);

    const konteks: StoryContext = {
      ...context,
      ...(playerAction !== null ? { customText: playerAction } : null),
    };

    return playerAction === null
      ? this.deps.fallback.generateOpening(konteks)
      : this.deps.fallback.generateTurn(konteks);
  }
}

/** Yang dilakukan pemain: aksi bebas bila ada, selain itu label opsinya. */
export function aksiPemain(context: StoryContext): string | null {
  if (context.customText && context.customText.trim().length > 0) {
    return context.customText.trim();
  }
  if (context.optionLabel && context.optionLabel.trim().length > 0) {
    return context.optionLabel.trim();
  }
  return null;
}

export type PeriksaHasil =
  | { ok: true; events: StoryEvent[] }
  | { ok: false; reason: RejectReason };

/**
 * Memeriksa adegan dari model terhadap daftar aset yang sah.
 *
 * Diekspor supaya dapat diuji tanpa memanggil model — dan supaya aturannya
 * terlihat sebagai daftar, bukan tersembunyi di dalam alur.
 */
/**
 * Mencocokkan ekspresi yang diminta model dengan daftar yang sah.
 *
 * Kecocokan PERSIS diutamakan. Bila gagal, dicoba kecocokan berdasarkan
 * SEGMEN PERTAMA: nama ekspresi di panel admin berbentuk frasa berkoma
 * ("senyum, pakaian kantor, mengangkat tangan"), dan model wajar menuliskan
 * bentuk pendeknya saja ("senyum").
 *
 * Mengapa toleransi ini perlu: satu ekspresi yang tidak dikenali membuat
 * SELURUH adegan ditolak (`periksaAdegan` berhenti pada kegagalan pertama),
 * lalu seluruh giliran jatuh ke simulator. Akibatnya bukan sekadar potret yang
 * salah — ceritanya berhenti maju, dan pemain melihatnya sebagai "loop".
 *
 * Yang dikembalikan selalu salah satu nilai dari `daftar`, sehingga nilai yang
 * tersimpan tetap sah dan tidak ada ekspresi karangan yang lolos.
 */
export function cocokkanEkspresi(daftar: string[], diminta: string): string | undefined {
  if (daftar.includes(diminta)) {
    return diminta;
  }
  const segmenPertama = (nilai: string) => nilai.split(',')[0]?.trim().toLowerCase() ?? '';
  const kunci = segmenPertama(diminta);
  if (kunci.length === 0) {
    return undefined;
  }
  return daftar.find((sah) => segmenPertama(sah) === kunci);
}

export function periksaAdegan(
  mentah: unknown,
  manifest: AssetManifest,
  characters: NPCPublicDTO[],
): PeriksaHasil {
  if (!mentah || typeof mentah !== 'object' || Array.isArray(mentah)) {
    return { ok: false, reason: 'bukan-objek' };
  }

  const rekaman = mentah as Record<string, unknown>;
  const beats = rekaman.beats;

  if (!Array.isArray(beats)) {
    return { ok: false, reason: 'beats-bukan-array' };
  }
  if (beats.length === 0) {
    return { ok: false, reason: 'beats-kosong' };
  }
  if (beats.length > MAX_SCENE_BEATS) {
    return { ok: false, reason: 'terlalu-banyak-beat' };
  }

  const latarSah = new Set(manifest.backgrounds.map((item) => item.assetId));
  const potretSah = new Set(manifest.portraits.map((item) => item.assetId));
  const npcSah = new Map(characters.map((item) => [item.npcId, item]));

  const events: StoryEvent[] = [];

  for (const item of beats) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, reason: 'event-tidak-dikenal' };
    }
    const peristiwa = item as Record<string, unknown>;

    switch (peristiwa.type) {
      case 'narrate': {
        if (typeof peristiwa.text !== 'string') {
          return { ok: false, reason: 'event-tidak-dikenal' };
        }
        events.push({ type: 'narrate', text: peristiwa.text.trim() });
        break;
      }

      case 'setBackground': {
        if (typeof peristiwa.assetId !== 'string' || !latarSah.has(peristiwa.assetId)) {
          return { ok: false, reason: 'asset-tidak-dikenal' };
        }
        events.push({ type: 'setBackground', assetId: peristiwa.assetId });
        break;
      }

      case 'showCharacter': {
        const npc = typeof peristiwa.npcId === 'string' ? npcSah.get(peristiwa.npcId) : undefined;
        if (!npc) {
          return { ok: false, reason: 'npc-tidak-dikenal' };
        }
        const ekspresi =
          typeof peristiwa.expression === 'string'
            ? cocokkanEkspresi(npc.expressions, peristiwa.expression)
            : undefined;
        if (!ekspresi) {
          return { ok: false, reason: 'ekspresi-tidak-dikenal' };
        }
        if (
          typeof peristiwa.assetId !== 'string' ||
          !potretSah.has(peristiwa.assetId)
        ) {
          return { ok: false, reason: 'asset-tidak-dikenal' };
        }
        events.push({
          type: 'showCharacter',
          npcId: npc.npcId,
          // Nilai dari DAFTAR, bukan dari model — tidak ada ekspresi karangan.
          expression: ekspresi,
          assetId: peristiwa.assetId,
        });
        break;
      }

      case 'hideCharacter': {
        if (typeof peristiwa.npcId !== 'string' || !npcSah.has(peristiwa.npcId)) {
          return { ok: false, reason: 'npc-tidak-dikenal' };
        }
        events.push({ type: 'hideCharacter', npcId: peristiwa.npcId });
        break;
      }

      case 'say': {
        if (typeof peristiwa.npcId !== 'string' || !npcSah.has(peristiwa.npcId)) {
          return { ok: false, reason: 'npc-tidak-dikenal' };
        }
        if (typeof peristiwa.text !== 'string') {
          return { ok: false, reason: 'event-tidak-dikenal' };
        }
        events.push({ type: 'say', npcId: peristiwa.npcId, text: peristiwa.text.trim() });
        break;
      }

      case 'relationshipDelta': {
        if (typeof peristiwa.npcId !== 'string' || !npcSah.has(peristiwa.npcId)) {
          return { ok: false, reason: 'npc-tidak-dikenal' };
        }
        events.push({
          type: 'relationshipDelta',
          npcId: peristiwa.npcId,
          status: peristiwa.status as never,
          reasonPublic: typeof peristiwa.reasonPublic === 'string' ? peristiwa.reasonPublic : '',
        });
        break;
      }

      default:
        // Termasuk `presentChoices` yang ditulis model di dalam beats: keputusan
        // punya tempatnya sendiri, dan bentuknya diperiksa di bawah.
        return { ok: false, reason: 'event-tidak-dikenal' };
    }
  }

  const keputusan = rekaman.decision;
  if (!keputusan || typeof keputusan !== 'object' || Array.isArray(keputusan)) {
    return { ok: false, reason: 'tanpa-keputusan' };
  }

  const opsi = (keputusan as Record<string, unknown>).options;
  if (!Array.isArray(opsi) || opsi.length !== 3) {
    return { ok: false, reason: 'opsi-bukan-tiga' };
  }

  const pilihan: ChoiceOption[] = [];
  for (const [urutan, satu] of opsi.entries()) {
    if (!satu || typeof satu !== 'object' || Array.isArray(satu)) {
      return { ok: false, reason: 'opsi-bukan-tiga' };
    }
    const r = satu as Record<string, unknown>;
    if (typeof r.label !== 'string' || r.label.trim().length === 0) {
      return { ok: false, reason: 'opsi-bukan-tiga' };
    }
    pilihan.push({
      // optionId DIBUAT ULANG, tidak dipercaya dari model: id yang bertabrakan
      // antar giliran akan membuat jawaban pemain menunjuk opsi yang salah.
      optionId: `opt${String(urutan + 1)}`,
      label: r.label.trim(),
      description: typeof r.description === 'string' ? r.description.trim() : '',
    });
  }

  const prompt = (keputusan as Record<string, unknown>).prompt;
  events.push({
    type: 'presentChoices',
    decisionId: 'd1',
    prompt: typeof prompt === 'string' && prompt.trim().length > 0 ? prompt.trim() : 'Apa yang kamu lakukan?',
    options: [pilihan[0]!, pilihan[1]!, pilihan[2]!],
  });

  return { ok: true, events };
}

/** Membungkus peristiwa menjadi beat, dengan id yang unik per giliran. */
function bungkusJadiHasil(
  events: StoryEvent[],
  context: StoryContext,
  biaya: number,
): StoryEngineResult {
  const awalan = context.beatIdPrefix ?? `t${String(context.turnOrdinal).padStart(3, '0')}`;

  const beats: Beat[] = events.map((event, index) => ({
    beatId: `${awalan}-b${String(index + 1).padStart(3, '0')}`,
    turnId: awalan,
    sequence: index + 1,
    event,
  }));

  return {
    beats,
    usage: { promptTokens: 0, completionTokens: 0, chargedTotal: biaya },
    modelId: 'ai-story',
    modelVersion: '1',
  };
}

/** Batas kata per beat, dipakai uji dan pemeriksaan panjang. */
export const BATAS_KATA_BEAT = MAX_BEAT_WORDS;
