import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';

import { useGateway } from '@/data/GatewayProvider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * Penanda mode simulator.
 *
 * Wajib tampil selama frontend belum terhubung ke backend nyata, agar tidak ada
 * pihak yang menyangka cerita contoh berasal dari AI produksi (NFR-16, R-16).
 *
 * KAPAN TAMPIL ditentukan oleh MESIN, bukan oleh pemanggil.
 *
 * Sebelumnya komponen ini selalu merender labelnya, dan tiga layar
 * memanggilnya tanpa syarat apa pun (`world/[worldId]`, `journey/[journeyId]`,
 * `settings/plan`). Di produksi mesinnya AI sungguhan (`simulator: false`,
 * `modelId: "ai-story"`), sehingga aplikasi memberi tahu setiap pemain bahwa
 * ceritanya berasal dari contoh bawaan — persis kebalikan dari yang
 * dikehendaki NFR-16, dan satu kelas dengan bug `simulator: true` yang dulu
 * diperbaiki di layar pemain.
 *
 * Gerbangnya diletakkan DI SINI, bukan di tiap pemanggil: dengan begitu tidak
 * ada layar yang dapat lupa memeriksanya, termasuk layar yang ditulis nanti.
 */
export function SimulatorBadge() {
  const gateway = useGateway();
  const { colors } = useTheme();
  const { t } = useI18n();

  if (!gateway.isSimulator) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityLabel={`${t('sim.badge')}. ${t('sim.notice')}`}
      style={[styles.badge, { backgroundColor: colors.bgMuted }]}
    >
      <Text variant="caption" weight="700" tone="warning">
        {t('sim.badge')}
      </Text>
    </View>
  );
}

/** Seperti `SimulatorBadge`: hanya tampil saat mesinnya memang simulator. */
export function SimulatorNotice() {
  const gateway = useGateway();
  const { colors } = useTheme();
  const { t } = useI18n();

  if (!gateway.isSimulator) {
    return null;
  }

  return (
    <View
      accessible
      accessibilityRole="alert"
      style={[styles.notice, { backgroundColor: colors.bgMuted }]}
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
  },
  notice: {
    padding: space.md,
    borderRadius: radius.card,
  },
});
