import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export type StateViewKind = 'empty' | 'error' | 'offline' | 'loading';

export type StateViewProps = {
  kind: StateViewKind;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

const iconFor: Record<StateViewKind, IconName> = {
  empty: 'book',
  error: 'close',
  offline: 'close',
  loading: 'book',
};

/**
 * Tampilan state bersama: kosong, galat, offline.
 *
 * Setiap state menyediakan aksi berikutnya, bukan layar mati (docs/04 konvensi umum).
 * Tidak ada tombol yang mengklaim bisa melakukan hal yang tidak mungkin saat offline.
 */
export function StateView({ kind, title, body, actionLabel, onAction, testID }: StateViewProps) {
  const { colors } = useTheme();

  return (
    <View testID={testID} style={styles.container}>
      <View style={[styles.iconBox, { borderColor: colors.line }]}>
        <Icon name={iconFor[kind]} size={26} color={colors.inkSecondary} />
      </View>
      <Text variant="title" center>
        {title}
      </Text>
      {body ? (
        <Text variant="small" tone="secondary" center style={styles.body}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  body: {
    maxWidth: 320,
  },
  action: {
    marginTop: space.md,
    minWidth: 160,
  },
});
