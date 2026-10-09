import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';

import { useGateway } from '@/data/GatewayProvider';
import type { ReportInput, ReportResult } from '@/data/gateway';
import { useSession } from '@/features/auth/SessionProvider';
import {
  AGE_MAX,
  AGE_MIN,
  validateAge,
  validateName,
  type PlayerProfile,
} from '@/domain/profile';
import type { ResponseLocale } from '@/domain/types';
import { useProfile } from '@/features/profile/ProfileProvider';
import { ReportSheet } from '@/features/report/ReportSheet';
import { UI_LOCALES, useI18n, type UiLocale } from '@/i18n';
import { clearAssetCache, type CacheClearResult } from '@/storage/assetCache';
import { useTheme, type TextSizePreference, type ThemePreference } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];
const TEXT_SIZE_OPTIONS: TextSizePreference[] = ['kecil', 'normal', 'besar', 'sangatBesar'];
const RESPONSE_LOCALES: ResponseLocale[] = ['id-ID', 'en-US'];

/** Persentase ditampilkan agar pemain tahu besar perubahannya, bukan sekadar "A1". */
const TEXT_SIZE_LABEL: Record<TextSizePreference, string> = {
  kecil: '90%',
  normal: '100%',
  besar: '125%',
  sangatBesar: '150%',
};

const localeLabel = (locale: ResponseLocale | UiLocale) =>
  locale === 'id-ID' ? 'Bahasa Indonesia' : 'English';

