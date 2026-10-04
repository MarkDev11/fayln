import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from '../app/(tabs)/index';

import { StoryGatewayError } from '@/data/gateway';
import { MockStoryGateway } from '@/data/mock/MockStoryGateway';
import { worldBoskuMantan, worldRapatTengahMalam } from '@/data/mock/fixtures';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Beranda (SC-01).
 *
 * Fokus pengujian adalah keputusan yang dikunci, bukan detail visual:
 * - hero hanya dunia `published`,
 * - "Mulai" membuka halaman dunia, bukan membuat perjalanan,
 * - "Lanjutkan Bermain" tidak bergantung pada filter dan hilang saat 0 perjalanan,
 * - chip menyaring "Baru Diperbarui" dan "Semua Cerita" saja.
 */

const mockRouterPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// Render layar utuh memuat katalog dan perjalanan sekaligus; beri jeda longgar.
jest.setTimeout(20_000);

const instant = () => new MockStoryGateway({ instant: true });

async function startJourneyIn(
  gateway: MockStoryGateway,
  worldId: string,
  clientOperationId: string,
) {
  return gateway.createJourney({
    clientOperationId,
    worldId,
    persona: { name: 'Arfan', age: 24 },
    responseLocale: 'id-ID',
  });
}

/**
 * Perjalanan di dunia unggulan PERTAMA (`w_bosku-mantan`). Dunia ini tampil
 * sebagai hero, jadi perjalanannya TIDAK muncul di rail "Lanjutkan Bermain".
 */
async function startJourney(gateway: MockStoryGateway) {
  return startJourneyIn(gateway, worldBoskuMantan.worldId, 'op-home-1');
}

/**
 * Perjalanan di dunia NON-hero (`w_rapat-tengah-malam`). Hanya perjalanan
 * seperti inilah yang muncul di rail "Lanjutkan Bermain", karena dunia hero
 * disaring agar tidak muncul dua kali di satu layar.
 *
 * Dunia ini juga BUKAN unggulan pertama saat katalog disaring ke `mystery`
 * (yang menjadi hero adalah `w_lentera-terakhir`), sehingga rail tetap tampil
 * saat saringan aktif — sifat yang diuji oleh SC-01.3.
 */
async function startResumeJourney(gateway: MockStoryGateway) {
  return startJourneyIn(gateway, worldRapatTengahMalam.worldId, 'op-home-resume');
}

beforeEach(() => {
  mockRouterPush.mockClear();
});

describe('SC-01.2 — hero dunia unggulan', () => {
  it('hanya menampilkan dunia berstatus published', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('hero-w_bosku-mantan-media');

    // Dunia keempat berstatus `retired` dan tidak bisa dimulai, jadi bukan hero.
    expect(view.queryByTestId('hero-w_arsip-lama-media')).toBeNull();
    expect(view.getAllByLabelText(/Dunia \d dari 3/)).toHaveLength(3);
  });

  it('mengumumkan posisi lewat label kartu, bukan lewat titik', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    // Peran dan label ada di KARTU — satu target ketuk — bukan di area gambarnya.
    const hero = await view.findByTestId('hero-w_bosku-mantan');

    expect(hero.props.accessibilityRole).toBe('button');
    expect(hero.props.accessibilityLabel).toContain(worldBoskuMantan.title);
    expect(hero.props.accessibilityLabel).toContain('Romansa • Drama');
    expect(hero.props.accessibilityLabel).toContain('Dunia 1 dari 3');
    expect(hero.props.accessibilityHint).toBe('Membuka halaman dunia');
  });

  it('membuka halaman dunia tanpa membuat perjalanan', async () => {
    const gateway = instant();
    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    // Seluruh kartu adalah SATU target ketuk; pil "Mulai" hanya penanda visual
    // dan disembunyikan dari pembaca layar, supaya tujuan yang sama tidak
    // diumumkan dua kali (SC-01.8).
    const hero = await view.findByTestId('hero-w_bosku-mantan');
    expect(view.getByTestId('hero-w_bosku-mantan-start')).toBeTruthy();
    await fireEvent.press(hero);

    expect(mockRouterPush).toHaveBeenCalledWith('/world/w_bosku-mantan');
    // Gerbang persona dan kuota ada di halaman dunia, bukan di Beranda.
    expect(await gateway.fetchJourneys()).toEqual([]);
  });
});

