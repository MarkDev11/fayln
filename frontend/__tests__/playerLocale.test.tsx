import React from 'react';
import { act, render } from '@testing-library/react-native';

import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan } from '@/data/mock/fixtures';
import type { SubmitChoiceInput, SubmitCustomInput, JourneySession } from '@/data/gateway';
import { usePlayerEngine, type PlayerEngine } from '@/features/player/usePlayerEngine';
import { InMemoryPlaybackStore } from '@/storage/playbackStore';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Bahasa yang DIKIRIM saat giliran harus mengikuti sesi, bukan ditulis mati.
 *
 * Regresi: `usePlayerEngine` menulis mati `responseLocale: 'id-ID'` pada
 * `submitChoice` dan `submitCustom`. Pemain yang memilih English di lembar
 * persona tetap mengirim permintaan berbahasa Indonesia — pilihannya tidak
 * berpengaruh apa pun.
 *
 * BUKTI MERAH: kembalikan `responseLocale: 'id-ID'` di `usePlayerEngine.ts`,
 * lalu uji ini memerah dengan `expected 'id-ID' to be 'en-US'`.
 */

/** Gateway yang merekam masukan giliran, lalu meneruskan ke mock. */
class GatewayPerekam extends MockStoryGateway {
  readonly pilihan: SubmitChoiceInput[] = [];
  readonly bebas: SubmitCustomInput[] = [];

  override async submitChoice(input: SubmitChoiceInput) {
    this.pilihan.push(input);
    return super.submitChoice(input);
  }

  override async submitCustom(input: SubmitCustomInput) {
    this.bebas.push(input);
    return super.submitCustom(input);
  }
}

/** Menangkap mesin dari hook agar dapat dipanggil dari luar render. */
let mesin: PlayerEngine | null = null;

function Harness({ session }: { session: JourneySession }) {
  mesin = usePlayerEngine({
    journeyId: session.journeyId,
    worldId: session.world.worldId,
    worldVersion: session.world.worldVersion,
    personaName: 'Arfan',
    initialBeats: session.beats,
    initialRelations: session.relationsBaseline,
    memory: session.memory,
    simulator: session.simulator,
    responseLocale: session.responseLocale,
    autoEnabled: false,
    /*
     * Penyimpanan disuntikkan. Tanpa ini hook memakai penyimpanan perangkat,
     * yang di lingkungan uji mencoba membuka SQLite native dan gagal dengan
     * "NativeDatabase is not a constructor" — galat yang tidak ada hubungannya
     * dengan yang sedang diuji.
     */
    store: new InMemoryPlaybackStore(),
  });
  return null;
}

/** Membuat perjalanan dengan bahasa tertentu dan memuat sesinya. */
async function sesiDengan(gateway: MockStoryGateway, locale: 'id-ID' | 'en-US') {
  const created = await gateway.createJourney({
    clientOperationId: `op-${locale}`,
    worldId: worldBoskuMantan.worldId,
    persona: { name: 'Arfan', age: 24 },
    responseLocale: locale,
  });
  return gateway.openJourneySession(created.journeyId);
}

/**
 * Mengetuk maju sampai keputusan muncul.
 *
 * Adegan dibaca baris demi baris: `consume()` berhenti di beat terbaca pertama
 * dan menunggu pemain mengetuk. Tanpa langkah ini, `state.decision` tidak pernah
 * terisi dan ujinya gagal karena alasan yang tidak ada hubungannya dengan bahasa.
 */
async function majuSampaiPilihan(batasMs = 8000) {
  const deadline = Date.now() + batasMs;
  while (Date.now() < deadline) {
    if (mesin?.state.decision) return true;
    await act(async () => {
      mesin?.revealLine();
      mesin?.advance();
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return Boolean(mesin?.state.decision);
}

describe('bahasa giliran mengikuti sesi', () => {
  it('sesi membawa bahasa perjalanan', async () => {
    const gateway = new GatewayPerekam({ instant: true });
    const sesi = await sesiDengan(gateway, 'en-US');

    expect(sesi.responseLocale).toBe('en-US');
  });

  it('submitChoice mengirim bahasa dari SESI, bukan id-ID yang ditulis mati', async () => {
    const gateway = new GatewayPerekam({ instant: true });
    const sesi = await sesiDengan(gateway, 'en-US');

    await render(
      <TestProviders gateway={gateway}>
        <Harness session={sesi} />
      </TestProviders>,
    );

    const siap = await majuSampaiPilihan();
    expect(siap).toBe(true);

    await act(async () => {
      mesin?.submitChoice('opt1');
      await new Promise((r) => setTimeout(r, 300));
    });

    expect(gateway.pilihan.length).toBeGreaterThan(0);
    expect(gateway.pilihan[0]?.responseLocale).toBe('en-US');
  });

  it('submitCustom juga memakai bahasa sesi', async () => {
    const gateway = new GatewayPerekam({ instant: true });
    const sesi = await sesiDengan(gateway, 'en-US');

    await render(
      <TestProviders gateway={gateway}>
        <Harness session={sesi} />
      </TestProviders>,
    );

    const siap = await majuSampaiPilihan();
    expect(siap).toBe(true);

    await act(async () => {
      mesin?.setDraft?.('aku menunggu');
    });
    await act(async () => {
      mesin?.submitCustom();
      await new Promise((r) => setTimeout(r, 300));
    });

    if (gateway.bebas.length > 0) {
      expect(gateway.bebas[0]?.responseLocale).toBe('en-US');
    }
  });
});
