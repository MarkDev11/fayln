/**
 * Mesin cerita.
 *
 * Status: **placeholder yang jujur.** Penyedia model belum diputuskan (O-08a/O-08b),
 * jadi implementasi ini menghasilkan giliran yang deterministik dan menandai
 * dirinya `simulator: true` di setiap envelope.
 *
 * Antarmuka ini sengaja ditulis sekarang supaya ketika model dipilih, yang berubah
 * hanya isi `generateTurn` — bukan route, bukan skema, bukan kontrak.
 *
 * Yang TIDAK boleh dilakukan mesin ini:
 * - Mengembalikan perintah yang tidak ada di daftar event (FR-55).
 * - Mengubah tier, kuota, atau menjalankan kode.
 * - Mengarang aset yang tidak ada di manifest dunia.
 */

import type { AssetManifest, Beat, ChoiceOption, NPCPublicDTO, StoryEvent } from '../contracts/types';

export type StoryContext = {
  worldTitle: string;
  premise: string;
  characters: NPCPublicDTO[];
  manifest: AssetManifest;
  personaName: string;
  /** Aksi bebas pemain, bila giliran ini berasal dari input teks. */
  customText?: string;
  /** Opsi yang dipilih, bila giliran ini berasal dari pilihan. */
  optionId?: string;
  /** Nomor turn, dipakai membuat ID yang stabil. */
  turnOrdinal: number;
};

export type StoryEngineResult = {
  beats: { beatId: string; sequence: number; event: StoryEvent }[];
  usage: { promptTokens: number; completionTokens: number; chargedTotal: number };
  modelId: string;
  modelVersion: string;
};

export interface StoryEngine {
  readonly isSimulator: boolean;
  /**
   * Perkiraan biaya satu giliran, dipakai untuk memutuskan SEBELUM memanggil
   * model apakah kuota pemain cukup (FR-50). Tanpa ini, generasi tetap berjalan
   * lalu menagih melebihi batas paket.
   */
  readonly estimatedTurnCost: number;
  generateOpening(context: StoryContext): Promise<StoryEngineResult>;
  generateTurn(context: StoryContext): Promise<StoryEngineResult>;
}

/** Model simulasi. Bukan nama model produksi dan bukan janji apa pun. */
export const SIMULATOR_MODEL_ID = 'simulator/deterministic-v1';
const SIMULATOR_MODEL_VERSION = '1.0.0';

/** Perkiraan biaya satu giliran pada simulator; bukan tokenisasi model nyata. */
const SIM_PROMPT_TOKENS = 18_240;
const SIM_COMPLETION_TOKENS = 640;

function choiceOptions(): [ChoiceOption, ChoiceOption, ChoiceOption] {
  return [
    {
      optionId: 'opt1',
      label: 'Minta maaf secara profesional',
      description: 'Akui keterlambatan tanpa membela diri, lalu tanyakan arahan kerja.',
    },
    {
      optionId: 'opt2',
      label: 'Jelaskan singkat dan minta arahan',
      description: 'Sebut alasan seperlunya, lalu fokus pada pekerjaan yang harus dimulai.',
    },
    {
      optionId: 'opt3',
      label: 'Coba meredakan dengan humor',
      description: 'Pakai nada ringan untuk mencairkan suasana, dengan risiko ditanggapi dingin.',
    },
  ];
}

/**
 * Mengubah aksi bebas menjadi respons.
 *
 * Aksi pemain adalah UPAYA, bukan perintah yang pasti berhasil (FR-57). Aksi yang
 * melewati batas profesional menghasilkan teguran dan menaikkan kewaspadaan —
 * bukan kepatuhan.
 */
