import React, { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export type ScreenProps = {
  children: ReactNode;
  /** Konten dapat digulir. Matikan untuk layar yang mengatur scroll sendiri. */
  scroll?: boolean;
  /** Padding horizontal standar. */
  padded?: boolean;
  /** Menyisakan ruang bawah untuk action bar yang menetap. */
  bottomInsetExtra?: number;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  testID?: string;
};

/**
 * Pembungkus layar: latar bertema, safe area atas/bawah, dan ruang bawah opsional
 * agar baris terakhir tidak tertutup action bar yang menetap (FR-09).
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  bottomInsetExtra = 0,
  style,
  contentStyle,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    paddingHorizontal: padded ? space.lg : 0,
    paddingBottom: insets.bottom + space.lg + bottomInsetExtra,
  };

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={[styles.flex, { backgroundColor: colors.bgApp }, style]}
        contentContainerStyle={[padding, contentStyle]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      testID={testID}
      style={[
        styles.flex,
        { backgroundColor: colors.bgApp, paddingTop: insets.top },
        style,
      ]}
    >
      <View style={[styles.flex, padding, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
