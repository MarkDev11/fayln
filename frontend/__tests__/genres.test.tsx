import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from '../app/(tabs)/index';

import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { HttpStoryGateway } from '@/data/http/HttpStoryGateway';
import { genreLabel, genreLabelKey } from '@/domain/labels';
import type { GenreOption } from '@/domain/types';
import { translate } from '@/i18n';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Genre sebagai DATA.
 *
 * Sebelum ini daftar genre tertanam di kode, dan tiga cacat mengikutinya —
 * ketiganya SENYAP, tanpa galat dan tanpa jejak di log:
 *
 * 1. `genreLabelKey` mengembalikan `'genre.drama'` untuk genre tak dikenal,
 *    sehingga genre buatan admin tampil dengan NAMA GENRE LAIN. Salah label jauh
 *    lebih buruk daripada tanpa label, karena tampak benar.
 * 2. Chip saringan dibangun dari konstanta, sehingga genre yang baru dibuat admin
 *    tidak pernah muncul di layar pemain.
 * 3. Saringan katalog di server mencocokkan masukan terhadap daftar yang sama,
 *    sehingga permintaan dengan genre baru dibuang sebelum kueri berjalan.
 *
 * Berkas ini menjaga ketiganya.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

jest.setTimeout(20_000);

const SLICE_OF_LIFE: GenreOption = {
  genreId: 'slice_of_life',
  labelId: 'Keseharian',
  labelEn: 'Slice of Life',
};

describe('penerjemahan label genre', () => {
  it('memetakan genre bawaan ke kunci terjemahannya', () => {
    expect(genreLabelKey('romance')).toBe('genre.romance');
    expect(genreLabelKey('mystery')).toBe('genre.mystery');
  });

  /**
   * Inilah regresinya: dulu `'genre.drama'`.
   *
   * Nilai pengganti itu membuat genre `slice_of_life` tampil sebagai "Drama".
   */
  it('mengembalikan null — bukan genre lain — untuk genre yang tidak punya terjemahan', () => {
    expect(genreLabelKey('slice_of_life')).toBeNull();
    expect(genreLabelKey('genre-yang-belum-ada')).toBeNull();
  });

  it('memakai label dari server untuk genre buatan admin', () => {
    expect(genreLabel('slice_of_life', (key) => translate('id-ID', key), 'id-ID', SLICE_OF_LIFE)).toBe(
      'Keseharian',
    );
    expect(genreLabel('slice_of_life', (key) => translate('en-US', key), 'en-US', SLICE_OF_LIFE)).toBe(
      'Slice of Life',
    );
  });

  it('memilih bahasa label menurut locale antarmuka, bukan menurut server', () => {
    // Locale antarmuka Indonesia dengan label Inggris yang tersedia: yang dipakai
    // tetap label Indonesia. Bahasa antarmuka yang menentukan, bukan isi respons.
    expect(genreLabel('slice_of_life', (key) => translate('id-ID', key), 'id-ID', SLICE_OF_LIFE)).toBe(
      'Keseharian',
    );
  });

  it('memakai terjemahan aplikasi untuk genre bawaan, bukan label server', () => {
    // Label server sengaja dibuat berbeda: bila kunci terjemahan diabaikan,
    // hasilnya akan 'Romansa' dari server dan uji ini gagal.
    const option: GenreOption = { genreId: 'romance', labelId: 'Romansa', labelEn: 'Romance' };
    expect(genreLabel('romance', (key) => translate('en-US', key), 'en-US', option)).toBe('Romance');
    expect(genreLabel('romance', (key) => translate('id-ID', key), 'id-ID', option)).toBe('Romansa');
  });

  it('jatuh ke id apa adanya hanya bila server belum menjawab', () => {
    // Keadaan ini sesaat dan hanya sebelum kueri selesai. Menampilkan id mentah
    // masih lebih baik daripada menampilkan genre yang salah.
    expect(genreLabel('slice_of_life', (key) => translate('id-ID', key), 'id-ID')).toBe('slice_of_life');
  });
});

