import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Pilihan jeda Auto, dalam milidetik.
 *
 * Angka-angka ini SENGAJA menjadi satu-satunya nilai yang dapat dipilih, dan
 * `DEFAULT_AUTO_DELAY_MS` ikut disamakan ke salah satunya. Kalau bawaannya tidak
 * cocok dengan pilihan mana pun, pengaturnya terbuka tanpa satu pun pilihan
 * tersorot — dan itu terbaca seperti kontrol yang rusak, bukan seperti nilai
 * bawaan.
 *
 * Batasnya (`MIN_AUTO_DELAY_MS`/`MAX_AUTO_DELAY_MS` di `player/types.ts`) lebih
 * lebar daripada daftar ini: mesin tetap menerima nilai lain dari penyimpanan
 * lama, dan penjepitannya tetap berlaku.
 */
export const AUTO_DELAY_OPTIONS_MS = [1000, 2000, 3000, 5000] as const;

export type AutoDelayControlProps = {
  /** Jeda aktif, dalam milidetik. */
  value: number;
  onChange: (delayMs: number) => void;
  testID?: string;
};

/**
 * Pengatur kecepatan Auto.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA KONTROL INI ADA
 * ---------------------------------------------------------------------------
 * `engine.setAutoDelay` dan `autoDelayMs` di penyimpanan sudah ada sejak awal —
 * mesinnya lengkap, lengkap dengan penjepitan 1–5 detik. Yang tidak ada adalah
 * SATU PUN pemanggil: jeda Auto terpaku 2,2 detik dan pemain tidak dapat
 * mengubahnya. Itu kontrol mati dengan gejala yang paling sulit dilihat, karena
 * tidak ada yang tampak rusak — hanya ada kemampuan yang tidak pernah muncul.
 *
 * Hanya dirender saat Auto menyala. Saat Auto mati, jeda tidak berarti apa pun,
 * dan menampilkan pengaturnya hanya menambah barang yang harus diabaikan mata.
 */
export function AutoDelayControl({ value, onChange, testID }: AutoDelayControlProps) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View testID={testID} style={styles.root} pointerEvents="box-none">
      <Text variant="caption" style={[styles.label, { color: colors.onMedia }]}>
        {t('player.autoDelayLabel')}
      </Text>
      <View style={styles.options} pointerEvents="box-none">
        {AUTO_DELAY_OPTIONS_MS.map((ms) => {
          const selected = value === ms;
          const detik = ms / 1000;
          return (
            <Pressable
              key={ms}
              onPress={() => onChange(ms)}
              accessibilityRole="button"
              accessibilityLabel={t('player.autoDelayOption', { seconds: detik })}
              /*
               * Mode aktif ditandai `selected`, bukan warna saja: pembaca layar
               * tidak membacakan warna, dan pemain dengan buta warna tidak
               * melihat perbedaannya (NFR-01).
               */
              accessibilityState={{ selected }}
              hitSlop={6}
              testID={`auto-delay-${String(ms)}`}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.accent : CHIP_BG,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <Text
                variant="caption"
                weight={selected ? '700' : '400'}
                style={{ color: selected ? CHIP_INK_SELECTED : colors.onMedia }}
              >
                {t('player.autoDelayOption', { seconds: detik })}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Alas chip yang belum dipilih — gelap tembus pandang agar terbaca di atas gambar. */
const CHIP_BG = 'rgba(0, 0, 0, 0.45)';
/** Teks di atas aksen: warna tema gelap, karena `colors.accent` terang. */
const CHIP_INK_SELECTED = '#1D1B16';

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  label: {
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  options: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: 999,
    minWidth: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
