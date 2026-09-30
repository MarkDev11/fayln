import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState, type ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { GatewayProvider } from '@/data/GatewayProvider';
import type { StoryGateway } from '@/data/gateway';
import { I18nProvider, type UiLocale } from '@/i18n';
import { ThemeProvider, type TextSizePreference, type ThemePreference } from '@/theme/ThemeProvider';

/**
 * Metrik safe area tetap untuk pengujian.
 *
 * Nilainya sengaja dipatok agar hasil tes deterministik dan tidak bergantung pada
 * perangkat atau lingkungan. Angka ini menyerupai ponsel portrait pada umumnya.
 */
export const TEST_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
};

export type TestProvidersProps = {
  children: ReactNode;
  locale?: UiLocale;
  theme?: ThemePreference;
  textSize?: TextSizePreference;
  /** Menyuntikkan gateway tertentu; default membuat MockStoryGateway. */
  gateway?: StoryGateway;
};

/**
 * Pembungkus pengujian: safe area, tema, bahasa, gateway, dan query client.
 *
 * Query client dibuat dengan retry dimatikan dan cache tanpa kedaluwarsa agar
 * pengujian tidak menunggu percobaan ulang atau pemuatan ulang.
 */
export function TestProviders({
  children,
  locale = 'id-ID',
  theme = 'light',
  textSize = 'normal',
  gateway,
}: TestProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
      <ThemeProvider initialPreference={theme} initialTextSize={textSize}>
        <I18nProvider initialLocale={locale}>
          <QueryClientProvider client={queryClient}>
            <GatewayProvider {...(gateway ? { gateway } : null)}>{children}</GatewayProvider>
          </QueryClientProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
