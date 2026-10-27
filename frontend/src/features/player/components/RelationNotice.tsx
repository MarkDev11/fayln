import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';

import type { SceneNotice } from '../types';

import { relationLabel, relationMilestone } from '@/domain/labels';
import type { RelationVocabularyEntry } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type RelationNoticeProps = {
  notice: SceneNotice;
  /** Nama tampil NPC; diambil dari definisi dunia, bukan dari payload AI. */
  npcName: string;
  onDismiss: () => void;
  /**
   * Kosakata hubungan versi dunia ini.
   *
   * Opsional supaya komponen tetap dapat dirender tanpa sesi (mis. dari riwayat
   * yang dipulihkan); saat itu label bawaan yang dipakai, bukan id mentah.
   */
  relationVocabulary?: readonly RelationVocabularyEntry[];
  testID?: string;
};

/**
 * Arah pencapaian, diterjemahkan menjadi TIGA sinyal sekaligus — ikon, kata,
 * dan warna. Warna tidak pernah jadi satu-satunya penanda (NFR-01); pemain
 * buta warna tetap membaca katanya, dan pembaca layar mendengarnya.
 */
const MILESTONE_PRESENTATION: Record<
  ReturnType<typeof relationMilestone>,
  { icon: IconName | null; textKey: 'notice.milestonePeak' | 'notice.milestoneImprovement' | 'notice.milestoneDetermination' | null }
> = {
  peak: { icon: 'star', textKey: 'notice.milestonePeak' },
  improvement: { icon: 'heart', textKey: 'notice.milestoneImprovement' },
  determination: { icon: 'eye', textKey: 'notice.milestoneDetermination' },
  neutral: { icon: null, textKey: null },
};

/**
 * Pemberitahuan perubahan hubungan.
 *
 * Muncul hanya setelah beat penyebabnya dibaca (AC-11) dan selalu menyertakan
 * alasan publik, sehingga pemain tahu MENGAPA hubungan berubah (FR-19).
 *
 * Pencapaian penting diberi TAMPILAN BERBEDA: mencapai puncak (posisi tertinggi
 * kosakata), membaik, atau menegang adalah momen yang layak dibedakan mata —
 * tetapi arahnya diturunkan dari DATA kosakata, bukan dikarang.
 */
export function RelationNotice({
  notice,
  npcName,
  onDismiss,
  relationVocabulary = [],
  testID,
}: RelationNoticeProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();

  const statusLabel = relationLabel(notice.status, relationVocabulary, locale, t);
  const milestone = relationMilestone(notice.status, notice.previousStatus, relationVocabulary);
  const presentation = MILESTONE_PRESENTATION[milestone];

  const borderColor =
    milestone === 'neutral'
      ? colors.accent
      : milestone === 'determination'
        ? colors.warning
        : colors.success;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${t('notice.relationChanged', { name: npcName, status: statusLabel })}. ${notice.reasonPublic}`}
      style={[styles.root, { backgroundColor: colors.bgSurface, borderColor }]}
    >
      <View style={styles.body}>
        {presentation.textKey ? (
          <View
            testID={`${testID ?? 'relation-notice'}-milestone`}
            style={styles.milestoneRow}
            accessible
          >
            {presentation.icon ? (
              <Icon
                name={presentation.icon}
                size={14}
                color={milestone === 'determination' ? colors.warning : colors.success}
              />
            ) : null}
            <Text
              variant="label"
              style={{
                color: milestone === 'determination' ? colors.warning : colors.success,
              }}
            >
              {t(presentation.textKey)}
            </Text>
          </View>
        ) : null}
        <Text variant="label" tone="accent">
          {t('notice.relationChanged', { name: npcName, status: statusLabel })}
        </Text>
        <Text variant="caption" tone="secondary">
          {notice.reasonPublic}
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('notice.dismiss')}
        hitSlop={10}
        style={styles.dismiss}
      >
        <Icon name="close" size={16} color={colors.inkSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: 2,
  },
  dismiss: {
    padding: space.xs,
  },
});
