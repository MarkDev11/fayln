import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { NPCRelationChip } from '@/components/NPCRelationChip';
import { StateView } from '@/components/StateView';
import { StoryCard } from '@/components/StoryCard';
import { catalogFixtures } from '@/data/mock/fixtures';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Catatan: pada @testing-library/react-native v14, `render` bersifat async.
 * Setiap pemanggilan WAJIB di-await, jika tidak `screen` belum terisi dan semua
 * kueri akan gagal dengan "`render` function has not been called".
 */

const boskuMantan = catalogFixtures.find((item) => item.worldId === 'w_bosku-mantan');
const arsip = catalogFixtures.find((item) => item.worldId === 'w_arsip-lama');

describe('StoryCard', () => {
  it('menampilkan judul dan genre dalam Bahasa Indonesia', async () => {
    await render(
      <TestProviders>
        <StoryCard item={boskuMantan!} onPress={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText(boskuMantan!.title)).toBeTruthy();
    expect(screen.getByText('Romansa +2')).toBeTruthy();
  });

  it('menyediakan label aksesibilitas yang memuat judul dan status', async () => {
    await render(
      <TestProviders>
        <StoryCard item={boskuMantan!} onPress={() => {}} />
      </TestProviders>,
    );

    expect(
      screen.getByLabelText(`${boskuMantan!.title}. Romansa, Drama, Kehidupan Kantor. Terbit`),
    ).toBeTruthy();
  });

  it('menandai dunia terarsip dengan label status yang terlihat', async () => {
    await render(
      <TestProviders>
        <StoryCard item={arsip!} onPress={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText('Diarsipkan')).toBeTruthy();
  });

  it('menerjemahkan label ketika locale Inggris dipilih', async () => {
    await render(
      <TestProviders locale="en-US">
        <StoryCard item={boskuMantan!} onPress={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText('Romance +2')).toBeTruthy();
  });
});

describe('NPCRelationChip', () => {
  it('menampilkan nama dan status hubungan sebagai teks, bukan hanya warna', async () => {
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Elysia" status="waspada" />
      </TestProviders>,
    );

    expect(screen.getByText('Elysia')).toBeTruthy();
    expect(screen.getByText('Waspada')).toBeTruthy();
  });

  it('memakai label netral untuk status yang tidak dikenal', async () => {
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Elysia" status="unknown" />
      </TestProviders>,
    );

    expect(screen.getByText('Belum diketahui')).toBeTruthy();
  });

  it('tidak menampilkan enum mentah ke pemain', async () => {
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Elysia" status="waspada" />
      </TestProviders>,
    );

    expect(screen.queryByText('waspada')).toBeNull();
  });
});

describe('StateView', () => {
  it('menampilkan aksi lanjutan ketika disediakan', async () => {
    await render(
      <TestProviders>
        <StateView
          kind="empty"
          title="Tidak ada cerita yang cocok"
          body="Coba kata kunci lain."
          actionLabel="Atur ulang"
          onAction={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.getByText('Tidak ada cerita yang cocok')).toBeTruthy();
    expect(screen.getByText('Atur ulang')).toBeTruthy();
  });

  it('tidak menampilkan tombol ketika tidak ada aksi', async () => {
    await render(
      <TestProviders>
        <StateView kind="error" title="Gagal memuat" />
      </TestProviders>,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});
