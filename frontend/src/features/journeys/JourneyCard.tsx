import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AssetImage } from '@/components/AssetImage';
import { Chip } from '@/components/Chip';
import { Text } from '@/components/Text';

import { assetUri } from '@/domain/assets';
import { MEDIA_ASPECT } from '@/domain/media';
import type { JourneySummary } from '@/domain/types';
import { formatRelativeDay, useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * `manage` — tab Perjalanan: mengelola, membuka detail.
 * `resume`  — Beranda: melanjutkan, membuka pemutar (SC-01.7). Versi ini tidak
 * memuat baris tokoh karena itu milik detail perjalanan (docs/05 §8.4).
 */
export type JourneyCardMode = 'manage' | 'resume';

export type JourneyCardProps = {
  journey: JourneySummary;
  onPress: (journeyId: string) => void;
  mode?: JourneyCardMode;
  /**
   * Label status dunia hasil `worldStatusLabelKey()`. Beranda mengisinya hanya
   * bila status bukan `published`, dan wajib berupa teks bukan warna (NFR-12).
   */
  worldStatusLabel?: string;
  testID?: string;
};

/**
 * Kartu perjalanan tersimpan.
 *
 * Menampilkan cover, judul dunia, kapan terakhir dimainkan, dan penanda bila masih
 * ada adegan yang belum dibaca. Tidak menampilkan status hubungan — itu ada di
 * detail perjalanan, tempat pemain sudah memilih untuk melihatnya.
 */
export function JourneyCard({
  journey,
  onPress,
  mode = 'manage',
  worldStatusLabel,
  testID,
}: JourneyCardProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();

  const isResume = mode === 'resume';
  const relativeDay = formatRelativeDay(journey.updatedAt, locale);
  const lastPlayed = t('journey.lastPlayed', { when: relativeDay });
  const progress = t('journey.progress', {
    beat: journey.lastReadSequence,
    decisions: journey.decisionCount,
  });

  const accessibilityLabel = isResume
    ? [
        journey.worldTitle,
        progress,
        lastPlayed,
        // Keberadaan lencana ikut disebut, bukan hanya warna (docs/05 §8.9).
        ...(journey.hasUnreadBeats ? [t('journey.unreadBadge')] : []),
      ].join('. ')
    : `${journey.worldTitle}. ${lastPlayed}. ${t('journey.personaLabel', {
        name: journey.personaName,
      })}`;

  return (
    <Pressable
      testID={testID}
      onPress={() => onPress(journey.journeyId)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={
        isResume
          ? t('journey.continueAction', { world: journey.worldTitle })
          : t('journey.openDetail', { world: journey.worldTitle })
      }
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.bgSurface,
          borderColor: colors.line,
          opacity: pressed ? 0.9 : 1,
        },
        isResume ? styles.cardResume : null,
      ]}
    >
      <AssetImage
        uri={assetUri(journey.coverAssetId)}
        accessibilityLabel={journey.worldTitle}
        aspectRatio={MEDIA_ASPECT.portrait}
        contentFit="cover"
        style={[styles.cover, isResume ? styles.coverResume : null]}
      />

      <View style={styles.body}>
        <Text variant="title" numberOfLines={2}>
          {journey.worldTitle}
        </Text>

        {isResume ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {`${progress} • ${relativeDay}`}
          </Text>
        ) : (
          <>
            <Text variant="caption" tone="secondary">
              {t('journey.personaLabel', { name: journey.personaName })}
            </Text>
            <Text variant="caption" tone="secondary">
              {lastPlayed}
            </Text>
            <Text variant="caption" tone="secondary">
              {progress}
            </Text>
          </>
        )}

        {worldStatusLabel ? (
          <Text variant="caption" tone="warning" numberOfLines={1}>
            {worldStatusLabel}
          </Text>
        ) : null}

        {journey.hasUnreadBeats ? (
          <View style={styles.badgeRow}>
            <Chip
              label={t('journey.unreadBadge')}
              selected
              readOnly
              tile={isResume}
              dense={isResume}
              check={isResume}
            />
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
  cardResume: {
    borderRadius: radius.tile,
    borderWidth: 1,
  },
  cover: {
    width: 84,
  },
  coverResume: {
    borderRadius: radius.tile,
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
