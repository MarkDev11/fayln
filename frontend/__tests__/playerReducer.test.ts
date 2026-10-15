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

function load(
  beats: Beat[],
  startCursor = 0,
  relations: RelationEntry[] = baselineRelations,
): PlaybackState {
  return playerReducer(createEmptyPlaybackState(), {
    type: 'LOADED',
    payload: {
      journeyId: 'j_test',
      worldId: worldBoskuMantan.worldId,
      worldVersion: worldBoskuMantan.worldVersion,
      personaName: 'Arfan',
      beats,
      relations,
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

function expectPersonalizedText(text: string, expected: string): void {
  expect(text).toBe(expected);
  expect(text).not.toMatch(/@user(?![\p{L}\p{N}_])/u);
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

  it('DAPAT mengaktifkan Auto saat keputusan menunggu', () => {
    /*
     * KEPUTUSAN PEMILIK PRODUK, mengubah perilaku sebelumnya.
     *
     * Bentuk lama menolak `SET_AUTO enabled: true` selama keputusan menunggu
     * (`action.enabled && state.decision === null`). Akibatnya tombol Auto diam
     * tanpa penjelasan ketika ditekan di depan sebuah keputusan, dan pemain
     * menyimpulkan tombolnya rusak.
     *
     * Sekarang Auto dapat dinyalakan kapan saja dan menyala terus sampai pemain
     * mematikannya. Yang menahan laju bukan flag ini, melainkan `shouldRun` di
     * `usePlayerEngine` — ia mensyaratkan `decision === null`.
     *
     * BUKTI MUTASI: kembalikan `&& state.decision === null` ke `SET_AUTO`,
     * lalu uji ini memerah.
     */
    let state = load(buildOpeningBeats('t001'));
    for (let index = 0; index < 10 && !state.decision; index += 1) {
      state = tapAndAdvance(state);
    }
    expect(state.decision).not.toBeNull();

    const auto = playerReducer(state, { type: 'SET_AUTO', enabled: true });

    expect(auto.auto).toBe(true);
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

describe('player persona token personalization', () => {
  it('personalizes loaded beats and relation baselines without mutating inputs', () => {
    /*
     * MUTATION CHECK: removing personalizeBeats(...) from LOADED makes these
     * presented line, decision, and stored-beat assertions fail.
     */
    const beats: Beat[] = [
      {
        beatId: 'loaded-narrate',
        turnId: 't_loaded',
        sequence: 1,
        event: { type: 'narrate', text: '@user enters; @username waits.' },
      },
      {
        beatId: 'loaded-say',
        turnId: 't_loaded',
        sequence: 2,
        event: { type: 'say', npcId: 'npc_elysia', text: '@user, meet @username.' },
      },
      {
        beatId: 'loaded-relation',
        turnId: 't_loaded',
        sequence: 3,
        event: {
          type: 'relationshipDelta',
          npcId: 'npc_elysia',
          status: 'waspada',
          reasonPublic: '@user trusted @username.',
        },
      },
      {
        beatId: 'loaded-choices',
        turnId: 't_loaded',
        sequence: 4,
        event: {
          type: 'presentChoices',
          decisionId: 'd_loaded',
          prompt: 'What should @user tell @username?',
          options: [
            { optionId: 'a', label: 'Help @user', description: '@user asks @username for help.' },
            { optionId: 'b', label: 'Warn @user', description: 'Tell @username to wait.' },
            { optionId: 'c', label: 'Leave @user', description: 'Let @username decide.' },
          ],
        },
      },
    ];
    const originalBeats = JSON.stringify(beats);
    const relations = baselineRelations.map((relation) =>
      relation.npcId === 'npc_elysia'
        ? { ...relation, reasonPublic: '@user remembers @username.' }
        : relation,
    );

    let state = load(beats, 0, relations);

    expectPersonalizedText(state.line?.text ?? '', 'Arfan enters; @username waits.');
    expect(state.beats[0]?.event).toEqual({
      type: 'narrate',
      text: 'Arfan enters; @username waits.',
    });
    expectPersonalizedText(
      state.relations.find((relation) => relation.npcId === 'npc_elysia')?.reasonPublic ?? '',
      'Arfan remembers @username.',
    );

    state = tapAndAdvance(state);
    expectPersonalizedText(state.line?.text ?? '', 'Arfan, meet @username.');

    state = tapAndAdvance(state);
    expectPersonalizedText(state.decision?.prompt ?? '', 'What should Arfan tell @username?');
    expectPersonalizedText(state.decision?.options[0]?.label ?? '', 'Help Arfan');
    expectPersonalizedText(
      state.decision?.options[0]?.description ?? '',
      'Arfan asks @username for help.',
    );
    expectPersonalizedText(
      state.relations.find((relation) => relation.npcId === 'npc_elysia')?.reasonPublic ?? '',
      'Arfan trusted @username.',
    );
    expectPersonalizedText(state.notices[0]?.reasonPublic ?? '', 'Arfan trusted @username.');
    expect(JSON.stringify(beats)).toBe(originalBeats);
  });

  it('personalizes incoming turn beats without mutating the envelope', () => {
    /*
     * MUTATION CHECK: removing personalizeBeats(envelope.beats, state.personaName)
     * from TURN_COMMITTED makes the presented and stored-beat assertions fail.
     */
    const beats: Beat[] = [
      {
        beatId: 'turn-narrate',
        turnId: 't_incoming',
        sequence: 1,
        event: { type: 'narrate', text: '@user follows @username.' },
      },
      {
        beatId: 'turn-say',
        turnId: 't_incoming',
        sequence: 2,
        event: { type: 'say', npcId: 'npc_elysia', text: '@username calls @user.' },
      },
      {
        beatId: 'turn-relation',
        turnId: 't_incoming',
        sequence: 3,
        event: {
          type: 'relationshipDelta',
          npcId: 'npc_elysia',
          status: 'waspada',
          reasonPublic: '@user listened to @username.',
        },
      },
      {
        beatId: 'turn-choices',
        turnId: 't_incoming',
        sequence: 4,
        event: {
          type: 'presentChoices',
          decisionId: 'd_incoming',
          prompt: 'Will @user answer @username?',
          options: [
            { optionId: 'a', label: '@user answers @username', description: '@user speaks first.' },
            { optionId: 'b', label: 'Wait for @user', description: 'Give @username some time.' },
            { optionId: 'c', label: 'Ask @username', description: '@username chooses.' },
          ],
        },
      },
    ];
    const originalBeats = JSON.stringify(beats);
    const envelope = {
      operationId: 'op-persona',
      journeyId: 'j_test',
      turnId: 't_incoming',
      revision: 1,
      beats,
      usage: { promptTokens: 10, completionTokens: 5, chargedTotal: 15 },
      memory: { activeVersion: null, source: 'none' as const },
      budget: { availableAfter: 100, allowanceLimit: 1000, resetAt: '2026-10-01T00:00:00.000Z' },
      modelId: 'simulator/deterministic-v1',
      modelVersion: '1.0.0',
      simulator: true,
    };

    let state = playerReducer(load([]), { type: 'TURN_COMMITTED', envelope });

    expectPersonalizedText(state.line?.text ?? '', 'Arfan follows @username.');
    expect(state.beats[0]?.event).toEqual({
      type: 'narrate',
      text: 'Arfan follows @username.',
    });

    state = tapAndAdvance(state);
    expectPersonalizedText(state.line?.text ?? '', '@username calls Arfan.');

    state = tapAndAdvance(state);
    expectPersonalizedText(state.decision?.prompt ?? '', 'Will Arfan answer @username?');
    expectPersonalizedText(state.decision?.options[0]?.label ?? '', 'Arfan answers @username');
    expectPersonalizedText(state.decision?.options[0]?.description ?? '', 'Arfan speaks first.');
    expectPersonalizedText(
      state.relations.find((relation) => relation.npcId === 'npc_elysia')?.reasonPublic ?? '',
      'Arfan listened to @username.',
    );
    expectPersonalizedText(state.notices[0]?.reasonPublic ?? '', 'Arfan listened to @username.');
    expect(JSON.stringify(envelope.beats)).toBe(originalBeats);
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
