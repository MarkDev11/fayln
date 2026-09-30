import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * Penanda mode simulator.
 *
 * Wajib tampil selama frontend belum terhubung ke backend nyata, agar tidak ada
 * pihak yang menyangka cerita contoh berasal dari AI produksi (NFR-16, R-16).
 */
export function SimulatorBadge() {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View
      accessible
      accessibilityLabel={`${t('sim.badge')}. ${t('sim.notice')}`}
      style={[styles.badge, { borderColor: colors.warning }]}
    >
      <Text variant="caption" weight="700" tone="warning">
        {t('sim.badge')}
      </Text>
    </View>
  );
}

export function SimulatorNotice() {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View
      accessible
      accessibilityRole="alert"
      style={[styles.notice, { backgroundColor: colors.bgMuted, borderColor: colors.line }]}
    >
      <Text variant="caption" tone="secondary">
        {t('sim.notice')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notice: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
