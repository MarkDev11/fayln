import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { MockStoryGateway, FREE_DAILY_ALLOWANCE } from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan } from '@/data/mock/fixtures';
import { JourneyCard } from '@/features/journeys/JourneyCard';
import type { JourneySummary } from '@/domain/types';
import { TestProviders } from '@/testing/TestProviders';

const instant = () => new MockStoryGateway({ instant: true });

const summary: JourneySummary = {
  journeyId: 'j_001',
  worldId: 'w_bosku-mantan',
  worldTitle: 'Bosku Adalah Mantan Pacarku di Kampus Dulu',
  coverAssetId: 'a_cover_kantor',
  coverUri: 'https://contoh.test/assets/cover/a_cover_kantor.png',
  worldVersion: 7,
  personaName: 'Arfan',
  lastReadBeatId: 't001-b004',
  lastReadSequence: 4,
  decisionCount: 1,
  hasUnreadBeats: true,
  updatedAt: new Date().toISOString(),
};

async function startJourney(gateway: MockStoryGateway) {
  return gateway.createJourney({
    clientOperationId: 'op-open',
    worldId: worldBoskuMantan.worldId,
    persona: { name: 'Arfan', age: 24 },
    responseLocale: 'id-ID',
  });
}

describe('AC-18 — daftar perjalanan', () => {
  it('kosong sebelum ada perjalanan', async () => {
    const gateway = instant();
    expect(await gateway.fetchJourneys()).toEqual([]);
  });

  it('menampilkan perjalanan yang sudah dibuat', async () => {
    const gateway = instant();
    await startJourney(gateway);

    const list = await gateway.fetchJourneys();
    expect(list).toHaveLength(1);
    expect(list[0]?.worldTitle).toBe(worldBoskuMantan.title);
    expect(list[0]?.personaName).toBe('Arfan');
  });

  it('mengurutkan yang terakhir dimainkan lebih dahulu', async () => {
    const gateway = instant();
    const first = await startJourney(gateway);
    const second = await gateway.createJourney({
      clientOperationId: 'op-open-2',
      worldId: 'w_lentera-terakhir',
      persona: { name: 'Arfan', age: 24 },
      responseLocale: 'id-ID',
    });

    // Perjalanan pertama diperbarui belakangan, jadi harus muncul di atas.
    await gateway.syncReadProgress({
      journeyId: first.journeyId,
      lastReadSequence: 9,
      lastReadBeatId: 't001-b009',
      decisionCount: 2,
      hasUnreadBeats: false,
    });

    const list = await gateway.fetchJourneys();
    expect(list[0]?.journeyId).toBe(first.journeyId);
    expect(list[1]?.journeyId).toBe(second.journeyId);
  });
});

