import { act, render } from '@testing-library/react-native';
import React, { useMemo } from 'react';

import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan } from '@/data/mock/fixtures';
import type { JourneySession } from '@/data/gateway';
import { usePlayerEngine, type PlayerEngine } from '@/features/player/usePlayerEngine';
import { InMemoryPlaybackStore } from '@/storage/playbackStore';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Auto DITAHAN saat overlay terbuka, bukan DIMATIKAN.
 *
 * Keputusan pemilik produk: "kalau user menyalakan maka nyala terus sampai user
 * matikan." Bentuk sebelumnya memanggil `pauseAuto()` yang mengirim
 * `SET_AUTO false`, sehingga sekadar membuka Riwayat mematikan Auto secara
 * permanen dan pemain harus menyalakannya lagi.
 *
 * Uji ini mengukur dua hal yang saling melengkapi:
 *   - saat `suspended` benar, Auto tidak memajukan cerita;
 *   - saat `suspended` kembali salah, Auto MELANJUTKAN SENDIRI tanpa perlu
 *     dinyalakan ulang.
 *
 * BUKTI MUTASI: hapus `!options.suspended` dari `shouldRun` di
 * `usePlayerEngine.ts`, lalu uji pertama memerah. Ganti `suspended` menjadi
 * pemanggilan `pauseAuto()` (yang mematikan), lalu uji kedua memerah.
 */

const instant = () => new MockStoryGateway({ instant: true });

let mesin: PlayerEngine | null = null;

function Harness({ session, suspended }: { session: JourneySession; suspended: boolean }) {
  const store = useMemo(() => new InMemoryPlaybackStore(), []);
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
    suspended,
    autoEnabled: true,
    store,
  });
  return null;
}

async function siapkan() {
  const gateway = instant();
  const created = await gateway.createJourney({
    clientOperationId: 'op-auto',
    worldId: worldBoskuMantan.worldId,
    persona: { name: 'Arfan', age: 24 },
    responseLocale: 'id-ID',
  });
  const session = await gateway.openJourneySession(created.journeyId);
  return session;
}

describe('Auto — ditahan overlay, bukan dimatikan', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mesin = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('TIDAK memajukan cerita selama `suspended` benar', async () => {
    const session = await siapkan();
    await render(
      <TestProviders>
        <Harness session={session} suspended />
      </TestProviders>,
    );

    /*
     * `revealLine()` WAJIB dipanggil lebih dulu.
     *
     * `shouldRun` mensyaratkan `lineRevealed` — di aplikasi, itu dipanggil
     * `StageText` setelah mesin tik selesai. Tanpa panggilan ini, uji akan lulus
     * karena barisnya belum selesai diketik, BUKAN karena `suspended` — dan
     * penjaga yang lulus karena alasan lain tidak menjaga apa pun. Itu kesalahan
     * yang persis pernah terjadi di berkas uji lain di repositori ini.
     */
    await act(async () => {
      mesin?.revealLine();
      mesin?.toggleAuto();
    });
    expect(mesin?.state.auto).toBe(true);
    expect(mesin?.state.lineRevealed).toBe(true);

    const awal = mesin?.state.cursor ?? 0;
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mesin?.state.cursor).toBe(awal);
    // Dan Auto TETAP menyala — ditahan, bukan dimatikan.
    expect(mesin?.state.auto).toBe(true);
  });

  it('melanjutkan SENDIRI begitu `suspended` kembali salah', async () => {
    const session = await siapkan();
    const { rerender } = await render(
      <TestProviders>
        <Harness session={session} suspended />
      </TestProviders>,
    );

    await act(async () => {
      mesin?.revealLine();
      mesin?.toggleAuto();
    });
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    const sebelum = mesin?.state.cursor ?? 0;

    // Overlay ditutup. Auto TIDAK dinyalakan ulang di sini — ia harus
    // melanjutkan sendiri.
    await rerender(
      <TestProviders>
        <Harness session={session} suspended={false} />
      </TestProviders>,
    );
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mesin?.state.auto).toBe(true);
    expect(mesin?.state.cursor).toBeGreaterThan(sebelum);
  });
});
