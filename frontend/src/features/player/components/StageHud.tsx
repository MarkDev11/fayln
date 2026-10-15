import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Text } from '@/components/Text';

import { relationLabel } from '@/domain/labels';
import type { RelationStatus, RelationVocabularyEntry } from '@/domain/types';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export type StageHudProps = {
  /** Status hubungan dengan tokoh yang sedang tampil, atau `null` bila tak ada tokoh. */
  relationStatus: RelationStatus | 'unknown' | null;
  /** Nama tokoh yang hubungannya ditampilkan. */
  relationName: string | null;
  /** Label tempat adegan berlangsung, dari manifes latar dunia. */
  locationLabel: string | null;
  autoActive: boolean;
  autoDisabled?: boolean;
  onToggleAuto: () => void;
  onHideUi: () => void;
  /**
   * Kosakata hubungan versi dunia ini.
   *
   * Opsional supaya komponen tetap dapat dirender tanpa sesi (mis. dari riwayat
   * yang dipulihkan); saat itu label bawaan yang dipakai, bukan id mentah.
   */
  relationVocabulary?: readonly RelationVocabularyEntry[];
  testID?: string;
};

/**
 * Baris informasi di kepala panggung.
 *
 * Susunannya mengikuti komposisi yang diminta pemilik produk: hubungan tokoh di
 * kiri, tempat adegan di tengah, dan tombol bulat di kanan.
 *
 * ---------------------------------------------------------------------------
 * KENAPA "TEMPAT", BUKAN "WAKTU"
 * ---------------------------------------------------------------------------
 * Referensinya menampilkan blok waktu ("Waktu / Tahun Hongwu …"). Data waktu
 * cerita TIDAK ADA di fayLN: tabel `worlds` hanya menyimpan id dan tanggal
 * dibuat, dan mesin cerita tidak pernah menuliskan penanda waktu. Mengisinya
 * dengan jam perangkat akan menjadi angka karangan yang terlihat seperti fakta.
 *
 * Yang ditampilkan adalah label latar yang BENAR-BENAR sedang dipakai adegan —
 * diambil dari manifes aset dunia. Fungsinya sama: memberi tahu pemain di mana
 * ia berada, tanpa mengarang apa pun.
 */
