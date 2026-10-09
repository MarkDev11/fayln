import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AssetImage } from '@/components/AssetImage';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';

import type { PresentedScene } from '../types';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Kekuatan blur latar saat karakter tampil. Diputuskan pemilik produk.
 *
 * Angka 4, BUKAN 12. Nilai 12 sempat dipilih, lalu terukur terlalu kuat: gambar
 * latar hanya selebar layar ponsel (~390 px), jadi `blur(12px)` menghapus hampir
 * seluruh detail ruangan dan menyisakan noda warna rata. Pemilik produk melihat
 * hasilnya dan memilih 4 — cukup untuk memisahkan karakter dari latar, tanpa
 * menghilangkan tempatnya.
 */
const BACKGROUND_BLUR_RADIUS = 4;

export type StageProps = {
  scene: PresentedScene;
  /** Nama karakter fokus, bila ada. */
  focusName: string | null;
  /** Label lokasi untuk pembaca layar dan placeholder latar. */
  locationLabel?: string;
  /**
   * URL latar yang SIAP DIMUAT, atau undefined bila belum ada.
   *
   * Panggung tidak mencari sendiri di manifest: ia tidak memegang dunia, hanya
   * satu adegan. Pemanggilnya yang menyelesaikan id menjadi URL.
   */
  backgroundUri?: string | undefined;
  /** URL potret karakter fokus yang siap dimuat. */
  portraitUri?: string | undefined;
  testID?: string;
};

/**
 * Panggung visual novel.
 *
 * Latar mengisi seluruh area; portrait karakter fokus berada di atasnya; scrim
 * menjaga agar teks dialog tetap terbaca di atas ilustrasi apa pun (docs/05 §6).
 *
 * ---------------------------------------------------------------------------
 * KENAPA URL-NYA DIKIRIM, BUKAN ID-nya
 * ---------------------------------------------------------------------------
 * Bentuk pertama komponen ini hanya menerima ID aset, dan karena itu ia TIDAK
 * PERNAH dapat menggambar apa pun — ia hanya menampilkan bidang netral berlabel.
 * Itu benar selama aset belum ada, tetapi menjadi bug senyap begitu asetnya ada:
 * latar dan potret tetap kosong, tanpa galat, dan tampilannya masuk akal.
 *
 * Sekarang URL-nya datang dari pemanggil, yang memang memegang `assetManifest`.
 * Bidang netral tetap dipakai sebagai CADANGAN saat URL-nya tidak ada — bukan
 * sebagai satu-satunya tampilan.
 */
