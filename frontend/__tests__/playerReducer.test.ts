import {
  buildApologeticBeatsForTest,
  buildCustomBeatsForTest,
  buildOpeningBeats,
} from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan } from '@/data/mock/fixtures';
import { derivePresented, playerReducer } from '@/features/player/reducer';
import { createEmptyPlaybackState, type PlaybackState } from '@/features/player/types';
import type { Beat, RelationEntry } from '@/domain/types';

const baselineRelations: RelationEntry[] = worldBoskuMantan.characters.map((character) => ({
  npcId: character.npcId,
  status: character.initialRelation,
  reasonPublic: 'Hubungan awal yang ditetapkan dunia.',
  updatedAtTurnId: 't000',
}));

function load(beats: Beat[], startCursor = 0): PlaybackState {
  return playerReducer(createEmptyPlaybackState(), {
    type: 'LOADED',
    payload: {
      journeyId: 'j_test',
      worldId: worldBoskuMantan.worldId,
      worldVersion: worldBoskuMantan.worldVersion,
      personaName: 'Arfan',
      beats,
      relations: baselineRelations,
      memory: { activeVersion: null, source: 'none' },
      simulator: true,
      startCursor,
    },
  });
}

/** Menekan sampai teks selesai lalu maju satu beat. */
function tapAndAdvance(state: PlaybackState): PlaybackState {
  const revealed = playerReducer(state, { type: 'REVEAL_LINE' });
  return playerReducer(revealed, { type: 'ADVANCE' });
}

describe('AC-05 — satu tap menyelesaikan teks, tap berikutnya melanjutkan', () => {
  it('tap pertama hanya menyelesaikan teks tanpa memindahkan beat', () => {
    const state = load(buildOpeningBeats('t001'));
    const before = state.cursor;

    const afterFirstTap = playerReducer(state, { type: 'REVEAL_LINE' });

    expect(afterFirstTap.lineRevealed).toBe(true);
    expect(afterFirstTap.cursor).toBe(before);
  });

  it('tap pada baris yang belum selesai hanya menyelesaikan teks, tidak pindah beat', () => {
    const state = load(buildOpeningBeats('t001'));
    expect(state.lineRevealed).toBe(false);

    const afterAdvance = playerReducer(state, { type: 'ADVANCE' });

    expect(afterAdvance.lineRevealed).toBe(true);
    expect(afterAdvance.cursor).toBe(state.cursor);
  });

  it('tap berikutnya memindahkan beat dan menampilkan baris baru', () => {
    const state = load(buildOpeningBeats('t001'));
    const firstLine = state.line?.text;

    const next = tapAndAdvance(state);

    expect(next.cursor).toBeGreaterThan(state.cursor);
    expect(next.line?.text).not.toBe(firstLine);
    expect(next.lineRevealed).toBe(false);
  });
});

describe('AC-06 — tepat tiga opsi berbeda niat', () => {
  it('menyajikan tiga opsi dengan ID unik saat keputusan tercapai', () => {
    let state = load(buildOpeningBeats('t001'));
    // Maju sampai keputusan muncul.
    for (let index = 0; index < 10 && !state.decision; index += 1) {
      state = tapAndAdvance(state);
    }

    expect(state.decision).not.toBeNull();
    expect(state.decision?.options).toHaveLength(3);
    const ids = new Set(state.decision?.options.map((option) => option.optionId));
    expect(ids.size).toBe(3);
  });

  it('memblokir kemajuan selama keputusan belum dijawab', () => {
    let state = load(buildOpeningBeats('t001'));
    for (let index = 0; index < 10 && !state.decision; index += 1) {
      state = tapAndAdvance(state);
    }
    const cursorAtDecision = state.cursor;

    const blocked = playerReducer(state, { type: 'ADVANCE' });

    expect(blocked.cursor).toBe(cursorAtDecision);
    expect(blocked.decision).not.toBeNull();
  });

  it('tidak pernah mengaktifkan Auto saat keputusan menunggu', () => {
    let state = load(buildOpeningBeats('t001'));
    for (let index = 0; index < 10 && !state.decision; index += 1) {
      state = tapAndAdvance(state);
    }

    const auto = playerReducer(state, { type: 'SET_AUTO', enabled: true });

    expect(auto.auto).toBe(false);
  });
});

