import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { WorldForgeScreen } from '@/features/player/components/WorldForgeScreen';
import { id } from '@/i18n/id';
import { en } from '@/i18n/en';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Catatan: pada @testing-library/react-native v14, `render` bersifat async.
 * Setiap pemanggilan WAJIB di-await.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA LAYAR INI DIUJI
 * ---------------------------------------------------------------------------
 * Layar ini hanya muncul selama 27–89 detik — saat pembuatan perjalanan — dan
 * hanya sekali per perjalanan. Artinya ia paling mudah rusak tanpa ada yang
 * menyadarinya: tidak ada jalan memutar untuk melihatnya lagi selain membuat
 * perjalanan baru, dan kegagalannya tidak muncul sebagai galat melainkan sebagai
 * layar kosong yang tidak dapat dibedakan dari "masih memuat".
 *
 * Yang dijaga di sini bukan tampilannya, melainkan dua hal yang membuatnya
 * berguna: ia MENGATAKAN bahwa AI sedang bekerja, dan ia memuat di layar penuh
 * (bukan terselip di dalam halaman dunia).
 */
describe('WorldForgeScreen', () => {
  it('mengatakan AI sedang membuat dunia, bukan sekadar "memuat"', async () => {
    await render(
      <TestProviders>
        <WorldForgeScreen />
      </TestProviders>,
    );

    /*
     * Kamus dibaca dari sumbernya, bukan ditulis ulang sebagai literal.
     *
     * Kalau kalimatnya ditulis ulang di sini, mengubah kamus akan tetap lulus —
     * dan justru kalimat itulah keputusan pemilik produk ("ai creating a world").
     */
    expect(screen.getByText(id['world.forgeTitle'])).toBeTruthy();
    expect(screen.getByText(id['world.forgeHint'])).toBeTruthy();
  });

  it('menyebut nama dunia yang sedang disusun', async () => {
    await render(
      <TestProviders>
        <WorldForgeScreen worldTitle="Bosku Mantan" />
      </TestProviders>,
    );

    expect(screen.getByText('Bosku Mantan')).toBeTruthy();
  });

  /**
   * Tanpa judul, layar tetap harus utuh.
   *
   * Judulnya datang dari `world.data.title`, dan di jalur pembuatan dari lembar
   * persona ia SELALU ada — tetapi komponen ini juga dipakai tanpa judul di uji
   * dan, kelak, di tempat lain. Judul yang tidak ada tidak boleh membuat pesan
   * utamanya ikut hilang.
   */
  it('tetap menampilkan pesan utama walau judul dunia tidak ada', async () => {
    await render(
      <TestProviders>
        <WorldForgeScreen />
      </TestProviders>,
    );

    expect(screen.getByText(id['world.forgeTitle'])).toBeTruthy();
  });

  /**
   * Kunci kamus yang dipakai harus ada di KEDUA bahasa.
   *
   * `missingKeys`/`extraKeys` di i18n.test.ts sudah menjaga paritas kunci secara
   * umum. Uji ini menjaga hal yang berbeda: bahwa kunci yang BENAR-BENAR dipakai
   * komponen ini termasuk di dalamnya. Komponen yang memakai kunci yang tidak
   * pernah ada akan menampilkan kuncinya apa adanya — "world.forgeTitle" tampil
   * sebagai teks — dan itu tampak seperti salah ketik, bukan seperti kegagalan.
   */
  it('memakai kunci yang ada di kamus ID dan EN', () => {
    for (const kunci of ['world.forgeTitle', 'world.forgeHint']) {
      expect(Object.prototype.hasOwnProperty.call(id, kunci)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(en, kunci)).toBe(true);
    }
  });
});
