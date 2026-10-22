import React, { useMemo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Beat } from '@/domain/types';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';

import { relationLabel } from '@/domain/labels';
import type { RelationVocabularyEntry } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type LogDrawerProps = {
  visible: boolean;
  /**
   * Seluruh beat yang sudah di-commit.
   *
   * Sengaja menerima `beats` + `cursor`, bukan `PlaybackState`, supaya layar lain
   * seperti detail Perjalanan dapat menampilkan riwayat tanpa harus menjalankan
   * pemutar penuh.
   */
  beats: Beat[];
  /** Jumlah beat yang benar-benar sudah dibaca; sisanya tidak ditampilkan. */
  cursor: number;
  npcNameById: Record<string, string>;
  onClose: () => void;
  /**
   * Kosakata hubungan versi dunia ini.
   *
   * Opsional supaya komponen tetap dapat dirender tanpa sesi (mis. dari riwayat
   * yang dipulihkan); saat itu label bawaan yang dipakai, bukan id mentah.
   */
  relationVocabulary?: readonly RelationVocabularyEntry[];
  testID?: string;
};

type LogEntry = {
  key: string;
  turnId: string;
  kind: 'narrate' | 'say' | 'playerInput' | 'system';
  speaker: string | null;
  text: string;
};

/**
 * Riwayat baca-saja.
 *
 * Hanya memuat beat yang SUDAH dibaca pemain (`beats.slice(0, cursor)`), sehingga
 * tidak membocorkan kelanjutan yang belum tayang (FR-56). Membuka riwayat tidak
 * memanggil AI dan tidak mengubah hubungan (FR-22).
 */
export function LogDrawer({
  visible,
  beats,
  cursor,
  npcNameById,
  onClose,
  relationVocabulary = [],
  testID,
}: LogDrawerProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const entries = useMemo<LogEntry[]>(() => {
    const result: LogEntry[] = [];
    const limit = Math.min(Math.max(0, cursor), beats.length);
    const presented = beats.slice(0, limit);

    for (const beat of presented) {
      const event = beat.event;
      if (event.type === 'narrate') {
        result.push({
          key: beat.beatId,
          turnId: beat.turnId,
          kind: 'narrate',
          speaker: null,
          text: event.text,
        });
      } else if (event.type === 'say') {
        result.push({
          key: beat.beatId,
          turnId: beat.turnId,
          kind: 'say',
          speaker: npcNameById[event.npcId] ?? t('log.unknownSpeaker'),
          text: event.text,
        });
      } else if (event.type === 'playerInput') {
        result.push({
          key: beat.beatId,
          turnId: beat.turnId,
          kind: 'playerInput',
          speaker: t('log.you'),
          text: event.text,
        });
      } else if (event.type === 'relationshipDelta') {
        const name = npcNameById[event.npcId] ?? t('log.unknownSpeaker');
        result.push({
          key: `${beat.beatId}-system`,
          turnId: beat.turnId,
          kind: 'system',
          speaker: null,
          text: t('notice.relationChanged', {
            name,
            status: relationLabel(event.status, relationVocabulary, locale, t),
          }),
        });
      }
    }

    // Tampilkan giliran terbaru lebih dulu, tetapi pertahankan percakapan
    // kronologis di dalam setiap giliran: masukan pemain sebelum jawabannya.
    const groups: LogEntry[][] = [];
    for (const entry of result) {
      const currentGroup = groups[groups.length - 1];
      if (currentGroup?.[0]?.turnId === entry.turnId) {
        currentGroup.push(entry);
      } else {
        groups.push([entry]);
      }
    }
    return groups.reverse().flat();
  }, [beats, cursor, npcNameById, t]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
      testID={testID}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('log.close')} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.bgApp,
            borderColor: colors.line,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.line }]} />

        <View style={styles.header}>
          <Text variant="title">{t('log.title')}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('log.close')}
            hitSlop={10}
            style={styles.close}
          >
            <Icon name="close" size={20} color={colors.inkSecondary} />
          </Pressable>
        </View>

        <Text variant="caption" tone="secondary" style={styles.note}>
          {t('log.readOnly')}
        </Text>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="small" tone="secondary" center>
              {t('log.empty')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews
            renderItem={({ item }) => (
              <View
                testID={`log-entry-${item.key}`}
                style={[
                  styles.entry,
                  item.kind === 'system' || item.kind === 'playerInput'
                    ? { backgroundColor: colors.bgMuted, borderColor: colors.accent }
                    : { borderColor: colors.line },
                ]}
              >
                {item.kind === 'system' ? (
                  <Text variant="caption" tone="accent">
                    {item.text}
                  </Text>
                ) : (
                  <>
                    <Text variant="caption" tone={item.kind === 'playerInput' ? 'accent' : 'secondary'}>
                      {item.kind === 'narrate'
                        ? t('log.narration')
                        : item.kind === 'playerInput'
                          ? t('log.you')
                          : (item.speaker ?? '')}
                    </Text>
                    <Text
                      variant="body"
                      style={
                        item.kind === 'narrate' || item.kind === 'playerInput'
                          ? styles.narration
                          : undefined
                      }
                    >
                      {item.text}
                    </Text>
                  </>
                )}
              </View>
            )}
          />
        )}

        <View style={styles.footer}>
          <Button label={t('common.close')} onPress={onClose} variant="secondary" fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    flex: 1,
    marginTop: 72,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    padding: space.xs,
  },
  note: {
    marginTop: space.xs,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingTop: space.md,
    gap: space.sm,
    paddingBottom: space.lg,
  },
  entry: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  narration: {
    fontStyle: 'italic',
  },
  footer: {
    paddingTop: space.sm,
  },
});
