import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import HomeScreen from '../app/(tabs)/index';

import { Chip } from '@/components/Chip';
import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { worldDiarsipkan } from '@/data/mock/fixtures';
import type { JourneySummary } from '@/domain/types';
import { en } from '@/i18n/en';
import { id } from '@/i18n/id';
import { TestProviders } from '@/testing/TestProviders';
import { darkColors, lightColors, radius, touchTarget } from '@/theme/tokens';

/**
 * Berkas ini menutup celah peninjauan mutu HOME-QA-01 yang belum tercakup
 * `home.test.tsx`:
 *
 * 1. Token `onMedia` dan `radius.tile`, serta bukti bahwa radius di luar Beranda
 *    tidak berubah (keputusan #5 dan #6).
 * 2. Paritas i18n: 12 kunci baru hadir di kedua kamus, 3 kunci pensiun hilang
 *    dari keduanya.
 * 3. Keadaan 0 perjalanan: tajuk bagian "Lanjutkan Bermain" pun tidak dirender.
 * 4. Target sentuh dan peran aksesibilitas pada chip genre.
 * 5. Label status dunia pada kartu lanjut tetap tampil meski filter genre
 *    mengeluarkan dunia itu dari hasil katalog (penjaga regresi — dulu
 *    `it.failing`, kini celahnya sudah ditutup).
 */

const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// Render layar utuh memuat katalog dan perjalanan sekaligus; beri jeda longgar.
jest.setTimeout(20_000);

const instant = () => new MockStoryGateway({ instant: true });

/** Perjalanan di dunia `retired`. Dunia ini bergenre `drama`, bukan `mystery`. */
const journeyInRetiredWorld: JourneySummary = {
  journeyId: 'j_arsip-001',
  worldId: worldDiarsipkan.worldId,
  worldTitle: worldDiarsipkan.title,
  coverAssetId: worldDiarsipkan.coverAssetId,
  worldVersion: worldDiarsipkan.worldVersion,
  personaName: 'Arfan',
  lastReadBeatId: 'b_001',
  lastReadSequence: 12,
  decisionCount: 3,
  hasUnreadBeats: false,
  updatedAt: '2026-09-29T08:00:00.000Z',
};

beforeEach(() => {
  mockRouterPush.mockClear();
});

describe('keputusan #5 dan #6 — token', () => {
  it('menetapkan onMedia #FFFFFF pada kedua tema', () => {
    expect(lightColors.onMedia).toBe('#FFFFFF');
    expect(darkColors.onMedia).toBe('#FFFFFF');
  });

  it('menetapkan radius.tile = 8 untuk permukaan Beranda', () => {
    expect(radius.tile).toBe(8);
  });

  it('tidak mengubah radius di luar Beranda', () => {
    // Penyelarasan radius se-aplikasi sengaja ditunda (docs/05 §8.13 D1).
    expect(radius.card).toBe(14);
    expect(radius.button).toBe(12);
    expect(radius.sheet).toBe(18);
    expect(radius.chip).toBe(999);
    expect(radius.input).toBe(12);
  });

  it('memakai target sentuh minimal 48', () => {
    expect(touchTarget).toBeGreaterThanOrEqual(48);
  });
});