describe('SC-01.4 — Lanjutkan Bermain', () => {
  it('tidak dirender sama sekali saat pemain punya 0 perjalanan', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');

    expect(view.queryByText('Lanjutkan Bermain')).toBeNull();
    // Bukan empty state: pesan "belum ada perjalanan" milik tab Perjalanan.
    expect(view.queryByText('Belum ada perjalanan')).toBeNull();
    // Penemuan tetap berjalan.
    expect(view.getByText('Baru Diperbarui')).toBeTruthy();
    expect(view.getByText('Semua Cerita')).toBeTruthy();
  });

  it('membuka pemutar saat kartu ditekan', async () => {
    const gateway = instant();
    // Dunia NON-hero: satu-satunya cara sebuah perjalanan muncul di rail ini.
    const created = await startResumeJourney(gateway);

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    expect(await view.findByText('Lanjutkan Bermain')).toBeTruthy();

    await fireEvent.press(view.getByTestId(`journey-resume-${created.journeyId}`));

    //Beranda = melanjutkan; berbeda dari tab Perjalanan yang membuka detail.
    expect(mockRouterPush).toHaveBeenCalledWith(`/player/${created.journeyId}`);
  });

  it('menampilkan lencana belum dibaca di dalam label kartu, bukan hanya warna', async () => {
    const gateway = instant();
    const created = await startResumeJourney(gateway);

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    const card = await view.findByTestId(`journey-resume-${created.journeyId}`);

    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toContain('Belum selesai dibaca');
    expect(card.props.accessibilityHint).toBe(
      `Lanjutkan perjalanan ${worldRapatTengahMalam.title}`,
    );
    expect(view.getByText('Belum selesai dibaca')).toBeTruthy();
  });
});

describe('SC-01.3/SC-01.1 — chip genre', () => {
  it('menyaring Baru Diperbarui dan Semua Cerita, tetapi bukan Lanjutkan Bermain', async () => {
    const gateway = instant();
    await startResumeJourney(gateway);

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');
    await fireEvent.press(view.getByTestId('home-chip-mystery'));

    await waitFor(() => expect(view.getByText('Hasil')).toBeTruthy());

    // Hero TETAP tampil: ia etalase unggulan yang tidak bergantung pada saringan,
    // dan menghilangkannya membuat bagian atas layar lenyap hanya karena satu ketukan.
    expect(view.getByTestId('home-hero')).toBeTruthy();
    // Rail editorial tetap disembunyikan: ia daftar penemuan, bukan etalase.
    expect(view.queryByText('Baru Diperbarui')).toBeNull();
    // Nilai tertinggi: tidak bergantung pada filter.
    expect(view.getByText('Lanjutkan Bermain')).toBeTruthy();

    // Grid benar-benar tersaring.
    await waitFor(() => expect(view.queryByTestId('story-card-w_bosku-mantan')).toBeNull());
    expect(view.getByTestId('story-card-w_rapat-tengah-malam')).toBeTruthy();
  });

  it('menandai keadaan terpilih untuk pembaca layar', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-chip-mystery');

    expect(view.getByTestId('home-chip-any').props.accessibilityState).toEqual({ selected: true });

    await fireEvent.press(view.getByTestId('home-chip-mystery'));

    await waitFor(() =>
      expect(view.getByTestId('home-chip-mystery').props.accessibilityState).toEqual({
        selected: true,
      }),
    );
    expect(view.getByTestId('home-chip-any').props.accessibilityState).toEqual({ selected: false });
  });

  it('mengosongkan pilihan lewat chip Semua genre', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');
    await fireEvent.press(view.getByTestId('home-chip-mystery'));
    await waitFor(() => expect(view.getByText('Hasil')).toBeTruthy());

    await fireEvent.press(view.getByTestId('home-chip-any'));

    await waitFor(() => expect(view.getByText('Semua Cerita')).toBeTruthy());
    expect(view.getByTestId('story-card-w_bosku-mantan')).toBeTruthy();
  });
});

