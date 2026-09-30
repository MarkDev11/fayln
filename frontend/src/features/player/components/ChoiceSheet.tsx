import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import type { PendingDecision } from '../types';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

export type ChoiceSheetProps = {
  decision: PendingDecision;
  /** Menonaktifkan seluruh opsi saat pengiriman berlangsung. */
  disabled?: boolean;
  selectedOptionId?: string | null;
  onSelect: (optionId: string) => void;
  testID?: string;
};

/**
 * Tiga pilihan hasil AI.
 *
 * Aturan (FR-17, FR-64): tepat tiga opsi, tanpa hitung mundur, tanpa pilihan
 * otomatis, dan tidak ada opsi yang disamarkan sebagai gratis.
 */
export function ChoiceSheet({
  decision,
  disabled = false,
  selectedOptionId = null,
  onSelect,
  testID,
}: ChoiceSheetProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View testID={testID} style={styles.root}>
      <Text variant="label" tone="secondary" style={styles.prompt}>
        {decision.prompt}
      </Text>

      <View style={styles.options}>
        {decision.options.map((option, index) => {
          const isSelected = selectedOptionId === option.optionId;
          return (
            <Pressable
              key={option.optionId}
              onPress={() => onSelect(option.optionId)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${t('player.optionLabel', { index: index + 1 })}. ${option.label}`}
              accessibilityHint={option.description}
              accessibilityState={{ disabled, selected: isSelected }}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: colors.bgSurface,
                  borderColor: isSelected ? colors.accent : colors.line,
                  opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
                },
              ]}
            >
              <View style={[styles.indexBadge, { borderColor: colors.line }]}>
                <Text variant="caption" weight="700" tone="secondary">
                  {index + 1}
                </Text>
              </View>
              <View style={styles.optionBody}>
                <Text variant="body" weight="600">
                  {option.label}
                </Text>
                <Text variant="caption" tone="secondary">
                  {option.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.md,
  },
  prompt: {},
  options: {
    gap: space.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    minHeight: touchTarget,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  indexBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  optionBody: {
    flex: 1,
    gap: 2,
  },
});
