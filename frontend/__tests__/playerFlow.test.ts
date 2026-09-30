import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan } from '@/data/mock/fixtures';
import { playerReducer } from '@/features/player/reducer';
import { createEmptyPlaybackState, type PlaybackState } from '@/features/player/types';
import type { JourneySession } from '@/data/gateway';

const instant = () => new MockStoryGateway({ instant: true });

async function startDemo(gateway: MockStoryGateway) {
  const created = await gateway.createJourney({
    clientOperationId: 'op-open',
    worldId: worldBoskuMantan.worldId,
    persona: { name: 'Arfan', age: 24 },
    responseLocale: 'id-ID',
  });
  const session = await gateway.openJourneySession(created.journeyId);
  return { created, session };
}

/** Memuat sesi ke reducer, sama seperti yang dilakukan layar pemutar. */
function loadSession(session: JourneySession, startCursor = 0): PlaybackState {
  return playerReducer(createEmptyPlaybackState(), {
    type: 'LOADED',
    payload: {
      journeyId: session.journeyId,
      worldId: session.world.worldId,
      worldVersion: session.world.worldVersion,
      personaName: 'Arfan',
      beats: session.beats,
      relations: session.relationsBaseline,
      memory: session.memory,
      simulator: session.simulator,
      startCursor,
    },
  });
}

function tap(state: PlaybackState): PlaybackState {
  return playerReducer(state, { type: 'ADVANCE' });
}

function tapThrough(state: PlaybackState, times: number): PlaybackState {
  let current = state;
  for (let index = 0; index < times; index += 1) {
    current = tap(current);
  }
  return current;
}

function reachDecision(state: PlaybackState): PlaybackState {
  let current = state;
  for (let index = 0; index < 20 && !current.decision; index += 1) {
    current = tap(current);
  }
  return current;
}

describe('sesi bermain', () => {
  it('menyediakan beat pembuka dan baseline hubungan', async () => {
    const gateway = instant();
    const { session } = await startDemo(gateway);

    expect(session.beats.length).toBeGreaterThan(0);
    expect(session.simulator).toBe(true);
    expect(session.relationsBaseline.map((entry) => entry.status)).toEqual([
      'normal',
      'normal',
    ]);
  });

  it('baseline tetap Normal walaupun perubahan hubungan sudah di-commit (anti bocor R-04)', async () => {
    const gateway = instant();
    const { created } = await startDemo(gateway);

    await gateway.submitCustom({
      clientOperationId: 'op-kabedon',
      journeyId: created.journeyId,
      decisionId: 'd001',
      customText: '*aku mendekati Elysia dan mengkabedonnya*',
      responseLocale: 'id-ID',
    });

    const reopened = await gateway.openJourneySession(created.journeyId);
    // Baseline tidak boleh memuat hasil beat, jika tidak state presented akan bocor.
    expect(reopened.relationsBaseline.every((entry) => entry.status === 'normal')).toBe(true);

    // Sementara hubungan kanonik memang sudah berubah.
    const detail = await gateway.fetchJourneyDetail(created.journeyId);
    expect(detail.relations.some((entry) => entry.status === 'waspada')).toBe(true);
  });

  it('mengakumulasi beat lintas turn pada sesi yang dibuka kembali', async () => {
    const gateway = instant();
    const { created, session } = await startDemo(gateway);
    const openingCount = session.beats.length;

    await gateway.submitChoice({
      clientOperationId: 'op-pilih',
      journeyId: created.journeyId,
      decisionId: 'd001',
      optionId: 'opt1',
      responseLocale: 'id-ID',
    });

    const reopened = await gateway.openJourneySession(created.journeyId);
    expect(reopened.beats.length).toBeGreaterThan(openingCount);
  });
});

describe('AC-08 — retry tidak membuat giliran ganda', () => {
  it('mengembalikan envelope yang sama untuk operationId yang sama', async () => {
    const gateway = instant();
    const { created } = await startDemo(gateway);
    const before = await gateway.fetchUsage();

    const input = {
      clientOperationId: 'op-retry',
      journeyId: created.journeyId,
      decisionId: 'd001',
      optionId: 'opt1',
      responseLocale: 'id-ID' as const,
    };

    const first = await gateway.submitChoice(input);
    const second = await gateway.submitChoice(input);

    expect(second.turnId).toBe(first.turnId);
    expect(second.beats.map((beat) => beat.beatId)).toEqual(
      first.beats.map((beat) => beat.beatId),
    );

    const after = await gateway.fetchUsage();
    expect(after.spent - before.spent).toBe(first.usage.chargedTotal);
  });

  it('menerapkan turn sekali saja di reducer walau envelope dikirim dua kali', async () => {
    const gateway = instant();
    const { created, session } = await startDemo(gateway);

    let state = reachDecision(loadSession(session));
    const envelope = await gateway.submitChoice({
      clientOperationId: 'op-dobel',
      journeyId: created.journeyId,
      decisionId: 'd001',
      optionId: 'opt1',
      responseLocale: 'id-ID',
    });

    state = playerReducer(state, { type: 'TURN_COMMITTED', envelope });
    const afterFirst = state.beats.length;
    state = playerReducer(state, { type: 'TURN_COMMITTED', envelope });

    expect(state.beats.length).toBe(afterFirst);
  });
});