describe('SC-01.6 — keadaan', () => {
  it('menampilkan keadaan tanpa koneksi berbeda dari galat generik', async () => {
    // `timeout` pada mock gateway berarti kode NETWORK.
    const view = await render(
      <TestProviders gateway={new MockStoryGateway({ instant: true, faultMode: 'timeout' })}>
        <HomeScreen />
      </TestProviders>,
    );

    expect(await view.findByTestId('home-error')).toBeTruthy();
    expect(view.getByText('Kamu sedang offline')).toBeTruthy();
    expect(view.getByText('Coba lagi')).toBeTruthy();
  });

  it('menjaga Beranda tetap berfungsi saat journeys gagal', async () => {
    const gateway = instant();
    gateway.fetchJourneys = async () => {
      throw new StoryGatewayError({ code: 'INTERNAL', message: 'gagal', retryable: true });
    };

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    expect(await view.findByTestId('home-journey-error')).toBeTruthy();
    expect(view.getByText('Gagal memuat bagian ini')).toBeTruthy();
    expect(view.getByText('Bagian lain di halaman ini tetap bisa dipakai.')).toBeTruthy();
    // Galat journeys tidak mengambil alih seluruh halaman.
    expect(view.getByTestId('home-grid')).toBeTruthy();
  });

  it('menyembunyikan Lanjutkan Bermain tanpa baris galat saat tamu/UNAUTHORIZED', async () => {
    const gateway = instant();
    gateway.fetchJourneys = async () => {
      throw new StoryGatewayError({ code: 'UNAUTHORIZED', message: 'tam', retryable: false });
    };

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');

    expect(view.queryByText('Lanjutkan Bermain')).toBeNull();
    expect(view.queryByTestId('home-journey-error')).toBeNull();
  });

  it('menawarkan atur ulang pada hasil kosong', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');
    // Kolom pencarian tersembunyi sampai ikonnya ditekan, supaya tajuk tetap bersih.
    await fireEvent.press(view.getByTestId('home-search-toggle'));
    await fireEvent.changeText(view.getByTestId('home-search'), 'zzzzzz');

    await waitFor(() => expect(view.getByTestId('home-empty')).toBeTruthy(), { timeout: 3000 });
    expect(view.getByText('Tidak ada cerita yang cocok')).toBeTruthy();

    await fireEvent.press(view.getByText('Atur ulang'));

    await waitFor(() => expect(view.getByText('Semua Cerita')).toBeTruthy(), { timeout: 3000 });
  });

  it('menutup pencarian lewat tombol silang dan mengosongkan kata kunci', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');
    await fireEvent.press(view.getByTestId('home-search-toggle'));
    await fireEvent.changeText(view.getByTestId('home-search'), 'zzzzzz');

    await waitFor(() => expect(view.getByTestId('home-empty')).toBeTruthy(), { timeout: 3000 });

    await fireEvent.press(view.getByTestId('home-search-close'));

    // Menutup pencarian ikut mengosongkan kata kunci, sehingga katalog pulih.
    await waitFor(() => expect(view.getByText('Semua Cerita')).toBeTruthy(), { timeout: 3000 });
  });
});

describe('SC-01.5 — Baru Diperbarui dan status dunia', () => {
  it('menampilkan status dunia sebagai teks pada dunia yang tidak terbit', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');

    // Dunia `retired` tampil di rail dan grid dengan label teks, bukan warna saja.
    expect(view.getAllByText('Diarsipkan').length).toBeGreaterThan(0);
    // Tidak ada enum mentah yang bocor ke pemain.
    expect(view.queryByText('retired')).toBeNull();
  });
});

