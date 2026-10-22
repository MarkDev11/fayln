import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from '../app/(tabs)/index';

import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Popup klaim harian + badge poin (docs/17).
 *
 * Fokusnya keputusan yang dikunci, bukan detail visual:
 * - popup MUNCUL saat hari belum diklaim, dan HILANG saat sudah diklaim
 *   (pasangan yang diminta aturan proyek: "kosong → elemen tidak ada" DAN
 *   "ada isi → isi nyata"),
 * - menekan klaim benar-benar memanggil gateway dan menampilkan hadiah,
 * - badge Beranda menampilkan SISA POIN, bukan token.
 *
 * Mock gateway membawa perilaku klaim yang meniru backend (satu klaim per hari,
 * bonus pada hari ke-7), jadi uji ini menguji alur nyata — bukan tiruan kosong.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.setTimeout(20_000);

/** Hari ini BELUM diklaim: saldo 0, popup harus muncul. */
function belumKlaim() {
  return new MockStoryGateway({ instant: true, unclaimedToday: true });
}

/** Hari ini SUDAH diklaim (bawaan mock): popup tidak boleh muncul. */
function sudahKlaim() {
  return new MockStoryGateway({ instant: true });
}

describe('popup klaim harian', () => {
  it('muncul saat hari ini belum diklaim', async () => {
    const view = await render(
      <TestProviders gateway={belumKlaim()}>
        <HomeScreen />
      </TestProviders>,
    );

    // Isi nyata, bukan sekadar "elemen ada": judul dan tombolnya terbaca.
    expect(await view.findByText('Poin harianmu siap')).toBeTruthy();
    expect(view.getByText('Klaim 100 Poin')).toBeTruthy();
    // Visual streak: hari pertama menyala, dan hari ke-7 menyebut bonusnya.
    expect(view.getByText('Streak 1 hari')).toBeTruthy();
    expect(view.getByText('+300')).toBeTruthy();

    /*
     * BUKTI MUTASI: hapus syarat `usage.data.claimableToday` pada prop
     * `visible` di Beranda → popup muncul walau sudah diklaim, dan pasangan
     * uji berikutnya (yang mengharapkan TIDAK muncul) memerah.
     */
  });

  it('TIDAK muncul saat hari ini sudah diklaim', async () => {
    const view = await render(
      <TestProviders gateway={sudahKlaim()}>
        <HomeScreen />
      </TestProviders>,
    );

    // Tunggu Beranda selesai memuat supaya "tidak ada" bukan berarti "belum dimuat".
    await view.findByText('Top 10 Minggu Ini', {}, { timeout: 15_000 }).catch(async () => {
      await view.findByText('Terbaru Dirilis', {}, { timeout: 15_000 });
    });

    expect(view.queryByText('Poin harianmu siap')).toBeNull();

    /*
     * BUKTI MUTASI: balik syaratnya menjadi `!usage.data.claimableToday` →
     * popup justru muncul di sini dan uji ini memerah.
     */
  });

  it('menekan klaim memanggil gateway, menampilkan hadiah, lalu menutup diri', async () => {
    const gateway = belumKlaim();
    const klaim = jest.spyOn(gateway, 'claim');

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    fireEvent.press(await view.findByText('Klaim 100 Poin'));

    // Gateway benar-benar dipanggil — bukan sekadar popup yang menutup.
    await waitFor(() => expect(klaim).toHaveBeenCalledTimes(1));

    // Hadiah terbaca: "+100 poin" muncul sebelum popup menutup.
    expect(await view.findByText('+100 poin')).toBeTruthy();

    // Setelah jeda baca hadiah, popup menutup sendiri.
    await waitFor(
      () => expect(view.queryByText('Poin harianmu siap')).toBeNull(),
      { timeout: 5_000 },
    );

    /*
     * BUKTI MUTASI: hapus `claim.mutate(...)` di `handleClaim` → gateway tidak
     * pernah dipanggil dan uji memerah pada `toHaveBeenCalledTimes(1)`.
     */
  });

  it('badge Beranda menampilkan SISA POIN setelah klaim', async () => {
    const view = await render(
      <TestProviders gateway={belumKlaim()}>
        <HomeScreen />
      </TestProviders>,
    );

    fireEvent.press(await view.findByText('Klaim 100 Poin'));
    await waitFor(() => expect(view.queryByText('+100 poin')).toBeTruthy());

    /*
     * Tunggu popup benar-benar MENUTUP. Jangan memakai hilangnya teks
     * "Poin harianmu siap": teks itu hilang lebih awal karena diganti tampilan
     * hadiah, sementara Modal-nya masih terbuka — dan selama Modal terbuka,
     * pohon di luarnya tidak terjangkau kueri uji.
     */
    await waitFor(
      () => expect(view.queryByText('+100 poin')).toBeNull(),
      { timeout: 5_000 },
    );

    /*
     * Badge menampilkan SALDO, jadi yang diperiksa angkanya — bukan keberadaan
     * elemennya. Sebelum klaim angkanya 0; sesudah klaim harus 100, yang
     * membuktikan invalidasi kueri `usage` benar-benar terjadi dan bukan hanya
     * state lokal popup yang berubah.
     *
     * BUKTI MUTASI: hapus `invalidateQueries({ queryKey: queryKeys.usage() })`
     * di `useClaimDailyPoints` → badge tetap 0 dan uji ini memerah.
     */
    const badge = await view.findByTestId('home-token-balance');
    await waitFor(() => expect(within(badge).getByText('100')).toBeTruthy());
  });
});
