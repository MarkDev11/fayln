import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text as RNText } from 'react-native';

import { AssetImage } from '@/components/AssetImage';
import { Stage, STAGE_SCRIM } from '@/features/player/components/Stage';
import type { PresentedScene } from '@/features/player/types';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Catatan: pada @testing-library/react-native v14, `render` bersifat async.
 * Setiap pemanggilan WAJIB di-await.
 */

/** Adegan tanpa karakter: hanya latar. */
const TANPA_KARAKTER: PresentedScene = {
  backgroundAssetId: 'bg_kantor',
  focusNpcId: null,
  focusExpression: null,
  focusPortraitAssetId: null,
  visibleNpcIds: [],
};

/** Adegan dengan karakter fokus. */
const DENGAN_KARAKTER: PresentedScene = {
  backgroundAssetId: 'bg_kantor',
  focusNpcId: 'npc_elysia',
  focusExpression: 'senyum',
  focusPortraitAssetId: 'p_elysia_0_senyum',
  visibleNpcIds: ['npc_elysia'],
};

const LATAR = 'https://contoh.test/bg-kantor.png';
const POTRET = 'https://contoh.test/elysia.png';

/**
 * Mengambil simpul gambar LATAR dari pohon yang sudah dirender.
 *
 * Latar dan potret sama-sama `AssetImage`, dan keduanya memakai `expo-image`.
 * Yang membedakan hanya label aksesibilitasnya, jadi itulah yang dipakai untuk
 * memilih — bukan urutan, yang mudah berubah saat tata letaknya disunting.
 */
function cariGambar(label: string) {
  const simpul = screen.getAllByLabelText(label)[0];
  if (!simpul) {
    throw new Error(`Simpul bergambar berlabel "${label}" tidak ditemukan.`);
  }
  return simpul;
}

/** Menggabungkan gaya berbentuk array bersarang menjadi satu objek datar. */
function ratakan(gaya: unknown): Record<string, number | string | undefined> {
  const keluar: Record<string, number | string | undefined> = {};
  const telusuri = (nilai: unknown) => {
    if (!nilai) {
      return;
    }
    if (Array.isArray(nilai)) {
      nilai.forEach(telusuri);
      return;
    }
    if (typeof nilai === 'object') {
      Object.assign(keluar, nilai as Record<string, number | string | undefined>);
    }
  };
  telusuri(gaya);
  return keluar;
}

/** Membaca prop numerik dari simpul render, dan menolak bila bentuknya salah. */
function angkaProp(simpul: { props: Record<string, unknown> }, nama: string): number {
  const nilai = simpul.props[nama];
  if (typeof nilai !== 'number') {
    throw new Error(`Prop "${nama}" bukan angka: ${JSON.stringify(nilai)}`);
  }
  return nilai;
}

/**
 * Mengambil PEMBUNGKUS potret — `View` milik `AssetImage`, bukan `expo-image`
 * di dalamnya.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA TIDAK MEMAKAI LABEL AKSESIBILITAS
 * ---------------------------------------------------------------------------
 * Versi pertama uji ini mencari simpul berlabel "Elysia" dan memeriksa gayanya.
 * Uji itu HIJAU walaupun lengkungannya dipasang kembali — dan itu ditemukan
 * hanya karena penjaganya diuji dengan mutasi, bukan karena dibaca.
 *
 * Sebabnya: label itu ada di simpal `expo-image`, sedangkan gaya bingkai
 * (`borderTopLeftRadius`, `borderWidth`) ada di `View` PEMBUNGKUSNYA, satu
 * tingkat di luar, yang tidak membawa label apa pun. Yang diperiksa uji lama
 * adalah `StyleSheet.absoluteFill` milik gambarnya sendiri — selalu kosong,
 * selalu hijau, tidak pernah membuktikan apa pun.
 *
 * Sekarang simpulnya dicari lewat BENTUK, bukan lewat nama: `View` yang gaya
 * gabungannya punya `aspectRatio` 2/3 sekaligus `width` penuh. Itu tepat satu
 * simpul, dan justru simpul yang menggambar potret.
 */
