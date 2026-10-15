import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';

import { useTheme } from '@/theme/ThemeProvider';

export type StageNavProps = {
  /** Keluar dari cerita. */
  onBack: () => void;
  backLabel: string;
  testID?: string;
};

/**
 * Tombol bulat di kaki panggung — HANYA satu, di kiri: keluar dari cerita.
 *
 * ---------------------------------------------------------------------------
 * KENAPA TOMBOL KANANNYA DIHAPUS
 * ---------------------------------------------------------------------------
 * Bentuk sebelumnya punya dua tombol: kiri keluar, kanan maju. Pemilik produk
 * memutuskan **panah kanan dihapus**, dan itu menutup keluhan yang sama dari
 * tiga peninjau: satu layar punya TIGA isyarat maju sekaligus — ketuk di mana
 * saja, tombol `»`, dan petunjuk "Ketuk untuk lanjut". Tiga isyarat untuk satu
 * aksi membuat tidak ada satu pun yang terasa seperti aksi utamanya.
 *
 * Yang tersisa sekarang: ketuk di mana saja (seluruh panggung) dan satu petunjuk
 * kecil di bawah kalimat. Cukup, dan tidak ada yang bersaing.
 *
 * `«` TETAP berarti keluar, sesuai keputusan pemilik produk. Ia sengaja tidak
 * diubah menjadi "baris sebelumnya": aplikasi belum punya rewind — reducer
 * hanya bergerak maju — dan tombol yang menjanjikan sesuatu yang tidak terjadi
 * lebih buruk daripada tombol yang jelas.
 *
 * BUKTI MUTASI: kembalikan tombol kanan beserta `onForward`, lalu uji
 * "TIDAK punya tombol maju" memerah.
 */
export function StageNav({ onBack, backLabel, testID }: StageNavProps) {
  const { colors } = useTheme();

  return (
    <View testID={testID} style={styles.root} pointerEvents="box-none">
      <Pressable
        testID="player-nav-back"
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        hitSlop={8}
        style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Icon name="chevronLeft" size={20} color={colors.onMedia} />
      </Pressable>
    </View>
  );
}

/** Alas tombol: gelap setengah tembus pandang agar terbaca di atas gambar. */
const NAV_BG = 'rgba(0, 0, 0, 0.45)';

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    /*
     * Kiri saja. `flex-start` eksplisit supaya ruang di kanan tetap kosong —
     * dengan `space-between` dan satu anak, tombolnya juga di kiri, tetapi
     * maksudnya tidak terbaca dari kodenya.
     */
    justifyContent: 'flex-start',
  },
  button: {
    /*
     * 44 px: target sentuh minimum yang dipakai aplikasi ini di tempat lain
     * (`touchTarget` di `theme/tokens`). Bentuk sebelumnya 38 px, dan peninjau
     * QA menandainya.
     */
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAV_BG,
  },
});
