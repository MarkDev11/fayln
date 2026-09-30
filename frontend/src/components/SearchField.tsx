import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from './Icon';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

export type SearchFieldProps = {
  value: string;
  onChange: (next: string) => void;
  testID?: string;
};

/**
 * Kolom pencarian judul.
 *
 * Catatan aksesibilitas: label eksplisit disediakan lewat `accessibilityLabel`,
 * karena placeholder tidak cukup bagi pembaca layar.
 */
export function SearchField({ value, onChange, testID }: SearchFieldProps) {
  const { colors, scaled } = useTheme();
  const { t } = useI18n();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bgSurface, borderColor: colors.line },
      ]}
    >
      <Icon name="search" size={20} color={colors.inkSecondary} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={t('home.searchPlaceholder')}
        placeholderTextColor={colors.inkSecondary}
        accessibilityLabel={t('home.searchLabel')}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        style={[styles.input, { color: colors.inkPrimary, fontSize: scaled(15) }]}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel={t('home.searchClear')}
          hitSlop={10}
          style={styles.clear}
        >
          <Icon name="close" size={18} color={colors.inkSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    paddingVertical: space.sm,
  },
  clear: {
    padding: space.xs,
  },
});