function cariPembungkusPotret() {
  const ketemu = cariPembungkusPotretAtauNull();
  if (!ketemu) {
    throw new Error('Pembungkus potret tidak ditemukan di pohon render.');
  }
  return ketemu;
}

/**
 * Sama seperti `cariPembungkusPotret`, tetapi MENGEMBALIKAN `null` alih-alih
 * melempar. Dipakai uji "karakter keluar": di sana ketiadaan simpul itulah yang
 * sedang dibuktikan, jadi melempar akan menyamarkan hasilnya sebagai galat.
 */
function cariPembungkusPotretAtauNull(): { props: { style?: unknown } } | null {
  let ketemu: { props: { style?: unknown } } | null = null;

  const telusuri = (simpul: unknown) => {
    if (!simpul || typeof simpul !== 'object') {
      return;
    }
    const n = simpul as { type?: unknown; props?: { style?: unknown }; children?: unknown[] };
    if (n.type === 'View' && n.props) {
      const gaya = ratakan(n.props.style);
      if (gaya.aspectRatio === 2 / 3 && gaya.height === '100%') {
        ketemu = n as { props: { style?: unknown } };
        return;
      }
    }
    for (const anak of n.children ?? []) {
      telusuri(anak);
    }
  };

  telusuri(screen.root);
  return ketemu;
}

describe('Stage — blur latar', () => {
  it('memblur latar saat ada karakter di panggung', async () => {
    /*
     * Keluhan pemilik produk: latar yang tajam dan ramai (papan tulis, jendela,
     * meja berderet) bersaing dengan karakter di depannya. Latar yang diblur
     * tetap memberi tahu DI MANA adegan berlangsung tanpa merebut perhatian.
     */
    await render(
      <TestProviders>
        <Stage
          scene={DENGAN_KARAKTER}
          focusName="Elysia"
          locationLabel="Kantor"
          backgroundUri={LATAR}
          portraitUri={POTRET}
        />
      </TestProviders>,
    );

    expect(angkaProp(cariGambar('Kantor'), 'blurRadius')).toBeGreaterThan(0);
  });

  it('TIDAK memblur latar saat tidak ada karakter', async () => {
    /*
     * Pada adegan pembuka, ruangan kosong itulah yang justru ingin dilihat
     * pemain. Memblur latar tanpa karakter akan menyembunyikan tempat yang baru
     * saja ia masuki.
     */
    await render(
      <TestProviders>
        <Stage
          scene={TANPA_KARAKTER}
          focusName={null}
          locationLabel="Kantor"
          backgroundUri={LATAR}
        />
      </TestProviders>,
    );

    expect(angkaProp(cariGambar('Kantor'), 'blurRadius')).toBe(0);
  });

  it('memakai kekuatan blur yang sama setiap kali karakter tampil', async () => {
    // Nilai ini diputuskan pemilik produk; angka yang berubah diam-diam berarti
    // tampilannya berubah tanpa ada yang memutuskan.
    await render(
      <TestProviders>
        <Stage
          scene={DENGAN_KARAKTER}
          focusName="Elysia"
          locationLabel="Kantor"
          backgroundUri={LATAR}
          portraitUri={POTRET}
        />
      </TestProviders>,
    );

    expect(angkaProp(cariGambar('Kantor'), 'blurRadius')).toBe(4);
  });
});