export function Stage({
  scene,
  focusName,
  locationLabel,
  backgroundUri,
  portraitUri,
  testID,
}: StageProps) {
  const { colors } = useTheme();

  const hasBackground = Boolean(backgroundUri);
  const hasPortrait = Boolean(portraitUri);

  /*
   * Latar diblur HANYA saat ada karakter.
   *
   * Alasannya bukan sekadar gaya. Potret karakter adalah PNG tembus pandang yang
   * berdiri di atas latar; latar yang tajam dan ramai (papan tulis, jendela,
   * meja berderet) menarik mata menjauh dari karakter dan membuat potretnya
   * terbaca seperti tempelan. Diblur, latar tetap memberi tahu pemain DI MANA
   * adegan ini berlangsung, tanpa bersaing dengan siapa yang sedang bicara.
   *
   * Saat tidak ada karakter, latar dibiarkan tajam: pada adegan pembuka ruangan
   * kosong itulah yang justru ingin dilihat pemain.
   *
   * Angkanya 12 dipilih pemilik produk. Terlalu kecil tidak terasa, terlalu
   * besar membuat ruangan jadi noda warna dan kehilangan fungsinya sebagai
   * penunjuk tempat.
   */
  const backgroundBlur = hasPortrait ? BACKGROUND_BLUR_RADIUS : 0;

  return (
    <View testID={testID} style={[styles.root, { backgroundColor: colors.placeholder }]}>
      {/* Latar */}
      <View
        style={[styles.background, { backgroundColor: colors.placeholder }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          locationLabel
            ? `Latar: ${locationLabel}${hasBackground ? '' : '. Gambar belum tersedia.'}`
            : 'Latar belum tersedia.'
        }
      >
        {hasBackground ? (
          <AssetImage
            uri={backgroundUri as string}
            accessibilityLabel={locationLabel ?? 'Latar'}
            aspectRatio={16 / 9}
            contentFit="cover"
            blurRadius={backgroundBlur}
            style={styles.backgroundImage}
          />
        ) : (
          <View style={styles.backgroundPlaceholder}>
            <Icon name="book" size={30} color={colors.inkSecondary} />
            <Text variant="caption" tone="secondary">
              Latar belum tersedia
            </Text>
          </View>
        )}
      </View>

      {/* Portrait karakter fokus */}
      {scene.focusPortraitAssetId ? (
        <View
          style={styles.portraitWrap}
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            focusName ? `${focusName}, ekspresi ${scene.focusExpression ?? 'netral'}` : 'Karakter'
          }
        >
          {hasPortrait ? (
            <AssetImage
              uri={portraitUri as string}
              accessibilityLabel={focusName ?? 'Karakter'}
              aspectRatio={2 / 3}
              contentFit="contain"
              style={styles.portrait}
            />
          ) : (
            <View
              style={[
                styles.portrait,
                styles.portraitPlaceholder,
                { backgroundColor: colors.bgMuted, borderColor: colors.line },
              ]}
            >
              <Icon name="book" size={34} color={colors.inkSecondary} />
              <Text variant="caption" tone="secondary" center>
                {focusName ?? 'Karakter'}
              </Text>
              {scene.focusExpression ? (
                <Text variant="caption" tone="secondary" center>
                  ({scene.focusExpression})
                </Text>
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      {/*
        * TIDAK ada scrim di sini.
        *
        * Bentuk lamanya memasang lapisan gelap setinggi 55% dari panggung, untuk
        * menjaga teks dialog tetap terbaca di atas ilustrasi. Sejak kotak dialog
        * pindah ke BAWAH panggung, tidak ada lagi teks di atas gambar — dan
        * lapisan itu hanya membuat separuh bawah latar tampak hitam. Pemilik
        * produk melihatnya sebagai latar yang rusak.
        */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Latar mengisi seluruh panggung.
   *
   * "absoluteFill" tidak dipakai karena AssetImage membungkus gambarnya dalam
   * View ber-aspectRatio; latar harus menutupi area, bukan mengikuti rasionya.
   */
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  backgroundPlaceholder: {
    alignItems: 'center',
    gap: space.xs,
    opacity: 0.7,
  },
  portraitWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '18%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  /**
   * Potret karakter fokus — TANPA bingkai.
   *
   * Bentuk sebelumnya memberi `borderTopLeftRadius`/`borderTopRightRadius` 120
   * plus `borderWidth` satu helai, sehingga tergambar LENGKUNGAN seperti pintu
   * di sekeliling karakter. Pemilik produk melihatnya sebagai "frame di pinggir
   * karakter" — dan memang bukan bagian dari ilustrasinya: potret sudah punya
   * siluetnya sendiri yang tembus pandang, jadi lengkungan tambahan itu hanya
   * garis asing yang menempel di ruang kosong.
   *
   * Radius DAN garis tepinya dibuang bersama: menyisakan salah satunya tetap
   * memperlihatkan bentuk lengkung yang sama.
   */
  portrait: {
    width: '62%',
    aspectRatio: 2 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  /**
   * Hanya untuk CADANGAN saat gambar potret belum tersedia.
   *
   * Di sinilah garis tepi masih berguna: tanpa gambar, bidang ini tidak punya
   * siluet apa pun dan akan lenyap ke dalam latar. Pada potret sungguhan, garis
   * itu justru menjadi lengkungan asing yang mengelilingi karakter.
   */
  portraitPlaceholder: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