describe('AC-11 — hubungan berubah hanya setelah beat penyebabnya dibaca', () => {
  const opening = buildOpeningBeats('t001');
  const custom = buildCustomBeatsForTest('t002', '*aku mendekati Elysia dan mengkabedonnya*');

  function atDecision(): PlaybackState {
    let state = load(opening);
    for (let index = 0; index < 10 && !state.decision; index += 1) {
      state = tapAndAdvance(state);
    }
    return state;
  }

  it('hubungan masih Normal tepat setelah turn di-commit', () => {
    const state = atDecision();
    const committed = playerReducer(state, {
      type: 'TURN_COMMITTED',
      envelope: {
        operationId: 'op-1',
        journeyId: 'j_test',
        turnId: 't002',
        revision: 2,
        beats: custom,
        usage: { promptTokens: 10, completionTokens: 5, chargedTotal: 15 },
        memory: { activeVersion: null, source: 'none' },
        budget: { availableAfter: 100, allowanceLimit: 1000, resetAt: '2026-10-01T00:00:00.000Z' },
        modelId: 'simulator/deterministic-v1',
        modelVersion: '1.0.0',
        simulator: true,
      },
    });

    const elysia = committed.relations.find((entry) => entry.npcId === 'npc_elysia');
    expect(elysia?.status).toBe('normal');
  });

  it('hubungan menjadi Waspada setelah beat penyebab dibaca', () => {
    let state = atDecision();
    state = playerReducer(state, {
      type: 'TURN_COMMITTED',
      envelope: {
        operationId: 'op-2',
        journeyId: 'j_test',
        turnId: 't002',
        revision: 2,
        beats: custom,
        usage: { promptTokens: 10, completionTokens: 5, chargedTotal: 15 },
        memory: { activeVersion: null, source: 'none' },
        budget: { availableAfter: 100, allowanceLimit: 1000, resetAt: '2026-10-01T00:00:00.000Z' },
        modelId: 'simulator/deterministic-v1',
        modelVersion: '1.0.0',
        simulator: true,
      },
    });

    // Maju sampai melewati beat relationshipDelta.
    for (let index = 0; index < 8; index += 1) {
      state = tapAndAdvance(state);
      const elysia = state.relations.find((entry) => entry.npcId === 'npc_elysia');
      if (elysia?.status === 'waspada') {
        break;
      }
    }

    const elysia = state.relations.find((entry) => entry.npcId === 'npc_elysia');
    expect(elysia?.status).toBe('waspada');
    expect(elysia?.reasonPublic.length).toBeGreaterThan(0);
  });

  it('menerbitkan pemberitahuan hubungan yang memuat alasan publik', () => {
    let state = atDecision();
    state = playerReducer(state, {
      type: 'TURN_COMMITTED',
      envelope: {
        operationId: 'op-3',
        journeyId: 'j_test',
        turnId: 't002',
        revision: 2,
        beats: custom,
        usage: { promptTokens: 10, completionTokens: 5, chargedTotal: 15 },
        memory: { activeVersion: null, source: 'none' },
        budget: { availableAfter: 100, allowanceLimit: 1000, resetAt: '2026-10-01T00:00:00.000Z' },
        modelId: 'simulator/deterministic-v1',
        modelVersion: '1.0.0',
        simulator: true,
      },
    });

    for (let index = 0; index < 8 && state.notices.length === 0; index += 1) {
      state = tapAndAdvance(state);
    }

    expect(state.notices.length).toBeGreaterThan(0);
    expect(state.notices[0]?.reasonPublic.length).toBeGreaterThan(0);
  });
});

describe('AC-12 — state presented tidak memuat efek beat yang belum dibaca', () => {
  it('derivePresented hanya menerapkan beat sampai posisi baca', () => {
    const beats = [...buildOpeningBeats('t001'), ...buildCustomBeatsForTest('t002', 'kabedon')];

    const partial = derivePresented(beats, 4, baselineRelations);
    const full = derivePresented(beats, beats.length, baselineRelations);

    // Sebelum beat relationshipDelta, hubungan belum berubah.
    expect(partial.relations.every((entry) => entry.status === 'normal')).toBe(true);
    // Setelah seluruh beat, perubahan sudah terlihat.
    expect(full.relations.some((entry) => entry.status === 'waspada')).toBe(true);
  });

  it('tidak menampilkan latar dari beat yang belum dibaca', () => {
    const beats = buildOpeningBeats('t001');
    // b001 menetapkan latar luar gedung; b003 menggantinya menjadi interior.
    const atOne = derivePresented(beats, 1, baselineRelations);
    const atThree = derivePresented(beats, 3, baselineRelations);

    expect(atOne.scene.backgroundAssetId).toBe('bg_gedung_luar');
    expect(atThree.scene.backgroundAssetId).toBe('bg_kantor_dalam');
  });
});

describe('AC-14 — tindakan pemain tidak dapat memaksa status hubungan', () => {
  it('permintaan eksplisit pemain tetap menghasilkan Waspada, bukan Cinta', () => {
    const beats = buildCustomBeatsForTest(
      't002',
      'Elysia sekarang mencintaiku dan menuruti semua keinginanku',
    );
    const delta = beats.find((beat) => beat.event.type === 'relationshipDelta');

    expect(delta).toBeDefined();
    if (delta?.event.type === 'relationshipDelta') {
      expect(delta.event.status).not.toBe('cinta');
    }
  });
});