/**
 * Pengaturan.
 *
 * Profil (nama, usia, bahasa respons) disimpan di sini. Nilainya dipakai sebagai
 * AWALAN saat memulai cerita baru — perjalanan yang sudah berjalan tidak berubah,
 * karena persona di-snapshot saat perjalanan dibuat (D-09).
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { colors, scaled } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { preference, setPreference, textSize, setTextSize } = useTheme();
  const { profile, isLoading, isPersistent, isComplete, saveProfile } = useProfile();
  const { account, signOut } = useSession();

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [responseLocale, setResponseLocale] = useState<ResponseLocale>('id-ID');
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const gateway = useGateway();
  const [cacheDialogVisible, setCacheDialogVisible] = useState(false);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheResult, setCacheResult] = useState<CacheClearResult | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [signOutVisible, setSignOutVisible] = useState(false);

  const submitReport = useCallback(
    async (input: Omit<ReportInput, 'clientOperationId'>): Promise<ReportResult> =>
      gateway.submitReport({
        clientOperationId: `report-${Date.now().toString(36)}`,
        ...input,
      }),
    [gateway],
  );

  const handleClearCache = useCallback(async () => {
    setCacheBusy(true);
    const result = await clearAssetCache();
    setCacheResult(result);
    setCacheBusy(false);
    setCacheDialogVisible(false);
  }, []);

  /* Isi formulir setelah profil tersimpan selesai dimuat. */
  useEffect(() => {
    if (isLoading) {
      return;
    }
    setName(profile.name);
    setAge(profile.age === null ? '' : String(profile.age));
    setResponseLocale(profile.responseLocale);
  }, [isLoading, profile]);

  const nameError = validateName(name);
  const ageError = validateAge(age);
  const hasError = nameError !== null || ageError !== null;

  const handleSave = useCallback(async () => {
    setTouched(true);
    setSaved(false);
    if (nameError !== null || ageError !== null) {
      return;
    }
    setSaving(true);
    const next: PlayerProfile = {
      name: name.trim(),
      age: Number.parseInt(age, 10),
      responseLocale,
    };
    await saveProfile(next);
    setSaving(false);
    setSaved(true);
  }, [age, ageError, name, nameError, responseLocale, saveProfile]);

  const themeLabel: Record<ThemePreference, string> = {
    system: t('settings.themeSystem'),
    light: t('settings.themeLight'),
    dark: t('settings.themeDark'),
  };

  const inputStyle = {
    backgroundColor: colors.bgSurface,
    color: colors.inkPrimary,
    fontSize: scaled(15),
  };

  return (
    <Screen scroll testID="screen-settings">
      <Text variant="screen">{t('settings.title')}</Text>

      <Section title={t('settings.profile')}>
        <Text variant="caption" tone="secondary">
          {t('settings.profileNotice')}
        </Text>

        {!isLoading && !isComplete ? (
          <View
            accessible
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: colors.bgMuted, borderColor: colors.warning }]}
          >
            <Text variant="caption" tone="warning">
              {t('settings.profileIncomplete')}
            </Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text variant="label">{t('settings.name')}</Text>
          <TextInput
            value={name}
            onChangeText={(text) => {
              setName(text);
              setSaved(false);
            }}
            placeholder={t('settings.namePlaceholder')}
            placeholderTextColor={colors.inkSecondary}
            accessibilityLabel={t('settings.name')}
            maxLength={60}
            editable={!isLoading}
            style={[
              styles.input,
              inputStyle,
              { borderColor: touched && nameError ? colors.danger : colors.line },
            ]}
            testID="settings-name"
          />
          {touched && nameError ? (
            <Text variant="caption" tone="danger">
              {t(nameError)}
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text variant="label">{t('settings.age')}</Text>
          <TextInput
            value={age}
            onChangeText={(text) => {
              setAge(text);
              setSaved(false);
            }}
            placeholder={t('settings.agePlaceholder')}
            placeholderTextColor={colors.inkSecondary}
            accessibilityLabel={t('settings.age')}
            keyboardType="number-pad"
            maxLength={2}
            editable={!isLoading}
            style={[
              styles.input,
              inputStyle,
              { borderColor: touched && ageError ? colors.danger : colors.line },
            ]}
            testID="settings-age"
          />
          {touched && ageError ? (
            <Text variant="caption" tone="danger">
              {t(ageError)}
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text variant="label">{t('settings.languageResponse')}</Text>
          <Text variant="caption" tone="secondary">
            {t('settings.responseLanguageNotice')}
          </Text>
          <View style={styles.chipRow}>
            {RESPONSE_LOCALES.map((item) => (
              <Chip
                key={item}
                label={localeLabel(item)}
                selected={responseLocale === item}
                onPress={() => {
                  setResponseLocale(item);
                  setSaved(false);
                }}
                testID={`settings-response-${item}`}
              />
            ))}
          </View>
        </View>

        <View style={styles.saveRow}>
          <Button
            label={t('settings.saveProfile')}
            onPress={() => {
              void handleSave();
            }}
            loading={saving}
            disabled={isLoading || saving}
            testID="settings-save"
          />
          {saved ? (
            <Text variant="caption" tone="success" testID="settings-saved">
              {t('settings.profileSaved')}
            </Text>
          ) : null}
        </View>

        {!isPersistent ? (
          <Text variant="caption" tone="warning">
            {t('storage.profileMemoryOnly')}
          </Text>
        ) : null}
      </Section>

      <Section title={t('settings.account')}>
        <Text variant="caption" tone="secondary">
          {t('settings.accountNotice')}
        </Text>
        {account ? (
          <Text variant="small" tone="primary" testID="settings-account-email">
            {t('auth.loggedInAs', { email: account.email })}
          </Text>
        ) : null}
        <View style={styles.saveRow}>
          <Button
            label={t('settings.signOut')}
            variant="danger"
            onPress={() => setSignOutVisible(true)}
            testID="settings-sign-out"
          />
        </View>
      </Section>

      <Section title={t('settings.languageUi')}>
        <Text variant="caption" tone="secondary">
          {t('settings.languageNotice')}
        </Text>
        <View style={styles.chipRow}>
          {UI_LOCALES.map((item: UiLocale) => (
            <Chip
              key={item}
              label={localeLabel(item)}
              selected={locale === item}
              onPress={() => setLocale(item)}
              testID={`locale-${item}`}
            />
          ))}
        </View>
      </Section>

      <Section title={t('settings.theme')}>
        <View style={styles.chipRow}>
          {THEME_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={themeLabel[option]}
              selected={preference === option}
              onPress={() => setPreference(option)}
              testID={`theme-${option}`}
            />
          ))}
        </View>
      </Section>

      <Section title={t('settings.textSize')}>
        <View style={styles.chipRow}>
          {TEXT_SIZE_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={TEXT_SIZE_LABEL[option]}
              selected={textSize === option}
              onPress={() => setTextSize(option)}
              testID={`textsize-${option}`}
            />
          ))}
        </View>
        <Text variant="body" style={styles.preview}>
          {t('detail.startJourney')} — {t('home.searchPlaceholder')}
        </Text>
      </Section>

      <Section title={t('settings.plan')}>
        <Text variant="small" tone="secondary">
          {t('plan.upgradeNotice')}
        </Text>
        <Button
          label={t('plan.title')}
          onPress={() => router.push('/settings/plan')}
          variant="secondary"
          testID="settings-open-plan"
        />
      </Section>

      <Section title={t('cache.title')}>
        <Text variant="small" tone="secondary">
          {t('cache.connectionNotice')}
        </Text>
        <Text variant="caption" tone="secondary">
          {t('cache.body')}
        </Text>
        <Button
          label={t('cache.clear')}
          onPress={() => {
            setCacheResult(null);
            setCacheDialogVisible(true);
          }}
          variant="secondary"
          testID="settings-clear-cache"
        />
        {cacheResult ? (
          <Text
            variant="caption"
            tone={cacheResult.outcome === 'cleared' ? 'success' : 'warning'}
            testID="settings-cache-result"
          >
            {cacheResult.outcome === 'cleared' ? t('cache.cleared') : t('cache.unsupported')}
          </Text>
        ) : null}
      </Section>

      <Section title={t('settings.help')}>
        <Text variant="small" tone="secondary">
          {t('report.intro')}
        </Text>
        <Button
          label={t('report.title')}
          onPress={() => setReportVisible(true)}
          variant="secondary"
          testID="settings-open-report"
        />
      </Section>

      <Section title={t('settings.about')}>
        <Text variant="small" tone="secondary">
          {t('settings.aboutBody')}
        </Text>
        <Text variant="caption" tone="secondary">
          {`Usia yang diterima: ${AGE_MIN}–${AGE_MAX}.`}
        </Text>
      </Section>

      <ConfirmDialog
        visible={cacheDialogVisible}
        title={t('cache.confirmTitle')}
        body={t('cache.confirmBody')}
        confirmLabel={t('cache.clear')}
        cancelLabel={t('common.cancel')}
        busy={cacheBusy}
        onConfirm={() => {
          void handleClearCache();
        }}
        onCancel={() => setCacheDialogVisible(false)}
        testID="cache-dialog"
      />

      <ConfirmDialog
        visible={signOutVisible}
        title={t('auth.logoutConfirm')}
        body={t('auth.logoutBody')}
        confirmLabel={t('auth.logout')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setSignOutVisible(false);
          // Gerbang sesi di kerangka akar yang mengalihkan ke layar masuk
          // setelah keadaan sesi berubah. Tidak perlu mengalihkan di sini —
          // satu tempat memutuskan, bukan dua.
          void signOut();
        }}
        onCancel={() => setSignOutVisible(false)}
        testID="signout-dialog"
      />

      <ReportSheet
        visible={reportVisible}
        onSubmit={submitReport}
        onClose={() => setReportVisible(false)}
        testID="report-sheet"
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="title">{title}</Text>
      <View style={[styles.sectionBody, { borderTopColor: colors.line }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: space.xl,
    gap: space.sm,
  },
  sectionBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
    gap: space.md,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  notice: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  saveRow: {
    gap: space.sm,
  },
  preview: {
    marginTop: space.xs,
  },
});
