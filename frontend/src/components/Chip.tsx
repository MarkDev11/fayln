import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Chip nonaktif hanya menampilkan label, tanpa aksi. */
  readOnly?: boolean;
  testID?: string;
};

/**
 * Chip status atau filter.
 * Status aktif ditandai teks tebal + garis tepi, bukan hanya warna (NFR-01).
 */
export function Chip({ label, selected = false, onPress, readOnly = false, testID }: ChipProps) {
  const { colors } = useTheme();

  const body = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.bgMuted : 'transparent',
          borderColor: selected ? colors.accent : colors.line,
        },
      ]}
    >
      <Text variant="caption" weight={selected ? '700' : '500'} tone={selected ? 'accent' : 'secondary'}>
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
      hitSlop={6}
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
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
