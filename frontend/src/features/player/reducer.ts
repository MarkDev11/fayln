/**
 * Reducer pemutaran — murni, tanpa efek samping, tanpa I/O.
 *
 * Semua keputusan sulit ada di sini supaya dapat diuji tanpa perangkat:
 * - Beat mana yang butuh tap dan mana yang diterapkan otomatis.
 * - Hubungan hanya berubah ketika beat penyebabnya BENAR-BENAR sudah dibaca (AC-11).
 * - Keputusan memblokir kemajuan sampai pemain memilih (FR-17).
 * - Turn yang sama tidak pernah diterapkan dua kali (FR-52).
 */

import {
  clampAutoDelay,
  createEmptyPlaybackState,
  type PendingDecision,
  type PlaybackState,
  type PlayerAction,
  type PresentedLine,
  type PresentedScene,
  type SceneNotice,
} from './types';

import { coerceRelationStatus, type Beat, type RelationEntry, type StoryEvent } from '@/domain/types';

/** Event yang tidak memerlukan tap: perubahan panggung dan state. */
const INSTANT_EVENTS = new Set<StoryEvent['type']>([
  'setBackground',
  'showCharacter',
  'hideCharacter',
  'relationshipDelta',
  'setFlag',
  'memoryWrite',
  'endArc',
]);

export function isReadableEvent(event: StoryEvent): boolean {
  return event.type === 'narrate' || event.type === 'say';
}

export function isDecisionEvent(event: StoryEvent): boolean {
  return event.type === 'presentChoices';
}

export function isInstantEvent(event: StoryEvent): boolean {
  return INSTANT_EVENTS.has(event.type);
}

/**
 * Menambahkan beat baru dengan mempertahankan urutan kedatangan.
 *
 * PENTING: `sequence` dimulai ulang pada setiap turn (1..n di dalam turn), jadi
 * mengurutkan seluruh beat berdasarkan `sequence` akan mengacak urutan antar-turn.
 * Urutan benar adalah urutan kedatangan envelope, yang sudah kronologis.
 * Duplikat ditolak berdasarkan `beatId` (FR-52).
 */
export function appendBeats(existing: Beat[], incoming: Beat[]): Beat[] {
  if (incoming.length === 0) {
    return existing;
  }
  const known = new Set(existing.map((beat) => beat.beatId));
  const fresh = incoming.filter((beat) => !known.has(beat.beatId));
  if (fresh.length === 0) {
    return existing;
  }
  return [...existing, ...fresh];
}

function applyScene(scene: PresentedScene, event: StoryEvent): PresentedScene {
  switch (event.type) {
    case 'setBackground':
      return { ...scene, backgroundAssetId: event.assetId };
    case 'showCharacter':
      return {
        ...scene,
        focusNpcId: event.npcId,
        focusExpression: event.expression,
        focusPortraitAssetId: event.assetId,
        visibleNpcIds: scene.visibleNpcIds.includes(event.npcId)
          ? scene.visibleNpcIds
          : [...scene.visibleNpcIds, event.npcId],
      };
    case 'hideCharacter': {
      const visible = scene.visibleNpcIds.filter((id) => id !== event.npcId);
      const isFocus = scene.focusNpcId === event.npcId;
      return {
        ...scene,
        visibleNpcIds: visible,
        focusNpcId: isFocus ? null : scene.focusNpcId,
        focusExpression: isFocus ? null : scene.focusExpression,
        focusPortraitAssetId: isFocus ? null : scene.focusPortraitAssetId,
      };
    }
    default:
      return scene;
  }
}

function applyRelation(
  relations: RelationEntry[],
  event: StoryEvent,
  turnId: string,
): RelationEntry[] {
  if (event.type !== 'relationshipDelta') {
    return relations;
  }

  const status = coerceRelationStatus(event.status);
  const next: RelationEntry = {
    npcId: event.npcId,
    status,
    reasonPublic: event.reasonPublic,
    updatedAtTurnId: turnId,
  };

  const index = relations.findIndex((entry) => entry.npcId === event.npcId);
  if (index === -1) {
    return [...relations, next];
  }
  const copy = [...relations];
  copy[index] = next;
  return copy;
}

