import React from 'react';
import { StyleSheet, View } from 'react-native';

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
  testID?: string;
};

/**
 * Panggung visual novel.
 *
 * Latar mengisi seluruh area; portrait karakter fokus berada di atasnya; scrim
 * menjaga agar teks dialog tetap terbaca di atas ilustrasi apa pun (docs/05 §6).
 *
 * Selama aset belum tersedia, panggung menampilkan bidang netral berlabel — bukan
 * gambar karangan dan bukan wajah karakter lain (R-06).
 */
export function Stage({ scene, focusName, locationLabel, testID }: StageProps) {
  const { colors } = useTheme();

  const hasBackground = Boolean(scene.backgroundAssetId);
  const hasPortrait = Boolean(scene.focusPortraitAssetId);

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
        {!hasBackground ? (
          <View style={styles.backgroundPlaceholder}>
            <Icon name="book" size={30} color={colors.inkSecondary} />
            <Text variant="caption" tone="secondary">
              Latar belum tersedia
            </Text>
          </View>
        ) : null}
      </View>

      {/* Portrait karakter fokus */}
      {hasPortrait ? (
        <View
          style={styles.portraitWrap}
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            focusName ? `${focusName}, ekspresi ${scene.focusExpression ?? 'netral'}` : 'Karakter'
          }
        >
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
