import React from 'react';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, lineHeight } from '@/theme/tokens';

export type TextVariant =
  | 'display'
  | 'screen'
  | 'title'
  | 'dialog'
  | 'body'
  | 'small'
  | 'caption'
  | 'label';

export type TextTone = 'primary' | 'secondary' | 'inverse' | 'accent' | 'success' | 'warning' | 'danger';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  weight?: TextStyle['fontWeight'];
  center?: boolean;
};

const variantSize: Record<TextVariant, { size: number; line: number; weight: TextStyle['fontWeight'] }> = {
  display: { size: fontSize.display, line: 34, weight: '700' },
  screen: { size: fontSize.screen, line: lineHeight.screen, weight: '700' },
  title: { size: fontSize.title, line: lineHeight.title, weight: '600' },
  dialog: { size: fontSize.dialog, line: lineHeight.dialog, weight: '400' },
  body: { size: fontSize.body, line: lineHeight.body, weight: '400' },
  small: { size: fontSize.small, line: lineHeight.small, weight: '400' },
  caption: { size: fontSize.caption, line: lineHeight.caption, weight: '400' },
  label: { size: fontSize.small, line: lineHeight.small, weight: '600' },
};

/**
 * Teks bertema. Seluruh ukuran font melewati `scaled()` agar preferensi ukuran
 * teks pemain berlaku konsisten (NFR-02), dan `allowFontScaling` tetap aktif
 * agar pengaturan sistem juga dihormati.
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  weight,
  center,
  style,
  ...rest
}: TextProps) {
  const { colors, scaled } = useTheme();
  const preset = variantSize[variant];

  const toneColor: Record<TextTone, string> = {
    primary: colors.inkPrimary,
    secondary: colors.inkSecondary,
    inverse: colors.inkInverse,
    accent: colors.accent,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  };

  return (
    <RNText
      {...rest}
      allowFontScaling
      style={[
        {
          fontSize: scaled(preset.size),
          lineHeight: scaled(preset.line),
          fontWeight: weight ?? preset.weight,
          color: toneColor[tone],
        },
        center ? styles.center : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
