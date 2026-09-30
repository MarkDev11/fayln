import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import type { PresentedLine } from '../types';

import { useTypewriter } from '@/hooks/useTypewriter';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type DialogueBoxProps = {
  line: PresentedLine | null;
  /** Nama pembicara bila baris berasal dari NPC. */
  speakerName: string | null;
  /** Menandai bahwa teks sudah tampil penuh. */
  onRevealed: () => void;
  onAdvance: () => void;
  /** Mematikan animasi mesin tik, misalnya saat reduced motion. */
  instant?: boolean;
  testID?: string;
};

/**
 * Kotak narasi/dialog.
 *
 * Satu tap menyelesaikan teks; tap berikutnya memajukan beat (FR-16).
 * Baris narasi tidak menampilkan nama pembicara dan memakai gaya miring agar
 * mudah dibedakan dari dialog.
 */
export function DialogueBox({
  line,
  speakerName,
  onRevealed,
  onAdvance,
  instant = false,
  testID,
}: DialogueBoxProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const fullText = line?.text ?? '';
  const typewriter = useTypewriter(fullText, { enabled: !instant });

  useEffect(() => {
    if (line && typewriter.isComplete) {
      onRevealed();
    }
  }, [line, typewriter.isComplete, onRevealed]);

  const handlePress = () => {
    if (!line) {
      return;
    }
    if (!typewriter.isComplete) {
      typewriter.complete();
      return;
    }
    onAdvance();
  };

  const isNarration = line?.kind === 'narrate';

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={
        line
          ? `${isNarration ? t('log.narration') : (speakerName ?? t('log.unknownSpeaker'))}: ${line.text}`
          : t('common.loading')
      }
      accessibilityHint={t('player.tapHint')}
      style={[
        styles.box,
        { backgroundColor: colors.bgSurface, borderColor: colors.line },
      ]}
    >
      {!isNarration && speakerName ? (
        <Text variant="label" tone="accent" style={styles.speaker}>
          {speakerName}
        </Text>
      ) : null}

      <Text
        variant="dialog"
        tone={isNarration ? 'secondary' : 'primary'}
        style={isNarration ? styles.narration : undefined}
      >
        {typewriter.visibleText}
        {!typewriter.isComplete ? <Text tone="secondary">▌</Text> : null}
      </Text>

      {typewriter.isComplete && line ? (
        <View style={styles.footer}>
          <Text variant="caption" tone="secondary">
            {t('player.tapToContinue')}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    minHeight: 140,
    gap: space.xs,
  },
  speaker: {
    marginBottom: 2,
  },
  narration: {
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'flex-end',
  },
});
