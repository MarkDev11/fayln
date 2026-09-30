import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';

import { relationLabelKey, relationTone } from '@/domain/labels';
import type { RelationStatus } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type NPCRelationChipProps = {
  npcName: string;
  status: RelationStatus | 'unknown';
  testID?: string;
};

/**
 * Penanda hubungan satu NPC.
 *
 * Selalu memuat teks status, bukan hanya warna (NFR-01). Nama NPC disertakan agar
 * kartu tetap bermakna bagi pembaca layar.
 */
export function NPCRelationChip({ npcName, status, testID }: NPCRelationChipProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const tone = relationTone(status);

  const toneColor: Record<ReturnType<typeof relationTone>, string> = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    secondary: colors.inkSecondary,
  };

  const color = toneColor[tone];

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${npcName}, ${t(relationLabelKey(status))}`}
      style={[styles.row, { borderColor: colors.line }]}
    >
      <Text variant="small" weight="600" numberOfLines={1} style={styles.name}>
        {npcName}
      </Text>
      <View style={[styles.statusPill, { borderColor: color }]}>
        <Text variant="caption" weight="600" style={{ color }}>
          {t(relationLabelKey(status))}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: {
    flexShrink: 1,
  },
  statusPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
