import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { playerReducer } from './reducer';
import { createEmptyPlaybackState, type PlaybackState } from './types';

import { useGateway } from '@/data/GatewayProvider';
import type {
  GatewayError as GatewayErrorShape,
  Beat,
  MemorySnapshot,
  RelationEntry,
  ResponseLocale,
} from '@/domain/types';
import { StoryGatewayError } from '@/data/gateway';
import { createPlaybackStore, type PlaybackStore } from '@/storage/playbackStore';
import { telemetry } from '@/telemetry/analytics';

export type PlayerEngineOptions = {
  journeyId: string;
  worldId: string;
  worldVersion: number;
  personaName: string;
  initialBeats: Beat[];
  initialRelations: RelationEntry[];
  memory: MemorySnapshot;
  simulator: boolean;
  /**
   * Bahasa narasi perjalanan ini, dari SESI.
   *
   * Bukan dari profil lokal: profil bisa berubah setelah perjalanan dibuat,
   * sedangkan bahasa perjalanan dikunci sekali dan tidak boleh berganti di
   * tengah cerita.
   */
  responseLocale: ResponseLocale;
  /** Disuntikkan pengujian; default memakai penyimpanan yang tersedia. */
  store?: PlaybackStore;
  /** Mematikan timer Auto pada pengujian. */
  autoEnabled?: boolean;
};

type SubmissionIntent =
  | { kind: 'choice'; optionId: string }
  | { kind: 'custom'; text: string };

export type PlayerEngine = {
  state: PlaybackState;
  isPersistent: boolean;
  revealLine: () => void;
  advance: () => void;
  setDraft: (text: string) => void;
  submitChoice: (optionId: string) => void;
  submitCustom: () => void;
  /** Membatalkan pengiriman yang sedang berjalan; aman dilakukan sebelum commit. */
  cancelSubmission: () => void;
  retry: () => void;
  dismissNotice: (id: string) => void;
  toggleAuto: () => void;
  setAutoDelay: (delayMs: number) => void;
  /** Dipanggil UI saat overlay dibuka; Auto selalu dijeda. */
  pauseAuto: () => void;
  canAdvance: boolean;
};

function toGatewayError(error: unknown): GatewayErrorShape {
  if (error instanceof StoryGatewayError) {
    return {
      code: error.code as GatewayErrorShape['code'],
      message: error.message,
      retryable: error.retryable,
      ...(error.retryAfterSec !== undefined ? { retryAfterSec: error.retryAfterSec } : null),
      ...(error.blockedUntil !== undefined ? { blockedUntil: error.blockedUntil } : null),
    };
  }
  return {
    code: 'UNKNOWN',
    message: 'Terjadi kesalahan yang tidak terduga. Progresmu tetap aman.',
    retryable: true,
  };
}

