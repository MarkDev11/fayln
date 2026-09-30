/**
 * Validasi sisi klien sebelum sebuah beat boleh diputar.
 *
 * Prinsip (docs/09 §5, FR-55): frontend tidak pernah mempercayai payload apa adanya.
 * Validasi ini BUKAN pengganti validasi server — ia mencegah UI merender data
 * yang tidak konsisten, dan memberi pesan aman alih-alih crash.
 */

import {
  coerceRelationStatus,
  EVENT_TYPES,
  isRelationStatus,
  type AssetManifest,
  type Beat,
  type PresentChoicesEvent,
  type StoryEvent,
  type WorldDetailDTO,
} from './types';

/** Batas panjang teks yang boleh dirender. Bukan batas server. */
export const MAX_NARRATION_CHARS = 4000;
export const MAX_DIALOGUE_CHARS = 2000;
export const MAX_CHOICE_LABEL_CHARS = 120;
export const MAX_CHOICE_DESCRIPTION_CHARS = 240;

export type ValidationIssue = {
  beatId: string;
  code:
    | 'UNKNOWN_EVENT'
    | 'ASSET_NOT_IN_MANIFEST'
    | 'NPC_NOT_IN_WORLD'
    | 'EXPRESSION_UNAVAILABLE'
    | 'RELATION_UNKNOWN_STATUS'
    | 'RELATION_MISSING_REASON'
    | 'TEXT_TOO_LONG'
    | 'TEXT_EMPTY'
    | 'TEXT_HAS_CONTROL_CHARS'
    | 'CHOICES_NOT_THREE'
    | 'CHOICES_DUPLICATE_ID'
    | 'CHOICE_TEXT_TOO_LONG'
    | 'SEQUENCE_NOT_MONOTONIC';
  /** Pesan internal untuk log pengembang; tidak ditampilkan apa adanya ke pemain. */
  detail: string;
};

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function isKnownEventType(value: unknown): boolean {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

export function hasUnsafeText(text: string, maxChars: number): 'empty' | 'tooLong' | 'control' | null {
  if (text.trim().length === 0) {
    return 'empty';
  }
  if (text.length > maxChars) {
    return 'tooLong';
  }
  if (CONTROL_CHARS.test(text)) {
    return 'control';
  }
  return null;
}

function validateChoices(event: PresentChoicesEvent, beatId: string, issues: ValidationIssue[]) {
  const options = event.options;
  if (!Array.isArray(options) || options.length !== 3) {
    issues.push({
      beatId,
      code: 'CHOICES_NOT_THREE',
      detail: `presentChoices harus berisi tepat 3 opsi, ditemukan ${options?.length ?? 0}.`,
    });
    return;
  }

  const ids = new Set<string>();
  for (const option of options) {
    if (ids.has(option.optionId)) {
      issues.push({
        beatId,
        code: 'CHOICES_DUPLICATE_ID',
        detail: `optionId duplikat: ${option.optionId}.`,
      });
    }
    ids.add(option.optionId);

    if (option.label.length > MAX_CHOICE_LABEL_CHARS) {
      issues.push({
        beatId,
        code: 'CHOICE_TEXT_TOO_LONG',
        detail: `Label opsi ${option.optionId} melebihi ${MAX_CHOICE_LABEL_CHARS} karakter.`,
      });
    }
    if (option.description.length > MAX_CHOICE_DESCRIPTION_CHARS) {
      issues.push({
        beatId,
        code: 'CHOICE_TEXT_TOO_LONG',
        detail: `Deskripsi opsi ${option.optionId} melebihi ${MAX_CHOICE_DESCRIPTION_CHARS} karakter.`,
      });
    }
  }
}

function validateEvent(
  event: StoryEvent,
  beatId: string,
  world: WorldDetailDTO,
  issues: ValidationIssue[],
) {
  const manifest: AssetManifest = world.assetManifest;
  const npcIds = new Set(world.characters.map((character) => character.npcId));
  const backgroundIds = new Set(manifest.backgrounds.map((asset) => asset.assetId));

  switch (event.type) {
    case 'setBackground': {
      if (!backgroundIds.has(event.assetId)) {
        issues.push({
          beatId,
          code: 'ASSET_NOT_IN_MANIFEST',
          detail: `Latar ${event.assetId} tidak ada di manifest world ${world.worldId}.`,
        });
      }
      break;
    }
    case 'showCharacter': {
      if (!npcIds.has(event.npcId)) {
        issues.push({
          beatId,
          code: 'NPC_NOT_IN_WORLD',
          detail: `NPC ${event.npcId} tidak terdaftar di world ${world.worldId}.`,
        });
        break;
      }
      const character = world.characters.find((item) => item.npcId === event.npcId);
      if (character && !character.expressions.includes(event.expression)) {
        issues.push({
          beatId,
          code: 'EXPRESSION_UNAVAILABLE',
          detail: `Ekspresi "${event.expression}" tidak tersedia untuk ${event.npcId}.`,
        });
      }
      break;
    }
    case 'hideCharacter': {
      if (!npcIds.has(event.npcId)) {
        issues.push({
          beatId,
          code: 'NPC_NOT_IN_WORLD',
          detail: `NPC ${event.npcId} tidak terdaftar di world ${world.worldId}.`,
        });
      }
      break;
    }
    case 'say': {
      if (!npcIds.has(event.npcId)) {
        issues.push({
          beatId,
          code: 'NPC_NOT_IN_WORLD',
          detail: `Dialog memakai NPC ${event.npcId} yang tidak terdaftar.`,
        });
      }
      const problem = hasUnsafeText(event.text, MAX_DIALOGUE_CHARS);
      if (problem === 'empty') {
        issues.push({ beatId, code: 'TEXT_EMPTY', detail: 'Dialog kosong.' });
      } else if (problem === 'tooLong') {
        issues.push({
          beatId,
          code: 'TEXT_TOO_LONG',
          detail: `Dialog melebihi ${MAX_DIALOGUE_CHARS} karakter.`,
        });
      } else if (problem === 'control') {
        issues.push({
          beatId,
          code: 'TEXT_HAS_CONTROL_CHARS',
          detail: 'Dialog memuat karakter kontrol.',
        });
      }
      break;
    }
    case 'narrate': {
      const problem = hasUnsafeText(event.text, MAX_NARRATION_CHARS);
      if (problem === 'empty') {
        issues.push({ beatId, code: 'TEXT_EMPTY', detail: 'Narasi kosong.' });
      } else if (problem === 'tooLong') {
        issues.push({
          beatId,
          code: 'TEXT_TOO_LONG',
          detail: `Narasi melebihi ${MAX_NARRATION_CHARS} karakter.`,
        });
      } else if (problem === 'control') {
        issues.push({
          beatId,
          code: 'TEXT_HAS_CONTROL_CHARS',
          detail: 'Narasi memuat karakter kontrol.',
        });
      }
      break;
    }
    case 'presentChoices': {
      validateChoices(event, beatId, issues);
      break;
    }
    case 'relationshipDelta': {
      if (!npcIds.has(event.npcId)) {
        issues.push({
          beatId,
          code: 'NPC_NOT_IN_WORLD',
          detail: `Perubahan hubungan memakai NPC ${event.npcId} yang tidak terdaftar.`,
        });
      }
      if (!isRelationStatus(event.status)) {
        issues.push({
          beatId,
          code: 'RELATION_UNKNOWN_STATUS',
          detail: `Status hubungan "${String(event.status)}" tidak dikenal.`,
        });
      }
      if (!event.reasonPublic || event.reasonPublic.trim().length === 0) {
        issues.push({
          beatId,
          code: 'RELATION_MISSING_REASON',
          detail: 'Perubahan hubungan tanpa alasan publik akan ditolak.',
        });
      }
      break;
    }
    case 'setFlag':
    case 'memoryWrite':
    case 'endArc': {
      // Tidak memerlukan aset; batas panjang tetap dijaga untuk teks yang dirender.
      if (event.type === 'memoryWrite' && event.summary.length > MAX_NARRATION_CHARS) {
        issues.push({
          beatId,
          code: 'TEXT_TOO_LONG',
          detail: 'Ringkasan memori terlalu panjang.',
        });
      }
      break;
    }
    default: {
      issues.push({
        beatId,
        code: 'UNKNOWN_EVENT',
        detail: `Tipe event tidak dikenal: ${String((event as { type?: unknown }).type)}.`,
      });
    }
  }
}

/**
 * Memvalidasi seluruh beat pada satu envelope terhadap world yang dipakai journey.
 * Beat yang gagal divalidasi tidak boleh diputar.
 */
export function validateBeats(beats: Beat[], world: WorldDetailDTO): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let lastSequence = -1;

  for (const beat of beats) {
    if (!isKnownEventType(beat.event?.type)) {
      issues.push({
        beatId: beat.beatId,
        code: 'UNKNOWN_EVENT',
        detail: `Beat ${beat.beatId} memakai event tak dikenal.`,
      });
      continue;
    }
    if (beat.sequence <= lastSequence) {
      issues.push({
        beatId: beat.beatId,
        code: 'SEQUENCE_NOT_MONOTONIC',
        detail: `Urutan beat ${beat.sequence} tidak menaik setelah ${lastSequence}.`,
      });
    }
    lastSequence = beat.sequence;
    validateEvent(beat.event, beat.beatId, world, issues);
  }

  return issues;
}

/** Memvalidasi satu event secara mandiri; dipakai pengujian unit. */
export function validateSingleEvent(
  event: StoryEvent,
  beatId: string,
  world: WorldDetailDTO,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isKnownEventType(event?.type)) {
    issues.push({
      beatId,
      code: 'UNKNOWN_EVENT',
      detail: `Tipe event tidak dikenal: ${String((event as { type?: unknown })?.type)}.`,
    });
    return issues;
  }
  validateEvent(event, beatId, world, issues);
  return issues;
}

export { coerceRelationStatus };