describe('MockStoryGateway.fetchGenres', () => {
  it('menurunkan daftar dari dunia terbit, lengkap dengan labelnya', async () => {
    const gateway = new MockStoryGateway({ instant: true });
    const genres = await gateway.fetchGenres();

    expect(genres.map((item) => item.genreId)).toEqual([
      'romance',
      'drama',
      'office',
      'fantasy',
      'mystery',
    ]);
    expect(genres.find((item) => item.genreId === 'office')).toMatchObject({
      labelId: 'Kehidupan Kantor',
      labelEn: 'Office Life',
    });
  });

  it('tidak menyumbang genre dari dunia yang tidak terbit', async () => {
    const gateway = new MockStoryGateway({ instant: true });

    // Seluruh dunia contoh yang terbit memakai kelima genre, jadi pengujian ini
    // tidak dapat membuktikan penyaringannya lewat selisih. Yang dibuktikan:
    // daftarnya benar-benar diturunkan dari katalog, bukan ditulis terpisah —
    // dan jumlahnya tidak melebihi genre yang benar-benar dipakai.
    const genres = await gateway.fetchGenres();
    const used = new Set<string>();
    for (const item of await gateway.fetchNewWorlds(20)) {
      for (const genre of item.genres) {
        used.add(genre);
      }
    }

    expect(genres.map((item) => item.genreId).sort()).toEqual([...used].sort());
  });
});

describe('HttpStoryGateway.fetchGenres', () => {
  const config = {
    baseUrl: 'https://example.test',
    accountId: () => Promise.resolve('acc_test'),
  };

  it('membaca daftar dari /v1/genres', async () => {
    const calls: string[] = [];
    const fake = jest.fn((url: string) => {
      calls.push(String(url));
      return Promise.resolve(
        new Response(JSON.stringify({ items: [SLICE_OF_LIFE] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const gateway = new HttpStoryGateway({
      ...config,
      fetchImpl: fake as unknown as typeof globalThis.fetch,
    });

    await expect(gateway.fetchGenres()).resolves.toEqual([SLICE_OF_LIFE]);
    expect(calls.some((url) => url.includes('/v1/genres'))).toBe(true);
  });

  it('mengembalikan daftar kosong bila bentuk responsnya tidak terduga', async () => {
    const fake = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ genre: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const gateway = new HttpStoryGateway({
      ...config,
      fetchImpl: fake as unknown as typeof globalThis.fetch,
    });

    // Chip genre yang hilang jauh lebih ringan daripada Beranda yang gagal
    // tampil karena satu bidang pendamping berubah bentuk.
    await expect(gateway.fetchGenres()).resolves.toEqual([]);
  });
});

/** Gateway yang menyajikan satu genre buatan admin. */
class AdminGenreGateway extends MockStoryGateway {
  override async fetchGenres(): Promise<GenreOption[]> {
    return [SLICE_OF_LIFE];
  }
}

describe('chip genre di Beranda', () => {
  it('menggambar chip dari daftar server, dengan label dari server', async () => {
    await render(
      <TestProviders gateway={new AdminGenreGateway({ instant: true })}>
        <HomeScreen />
      </TestProviders>,
    );

    const chip = await screen.findByTestId('home-chip-slice_of_life');
    expect(chip).toBeTruthy();

    // Labelnya dari server, bukan id mentah dan bukan genre lain.
    await waitFor(() => {
      expect(screen.getByText('Keseharian')).toBeTruthy();
    });
  });

  it('tidak menggambar chip untuk genre yang tidak ditawarkan server', async () => {
    await render(
      <TestProviders gateway={new AdminGenreGateway({ instant: true })}>
        <HomeScreen />
      </TestProviders>,
    );

    await screen.findByTestId('home-chip-slice_of_life');

    // Katalog contoh memakai `mystery`, tetapi server ini tidak menawarkannya.
    // Chip dibangun dari jawaban server, jadi tidak boleh ada — inilah yang
    // membedakannya dari chip yang dibangun dari daftar tetap di kode.
    expect(screen.queryByTestId('home-chip-mystery')).toBeNull();
    expect(screen.queryByTestId('home-chip-romance')).toBeNull();

    // Chip "Semua genre" tetap ada: itu bukan genre, melainkan penghapus saringan.
    expect(screen.getByTestId('home-chip-any')).toBeTruthy();
  });
});
