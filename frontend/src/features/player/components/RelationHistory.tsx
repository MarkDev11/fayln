import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { relationLabel } from '@/domain/labels';
import type { Beat, RelationVocabularyEntry } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type RelationHistoryProps = {
  /**
   * Seluruh beat yang sudah di-commit.
   *
   * Menerima `beats` + `cursor` (bukan `PlaybackState`) dengan alasan yang sama
   * dengan `LogDrawer`: layar lain seperti detail Perjalanan dapat menampilkan
   * garis waktu tanpa menjalankan pemutar penuh.
   */
  beats: Beat[];
  /** Hanya beat SEBELUM posisi baca yang boleh tampil (FR-56). */
  cursor: number;
  npcNameById: Record<string, string>;
  relationVocabulary?: readonly RelationVocabularyEntry[];
  testID?: string;
};

type HistoryEntry = {
  key: string;
  name: string;
  statusLabel: string;
  reasonPublic: string;
  turn: number;
};

/**
 * Garis waktu hubungan — "Bagaimana kami sampai di sini".
 *
 * Menyaring beat `relationshipDelta` dari beat yang SUDAH DIBACA saja, lalu
 * merendernya KRONOLOGIS: siapa, statusnya jadi apa, dan alasan publiknya.
 * Beats yang belum dibaca tidak pernah bocor ke sini (FR-56) — batasnya satu
 * mekanisme dengan LogDrawer: `beats.slice(0, cursor)`.
 *
 * PAIR RULE — kosong berarti TIDAK ADA elemen. Bentuk yang menampilkan judul
 * bagian tanpa isi lebih buruk daripada tidak menampilkan apa pun: judul kosong
 * terbaca seperti janji yang tidak ditepati. Bila tidak ada satu pun perubahan
 * hubungan yang sudah dibaca, komponen ini merender `null`.
 */
export function RelationHistory({
  beats,
  cursor,
  npcNameById,
  relationVocabulary = [],
  testID,
}: RelationHistoryProps) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();

  const entries = useMemo<HistoryEntry[]>(() => {
    const limit = Math.min(Math.max(0, cursor), beats.length);
    const presented = beats.slice(0, limit);

    // Ordinal giliran = urutan kemunculan PERTAMA turnId pada beat yang sudah
    // dibaca. `sequence` tidak dipakai: ia dimulai ulang di setiap turn.
    const turnOrdinal = new Map<string, number>();
    let nextOrdinal = 0;

    const result: HistoryEntry[] = [];
    for (const beat of presented) {
      if (!turnOrdinal.has(beat.turnId)) {
        nextOrdinal += 1;
        turnOrdinal.set(beat.turnId, nextOrdinal);
      }
      const event = beat.event;
      if (event.type === 'relationshipDelta') {
        result.push({
          key: beat.beatId,
          name: npcNameById[event.npcId] ?? t('log.unknownSpeaker'),
          statusLabel: relationLabel(event.status, relationVocabulary, locale, t),
          reasonPublic: event.reasonPublic,
          turn: turnOrdinal.get(beat.turnId) as number,
        });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beats, cursor, npcNameById, relationVocabulary, locale, t]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <View testID={testID} style={styles.root}>
      <Text variant="caption" tone="secondary">
        {t('log.historyTitle')}
      </Text>
      {entries.map((entry) => (
        <View
          key={entry.key}
          testID={`relation-history-${entry.key}`}
          style={[styles.entry, { backgroundColor: colors.bgMuted, borderColor: colors.line }]}
        >
          <View style={styles.titleRow}>
            <Text variant="small" weight="600">
              {entry.name} · {entry.statusLabel}
            </Text>
            <Text variant="caption" tone="secondary">
              {t('log.turnOrdinal', { turn: entry.turn })}
            </Text>
          </View>
          <Text variant="caption" tone="secondary">
            {entry.reasonPublic}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.sm,
  },
  entry: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
});
