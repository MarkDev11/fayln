import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useSession } from '@/features/auth/SessionProvider';
import type { AuthFailureReason } from '@/features/auth/authClient';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * Layar masuk dan daftar.
 *
 * Satu layar dengan dua mode, bukan dua rute terpisah. Alasannya: keduanya
 * memakai kolom yang sama, dan berpindah mode tidak boleh menghilangkan apa yang
 * sudah diketik. Dua rute akan memaksa berpindah layar, dan teksnya hilang.
 *
 * Kolom nama dan usia hanya muncul di mode daftar — keduanya menjadi persona
 * cerita, dan menanyakannya saat masuk akan mengundang pemain mengetik ulang hal
 * yang sudah tersimpan di akunnya.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { signIn, signUp, isAuthenticated } = useSession();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthFailureReason | null>(null);

  /**
   * Memetakan alasan kegagalan ke pesan.
   *
   * Dipetakan di sini, bukan di klien auth, supaya klien tetap bebas dari
   * kosakata antarmuka dan dapat dipakai ulang.
   */
  const messageFor = useCallback(
    (reason: AuthFailureReason): string => {
      switch (reason) {
        case 'emailTaken':
          return t('auth.errorEmailTaken');
        case 'credentials':
          return t('auth.errorCredentials');
        case 'rateLimited':
          return t('auth.errorRateLimited');
        case 'emailInvalid':
          return t('auth.errorEmailInvalid');
        case 'passwordShort':
          return t('auth.errorPasswordShort');
        case 'nameEmpty':
          return t('auth.errorNameEmpty');
        case 'ageRange':
          return t('auth.errorAgeRange');
        default:
          return t('auth.errorGeneric');
      }
    },
    [t],
  );

  const submit = useCallback(async () => {
    setError(null);

    // Pemeriksaan ringan di sisi klien: menghemat satu perjalanan bolak-balik
    // untuk kesalahan yang jelas. Server tetap memeriksa ulang.
    if (mode === 'register') {
      if (name.trim().length === 0) {
        setError('nameEmpty');
        return;
      }
      const angka = Number.parseInt(age.trim(), 10);
      if (!Number.isFinite(angka) || angka < 13 || angka > 99) {
        setError('ageRange');
        return;
      }
    } else if (password.length < 1) {
      setError('passwordShort');
      return;
    }

    setBusy(true);
    try {
      const reason =
        mode === 'register'
          ? await signUp({
              email: email.trim(),
              password,
              displayName: name.trim(),
              age: Number.parseInt(age.trim(), 10),
            })
          : await signIn({ email: email.trim(), password });

      if (reason) {
        setError(reason);
        return;
      }

      // Berhasil: kembali ke Beranda. `replace` dipakai agar tombol kembali
      // perangkat tidak mengembalikan ke layar masuk.
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  }, [age, email, mode, name, password, router, signIn, signUp]);

  // Sudah masuk: jangan tampilkan formulir lagi.
  if (isAuthenticated) {
    router.replace('/(tabs)');
    return null;
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.bgSurface, borderColor: colors.line, color: colors.inkPrimary },
  ];

  return (
    <Screen scroll testID="screen-login">
      <View style={styles.header}>
        <Text variant="title" testID="login-title">
          {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
        </Text>
        <Text variant="body" tone="secondary" style={styles.subtitle}>
          {mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}
        </Text>
      </View>

      <View style={styles.form}>
        <Text variant="label">{t('auth.email')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={colors.inkSecondary}
          style={inputStyle}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          testID="login-email"
        />

        <Text variant="label">{t('auth.password')}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordPlaceholder')}
          placeholderTextColor={colors.inkSecondary}
          style={inputStyle}
          secureTextEntry
          autoCapitalize="none"
          testID="login-password"
        />

        {mode === 'register' ? (
          <>
            <Text variant="label">{t('auth.name')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('auth.namePlaceholder')}
              placeholderTextColor={colors.inkSecondary}
              style={inputStyle}
              testID="login-name"
            />

            <Text variant="label">{t('auth.age')}</Text>
            <TextInput
              value={age}
              onChangeText={setAge}
              placeholder={t('auth.agePlaceholder')}
              placeholderTextColor={colors.inkSecondary}
              style={inputStyle}
              keyboardType="number-pad"
              testID="login-age"
            />
          </>
        ) : null}

        {error ? (
          <View
            style={[styles.errorBoard, { backgroundColor: colors.bgSurface, borderColor: colors.danger }]}
            testID="login-error"
          >
            <Text variant="small" tone="danger">
              {messageFor(error)}
            </Text>
          </View>
        ) : null}

        <Button
          label={mode === 'login' ? t('auth.loginAction') : t('auth.registerAction')}
          onPress={() => void submit()}
          loading={busy}
          disabled={busy}
          fullWidth
          testID="login-submit"
        />

        <Button
          label={mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
          onPress={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          variant="ghost"
          fullWidth
          testID="login-toggle-mode"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: space.xl,
    marginBottom: space.xl,
  },
  subtitle: {
    marginTop: space.sm,
  },
  form: {
    gap: space.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 15,
  },
  errorBoard: {
    borderWidth: 1,
    borderRadius: radius.button,
    padding: space.md,
    marginTop: space.sm,
  },
});
