import React, { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { Icon } from './Icon';
import { Text } from './Text';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Skema aset internal. URI dengan skema ini belum tentu dapat dimuat. */
export const LOCAL_ASSET_PREFIX = 'asset://';

export type AssetImageProps = {
  uri: string;
  /** Deskripsi untuk pembaca layar. Wajib: gambar informatif harus punya alternatif teks. */
  accessibilityLabel: string;
  /** Ditampilkan pada placeholder ketika aset belum tersedia atau gagal dimuat. */
  placeholderLabel?: string;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  /** `cover` untuk sampul, `contain` untuk portrait karakter. */
  contentFit?: 'cover' | 'contain';
  testID?: string;
};

/**
 * Gambar aset dengan placeholder netral berlapis (docs/05 §5).
 *
 * Aset dibuat manual dan belum tersedia. Karena itu:
 * - URI berskema internal langsung menampilkan placeholder, tanpa permintaan jaringan.
 * - Kegagalan muat jatuh ke placeholder yang sama.
 * - Placeholder TIDAK memakai wajah atau identitas karakter lain (R-06).
 */
export function AssetImage({
  uri,
  accessibilityLabel,
  placeholderLabel,
  aspectRatio = 3 / 4,
  style,
  contentFit = 'cover',
  testID,
}: AssetImageProps) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const isLocalPlaceholder = uri.startsWith(LOCAL_ASSET_PREFIX);
  const showPlaceholder = isLocalPlaceholder || failed;

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        { aspectRatio, backgroundColor: colors.placeholder, borderColor: colors.line },
        style,
      ]}
    >
      {showPlaceholder ? (
        <View
          style={styles.placeholder}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${accessibilityLabel}. Gambar belum tersedia.`}
        >
          <Icon name="book" size={26} color={colors.inkSecondary} />
          {placeholderLabel ? (
            <Text variant="caption" tone="secondary" center numberOfLines={2} style={styles.placeholderText}>
              {placeholderLabel}
            </Text>
          ) : null}
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={120}
          accessible
          accessibilityLabel={accessibilityLabel}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  placeholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    gap: space.xs,
  },
  placeholderText: {
    marginTop: space.xs,
  },
});
