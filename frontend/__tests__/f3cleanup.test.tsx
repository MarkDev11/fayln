import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { LogDrawer } from '@/features/player/components/LogDrawer';
import { ReportSheet } from '@/features/report/ReportSheet';
import {
  MockStoryGateway,
  buildCustomBeatsForTest,
  buildOpeningBeats,
} from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan } from '@/data/mock/fixtures';
import { TestProviders } from '@/testing/TestProviders';
import type { Beat } from '@/domain/types';

const npcNameById = { npc_elysia: 'Elysia', npc_leo: 'Leo' };

const beats: Beat[] = [...buildOpeningBeats('t001'), ...buildCustomBeatsForTest('t002', 'kabedon')];

describe('LogDrawer', () => {
  it('hanya menampilkan beat yang sudah dibaca', async () => {
    // Empat beat pertama sudah dibaca; sisanya belum.
    const view = await render(
      <TestProviders>
        <LogDrawer visible beats={beats} cursor={4} npcNameById={npcNameById} onClose={() => {}} />
      </TestProviders>,
    );

    expect(view.getByText(/Pagi itu kamu berdiri/)).toBeTruthy();
    // Dialog Elysia ada di beat keenam, jadi belum boleh tampil.
    expect(view.queryByText(/anak barunya/)).toBeNull();
  });

  it('menampilkan dialog dan nama pembicara setelah dibaca', async () => {
    const view = await render(
      <TestProviders>
        <LogDrawer visible beats={beats} cursor={8} npcNameById={npcNameById} onClose={() => {}} />
      </TestProviders>,
    );

    expect(view.getByText('Elysia')).toBeTruthy();
    expect(view.getByText(/anak barunya/)).toBeTruthy();
  });

  it('menampilkan perubahan hubungan sebagai baris sistem', async () => {
    const view = await render(
      <TestProviders>
        <LogDrawer
          visible
          beats={beats}
          cursor={beats.length}
          npcNameById={npcNameById}
          onClose={() => {}}
        />
      </TestProviders>,
    );

    expect(view.getByText('Hubungan dengan Elysia: Waspada')).toBeTruthy();
  });

  it('menampilkan state kosong saat belum ada yang dibaca', async () => {
    const view = await render(
      <TestProviders>
        <LogDrawer visible beats={beats} cursor={0} npcNameById={npcNameById} onClose={() => {}} />
      </TestProviders>,
    );

    expect(view.getByText('Belum ada yang tercatat di perjalanan ini.')).toBeTruthy();
  });

  it('menjepit cursor yang melebihi jumlah beat tanpa gagal', async () => {
    const view = await render(
      <TestProviders>
        <LogDrawer
          visible
          beats={beats}
          cursor={beats.length + 99}
          npcNameById={npcNameById}
          onClose={() => {}}
        />
      </TestProviders>,
    );

    expect(view.getByText('Hubungan dengan Elysia: Waspada')).toBeTruthy();
  });
});

/**
 * Kendali perilaku cache gambar.
 *
 * Sengaja memakai variabel modul, bukan `jest.resetModules()`: mereset modul juga
 * mereset React, sehingga render berikutnya memakai instans React yang berbeda dan
 * gagal dengan "Cannot read properties of null (reading 'useRef')".
 */
const cacheBehaviour = { memory: true, disk: true, shouldThrow: false };

jest.mock('expo-image', () => ({
  Image: {
    clearMemoryCache: jest.fn(async () => {
      if (cacheBehaviour.shouldThrow) {
        throw new Error('gagal');
      }
      return cacheBehaviour.memory;
    }),
    clearDiskCache: jest.fn(async () => {
      if (cacheBehaviour.shouldThrow) {
        throw new Error('gagal');
      }
      return cacheBehaviour.disk;
    }),
  },
}));

import { clearAssetCache } from '@/storage/assetCache';

describe('cache aset', () => {
  beforeEach(() => {
    cacheBehaviour.memory = true;
    cacheBehaviour.disk = true;
    cacheBehaviour.shouldThrow = false;
  });

  it('melaporkan berhasil ketika cache dibersihkan', async () => {
    const result = await clearAssetCache();
    expect(result.outcome).toBe('cleared');
    expect(result.memory).toBe(true);
    expect(result.disk).toBe(true);
  });

  it('melaporkan tidak didukung ketika platform menolak', async () => {
    cacheBehaviour.memory = false;
    cacheBehaviour.disk = false;

    const result = await clearAssetCache();
    expect(result.outcome).toBe('unsupported');
  });

  it('tidak melempar ketika pembersihan gagal', async () => {
    cacheBehaviour.shouldThrow = true;

    const result = await clearAssetCache();
    expect(result.outcome).toBe('unsupported');
  });

  it('tetap berhasil bila hanya cache memori yang terbersihkan', async () => {
    cacheBehaviour.disk = false;

    const result = await clearAssetCache();
    expect(result.outcome).toBe('cleared');
    expect(result.memory).toBe(true);
    expect(result.disk).toBe(false);
  });
});