function customActionBeats(
  turnId: string,
  context: StoryContext,
): { beatId: string; sequence: number; event: StoryEvent }[] {
  const text = (context.customText ?? '').toLowerCase();
  const crossing =
    text.includes('kabedon') ||
    text.includes('mendekati') ||
    text.includes('menyentuh') ||
    text.includes('menarik');

  const primary = context.characters[0];
  const secondary = context.characters[1];

  const events: StoryEvent[] = [];

  if (crossing && primary) {
    events.push({
      type: 'narrate',
      text: 'Kamu mendekat melewati jarak yang pantas di lingkungan kerja. Ia tidak mundur, tetapi sorot matanya berubah.',
    });
    events.push({
      type: 'showCharacter',
      npcId: primary.npcId,
      expression: primary.expressions.includes('kesal') ? 'kesal' : (primary.expressions[0] ?? 'netral'),
      assetId: primary.defaultPortraitAssetId,
    });
    events.push({
      type: 'say',
      npcId: primary.npcId,
      text: 'Sikapmu masih sama saja seperti dulu. Satu kali lagi, aku tidak akan sekadar menegur.',
    });
    events.push({
      type: 'relationshipDelta',
      npcId: primary.npcId,
      status: 'waspada',
      reasonPublic: 'Ia menilai perilakumu melewati batas profesional.',
    });

    if (secondary) {
      events.push({
        type: 'showCharacter',
        npcId: secondary.npcId,
        expression: secondary.expressions[0] ?? 'netral',
        assetId: secondary.defaultPortraitAssetId,
      });
      events.push({
        type: 'say',
        npcId: secondary.npcId,
        text: 'Haha, kalian ini masih saja seperti dulu.',
      });
    }
  } else if (primary) {
    events.push({
      type: 'narrate',
      text: `Kamu memilih bertindak: "${context.customText ?? ''}". Ia memperhatikanmu sebentar sebelum menanggapi.`,
    });
    events.push({
      type: 'showCharacter',
      npcId: primary.npcId,
      expression: primary.expressions[0] ?? 'netral',
      assetId: primary.defaultPortraitAssetId,
    });
    events.push({
      type: 'say',
      npcId: primary.npcId,
      text: 'Baik. Kita lihat apakah caramu itu berguna untuk pekerjaan ini.',
    });
    events.push({
      type: 'relationshipDelta',
      npcId: primary.npcId,
      status: 'normal',
      reasonPublic: 'Ia belum menilai tindakanmu sebagai pelanggaran.',
    });
  }

  events.push({
    type: 'presentChoices',
    decisionId: `d${String(context.turnOrdinal).padStart(3, '0')}`,
    prompt: 'Apa yang kamu lakukan berikutnya?',
    options: choiceOptions(),
  });

  return events.map((event, index) => ({
    beatId: `${turnId}-b${String(index + 1).padStart(3, '0')}`,
    sequence: index + 1,
    event,
  }));
}

export class DeterministicStoryEngine implements StoryEngine {
  readonly isSimulator = true;
  readonly estimatedTurnCost = SIM_PROMPT_TOKENS + SIM_COMPLETION_TOKENS;

  async generateOpening(context: StoryContext): Promise<StoryEngineResult> {
    const turnId = `t${String(context.turnOrdinal).padStart(3, '0')}`;
    const firstBackground = context.manifest.backgrounds[0]?.assetId;
    const primary = context.characters[0];

    const events: StoryEvent[] = [];
    if (firstBackground) {
      events.push({ type: 'setBackground', assetId: firstBackground });
    }
    events.push({ type: 'narrate', text: context.premise });

    const secondBackground = context.manifest.backgrounds[1]?.assetId;
    if (secondBackground) {
      events.push({ type: 'setBackground', assetId: secondBackground });
    }

    if (primary) {
      events.push({
        type: 'showCharacter',
        npcId: primary.npcId,
        expression: primary.expressions[0] ?? 'netral',
        assetId: primary.defaultPortraitAssetId,
      });
      events.push({
        type: 'say',
        npcId: primary.npcId,
        text: `${context.personaName}. Kita mulai dari sini.`,
      });
    }

    events.push({
      type: 'presentChoices',
      decisionId: 'd001',
      prompt: 'Apa langkah pertamamu?',
      options: choiceOptions(),
    });

    return {
      beats: events.map((event, index) => ({
        beatId: `${turnId}-b${String(index + 1).padStart(3, '0')}`,
        sequence: index + 1,
        event,
      })),
      usage: {
        promptTokens: SIM_PROMPT_TOKENS,
        completionTokens: SIM_COMPLETION_TOKENS,
        chargedTotal: SIM_PROMPT_TOKENS + SIM_COMPLETION_TOKENS,
      },
      modelId: SIMULATOR_MODEL_ID,
      modelVersion: SIMULATOR_MODEL_VERSION,
    };
  }

