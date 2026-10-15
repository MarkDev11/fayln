import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import type { PresentedLine } from '../types';

import { useTypewriter } from '@/hooks/useTypewriter';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export type StageTextProps = {
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

/** Tanda kutip yang dianggap sudah ada pada teks, agar tidak dikutip dua kali. */
const OPEN_QUOTES = ['"', '“', '「', '『', '‘'];
const CLOSE_QUOTES = ['"', '”', '」', '』', '’'];

/** `true` bila teks sudah diapit tanda kutip. */
export function isQuoted(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return false;
  }
  const first = trimmed[0] as string;
  const last = trimmed[trimmed.length - 1] as string;
  return OPEN_QUOTES.includes(first) && CLOSE_QUOTES.includes(last);
}

/*
 * CATATAN: tidak ada `quoteDialogue(text)` di sini.
 *
 * Bentuk sebelumnya mengekspor fungsi itu, dan uji-nya hijau — padahal
 * `StageText` TIDAK PERNAH memanggilnya: ia memakai `isQuoted` pada teks
 * LENGKAP lalu membungkus teks yang sedang terketik, karena kutipnya harus
 * muncul sejak huruf pertama. Fungsi yang tidak dipakai produksi hanya
 * membuktikan dirinya sendiri, bukan apa yang dilihat pemain. Uji yang benar
 * adalah merender komponennya — lihat "tidak mengutip dua kali" di
 * `playerComponents.test.tsx`.
 */

/**
 * Teks cerita yang menumpang DI ATAS ilustrasi panggung.
 *
 * Menggantikan kotak dialog berlatar hitam. Perbedaannya bukan sekadar warna:
 * kotak itu adalah elemen berbingkai terbesar di layar, dan pemilik produk
 * menunjuk justru kerangka itulah yang membuat layarnya terbaca sebagai templat.
 * Yang tersisa sekarang hanya tipografi — nama pembicara, lalu kalimatnya —
 * dengan gradasi gelap dari panggung sebagai penjaga kontras.
 *
 * Karena itu komponen ini TIDAK punya `backgroundColor`. Kalau seseorang
 * mengembalikannya, seluruh layar kembali menjadi separuh kotak hitam.
 *
 * Satu tap menyelesaikan teks; tap berikutnya memajukan beat (FR-16). Baris
 * narasi tidak menampilkan nama pembicara dan tidak memakai tanda kutip, supaya
 * mudah dibedakan dari ucapan tokoh.
 */
export function StageText({
  line,
  speakerName,
  onRevealed,
  onAdvance,
  instant = false,
  testID,
}: StageTextProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
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
  /*
   * Apakah tanda kutip ditambahkan diputuskan dari teks LENGKAP, bukan dari teks
   * yang sudah terketik. Kalau diputuskan dari yang terketik, kutipnya akan
   * muncul lalu hilang di detik terakhir pada kalimat yang sudah dikutip model.
   */
  const needsQuotes = Boolean(line) && !isNarration && !isQuoted(fullText);
  const visible = needsQuotes ? `“${typewriter.visibleText}”` : typewriter.visibleText;

  const styles = React.useMemo(() => stageTextStyles(colors), [colors]);

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
      style={styles.root}
    >
      {!isNarration && speakerName ? (
        <View style={styles.speakerRow}>
          <View style={styles.speakerRule} />
          <Text variant="title" style={styles.speaker}>
            {speakerName}
          </Text>
        </View>
      ) : null}

      <Text variant="dialog" style={styles.body}>
        {visible}
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
 * Warna tetap untuk teks di atas ilustrasi.
 *
 * Bentuk lamanya memakai token tema, sehingga di tema terang teksnya gelap —
 * padahal ia duduk di atas GAMBAR yang tidak ikut berubah bersama tema. Putih
 * adalah pilihan yang stabil di atas gradasi gelap panggung, di tema apa pun.
 *
 * `colors.onMedia` (`raw.white` di kedua tema) adalah token yang dibuat tepat
 * untuk sekarang — lebih baik menulis token itu daripada mendefinisikan kembali
 * di setiap komponen. Lihat `theme/tokens.ts`.
 */
/**
 * Bayangan tipis: jaring pengaman bila gradasi tidak cukup menutup latar terang.
 */
const STAGE_SHADOW = 'rgba(0, 0, 0, 0.85)';

/**
 * Gaya yang bergantung pada warna harus dibuat di dalam komponen — `colors` baru
 * tersedia di sana. `StyleSheet.create` di tingkat modul tidak bisa melihat
 * warna tema yang baru dipakai.
 */
function stageTextStyles(colors: { onMedia: string; accent: string }) {
  return StyleSheet.create({
    /**
     * TANPA latar dan TANPA bingkai.
     *
     * Tidak ada `backgroundColor` di sini dengan sengaja. Keterbacaan dijaga oleh
     * gradasi gelap milik `Stage`, bukan oleh kotak milik teksnya.
     */
    root: {
      paddingVertical: space.sm,
      minHeight: 128,
      gap: space.xs,
    },
    speakerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginBottom: space.xs,
    },
    /**
     * Garis aksen tipis di kiri nama pembicara.
     *
     * Nama pembicara sebelumnya hanya teks kecil tanpa penanda apa pun, sehingga
     * ia terbaca sebagai potongan kalimat yang mengambang — bukan sebagai label
     * siapa yang sedang bicara. Garis ini memisahkannya dari isi dialog tanpa
     * menambah kotak.
     */
    speakerRule: {
      width: 3,
      height: 16,
      borderRadius: 1.5,
      backgroundColor: colors.accent,
    },
    speaker: {
      color: colors.onMedia,
      letterSpacing: 0.4,
      textShadowColor: STAGE_SHADOW,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    body: {
      color: colors.onMedia,
      fontStyle: 'normal',
      textShadowColor: STAGE_SHADOW,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    caret: {
      color: 'rgba(255, 255, 255, 0.72)',
    },
    footer: {
      marginTop: 'auto',
      alignItems: 'flex-end',
    },
    footerText: {
      color: 'rgba(255, 255, 255, 0.72)',
    },
  });
}
