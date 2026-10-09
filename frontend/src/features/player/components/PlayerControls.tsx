import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Text } from '@/components/Text';

import { useTheme } from '@/theme/ThemeProvider';
import { space, touchTarget } from '@/theme/tokens';

export type ControlItem = {
  id: string;
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export type PlayerControlsProps = {
  items: ControlItem[];
  testID?: string;
};

/**
 * Baris kontrol pemutar — TANPA bingkai.
 *
 * Setiap kontrol memiliki label teks, bukan hanya ikon, sehingga status aktif
 * (misalnya Auto menyala) tidak bergantung pada warna saja (NFR-01).
 *
 * ---------------------------------------------------------------------------
 * MENGAPA BINGKAINYA DIBUANG
 * ---------------------------------------------------------------------------
 * Bentuk lamanya adalah empat chip bergaris lengkap dengan latar sendiri. Di
 * layar pemain, chip-chip itu duduk di atas kotak dialog yang juga bergaris —
 * dua lapis bingkai yang saling bersaing. Pemilik produk menyebut hasilnya
 * "masih templat", dan tepat: yang paling menonjol di layar adalah bingkai,
 * bukan cerita.
 *
 * Sekarang yang tersisa hanya teks tebal, dipisah garis tipis, dan mode aktif
 * ditandai warna aksen. Tidak ada `borderWidth`, tidak ada `borderRadius`,
 * tidak ada latar per item. Ikon tetap ada karena ia yang membuat baris ini
 * dapat dipindai sekilas — tetapi ukurannya tidak lagi mengalahkan teks.
 */
export function PlayerControls({ items, testID }: PlayerControlsProps) {
  const { colors } = useTheme();

  return (
    <View testID={testID} style={styles.row}>
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 ? (
            /*
             * Garis pemisah, bukan bingkai. Lebarnya 1 dan tingginya terbatas,
             * sehingga ia memisahkan tanpa membentuk kotak.
             *
             * `accessibilityElementsHidden` + `importantForAccessibility`: garis
             * ini murni hiasan; pembaca layar tidak boleh berhenti padanya.
             */
            <View
              style={[styles.divider, { backgroundColor: colors.line }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}
          <Pressable
            onPress={item.onPress}
            disabled={item.disabled}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: Boolean(item.active), disabled: Boolean(item.disabled) }}
            style={({ pressed }) => [
              styles.item,
              { opacity: item.disabled ? 0.45 : pressed ? 0.6 : 1 },
            ]}
          >
            <Icon
              name={item.icon}
              size={15}
              color={item.active ? colors.accent : colors.inkSecondary}
            />
            {/*
              * Teks tebal, dan TIDAK lagi bergantung pada `tone` untuk mode aktif.
              * Sebelumnya label aktif memakai `tone="accent"` — kalau token warna
              * aksen tidak terdefinisi, labelnya menghilang tanpa galat. Yang
              * diwarnai sekarang hanya ikon; teksnya selalu warna utama.
              */}
            <Text variant="caption" weight="700" tone="primary">
              {item.label}
            </Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: touchTarget,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
  },
});
