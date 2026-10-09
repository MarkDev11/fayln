import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

// `app/` berada DI LUAR `src/`, jadi alias `@/` tidak menjangkaunya — impor ini
// harus relatif. Itu bukan kekurangan uji ini, melainkan bentuk proyeknya.
import WorldDetailScreen from '../app/world/[worldId]';
import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { id } from '@/i18n/id';
import { ProfileProvider } from '@/features/profile/ProfileProvider';
import { InMemoryProfileStore } from '@/storage/profileStore';
import { TestProviders } from '@/testing/TestProviders';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ worldId: 'w_bosku-mantan' }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

/**
 * ---------------------------------------------------------------------------
 * MENGAPA UJI INI MEMASANG LAYAR SUNGGUHAN
 * ---------------------------------------------------------------------------
 * Komponen `WorldForgeScreen` sudah diuji sendiri, tetapi itu tidak membuktikan
 * bahwa ia PERNAH ditampilkan. Menambahkannya di komponen lain, lupa
 * memasukkannya ke pohon, atau menaruhnya di cabang yang tidak pernah dicapai —
 * ketiganya lulus uji komponen dan gagal di produksi.
 *
 * Uji ini merender layar dunia yang sesungguhnya, memulai perjalanan, dan
 * memeriksa bahwa yang tampil berikutnya adalah layar pembuatan dunia. Yang
 * diuji adalah SAMBUNGANNYA, bukan tampilannya.
 *
 * ---------------------------------------------------------------------------
 * KENAPA LEMBAR PERSONA DIISI, BUKAN DILEWATI
 * ---------------------------------------------------------------------------
 * Layar dunia punya dua jalur mulai. Profil kosong berarti lembar persona dibuka
 * lebih dahulu — dan itu jalur yang paling mudah diuji karena tidak bergantung
 * pada isi penyimpanan profil. Mengisi lembar personanya juga menutup jalur yang
 * sebenarnya: `onConfirmPersona` menyimpan profil LALU memanggil pembuatan
 * perjalanan, jadi uji ini sekaligus membuktikan bahwa penyimpanan profil tidak
 * menelan jalur pembuatannya.
 */
describe('layar pembuatan dunia tersambung ke layar dunia', () => {
  it('menggantikan halaman dunia selama perjalanan dibuat', async () => {
    // `instant: false` mempertahankan penundaan tiruan, sehingga jendela
    // "sedang dibuat" benar-benar terbuka dan dapat diperiksa.
    const gateway = new MockStoryGateway({ instant: false });

    /*
     * Jendela pembuatannya DILEBARKAN, bukan dibiarkan 80 ms.
     *
     * Di produksi jendela ini 27–89 detik, jadi menunggunya lama bukan perilaku
     * yang perlu ditiru uji. Yang perlu dibuktikan adalah bahwa SELAMA jendela
     * itu terbuka, layar pembuatan dunia yang tampil — dan itu hanya dapat
     * diperiksa kalau jendelanya cukup lebar untuk diamati.
     *
     * 80 ms terlalu sempit: `waitFor` mengayun setiap ~50 ms, sehingga ia dapat
     * melewatkan jendelanya sepenuhnya dan memerah walaupun sambungannya benar.
     * 400 ms membuat pemeriksaannya dapat diandalkan tanpa membuat uji ini
     * terasa lambat.
     */
    const asli = gateway.createJourney.bind(gateway);
    jest.spyOn(gateway, 'createJourney').mockImplementation(async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return asli(input);
    });

    await render(
      <TestProviders gateway={gateway}>
        {/*
          * Layar dunia membaca profil lewat `useProfile`, jadi providernya harus
          * ada. `InMemoryProfileStore` dipakai supaya penyimpanannya kosong dan
          * tidak bergantung pada perangkat.
          */}
        <ProfileProvider store={new InMemoryProfileStore()}>
          <WorldDetailScreen />
        </ProfileProvider>
      </TestProviders>,
    );

    // Halaman dunia sudah termuat; aksi mulainya tersedia.
    const mulai = await screen.findByText(id['detail.startJourney']);
    expect(mulai).toBeTruthy();

    await fireEvent.press(mulai);

    /*
     * Profil uji kosong, jadi lembar persona terbuka. Isi dan konfirmasi.
     *
     * Nama dan usia dimasukkan lewat kolom yang sama dengan yang dipakai pemain,
     * supaya validasinya ikut berjalan.
     */
    const nama = await screen.findByPlaceholderText(id['persona.namePlaceholder']);
    await fireEvent.changeText(nama, 'Arfan');

    const usia = await screen.findByPlaceholderText(id['persona.agePlaceholder']);
    await fireEvent.changeText(usia, '24');

    await fireEvent.press(screen.getByText(id['persona.confirm']));

    /*
     * Layar pembuatan dunia harus muncul. `waitFor` menunggu, jadi uji ini tidak
     * bergantung pada berapa lama penundaan gateway-nya.
     */
    await waitFor(
      () => {
        expect(screen.getByText(id['world.forgeTitle'])).toBeTruthy();
      },
      { timeout: 8000 },
    );

    // Dan halaman dunia yang lama sudah tidak ada lagi di pohon.
    expect(screen.queryByText(id['detail.synopsisTitle'])).toBeNull();
  });
});
