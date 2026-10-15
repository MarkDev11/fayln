import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View, type ColorValue, type ViewStyle } from 'react-native';

import starAsset from '../../assets/star.png';

import { useTheme } from '@/theme/ThemeProvider';

/**
 * Ikon geometris dari primitif View.
 *
 * Alasan tidak memakai pustaka ikon: menghindari dependensi tambahan, tetap
 * aman di lingkungan pengujian, dan tidak memerlukan sprite/font eksternal.
 * Semua ikon bersifat dekoratif — label aksesibilitas selalu disediakan
 * pemanggil melalui `accessibilityLabel` pada kontrol, bukan pada ikon.
 */
export type IconName =
  | 'home'
  | 'journey'
  | 'settings'
  | 'search'
  | 'close'
  | 'filter'
  | 'trash'
  | 'chevronRight'
  | 'chevronLeft'
  | 'check'
  | 'book'
  | 'pause'
  | 'play'
  | 'eye'
  | 'eyeOff'
  | 'heart'
  | 'person'
  | 'star';

export type IconProps = {
  name: IconName;
  size?: number;
  /** Menerima ColorValue agar dapat dipakai langsung oleh opsi ikon tab. */
  color?: ColorValue;
  strokeWidth?: number;
};

export function Icon({ name, size = 24, color, strokeWidth = 2 }: IconProps) {
  const { colors, scheme } = useTheme();
  const tint = color ?? colors.inkSecondary;
  const bar = (width: number, height: number, style?: ViewStyle) => (
    <View
      style={[
        { width, height, backgroundColor: tint, borderRadius: height / 2 },
        style,
      ]}
    />
  );

  switch (name) {
    /**
     * Bintang digambar dari aset PNG, bukan bentuk `View` maupun glif teks.
     *
     * Bintang berujung lima tidak dapat dibentuk dari `View` + `borderWidth`
     * seperti ikon lain di berkas ini. Sebelumnya dipakai glif `★` (U+2605),
     * tetapi bentuknya bergantung pada font sistem sehingga tampilannya bisa
     * berbeda antar perangkat. Aset gambar membuat tampilannya sama di mana pun.
     *
     * `tintColor` HANYA dipasang pada tema terang. Asetnya kristal putih
     * (`#E3E4E9`); di atas latar tema terang (`#F6F3EC`) kontrasnya hanya
     * ~1,15:1 sehingga bintangnya hilang sama sekali. Di tema gelap asetnya
     * sudah terbaca dan kilaunya justru yang diinginkan, jadi jangan diwarnai
     * di sana — mewarnai berarti meratakannya menjadi siluet.
     *
     * Karena itu `color` kini DIPAKAI untuk bintang di tema terang. Pemanggil
     * sudah mengirim warna aksen, jadi tint mengikuti warna teks di sebelahnya.
     */
    case 'star': {
      /*
       * `ColorValue` boleh berupa `OpaqueColorValue` — warna khusus platform
       * seperti `PlatformColor()` — dan `expo-image` hanya menerima string.
       * Jadi hanya warna berbentuk string yang diteruskan, bukan di-cast.
       */
      const starTint = scheme === 'light' && typeof tint === 'string' ? tint : undefined;
      return (
        <Image
          source={starAsset}
          style={{ width: size, height: size }}
          contentFit="contain"
          tintColor={starTint}
          // Ikon dekoratif; label aksesibilitas disediakan pemanggil (lihat kepala berkas).
          accessible={false}
        />
      );
    }

    case 'home':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.5,
              height: size * 0.5,
              borderTopWidth: strokeWidth,
              borderLeftWidth: strokeWidth,
              borderColor: tint,
              transform: [{ rotate: '45deg' }],
              marginTop: size * 0.16,
            }}
          />
          <View
            style={{
              width: size * 0.58,
              height: size * 0.42,
              borderWidth: strokeWidth,
              borderTopWidth: 0,
              borderColor: tint,
              borderBottomLeftRadius: size * 0.1,
              borderBottomRightRadius: size * 0.1,
              marginTop: -size * 0.02,
            }}
          />
        </View>
      );

    case 'journey':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.82,
              height: size * 0.62,
              borderWidth: strokeWidth,
              borderColor: tint,
              borderRadius: size * 0.22,
              marginTop: size * 0.06,
            }}
          />
          <View
            style={{
              width: size * 0.22,
              height: size * 0.22,
              borderBottomWidth: strokeWidth,
              borderLeftWidth: strokeWidth,
              borderColor: tint,
              transform: [{ rotate: '-45deg' }],
              marginTop: -size * 0.1,
              marginLeft: -size * 0.24,
            }}
          />
        </View>
      );

    case 'settings':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center', gap: size * 0.16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {bar(size * 0.62, strokeWidth)}
            <View
              style={{
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size * 0.1,
                borderWidth: strokeWidth,
                borderColor: tint,
                marginLeft: -size * 0.34,
                backgroundColor: 'transparent',
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {bar(size * 0.62, strokeWidth)}
            <View
              style={{
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size * 0.1,
                borderWidth: strokeWidth,
                borderColor: tint,
                marginLeft: -size * 0.12,
                backgroundColor: 'transparent',
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {bar(size * 0.62, strokeWidth)}
            <View
              style={{
                width: size * 0.2,
                height: size * 0.2,
                borderRadius: size * 0.1,
                borderWidth: strokeWidth,
                borderColor: tint,
                marginLeft: -size * 0.46,
                backgroundColor: 'transparent',
              }}
            />
          </View>
        </View>
      );

    case 'search':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.62,
              height: size * 0.62,
              borderRadius: size * 0.31,
              borderWidth: strokeWidth,
              borderColor: tint,
              marginTop: size * 0.04,
              marginLeft: size * 0.04,
            }}
          />
          <View
            style={{
              width: size * 0.34,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
              marginTop: -size * 0.12,
              marginLeft: size * 0.56,
            }}
          />
        </View>
      );

    case 'close':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.72,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              width: size * 0.72,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
              marginTop: -strokeWidth,
            }}
          />
        </View>
      );

    case 'filter':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center', gap: size * 0.14 }]}>
          {bar(size * 0.78, strokeWidth)}
          {bar(size * 0.5, strokeWidth, { alignSelf: 'flex-start' })}
          {bar(size * 0.28, strokeWidth, { alignSelf: 'flex-start' })}
        </View>
      );

    case 'trash':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.6,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              marginTop: size * 0.14,
            }}
          />
          <View
            style={{
              width: size * 0.44,
              height: size * 0.5,
              borderWidth: strokeWidth,
              borderTopWidth: 0,
              borderColor: tint,
              borderBottomLeftRadius: size * 0.08,
              borderBottomRightRadius: size * 0.08,
              marginTop: size * 0.04,
            }}
          />
        </View>
      );

    /*
     * Panah chevron — DUA batang yang bertemu di satu TITIK, bukan dua batang
     * yang bersilangan di tengah.
     *
     * Bentuk sebelumnya memberi kedua batang `marginLeft` yang SAMA
     * (`size * 0.1`), dan wadahnya memakai `alignItems` bawaan (`stretch`) yang
     * menaruh keduanya di tepi kiri. Akibatnya kedua batang punya pusat X yang
     * sama: `rotate ±45°` pada pusat yang sama menghasilkan **×**, bukan `>`.
     *
     * Perbaikan: posisikan tiap batang dengan `position:'absolute'` sehingga
     * PUSATNYA berada di titik yang sudah dihitung — batang atas di (0.5s, 0.32s),
     * batang bawah di (0.5s, 0.68s) — lalu putar dari sana. Keduanya bertemu di
     * ujung kanan (x ≈ 0.66s), dan itulah ujung panahnya.
     *
     * BUKTI MUTASI: kembalikan `marginLeft` yang sama untuk kedua batang, lalu
     * uji "menggambar chevron, bukan tanda silang" memerah karena kedua batang
     * kembali sejajar di titik yang sama.
     */
    case 'chevronRight':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              position: 'absolute',
              left: size * 0.275,
              top: size * 0.32 - strokeWidth / 2,
              width: size * 0.45,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: size * 0.275,
              top: size * 0.68 - strokeWidth / 2,
              width: size * 0.45,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'chevronLeft':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              position: 'absolute',
              left: size * 0.275,
              top: size * 0.32 - strokeWidth / 2,
              width: size * 0.45,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: size * 0.275,
              top: size * 0.68 - strokeWidth / 2,
              width: size * 0.45,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'eye':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.86,
              height: size * 0.54,
              borderRadius: size * 0.27,
              borderWidth: strokeWidth,
              borderColor: tint,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: size * 0.24,
              height: size * 0.24,
              borderRadius: size * 0.12,
              backgroundColor: tint,
            }}
          />
        </View>
      );

    case 'eyeOff':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.86,
              height: size * 0.54,
              borderRadius: size * 0.27,
              borderWidth: strokeWidth,
              borderColor: tint,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: size * 0.24,
              height: size * 0.24,
              borderRadius: size * 0.12,
              backgroundColor: tint,
            }}
          />
          {/* Garis miring menandakan UI disembunyikan */}
          <View
            style={{
              position: 'absolute',
              width: size * 1.02,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'check':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center' }]}>
          <View
            style={{
              width: size * 0.3,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '45deg' }],
              marginLeft: size * 0.06,
            }}
          />
          <View
            style={{
              width: size * 0.56,
              height: strokeWidth,
              backgroundColor: tint,
              borderRadius: strokeWidth / 2,
              transform: [{ rotate: '-45deg' }],
              marginTop: -strokeWidth,
              marginLeft: size * 0.28,
            }}
          />
        </View>
      );

    case 'book':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.66,
              height: size * 0.76,
              borderWidth: strokeWidth,
              borderColor: tint,
              borderRadius: size * 0.08,
              marginTop: size * 0.1,
            }}
          />
          <View
            style={{
              width: strokeWidth,
              height: size * 0.6,
              backgroundColor: tint,
              marginTop: -size * 0.68,
              marginLeft: size * 0.3,
            }}
          />
        </View>
      );

    case 'pause':
      return (
        <View style={[styles.box, { width: size, height: size, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: size * 0.16 }]}>
          {bar(size * 0.16, size * 0.56, { borderRadius: size * 0.05 })}
          {bar(size * 0.16, size * 0.56, { borderRadius: size * 0.05 })}
        </View>
      );

    /*
     * Hati dibentuk dari dua bulatan dan satu persegi yang diputar 45°.
     *
     * Bukan glif `♥`: alasan yang sama dengan bintang di atas — bentuk glif
     * bergantung pada font sistem, sehingga ukuran dan proporsinya berbeda
     * antar perangkat. Tiga `View` membuat bentuknya sama di mana pun.
     *
     * Geometri (kotak ikon s×s), untuk bentuk hati yang benar:
     *   - Bulatan kiri : pusat (0.28s, 0.36s), diameter 0.4s → lobus kiri.
     *   - Bulatan kanan: pusat (0.72s, 0.36s), diameter 0.4s → lobus kanan.
     *     Keduanya menyisakan CELAH di x = 0.48s..0.52s, dan celah itulah
     *     lekukan (notch) di puncak hati.
     *   - Persegi sisi 0.44s diputar 45°, pusat (0.5s, 0.58s). Titik atasnya
     *     jatuh di (0.5s, 0.27s) — DI DALAM celah, di bawah bibir kedua
     *     bulatan (yang puncaknya di y = 0.16s) — dan titik bawahnya di
     *     (0.5s, 0.89s) menjadi ujung hati.
     *
     * Bentuk sebelumnya menaruh titik atas persegi di y = 0.066s, yaitu DI ATAS
     * bibir bulatan (0.16s), sehingga persegi itu MENUTUP celah dan bentuknya
     * menjadi tetesan air (teardrop), bukan hati. Ditemukan oleh peninjau visual
     * yang menyebutnya "chunky and asymmetric".
     *
     * BUKTI MUTASI: kembalikan `top: size * 0.17` pada persegi (dan bulatan
     * selebar 0.5s), lalu uji "menggambar hati, bukan tetesan air" memerah.
     */
    case 'heart':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          {[0.28, 0.72].map((cx) => (
            <View
              key={cx}
              style={{
                position: 'absolute',
                left: size * (cx - 0.2),
                top: size * 0.16,
                width: size * 0.4,
                height: size * 0.4,
                borderRadius: size * 0.2,
                backgroundColor: tint,
              }}
            />
          ))}
          <View
            style={{
              position: 'absolute',
              left: size * 0.28,
              top: size * 0.36,
              width: size * 0.44,
              height: size * 0.44,
              backgroundColor: tint,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    /*
     * Siluet orang: satu bulatan kepala + satu badan berbentuk bahu.
     *
     * Sebelumnya kendali "Tokoh" memakai ikon `journey` — balon percakapan.
     * Peninjau QA menandainya: "the 'Tokoh' icon is a speech bubble, not a
     * person". Label teksnya menyelamatkan, tetapi ikon yang berlawanan arti
     * dengan labelnya membuat baris itu harus dibaca, bukan dipindai.
     */
    case 'person':
      return (
        <View style={[styles.box, { width: size, height: size }]}>
          <View
            style={{
              width: size * 0.36,
              height: size * 0.36,
              borderRadius: size * 0.18,
              borderWidth: strokeWidth,
              borderColor: tint,
              marginTop: size * 0.06,
            }}
          />
          <View
            style={{
              width: size * 0.68,
              height: size * 0.34,
              borderWidth: strokeWidth,
              borderBottomWidth: 0,
              borderColor: tint,
              borderTopLeftRadius: size * 0.34,
              borderTopRightRadius: size * 0.34,
              marginTop: size * 0.06,
            }}
          />
        </View>
      );

    case 'play':
      return (
        <View style={[styles.box, { width: size, height: size, justifyContent: 'center', alignItems: 'center' }]}>
          <View
            style={{
              width: 0,
              height: 0,
              borderTopWidth: size * 0.26,
              borderBottomWidth: size * 0.26,
              borderLeftWidth: size * 0.42,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
              borderLeftColor: tint,
              marginLeft: size * 0.1,
            }}
          />
        </View>
      );

    default:
      return <View style={{ width: size, height: size }} />;
  }
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'flex-start' },
});