function makeNotice(event: StoryEvent, beatId: string): SceneNotice | null {
  if (event.type !== 'relationshipDelta') {
    return null;
  }
  return {
    id: `${beatId}-notice`,
    kind: 'relationship',
    npcId: event.npcId,
    status: coerceRelationStatus(event.status),
    reasonPublic: event.reasonPublic,
  };
}

/**
 * Merekonstruksi panggung dan hubungan dari beat yang sudah dibaca.
 *
 * Dipakai saat memulihkan posisi baca: beat 0..upto diterapkan TANPA menampilkan
 * barisnya, sehingga pemain kembali ke keadaan yang benar lalu melanjutkan dari
 * baris berikutnya (AC-17). Pemberitahuan hubungan sengaja tidak diputar ulang.
 */
export function derivePresented(
  beats: Beat[],
  upto: number,
  initialRelations: RelationEntry[],
): { scene: PresentedScene; relations: RelationEntry[] } {
  let scene: PresentedScene = {
    backgroundAssetId: null,
    focusNpcId: null,
    focusExpression: null,
    focusPortraitAssetId: null,
    visibleNpcIds: [],
  };
  let relations = initialRelations;

  const limit = Math.min(Math.max(0, upto), beats.length);
  for (let index = 0; index < limit; index += 1) {
    const beat = beats[index];
    if (!beat) {
      continue;
    }
    if (isInstantEvent(beat.event)) {
      scene = applyScene(scene, beat.event);
      relations = applyRelation(relations, beat.event, beat.turnId);
    }
  }

  return { scene, relations };
}

/**
 * Mengonsumsi beat mulai dari `cursor` sampai menemukan beat yang dapat dibaca
 * atau sebuah keputusan. Beat instan di antaranya diterapkan tanpa tap.
 */
function consume(state: PlaybackState): PlaybackState {
  let cursor = state.cursor;
  let scene = state.scene;
  let relations = state.relations;
  let line: PresentedLine | null = state.line;
  let decision: PendingDecision | null = null;
  let notices = state.notices;
  let consumedReadable = false;

  while (cursor < state.beats.length) {
    const beat = state.beats[cursor];
    if (!beat) {
      break;
    }
    cursor += 1;

    const event = beat.event;

    if (isInstantEvent(event)) {
      scene = applyScene(scene, event);
      if (event.type === 'relationshipDelta') {
        relations = applyRelation(relations, event, beat.turnId);
        const notice = makeNotice(event, beat.beatId);
        if (notice) {
          notices = [...notices, notice];
        }
      }
      continue;
    }

    if (isDecisionEvent(event) && event.type === 'presentChoices') {
      decision = {
        beatId: beat.beatId,
        decisionId: event.decisionId,
        prompt: event.prompt,
        options: [...event.options],
      };
      break;
    }

    if (isReadableEvent(event)) {
      if (event.type === 'narrate') {
        line = {
          beatId: beat.beatId,
          kind: 'narrate',
          speakerNpcId: null,
          text: event.text,
        };
      } else if (event.type === 'say') {
        line = {
          beatId: beat.beatId,
          kind: 'say',
          speakerNpcId: event.npcId,
          text: event.text,
        };
        // Pembicara menjadi fokus bila portrait-nya tersedia pada beat ini.
        scene = {
          ...scene,
          focusNpcId: event.npcId,
        };
      }
      consumedReadable = true;
      break;
    }

    // Event tak dikenal sudah ditolak validator; lewati agar tidak macet.
  }

  return {
    ...state,
    cursor,
    scene,
    relations,
    notices,
    line,
    decision,
    lineRevealed: consumedReadable ? false : state.lineRevealed,
    status: 'idle',
  };
}

