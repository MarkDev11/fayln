import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ChoiceSheet } from '@/features/player/components/ChoiceSheet';
import { Composer, MAX_CUSTOM_ACTION_CHARS } from '@/features/player/components/Composer';
import { DialogueBox } from '@/features/player/components/DialogueBox';
import { GatewayErrorSheet, mapGatewayError } from '@/features/player/components/GatewayErrorSheet';
import { PlayerControls } from '@/features/player/components/PlayerControls';
import { RelationNotice } from '@/features/player/components/RelationNotice';
import type { PendingDecision } from '@/features/player/types';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Catatan: pada @testing-library/react-native v14, `render` DAN `fireEvent.press`
 * sama-sama async dan wajib di-await. Melewatkan await membuat act() bocor ke tes
 * berikutnya.
 */

const decision: PendingDecision = {
  beatId: 'b007',
  decisionId: 'd001',
  prompt: 'Bagaimana kamu merespons?',
  options: [
    { optionId: 'opt1', label: 'Minta maaf secara profesional', description: 'Akui keterlambatan.' },
    { optionId: 'opt2', label: 'Jelaskan singkat', description: 'Sebut alasan seperlunya.' },
    { optionId: 'opt3', label: 'Coba meredakan dengan humor', description: 'Nada ringan.' },
  ],
};

