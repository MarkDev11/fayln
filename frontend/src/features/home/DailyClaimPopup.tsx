import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';

import { useClaimDailyPoints } from '@/data/queries';
import { formatCount } from '@/domain/format';
import type { ClaimResultDTO, UsageDTO } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type DailyClaimPopupProps = {
  /** Benar selama `claimableToday` dan pemain belum menutupnya sesi ini. */
  visible: boolean;
  usage: UsageDTO;
  /** Dipanggil saat popup ditutup — baik ditutup sendiri maupun setelah klaim. */
  onClose: () => void;
  testID?: string;
};

/** Lama hadiah "+100 poin" ditahan terlihat sebelum popup menutup dirinya. */
const AWARDED_LINGER_MS = 1400;

/** Jumlah titik pada visual streak: satu siklus penuh (docs/17 §3.2). */
const STREAK_DOTS = 7;

/**
 * Popup klaim poin harian (docs/17 §3.1).
 *
 * Tanpa klaim, saldo hari itu 0 — popup ini adalah satu-satunya pintu mendapat
 * poin. Isinya: salam, tombol klaim, dan visual streak 7 titik dengan hari
 * ke-7 menyala "+300".
 *
 * Perilaku penutupan sengaja TIDAK diserahkan sepenuhnya ke induk: begitu
 * pemain menekan klaim, popup mempertahankan dirinya sendiri terbuka
 * (`modalVisible`) sampai hadiah sempat terbaca, baru memanggil `onClose`.
 * Tanpa ini, invalidasi kueri `usage` segera membalikkan `claimableToday`
 * dan popup lenyap pada bingkai yang sama dengan suksesnya klaim — pemain
 * tidak pernah melihat berapa yang mereka terima.
 */
export function DailyClaimPopup({ visible, usage, onClose, testID }: DailyClaimPopupProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const claim = useClaimDailyPoints();

  const [result, setResult] = useState<ClaimResultDTO | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /*
   * Tetap terbuka selama klaim berjalan ATAU hadiah sedang dipamerkan, walau
   * induk sudah membalikkan `visible` karena `claimableToday` kini false.
   */
  const modalVisible = visible || claim.isPending || result !== null;

  useEffect(() => {
    return () => {
      if (closeTimer.current !== undefined) {
        clearTimeout(closeTimer.current);
      }
    };
  }, []);

  const handleClaim = () => {
    claim.mutate(undefined, {
      onSuccess: (data) => {
        setResult(data);
        closeTimer.current = setTimeout(() => {
          setResult(null);
          onClose();
        }, AWARDED_LINGER_MS);
      },
    });
  };

  const handleClose = () => {
    if (claim.isPending) {
      // Jangan menutup di tengah klaim: percobaan ulang idempoten memang aman,
      // tetapi menutupnya membuat pemain tidak tahu apakah klaimnya masuk.
      return;
    }
    if (closeTimer.current !== undefined) {
      clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
    setResult(null);
    onClose();
  };

  const baseTestID = testID ?? 'daily-claim-popup';
  const streakDay = result?.streakDay ?? usage.streakDay;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      accessibilityViewIsModal
      testID={testID}
    >
      <Pressable
        style={styles.backdrop}
        onPress={handleClose}
        accessibilityLabel={t('claim.close')}
      />
      <View style={styles.centerer}>
        <View style={[styles.card, { backgroundColor: colors.bgSurface }]}>
          {result ? (
            <>
              <Text variant="dialog" tone="secondary" center>
                {t('claim.greeting')}
              </Text>
              <Text variant="display" tone="success" center testID={`${baseTestID}-awarded`}>
                {t('claim.awarded', { points: formatCount(result.awarded) })}
              </Text>
              {result.bonus > 0 ? (
                <Text variant="caption" tone="secondary" center>
                  {t('claim.awardedBonus', { bonus: formatCount(result.bonus) })}
                </Text>
              ) : null}
              <Text variant="caption" tone="secondary" center>
                {t('home.quotaStreak', { days: formatCount(streakDay) })}
              </Text>
            </>
          ) : (
            <>
              <Text variant="dialog" tone="secondary" center>
                {t('claim.greeting')}
              </Text>
              <Text variant="title" center>
                {t('claim.title')}
              </Text>
              <Text variant="small" tone="secondary" center>
                {t('claim.body')}
              </Text>

              <View style={styles.streakRow} testID={`${baseTestID}-streak`}>
                {Array.from({ length: STREAK_DOTS }, (_, index) => index + 1).map((day) => {
                  const lit = day <= streakDay;
                  return (
                    <View key={day} style={styles.dotColumn}>
                      <View
                        testID={`${baseTestID}-dot-${day}`}
                        accessibilityLabel={t('claim.dayLabel', { day })}
                        accessibilityState={{ checked: lit }}
                        style={[
                          styles.dot,
                          { backgroundColor: lit ? colors.accent : colors.line },
                        ]}
                      />
                      {day === STREAK_DOTS ? (
                        <Text variant="caption" tone="accent" center>
                          {t('claim.seventhBonus')}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
              <Text variant="caption" tone="secondary" center>
                {t('home.quotaStreak', { days: formatCount(streakDay) })}
              </Text>
              <Text variant="caption" tone="secondary" center>
                {t('claim.streakHint')}
              </Text>

              <View style={styles.actions}>
                {claim.isError && claim.error instanceof Error ? (
                  <Text variant="caption" tone="danger" center>
                    {claim.error.message}
                  </Text>
                ) : null}
                <Button
                  label={t('claim.action', { points: formatCount(usage.allowanceLimit) })}
                  onPress={handleClaim}
                  loading={claim.isPending}
                  fullWidth
                  testID={`${baseTestID}-claim`}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    /*
     * `absoluteFillObject` tidak ada di tipe react-native versi proyek ini
     * (hanya `absoluteFill`). Ditulis eksplisit supaya tsc bersih dan hasil
     * tata letaknya sama: menutup seluruh layar di belakang dialog.
     */
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  centerer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.card,
    padding: space.xl,
    gap: space.sm,
  },
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.md,
    paddingTop: space.sm,
  },
  dotColumn: {
    alignItems: 'center',
    gap: space.xs,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  actions: {
    gap: space.sm,
    paddingTop: space.sm,
  },
});
