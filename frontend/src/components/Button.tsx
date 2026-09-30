import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  /** Ikon saja tanpa label visual; `label` tetap dipakai untuk aksesibilitas. */
  iconOnly?: boolean;
  fullWidth?: boolean;
  testID?: string;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  iconOnly = false,
  fullWidth = false,
  testID,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const isInactive = disabled || loading;

  const background: Record<ButtonVariant, string> = {
    primary: colors.accent,
    secondary: colors.bgMuted,
    ghost: 'transparent',
    danger: colors.danger,
  };

  const foreground: Record<ButtonVariant, string> = {
    primary: colors.inkInverse,
    secondary: colors.inkPrimary,
    ghost: colors.inkPrimary,
    danger: colors.inkInverse,
  };

  const tint = foreground[variant];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      hitSlop={iconOnly ? 8 : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background[variant],
          borderColor: variant === 'ghost' ? 'transparent' : colors.line,
          borderWidth: variant === 'ghost' ? 0 : StyleSheet.hairlineWidth,
          opacity: isInactive ? 0.5 : pressed ? 0.85 : 1,
        },
        iconOnly ? styles.iconOnly : null,
        fullWidth ? styles.fullWidth : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tint} size="small" />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={20} color={tint} /> : null}
          {iconOnly ? null : (
            <Text variant="label" style={{ color: tint }}>
              {label}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOnly: {
    minWidth: touchTarget,
    paddingHorizontal: space.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
