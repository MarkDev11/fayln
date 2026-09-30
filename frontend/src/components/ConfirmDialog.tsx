import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  /** Menyebut objek yang terdampak dan konsekuensinya, bukan pesan generik. */
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Menandai aksi yang tidak dapat dibatalkan. */
  destructive?: boolean;
  /** Menonaktifkan tombol konfirmasi selama aksi berjalan. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
};

/**
 * Dialog konfirmasi.
 *
 * Aturan (docs/04, FR-28): fokus awal berada pada tombol AMAN, bukan tombol
 * destruktif, dan teks wajib menyebut apa yang akan terjadi — bukan sekadar
 * "Apakah kamu yakin?".
 */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
  testID,
}: ConfirmDialogProps) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
      testID={testID}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.line }]}
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`${title}. ${body}`}
        >
          <Text variant="title">{title}</Text>
          <Text variant="small" tone="secondary" style={styles.body}>
            {body}
          </Text>

          <View style={styles.actions}>
            <Button
              label={cancelLabel}
              onPress={onCancel}
              variant="secondary"
              fullWidth
              testID={testID ? `${testID}-cancel` : undefined}
            />
            <Button
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'danger' : 'primary'}
              fullWidth
              loading={busy}
              disabled={busy}
              testID={testID ? `${testID}-confirm` : undefined}
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: space.lg,
    borderRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  body: {
    marginTop: space.xs,
  },
  actions: {
    marginTop: space.lg,
    gap: space.sm,
  },
});
