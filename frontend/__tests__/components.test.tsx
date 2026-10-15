import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { Icon } from '@/components/Icon';
import { NPCRelationChip } from '@/components/NPCRelationChip';
import { StateView } from '@/components/StateView';
import { StoryCard } from '@/components/StoryCard';
import { catalogFixtures } from '@/data/mock/fixtures';
import { TestProviders } from '@/testing/TestProviders';

/**
 * Catatan: pada @testing-library/react-native v14, `render` bersifat async.
 * Setiap pemanggilan WAJIB di-await, jika tidak `screen` belum terisi dan semua
 * kueri akan gagal dengan "`render` function has not been called".
 */

const boskuMantan = catalogFixtures.find((item) => item.worldId === 'w_bosku-mantan');
const arsip = catalogFixtures.find((item) => item.worldId === 'w_arsip-lama');

describe('StoryCard', () => {
  it('menampilkan judul dan genre dalam Bahasa Indonesia', async () => {
    await render(
      <TestProviders>
        <StoryCard item={boskuMantan!} onPress={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText(boskuMantan!.title)).toBeTruthy();
    expect(screen.getByText('Romansa +2')).toBeTruthy();
  });

  it('menyediakan label aksesibilitas yang memuat judul dan status', async () => {
    await render(
      <TestProviders>
        <StoryCard item={boskuMantan!} onPress={() => {}} />
      </TestProviders>,
    );

    expect(
      screen.getByLabelText(`${boskuMantan!.title}. Romansa, Drama, Kehidupan Kantor. Terbit`),
    ).toBeTruthy();
  });

  it('menandai dunia terarsip dengan label status yang terlihat', async () => {
    await render(
      <TestProviders>
        <StoryCard item={arsip!} onPress={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText('Diarsipkan')).toBeTruthy();
  });

  it('menerjemahkan label ketika locale Inggris dipilih', async () => {
    await render(
      <TestProviders locale="en-US">
        <StoryCard item={boskuMantan!} onPress={() => {}} />
      </TestProviders>,
    );

    expect(screen.getByText('Romance +2')).toBeTruthy();
  });
});

describe('NPCRelationChip', () => {
  it('menampilkan nama dan status hubungan sebagai teks, bukan hanya warna', async () => {
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Elysia" status="waspada" />
      </TestProviders>,
    );

    expect(screen.getByText('Elysia')).toBeTruthy();
    expect(screen.getByText('Waspada')).toBeTruthy();
  });

  it('memakai label netral untuk status yang tidak dikenal', async () => {
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Elysia" status="unknown" />
      </TestProviders>,
    );

    expect(screen.getByText('Belum diketahui')).toBeTruthy();
  });

  it('tidak menampilkan enum mentah ke pemain', async () => {
    await render(
      <TestProviders>
        <NPCRelationChip npcName="Elysia" status="waspada" />
      </TestProviders>,
    );

    expect(screen.queryByText('waspada')).toBeNull();
  });
});

