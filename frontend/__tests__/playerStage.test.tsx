import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { AssetImage } from '@/components/AssetImage';
import { Stage } from '@/features/player/components/Stage';
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
 * gabungannya punya `aspectRatio` 2/3 sekaligus mewarisi gaya dari pemanggil.
 * Itu tepat satu simpul, dan justru simpul yang menggambar potret.
 */
function cariPembungkusPotret() {
  let ketemu: { props: { style?: unknown } } | null = null;

  const telusuri = (simpul: unknown) => {
    if (!simpul || typeof simpul !== 'object') {
      return;
    }
    const n = simpul as { type?: unknown; props?: { style?: unknown }; children?: unknown[] };
    if (n.type === 'View' && n.props) {
      const gaya = ratakan(n.props.style);
      if (gaya.aspectRatio === 2 / 3 && gaya.width === '62%') {
        ketemu = n as { props: { style?: unknown } };
        return;
      }
    }
    for (const anak of n.children ?? []) {
      telusuri(anak);
    }
  };

  telusuri(screen.root);
  if (!ketemu) {
    throw new Error('Pembungkus potret tidak ditemukan di pohon render.');
  }
  return ketemu as { props: { style?: unknown } };
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
