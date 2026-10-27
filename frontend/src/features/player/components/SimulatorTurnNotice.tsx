import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { useGateway } from '@/data/GatewayProvider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type SimulatorTurnNoticeProps = {
  /**
   * Penanda simulator dari envelope giliran terakhir.
   *
   * Di layar pemain, nilai ini adalah `state.simulator` — yang disalin dari
   * `envelope.simulator` setiap `TURN_COMMITTED`, jadi ia mengikuti MESIN yang
   * menulis giliran TERAKHIR, bukan asumsi sesi.
   */
  simulator?: boolean;
  testID?: string;
};

/**
 * Pemberitahuan tenang bahwa giliran terakhir ditulis mesin cadangan.
 *
 * Jujur, bukan menakuti: satu baris kecil, nada penjelasan, tanpa kata
 * "galat". Pemain berhak tahu siapa yang menulis ceritanya (NFR-16) — tetapi
 * tidak perlu diinterogasi soalnya.
 *
 * ---------------------------------------------------------------------------
 * KENAPA BUKAN `SimulatorBadge`
 * ---------------------------------------------------------------------------
 * `SimulatorBadge` berbicara tentang MODE sesi ("SIMULATOR" di HUD), bukan
 * tentang ASAL satu giliran. Ketika backend produksi sesekali jatuh ke mesin
 * cadangan, mode sesinya tetap produksi tetapi giliran itu tetap buatan
 * simulator — badge sesi tidak akan berubah, sedangkan pemberitahuan ini
 * muncul persis pada giliran yang ditulis mesin cadangan.
 *
 * BUKTI MUTASI: hapus `if (!isSimulator) return null;`, lalu uji "hanya tampil
 * saat penandanya benar" memerah — pemberitahuan tampil juga di giliran
 * produksi dan berbohong tentang siapa penulisnya.
 */
export function SimulatorTurnNotice({ simulator, testID }: SimulatorTurnNoticeProps = {}) {
  const gateway = useGateway();
  const { colors } = useTheme();
  const { t } = useI18n();
  const isSimulator = simulator ?? gateway.isSimulator;

  if (!isSimulator) {
    return null;
  }

  return (
    <View
      testID={testID ?? 'simulator-turn-notice'}
      accessible
      accessibilityRole="text"
      style={[styles.notice, { backgroundColor: colors.bgMuted }]}
    >
      <Text variant="caption" tone="secondary">
        {t('sim.turnNotice')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.chip,
  },
});