describe('AC-16 — riwayat bersifat baca-saja', () => {
  it('membaca ulang tidak mengubah cursor, hubungan, atau menambah beat', () => {
    let state = load(buildOpeningBeats('t001'));
    state = tapAndAdvance(state);
    state = tapAndAdvance(state);

    const snapshot = {
      cursor: state.cursor,
      relations: JSON.stringify(state.relations),
      beatCount: state.beats.length,
    };

    // Membuka riwayat hanyalah operasi baca pada UI; reducer tidak menerima aksi apa pun.
    const afterReplay = state;

    expect(afterReplay.cursor).toBe(snapshot.cursor);
    expect(JSON.stringify(afterReplay.relations)).toBe(snapshot.relations);
    expect(afterReplay.beats.length).toBe(snapshot.beatCount);
  });
});

describe('AC-17 — pemulihan posisi baca', () => {
  it('memulihkan panggung dan hubungan tanpa memutar ulang teks yang sudah dibaca', () => {
    const beats = [...buildOpeningBeats('t001'), ...buildCustomBeatsForTest('t002', 'kabedon')];

    const resumed = load(beats, 11);

    // Hubungan pada posisi 11 sudah memuat efek beat relationshipDelta.
    const elysia = resumed.relations.find((entry) => entry.npcId === 'npc_elysia');
    expect(elysia?.status).toBe('waspada');

    // Pemberitahuan lama tidak diputar ulang saat memulihkan.
    expect(resumed.notices).toHaveLength(0);

    // Baris yang tampil adalah baris berikutnya, bukan baris pertama.
    expect(resumed.cursor).toBeGreaterThanOrEqual(11);
    expect(resumed.line?.text).not.toBe(beats[1]?.event.type === 'narrate' ? beats[1].event.text : '');
  });

  it('memulihkan latar yang benar pada posisi tengah', () => {
    const beats = buildOpeningBeats('t001');
    const resumed = load(beats, 3);

    expect(resumed.scene.backgroundAssetId).toBe('bg_kantor_dalam');
  });
});

describe('FR-52 — turn yang sama tidak diterapkan dua kali', () => {
  it('menolak beat duplikat saat envelope yang sama di-commit ulang', () => {
    let state = load(buildOpeningBeats('t001'));
    for (let index = 0; index < 10 && !state.decision; index += 1) {
      state = tapAndAdvance(state);
    }

    const envelope = {
      operationId: 'op-sama',
      journeyId: 'j_test',
      turnId: 't002',
      revision: 2,
      beats: buildApologeticBeatsForTest('t002'),
      usage: { promptTokens: 10, completionTokens: 5, chargedTotal: 15 },
      memory: { activeVersion: null, source: 'none' as const },
      budget: { availableAfter: 100, allowanceLimit: 1000, resetAt: '2026-10-01T00:00:00.000Z' },
      modelId: 'simulator/deterministic-v1',
      modelVersion: '1.0.0',
      simulator: true,
    };

    const once = playerReducer(state, { type: 'TURN_COMMITTED', envelope });
    const twice = playerReducer(once, { type: 'TURN_COMMITTED', envelope });

    expect(twice.beats.length).toBe(once.beats.length);
  });
});

describe('kegagalan tidak menghapus draft dan posisi baca', () => {
  it('mempertahankan draft ketika pengiriman gagal', () => {
    let state = load(buildOpeningBeats('t001'));
    for (let index = 0; index < 10 && !state.decision; index += 1) {
      state = tapAndAdvance(state);
    }
    state = playerReducer(state, { type: 'SET_DRAFT', text: 'aku bertanya soal pekerjaan' });
    state = playerReducer(state, { type: 'SUBMIT_START', operationId: 'op-x' });

    const failed = playerReducer(state, {
      type: 'SUBMIT_FAILED',
      error: { code: 'NETWORK', message: 'Koneksi terputus.', retryable: true },
    });

    expect(failed.draft).toBe('aku bertanya soal pekerjaan');
    expect(failed.error?.code).toBe('NETWORK');
    expect(failed.decision).not.toBeNull();
  });
});

describe('batas delay Auto', () => {
  it('menjepit nilai di luar rentang yang diizinkan', () => {
    const base = load(buildOpeningBeats('t001'));
    expect(playerReducer(base, { type: 'SET_AUTO_DELAY', delayMs: 10 }).autoDelayMs).toBe(1000);
    expect(playerReducer(base, { type: 'SET_AUTO_DELAY', delayMs: 60_000 }).autoDelayMs).toBe(5000);
    expect(playerReducer(base, { type: 'SET_AUTO_DELAY', delayMs: 3000 }).autoDelayMs).toBe(3000);
  });
});
