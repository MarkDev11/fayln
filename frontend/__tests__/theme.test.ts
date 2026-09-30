import { clampScale, resolveScheme, textSizeScale } from '@/theme/ThemeProvider';
import { colorsByScheme, darkColors, lightColors, maxFontScale, minFontScale, touchTarget } from '@/theme/tokens';

describe('token tema', () => {
  it('menyediakan palet terang dan gelap', () => {
    expect(colorsByScheme.light).toBe(lightColors);
    expect(colorsByScheme.dark).toBe(darkColors);
  });

  it('memakai alias semantik yang lengkap di kedua tema', () => {
    const lightKeys = Object.keys(lightColors).sort();
    const darkKeys = Object.keys(darkColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it('tidak memakai nilai warna kosong', () => {
    for (const value of Object.values(lightColors)) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
    for (const value of Object.values(darkColors)) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it('menetapkan target sentuh minimal 48 unit (NFR-03)', () => {
    expect(touchTarget).toBeGreaterThanOrEqual(48);
  });

  it('membatasi skala teks agar tetap dapat dibaca dan dapat diperbesar', () => {
    // Batas bawah harus mengizinkan preset terkecil, batas atas harus mencapai 200%.
    expect(minFontScale).toBeLessThanOrEqual(Math.min(...Object.values(textSizeScale)));
    expect(maxFontScale).toBeGreaterThanOrEqual(2);
  });
});

describe('resolveScheme', () => {
  it('mengikuti sistem ketika preferensi system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('jatuh ke terang ketika sistem tidak diketahui', () => {
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });

  it('menghormati preferensi eksplisit di atas pengaturan sistem', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});

describe('clampScale', () => {
  it('menjepit nilai di bawah batas minimum', () => {
    expect(clampScale(0.5)).toBe(minFontScale);
  });

  it('menjepit nilai di atas batas maksimum', () => {
    expect(clampScale(5)).toBe(2);
  });

  it('mempertahankan nilai dalam rentang', () => {
    expect(clampScale(1.25)).toBe(1.25);
  });

  it('menangani nilai tidak valid tanpa menghasilkan NaN', () => {
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it('menyediakan preset ukuran teks yang semuanya berada dalam rentang', () => {
    for (const scale of Object.values(textSizeScale)) {
      expect(scale).toBeGreaterThanOrEqual(minFontScale);
      expect(scale).toBeLessThanOrEqual(maxFontScale);
    }
  });
});
