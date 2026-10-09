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
  /**
   * Kekuatan blur dalam satuan perangkat. `0` berarti tajam.
   *
   * Dipakai panggung cerita: saat potret karakter muncul, latar diblur agar
   * karakter dan teks di atasnya terbaca. Latar TIDAK diblur saat tidak ada
   * karakter — ruangan kosong justru yang ingin dilihat pemain pada adegan
   * pembuka.
   *
   * Dikerjakan `expo-image`, bukan lapisan terpisah: memblur gambar yang sama
   * dua kali (satu tajam, satu buram di atasnya) berarti mengunduh dan menyimpan
   * dua salinan untuk setiap latar.
   */
  blurRadius?: number;
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
  blurRadius = 0,
  testID,
}: AssetImageProps) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const isLocalPlaceholder = uri.startsWith(LOCAL_ASSET_PREFIX);
  const showPlaceholder = isLocalPlaceholder || failed;

  return (
    <View
      testID={testID}
      /*
       * TIDAK ada `backgroundColor` di sini.
       *
       * Bentuk sebelumnya selalu melukis `colors.placeholder` di belakang gambar.
       * Untuk sampul yang buram itu tidak terlihat, tetapi POTRET karakter adalah
       * PNG TEMBUS PANDANG — dan latar itu menembusnya sebagai kotak hitam
       * mengikuti bentuk lengkungnya. Terlihat seperti potret yang salah render,
       * padahal gambarnya benar.
       *
       * Warnanya kini hanya dipakai oleh tampilan placeholder, tempat ia memang
       * dibutuhkan.
       */
      style={[styles.container, { aspectRatio }, style]}
    >
      {showPlaceholder ? (
        <View
          style={[styles.placeholder, { backgroundColor: colors.placeholder }]}
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
          blurRadius={blurRadius}
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
  /**
   * Tanpa garis tepi.
   *
   * Sampul sebelumnya diberi garis `hairlineWidth` yang membuat setiap gambar
   * terbaca sebagai kotak berbingkai. Beranda kini menyatu: gambar duduk
   * langsung di latar, dan bila perlu dipisahkan, pemisahnya dibuat oleh
   * gradasi — bukan garis.
   */
  container: {
    width: '100%',
    borderRadius: radius.card,
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