describe('AC-19 — laporan posisi baca', () => {
  it('memperbarui progres dan menghapus penanda belum dibaca', async () => {
    const gateway = instant();
    const created = await startJourney(gateway);

    const before = await gateway.fetchJourneyDetail(created.journeyId);
    expect(before.hasUnreadBeats).toBe(true);

    await gateway.syncReadProgress({
      journeyId: created.journeyId,
      lastReadSequence: 12,
      lastReadBeatId: 't002-b012',
      decisionCount: 1,
      hasUnreadBeats: false,
    });

    const after = await gateway.fetchJourneyDetail(created.journeyId);
    expect(after.lastReadSequence).toBe(12);
    expect(after.hasUnreadBeats).toBe(false);
    expect(after.presentedThroughSequence).toBe(12);
  });

  it('menolak perjalanan yang tidak dikenal', async () => {
    const gateway = instant();
    await expect(
      gateway.syncReadProgress({
        journeyId: 'j_tidak-ada',
        lastReadSequence: 1,
        lastReadBeatId: 'x',
        decisionCount: 0,
        hasUnreadBeats: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('AC-20 — menghapus perjalanan', () => {
  it('menghapus hanya perjalanan yang dipilih', async () => {
    const gateway = instant();
    const first = await startJourney(gateway);
    const second = await gateway.createJourney({
      clientOperationId: 'op-open-2',
      worldId: 'w_lentera-terakhir',
      persona: { name: 'Arfan', age: 24 },
      responseLocale: 'id-ID',
    });

    await gateway.deleteJourney(first.journeyId);

    const list = await gateway.fetchJourneys();
    expect(list.map((item) => item.journeyId)).toEqual([second.journeyId]);
  });

  it('membuat perjalanan baru bisa dimulai lagi setelah dihapus', async () => {
    const gateway = instant();
    const created = await startJourney(gateway);
    await gateway.deleteJourney(created.journeyId);

    // Konflik satu-aktif-per-world sudah hilang, jadi pembuatan berhasil.
    const again = await startJourney(gateway);
    expect(again.journeyId).not.toBe(created.journeyId);
  });

  it('melaporkan kegagalan tanpa berpura-pura terhapus', async () => {
    const gateway = instant();
    await expect(gateway.deleteJourney('j_tidak-ada')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
});

describe('AC-24/AC-25 — kuota', () => {
  it('menghitung sisa kuota dari pemakaian', async () => {
    const gateway = new MockStoryGateway({ instant: true, initialSpent: 40_000 });
    const usage = await gateway.fetchUsage();

    expect(usage.spent).toBe(40_000);
    expect(usage.available).toBe(FREE_DAILY_ALLOWANCE - 40_000);
    expect(usage.isEstimate).toBe(true);
  });

  it('tidak pernah melaporkan sisa negatif', async () => {
    const gateway = new MockStoryGateway({
      instant: true,
      initialSpent: FREE_DAILY_ALLOWANCE * 2,
    });
    const usage = await gateway.fetchUsage();
    expect(usage.available).toBe(0);
  });

  it('menaikkan pemakaian setelah giliran berhasil', async () => {
    const gateway = instant();
    const created = await startJourney(gateway);
    const before = await gateway.fetchUsage();

    await gateway.submitChoice({
      clientOperationId: 'op-turn',
      journeyId: created.journeyId,
      decisionId: 'd001',
      optionId: 'opt1',
      responseLocale: 'id-ID',
    });

    const after = await gateway.fetchUsage();
    expect(after.spent).toBeGreaterThan(before.spent);
  });
});

describe('AC-26 — memori per paket', () => {
  it('Free tidak memiliki catatan memori', async () => {
    const gateway = instant();
    const created = await startJourney(gateway);
    const detail = await gateway.fetchJourneyDetail(created.journeyId);

    expect(detail.memory.activeVersion).toBeNull();
    expect(detail.memory.source).toBe('none');
  });
});

describe('JourneyCard', () => {
  it('menampilkan judul, tokoh, dan penanda belum dibaca', async () => {
    const view = await render(
      <TestProviders>
        <JourneyCard journey={summary} onPress={() => {}} />
      </TestProviders>,
    );

    expect(view.getByText(summary.worldTitle)).toBeTruthy();
    expect(view.getByText('Tokoh: Arfan')).toBeTruthy();
    expect(view.getByText('Belum selesai dibaca')).toBeTruthy();
  });

  /*
   * BUKTI MERAH: kembalikan `uri={assetUri(journey.coverAssetId)}` di
   * `JourneyCard.tsx`, lalu uji ini memerah pada baris pertama —
   * `getAllByLabelText` tidak menemukan simpul apa pun, karena `AssetImage`
   * menampilkan PLACEHOLDER berlabel "<judul>. Gambar belum tersedia." dan
   * tidak merender gambar sama sekali. Itulah yang terjadi di halaman
   * "Perjalanan": kartu tampil tanpa sampul, tanpa galat apa pun.
   *
   * Yang diperiksa `source`, bukan `uri`: `AssetImage` menyerahkan alamat ke
   * `expo-image` lewat prop `source`, dan bentuknya ARRAY `[{ uri }]` —
   * membaca `source.uri` menghasilkan `undefined` dan uji akan memerah
   * padahal gambarnya benar. Terukur, bukan ditebak.
   */
  it('memuat sampul dari coverUri, bukan dari ID aset', async () => {
    const view = await render(
      <TestProviders>
        <JourneyCard journey={summary} onPress={() => {}} />
      </TestProviders>,
    );

    const gambar = view.getAllByLabelText(summary.worldTitle)[0];
    expect(gambar).toBeTruthy();

    const sumber = gambar?.props.source as { uri?: string }[] | undefined;
    const alamat = Array.isArray(sumber) ? sumber[0]?.uri : undefined;

    expect(alamat).toBe(summary.coverUri);
    // Awalan internal berarti gambar tidak akan pernah termuat.
    expect(String(alamat).startsWith('asset://')).toBe(false);
  });

  it('menyembunyikan penanda ketika semua sudah dibaca', async () => {
    const view = await render(
      <TestProviders>
        <JourneyCard journey={{ ...summary, hasUnreadBeats: false }} onPress={() => {}} />
      </TestProviders>,
    );

    expect(view.queryByText('Belum selesai dibaca')).toBeNull();
  });

  it('mengirim journeyId saat ditekan', async () => {
    const onPress = jest.fn();
    const view = await render(
      <TestProviders>
        <JourneyCard journey={summary} onPress={onPress} testID="card" />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('card'));

    expect(onPress).toHaveBeenCalledWith('j_001');
  });

  it('menyediakan label aksesibilitas yang memuat judul dan tokoh', async () => {
    await render(
      <TestProviders>
        <JourneyCard journey={summary} onPress={() => {}} />
      </TestProviders>,
    );

    expect(
      screen.getByLabelText(
        `${summary.worldTitle}. Terakhir dimainkan hari ini. Tokoh: Arfan`,
      ),
    ).toBeTruthy();
  });
});