describe('SC-01.10 — paritas bahasa', () => {
  it('memakai tajuk bagian Bahasa Inggris saat locale Inggris', async () => {
    const view = await render(
      <TestProviders locale="en-US" gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    expect(await view.findByText('Recently Updated')).toBeTruthy();
    expect(view.getByText('All Stories')).toBeTruthy();
    // Satu penanda "Mulai" per dunia unggulan (3 dunia terbit).
    expect(view.getAllByText('Start')).toHaveLength(3);
  });
});

describe('SC-01.2 — geser otomatis hero', () => {
  /**
   * Diuji dengan pewaktu palsu, bukan lewat tangkapan layar.
   *
   * Animasi gulir di peramban tanpa kepala tidak selesai di bawah waktu virtual,
   * sehingga tangkapan layar hanya membekukan satu fase dan tidak dapat
   * membuktikan geseran yang berulang.
   */
  it('memajukan halaman tiap jeda, lalu berputar kembali ke halaman pertama', async () => {
    // Pewaktu palsu HARUS aktif sebelum komponen dipasang. Kalau dipasang
    // sesudahnya, `setInterval` sudah terdaftar pada pewaktu asli dan
    // `advanceTimersByTime` tidak akan menyentuhnya sama sekali.
    jest.useFakeTimers();

    try {
      const view = await render(
        <TestProviders gateway={instant()}>
          <HomeScreen />
        </TestProviders>,
      );

      // Menuntaskan pemuatan data tanpa `findBy*`: kueri yang menunggu akan
      // menggantung karena pewaktu yang ditunggunya palsu. Nilai jauh di bawah
      // jeda geser (5000 ms) supaya geseran belum ikut terpicu di sini.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });

      const isActive = (index: number): boolean =>
        view.getByTestId(`home-hero-dot-${String(index)}`).props.accessibilityState?.selected ===
        true;

      expect(isActive(0)).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(isActive(1)).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(isActive(2)).toBe(true);

      // Setelah halaman terakhir, geseran berputar kembali ke awal.
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(isActive(0)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('SC-01.1 — bilah pencarian beranimasi', () => {
  /**
   * Membuktikan bilah benar-benar BERGESER, bukan muncul seketika.
   *
   * Keluhan pengguna adalah bilah "tiba-tiba muncul". Uji ini memeriksa posisi
   * bilah di TENGAH animasi: kalau animasinya berjalan, posisinya harus sudah
   * berubah dari titik awal tetapi belum mencapai titik akhir.
   */
  it('berada di antara posisi awal dan akhir saat animasi berjalan', async () => {
    jest.useFakeTimers();

    try {
      const view = await render(
        <TestProviders gateway={instant()}>
          <HomeScreen />
        </TestProviders>,
      );

      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });

      /*
       * `includeHiddenElements` diperlukan karena bilah sengaja disembunyikan
       * dari pohon aksesibilitas selama tertutup (ia menunggu di luar layar).
       * Tanpa opsi ini, pustaka uji menolak menemukannya sama sekali.
       */
      const transformOf = (): string =>
        JSON.stringify(
          view.getByTestId('home-search-bar', { includeHiddenElements: true }).props.style ?? '',
        );

      const atStart = transformOf();

      await act(async () => {
        fireEvent.press(view.getByTestId('home-search-toggle'));
      });

      // Di tengah durasi buka (700 ms), posisinya harus sudah berbeda dari awal.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(350);
      });
      const midway = transformOf();

      expect(midway).not.toBe(atStart);

      // Setelah animasi selesai, posisinya harus menetap di titik akhir.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(600);
      });
      const atEnd = transformOf();

      expect(atEnd).not.toBe(midway);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('SC-01.11 — rail "Top 10 Minggu Ini"', () => {
  it('menampilkan peringkat berurutan beserta jumlah perjalanan minggu ini', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    /*
     * Kueri rail peringkat SENGAJA tidak memakai `placeholderData`, jadi rail
     * baru muncul setelah server menjawab. Karena itu kita menunggu railnya,
     * bukan grid katalog — grid bisa selesai lebih dulu dan pada saat itu
     * `topWorlds.data` masih kosong.
     */
    await view.findByTestId('home-top', {}, { timeout: 5000 });

    /*
     * Seed contoh: w_bosku-mantan 4, w_lentera-terakhir 2, w_rapat-tengah-malam 1.
     * Peringkat dihitung atas SELURUH katalog, lalu dunia yang sudah tampil di
     * hero dibuang dari tampilan — jadi rail mulai dari #2, bukan dinomori ulang
     * menjadi #1. Mengurutkan ulang nomornya akan membuat angkanya berbeda dari
     * yang tertulis di server dan membuat dua pemain melihat peringkat berbeda
     * hanya karena hero mereka berbeda.
     */
    expect(view.getByText('Top 10 Minggu Ini')).toBeTruthy();
    /*
     * `#` dan angkanya adalah dua simpul teks terpisah, jadi anak elemennya
     * berupa larik. Digabung dulu supaya perbandingannya tidak bergantung pada
     * bagaimana React memecah interpolasi.
     */
    const rankText = (worldId: string): string =>
      view.getByTestId(`top-rank-${worldId}`).props.children.flat().join('');

    expect(rankText('w_lentera-terakhir')).toBe('#2');
    expect(rankText('w_rapat-tengah-malam')).toBe('#3');
    expect(view.getByText('2 perjalanan minggu ini')).toBeTruthy();
    expect(view.getByText('1 perjalanan minggu ini')).toBeTruthy();
  });

  it('tidak menarik peringkat ke dalam rail saat saringan aktif', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');
    await fireEvent.press(view.getByTestId('home-chip-mystery'));
    await waitFor(() => expect(view.getByText('Hasil')).toBeTruthy());

    /*
     * "Top 10 Minggu Ini" adalah fakta tentang seluruh katalog. Menyaringnya
     * akan mengubah artinya menjadi "Top 10 di antara yang Anda saring" — dan
     * judulnya tidak mengatakan itu.
     */
    expect(view.queryByText('Top 10 Minggu Ini')).toBeNull();
    expect(view.queryByTestId('home-top')).toBeNull();
  });

  it('memakai judul Bahasa Inggris saat locale Inggris', async () => {
    const view = await render(
      <TestProviders locale="en-US" gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    expect(await view.findByText('Top 10 This Week')).toBeTruthy();
    expect(view.getByText('2 starts this week')).toBeTruthy();
  });
});

describe('SC-01.12 — rail "Terbaru Dirilis"', () => {
  it('mengurutkan menurut tanggal terbit menurun dan membuka halaman dunia', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');
    await view.findByTestId('home-new');

    expect(view.getByText('Terbaru Dirilis')).toBeTruthy();

    /*
     * Fixture contoh: w_lentera-terakhir (18 Sep) lebih baru daripada
     * w_rapat-tengah-malam (10 Sep). Dunia pertama (20 Sep) tampil di hero,
     * jadi ia tidak muncul dua kali di sini.
     */
    expect(view.queryByTestId('new-card-w_bosku-mantan')).toBeNull();
    expect(view.getByTestId('new-card-w_lentera-terakhir')).toBeTruthy();
    expect(view.getByTestId('new-card-w_rapat-tengah-malam')).toBeTruthy();

    await fireEvent.press(view.getByTestId('new-card-w_lentera-terakhir'));

    expect(mockRouterPush).toHaveBeenCalledWith('/world/w_lentera-terakhir');
  });

  it('tidak menyertakan dunia yang sudah diarsipkan', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-new');

    /*
     * `w_arsip-lama` berstatus `retired`. Menawarkannya di rail yang memanggil
     * pemain untuk MULAI berarti mengantar mereka ke jalan buntu. Ia tetap
     * terlihat di "Semua Cerita" beserta label statusnya.
     */
    expect(view.queryByTestId('new-card-w_arsip-lama')).toBeNull();
  });

  it('menyembunyikan rail saat hanya tersisa satu kandidat', async () => {
    const gateway = instant();
    // Hanya satu dunia terbit selain dunia hero: satu kartu di dalam rail
    // terbaca seperti baris yang rusak, bukan seperti pilihan.
    gateway.fetchNewWorlds = async () => [worldBoskuMantan];

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');

    expect(view.queryByText('Terbaru Dirilis')).toBeNull();
    expect(view.queryByTestId('home-new')).toBeNull();
    // Penemuan tetap berjalan lewat rail lain.
    expect(view.getByText('Baru Diperbarui')).toBeTruthy();
  });

  it('memakai judul Bahasa Inggris saat locale Inggris', async () => {
    const view = await render(
      <TestProviders locale="en-US" gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    expect(await view.findByText('Newly Released')).toBeTruthy();
  });
});

describe('SC-01.14 — "Baru Diperbarui" berbeda dari "Terbaru Dirilis"', () => {
  /** Urutan dunia di dalam sebuah rail, dibaca dari testID kartunya. */
  const orderOf = (view: { getAllByTestId: (id: RegExp) => { props: { testID?: string } }[] }, prefix: string): string[] =>
    view
      .getAllByTestId(new RegExp(`^${prefix}-`))
      .map((node) => String(node.props.testID).replace(`${prefix}-`, ''));

  it('mengurutkan menurut waktu revisi, bukan tanggal terbit', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-updated');

    /*
     * Mode contoh: `w_rapat-tengah-malam` TERBIT paling lama (10 Sep) tetapi
     * direvisi paling akhir (2 Okt). Urutan terbitnya paling belakang, urutan
     * revisinya paling depan — jadi rail ini membuktikan ia memakai `updatedAt`.
     */
    expect(orderOf(view, 'updated-card')).toEqual([
      'w_rapat-tengah-malam',
      'w_lentera-terakhir',
    ]);
  });

  /*
   * Penjaga regresi untuk cacat yang sebenarnya. Rail ini pernah diturunkan dari
   * katalog dengan `publishedAt`, sehingga isinya kembar dengan "Terbaru
   * Dirilis" — nama berbeda, isi sama, dan tidak ada uji yang menangkapnya.
   * Perbandingan dilakukan SETELAH dunia hero dibuang dari kedua rail, karena
   * itulah yang benar-benar tampil ke pemain.
   */
  it('menampilkan urutan yang berbeda dari Terbaru Dirilis', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-new');
    await view.findByTestId('home-updated');

    const terbaru = orderOf(view, 'new-card');
    const diperbarui = orderOf(view, 'updated-card');

    expect(terbaru.length).toBeGreaterThan(0);
    expect(diperbarui).not.toEqual(terbaru);
  });

  it('menyembunyikan rail saat hanya tersisa satu kandidat', async () => {
    const gateway = instant();
    gateway.fetchUpdatedWorlds = async () => [
      { ...worldBoskuMantan, updatedAt: worldBoskuMantan.publishedAt },
    ];

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');

    // Satu kartu sendirian terbaca seperti baris rusak, bukan pilihan.
    expect(view.queryByTestId('home-updated')).toBeNull();
    expect(view.queryByText('Baru Diperbarui')).toBeNull();
  });

  it('tidak menyertakan dunia yang sudah diarsipkan', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-updated');

    expect(view.queryByTestId('updated-card-w_arsip-lama')).toBeNull();
  });

  /*
   * Kata di kartu harus cocok dengan railnya. "Terbaru Dirilis" pernah memakai
   * kunci `home.updatedAt` yang berbunyi "Diperbarui", sehingga rail soal tanggal
   * TERBIT dilabeli "diperbarui" — salah, dan tidak ada uji yang menangkapnya.
   *
   * Yang diperiksa katanya, bukan tanggalnya: `formatRelativeDay` dipanggil tanpa
   * `now` di layar, jadi hasilnya bergantung pada jam berjalan dan uji akan rapuh
   * bila mengunci tanggal.
   */
  it('memberi label "Dirilis" pada rail Terbaru Dirilis, bukan "Diperbarui"', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-new');
    const rail = within(view.getByTestId('home-new'));

    expect(rail.getAllByText(/^Dirilis /).length).toBeGreaterThan(0);
    expect(rail.queryByText(/^Diperbarui /)).toBeNull();
  });

  it('memberi label "Diperbarui" pada rail Baru Diperbarui', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-updated');
    const rail = within(view.getByTestId('home-updated'));

    expect(rail.getAllByText(/^Diperbarui /).length).toBeGreaterThan(0);
    expect(rail.queryByText(/^Dirilis /)).toBeNull();
  });
});

