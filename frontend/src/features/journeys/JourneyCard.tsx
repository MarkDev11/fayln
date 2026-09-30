import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AssetImage } from '@/components/AssetImage';
import { Chip } from '@/components/Chip';
import { Text } from '@/components/Text';

import type { JourneySummary } from '@/domain/types';
import { formatRelativeDay, useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type JourneyCardProps = {
  journey: JourneySummary;
  onPress: (journeyId: string) => void;
  testID?: string;
};

/**
 * Kartu perjalanan tersimpan.
 *
 * Menampilkan cover, judul dunia, kapan terakhir dimainkan, dan penanda bila masih
 * ada adegan yang belum dibaca. Tidak menampilkan status hubungan — itu ada di
 * detail perjalanan, tempat pemain sudah memilih untuk melihatnya.
 */
export function JourneyCard({ journey, onPress, testID }: JourneyCardProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();

  const lastPlayed = t('journey.lastPlayed', {
    when: formatRelativeDay(journey.updatedAt, locale),
  });

  return (
    <Pressable
      testID={testID}
      onPress={() => onPress(journey.journeyId)}
      accessibilityRole="button"
      accessibilityLabel={`${journey.worldTitle}. ${lastPlayed}. ${t('journey.personaLabel', {
        name: journey.personaName,
      })}`}
      accessibilityHint={t('journey.openDetail', { world: journey.worldTitle })}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.bgSurface,
          borderColor: colors.line,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <AssetImage
        uri={`asset://${journey.coverAssetId}`}
        accessibilityLabel={journey.worldTitle}
        aspectRatio={3 / 4}
        style={styles.cover}
      />

      <View style={styles.body}>
        <Text variant="title" numberOfLines={2}>
          {journey.worldTitle}
        </Text>
        <Text variant="caption" tone="secondary">
          {t('journey.personaLabel', { name: journey.personaName })}
        </Text>
        <Text variant="caption" tone="secondary">
          {lastPlayed}
        </Text>
        <Text variant="caption" tone="secondary">
          {t('journey.progress', {
            beat: journey.lastReadSequence,
            decisions: journey.decisionCount,
          })}
        </Text>

        {journey.hasUnreadBeats ? (
          <View style={styles.badgeRow}>
            <Chip label={t('journey.unreadBadge')} selected readOnly />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cover: {
    width: 84,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  badgeRow: {
    marginTop: space.sm,
    flexDirection: 'row',
  },
});