export function playerReducer(state: PlaybackState, action: PlayerAction): PlaybackState {
  switch (action.type) {
    case 'LOADED': {
      const base = createEmptyPlaybackState({
        journeyId: action.payload.journeyId,
        worldId: action.payload.worldId,
        worldVersion: action.payload.worldVersion,
        personaName: action.payload.personaName,
        beats: action.payload.beats,
        relations: action.payload.relations,
        memory: action.payload.memory,
        simulator: action.payload.simulator,
        status: 'idle',
      });

      const startCursor = Math.min(
        Math.max(0, action.payload.startCursor ?? 0),
        base.beats.length,
      );

      // Pulihkan panggung dan hubungan pada posisi baca, tanpa memutar ulang teks.
      const rebuilt = derivePresented(base.beats, startCursor, base.relations);
      const restored: PlaybackState = {
        ...base,
        cursor: startCursor,
        scene: rebuilt.scene,
        relations: rebuilt.relations,
      };

      // Lanjutkan ke baris berikutnya yang belum dibaca.
      return consume(restored);
    }

    case 'REVEAL_LINE': {
      if (state.lineRevealed) {
        return state;
      }
      return { ...state, lineRevealed: true };
    }

    case 'ADVANCE': {
      // FR-16: tap pertama menyelesaikan teks, tap berikutnya melanjutkan beat.
      if (!state.lineRevealed) {
        return { ...state, lineRevealed: true };
      }
      // Keputusan memblokir kemajuan sampai pemain memilih.
      if (state.decision) {
        return state;
      }
      if (state.status === 'submitting') {
        return state;
      }
      if (state.cursor >= state.beats.length) {
        return state;
      }
      return consume(state);
    }

    case 'SET_DRAFT':
      return { ...state, draft: action.text };

    case 'SUBMIT_START':
      return {
        ...state,
        status: 'submitting',
        error: null,
        activeOperationId: action.operationId,
        auto: false,
      };

    case 'TURN_COMMITTED': {
      const envelope = action.envelope;

      // Turn yang sudah dibatalkan pemain tidak boleh bangkit kembali (AC-10).
      if (state.abandonedOperationIds.includes(envelope.operationId)) {
        return { ...state, status: 'idle', activeOperationId: null };
      }

      // Hasil terlambat tidak boleh menimpa cerita yang lebih baru (AC-09).
      if (envelope.revision <= state.revision) {
        return { ...state, status: 'idle', activeOperationId: null };
      }

      const beats = appendBeats(state.beats, envelope.beats);
      const next = consume({
        ...state,
        beats,
        decision: null,
        draft: '',
        status: 'idle',
        error: null,
        activeOperationId: null,
        revision: envelope.revision,
        memory: envelope.memory,
        simulator: envelope.simulator,
      });
      return next;
    }

    case 'SUBMIT_CANCELLED': {
      if (state.status !== 'submitting') {
        return state;
      }
      // Aman dibatalkan: keputusan, draft, dan posisi baca tidak tersentuh.
      const abandoned = state.activeOperationId
        ? [...state.abandonedOperationIds, state.activeOperationId]
        : state.abandonedOperationIds;
      return {
        ...state,
        status: 'idle',
        activeOperationId: null,
        abandonedOperationIds: abandoned,
      };
    }

    case 'SUBMIT_FAILED':
      return {
        ...state,
        status: state.decision ? 'blocked' : 'idle',
        error: action.error,
        // Draft dan cursor tidak dihapus saat gagal (FR-24, NFR-13).
      };

    case 'DISMISS_NOTICE':
      return { ...state, notices: state.notices.filter((notice) => notice.id !== action.id) };

    case 'SET_AUTO': {
      // Auto tidak pernah aktif saat keputusan menunggu pilihan (FR-20).
      const enabled = action.enabled && state.decision === null;
      return { ...state, auto: enabled };
    }

    case 'SET_AUTO_DELAY':
      return { ...state, autoDelayMs: clampAutoDelay(action.delayMs) };

    case 'RESET':
      return action.payload;

    default:
      return state;
  }
}