describe('SC-01.13 — animasi masuk saat saringan berubah', () => {
  /**
   * Membuktikan daftar benar-benar BERGESER-NAIK, bukan berganti seketika.
   *
   * Keluhan yang mendasari: mengganti genre membuat konten berkedip — hilang
   * lalu muncul tanpa jeda baca. Uji ini memeriksa posisi di TENGAH animasi:
   * bila animasinya berjalan, posisinya harus sudah berubah dari titik awal
   * tetapi belum mencapai titik akhir.
   */
  it('memudarkan dan menggeser daftar saat chip genre ditekan', async () => {
    jest.useFakeTimers();

    try {
      const view = await render(
        <TestProviders gateway={instant()}>
          <HomeScreen />
        </TestProviders>,
      );

      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });

      const listStyle = (): string =>
        JSON.stringify(view.getByTestId('home-reveal').props.style ?? '');

      await act(async () => {
        fireEvent.press(view.getByTestId('home-chip-mystery'));
      });

      // Nilai animasi berangkat dari 0: opacity 0, translateY +12.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      const atStart = listStyle();

      // Di tengah durasi (260 ms), gayanya harus sudah berbeda dari titik awal.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(130);
      });
      const midway = listStyle();

      expect(midway).not.toBe(atStart);
      expect(atStart).toContain('translateY');

      // Setelah animasi selesai, ia harus menetap di titik akhir (translateY 0).
      await act(async () => {
        await jest.advanceTimersByTimeAsync(400);
      });
      const atEnd = listStyle();

      expect(atEnd).not.toBe(midway);
      expect(atEnd).toContain('"translateY":0');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('A2 — CTA "Lanjutkan" untuk dunia yang sudah dimainkan', () => {
  it('memakai label "Lanjutkan" pada hero dunia yang punya perjalanan, dan "Mulai" untuk yang belum', async () => {
    const gateway = instant();
    await startJourney(gateway);

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    // Dunia yang punya perjalanan: pil berbunyi "Lanjutkan".
    const playedPill = await view.findByTestId('hero-w_bosku-mantan-start');
    expect(within(playedPill).getByText('Lanjutkan')).toBeTruthy();
    // Dunia tanpa perjalanan tetap "Mulai" — penanda tidak boleh bocor.
    const freshPill = view.getByTestId('hero-w_lentera-terakhir-start');
    expect(within(freshPill).getByText('Mulai')).toBeTruthy();
  });

  it('membuka pemutar saat hero dunia yang sudah dimainkan ditekan', async () => {
    const gateway = instant();
    const created = await startJourney(gateway);

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    // Ketukan langsung ke pemutar (keputusan produk), bukan lewat StoryDetail.
    await fireEvent.press(await view.findByTestId('hero-w_bosku-mantan'));

    expect(mockRouterPush).toHaveBeenCalledWith(`/player/${created.journeyId}`);
  });

  it('menandai kartu katalog dunia yang sedang dimainkan, dan tidak menandai yang lain', async () => {
    const gateway = instant();
    await startJourney(gateway);

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-grid');

    expect(view.getByTestId('story-card-w_bosku-mantan-playing')).toBeTruthy();
    expect(view.getByText('Sedang dimainkan')).toBeTruthy();
    // Dunia tanpa perjalanan tidak diberi penanda ini.
    expect(view.queryByTestId('story-card-w_rapat-tengah-malam-playing')).toBeNull();
  });
});

describe('A1 — "Lanjutkan Bermain" naik saat ada adegan belum dibaca', () => {
  /**
   * Mengumpulkan testID sesuai urutan render (pra-order). Dipakai membandingkan
   * POSISI dua blok, bukan sekadar keberadaannya.
   */
  function testIdOrder(view: { toJSON: () => unknown }): string[] {
    const order: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const child of node) {
          walk(child);
        }
        return;
      }
      if (!node || typeof node !== 'object') {
        return;
      }
      const element = node as { props?: { testID?: unknown }; children?: unknown };
      if (typeof element.props?.testID === 'string') {
        order.push(element.props.testID);
      }
      if (Array.isArray(element.children)) {
        for (const child of element.children) {
          walk(child);
        }
      }
    };
    walk(view.toJSON());
    return order;
  }

  it('merender "Lanjutkan Bermain" SEBELUM hero saat ada adegan belum dibaca', async () => {
    const gateway = instant();
    // Perjalanan NON-hero yang baru dibuat selalu `hasUnreadBeats: true`.
    await startResumeJourney(gateway);

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-section-resume');
    const order = testIdOrder(view);

    expect(order.indexOf('home-section-resume')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('home-section-resume')).toBeLessThan(order.indexOf('home-hero'));
  });

  it('tetap menaruhnya SESUDAH hero saat tidak ada adegan belum dibaca', async () => {
    const gateway = instant();
    const created = await startResumeJourney(gateway);
    // Semua adegan sudah dibaca: tidak ada alasan mendahulukan blok ini.
    await gateway.syncReadProgress({
      journeyId: created.journeyId,
      lastReadSequence: 3,
      lastReadBeatId: 't001-b003',
      decisionCount: 0,
      hasUnreadBeats: false,
    });

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    await view.findByTestId('home-section-resume');
    const order = testIdOrder(view);

    expect(order.indexOf('home-hero')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('home-section-resume')).toBeGreaterThan(order.indexOf('home-hero'));
  });
});