describe('StateView', () => {
  it('menampilkan aksi lanjutan ketika disediakan', async () => {
    await render(
      <TestProviders>
        <StateView
          kind="empty"
          title="Tidak ada cerita yang cocok"
          body="Coba kata kunci lain."
          actionLabel="Atur ulang"
          onAction={() => {}}
        />
      </TestProviders>,
    );

    expect(screen.getByText('Tidak ada cerita yang cocok')).toBeTruthy();
    expect(screen.getByText('Atur ulang')).toBeTruthy();
  });

  it('tidak menampilkan tombol ketika tidak ada aksi', async () => {
    await render(
      <TestProviders>
        <StateView kind="error" title="Gagal memuat" />
      </TestProviders>,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Icon — chevron', () => {
  /**
   * Chevron harus berbentuk `>` / `<`, BUKAN tanda silang.
   *
   * Bentuk lama memberi kedua batang `marginLeft` yang sama dan wadahnya
   * memakai `alignItems` bawaan (`stretch`), sehingga kedua batang punya pusat X
   * yang sama — `rotate ±45°` pada pusat yang sama menghasilkan `×`. Terlihat
   * pada tombol bulat di kaki panggung pemain.
   *
   * Yang diperiksa: kedua batang punya `top` yang BERBEDA (chevron menumpuk
   * vertikal; silang tidak), dan tidak ada satu pun yang memakai `marginLeft`
   * sebagai penentu posisi horizontal.
   *
   * BUKTI MUTASI: kembalikan `marginLeft: size * 0.1` pada kedua batang dan
   * hapus `top`-nya, lalu uji ini memerah.
   */
  it('menggambar chevron, bukan tanda silang', async () => {
    await render(
      <TestProviders>
        <Icon name="chevronRight" size={24} color="#FFFFFF" />
      </TestProviders>,
    );

    const batang: Record<string, unknown>[] = [];
    const telusuri = (simpul: unknown) => {
      if (!simpul || typeof simpul !== 'object') {
        return;
      }
      const n = simpul as { props?: { style?: unknown }; children?: unknown[] };
      if (n.props?.style) {
        const gaya = StyleSheet.flatten(n.props.style) as Record<string, unknown>;
        if (gaya.backgroundColor === '#FFFFFF' && gaya.height === 2) {
          batang.push(gaya);
        }
      }
      for (const anak of n.children ?? []) {
        telusuri(anak);
      }
    };
    telusuri(screen.root);

    expect(batang).toHaveLength(2);

    // Chevron menumpuk: satu batang di atas, satu di bawah.
    const tops = batang.map((g) => Number(g.top));
    expect(tops[0]).not.toBe(tops[1]);
    // Dan tidak ada yang diposisikan lewat margin — itu sumber silangnya dulu.
    for (const g of batang) {
      expect(g.marginLeft).toBeUndefined();
    }
  });
});

describe('Icon — hati', () => {
  /**
   * Hati harus punya LEKUKAN (notch) di puncaknya, bukan tetesan air.
   *
   * Bentuk lama menaruh titik atas persegi di y = 0.066s — DI ATAS bibir kedua
   * bulatan (0.16s) — sehingga persegi itu menutup celah di antara bulatan dan
   * bentuknya menjadi teardrop. Ditemukan oleh peninjau visual yang menyebutnya
   * "chunky and asymmetric".
   *
   * Yang diperiksa: persegi mulai DI BAWAH puncak bulatan, dan kedua bulatan
   * benar-benar terpisah secara horizontal (itulah celah lekukannya).
   *
   * BUKTI MUTASI: ubah `top: size * 0.36` pada persegi menjadi `size * 0.16`,
   * lalu uji ini memerah.
   */
  it('menggambar hati dengan lekukan, bukan tetesan air', async () => {
    await render(
      <TestProviders>
        <Icon name="heart" size={20} color="#FFFFFF" />
      </TestProviders>,
    );

    const bentuk: Record<string, unknown>[] = [];
    const telusuri = (simpul: unknown) => {
      if (!simpul || typeof simpul !== 'object') {
        return;
      }
      const n = simpul as { props?: { style?: unknown }; children?: unknown[] };
      if (n.props?.style) {
        const gaya = StyleSheet.flatten(n.props.style) as Record<string, unknown>;
        if (gaya.backgroundColor === '#FFFFFF') {
          bentuk.push(gaya);
        }
      }
      for (const anak of n.children ?? []) {
        telusuri(anak);
      }
    };
    telusuri(screen.root);

    expect(bentuk).toHaveLength(3);

    const bulatan = bentuk.filter((g) => Number(g.borderRadius ?? 0) > 0);
    const persegi = bentuk.filter((g) => Number(g.borderRadius ?? 0) === 0);
    expect(bulatan).toHaveLength(2);
    expect(persegi).toHaveLength(1);

    // Persegi harus mulai DI BAWAH puncak bulatan — kalau tidak, celahnya tertutup.
    const puncakBulatan = Math.min(...bulatan.map((g) => Number(g.top)));
    expect(Number(persegi[0]?.top)).toBeGreaterThan(puncakBulatan);

    // Dan kedua bulatan benar-benar terpisah horizontal.
    const kiri = Math.min(...bulatan.map((g) => Number(g.left)));
    const kanan = Math.max(...bulatan.map((g) => Number(g.left)));
    expect(kanan).toBeGreaterThan(kiri);
  });
});
