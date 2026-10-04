import React, { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from './Icon';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget } from '@/theme/tokens';

export type SearchFieldProps = {
  value: string;
  onChange: (next: string) => void;
  testID?: string;
};

/**
 * Kolom pencarian judul.
 *
 * Catatan aksesibilitas: label eksplisit disediakan lewat `accessibilityLabel`,
 * karena placeholder tidak cukup bagi pembaca layar.
 *
 * Meneruskan `ref` ke `TextInput` di dalamnya. Fokus TIDAK diberikan lewat
 * `autoFocus`: bilah ini selalu terpasang (menunggu di luar layar), sehingga
 * `autoFocus` akan membuka papan ketik begitu aplikasi dijalankan. Pemanggil
 * memanggil `.focus()` saat bilah benar-benar dibuka.
 */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChange, testID },
  ref,
) {
  const { colors, scaled } = useTheme();
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      <Icon name="search" size={20} color={colors.inkSecondary} />
      <TextInput
        ref={ref}
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={t('home.searchPlaceholder')}
        placeholderTextColor={colors.inkSecondary}
        accessibilityLabel={t('home.searchLabel')}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        style={[
          styles.input,
          {
            color: colors.inkPrimary,
            fontSize: scaled(15),
            /*
             * Cincin fokus diambil alih dari peramban.
             *
             * Bawaannya memakai warna aksen sistem operasi — di beberapa mesin
             * tampil sebagai bingkai kuning tebal yang terlihat asing di tema
             * gelap ini. Tetap ADA, karena penanda fokus papan ketik wajib
             * terlihat (NFR-01); hanya warnanya yang disesuaikan.
             */
            outlineColor: colors.accent,
            outlineStyle: 'solid',
            outlineWidth: 1,
            outlineOffset: 2,
          },
        ]}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel={t('home.searchClear')}
          hitSlop={10}
          style={styles.clear}
        >
          <Icon name="close" size={18} color={colors.inkSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  /**
   * Tanpa latar, tanpa bingkai, tanpa padding samping.
   *
   * Kolom pencarian sebelumnya berupa kotak berisi yang bersaing dengan isi
   * halaman. Sebagai baris telanjang — hanya ikon dan teks — ia menyatu dengan
   * latar dan ikonnya sejajar dengan judul di atasnya.
   */
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget,
  },
  input: {
    flex: 1,
    paddingVertical: space.sm,
  },
  clear: {
    padding: space.xs,
  },
});