describe('C1 — lencana token dapat diketuk', () => {
  it('membuka lembar pemakaian ringkas berisi judul dan sisa token', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    const badge = await view.findByTestId('home-token-balance');
    // Lencana kini KONTROL, bukan pajangan.
    expect(badge.props.accessibilityRole).toBe('button');

    // Lembar belum terbuka.
    expect(view.queryByText('Pemakaian hari ini')).toBeNull();

    await fireEvent.press(badge);

    expect(view.getByText('Pemakaian hari ini')).toBeTruthy();
    // Sisa awal: 100.000 dari 100.000, lewat formatCount (titik ribuan).
    expect(view.getByText('Sisa 100.000 dari 100.000 token')).toBeTruthy();
  });

  it('mengumumkan nama tindakan DAN saldo terformat pada label aksesibilitas', async () => {
    const view = await render(
      <TestProviders gateway={instant()}>
        <HomeScreen />
      </TestProviders>,
    );

    const badge = await view.findByTestId('home-token-balance');
    const label = String(badge.props.accessibilityLabel);

    /*
     * Sebuah kontrol harus mengumumkan nama dan nilainya. Menyebut tindakan
     * saja membuat pembaca layar kehilangan saldo yang dulu terbaca — regresi
     * yang uji ini jaga.
     */
    expect(label).toContain('Lihat pemakaian token');
    expect(label).toContain('100.000');
  });
});

