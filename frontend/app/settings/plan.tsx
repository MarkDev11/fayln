import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SimulatorBadge } from '@/components/SimulatorBadge';
import { StateView } from '@/components/StateView';
import { Text } from '@/components/Text';

import { useUsage } from '@/data/queries';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

/**
 * Paket & penggunaan (SC-18).
 *
 * Tujuan utama halaman ini adalah kejujuran: pemain harus bisa membedakan batas
 * konteks dari kuota harian, dan tahu bahwa angka di perangkat hanyalah perkiraan.
 * Harga dan pembelian belum aktif, jadi tidak ada tombol beli yang menipu.
 */
export default function PlanScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const usage = useUsage();

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/settings');
  }, [router]);

  const formatNumber = (value: number) => new Intl.NumberFormat(locale).format(value);
  const formatTime = (iso: string) => {
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

  return (
    <View style={[styles.root, { backgroundColor: colors.bgApp, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          style={[styles.backButton, { borderColor: colors.line, backgroundColor: colors.bgSurface }]}
        >
          <Icon name="chevronLeft" size={20} color={colors.inkPrimary} />
        </Pressable>
        <SimulatorBadge />
      </View>

      {usage.isLoading && !usage.data ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="small" tone="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : usage.isError || !usage.data ? (
        <View style={styles.center}>
          <StateView
            kind="error"
            title={t('state.errorTitle')}
            body={t('state.errorBody')}
            actionLabel={t('common.retry')}
            onAction={() => {
              void usage.refetch();
            }}
            testID="plan-error"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
          showsVerticalScrollIndicator={false}
          testID="screen-plan"
        >
          <Text variant="screen">{t('plan.title')}</Text>

          <View style={styles.tierRow}>
            <Text variant="label" tone="secondary">
              {t('plan.currentTier')}
            </Text>
            <Chip label={t('plan.free')} selected readOnly />
            <Chip label={t('plan.paid')} readOnly />
          </View>

          <Section title={t('plan.usageTitle')}>
            <View style={styles.meter}>
              <MeterRow
                label={t('plan.spent')}
                value={formatNumber(usage.data.spent)}
                color={colors.accent}
              />
              <MeterRow
                label={t('plan.reserved')}
                value={formatNumber(usage.data.reserved)}
                color={colors.warning}
              />
              <MeterRow
                label={t('plan.available')}
                value={formatNumber(usage.data.available)}
                color={colors.success}
              />
              <MeterRow
                label={t('plan.limit')}
                value={formatNumber(usage.data.allowanceLimit)}
                color={colors.inkSecondary}
              />
            </View>

            <Text variant="caption" tone="secondary">
              {t('plan.resetAt', { time: formatTime(usage.data.resetAt) })}
            </Text>

            {usage.data.isEstimate ? (
              <Text variant="caption" tone="warning">
                {t('plan.estimateNote')}
              </Text>
            ) : null}
          </Section>

          <Section title={t('plan.contextTitle')}>
            <Text variant="small" tone="secondary">
              {t('plan.contextBody')}
            </Text>
            <View style={styles.chipRow}>
              <Chip label={`${t('plan.free')} · ${t('plan.contextFree')}`} readOnly />
              <Chip label={`${t('plan.paid')} · ${t('plan.contextPaid')}`} readOnly />
            </View>
          </Section>

          <Section title={t('plan.compactionTitle')}>
            <Text variant="small" tone="secondary">
              {t('plan.compactionOff')}
            </Text>
            <Text variant="caption" tone="warning">
              {t('plan.compactionHonest')}
            </Text>
          </Section>

          <Section title={t('settings.plan')}>
            <Text variant="small" tone="secondary">
              {t('plan.upgradeNotice')}
            </Text>
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function MeterRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.meterRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.meterDot, { backgroundColor: color }]} />
      <Text variant="small" style={styles.meterLabel}>
        {label}
      </Text>
      <Text variant="small" weight="600">
        {value}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="title">{title}</Text>
      <View style={[styles.sectionBody, { borderTopColor: colors.line }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  backButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: space.lg,
    gap: space.lg,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  section: { gap: space.sm },
  sectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
    gap: space.sm,
  },
  meter: { gap: space.xs },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  meterDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  meterLabel: { flex: 1 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
});
