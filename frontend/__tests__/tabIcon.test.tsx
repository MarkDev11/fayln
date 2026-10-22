import { render } from '@testing-library/react-native';
import React from 'react';

import { TabIcon } from '@/components/TabIcon';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Ikon navigasi bawah.
 *
 * Yang dijaga adalah dua hal yang membuat ikon ini bukan sekadar hiasan:
 * ketiganya benar-benar digambar sebagai SVG, dan keadaan AKTIF dibedakan oleh
 * BENTUK (pil di belakang ikon), bukan hanya oleh warna — pembeda warna saja
 * tidak terbaca oleh pemain dengan buta warna (NFR-01).
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('ikon tab', () => {
  it.each(['home', 'journey', 'settings'] as const)(
    'menggambar ikon %s sebagai SVG',
    async (nama) => {
      const view = await render(
        <TestProviders>
          <TabIcon name={nama} color="#7C3F2C" testID={`ikon-${nama}`} />
        </TestProviders>,
      );

      expect(view.getByTestId(`ikon-${nama}`)).toBeTruthy();

      /*
       * Bukti bahwa yang dirender adalah SVG, bukan kotak ber-border seperti
       * bentuk lama: elemen <Svg> hadir di dalam pembungkusnya.
       *
       * BUKTI MUTASI: kembalikan ikon ke `View` ber-border (tanpa <Svg>) → uji
       * ini memerah.
       */
      const pohon = JSON.stringify(view.toJSON());
      expect(pohon).toContain('Svg');
    },
  );

  it('membedakan tab aktif lewat BENTUK, bukan hanya warna', async () => {
    const aktif = await render(
      <TestProviders>
        <TabIcon name="home" color="#7C3F2C" focused testID="aktif" />
      </TestProviders>,
    );
    const pasif = await render(
      <TestProviders>
        <TabIcon name="home" color="#7C3F2C" testID="pasif" />
      </TestProviders>,
    );

    const latarAktif = JSON.stringify(aktif.toJSON());
    const latarPasif = JSON.stringify(pasif.toJSON());

    // Pil aktif berwarna (aksen + transparansi); pasif transparan.
    expect(latarAktif).toContain('#7C3F2C22');
    expect(latarPasif).toContain('transparent');

    /*
     * BUKTI MUTASI: hapus `backgroundColor: focused ? isianLembut : ...` →
     * kedua keadaan kembali hanya dibedakan warna ikon, dan uji ini memerah.
     */
  });
});