describe('A2 — dunia hero tidak muncul dua kali di rail Lanjutkan Bermain', () => {
  it('menyembunyikan kartu lanjut dunia hero, tetapi hero-nya tetap ada', async () => {
    const gateway = instant();
    // Dunia unggulan #1 (`w_bosku-mantan`) — juga tampil sebagai hero.
    const created = await startJourney(gateway);

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    // Pil "Lanjutkan" di hero menandakan katalog DAN perjalanan sudah termuat,
    // sekaligus membuktikan aksinya tetap terjangkau lewat hero.
    expect(await view.findByText('Lanjutkan')).toBeTruthy();

    // Tidak ada kartu lanjut untuk dunia hero — itu duplikat yang dilarang.
    expect(view.queryByTestId(`journey-resume-${created.journeyId}`)).toBeNull();
    expect(view.getByTestId('hero-w_bosku-mantan')).toBeTruthy();
    expect(view.getByTestId('hero-w_bosku-mantan-start')).toBeTruthy();
  });

  it('tidak merender blok Lanjutkan bila satu-satunya perjalanan ada di dunia hero', async () => {
    const gateway = instant();
    await startJourney(gateway);

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    expect(await view.findByText('Lanjutkan')).toBeTruthy();

    // Blok hilang seluruhnya — dan itu benar: hero sudah menawarkan "Lanjutkan".
    expect(view.queryByTestId('home-section-resume')).toBeNull();
    expect(view.queryByText('Lanjutkan Bermain')).toBeNull();
    // Beranda tetap utuh, tidak crash.
    expect(view.getByTestId('home-grid')).toBeTruthy();
    expect(view.getByText('Semua Cerita')).toBeTruthy();
  });

  it('menampilkan hanya perjalanan non-hero saat ada dua perjalanan', async () => {
    const gateway = instant();
    const heroJourney = await startJourney(gateway); // dunia hero
    const otherJourney = await startResumeJourney(gateway); // dunia lain

    const view = await render(
      <TestProviders gateway={gateway}>
        <HomeScreen />
      </TestProviders>,
    );

    // Katalog harus termuat agar penyaringan dunia hero berlaku, baru rail dicek.
    await view.findByTestId('home-grid');
    await view.findByTestId('home-section-resume');

    // Rail tetap tampil dan hanya memuat perjalanan non-hero.
    expect(view.getByTestId(`journey-resume-${otherJourney.journeyId}`)).toBeTruthy();
    expect(view.queryByTestId(`journey-resume-${heroJourney.journeyId}`)).toBeNull();
  });
});

