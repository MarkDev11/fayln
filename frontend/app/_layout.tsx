import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GatewayProvider } from '@/data/GatewayProvider';
import { ProfileProvider } from '@/features/profile/ProfileProvider';
import { I18nProvider } from '@/i18n';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Kerangka akar fayLN.
 *
 * Urutan penyedia penting: tema dan bahasa harus tersedia sebelum layar mana pun
 * dirender, karena keduanya dipakai oleh seluruh komponen dasar.
 */
function ThemedStack() {
  const { colors, scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgApp },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="world/[worldId]" />
        <Stack.Screen name="journey/[journeyId]" />
        <Stack.Screen name="settings/plan" />
        <Stack.Screen
          name="player/[journeyId]"
          options={{
            // Pemutar bersifat imersif; transisi dari bawah menegaskan masuk ke cerita.
            animation: 'fade_from_bottom',
            gestureEnabled: false,
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Satu klien per proses; dibuat sekali agar cache tidak dibuang saat render ulang.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <QueryClientProvider client={queryClient}>
            <GatewayProvider>
              <ProfileProvider>
                <ThemedStack />
              </ProfileProvider>
            </GatewayProvider>
          </QueryClientProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