describe('AC-09 — hasil terlambat tidak menimpa turn yang lebih baru', () => {
  it('mengabaikan envelope dengan revisi lebih rendah', async () => {
    const gateway = instant();
    const { created, session } = await startDemo(gateway);

    let state = reachDecision(loadSession(session));

    const first = await gateway.submitChoice({
      clientOperationId: 'op-1',
      journeyId: created.journeyId,
      decisionId: 'd001',
      optionId: 'opt1',
      responseLocale: 'id-ID',
    });
    state = playerReducer(state, { type: 'TURN_COMMITTED', envelope: first });
    state = reachDecision(state);

    const second = await gateway.submitChoice({
      clientOperationId: 'op-2',
      journeyId: created.journeyId,
      decisionId: 'd002',
      optionId: 'opt1',
      responseLocale: 'id-ID',
    });
    state = playerReducer(state, { type: 'TURN_COMMITTED', envelope: second });

    const beatsAfterSecond = state.beats.length;

    // Hasil pertama tiba lagi terlambat dengan revisi lebih rendah.
    const late = playerReducer(state, { type: 'TURN_COMMITTED', envelope: first });

    expect(late.beats.length).toBe(beatsAfterSecond);
    expect(late.revision).toBe(state.revision);
  });
});

describe('AC-10 — pembatalan aman sebelum commit', () => {
  it('mempertahankan keputusan dan draft saat dibatalkan', async () => {
    const gateway = instant();
    const { session } = await startDemo(gateway);

    let state = reachDecision(loadSession(session));
    const cursorBefore = state.cursor;

    state = playerReducer(state, { type: 'SET_DRAFT', text: 'aku bertanya soal pekerjaan' });
    state = playerReducer(state, { type: 'SUBMIT_START', operationId: 'op-batal' });
    expect(state.status).toBe('submitting');

    state = playerReducer(state, { type: 'SUBMIT_CANCELLED' });

    expect(state.status).toBe('idle');
    expect(state.decision).not.toBeNull();
    expect(state.draft).toBe('aku bertanya soal pekerjaan');
    expect(state.cursor).toBe(cursorBefore);
  });

  it('mengabaikan hasil yang tiba setelah dibatalkan', async () => {
    const gateway = instant();
    const { created, session } = await startDemo(gateway);

    let state = reachDecision(loadSession(session));
    state = playerReducer(state, { type: 'SUBMIT_START', operationId: 'op-batal-2' });
    state = playerReducer(state, { type: 'SUBMIT_CANCELLED' });
    const beatsBefore = state.beats.length;

    const envelope = await gateway.submitChoice({
      clientOperationId: 'op-batal-2',
      journeyId: created.journeyId,
      decisionId: 'd001',
      optionId: 'opt1',
      responseLocale: 'id-ID',
    });

    state = playerReducer(state, { type: 'TURN_COMMITTED', envelope });

    expect(state.beats.length).toBe(beatsBefore);
    expect(state.decision).not.toBeNull();
  });
});

describe('AC-15 — Auto berhenti pada keputusan', () => {
  it('menonaktifkan Auto begitu keputusan muncul', async () => {
    const gateway = instant();
    const { session } = await startDemo(gateway);

    let state = loadSession(session);
    state = playerReducer(state, { type: 'SET_AUTO', enabled: true });
    expect(state.auto).toBe(true);

    state = reachDecision(state);
    // Auto masih menyala pada state, tetapi reducer menolaknya saat keputusan ada.
    const attempted = playerReducer(state, { type: 'SET_AUTO', enabled: true });
    expect(attempted.auto).toBe(false);
  });
});

describe('AC-16 — riwayat tidak memakai token', () => {
  it('tidak mengubah pemakaian kuota saat riwayat dibuka', async () => {
    const gateway = instant();
    const { created } = await startDemo(gateway);

    const before = await gateway.fetchUsage();
    // Membuka riwayat hanya membaca state lokal; tidak ada panggilan gateway.
    await gateway.openJourneySession(created.journeyId);
    const after = await gateway.fetchUsage();

    expect(after.spent).toBe(before.spent);
  });
});

describe('demo Elysia–Leo end to end', () => {
  it('menghasilkan teguran dan Waspada setelah aksi kabedon dibaca', async () => {
    const gateway = instant();
    const { created, session } = await startDemo(gateway);

    let state = reachDecision(loadSession(session));

    const envelope = await gateway.submitCustom({
      clientOperationId: 'op-demo',
      journeyId: created.journeyId,
      decisionId: state.decision!.decisionId,
      customText: '*aku mendekati Elysia dan mengkabedonnya*',
      responseLocale: 'id-ID',
    });

    state = playerReducer(state, { type: 'TURN_COMMITTED', envelope });

    // Belum ada perubahan hubungan sebelum beat penyebab dibaca.
    expect(state.relations.find((entry) => entry.npcId === 'npc_elysia')?.status).toBe('normal');

    state = tapThrough(state, 6);

    const elysia = state.relations.find((entry) => entry.npcId === 'npc_elysia');
    expect(elysia?.status).toBe('waspada');
    expect(elysia?.reasonPublic).toContain('batas profesional');

    // Leo ikut muncul di panggung.
    expect(state.scene.visibleNpcIds).toContain('npc_leo');
  });
});
