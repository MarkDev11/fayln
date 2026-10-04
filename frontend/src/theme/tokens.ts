/**
 * Token desain fayLN.
 *
 * Sumber normatif: docs/05-sistem-desain-dan-aset.md.
 * Dua lapis: palet mentah -> alias semantik. Komponen HANYA menyentuh alias.
 * Nilai di bawah adalah usulan dokumen dan belum diaudit kontras secara final.
 */

export const raw = {
  // Netral hangat — terang
  sand50: '#F6F3EC',
  sand100: '#ECE7DA',
  sand200: '#D8D2C2',
  sand900: '#1D1B16',
  sand700: '#5C574B',

  // Netral hangat — gelap
  ink900: '#12110D',
  ink800: '#1C1B16',
  ink700: '#26241D',
  ink300: '#38352A',
  ink100: '#F5F1E6',
  ink200: '#C7C0AE',

  white: '#FFFFFF',

  // Aksen tanah
  clay700: '#5E2E20',
  clay600: '#7C3F2C',
  clay400: '#D9977B',
  clay300: '#E8B79C',

  // Status
  green600: '#2E6B4F',
  green300: '#7CC79E',
  amber600: '#9A6A00',
  amber300: '#E3B341',
  red600: '#A83232',
  red300: '#E58E8E',
  blue600: '#1F6FEB',
  blue300: '#7FB3FF',
} as const;

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  bgApp: string;
  bgSurface: string;
  bgMuted: string;
  inkPrimary: string;
  inkSecondary: string;
  inkInverse: string;
  accent: string;
  accentStrong: string;
  success: string;
  warning: string;
  danger: string;
  line: string;
  focus: string;
  /** Lapisan pelindung agar teks dialog tetap terbaca di atas ilustrasi. */
  scrim: string;
  /** Placeholder netral ketika aset gagal dimuat. */
  placeholder: string;
  /**
   * Alias untuk teks dan penanda yang berada di atas media berscrim (docs/05 §8.11).
   * `inkInverse` tidak dapat dipakai karena bernilai gelap pada tema gelap.
   */
  onMedia: string;
};

export const lightColors: ThemeColors = {
  bgApp: raw.sand50,
  bgSurface: raw.white,
  bgMuted: raw.sand100,
  inkPrimary: raw.sand900,
  inkSecondary: raw.sand700,
  inkInverse: raw.white,
  accent: raw.clay600,
  accentStrong: raw.clay700,
  success: raw.green600,
  warning: raw.amber600,
  danger: raw.red600,
  line: raw.sand200,
  focus: raw.blue600,
  scrim: 'rgba(29, 27, 22, 0.72)',
  placeholder: raw.sand100,
  onMedia: raw.white,
};

export const darkColors: ThemeColors = {
  bgApp: raw.ink900,
  bgSurface: raw.ink800,
  bgMuted: raw.ink700,
  inkPrimary: raw.ink100,
  inkSecondary: raw.ink200,
  inkInverse: raw.ink900,
  accent: raw.clay400,
  accentStrong: raw.clay300,
  success: raw.green300,
  warning: raw.amber300,
  danger: raw.red300,
  line: raw.ink300,
  focus: raw.blue300,
  scrim: 'rgba(0, 0, 0, 0.72)',
  placeholder: raw.ink700,
  onMedia: raw.white,
};

export const colorsByScheme: Record<ColorScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

/** Spasi kelipatan 4. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Radius 12–18; dokumen melarang radius besar bergaya generik. */
export const radius = {
  card: 14,
  button: 12,
  sheet: 18,
  chip: 999,
  input: 12,
  /**
   * Permukaan Beranda (docs/05 §8.11). Mengikuti aturan radius 4–8 untuk
   * permukaan baru; berbeda dari `card`/`button` yang belum mengikuti pass
   * penyelarasan radius se-aplikasi (keputusan terbuka D1, sengaja ditunda).
   */
  tile: 8,
} as const;

export const fontSize = {
  caption: 12,
  small: 13,
  body: 15,
  dialog: 17,
  title: 16,
  screen: 22,
  display: 28,
} as const;

export const lineHeight = {
  caption: 16,
  small: 18,
  body: 22,
  dialog: 27,
  title: 22,
  screen: 28,
} as const;

/** Target sentuh minimum. Dirujuk dari rekomendasi Android 48dp, bukan klaim WCAG. */
export const touchTarget = 48;

/**
 * Batas skala teks.
 *
 * `minFontScale` sengaja di bawah 1 agar pemain yang ingin teks lebih rapat dapat
 * memilihnya; `maxFontScale` 2 memenuhi kebutuhan pembesaran 200% (NFR-02).
 * Batas bawah tidak boleh lebih besar dari preset terkecil, jika tidak preset itu
 * akan selalu dijepit dan tidak berefek.
 */
export const minFontScale = 0.9;
export const maxFontScale = 2;
