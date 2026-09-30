import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';

import {
  REPORT_CATEGORIES,
  type ReportCategory,
  type ReportInput,
  type ReportResult,
} from '@/data/gateway';
import type { TranslationKey } from '@/i18n';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const DETAIL_MAX = 600;

const CATEGORY_LABEL_KEY: Record<ReportCategory, TranslationKey> = {
  story: 'report.category.story',
  character: 'report.category.character',
  asset: 'report.category.asset',
  relationship: 'report.category.relationship',
  content: 'report.category.content',
  technical: 'report.category.technical',
};

export type ReportSheetProps = {
  visible: boolean;
  /** Konteks opsional. Hanya disertakan bila diberikan pemanggil. */
  journeyId?: string;
  beatId?: string;
  /** Mengirim laporan; mengembalikan hasil dari gateway. */
  onSubmit: (input: Omit<ReportInput, 'clientOperationId'>) => Promise<ReportResult>;
  onClose: () => void;
  testID?: string;
};

/**
 * Lembar pelaporan (SC-22).
 *
 * Prinsip privasi: isi cerita TIDAK dikirim otomatis. Pemain memilih kategori dan
 * boleh menulis keterangan sendiri; itulah satu-satunya yang dilaporkan (NFR-10).
 */
export function ReportSheet({
  visible,
  journeyId,
  beatId,
  onSubmit,
  onClose,
  testID,
}: ReportSheetProps) {
  const { colors, scaled } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [detail, setDetail] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [failed, setFailed] = useState(false);

  const reset = () => {
    setCategory(null);
    setDetail('');
    setTouched(false);
    setResult(null);
    setFailed(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setTouched(true);
    setFailed(false);
    if (!category) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await onSubmit({
        category,
        detail: detail.trim(),
        ...(journeyId ? { journeyId } : null),
        ...(beatId ? { beatId } : null),
      });
      setResult(response);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityViewIsModal
      testID={testID}
    >
      <Pressable
        style={styles.backdrop}
        onPress={handleClose}
        accessibilityLabel={t('report.cancel')}
      />
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
          <Text variant="title">{t('report.title')}</Text>
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={10}
            style={styles.close}
          >
            <Icon name="close" size={20} color={colors.inkSecondary} />
          </Pressable>
        </View>

        {result ? (
          <View style={styles.doneBlock}>
            <Text variant="body">{t('report.sent')}</Text>
            {result.localOnly ? (
              <Text variant="caption" tone="warning">
                {t('report.simulatorNotice')}
              </Text>
            ) : null}
            <Button label={t('common.close')} onPress={handleClose} fullWidth />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text variant="caption" tone="secondary">
              {t('report.intro')}
            </Text>

            <View style={styles.field}>
              <Text variant="label">{t('report.category')}</Text>
              <View style={styles.chips}>
                {REPORT_CATEGORIES.map((item) => (
                  <Chip
                    key={item}
                    label={t(CATEGORY_LABEL_KEY[item])}
                    selected={category === item}
                    onPress={() => setCategory(item)}
                    testID={`report-category-${item}`}
                  />
                ))}
              </View>
              {touched && !category ? (
                <Text variant="caption" tone="danger">
                  {t('report.categoryRequired')}
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text variant="label">
                {t('report.detail')} ({t('report.detailOptional')})
              </Text>
              <TextInput
                value={detail}
                onChangeText={setDetail}
                placeholder={t('report.detailPlaceholder')}
                placeholderTextColor={colors.inkSecondary}
                accessibilityLabel={t('report.detail')}
                multiline
                maxLength={DETAIL_MAX}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.bgSurface,
                    borderColor: colors.line,
                    color: colors.inkPrimary,
                    fontSize: scaled(15),
                  },
                ]}
                testID="report-detail"
              />
            </View>

            <Text variant="caption" tone="secondary">
              {t('report.privacy')}
            </Text>

            {failed ? (
              <Text variant="caption" tone="danger">
                {t('report.failed')}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Button label={t('report.cancel')} onPress={handleClose} variant="ghost" />
              <View style={styles.primarySlot}>
                <Button
                  label={t('report.submit')}
                  onPress={() => {
                    void handleSubmit();
                  }}
                  loading={submitting}
                  disabled={submitting}
                  fullWidth
                  testID="report-submit"
                />
              </View>
            </View>
          </ScrollView>
        )}
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
    maxHeight: '88%',
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
  content: {
    gap: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  doneBlock: {
    gap: space.md,
    paddingVertical: space.lg,
  },
  field: {
    gap: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  input: {
    minHeight: 88,
    maxHeight: 160,
    padding: space.md,
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  primarySlot: {
    flex: 1,
  },
});
