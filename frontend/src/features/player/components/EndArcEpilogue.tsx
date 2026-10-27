import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';

import { relationLabel } from '@/domain/labels';
import type { Beat, EndArcEvent, RelationEntry, RelationVocabularyEntry } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type EndArcEpilogueProps = {
  /** Alasan penutup dari event `endArc` — sudah versi publik dari server. */
  reasonPublic: string;
  /** Hubungan akhir per NPC, dari state yang sudah DIBACA pemain. */
  relations: { npcId: string; name: string; status: RelationEntry['status'] }[];
  relationVocabulary?: readonly RelationVocabularyEntry[];
  onNewJourney: () => void;
  testID?: string;
};

/**
 * Epilog — kartu penutup ketika beat `endArc` sudah sampai ke pemain.
 *
 * Menampilkan alasan penutup, hubungan akhir setiap tokoh (label lewat
 * kosakata dunia), dan satu tombol utama menuju perjalanan baru di dunia yang
 * sama. Tombolnya SATU dan jelas: cerita yang sudah selesai tidak boleh
 * meninggalkan pemain di layar mati tanpa arah.
 */
export function EndArcEpilogue({
  reasonPublic,
  relations,
  relationVocabulary = [],
  onNewJourney,
  testID,
}: EndArcEpilogueProps) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      style={[styles.root, { backgroundColor: 'rgba(0, 0, 0, 0.78)', borderColor: colors.accent }]}
    >
      <Text variant="title" tone="onMedia">
        {t('endArc.title')}
      </Text>
      <Text variant="small" tone="onMedia">
        {reasonPublic}
      </Text>

      {relations.length > 0 ? (
        <View style={styles.relationsBlock}>
          <Text variant="caption" tone="onMedia">
            {t('endArc.finalRelations')}
          </Text>
          {relations.map((item) => (
            <View key={item.npcId} style={styles.relationRow}>
              <Text variant="small" tone="onMedia">
                {item.name}
              </Text>
              <Text
                variant="small"
                weight="600"
                tone="onMedia"
                testID={`end-arc-relation-${item.npcId}`}
              >
                {relationLabel(item.status, relationVocabulary, locale, t)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Button label={t('endArc.newJourney')} onPress={onNewJourney} testID="end-arc-new-journey" />
    </View>
  );
}

/**
 * Event `endArc` yang SUDAH DIPRESENTASIKAN (indeks < cursor), yang terakhir
 * bila ada lebih dari satu.
 *
 * Fungsi murni supaya aturannya dapat diuji tanpa React: endArc adalah event
 * instan yang dilewati `consume()`, jadi satu-satunya bukti bahwa "epilog sudah
 * sampai ke pemain" adalah posisi baca yang telah MELEWATI beat-nya. Beat pada
 * indeks >= cursor belum dibaca dan tidak boleh memunculkan epilog (FR-56).
 *
 * BUKTI MUTASI: ganti `<` menjadi `<=` di sini, lalu uji "beat yang belum
 * dibaca tidak memunculkan epilog" memerah — epilog muncul satu beat lebih
 * awal, sebelum pemain benar-benar sampai di penutupnya.
 */
export function findPresentedEndArc(beats: Beat[], cursor: number): EndArcEvent | null {
  const limit = Math.min(Math.max(0, cursor), beats.length);
  for (let index = limit - 1; index >= 0; index -= 1) {
    const beat = beats[index];
    if (beat?.event.type === 'endArc') {
      return beat.event;
    }
  }
  return null;
}

const styles = StyleSheet.create({
  root: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  relationsBlock: {
    gap: space.xs,
  },
  relationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
});
