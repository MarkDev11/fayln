import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';

import { formatCount } from '@/domain/format';
import type { UsageDTO } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type QuotaSheetProps = {
  visible: boolean;
  usage: UsageDTO;
  onClose: () => void;
  testID?: string;
};

/**
 * Lembar pemakaian kuota ringkas (C1).
 *
 * Menjawab tiga hal saja: sisa hari ini, kapan reset, dan bahwa membaca ulang
 * tidak memakai token. Rincian `spent`/`reserved` sengaja TIDAK ditampilkan —
 * bagi pemain Free keduanya tidak menjelaskan apa pun, dan menampilkannya akan
 * membuat lembar ini menjadi salinan mini layar Pengaturan (anti-slop). Tidak
 * ada tautan ke layar lain dari sini.
 *
 * Mengikuti pola lembar yang sudah ada di repo (`ReportSheet`,
 * `StartJourneySheet`): `Modal` transparan, latar gelap yang dapat diketuk, dan
 * gagang di tepi atas. Tanpa garis tepi: pemisahan dari latar gelap sudah cukup
 * lewat warna permukaan.
 */
export function QuotaSheet({ visible, usage, onClose, testID }: QuotaSheetProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  /**
   * Waktu reset dalam waktu LOKAL perangkat, bukan ISO mentah.
   *
   * Memakai `Intl.DateTimeFormat` seperti layar Paket & penggunaan; `formatCount`
   * tidak dipakai di sini karena itu pemformat angka, bukan tanggal.
   */
  const formatReset = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const baseTestID = testID ?? 'home-quota-sheet';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
      testID={testID}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t('common.close')}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.bgApp,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.line }]} />

        <View style={styles.header}>
          <Text variant="title">{t('home.quotaSheetTitle')}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={10}
            style={styles.close}
          >
            <Icon name="close" size={20} color={colors.inkSecondary} />
          </Pressable>
        </View>

        <View style={styles.content}>
          <Text variant="body">
            {t('home.quotaRemaining', {
              available: formatCount(usage.available),
              limit: formatCount(usage.allowanceLimit),
            })}
          </Text>
          <Text variant="caption" tone="secondary">
            {t('home.quotaResetAt', { when: formatReset(usage.resetAt) })}
          </Text>
          <Text variant="caption" tone="secondary">
            {t('home.quotaRereadFree')}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            label={t('common.close')}
            onPress={onClose}
            fullWidth
            tile
            testID={`${baseTestID}-close`}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    padding: space.xs,
  },
  content: {
    gap: space.sm,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  actions: {
    paddingTop: space.sm,
  },
});
