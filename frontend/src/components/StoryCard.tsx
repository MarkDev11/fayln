import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AssetImage } from './AssetImage';
import { Text } from './Text';

import { assetUri } from '@/domain/assets';
import { MEDIA_ASPECT } from '@/domain/media';
import { genreLabelKey, worldStatusLabelKey } from '@/domain/labels';
import type { WorldCatalogItem } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type StoryCardProps = {
  item: WorldCatalogItem;
  onPress: (worldId: string) => void;
  /**
   * Baris keterangan tambahan di bawah genre; dipakai rail "Baru Diperbarui"
   * untuk menampilkan `home.updatedAt` (SC-01.5). Tanpa nilai, kartu identik
   * dengan perilaku lama.
   */
  note?: string;
  /** Radius sampul. Beranda memakai 8; default mengikuti `radius.card`. */
  coverRadius?: number;
  /**
   * Dunia ini sedang dimainkan (punya perjalanan aktif, D-12). Menampilkan
   * penanda teks kecil. Sengaja BUKAN bilah/persen kemajuan: total beat tidak
   * ada, jadi penyebutnya akan dikarang.
   */
  playing?: boolean;
  testID?: string;
};

/**
 * Kartu katalog.
 *
 * Prioritas visual: sampul dan judul. Genre dan status hanya satu baris kecil agar
 * tidak bersaing dengan karya (D-02, NFR-16).
 */
export function StoryCard({ item, onPress, note, coverRadius, playing, testID }: StoryCardProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  /**
   * Daftar genre lengkap — dipakai HANYA untuk pembaca layar.
   *
   * Label tampilan dipadatkan (lihat di bawah), tetapi pembaca layar tetap
   * mendapat daftar utuhnya. Memakai versi padat di sana akan menghilangkan
   * informasi yang justru paling berguna tanpa penglihatan.
   */
  const fullGenreText = item.genres.map((genre) => t(genreLabelKey(genre))).join(', ');

  /**
   * Genre pertama + penanda sisa, bukan dua genre yang digabung lalu dipotong.
   *
   * Sebelumnya dua genre dirangkai dengan " • " dan dipotong `numberOfLines={1}`,
   * sehingga terputus di tengah kata ("Misteri • Kehidupan Ka…"). Bentuk ini
   * selalu muat dalam satu baris dan tidak pernah memutus kata.
   */
  const firstGenre = item.genres[0];
  const remainingGenres = item.genres.length - 1;
  const genreText = firstGenre
    ? `${t(genreLabelKey(firstGenre))}${remainingGenres > 0 ? ` +${String(remainingGenres)}` : ''}`
    : '';

  return (
    <Pressable
      testID={testID}
      onPress={() => onPress(item.worldId)}
      accessibilityRole="button"
      /*
       * Penanda "Sedang dimainkan" ikut diucapkan, bukan hanya diwarnai: keadaan
       * ini penting dan tidak boleh hanya tersampaikan lewat warna (NFR-12).
       */
      accessibilityLabel={`${item.title}. ${fullGenreText}. ${t(
        worldStatusLabelKey(item.status),
      )}${playing ? `. ${t('home.playingBadge')}` : ''}`}
      accessibilityHint={t('detail.startJourney')}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.88 : 1 }]}
    >
      {/*
        Placeholder tidak memakai `placeholderLabel` karena judul sudah tampil tepat
        di bawah kartu; mengulanginya membuat judul terbaca dua kali.
      */}
      <AssetImage
        uri={assetUri(item.coverAssetId)}
        accessibilityLabel={item.title}
        aspectRatio={MEDIA_ASPECT.portrait}
        contentFit="cover"
        style={coverRadius === undefined ? undefined : { borderRadius: coverRadius }}
      />
      <View style={styles.meta}>
        <Text variant="title" numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.genreLine}>
          {genreText}
        </Text>
        {playing ? (
          <Text
            variant="caption"
            tone="accent"
            numberOfLines={1}
            style={styles.playingLine}
            testID={testID ? `${testID}-playing` : undefined}
          >
            {t('home.playingBadge')}
          </Text>
        ) : null}
        {note ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {note}
          </Text>
        ) : null}
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
  playingLine: {
    marginTop: 2,
  },
  statusLine: {
    marginTop: 2,
  },
});
