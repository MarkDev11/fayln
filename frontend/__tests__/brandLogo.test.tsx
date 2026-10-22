import { render } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from '../app/(tabs)/index';

import { BrandLogo } from '@/components/BrandLogo';
import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Logo merek (docs/05).
 *
 * Yang dijaga bukan "ada elemen", melainkan bahwa logo itu BERISI MEREK:
 * wordmark terbagi "fay" + "LN". Logo yang kehilangan wordmark-nya masih
 * terlihat seperti gambar, tetapi berhenti menjadi logo — dan tidak ada galat
 * yang menunjuk ke sana.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.setTimeout(20_000);

describe('logo fayLN', () => {
  it('menampilkan wordmark terbagi dua warna', async () => {
    const view = await render(
      <TestProviders>
        <BrandLogo size={30} testID="logo-uji" />
      </TestProviders>,
    );

    expect(view.getByTestId('logo-uji')).toBeTruthy();
    expect(view.getByText('fay')).toBeTruthy();
    expect(view.getByText('LN')).toBeTruthy();

    /*
     * BUKTI MUTASI: hapus `showWordmark` dari render (atau setel `false`
     * sebagai bawaan) → kedua pemeriksaan teks di atas memerah, sedangkan
     * pemeriksaan testID tetap hijau. Itu membuktikan uji ini menjaga MEREK,
     * bukan sekadar keberadaan kotak.
     */
  });

  it('dipakai di kepala Beranda, menggantikan judul teks', async () => {
    const view = await render(
      <TestProviders gateway={new MockStoryGateway({ instant: true })}>
        <HomeScreen />
      </TestProviders>,
    );

    expect(await view.findByTestId('home-logo')).toBeTruthy();

    /*
     * BUKTI MUTASI: kembalikan `<Text variant="screen">{t('home.title')}</Text>`
     * di kepala Beranda → testID `home-logo` hilang dan uji ini memerah.
     */
  });
});
