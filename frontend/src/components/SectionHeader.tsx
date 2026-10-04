import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './Text';

import { space } from '@/theme/tokens';

export type SectionHeaderProps = {
  title: string;
  /**
   * Keterangan tambahan untuk pembaca layar, mis. mengapa sebuah bagian
   * didahulukan (Beranda menaikkan "Lanjutkan Bermain" saat ada adegan baru).
   * Tidak mengubah rupa; judul visual tetap satu-satunya teks yang terlihat.
   */
  accessibilityHint?: string;
  testID?: string;
};

/**
 * Tajuk bagian (docs/05 §8.7).
 *
 * Tajuk adalah heading nyata (`accessibilityRole="header"` pada RN, dipetakan ke
 * heading oleh pembaca layar), bukan sekadar teks tebal, agar pemain dapat
 * melompat antarbagian (NFR-19). Tidak ada ikon, tidak ada tombol aksi, dan tidak
 * memakai huruf kapital semua.
 *
 * **Tanpa garis pemisah.** Sebelumnya tiap bagian dibuka garis 1px penuh lebar.
 * Garis itu memotong halaman menjadi kotak-kotak dan membuat beranda terbaca
 * seperti daftar bertabel. Pemisahan kini dilakukan oleh jarak dan bobot huruf
 * saja, sehingga halaman mengalir tanpa sendi yang terlihat.
 */
export function SectionHeader({ title, accessibilityHint, testID }: SectionHeaderProps) {
  return (
    <View testID={testID} style={styles.wrap}>
      <Text
        variant="small"
        weight="700"
        tone="primary"
        accessibilityRole="header"
        accessibilityHint={accessibilityHint}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.xxl,
  },
});
