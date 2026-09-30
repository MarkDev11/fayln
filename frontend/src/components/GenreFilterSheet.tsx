import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './Button';
import { Chip } from './Chip';
import { Text } from './Text';

import { genreLabelKey } from '@/domain/labels';
import { GENRES, type GenreId } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type GenreFilterSheetProps = {
  visible: boolean;
  selected: GenreId[];
  onToggle: (genre: GenreId) => void;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
};

/**
 * Lembar filter genre.
 *
 * Semantik gabungan adalah OR dan dinyatakan pada teks bantuan, supaya pemain tidak
 * menebak apakah pilihan bersifat "dan" atau "atau" (AC-02).
 */
export function GenreFilterSheet({
  visible,
  selected,
  onToggle,
  onReset,
  onApply,
  onClose,
}: GenreFilterSheetProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.bgSurface,
            borderColor: colors.line,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.line }]} />
        <Text variant="title">{t('home.filterTitle')}</Text>

        <View style={styles.chips}>
          {GENRES.map((genre) => (
            <Chip
              key={genre}
              label={t(genreLabelKey(genre))}
              selected={selected.includes(genre)}
              onPress={() => onToggle(genre)}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <Button label={t('common.reset')} onPress={onReset} variant="ghost" />
          <Button label={t('common.apply')} onPress={onApply} variant="primary" fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
