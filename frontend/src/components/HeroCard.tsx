import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AssetImage } from './AssetImage';
import { Text } from './Text';

import { assetUri } from '@/domain/assets';
import { MEDIA_ASPECT } from '@/domain/media';
import { genreLabelKey } from '@/domain/labels';
import type { WorldCatalogItem } from '@/domain/types';
import { useI18n } from '@/i18n';
import { withAlpha } from '@/theme/gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type HeroCardProps = {
  item: WorldCatalogItem;
  /** Posisi kartu ini di antara dunia unggulan, mulai dari 0. */
  index: number;
  /** Jumlah dunia unggulan; dipakai label posisi. */
  total: number;
  onOpen: (worldId: string) => void;
  testID?: string;
};

/**
 * Hero dunia unggulan (SC-01.2, docs/05 §8.2).
 *
 * Isi dibatasi: judul, genre, dan satu tombol "Mulai". Tidak ada sinopsis,
 * kutipan, atau janji bahwa cerita akan mengikuti dunia ini — mesin cerita
 * masih simulator deterministik yang mengabaikan dunia.
 *
 * Struktur aksesibilitas: SELURUH kartu adalah satu `Pressable`. Pil "Mulai"
 * hanya penanda visual dan disembunyikan dari pembaca layar. Menjadikannya
 * kontrol kedua menuju tujuan yang sama akan membuat pembaca layar
 * mengumumkannya dua kali, dan menyisakan area judul yang tidak dapat ditekan
 * (SC-01.8).
 */
export function HeroCard({ item, index, total, onOpen, testID }: HeroCardProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  // Satu baris, maksimal dua genre; sisanya dielipsis (docs/05 §8.2).
  const genreText = item.genres.slice(0, 2).map((genre) => t(genreLabelKey(genre))).join(' • ');
  const dotsLabel = t('home.heroDotsLabel', { index: index + 1, total });
  const baseTestID = testID ?? `hero-${item.worldId}`;

  return (
    <Pressable
      testID={baseTestID}
      onPress={() => onOpen(item.worldId)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${genreText}. ${dotsLabel}`}
      accessibilityHint={t('home.openWorldHint')}
      style={styles.card}
    >
      {/*
        Gradasi memudarkan bagian bawah gambar ke warna latar, sehingga gambar
        larut ke halaman dan teks di bawahnya duduk di latar yang sama — tidak
        ada tepi, tidak ada panel, tidak ada garis.

        Teks SENGAJA tetap di aliran normal, bukan diposisikan absolut di atas
        gambar. Saat absolut, tinggi kartu hanya bergantung pada gambar, dan itu
        memutus perhitungan lebar→tinggi di dalam ScrollView mendatar sehingga
        kartu menyusut jadi nol.
      */}
      <View testID={`${baseTestID}-media`} style={styles.media} pointerEvents="none">
        <AssetImage
          uri={assetUri(item.coverAssetId)}
          accessibilityLabel={item.title}
          aspectRatio={MEDIA_ASPECT.landscape}
          contentFit="cover"
          style={styles.image}
        />
        <LinearGradient
          colors={[withAlpha(colors.bgApp, 0), colors.bgApp]}
          locations={[0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.content}>
        <Text variant="small" tone="secondary" numberOfLines={1}>
          {genreText}
        </Text>
        <Text variant="display" tone="primary" numberOfLines={2}>
          {item.title}
        </Text>

        {/*
          Penanda visual, bukan kontrol. Seluruh kartu sudah menjadi satu target
          ketuk, dan kartu itu punya `accessibilityLabel` eksplisit — sehingga
          isi di dalamnya tidak diumumkan terpisah dan tidak ada tujuan yang
          terucap dua kali (SC-01.8).
        */}
        <View
          testID={`${baseTestID}-start`}
          style={[styles.startPill, { backgroundColor: colors.accent }]}
        >
          <Text variant="label" tone="inverse">
            {t('home.heroStart')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * Tanpa border dan tanpa radius.
   *
   * Permukaan tidak lagi dibingkai: gambar memudar ke warna latar lewat gradasi,
   * sehingga batas kartu tidak terlihat sama sekali.
   */
  card: {
    overflow: 'hidden',
  },
  media: {
    width: '100%',
  },
  image: {
    borderRadius: 0,
    borderWidth: 0,
  },
  /** Teks mengalir di bawah gambar, di latar yang sama dengan halaman. */
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  /**
   * Pil "Mulai" — penanda visual, bukan kontrol. Lebar penuh supaya tidak ada
   * ruang mati di antara tombol dan indikator titik.
   */
  startPill: {
    marginTop: space.md,
    minHeight: 48,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  /** Titik indikator TIDAK lagi di sini — dipindah ke Beranda agar dapat diklik. */
});
