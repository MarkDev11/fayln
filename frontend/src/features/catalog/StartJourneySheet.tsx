import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Text } from '@/components/Text';

import type { ResponseLocale } from '@/domain/types';
import { NAME_MAX, validateAge, validateName } from '@/domain/profile';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type PersonaDraft = {
  name: string;
  age: number;
  responseLocale: ResponseLocale;
};

export type StartJourneySheetProps = {
  visible: boolean;
  worldTitle: string;
  /** Bahasa respons yang didukung dunia; di luar ini tidak dapat dipilih. */
  supportedLocales: ResponseLocale[];
  /** Nilai awal dari profil Pengaturan; boleh kosong bila belum diisi. */
  initialName?: string;
  initialAge?: number | null;
  initialResponseLocale?: ResponseLocale;
  submitting?: boolean;
  /** Pesan galat dari percobaan sebelumnya; draft tetap dipertahankan. */
  errorMessage?: string | null;
  onConfirm: (persona: PersonaDraft) => void;
  onCancel: () => void;
  testID?: string;
};

/**
 * Penetapan persona (SC-05).
 *
 * Lembar ini hanya muncul bila profil di Pengaturan belum lengkap. Nilainya
 * di-snapshot saat perjalanan dibuat, sehingga mengubah profil nanti tidak menulis
 * ulang cerita yang sudah berjalan (D-09, FR-10).
 */
export function StartJourneySheet({
  visible,
  worldTitle,
  supportedLocales,
  initialName = '',
  initialAge = null,
  initialResponseLocale,
  submitting = false,
  errorMessage = null,
  onConfirm,
  onCancel,
  testID,
}: StartJourneySheetProps) {
  const { colors, scaled } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const fallbackLocale: ResponseLocale = supportedLocales.includes(locale)
    ? (locale as ResponseLocale)
    : (supportedLocales[0] ?? 'id-ID');

  const [name, setName] = useState(initialName);
  const [age, setAge] = useState(initialAge === null ? '' : String(initialAge));
  const [responseLocale, setResponseLocale] = useState<ResponseLocale>(
    initialResponseLocale ?? fallbackLocale,
  );
  const [touched, setTouched] = useState(false);

  /* Isi ulang saat nilai awal berubah, misalnya profil baru selesai dimuat. */
  useEffect(() => {
    setName(initialName);
    setAge(initialAge === null ? '' : String(initialAge));
  }, [initialName, initialAge]);

  const nameError = validateName(name);
  const ageError = validateAge(age);
  const hasError = nameError !== null || ageError !== null;

  const handleConfirm = () => {
    setTouched(true);
    if (hasError) {
      return;
    }
    onConfirm({ name: name.trim(), age: Number.parseInt(age, 10), responseLocale });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      accessibilityViewIsModal
      testID={testID}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        accessibilityLabel={t('persona.cancel')}
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

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="screen">{t('persona.title')}</Text>
          <Text variant="small" tone="secondary">
            {t('persona.subtitle')}
          </Text>
          <Text variant="caption" tone="secondary">
            {worldTitle}
          </Text>
          <Text variant="caption" tone="accent">
            {t('persona.saveNotice')}
          </Text>

          <View style={styles.field}>
            <Text variant="label">{t('persona.nameLabel')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('persona.namePlaceholder')}
              placeholderTextColor={colors.inkSecondary}
              accessibilityLabel={t('persona.nameLabel')}
              maxLength={NAME_MAX + 10}
              style={[
                styles.input,
                {
                  backgroundColor: colors.bgSurface,
                  borderColor: touched && nameError ? colors.danger : colors.line,
                  color: colors.inkPrimary,
                  fontSize: scaled(15),
                },
              ]}
            />
            {touched && nameError ? (
              <Text variant="caption" tone="danger">
                {t(nameError)}
              </Text>
            ) : null}
          </View>

          <View style={styles.field}>
            <Text variant="label">{t('persona.ageLabel')}</Text>
            <TextInput
              value={age}
              onChangeText={setAge}
              placeholder={t('persona.agePlaceholder')}
              placeholderTextColor={colors.inkSecondary}
              accessibilityLabel={t('persona.ageLabel')}
              keyboardType="number-pad"
              maxLength={2}
              style={[
                styles.input,
                {
                  backgroundColor: colors.bgSurface,
                  borderColor: touched && ageError ? colors.danger : colors.line,
                  color: colors.inkPrimary,
                  fontSize: scaled(15),
                },
              ]}
            />
            {touched && ageError ? (
              <Text variant="caption" tone="danger">
                {t(ageError)}
              </Text>
            ) : null}
          </View>

          <View style={styles.field}>
            <Text variant="label">{t('persona.responseLanguage')}</Text>
            <View style={styles.chips}>
              {supportedLocales.map((item) => (
                <Chip
                  key={item}
                  label={item === 'id-ID' ? 'Bahasa Indonesia' : 'English'}
                  selected={responseLocale === item}
                  onPress={() => setResponseLocale(item)}
                  testID={`response-locale-${item}`}
                />
              ))}
            </View>
          </View>

          {errorMessage ? (
            <View
              accessible
              accessibilityRole="alert"
              style={[styles.error, { backgroundColor: colors.bgMuted, borderColor: colors.danger }]}
            >
              <Text variant="small" tone="danger">
                {errorMessage}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button label={t('persona.cancel')} onPress={onCancel} variant="ghost" />
          <View style={styles.primarySlot}>
            <Button
              label={t('persona.confirm')}
              onPress={handleConfirm}
              loading={submitting}
              disabled={submitting}
              fullWidth
              testID="persona-confirm"
            />
          </View>
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
  content: {
    gap: space.lg,
    paddingBottom: space.md,
  },
  field: {
    gap: space.sm,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.input,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  error: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.md,
  },
  primarySlot: {
    flex: 1,
  },
});