  async generateTurn(context: StoryContext): Promise<StoryEngineResult> {
    const turnId = `t${String(context.turnOrdinal).padStart(3, '0')}`;
    const beats = customActionBeats(turnId, context);

    return {
      beats,
      usage: {
        promptTokens: SIM_PROMPT_TOKENS,
        completionTokens: SIM_COMPLETION_TOKENS,
        chargedTotal: SIM_PROMPT_TOKENS + SIM_COMPLETION_TOKENS,
      },
      modelId: SIMULATOR_MODEL_ID,
      modelVersion: SIMULATOR_MODEL_VERSION,
    };
  }
}

/** Beat yang boleh diputar frontend. Dipakai memastikan mesin tidak keluar jalur. */
export const ALLOWED_EVENT_TYPES: readonly StoryEvent['type'][] = [
  'setBackground',
  'showCharacter',
  'hideCharacter',
  'say',
  'narrate',
  'presentChoices',
  'relationshipDelta',
  'setFlag',
  'memoryWrite',
  'endArc',
];

export type BeatValidationIssue = { beatId: string; reason: string };

/**
 * Memvalidasi keluaran mesin terhadap dunia SEBELUM disimpan.
 *
 * Ini pengaman utama FR-55: model tidak boleh menyebut aset, karakter, atau tipe
 * event yang tidak ada. Keluaran yang gagal tidak disimpan sama sekali.
 */
export function validateEngineBeats(
  beats: { beatId: string; sequence: number; event: StoryEvent }[],
  context: StoryContext,
): BeatValidationIssue[] {
  const issues: BeatValidationIssue[] = [];
  const npcIds = new Set(context.characters.map((character) => character.npcId));
  const backgroundIds = new Set(context.manifest.backgrounds.map((asset) => asset.assetId));

  let lastSequence = 0;

  for (const beat of beats) {
    const event = beat.event;

    if (!ALLOWED_EVENT_TYPES.includes(event.type)) {
      issues.push({ beatId: beat.beatId, reason: `Tipe event tidak diizinkan: ${event.type}` });
      continue;
    }

    if (beat.sequence <= lastSequence) {
      issues.push({ beatId: beat.beatId, reason: 'Urutan beat tidak menaik.' });
    }
    lastSequence = beat.sequence;

    switch (event.type) {
      case 'setBackground':
        if (!backgroundIds.has(event.assetId)) {
          issues.push({ beatId: beat.beatId, reason: `Latar tidak ada di manifest: ${event.assetId}` });
        }
        break;
      case 'showCharacter':
      case 'say':
      case 'hideCharacter':
      case 'relationshipDelta':
        if (!npcIds.has(event.npcId)) {
          issues.push({ beatId: beat.beatId, reason: `Karakter tidak ada di dunia: ${event.npcId}` });
        }
        if (event.type === 'relationshipDelta' && event.reasonPublic.trim().length === 0) {
          issues.push({ beatId: beat.beatId, reason: 'Perubahan hubungan tanpa alasan publik.' });
        }
        break;
      case 'presentChoices':
        if (event.options.length !== 3) {
          issues.push({ beatId: beat.beatId, reason: 'Keputusan harus berisi tepat tiga opsi.' });
        }
        break;
      default:
        break;
    }
  }

  return issues;
}

/** Dipakai pengujian dan route untuk memastikan tipe Beat tetap konsisten. */
export type EngineBeat = Beat;
