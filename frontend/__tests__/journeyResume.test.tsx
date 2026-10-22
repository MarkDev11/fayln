import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan } from '@/data/mock/fixtures';
import type { JourneySession } from '@/data/gateway';
import { usePlayerEngine, type PlayerEngine } from '@/features/player/usePlayerEngine';
import { InMemoryPlaybackStore } from '@/storage/playbackStore';
import { TestProviders } from '@/testing/TestProviders';

let engine: PlayerEngine | null = null;

function PlayerHarness({
  session,
  store,
}: {
  session: JourneySession;
  store: InMemoryPlaybackStore;
}) {
  engine = usePlayerEngine({
    journeyId: session.journeyId,
    worldId: session.world.worldId,
    worldVersion: session.world.worldVersion,
    personaName: 'Arfan',
    initialBeats: session.beats,
    initialRelations: session.relationsBaseline,
    memory: session.memory,
    simulator: session.simulator,
    responseLocale: session.responseLocale,
    store,
    autoEnabled: false,
  });
  return null;
}

describe('Continue Journey — resume dari sesi terbaru', () => {
  beforeEach(() => {
    engine = null;
  });

  it('membuka sesi hasil pilihan pada turn terbaru, bukan mengulang beat pembuka', async () => {
    const gateway = new MockStoryGateway({ instant: true });
    const created = await gateway.createJourney({
      clientOperationId: 'op-resume-open',
      worldId: worldBoskuMantan.worldId,
      persona: { name: 'Arfan', age: 24 },
      responseLocale: 'id-ID',
    });
    const initial = await gateway.openJourneySession(created.journeyId);
    const openingDecisionBeat = initial.beats.find((beat) => beat.event.type === 'presentChoices');
    expect(openingDecisionBeat?.event.type).toBe('presentChoices');
    if (!openingDecisionBeat || openingDecisionBeat.event.type !== 'presentChoices') {
      throw new Error('Fixture pembuka harus menyediakan keputusan pemain.');
    }

    const openingCount = initial.beats.length;
    const openingFirstLine = initial.beats.find(
      (beat) => beat.event.type === 'narrate' || beat.event.type === 'say',
    );
    expect(openingFirstLine?.event.type).toBe('narrate');

    // Pemain membuat pilihan yang berbeda dari pembuka; simulator menghasilkan
    // turn baru yang persisten, lalu aplikasi dibuka kembali melalui gateway.
    const selectedOption = openingDecisionBeat.event.options[1];
    expect(selectedOption).toBeDefined();
    if (!selectedOption) {
      throw new Error('Fixture keputusan harus memiliki opsi kedua.');
    }
    const turn = await gateway.submitChoice({
      clientOperationId: 'op-resume-choice',
      journeyId: created.journeyId,
      decisionId: openingDecisionBeat.event.decisionId,
      optionId: selectedOption.optionId,
      responseLocale: 'id-ID',
    });
    const reopened = await gateway.openJourneySession(created.journeyId);

    expect(turn.simulator).toBe(true);
    expect(turn.modelId).toBe('simulator/deterministic-v1');
    expect(reopened.simulator).toBe(true);
    expect(reopened.beats).toHaveLength(openingCount + turn.beats.length);
    expect(reopened.beats.slice(0, openingCount)).toEqual(initial.beats);
    expect(reopened.beats.slice(openingCount)).toEqual(turn.beats);
    expect(new Set(reopened.beats.map((beat) => beat.beatId)).size).toBe(reopened.beats.length);

    const firstNewReadableBeat = turn.beats.find(
      (beat) => beat.event.type === 'narrate' || beat.event.type === 'say',
    );
    expect(firstNewReadableBeat?.event.type).toBe('narrate');
    if (!firstNewReadableBeat || firstNewReadableBeat.event.type !== 'narrate') {
      throw new Error('Pilihan fixture harus menghasilkan narasi turn baru.');
    }
    // This is the mock/simulator's distinct response branch for option 2, not a
    // generic success marker that could conceal a static opening replay.
    expect(firstNewReadableBeat.event.text).toBe(
      'Kamu menyebut alasanmu seperlunya, lalu langsung bertanya apa yang harus dikerjakan.',
    );
    expect(firstNewReadableBeat.event.text).not.toBe(
      openingFirstLine?.event.type === 'narrate' ? openingFirstLine.event.text : '',
    );

    // Simulasikan checkpoint lokal terakhir: pemain sudah membaca pembuka sampai
    // keputusan dan membuat pilihan, tetapi menutup aplikasi sebelum sempat
    // menyimpan cursor dari turn baru. Continue Journey harus memakai checkpoint
    // tersebut bersama beat terbaru yang baru saja diambil dari server.
    const store = new InMemoryPlaybackStore();
    await store.save({
      journeyId: created.journeyId,
      cursor: openingCount,
      draft: '',
      autoDelayMs: 2000,
      savedAt: '2026-10-09T00:00:00.000Z',
    });

    await render(
      <TestProviders gateway={gateway}>
        <PlayerHarness session={reopened} store={store} />
      </TestProviders>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(engine?.state.simulator).toBe(true);
    expect(engine?.state.beats).toHaveLength(openingCount + turn.beats.length);
    expect(new Set(engine?.state.beats.map((beat) => beat.beatId)).size).toBe(
      engine?.state.beats.length,
    );
    expect(engine?.state.line?.beatId).toBe(firstNewReadableBeat.beatId);
    expect(engine?.state.line?.text).toBe(firstNewReadableBeat.event.text);
    expect(engine?.state.line?.text).not.toBe(
      openingFirstLine?.event.type === 'narrate' ? openingFirstLine.event.text : '',
    );

    // Lanjutkan interaksi dari keputusan yang benar-benar ada di sesi terbaru.
    // Commit berikutnya harus mengganti state yang tampil dengan turn baru dan
    // menambahkan beat satu kali; revision/text tidak boleh tertinggal pada turn lama.
    for (let index = 0; index < 20 && !engine?.state.decision; index += 1) {
      const current = engine;
      if (!current) {
        throw new Error('Player engine belum siap.');
      }
      await act(async () => {
        if (current.state.line && !current.state.lineRevealed) {
          current.revealLine();
        }
        current.advance();
      });
    }

    const latestDecision = engine?.state.decision;
    expect(latestDecision?.decisionId).toBe('d002');
    const latestOption = latestDecision?.options[2];
    expect(latestOption).toBeDefined();
    if (!latestDecision || !latestOption) {
      throw new Error('Turn terbaru harus menyajikan opsi pada layar saat ini.');
    }

    const priorBeatIds = new Set(engine?.state.beats.map((beat) => beat.beatId));
    const priorBeatCount = engine?.state.beats.length ?? 0;
    await act(async () => {
      engine?.submitChoice(latestOption.optionId);
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
    });
    await waitFor(() => expect(engine?.state.revision).toBe(3));

    const afterSecondChoice = await gateway.openJourneySession(created.journeyId);
    const newTurnBeats = afterSecondChoice.beats.filter((beat) => !priorBeatIds.has(beat.beatId));
    const newTurnFirstLine = newTurnBeats.find(
      (beat) => beat.event.type === 'narrate' || beat.event.type === 'say',
    );
    expect(newTurnBeats.length).toBeGreaterThan(0);
    expect(engine?.state.beats).toHaveLength(priorBeatCount + newTurnBeats.length);
    expect(engine?.state.beats.map((beat) => beat.beatId)).toEqual(
      afterSecondChoice.beats.map((beat) => beat.beatId),
    );
    expect(new Set(engine?.state.beats.map((beat) => beat.beatId)).size).toBe(
      engine?.state.beats.length,
    );
    expect(engine?.state.line?.beatId).toBe(newTurnFirstLine?.beatId);
    expect(engine?.state.line?.text).toBe(
      'Kamu mencoba meredakan suasana dengan nada ringan. Suasana justru membeku.',
    );
    expect(engine?.state.simulator).toBe(true);
  });
});