describe('ReportSheet', () => {
  it('menolak kirim tanpa kategori', async () => {
    const onSubmit = jest.fn();
    const view = await render(
      <TestProviders>
        <ReportSheet visible onSubmit={onSubmit} onClose={() => {}} />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('report-submit'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(view.getByText('Pilih salah satu kategori lebih dahulu.')).toBeTruthy();
  });

  it('mengirim kategori dan keterangan yang dipilih', async () => {
    const onSubmit = jest.fn(async () => ({
      reportId: 'rep_0001',
      accepted: true,
      localOnly: true,
    }));
    const view = await render(
      <TestProviders>
        <ReportSheet visible journeyId="j_001" onSubmit={onSubmit} onClose={() => {}} />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('report-category-character'));
    await fireEvent.changeText(view.getByTestId('report-detail'), 'Leo tiba-tiba bersikap kasar.');
    await fireEvent.press(view.getByTestId('report-submit'));

    expect(onSubmit).toHaveBeenCalledWith({
      category: 'character',
      detail: 'Leo tiba-tiba bersikap kasar.',
      journeyId: 'j_001',
    });
  });

  it('menandai laporan simulator sebagai lokal, bukan terkirim ke server', async () => {
    const view = await render(
      <TestProviders>
        <ReportSheet
          visible
          onSubmit={async () => ({ reportId: 'rep_0002', accepted: true, localOnly: true })}
          onClose={() => {}}
        />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('report-category-story'));
    await fireEvent.press(view.getByTestId('report-submit'));

    expect(view.getByText('Laporan diterima.')).toBeTruthy();
    expect(
      view.getByText('Mode simulator: laporan dicatat secara lokal dan belum dikirim ke server.'),
    ).toBeTruthy();
  });

  it('menampilkan kegagalan tanpa berpura-pura terkirim', async () => {
    const view = await render(
      <TestProviders>
        <ReportSheet
          visible
          onSubmit={async () => {
            throw new Error('gagal');
          }}
          onClose={() => {}}
        />
      </TestProviders>,
    );

    await fireEvent.press(view.getByTestId('report-category-technical'));
    await fireEvent.press(view.getByTestId('report-submit'));

    expect(
      view.getByText('Laporan gagal dikirim. Tidak ada yang berubah — coba lagi.'),
    ).toBeTruthy();
  });

  it('menyatakan bahwa isi cerita tidak dikirim otomatis', async () => {
    const view = await render(
      <TestProviders>
        <ReportSheet visible onSubmit={async () => ({ reportId: 'x', accepted: true, localOnly: true })} onClose={() => {}} />
      </TestProviders>,
    );

    expect(
      view.getByText(
        'Isi cerita tidak dikirim otomatis. Hanya kategori dan keterangan yang kamu tulis yang dilaporkan.',
      ),
    ).toBeTruthy();
  });
});

describe('kontrak pelaporan gateway', () => {
  it('mencatat laporan dan menandainya lokal', async () => {
    const gateway = new MockStoryGateway({ instant: true });

    const result = await gateway.submitReport({
      clientOperationId: 'rep-op-1',
      category: 'asset',
      detail: 'Portrait Leo tidak sesuai ekspresi.',
    });

    expect(result.accepted).toBe(true);
    expect(result.localOnly).toBe(true);
    expect(gateway.recordedReports()).toHaveLength(1);
    expect(gateway.recordedReports()[0]?.category).toBe('asset');
  });

  it('memberi setiap laporan ID yang berbeda', async () => {
    const gateway = new MockStoryGateway({ instant: true });

    const first = await gateway.submitReport({
      clientOperationId: 'rep-a',
      category: 'story',
      detail: '',
    });
    const second = await gateway.submitReport({
      clientOperationId: 'rep-b',
      category: 'story',
      detail: '',
    });

    expect(first.reportId).not.toBe(second.reportId);
  });
});

describe('kontrak world untuk pengujian log', () => {
  it('menyediakan nama tokoh untuk peta nama', () => {
    const map = Object.fromEntries(
      worldBoskuMantan.characters.map((character) => [character.npcId, character.name]),
    );
    expect(map).toEqual({ npc_elysia: 'Elysia', npc_leo: 'Leo' });
  });
});