/** Membuat operation id unik tanpa menambah dependensi. */
let operationCounter = 0;
export function createOperationId(prefix = 'op'): string {
  operationCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${operationCounter.toString(36)}`;
}

/**
 * Engine pemutaran.
 *
 * Tanggung jawab: menjalankan reducer, mengirim giliran ke gateway dengan operation
 * id yang stabil, menyimpan cursor, dan mengatur timer Auto. Semua aturan sulit
 * tetap berada di reducer agar dapat diuji tanpa React.
 */
export function usePlayerEngine(options: PlayerEngineOptions): PlayerEngine {
  const gateway = useGateway();
  const store = useMemo(() => options.store ?? createPlaybackStore(), [options.store]);

  const [state, dispatch] = useReducer(
    playerReducer,
    undefined,
    () =>
      createEmptyPlaybackState({
        journeyId: options.journeyId,
        worldId: options.worldId,
        worldVersion: options.worldVersion,
        personaName: options.personaName,
        beats: options.initialBeats,
        relations: options.initialRelations,
        memory: options.memory,
        simulator: options.simulator,
      }),
  );

  const initialisedRef = useRef(false);
  const intentRef = useRef<SubmissionIntent | null>(null);
  const operationRef = useRef<string | null>(null);
  const autoEnabled = options.autoEnabled ?? true;

  /* ---------------- Pemuatan awal ---------------- */

  useEffect(() => {
    if (initialisedRef.current) {
      return;
    }
    initialisedRef.current = true;
    dispatch({
      type: 'LOADED',
      payload: {
        journeyId: options.journeyId,
        worldId: options.worldId,
        worldVersion: options.worldVersion,
        personaName: options.personaName,
        beats: options.initialBeats,
        relations: options.initialRelations,
        memory: options.memory,
        simulator: options.simulator,
      },
    });
  }, [
    options.journeyId,
    options.worldId,
    options.worldVersion,
    options.personaName,
    options.initialBeats,
    options.initialRelations,
    options.memory,
    options.simulator,
  ]);

  /* ---------------- Pemulihan cursor ---------------- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await store.load(options.journeyId);
      if (cancelled || !saved) {
        return;
      }
      if (saved.autoDelayMs > 0) {
        dispatch({ type: 'SET_AUTO_DELAY', delayMs: saved.autoDelayMs });
      }
      if (saved.draft.length > 0) {
        dispatch({ type: 'SET_DRAFT', text: saved.draft });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, options.journeyId]);

  /* ---------------- Autosave ---------------- */

  useEffect(() => {
    if (state.status === 'loading') {
      return;
    }
    const timer = setTimeout(() => {
      void store.save({
        journeyId: state.journeyId,
        cursor: state.cursor,
        draft: state.draft,
        autoDelayMs: state.autoDelayMs,
        savedAt: new Date().toISOString(),
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [store, state.journeyId, state.cursor, state.draft, state.autoDelayMs, state.status]);

  /* ---------------- Pengiriman giliran ---------------- */

  const runSubmission = useCallback(
    async (intent: SubmissionIntent, operationId: string) => {
      const decision = state.decision;
      if (!decision) {
        return;
      }
      dispatch({ type: 'SUBMIT_START', operationId });
      telemetry.track('decision_committed', { simulator: gateway.isSimulator });

      try {
        const envelope =
          intent.kind === 'choice'
            ? await gateway.submitChoice({
                clientOperationId: operationId,
                journeyId: state.journeyId,
                decisionId: decision.decisionId,
                optionId: intent.optionId,
                /*
                 * Bahasa dari SESI, bukan ditulis mati.
                 *
                 * Dulu di sini tertulis `'id-ID'`. Akibatnya pemain yang memilih
                 * English di lembar persona tetap mengirim permintaan berbahasa
                 * Indonesia — pilihannya tidak berpengaruh apa pun.
                 */
                responseLocale: options.responseLocale,
              })
            : await gateway.submitCustom({
                clientOperationId: operationId,
                journeyId: state.journeyId,
                decisionId: decision.decisionId,
                customText: intent.text,
                responseLocale: options.responseLocale,
              });

        dispatch({ type: 'TURN_COMMITTED', envelope });
      } catch (error) {
        dispatch({ type: 'SUBMIT_FAILED', error: toGatewayError(error) });
        telemetry.track('gateway_error', {
          errorCode: toGatewayError(error).code,
          simulator: gateway.isSimulator,
        });
      }
    },
    [gateway, state.decision, state.journeyId, options.responseLocale],
  );

  const submitChoice = useCallback(
    (optionId: string) => {
      if (state.status === 'submitting' || !state.decision) {
        return;
      }
      const operationId = createOperationId('choice');
      intentRef.current = { kind: 'choice', optionId };
      operationRef.current = operationId;
      void runSubmission({ kind: 'choice', optionId }, operationId);
    },
    [runSubmission, state.decision, state.status],
  );

  const submitCustom = useCallback(() => {
    const text = state.draft.trim();
    if (state.status === 'submitting' || !state.decision || text.length === 0) {
      return;
    }
    const operationId = createOperationId('custom');
    intentRef.current = { kind: 'custom', text };
    operationRef.current = operationId;
    void runSubmission({ kind: 'custom', text }, operationId);
  }, [runSubmission, state.decision, state.draft, state.status]);

  /** Retry memakai operation id yang sama agar tidak membuat giliran ganda (FR-52). */
  const retry = useCallback(() => {
    const intent = intentRef.current;
    const operationId = operationRef.current;
    if (!intent || !operationId) {
      return;
    }
    void runSubmission(intent, operationId);
  }, [runSubmission]);

  /**
   * Membatalkan pengiriman.
   *
   * Aman sebelum commit: keputusan, draft, dan posisi baca tidak tersentuh, dan
   * hasil yang tiba terlambat akan diabaikan oleh reducer (AC-10).
   */
  const cancelSubmission = useCallback(() => {
    dispatch({ type: 'SUBMIT_CANCELLED' });
  }, []);

  /* ---------------- Aksi sederhana ---------------- */

  const revealLine = useCallback(() => dispatch({ type: 'REVEAL_LINE' }), []);
  const advance = useCallback(() => dispatch({ type: 'ADVANCE' }), []);
  const setDraft = useCallback((text: string) => dispatch({ type: 'SET_DRAFT', text }), []);
  const dismissNotice = useCallback((id: string) => dispatch({ type: 'DISMISS_NOTICE', id }), []);
  const setAutoDelay = useCallback(
    (delayMs: number) => dispatch({ type: 'SET_AUTO_DELAY', delayMs }),
    [],
  );

  const pauseAuto = useCallback(() => {
    dispatch({ type: 'SET_AUTO', enabled: false });
  }, []);

  const toggleAuto = useCallback(() => {
    const next = !state.auto;
    dispatch({ type: 'SET_AUTO', enabled: next });
    telemetry.track('auto_toggled', { simulator: gateway.isSimulator });
  }, [gateway.isSimulator, state.auto]);

  /* ---------------- Auto ---------------- */

  const canAdvance = state.cursor < state.beats.length && state.decision === null;

  useEffect(() => {
    if (!autoEnabled) {
      return undefined;
    }
    // Auto hanya memajukan beat yang SUDAH tersedia (D-15, FR-20).
    const shouldRun =
      state.auto &&
      state.lineRevealed &&
      state.decision === null &&
      state.error === null &&
      state.status === 'idle' &&
      canAdvance;

    if (!shouldRun) {
      return undefined;
    }

    const timer = setTimeout(() => {
      dispatch({ type: 'ADVANCE' });
    }, state.autoDelayMs);

    return () => clearTimeout(timer);
  }, [
    autoEnabled,
    state.auto,
    state.lineRevealed,
    state.decision,
    state.error,
    state.status,
    state.autoDelayMs,
    canAdvance,
  ]);

  /* ---------------- Lifecycle aplikasi ---------------- */

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') {
        // Auto tidak boleh berjalan saat aplikasi tidak aktif (NFR-18).
        dispatch({ type: 'SET_AUTO', enabled: false });
      }
    });
    return () => subscription.remove();
  }, []);

  return {
    state,
    isPersistent: store.isPersistent,
    revealLine,
    advance,
    setDraft,
    submitChoice,
    submitCustom,
    cancelSubmission,
    retry,
    dismissNotice,
    toggleAuto,
    setAutoDelay,
    pauseAuto,
    canAdvance,
  };
}