describe('paritas i18n (NFR-12)', () => {
  const newKeys = [
    'home.sectionResume',
    'home.sectionUpdated',
    'home.sectionAll',
    'home.resultsTitle',
    'home.heroStart',
    'home.heroDotsLabel',
    'home.heroSwipeHint',
    'home.openWorldHint',
    'home.updatedAt',
    'home.sectionErrorTitle',
    'home.sectionErrorBody',
    'home.heroDotOpen',
  ] as const;

  const retiredKeys = ['home.filterOpen', 'home.filterTitle', 'home.filterActiveCount'] as const;

  it('memuat 12 kunci baru di kedua kamus', () => {
    expect(newKeys).toHaveLength(12);

    const idMap = id as Record<string, string | undefined>;
    const enMap = en as Record<string, string | undefined>;

    for (const key of newKeys) {
      expect(Object.keys(id)).toContain(key);
      expect(Object.keys(en)).toContain(key);
      expect(idMap[key]?.trim().length ?? 0).toBeGreaterThan(0);
      expect(enMap[key]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('menghapus 3 kunci pensiun dari kedua kamus', () => {
    for (const key of retiredKeys) {
      expect(Object.keys(id)).not.toContain(key);
      expect(Object.keys(en)).not.toContain(key);
    }
  });

  it('menyediakan padanan Inggris yang berbeda, bukan salinan Indonesia', () => {
    expect(en['home.sectionResume']).toBe('Continue Playing');
    expect(en['home.sectionUpdated']).toBe('Recently Updated');
    expect(en['home.sectionAll']).toBe('All Stories');
    expect(en['home.heroStart']).toBe('Start');
  });
});

describe('keadaan 0 perjalanan', () => {
  it('tidak merender tajuk bagian Lanjutkan Bermain pun', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');

    // Bukan empty state: bagian ini tidak ada sama sekali (SC-01.6).
    expect(view.queryByTestId('home-section-resume')).toBeNull();
    expect(view.queryByTestId('home-resume')).toBeNull();
    expect(view.queryByText('Lanjutkan Bermain')).toBeNull();
    // Penemuan tetap berjalan.
    expect(view.getByTestId('home-section-updated')).toBeTruthy();
    expect(view.getByTestId('home-section-all')).toBeTruthy();
  });
});

const CHIP_HIT_SLOP = { top: 8, bottom: 8, left: 0, right: 0 } as const;

/**
 * Menemukan simpul host pertama yang gayanya memenuhi `predicate`.
 *
 * Dilakukan dengan penelusuran karena `TestProviders` menambahkan pembungkus
 * (safe area, tema, bahasa), sehingga kedalaman pohon tidak boleh diasumsikan.
 */
function findNode(view: { toJSON: () => unknown }, predicate: (style: any) => boolean): any {
  const stack: any[] = [view.toJSON()];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') {
      continue;
    }
    const style = StyleSheet.flatten(node.props?.style);
    if (style && predicate(style)) {
      return node;
    }
    for (const child of node.children ?? []) {
      stack.push(child);
    }
  }
  return undefined;
}

describe('aksesibilitas chip genre', () => {
  it('memberi peran, label, dan keadaan terpilih pada chip di Beranda', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    const chip = await view.findByTestId('home-chip-mystery');

    expect(chip.props.accessibilityRole).toBe('button');
    expect(chip.props.accessibilityLabel).toBe('Misteri');
    expect(chip.props.accessibilityState).toEqual({ selected: false });
    // Perluasan area sentuh vertikal 8; horizontal 0 agar tidak tumpang tindih.
    expect(chip.props.hitSlop).toEqual(CHIP_HIT_SLOP);
  });

  it('memenuhi target sentuh 48 dan radius 8 pada varian Beranda', async () => {
    const view = await render(
      <TestProviders>
        <Chip label="Misteri" selected check tile hitSlop={CHIP_HIT_SLOP} testID="chip" />
      </TestProviders>,
    );

    const chipBody = findNode(view, (style) => style.minHeight === 32);
    const style = StyleSheet.flatten(chipBody.props.style);

    // Tinggi visual 32 + hitSlop 8 atas/bawah = 48 unit logis (docs/05 §8.3).
    expect(style.minHeight + CHIP_HIT_SLOP.top + CHIP_HIT_SLOP.bottom).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    // Permukaan Beranda memakai radius 8, dan TANPA garis tepi: keadaan
    // dibedakan oleh isian, bukan bingkai (beranda dibuat menyatu).
    expect(style.borderRadius).toBe(8);
    expect(style.borderWidth).toBeUndefined();
  });

  it('menambahkan ikon centang pada chip terpilih, bukan hanya warna', async () => {
    const selected = await render(
      <TestProviders>
        <Chip label="Misteri" selected check tile testID="chip-on" />
      </TestProviders>,
    );
    const unselected = await render(
      <TestProviders>
        <Chip label="Misteri" check tile testID="chip-off" />
      </TestProviders>,
    );

    // Isi chip: [ikona centang?, teks]. Ikon hanya ada saat `selected && check`.
    expect(findNode(selected, (style) => style.minHeight === 32)?.children).toHaveLength(2);
    expect(findNode(unselected, (style) => style.minHeight === 32)?.children).toHaveLength(1);
  });
});

describe('status dunia pada kartu lanjut', () => {
  it('menampilkan label status saat tidak ada filter', async () => {
    const gateway = instant();
    gateway.fetchJourneys = async () => [journeyInRetiredWorld];

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    const card = await view.findByTestId(`journey-resume-${journeyInRetiredWorld.journeyId}`);

    expect(within(card).queryByText('Diarsipkan')).toBeTruthy();
  });

  /**
   * Penjaga regresi untuk celah yang pernah dilaporkan implementasi.
   *
   * "Lanjutkan Bermain" sengaja kebal filter (keputusan #3 dan #4), dan label
   * status dunianya kini ikut kebal: peta status bersumber dari kueri katalog
   * TANPA saringan, bukan dari hasil yang sedang tampil. Sebelumnya label
   * "Diarsipkan" hilang begitu filter genre mengeluarkan dunia itu dari hasil —
   * padahal kartunya sendiri tetap tampil.
   *
   * Uji ini dulu `it.failing`; sekarang menjadi penjaga positif karena celahnya
   * sudah ditutup.
   */
  it('mempertahankan label status dunia saat filter genre aktif', async () => {
    const gateway = instant();
    gateway.fetchJourneys = async () => [journeyInRetiredWorld];

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');

    // Chip "Misteri": dunia `w_arsip-lama` bergenre `drama`, jadi keluar dari hasil.
    await fireEvent.press(view.getByTestId('home-chip-mystery'));
    await waitFor(() => expect(view.getByText('Hasil')).toBeTruthy());

    // Kartu lanjut tetap tampil (keputusan #3) … tetapi label statusnya ikut hilang.
    const card = view.getByTestId(`journey-resume-${journeyInRetiredWorld.journeyId}`);
    expect(within(card).queryByText('Diarsipkan')).toBeTruthy();
  });
});
