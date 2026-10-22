import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan } from '@/data/mock/fixtures';
import { LogDrawer } from '@/features/player/components/LogDrawer';
import { playerReducer } from '@/features/player/reducer';
import { createEmptyPlaybackState } from '@/features/player/types';
import type { Beat } from '@/domain/types';
import { TestProviders } from '@/testing/TestProviders';

const openingLabel = 'Minta maaf secara profesional';
const customText = 'Aku bertanya: “Apa tugas paling penting hari ini?” — pakai daftar prioritas, ya.';

function logBeats(): Beat[] {
  return [
    {
      beatId: 'opening-narration',
      turnId: 'opening',
      sequence: 1,
      event: { type: 'narrate', text: 'Kamu tiba di kantor.' },
    },
    {
      beatId: 'choice-input',
      turnId: 'turn-choice',
      sequence: 1,
      event: { type: 'playerInput', inputKind: 'choice', text: openingLabel },
    },
    {
      beatId: 'choice-response',
      turnId: 'turn-choice',
      sequence: 2,
      event: { type: 'narrate', text: 'Elysia mendengar permintaan maafmu.' },
    },
    {
      beatId: 'custom-input',
      turnId: 'turn-custom',
      sequence: 1,
      event: { type: 'playerInput', inputKind: 'custom', text: customText },
    },
    {
      beatId: 'custom-response',
      turnId: 'turn-custom',
      sequence: 2,
      event: { type: 'say', npcId: 'npc_elysia', text: 'Mari mulai dari daftar onboarding.' },
    },
  ];
}