export function StageHud({
  relationStatus,
  relationName,
  locationLabel,
  autoActive,
  autoDisabled = false,
  onToggleAuto,
  onHideUi,
  relationVocabulary = [],
  testID,
}: StageHudProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();

  const relationValue = relationStatus
    ? relationLabel(relationStatus, relationVocabulary, locale, t)
    : t('relation.unknown');

  return (
    <View testID={testID} style={styles.root} pointerEvents="box-none">
      {/* Hubungan dengan tokoh yang sedang tampil. */}
      <View
        style={styles.relation}
        accessible
        accessibilityRole="text"
        accessibilityLabel={
          relationName
            ? `${t('player.relationLabel')}: ${relationName}, ${relationValue}`
            : `${t('player.relationLabel')}: ${relationValue}`
        }
      >
        <View style={styles.badge}>
          <Icon name="heart" size={13} color={colors.onMedia} />
        </View>
        <View style={styles.texts}>
          <Text variant="caption" style={[styles.label, { color: colors.onMedia }]} numberOfLines={1}>
            {t('player.relationLabel')}
          </Text>
          <Text variant="label" style={[styles.value, { color: colors.onMedia }]} numberOfLines={2}>
            {relationValue}
          </Text>
        </View>
      </View>

      {/* Tempat adegan berlangsung. */}
      <View
        style={styles.location}
        pointerEvents="none"
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${t('player.locationLabel')}: ${locationLabel ?? t('player.locationUnknown')}`}
      >
        <Text variant="caption" style={[styles.label, { color: colors.onMedia }]} numberOfLines={1}>
          {t('player.locationLabel')}
        </Text>
        <Text
          variant="label"
          style={[styles.value, styles.locationValue, { color: colors.onMedia }]}
          numberOfLines={2}
        >
          {locationLabel ?? t('player.locationUnknown')}
        </Text>
      </View>

      <View style={styles.buttons} pointerEvents="box-none">
        <HudButton
          icon={autoActive ? 'pause' : 'play'}
          label={autoActive ? t('player.autoOn') : t('player.auto')}
          selected={autoActive}
          disabled={autoDisabled}
          onPress={onToggleAuto}
          ink={colors.onMedia}
          testID="player-hud-auto"
        />
        <HudButton
          icon="eyeOff"
          label={t('player.hideUi')}
          onPress={onHideUi}
          ink={colors.onMedia}
          testID="player-hud-hide"
        />
      </View>
    </View>
  );
}

function HudButton({
  icon,
  label,
  selected = false,
  disabled = false,
  onPress,
  testID,
  ink,
}: {
  icon: 'play' | 'pause' | 'eyeOff';
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  /** Warna dasar ikon (token `colors.onMedia`). */
  ink: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      /*
       * Mode aktif ditandai `selected` di samping warna ikon. Warna saja tidak
       * cukup: pembaca layar tidak membacakannya, dan pemain dengan buta warna
       * tidak melihat perbedaannya (NFR-01).
       *
       * `hitSlop` memperluas area sentuh sampai target minimum 44pt — tombol
       * 34×34 sendiri tidak cukup, dan tanpa jepitannya pemain di jari gemuk
       * tidak sengaja akan mengenai tombol sebelah.
       */
      accessibilityState={{ selected, disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.hudButton,
        { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={icon} size={16} color={selected ? HUD_INK_ACTIVE : ink} />
    </Pressable>
  );
}

/** Aksen untuk mode yang sedang menyala. */
const HUD_INK_ACTIVE = '#F2C879';
const HUD_BADGE_BG = 'rgba(0, 0, 0, 0.45)';
const HUD_SHADOW = 'rgba(0, 0, 0, 0.85)';

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  relation: {
    flexShrink: 1,
    maxWidth: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HUD_BADGE_BG,
  },
  texts: {
    flexShrink: 1,
  },
  location: {
    /*
     * DIPUSATKAN SECARA ABSOLUT, bukan lewat `flex: 1`.
     *
     * Dengan `flex: 1`, lebar blok tengah ditentukan oleh sisa ruang setelah
     * blok hubungan dan tombol — sehingga nama tempat yang panjang ("Kantor
     * Modern Dengan Pemandangan Kota") terpotong di tengah kata, dan makin
     * panjang blok hubungan, makin sedikit ruangnya.
     *
     * Sebagai lapisan absolut, lebarnya TIDAK bergantung pada tetangganya.
     * `pointerEvents="none"` supaya ia tidak menelan ketukan; blok hubungan dan
     * tombol tetap di atasnya secara visual karena tetap punya ruang sendiri di
     * kiri dan kanan (`maxWidth: 46%` berhenti sebelum keduanya).
     */
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
  },
  label: {
    opacity: 0.78,
    textShadowColor: HUD_SHADOW,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  value: {
    textShadowColor: HUD_SHADOW,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  /**
   * Lebar maksimum blok tengah.
   *
   * 46% berhenti tepat SEBELUM blok hubungan di kiri dan tombol bulat di kanan,
   * sehingga ketiganya tidak pernah saling menimpa walaupun nama tempatnya
   * panjang. Sisa 54% dibagi dua untuk sisi kiri dan kanan.
   */
  locationValue: {
    maxWidth: '46%',
    textAlign: 'center',
  },
  buttons: {
    /*
     * Lebar ALAMI, bukan `flex: 1`.
     *
     * Dengan `flex: 1`, tombol-tombol ini meminta sepertiga lebar layar padahal
     * hanya butuh ~76 px. Sisa ruangnya diambil dari blok hubungan, dan label
     * "Belum diketahui" terpotong menjadi "Belum dik…" — padahal ruangnya ada.
     */
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  /**
   * Tombol bulat setengah tembus pandang.
   *
   * Referensinya memakai tombol bulat gelap di atas ilustrasi, dan itu memang
   * yang dibutuhkan: ikon telanjang akan hilang di atas latar terang. Latarnya
   * tetap tembus pandang supaya gambarnya masih terbaca di baliknya.
   */
  hudButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HUD_BADGE_BG,
  },
});