describe('Stage — potret tanpa bingkai', () => {
  it('tidak menggambar lengkungan di sekeliling potret', async () => {
    /*
     * Bentuk lama memberi `borderTopLeftRadius`/`borderTopRightRadius` 120 plus
     * `borderWidth`, sehingga tergambar LENGKUNGAN seperti pintu di sekitar
     * karakter. Pemilik produk menyebutnya "frame di pinggir karakter".
     *
     * Yang diperiksa adalah gaya pada simpul potret, bukan ada-tidaknya kata
     * "border" di berkas: potret yang benar-benar tampil punya siluet sendiri,
     * jadi gaya bingkai apa pun di sini adalah garis asing.
     *
     * BUKTI MUTASI — jangan hapus catatan ini. Uji ini pernah HIJAU padahal
     * lengkungannya dipasang kembali, karena ia memeriksa simpul `expo-image`
     * alih-alih `View` pembungkusnya. Setelah diperbaiki, memasang kembali
     * `borderTopLeftRadius`/`borderTopRightRadius`/`borderWidth` membuat uji ini
     * MERAH — itulah yang membuatnya layak dipercaya.
     */
    await render(
      <TestProviders>
        <Stage
          scene={DENGAN_KARAKTER}
          focusName="Elysia"
          locationLabel="Kantor"
          backgroundUri={LATAR}
          portraitUri={POTRET}
        />
      </TestProviders>,
    );

    const gaya = ratakan(cariPembungkusPotret().props.style);

    expect(Number(gaya.borderTopLeftRadius ?? 0)).toBe(0);
    expect(Number(gaya.borderTopRightRadius ?? 0)).toBe(0);
    expect(Number(gaya.borderWidth ?? 0)).toBe(0);
    /*
     * `borderRadius` ikut diperiksa — dan ini BUKAN kelebihan pemeriksaan.
     *
     * `AssetImage` membawa `borderRadius` bawaan untuk sampul katalog. Sebelum
     * `Stage` menimpanya, potret mewarisi sudut membulat itu; pada potret selebar
     * layar, sudut itu memotong bahu tokoh. BUKTI MUTASI: hapus `borderRadius: 0`
     * dari `styles.portrait`, lalu uji ini memerah dengan 14, bukan 0.
     */
    expect(Number(gaya.borderRadius ?? 0)).toBe(0);
  });
});

describe('Stage — karakter masuk dan keluar', () => {
  /*
   * Permintaan pemilik produk: "karakter bisa in dan out". Adegan tanpa tokoh
   * memang ada — pada contohnya, latar ruangan tampil SENDIRI tanpa satu pun
   * potret di atasnya.
   *
   * Yang dijaga di sini adalah pasangan "ada → tampil" dan "tidak ada → HILANG".
   * Memeriksa hanya salah satunya akan hijau juga pada komponen yang selalu
   * menggambar tokohnya.
   *
   * BUKTI MUTASI — jangan hapus catatan ini. Versi pertama uji "keluar" hanya
   * memeriksa `queryByLabelText('Elysia')` sambil mengirim `focusName={null}`
   * juga; label itu memang TIDAK PERNAH muncul, jadi uji tersebut HIJAU walaupun
   * `Stage` menggambar potretnya terus-menerus. Sekarang yang diperiksa adalah
   * BENTUK pembungkus potretnya (`height:'100%'` + `aspectRatio 2/3`), dan
   * hitungan simpul gambarnya. Ganti `{scene.focusPortraitAssetId ? … : null}`
   * menjadi `{true ? … : null}`, lalu uji "keluar" memerah.
   */
  it('menggambar potret saat karakter masuk', async () => {
    await render(
      <TestProviders>
        <Stage
          scene={DENGAN_KARAKTER}
          focusName="Elysia"
          locationLabel="Kantor"
          backgroundUri={LATAR}
          portraitUri={POTRET}
        />
      </TestProviders>,
    );

    expect(cariPembungkusPotret()).toBeTruthy();
    expect(screen.getByLabelText('Elysia')).toBeTruthy();
  });

  it('TIDAK menggambar potret saat karakter keluar', async () => {
    await render(
      <TestProviders>
        <Stage
          scene={TANPA_KARAKTER}
          focusName={null}
          locationLabel="Kantor"
          backgroundUri={LATAR}
        />
      </TestProviders>,
    );

    // Tidak ada pembungkus potret sama sekali — bukan sekadar "labelnya beda".
    expect(cariPembungkusPotretAtauNull()).toBeNull();
    expect(screen.queryByLabelText('Elysia')).toBeNull();

    // Latarnya tetap ada: yang keluar tokohnya, bukan tempatnya.
    expect(cariGambar('Kantor')).toBeTruthy();
  });

  it('melepas potret saat tokoh keluar di tengah adegan', async () => {
    /*
     * "In dan out" bukan hanya dua adegan terpisah — tokoh juga bisa MASUK lalu
     * KELUAR di tengah satu adegan (beat `hideCharacter`). Uji ini merender
     * ulang komponen dengan adegan yang berbeda, lalu memastikan potretnya
     * benar-benar dilepas.
     *
     * BUKTI MUTASI: hapus percabangan `scene.focusPortraitAssetId ?` di
     * `Stage.tsx`, lalu uji ini memerah pada `expect(…).toBeNull()`.
     */
    const { rerender } = await render(
      <TestProviders>
        <Stage
          scene={DENGAN_KARAKTER}
          focusName="Elysia"
          locationLabel="Kantor"
          backgroundUri={LATAR}
          portraitUri={POTRET}
        />
      </TestProviders>,
    );

    expect(cariPembungkusPotretAtauNull()).not.toBeNull();

    await rerender(
      <TestProviders>
        <Stage
          scene={TANPA_KARAKTER}
          focusName={null}
          locationLabel="Kantor"
          backgroundUri={LATAR}
        />
      </TestProviders>,
    );

    expect(cariPembungkusPotretAtauNull()).toBeNull();
  });
});

