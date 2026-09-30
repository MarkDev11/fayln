import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

export type ControlItem = {
  id: string;
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export type PlayerControlsProps = {
  items: ControlItem[];
  testID?: string;
};

/**
 * Baris kontrol pemutar.
 *
 * Setiap kontrol memiliki label teks, bukan hanya ikon, sehingga status aktif
 * (misalnya Auto menyala) tidak bergantung pada warna saja (NFR-01).
 */
export function PlayerControls({ items, testID }: PlayerControlsProps) {
  const { colors } = useTheme();

  return (
    <View testID={testID} style={styles.row}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={item.onPress}
          disabled={item.disabled}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: Boolean(item.active), disabled: Boolean(item.disabled) }}
          style={({ pressed }) => [
            styles.item,
            {
              backgroundColor: item.active ? colors.bgMuted : 'transparent',
              borderColor: item.active ? colors.accent : colors.line,
              opacity: item.disabled ? 0.45 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Icon
            name={item.icon}
            size={18}
            color={item.active ? colors.accent : colors.inkSecondary}
          />
          <Text variant="caption" weight={item.active ? '700' : '500'} tone={item.active ? 'accent' : 'secondary'}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 36,
    minWidth: touchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
