/**
 * Tipe state pemutaran visual novel.
 *
 * Pemisahan tiga lapis (D-16, docs/06 §1):
 * - **canonical** — seluruh beat yang sudah di-commit. Sumber kebenaran.
 * - **presented** — hasil penerapan beat sampai posisi baca pemain.
 * - **replay** — posisi baca ulang di Log; tidak mengubah dua lapis di atas.
 *
 * State di sini murni dan dapat diserialkan; efek samping ada di engine.
 */

import type {
  Beat,
  ChoiceOption,
  GatewayError,
  MemorySnapshot,
  RelationEntry,
  TurnResultEnvelope,
} from '@/domain/types';

/** Adegan yang sedang tampil: latar dan pemeran. */
export type PresentedScene = {
  backgroundAssetId: string | null;
  /** NPC yang sedang berbicara atau ditonjolkan. */
  focusNpcId: string | null;
  focusExpression: string | null;
  focusPortraitAssetId: string | null;
  /** NPC yang masih berada di panggung (belum di-hide). */
  visibleNpcIds: string[];
};

/** Baris teks yang sedang menunggu dibaca pemain. */
export type PresentedLine = {
  beatId: string;
  kind: 'narrate' | 'say';
  speakerNpcId: string | null;
  text: string;
};

/** Keputusan yang sedang menunggu pilihan pemain. */
export type PendingDecision = {
  beatId: string;
  decisionId: string;
  prompt: string;
  options: ChoiceOption[];
};

/** Pemberitahuan singkat yang muncul setelah sebuah beat diterapkan. */
export type SceneNotice = {
  id: string;
  kind: 'relationship';
  npcId: string;
  status: RelationEntry['status'];
  reasonPublic: string;
};

export type PlayerStatus = 'loading' | 'idle' | 'submitting' | 'blocked';

export type PlaybackState = {
  journeyId: string;
  worldId: string;
  worldVersion: number;
  personaName: string;

  /** Canonical: seluruh beat committed, terurut menaik berdasarkan sequence. */
  beats: Beat[];

  /** Indeks beat berikutnya yang belum dipresentasikan. */
  cursor: number;

  scene: PresentedScene;
  line: PresentedLine | null;
  /** Apakah teks baris aktif sudah tampil penuh. */
  lineRevealed: boolean;
  decision: PendingDecision | null;
  /** Hubungan hasil beat yang SUDAH dibaca; bukan hasil seluruh beat committed. */
  relations: RelationEntry[];

  notices: SceneNotice[];

  status: PlayerStatus;
  error: GatewayError | null;
  /** operationId yang sedang dipakai; retry memakai nilai yang sama (FR-52). */
  activeOperationId: string | null;
  /**
   * Revisi turn terakhir yang diterapkan. Hasil dengan revisi lebih rendah
   * diabaikan agar jawaban terlambat tidak menimpa cerita yang lebih baru (AC-09).
   */
  revision: number;
  /**
   * Operation yang dibatalkan pemain sebelum selesai. Hasilnya diabaikan bila
   * tiba terlambat, sehingga turn yang sudah dibatalkan tidak bangkit kembali (AC-10).
   */
  abandonedOperationIds: string[];

  auto: boolean;
  autoDelayMs: number;

  /** Draft aksi bebas. Bertahan saat galat validasi dan rotasi layar. */
  draft: string;

  memory: MemorySnapshot;
  simulator: boolean;
};

export type PlayerAction =
  | {
      type: 'LOADED';
      payload: {
        journeyId: string;
        worldId: string;
        worldVersion: number;
        personaName: string;
        beats: Beat[];
        /** Hubungan AWAL dari definisi dunia, bukan hasil beat. */
        relations: RelationEntry[];
        memory: MemorySnapshot;
        simulator: boolean;
        /**
         * Jumlah beat yang sudah dibaca pemain sebelumnya. Beat 0..startCursor
         * dipakai untuk merekonstruksi panggung dan hubungan TANPA menampilkan
         * ulang barisnya, lalu pemutaran berlanjut dari sana (AC-17).
         */
        startCursor?: number;
      };
    }
  | { type: 'REVEAL_LINE' }
  | { type: 'ADVANCE' }
  | { type: 'SET_DRAFT'; text: string }
  | { type: 'SUBMIT_START'; operationId: string }
  | { type: 'SUBMIT_CANCELLED' }
  | { type: 'TURN_COMMITTED'; envelope: TurnResultEnvelope }
  | { type: 'SUBMIT_FAILED'; error: GatewayError }
  | { type: 'DISMISS_NOTICE'; id: string }
  | { type: 'SET_AUTO'; enabled: boolean }
  | { type: 'SET_AUTO_DELAY'; delayMs: number }
  | { type: 'RESET'; payload: PlaybackState };

export const DEFAULT_AUTO_DELAY_MS = 2200;
export const MIN_AUTO_DELAY_MS = 1000;
export const MAX_AUTO_DELAY_MS = 5000;

export function createEmptyPlaybackState(
  overrides: Partial<PlaybackState> = {},
): PlaybackState {
  return {
    journeyId: '',
    worldId: '',
    worldVersion: 0,
    personaName: '',
    beats: [],
    cursor: 0,
    scene: {
      backgroundAssetId: null,
      focusNpcId: null,
      focusExpression: null,
      focusPortraitAssetId: null,
      visibleNpcIds: [],
    },
    line: null,
    lineRevealed: false,
    decision: null,
    relations: [],
    notices: [],
    status: 'loading',
    error: null,
    activeOperationId: null,
    revision: 0,
    abandonedOperationIds: [],
    auto: false,
    autoDelayMs: DEFAULT_AUTO_DELAY_MS,
    draft: '',
    memory: { activeVersion: null, source: 'none' },
    simulator: true,
    ...overrides,
  };
}

export function clampAutoDelay(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_AUTO_DELAY_MS;
  }
  return Math.min(MAX_AUTO_DELAY_MS, Math.max(MIN_AUTO_DELAY_MS, value));
}
