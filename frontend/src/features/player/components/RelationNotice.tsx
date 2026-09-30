import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';

import type { SceneNotice } from '../types';

import { relationLabelKey } from '@/domain/labels';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type RelationNoticeProps = {
  notice: SceneNotice;
  /** Nama tampil NPC; diambil dari definisi dunia, bukan dari payload AI. */
  npcName: string;
  onDismiss: () => void;
  testID?: string;
};

/**
 * Pemberitahuan perubahan hubungan.
 *
 * Muncul hanya setelah beat penyebabnya dibaca (AC-11) dan selalu menyertakan
 * alasan publik, sehingga pemain tahu MENGAPA hubungan berubah (FR-19).
 */
export function RelationNotice({ notice, npcName, onDismiss, testID }: RelationNoticeProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const statusLabel = t(relationLabelKey(notice.status));

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${t('notice.relationChanged', { name: npcName, status: statusLabel })}. ${notice.reasonPublic}`}
      style={[styles.root, { backgroundColor: colors.bgSurface, borderColor: colors.accent }]}
    >
      <View style={styles.body}>
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
  dismiss: {
    padding: space.xs,
  },
});
