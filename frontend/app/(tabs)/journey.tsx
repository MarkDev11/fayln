import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StateView } from '@/components/StateView';
import { Text } from '@/components/Text';

import { useJourneys } from '@/data/queries';
import { JourneyCard } from '@/features/journeys/JourneyCard';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Tab Perjalanan.
 *
 * Menampilkan seluruh perjalanan milik pemain, terbaru dimainkan lebih dahulu.
 * Menekan kartu membuka detail, bukan langsung memutar cerita — pemain memilih
 * dengan sadar sebelum melanjutkan atau menghapus.
 */
export default function JourneyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useI18n();

  const journeys = useJourneys();

  const openDetail = useCallback(
    (journeyId: string) => {
      router.push({ pathname: '/journey/[journeyId]', params: { journeyId } });
    },
    [router],
  );

  const goHome = useCallback(() => {
    router.push('/');
  }, [router]);

  const items = journeys.data ?? [];
  const isInitialLoading = journeys.isLoading && !journeys.data;

  return (
    <Screen testID="screen-journey">
      <Text variant="screen">{t('journey.title')}</Text>

      <View
        style={[styles.note, { backgroundColor: colors.bgMuted, borderColor: colors.line }]}
        accessible
      >
        <Text variant="caption" tone="secondary">
          {t('journey.notice')}
        </Text>
      </View>

      {isInitialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="small" tone="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : journeys.isError ? (
        <View style={styles.center}>
          <StateView
            kind="error"
            title={t('state.errorTitle')}
            body={t('state.errorBody')}
            actionLabel={t('common.retry')}
            onAction={() => {
              void journeys.refetch();
            }}
            testID="journey-error"
          />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <StateView
            kind="empty"
            title={t('journey.emptyTitle')}
            body={t('journey.emptyBody')}
            actionLabel={t('journey.emptyAction')}
            onAction={goHome}
            testID="journey-empty"
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.journeyId}
          renderItem={({ item }) => (
            <JourneyCard journey={item} onPress={openDetail} testID={`journey-${item.journeyId}`} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={journeys.isRefetching}
              onRefresh={() => {
                void journeys.refetch();
              }}
              tintColor={colors.accent}
            />
          }
          testID="journey-list"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  list: {
    paddingTop: space.lg,
    gap: space.md,
    paddingBottom: space.xxl,
  },
});