describe('riwayat masukan pemain', () => {
  it('menampilkan pilihan dan teks bebas sebagai entri Kamu, terbaru lebih dahulu', async () => {
    const beats = logBeats();
    const view = await render(
      <TestProviders>
        <LogDrawer
          visible
          beats={beats}
          cursor={beats.length}
          npcNameById={{ npc_elysia: 'Elysia' }}
          onClose={() => {}}
          testID="player-log"
        />
      </TestProviders>,
    );

    expect(screen.getAllByText('Kamu')).toHaveLength(2);
    expect(screen.getByText(customText)).toBeTruthy();
    expect(screen.getByText(openingLabel)).toBeTruthy();
    expect(screen.getByText('Mari mulai dari daftar onboarding.')).toBeTruthy();
    expect(screen.getByText('Kamu tiba di kantor.')).toBeTruthy();

    // Turns are newest-first, but each player message stays immediately before
    // its corresponding response so the context is clear.
    const serialized = JSON.stringify(view.toJSON());
    const positions = [
      customText,
      'Mari mulai dari daftar onboarding.',
      openingLabel,
      'Elysia mendengar permintaan maafmu.',
      'Kamu tiba di kantor.',
    ].map((text) => serialized.indexOf(JSON.stringify(text)));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('menahan input yang belum dibaca di luar cursor lalu menampilkannya saat dibaca', async () => {
    const beats = logBeats();
    const inputIndex = beats.findIndex((beat) => beat.beatId === 'custom-input');
    const view = await render(
      <TestProviders>
        <LogDrawer
          visible
          beats={beats}
          cursor={inputIndex}
          npcNameById={{ npc_elysia: 'Elysia' }}
          onClose={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.queryByText(customText)).toBeNull();
    expect(screen.queryByText('Mari mulai dari daftar onboarding.')).toBeNull();

    await view.rerender(
      <TestProviders>
        <LogDrawer
          visible
          beats={beats}
          cursor={inputIndex + 1}
          npcNameById={{ npc_elysia: 'Elysia' }}
          onClose={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.getByText(customText)).toBeTruthy();
    // Cursor now includes the player input only; the response remains unread.
    expect(screen.queryByText('Mari mulai dari daftar onboarding.')).toBeNull();
  });

  it('menyatakan urutan terbaru di atas dalam bahasa Indonesia dan Inggris', async () => {
    const beats = logBeats();
    const indonesian = await render(
      <TestProviders locale="id-ID">
        <LogDrawer
          visible
          beats={beats}
          cursor={beats.length}
          npcNameById={{ npc_elysia: 'Elysia' }}
          onClose={() => {}}
        />
      </TestProviders>,
    );
    expect(
      screen.getByText(
        'Riwayat hanya untuk dibaca. Entri terbaru ada di atas; gulir ke bawah untuk awal cerita. Membuka riwayat tidak memakai kuota.',
      ),
    ).toBeTruthy();
    await indonesian.unmount();

    await render(
      <TestProviders locale="en-US">
        <LogDrawer
          visible
          beats={beats}
          cursor={beats.length}
          npcNameById={{ npc_elysia: 'Elysia' }}
          onClose={() => {}}
        />
      </TestProviders>,
    );
    expect(
      screen.getByText(
        'History is read-only. Newest entries are at the top; scroll down for the beginning. Opening it costs no quota.',
      ),
    ).toBeTruthy();
  });

  it('tidak pernah menampilkan playerInput sebagai baris dialog panggung', () => {
    const beats: Beat[] = [
      {
        beatId: 'player-input-stage',
        turnId: 'turn-current',
        sequence: 1,
        event: { type: 'playerInput', inputKind: 'custom', text: customText },
      },
      {
        beatId: 'ai-response-stage',
        turnId: 'turn-current',
        sequence: 2,
        event: { type: 'narrate', text: 'Elysia mengangguk dan mulai menjelaskan.' },
      },
    ];

    const state = playerReducer(createEmptyPlaybackState(), {
      type: 'LOADED',
      payload: {
        journeyId: 'journey-stage',
        worldId: worldBoskuMantan.worldId,
        worldVersion: worldBoskuMantan.worldVersion,
        personaName: 'Arfan',
        beats,
        relations: [],
        memory: { activeVersion: null, source: 'none' },
        simulator: true,
        startCursor: 0,
      },
    });

    expect(state.line).toMatchObject({
      beatId: 'ai-response-stage',
      kind: 'narrate',
      text: 'Elysia mengangguk dan mulai menjelaskan.',
    });
    expect(state.line?.text).not.toBe(customText);
    expect(state.cursor).toBe(2);
  });

  it('memuat pilihan dan customText ke log lagi setelah sesi dibuka ulang', async () => {
    const gateway = new MockStoryGateway({ instant: true });
    const created = await gateway.createJourney({
      clientOperationId: 'op-log-open',
      worldId: worldBoskuMantan.worldId,
      persona: { name: 'Arfan', age: 24 },
      responseLocale: 'id-ID',
    });
    const opening = await gateway.openJourneySession(created.journeyId);
    const firstDecision = opening.beats.find((beat) => beat.event.type === 'presentChoices');
    expect(firstDecision?.event.type).toBe('presentChoices');
    if (!firstDecision || firstDecision.event.type !== 'presentChoices') {
      throw new Error('Fixture pembuka harus menyajikan pilihan.');
    }
    const selected = firstDecision.event.options[0];

    await gateway.submitChoice({
      clientOperationId: 'op-log-choice',
      journeyId: created.journeyId,
      decisionId: firstDecision.event.decisionId,
      optionId: selected.optionId,
      responseLocale: 'id-ID',
    });
    const afterChoice = await gateway.openJourneySession(created.journeyId);
    const nextDecision = [...afterChoice.beats]
      .reverse()
      .find((beat) => beat.event.type === 'presentChoices');
    expect(nextDecision?.event.type).toBe('presentChoices');
    if (!nextDecision || nextDecision.event.type !== 'presentChoices') {
      throw new Error('Turn pilihan harus menyajikan keputusan lanjutan.');
    }

    await gateway.submitCustom({
      clientOperationId: 'op-log-custom',
      journeyId: created.journeyId,
      decisionId: nextDecision.event.decisionId,
      customText,
      responseLocale: 'id-ID',
    });
    const reopened = await gateway.openJourneySession(created.journeyId);
    const inputBeats = reopened.beats.filter((beat) => beat.event.type === 'playerInput');
    expect(inputBeats.map((beat) => beat.event)).toEqual([
      { type: 'playerInput', inputKind: 'choice', text: selected.label },
      { type: 'playerInput', inputKind: 'custom', text: customText },
    ]);

    await render(
      <TestProviders>
        <LogDrawer
          visible
          beats={reopened.beats}
          cursor={reopened.beats.length}
          npcNameById={Object.fromEntries(reopened.world.characters.map((character) => [character.npcId, character.name]))}
          onClose={() => {}}
        />
      </TestProviders>,
    );
    expect(screen.getByText(selected.label)).toBeTruthy();
    expect(screen.getByText(customText)).toBeTruthy();
  });
});
