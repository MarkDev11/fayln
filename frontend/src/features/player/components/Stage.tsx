import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AssetImage } from '@/components/AssetImage';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';

import type { PresentedScene } from '../types';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

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

      {/* Scrim agar teks selalu terbaca di atas ilustrasi */}
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]} />
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
  portrait: {
    width: '62%',
    aspectRatio: 2 / 3,
    borderTopLeftRadius: 120,
    borderTopRightRadius: 120,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    // pointerEvents lewat style; prop-nya sudah usang di React Native terbaru.
    pointerEvents: 'none',
  },
});
