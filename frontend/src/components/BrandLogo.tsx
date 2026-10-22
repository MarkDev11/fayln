import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/Text';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export type BrandLogoProps = {
  /** Tinggi mark dalam piksel; wordmark ikut menyesuaikan. */
  size?: number;
  /** Matikan bila mark dipakai sendirian (mis. favicon atau ikon aplikasi). */
  showWordmark?: boolean;
  /**
   * Label pembaca layar. Bawaannya nama produk; Beranda mengirim nama layar
   * sekaligus supaya pembaca layar tidak kehilangan konteks halaman.
   */
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Logo fayLN.
 *
 * Alasan bentuknya begini, bukan teks biasa:
 *
 * - **Buku terbuka** adalah bentuk paling langsung dari "novel visual", dan ia
 *   terbaca pada ukuran 24 px tanpa detail yang hilang.
 * - **Percikan di atas halaman kanan** menandai bagian yang ditulis mesin, bukan
 *   manusia. Dua unsur itu adalah produknya: cerita yang dibaca, dan AI yang
 *   menuliskan kelanjutannya.
 * - **Badge bersudut lembut** membuat mark tetap utuh di atas gambar sampul yang
 *   ramai; tanpa bidang, garis buku akan tenggelam di latar yang terang.
 *
 * Warnanya diambil dari token tema (`accent`/`accentStrong`), bukan nilai tetap:
 * di tema terang aksennya clay tua, di tema gelap clay muda. Logo yang memakai
 * warna tetap akan kehilangan kontras di salah satu tema — dan itu baru terlihat
 * setelah ada yang mengeluh, bukan di uji.
 */
export function BrandLogo({
  size = 32,
  showWordmark = true,
  accessibilityLabel,
  testID,
}: BrandLogoProps) {
  const { colors, scaled } = useTheme();
  const { t } = useI18n();

  const nama = t('app.name');
  /*
   * Wordmark dipecah tiga huruf pertama dan sisanya supaya "fay" memakai warna
   * teks dan "LN" memakai warna aksen. Dipecah dari NAMA, bukan ditulis harfiah:
   * bila nama produk berubah, logo ikut berubah tanpa ada string yang tertinggal.
   */
  const kepala = nama.slice(0, 3);
  const ekor = nama.slice(3);

  return (
    <View
      style={styles.row}
      testID={testID}
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel ?? nama}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Defs>
          <LinearGradient id="faylnMark" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accentStrong} />
            <Stop offset="1" stopColor={colors.accent} />
          </LinearGradient>
        </Defs>

        <Rect x="2" y="2" width="44" height="44" rx="13" fill="url(#faylnMark)" />

        {/* Dua halaman buku, bertemu di punggung tengah. */}
        <Path
          d="M12 32 V20.4 C16 19 20.2 19.2 23.4 21 V33 C20.2 31.4 16 31.2 12 32 Z"
          fill="#FFFFFF"
          opacity={0.95}
        />
        <Path
          d="M36 32 V20.4 C32 19 27.8 19.2 24.6 21 V33 C27.8 31.4 32 31.2 36 32 Z"
          fill="#FFFFFF"
          opacity={0.78}
        />

        {/* Percikan: bagian yang ditulis mesin. */}
        <Path
          d="M36 8.4 L37.2 11.8 L40.6 13 L37.2 14.2 L36 17.6 L34.8 14.2 L31.4 13 L34.8 11.8 Z"
          fill="#FFFFFF"
        />
      </Svg>

      {showWordmark ? (
        <Text
          style={[
            styles.wordmark,
            {
              /*
               * Ukuran melewati `scaled()` seperti teks lain: logo memang milik
               * merek, tetapi pemain yang memperbesar ukuran teks tetap harus
               * dapat membacanya (NFR-02).
               */
              fontSize: scaled(Math.round(size * 0.6)),
              lineHeight: scaled(Math.round(size * 0.72)),
            },
          ]}
        >
          <Text style={{ color: colors.inkPrimary }}>{kepala}</Text>
          <Text style={{ color: colors.accent, fontWeight: '800' }}>{ekor}</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  wordmark: {
    fontWeight: '800',
    letterSpacing: -0.6,
    borderRadius: radius.card,
  },
});