describe('Stage — penuh layar', () => {
  /*
   * Komposisi yang diminta pemilik produk: gambar mengisi SELURUH layar, dan
   * teks cerita menumpang di atasnya. Bentuk lama menaruh kotak dialog hitam
   * sebagai SAUDARA panggung, sehingga gambar hanya mengisi sisa layar.
   *
   * BUKTI MUTASI: hapus `{children}` dari `Stage.tsx`, lalu uji "menampilkan
   * lapisan yang ditumpangkan" memerah. Ganti gradasinya dengan `View` berlatar
   * pekat, lalu uji gradasi memerah.
   */
  it('menampilkan lapisan yang ditumpangkan di atas gambar', async () => {
    await render(
      <TestProviders>
        <Stage
          scene={DENGAN_KARAKTER}
          focusName="Elysia"
          locationLabel="Kantor"
          backgroundUri={LATAR}
          portraitUri={POTRET}
        >
          <RNText testID="lapisan">teks cerita</RNText>
        </Stage>
      </TestProviders>,
    );

    expect(screen.getByTestId('lapisan')).toBeTruthy();
  });

  it('meneruskan ketukan area kosong ke `onTap`', async () => {
    /*
     * FR-16: "ketuk untuk melanjutkan" berlaku untuk SELURUH panggung, bukan
     * hanya strip teksnya. Sebelumnya hanya `StageText` yang dapat menerima
     * ketukan, dan area latar/potret mati.
     *
     * BUKTI MUTASI: hapus blok `{onTap ? <Pressable …/> : null}` dari
     * `Stage.tsx`, lalu uji ini memerah.
     */
    const onTap = jest.fn();
    await render(
      <TestProviders>
        <Stage
          scene={TANPA_KARAKTER}
          focusName={null}
          locationLabel="Kantor"
          backgroundUri={LATAR}
          onTap={onTap}
        />
      </TestProviders>,
    );

    await fireEvent.press(screen.getByTestId('player-stage-tap'));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('TIDAK memasang penangkap ketukan saat `onTap` tidak diberikan', async () => {
    // Layar lain (mis. mode bersih) memakai Stage tanpa aksi maju. Menempelkan
    // penangkap ketukan di sana akan menelan ketukan yang memulihkan UI.
    await render(
      <TestProviders>
        <Stage
          scene={TANPA_KARAKTER}
          focusName={null}
          locationLabel="Kantor"
          backgroundUri={LATAR}
        />
      </TestProviders>,
    );

    expect(screen.queryByTestId('player-stage-tap')).toBeNull();
  });

  it('menjaga kontras teks dengan gradasi, bukan dengan kotak', async () => {
    await render(
      <TestProviders>
        <Stage
          scene={DENGAN_KARAKTER}
          focusName="Elysia"
          locationLabel="Kantor"
          backgroundUri={LATAR}
          portraitUri={POTRET}
        />
      </TestProviders>,
    );

    const bawah = screen.getByTestId('stage-scrim-bottom');
    const atas = screen.getByTestId('stage-scrim-top');

    /*
     * Gradasi bawah menutupi KAKI panggung, dan di situlah kalimat cerita
     * dibaca.
     */
    expect(ratakan(bawah.props.style).height).toBe('58%');
    expect(ratakan(atas.props.style).height).toBe('22%');

    /*
     * KEPEKATANNYA diperiksa lewat `STAGE_SCRIM`, bukan lewat prop `colors` di
     * pohon render: `expo-linear-gradient` sudah menormalkannya menjadi bilangan
     * bulat, sehingga uji yang membaca prop itu hanya akan membandingkan angka
     * yang tidak berarti.
     *
     * Gradasi kakinya punya EMPAT perhentian, bukan dua. Bentuk dua-perhentian
     * menaikkan kepekatan secara linier, sehingga di posisi kalimat cerita
     * (≈77% tinggi layar) kepekatannya baru ≈0,58 — dan teks putihnya terbaca
     * samar di atas lantai yang terang. BUKTI MUTASI: kembalikan gradasi ke dua
     * perhentian (`[0, 0.97]` dengan `locations=[0,1]`), lalu uji ini memerah.
     */
    expect(STAGE_SCRIM.bottom.locations).toEqual([0, 0.3, 0.6, 1]);
    expect(STAGE_SCRIM.bottom.colors[0]).toBe('rgba(0, 0, 0, 0)');
    expect(STAGE_SCRIM.bottom.colors[1]).toBe('rgba(0, 0, 0, 0.4)');
    expect(STAGE_SCRIM.bottom.colors[2]).toBe('rgba(0, 0, 0, 0.85)');
    expect(STAGE_SCRIM.bottom.colors[3]).toBe('rgba(0, 0, 0, 0.97)');
    expect(STAGE_SCRIM.top.colors[0]).toBe('rgba(0, 0, 0, 0.6)');
    expect(STAGE_SCRIM.top.colors[1]).toBe('rgba(0, 0, 0, 0)');
  });

  it('tidak menyisakan lapisan pekat di dalam panggung', async () => {
    /*
     * Yang dijaga: panggung sendiri TIDAK boleh punya lapisan gelap setinggi
     * separuh layar. Bentuk lamanya memasang scrim 55% di dalam panggung; sejak
     * kotak dialog pindah ke atas gambar, lapisan itu hanya membuat separuh
     * bawah latar tampak hitam — dan pemilik produk membacanya sebagai latar
     * yang rusak.
     *
     * BUKTI MUTASI — versi pertama uji ini hanya memeriksa `Array.isArray(colors)`
     * pada simpul yang ber-testID `stage-scrim*`, dan itu TAUTOLOGI:
     * `expo-linear-gradient` SELALU memetakan warnanya menjadi array. Menambah
     * satu `View` gelap 55% TANPA testID membuatnya tetap HIJAU.
     *
     * Sekarang yang diperiksa: tidak ada `View`/`LinearGradient` ber-`backgroundColor`
     * pekat yang tingginya ≥ 40% panggung selain kedua gradasi yang memang
     * diizinkan. BUKTI MUTASI: tambahkan kembali scrim 55% tanpa testID, lalu
     * uji ini memerah.
     */
    await render(
      <TestProviders>
        <Stage
          scene={TANPA_KARAKTER}
          focusName={null}
          locationLabel="Kantor"
          backgroundUri={LATAR}
        />
      </TestProviders>,
    );

    const pekat: unknown[] = [];
    const telusuri = (simpul: unknown) => {
      if (!simpul || typeof simpul !== 'object') {
        return;
      }
      const n = simpul as {
        props?: { style?: unknown; colors?: unknown; testID?: string };
        children?: unknown[];
      };
      if (n.props?.style) {
        const gaya = ratakan(n.props.style);
        const tinggi = gaya.height;
        const latar = gaya.backgroundColor;
        const diizinkan = String(n.props.testID ?? '').startsWith('stage-scrim');
        // Lapisan berwarna gelap yang menutupi sebagian besar panggung.
        if (!diizinkan && typeof latar === 'string' && latar.startsWith('rgba(0, 0, 0') && tinggi) {
          pekat.push(n);
        }
      }
      for (const anak of n.children ?? []) {
        telusuri(anak);
      }
    };
    telusuri(screen.root);

    expect(pekat).toHaveLength(0);

    // Dan gradasi yang memang diizinkan tetap ada, tepat dua.
    expect(screen.getAllByTestId(/^stage-scrim/)).toHaveLength(2);
  });

  it('menggambar teks DI ATAS gradasi, bukan di bawahnya', async () => {
    /*
     * Urutan anak menentukan siapa yang menutupi siapa. Teks cerita dikirim
     * sebagai `children`, dan ia HARUS menjadi anak terakhir — kalau tidak, ia
     * terkubur di bawah gradasi kaki (94% hitam) dan pemain tidak melihat
     * kalimatnya sama sekali.
     *
     * BUKTI MUTASI: pindahkan `{children}` ke ATAS kedua `<LinearGradient>` di
     * `Stage.tsx`, lalu uji ini memerah.
     */
    await render(
      <TestProviders>
        <Stage
          scene={DENGAN_KARAKTER}
          focusName="Elysia"
          locationLabel="Kantor"
          backgroundUri={LATAR}
          portraitUri={POTRET}
        >
          <RNText testID="lapisan">teks cerita</RNText>
        </Stage>
      </TestProviders>,
    );

    // Indeks simpul `lapisan` harus LEBIH BESAR daripada indeks kedua gradasi.
    const semua: string[] = [];
    const telusuri = (simpul: unknown) => {
      if (!simpul || typeof simpul !== 'object') {
        return;
      }
      const n = simpul as { props?: { testID?: string }; children?: unknown[] };
      const id = n.props?.testID;
      if (typeof id === 'string') {
        semua.push(id);
      }
      for (const anak of n.children ?? []) {
        telusuri(anak);
      }
    };
    telusuri(screen.root);

    const indeksLapisan = semua.indexOf('lapisan');
    expect(indeksLapisan).toBeGreaterThan(-1);
    for (const scrim of ['stage-scrim-bottom', 'stage-scrim-top']) {
      const indeksScrim = semua.indexOf(scrim);
      expect(indeksScrim).toBeGreaterThan(-1);
      expect(indeksLapisan).toBeGreaterThan(indeksScrim);
    }
  });
});

describe('AssetImage — blurRadius', () => {
  it('meneruskan blurRadius ke gambar', async () => {
    await render(
      <TestProviders>
        <AssetImage
          uri={LATAR}
          accessibilityLabel="Latar uji"
          blurRadius={9}
          aspectRatio={16 / 9}
        />
      </TestProviders>,
    );

    expect(angkaProp(cariGambar('Latar uji'), 'blurRadius')).toBe(9);
  });

  it('tajam secara bawaan bila blurRadius tidak disebut', async () => {
    // Sampul dan kartu katalog memakai komponen yang sama. Kalau blur menjadi
    // bawaan, setiap gambar di aplikasi ikut buram.
    await render(
      <TestProviders>
        <AssetImage uri={LATAR} accessibilityLabel="Sampul uji" />
      </TestProviders>,
    );

    expect(angkaProp(cariGambar('Sampul uji'), 'blurRadius')).toBe(0);
  });
});
