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
 * Kotak narasi/dialog — TANPA bingkai, latar hitam, teks putih.
 *
 * Satu tap menyelesaikan teks; tap berikutnya memajukan beat (FR-16).
 * Baris narasi tidak menampilkan nama pembicara dan memakai gaya miring agar
 * mudah dibedakan dari dialog.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA WARNANYA DIPATOK, BUKAN DIIKUTI TEMA
 * ---------------------------------------------------------------------------
 * Bentuk lamanya memakai `colors.bgSurface` dan `colors.line` — artinya di tema
 * terang kotak ini putih berbingkai, dan di tema gelap ia abu-abu berbingkai.
 * Dua masalah sekaligus:
 *
 *   1. Bingkainya bersaing dengan ilustrasi adegan, dan itulah yang membuat
 *      layar terbaca sebagai templat.
 *   2. Warnanya berubah bersama tema, padahal ia duduk di atas GAMBAR — bukan
 *      di atas latar aplikasi. Gambar tidak ikut berubah saat tema berganti,
 *      sehingga kotak yang "benar" di tema terang belum tentu terbaca di tema
 *      gelap, dan sebaliknya.
 *
 * Hitam pekat dengan teks putih adalah pilihan yang stabil di atas gambar apa
 * pun dan di tema apa pun. Karena itu warnanya dipatok di sini, dan itu
 * disengaja — bukan kelalaian memakai token tema.
 */
export function DialogueBox({
  line,
  speakerName,
  onRevealed,
  onAdvance,
  instant = false,
  testID,
}: DialogueBoxProps) {
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
      style={styles.box}
    >
      {!isNarration && speakerName ? (
        <Text variant="label" style={styles.speaker}>
          {speakerName}
        </Text>
      ) : null}

      <Text variant="dialog" style={styles.body}>
        {typewriter.visibleText}
        {!typewriter.isComplete ? <Text style={styles.caret}>▌</Text> : null}
      </Text>

      {typewriter.isComplete && line ? (
        <View style={styles.footer}>
          <Text variant="caption" style={styles.footerText}>
            {t('player.tapToContinue')}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Warna tetap kotak dialog. Dipisahkan sebagai konstanta bernama supaya
 * maksudnya terbaca: ini bukan token tema yang lupa dipakai, melainkan warna
 * yang sengaja dipatok agar terbaca di atas gambar apa pun.
 *
 * CATATAN PENTING soal cara `Text` menerima warna: `Text` menerapkan
 * `color: toneColor[tone]` lebih dahulu, lalu `style` Anda SESUDAHNYA. Karena
 * itu `styles.body` di bawah memang menang walaupun `tone` bawaan
 * (`'primary'`) tetap berlaku. Kalau kelak `style` dipindahkan ke ATAS warna
 * tone, teks ini akan kembali mengikuti tema tanpa satu pun uji memerah —
 * sebaiknya uji `playerComponents.test.tsx` yang memeriksa `#FFFFFF` dijalankan
 * setiap kali urutan itu disentuh.
 */
const DIALOG_BG = '#000000';
const DIALOG_INK = '#FFFFFF';
/** Putih diredupkan untuk teks sekunder — tetap terbaca di atas hitam pekat. */
const DIALOG_INK_MUTED = 'rgba(255, 255, 255, 0.72)';

const styles = StyleSheet.create({
  box: {
    backgroundColor: DIALOG_BG,
    padding: space.lg,
    minHeight: 140,
    gap: space.xs,
  },
  speaker: {
    color: DIALOG_INK_MUTED,
    marginBottom: 2,
  },
  body: {
    color: DIALOG_INK,
    fontStyle: 'normal',
  },
  caret: {
    color: DIALOG_INK_MUTED,
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'flex-end',
  },
  footerText: {
    color: DIALOG_INK_MUTED,
  },
});
