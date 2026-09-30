import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  colorsByScheme,
  maxFontScale,
  minFontScale,
  type ColorScheme,
  type ThemeColors,
} from './tokens';

/** Preferensi tema yang dipilih pemain. `system` mengikuti pengaturan perangkat. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Preset ukuran teks dialog. Diterapkan sebagai pengali, bukan mengganti token. */
export type TextSizePreference = 'kecil' | 'normal' | 'besar' | 'sangatBesar';

export const textSizeScale: Record<TextSizePreference, number> = {
  kecil: 0.9,
  normal: 1,
  besar: 1.25,
  sangatBesar: 1.5,
};

export type ThemeValue = {
  preference: ThemePreference;
  scheme: ColorScheme;
  colors: ThemeColors;
  textSize: TextSizePreference;
  /** Pengali teks yang sudah dijepit antara minFontScale dan maxFontScale. */
  scale: number;
  setPreference: (next: ThemePreference) => void;
  setTextSize: (next: TextSizePreference) => void;
  /** Menghasilkan ukuran font final dari ukuran dasar token. */
  scaled: (base: number) => number;
};

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Skema warna yang mungkin dilaporkan platform.
 * React Native dapat mengembalikan `'unspecified'` selain light/dark/null.
 */
export type SystemColorScheme = 'light' | 'dark' | 'unspecified' | null | undefined;

export function resolveScheme(
  preference: ThemePreference,
  systemScheme: SystemColorScheme,
): ColorScheme {
  if (preference === 'system') {
    // Selain 'dark' yang eksplisit, termasuk 'unspecified', kita pakai tema terang.
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return preference;
}

export function clampScale(value: number): number {
  if (Number.isNaN(value)) {
    return 1;
  }
  return Math.min(maxFontScale, Math.max(minFontScale, value));
}

export type ThemeProviderProps = {
  children: ReactNode;
  /** Nilai awal; dipakai pengujian dan pemulihan preferensi tersimpan. */
  initialPreference?: ThemePreference;
  initialTextSize?: TextSizePreference;
};

export function ThemeProvider({
  children,
  initialPreference = 'system',
  initialTextSize = 'normal',
}: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [textSize, setTextSizeState] = useState<TextSizePreference>(initialTextSize);

  const scheme = resolveScheme(preference, systemScheme);
  const scale = clampScale(textSizeScale[textSize]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
  }, []);

  const setTextSize = useCallback((next: TextSizePreference) => {
    setTextSizeState(next);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      preference,
      scheme,
      colors: colorsByScheme[scheme],
      textSize,
      scale,
      setPreference,
      setTextSize,
      scaled: (base: number) => Math.round(base * scale),
    }),
    [preference, scheme, textSize, scale, setPreference, setTextSize],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme harus dipakai di dalam ThemeProvider.');
  }
  return value;
}
