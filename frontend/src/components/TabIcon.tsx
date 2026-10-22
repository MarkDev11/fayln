import React from 'react';
import { View, type ColorValue } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

export type TabIconName = 'home' | 'journey' | 'settings';

export type TabIconProps = {
  name: TabIconName;
  size?: number;
  /** Warna dari tab bar: aksen saat aktif, tinta sekunder saat tidak. */
  color: ColorValue;
  focused?: boolean;
  testID?: string;
};

/**
 * Ikon navigasi bawah.
 *
 * Mengapa SVG, bukan `View` dengan border diputar seperti sebelumnya:
 *
 * 1. **Ketebalan garis tidak lagi bergantung pada rotasi.** Bentuk lama adalah
 *    kotak yang diputar 45°, sehingga ketebalan garisnya ikut miring dan pada
 *    24 px terlihat bergerigi. Path SVG memberi ketebalan yang sama di semua
 *    arah, dengan ujung membulat.
 * 2. **Ada dua keadaan, bukan satu warna.** Tab aktif memakai bentuk TERISI
 *    lembut, tab pasif memakai garis saja. Sebelumnya keduanya hanya dibedakan
 *    warna — dan warna saja tidak cukup bagi pemain dengan buta warna (NFR-01).
 * 3. **Ukuran optis disamakan.** Ketiga ikon digambar pada grid 24 yang sama
 *    dengan luas gambar serupa, sehingga tidak ada ikon yang tampak lebih besar
 *    dari yang lain di deretan tab.
 *
 * Pil di belakang ikon aktif adalah penanda posisi, bukan hiasan: ia membuat
 * tab yang sedang dibuka terlihat sebagai "tempat", bukan sekadar ikon berwarna.
 */
export function TabIcon({ name, size = 24, color, focused = false, testID }: TabIconProps) {
  const { colors } = useTheme();

  /*
   * Isian lembut diambil dari warna aksen tema dengan transparansi, bukan warna
   * baru: menambah warna ke-9 ke palet demi satu pil akan membuat tema terang
   * dan gelap menyimpang satu sama lain.
   *
   * Tab bar memberi `ColorValue`, bukan `string`. Bila suatu saat warnanya bukan
   * string (mis. warna platform), isian lembut dimatikan — lebih baik tanpa pil
   * daripada string rusak yang membuat SVG gagal dirender tanpa galat.
   */
  const warna = typeof color === 'string' ? color : null;
  const isianLembut = warna ? `${warna}22` : 'transparent';

  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: focused ? 14 : 0,
        paddingVertical: focused ? 4 : 0,
        borderRadius: 14,
        backgroundColor: focused ? isianLembut : 'transparent',
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === 'home' ? (
          <>
            {/* Atap dan badan rumah sebagai satu path agar sudutnya menyatu. */}
            <Path
              d="M4 10.6 L12 4 L20 10.6"
              stroke={color}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d="M6 9.9 V18.2 A1.8 1.8 0 0 0 7.8 20 H16.2 A1.8 1.8 0 0 0 18 18.2 V9.9"
              stroke={color}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={focused ? isianLembut : 'none'}
            />
            {/* Pintu: penanda "rumah", bukan hiasan — tanpa ini bentuknya hanya trapesium. */}
            <Path
              d="M10.2 20 V15.4 A1.8 1.8 0 0 1 13.8 15.4 V20"
              stroke={color}
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        ) : null}

        {name === 'journey' ? (
          <>
            {/* Buku terbuka: dua halaman bertemu di punggung. */}
            <Path
              d="M12 7.4 C9.9 6.1 6.9 5.7 4.2 6.4 V17.2 C6.9 16.5 9.9 16.9 12 18.2 C14.1 16.9 17.1 16.5 19.8 17.2 V6.4 C17.1 5.7 14.1 6.1 12 7.4 Z"
              stroke={color}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={focused ? isianLembut : 'none'}
            />
            <Path
              d="M12 7.4 V18.2"
              stroke={color}
              strokeWidth={1.7}
              strokeLinecap="round"
            />
          </>
        ) : null}

        {name === 'settings' ? (
          <>
            {/*
              Tiga baris penggeser. Dipilih dibanding roda gigi karena tiga
              garis ini terbaca sebagai "pengaturan" pada 24 px, sedangkan gigi
              roda gigi kehilangan detailnya dan berubah jadi bulatan bergerigi.
            */}
            <Line x1="3.6" y1="7" x2="20.4" y2="7" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1="3.6" y1="12" x2="20.4" y2="12" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
            <Line x1="3.6" y1="17" x2="20.4" y2="17" stroke={color} strokeWidth={1.8} strokeLinecap="round" />

            <Circle cx="9" cy="7" r="2.3" fill={focused ? color : colors.bgSurface} stroke={color} strokeWidth={1.8} />
            <Circle cx="15" cy="12" r="2.3" fill={focused ? color : colors.bgSurface} stroke={color} strokeWidth={1.8} />
            <Circle cx="7.4" cy="17" r="2.3" fill={focused ? color : colors.bgSurface} stroke={color} strokeWidth={1.8} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
