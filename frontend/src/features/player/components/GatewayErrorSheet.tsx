import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';

import type { TranslationKey } from '@/i18n';
import type { GatewayError } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type GatewayErrorSheetProps = {
  error: GatewayError;
  onRetry: () => void;
  onDismiss: () => void;
  testID?: string;
};

type ErrorCopy = {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  canRetry: boolean;
};

/**
 * Pemetaan kode kesalahan ke pesan yang berbeda.
 *
 * Kesalahan rate limit dan blokir abuse TIDAK dapat dicoba ulang secara agresif —
 * mencoba lagi hanya akan memperparah keadaan (FR-73, FR-74).
 */
export function mapGatewayError(error: GatewayError): ErrorCopy {
  switch (error.code) {
    case 'RATE_LIMITED':
      return { titleKey: 'gateway.rateLimitedTitle', bodyKey: 'gateway.rateLimitedBody', canRetry: false };
    case 'ABUSE_WARN':
    case 'ABUSE_BLOCKED':
      return { titleKey: 'gateway.abuseTitle', bodyKey: 'gateway.abuseBody', canRetry: false };
    case 'QUOTA_EXHAUSTED':
      return { titleKey: 'gateway.quotaTitle', bodyKey: 'gateway.quotaBody', canRetry: false };
    case 'CONTEXT_FULL':
      return { titleKey: 'gateway.contextTitle', bodyKey: 'gateway.contextBody', canRetry: false };
    case 'MODEL_UNAVAILABLE':
      return { titleKey: 'gateway.modelTitle', bodyKey: 'gateway.modelBody', canRetry: true };
    case 'CONFLICT':
      return { titleKey: 'gateway.conflictTitle', bodyKey: 'gateway.conflictBody', canRetry: false };
    case 'NOT_FOUND':
      return { titleKey: 'gateway.notFoundTitle', bodyKey: 'gateway.notFoundBody', canRetry: false };
    case 'NETWORK':
      return { titleKey: 'gateway.networkTitle', bodyKey: 'gateway.networkBody', canRetry: true };
    case 'INTERNAL':
    case 'MAINTENANCE':
      return { titleKey: 'gateway.internalTitle', bodyKey: 'gateway.internalBody', canRetry: true };
    default:
      return { titleKey: 'state.errorTitle', bodyKey: 'state.errorBody', canRetry: error.retryable };
  }
}

/** Menghitung sisa waktu tunggu dari `retryAfterSec` atau `blockedUntil`. */
export function useCountdown(error: GatewayError): number {
  const compute = () => {
    if (typeof error.retryAfterSec === 'number') {
      return Math.max(0, Math.ceil(error.retryAfterSec));
    }
    if (error.blockedUntil) {
      const target = new Date(error.blockedUntil).getTime();
      if (!Number.isNaN(target)) {
        return Math.max(0, Math.ceil((target - Date.now()) / 1000));
      }
    }
    return 0;
  };

  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    setRemaining(compute());
    const timer = setInterval(() => {
      setRemaining((current) => (current <= 0 ? 0 : current - 1));
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error.code, error.retryAfterSec, error.blockedUntil]);

  return remaining;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function GatewayErrorSheet({
  error,
  onRetry,
  onDismiss,
  testID,
}: GatewayErrorSheetProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const copy = mapGatewayError(error);
  const remaining = useCountdown(error);

  const body = (() => {
    if (error.code === 'RATE_LIMITED' && remaining > 0) {
      return t('gateway.rateLimitedBody', { seconds: remaining });
    }
    if ((error.code === 'ABUSE_WARN' || error.code === 'ABUSE_BLOCKED') && remaining > 0) {
      return `${t('gateway.abuseBody')} ${t('gateway.abuseUntil', { time: formatDuration(remaining) })}`;
    }
    return t(copy.bodyKey);
  })();

  const isWaiting = remaining > 0 && !copy.canRetry;
  const showRetry = copy.canRetry && error.retryable;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${t(copy.titleKey)}. ${body}`}
      style={[styles.root, { backgroundColor: colors.bgSurface, borderColor: colors.line }]}
    >
      <Text variant="title">{t(copy.titleKey)}</Text>
      <Text variant="small" tone="secondary">
        {body}
      </Text>

      <View style={styles.actions}>
        {showRetry ? (
          <>
            <Button
              label={t('gateway.retry')}
              onPress={onRetry}
              disabled={isWaiting}
              testID="error-retry"
            />
            <Text variant="caption" tone="secondary" style={styles.hint}>
              {t('gateway.retryHint')}
            </Text>
          </>
        ) : null}
        <Button
          label={t('common.close')}
          onPress={onDismiss}
          variant={showRetry ? 'ghost' : 'secondary'}
          testID="error-dismiss"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    gap: space.sm,
    marginTop: space.xs,
  },
  hint: {},
});