describe('DialogueBox', () => {
  it('menampilkan nama pembicara dan isi dialog', async () => {
    await render(
      <TestProviders>
        <DialogueBox
          line={{ beatId: 'b1', kind: 'say', speakerNpcId: 'npc_elysia', text: 'Kamu telat.' }}
          speakerName="Elysia"
          onRevealed={() => {}}
          onAdvance={() => {}}
          instant
        />
      </TestProviders>,
    );

    expect(screen.getByText('Elysia')).toBeTruthy();
    expect(screen.getByText('Kamu telat.')).toBeTruthy();
  });

  it('tidak menampilkan nama pembicara pada narasi', async () => {
    await render(
      <TestProviders>
        <DialogueBox
          line={{ beatId: 'b2', kind: 'narrate', speakerNpcId: null, text: 'Kamu memasuki gedung.' }}
          speakerName={null}
          onRevealed={() => {}}
          onAdvance={() => {}}
          instant
        />
      </TestProviders>,
    );

    expect(screen.getByText('Kamu memasuki gedung.')).toBeTruthy();
    expect(screen.queryByText('Elysia')).toBeNull();
  });

  it('memanggil onAdvance saat ditekan setelah teks selesai', async () => {
    const onAdvance = jest.fn();
    await render(
      <TestProviders>
        <DialogueBox
          line={{ beatId: 'b3', kind: 'narrate', speakerNpcId: null, text: 'Teks pendek.' }}
          speakerName={null}
          onRevealed={() => {}}
          onAdvance={onAdvance}
          instant
        />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByText('Teks pendek.'));

    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});

describe('ChoiceSheet', () => {
  it('menampilkan tepat tiga opsi dengan nomor urut', async () => {
    await render(
      <TestProviders>
        <ChoiceSheet decision={decision} onSelect={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Minta maaf secara profesional')).toBeTruthy();
    expect(screen.getByText('Coba meredakan dengan humor')).toBeTruthy();
  });

  it('mengirim optionId yang dipilih', async () => {
    const onSelect = jest.fn();
    await render(
      <TestProviders>
        <ChoiceSheet decision={decision} onSelect={onSelect} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByText('Jelaskan singkat'));

    expect(onSelect).toHaveBeenCalledWith('opt2');
  });

  it('menonaktifkan seluruh opsi saat pengiriman berlangsung', async () => {
    const onSelect = jest.fn();
    await render(
      <TestProviders>
        <ChoiceSheet decision={decision} disabled onSelect={onSelect} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByText('Jelaskan singkat'));

    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('Composer', () => {
  it('menonaktifkan tombol kirim saat draft kosong', async () => {
    const onSubmit = jest.fn();
    await render(
      <TestProviders>
        <Composer value="   " onChange={() => {}} onSubmit={onSubmit} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByTestId('composer-send'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mengirim draft yang berisi teks', async () => {
    const onSubmit = jest.fn();
    await render(
      <TestProviders>
        <Composer value="aku bertanya soal pekerjaan" onChange={() => {}} onSubmit={onSubmit} />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByTestId('composer-send'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('menampilkan peringatan dan menonaktifkan kirim saat melebihi batas', async () => {
    const onSubmit = jest.fn();
    await render(
      <TestProviders>
        <Composer
          value={'a'.repeat(MAX_CUSTOM_ACTION_CHARS + 1)}
          onChange={() => {}}
          onSubmit={onSubmit}
        />
      </TestProviders>,
    );

    expect(screen.getByText('Tindakanmu terlalu panjang. Pendekkan sedikit.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('composer-send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('GatewayErrorSheet', () => {
  it('memetakan rate limit ke pesan tanpa tombol coba lagi', () => {
    const copy = mapGatewayError({
      code: 'RATE_LIMITED',
      message: 'Terlalu cepat.',
      retryable: true,
      retryAfterSec: 30,
    });

    expect(copy.titleKey).toBe('gateway.rateLimitedTitle');
    expect(copy.canRetry).toBe(false);
  });

  it('mengizinkan coba lagi untuk gangguan jaringan', () => {
    const copy = mapGatewayError({
      code: 'NETWORK',
      message: 'Koneksi terputus.',
      retryable: true,
    });

    expect(copy.canRetry).toBe(true);
  });

  it('tidak menampilkan tombol coba lagi untuk blokir abuse (FR-74)', async () => {
    await render(
      <TestProviders>
        <GatewayErrorSheet
          error={{
            code: 'ABUSE_BLOCKED',
            message: 'Dijeda.',
            retryable: false,
            blockedUntil: new Date(Date.now() + 60_000).toISOString(),
          }}
          onRetry={() => {}}
          onDismiss={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.queryByTestId('error-retry')).toBeNull();
    expect(screen.getByTestId('error-dismiss')).toBeTruthy();
  });

  it('menampilkan tombol coba lagi untuk model yang tidak tersedia', async () => {
    await render(
      <TestProviders>
        <GatewayErrorSheet
          error={{ code: 'MODEL_UNAVAILABLE', message: 'Sedang tidak tersedia.', retryable: true }}
          onRetry={() => {}}
          onDismiss={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.getByTestId('error-retry')).toBeTruthy();
  });
});

describe('PlayerControls', () => {
  it('menandai kontrol aktif dan memanggil aksinya', async () => {
    const onPress = jest.fn();
    await render(
      <TestProviders>
        <PlayerControls
          items={[
            { id: 'auto', icon: 'pause', label: 'Auto aktif', active: true, onPress },
            { id: 'log', icon: 'book', label: 'Riwayat', onPress: () => {} },
          ]}
        />
      </TestProviders>,
    );

    const auto = screen.getByLabelText('Auto aktif');
    expect(auto.props.accessibilityState?.selected).toBe(true);

    await fireEvent.press(auto);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('RelationNotice', () => {
  it('menampilkan status dan alasan publik', async () => {
    await render(
      <TestProviders>
        <RelationNotice
          notice={{
            id: 'n1',
            kind: 'relationship',
            npcId: 'npc_elysia',
            status: 'waspada',
            reasonPublic: 'Elysia menilai perilakumu melewati batas profesional.',
          }}
          npcName="Elysia"
          onDismiss={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.getByText('Hubungan dengan Elysia: Waspada')).toBeTruthy();
    expect(
      screen.getByText('Elysia menilai perilakumu melewati batas profesional.'),
    ).toBeTruthy();
  });

  it('memanggil onDismiss saat ditutup', async () => {
    const onDismiss = jest.fn();
    await render(
      <TestProviders>
        <RelationNotice
          notice={{
            id: 'n2',
            kind: 'relationship',
            npcId: 'npc_elysia',
            status: 'normal',
            reasonPublic: 'Alasan.',
          }}
          npcName="Elysia"
          onDismiss={onDismiss}
        />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByLabelText('Tutup pemberitahuan'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
