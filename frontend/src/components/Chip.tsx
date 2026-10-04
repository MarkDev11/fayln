import React from 'react';
import { Pressable, StyleSheet, View, type Insets } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Chip nonaktif hanya menampilkan label, tanpa aksi. */
  readOnly?: boolean;
  /**
   * Varian permukaan Beranda: radius 8, lebar minimum 48, dan garis 1px
   * (docs/05 §8.3). Nilai default mempertahankan tampilan lama di luar Beranda,
   * karena penyelarasan radius se-aplikasi sengaja ditunda (D1).
   */
  tile?: boolean;
  /**
   * Tanda centang pada chip aktif. Keadaan terpilih tidak boleh hanya ditandai
   * warna (NFR-01): tebal + latar + tepi + ikon.
   */
  check?: boolean;
  /** Baris ringkas setinggi 20 untuk lencana di dalam kartu. */
  dense?: boolean;
  /** Perluas area sentuh tanpa mengubah ukuran visual. */
  hitSlop?: number | Insets | null;
  testID?: string;
};

/**
 * Chip status atau filter.
 * Status aktif ditandai teks tebal + garis tepi, bukan hanya warna (NFR-01).
 */
export function Chip({
  label,
  selected = false,
  onPress,
  readOnly = false,
  tile = false,
  check = false,
  dense = false,
  hitSlop,
  testID,
}: ChipProps) {
  const { colors } = useTheme();

  const body = (
    <View
      style={[
        styles.chip,
        // Tanpa garis tepi: keadaan dibedakan oleh isian, bukan bingkai.
        // Tidak terpilih = permukaan lembut; terpilih = isian aksen penuh.
        { backgroundColor: selected ? colors.accent : colors.bgMuted },
        tile ? styles.tile : null,
        dense ? styles.dense : null,
      ]}
    >
      {selected && check ? (
        <Icon name="check" size={12} color={colors.inkInverse} />
      ) : null}
      <Text
        variant="caption"
        weight={selected ? '700' : '500'}
        tone={selected ? 'inverse' : 'secondary'}
      >
        {label}
      </Text>
    </View>
  );

  if (readOnly || !onPress) {
    return <View testID={testID}>{body}</View>;
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={hitSlop === undefined ? 6 : hitSlop}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  tile: {
    minWidth: 48,
    borderRadius: radius.tile,
  },
  dense: {
    minHeight: 20,
    paddingHorizontal: space.sm,
  },
});
