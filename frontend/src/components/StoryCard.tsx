import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AssetImage } from './AssetImage';
import { Text } from './Text';

import { genreLabelKey, worldStatusLabelKey } from '@/domain/labels';
import type { WorldCatalogItem } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type StoryCardProps = {
  item: WorldCatalogItem;
  onPress: (worldId: string) => void;
  testID?: string;
};

/**
 * Kartu katalog.
 *
 * Prioritas visual: sampul dan judul. Genre dan status hanya satu baris kecil agar
 * tidak bersaing dengan karya (D-02, NFR-16).
 */
export function StoryCard({ item, onPress, testID }: StoryCardProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const genreText = item.genres.slice(0, 2).map((genre) => t(genreLabelKey(genre))).join(' • ');

  return (
    <Pressable
      testID={testID}
      onPress={() => onPress(item.worldId)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${genreText}. ${t(worldStatusLabelKey(item.status))}`}
      accessibilityHint={t('detail.startJourney')}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1 }]}
    >
      {/*
        Placeholder tidak memakai `placeholderLabel` karena judul sudah tampil tepat
        di bawah kartu; mengulanginya membuat judul terbaca dua kali.
      */}
      <AssetImage
        uri={`asset://${item.coverAssetId}`}
        accessibilityLabel={item.title}
        aspectRatio={3 / 4}
      />
      <View style={styles.meta}>
        <Text variant="title" numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.genreLine}>
          {genreText}
        </Text>
        {item.status !== 'published' ? (
          <Text variant="caption" tone="warning" style={styles.statusLine}>
            {t(worldStatusLabelKey(item.status))}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  meta: {
    paddingTop: space.sm,
    gap: 2,
  },
  genreLine: {
    marginTop: 2,
  },
  statusLine: {
    marginTop: 2,
  },
});
