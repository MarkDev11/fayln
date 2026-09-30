import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';

import { useTheme } from '@/theme/ThemeProvider';
import { space, touchTarget } from '@/theme/tokens';

export type StickyActionBarProps = {
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** Aksi sekunder, misalnya Hapus. Ditempatkan terpisah agar tidak salah tekan. */
  secondaryIcon?: IconName;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Memberi warna bahaya pada aksi sekunder. */
  secondaryDanger?: boolean;
  testID?: string;
};

/**
 * Bar aksi yang menetap di bawah.
 *
 * Aturan (docs/04, FR-09/FR-28): satu aksi primer; aksi destruktif diberi jarak,
 * bukan berdempetan, dan selalu memiliki label aksesibilitas yang menyebut objeknya.
 */
export function StickyActionBar({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  secondaryIcon,
  secondaryLabel,
  onSecondary,
  secondaryDanger = false,
  testID,
}: StickyActionBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      testID={testID}
      style={[
        styles.bar,
        {
          backgroundColor: colors.bgApp,
          borderTopColor: colors.line,
          paddingBottom: insets.bottom + space.md,
        },
      ]}
    >
      <View style={styles.primarySlot}>
        <Button label={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} fullWidth />
      </View>
      {secondaryIcon && onSecondary ? (
        <View style={styles.secondarySlot}>
          <Button
            label={secondaryLabel ?? primaryLabel}
            onPress={onSecondary}
            variant={secondaryDanger ? 'danger' : 'secondary'}
            icon={secondaryIcon}
            iconOnly
            accessibilityHint={secondaryLabel}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: touchTarget,
  },
  primarySlot: {
    flex: 1,
  },
  secondarySlot: {
    width: touchTarget,
  },
});
