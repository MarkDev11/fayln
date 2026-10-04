/**
 * Penerjemah genre untuk komponen layar.
 *
 * Satu tempat yang tahu cara mengubah `GenreId` menjadi teks yang dibaca pemain.
 * Sebelum ini setiap komponen memanggil `t(genreLabelKey(genre))` sendiri, dan
 * itu hanya bekerja untuk genre yang ditulis di kode — genre buatan admin akan
 * tampil sebagai id mentah, atau lebih buruk, sebagai nama genre lain.
 *
 * Hook ini memakai kueri genre yang sama dengan chip Beranda. React Query
 * menyimpan hasilnya di satu entri cache, jadi memanggilnya di banyak komponen
 * tidak menambah permintaan jaringan.
 */

import { useCallback } from 'react';

import { useGenres } from '@/data/queries';
import { genreLabel } from '@/domain/labels';
import type { GenreId } from '@/domain/types';
import { useI18n } from '@/i18n';

export function useGenreLabel(): (genre: GenreId) => string {
  const { t, locale } = useI18n();
  const { data } = useGenres();

  return useCallback(
    (genre: GenreId) => {
      const option = data?.find((item) => item.genreId === genre);
      return genreLabel(genre, t, locale, option);
    },
    [t, locale, data],
  );
}
