import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

/** Batas panjang tindakan bebas. Bukan batas server, hanya penjaga UI. */
export const MAX_CUSTOM_ACTION_CHARS = 600;

export type ComposerProps = {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitting?: boolean;
  testID?: string;
};

/**
 * Kolom aksi/dialog bebas.
 *
 * Draft tidak dihapus saat pengiriman gagal atau validasi menolak (FR-65), dan
 * teks bantuan menegaskan bahwa tindakan pemain adalah UPAYA, bukan perintah
 * yang pasti berhasil (FR-57).
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  submitting = false,
  testID,
}: ComposerProps) {
  const { colors, scaled } = useTheme();
  const { t } = useI18n();

  const trimmed = value.trim();
  const remaining = MAX_CUSTOM_ACTION_CHARS - value.length;
  const isTooLong = remaining < 0;
  const canSubmit = trimmed.length > 0 && !isTooLong && !disabled && !submitting;

  return (
    <View testID={testID} style={styles.root}>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        multiline
        maxLength={MAX_CUSTOM_ACTION_CHARS + 100}
        placeholder={t('player.composerPlaceholder')}
        placeholderTextColor={colors.inkSecondary}
        accessibilityLabel={t('player.composerLabel')}
        accessibilityHint={t('player.composerHint')}
        style={[
          styles.input,
          {
            backgroundColor: colors.bgSurface,
            borderColor: isTooLong ? colors.danger : colors.line,
            color: colors.inkPrimary,
            fontSize: scaled(15),
          },
        ]}
      />

      <View style={styles.row}>
        <View style={styles.meta}>
          <Text variant="caption" tone={isTooLong ? 'danger' : 'secondary'}>
            {isTooLong
              ? t('player.customTooLong')
              : t('player.charactersLeft', { count: remaining })}
          </Text>
        </View>
        <Button
          label={t('player.send')}
          onPress={onSubmit}
          disabled={!canSubmit}
          loading={submitting}
          testID="composer-send"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.sm,
  },
  input: {
    minHeight: 76,
    maxHeight: 140,
    padding: space.md,
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: touchTarget,
  },
  meta: {
    flex: 1,
  },
});
