/**
 * Pemetaan nilai domain ke kunci terjemahan.
 *
 * Tujuan: memastikan tidak ada enum mentah dari server yang tampil ke pemain (NFR-12),
 * dan memusatkan satu tempat untuk memperbarui label ketika admin menambah nilai baru.
 */

import type { TranslateFn, TranslationKey, UiLocale } from '@/i18n';
import type {
  ContentRating,
  GenreId,
  GenreOption,
  RelationStatus,
  RelationVocabularyEntry,
  WorldStatus,
} from './types';

/**
 * Label BAWAAN untuk delapan status lama.
 *
 * Ini hanya cadangan. Sejak status hubungan menjadi data, label yang benar
 * datang bersama sesi di `relationVocabulary` — dan itulah yang dipakai lebih
 * dahulu. Peta ini menjaga perjalanan lama tetap terbaca, dan menjaga kunci
 * terjemahan yang sudah ada tidak menjadi yatim.
 */
const relationKeys: Record<string, TranslationKey> = {
  normal: 'relation.normal',
  hangat: 'relation.hangat',
  waspada: 'relation.waspada',
  tegang: 'relation.tegang',
  renggang: 'relation.renggang',
  dekat: 'relation.dekat',
  sayang: 'relation.sayang',
  cinta: 'relation.cinta',
};

/**
 * Kunci terjemahan cadangan untuk sebuah status, atau `null` bila status itu
 * hanya ada di kosakata dunia.
 *
 * `null` di sini BUKAN kegagalan: ia berarti labelnya harus diambil dari
 * kosakata, dan pemanggil yang memutuskan itu.
 */
export function relationLabelKey(status: RelationStatus | 'unknown'): TranslationKey | null {
  if (status === 'unknown') {
    return 'relation.unknown';
  }
  return relationKeys[status] ?? null;
}

/**
 * Label yang ditampilkan untuk sebuah status hubungan.
 *
 * ---------------------------------------------------------------------------
 * URUTANNYA PENTING, DAN INI ALASANNYA
 * ---------------------------------------------------------------------------
 * 1. KOSAKATA DUNIA. Inilah label yang benar untuk status apa pun, termasuk
 *    status kesembilan yang dibuat admin. Ia datang bersama sesi.
 * 2. KUNCI TERJEMAHAN BAWAAN. Untuk delapan status lama, dan untuk keadaan
 *    kosakata belum termuat (mis. kartu dirender sebelum sesi tiba).
 * 3. ID MENTAH. Status yang sah tetapi tidak ada di kosakata maupun daftar
 *    bawaan tetap ditampilkan apa adanya.
 *
 * Langkah ketiga sengaja BUKAN "Belum diketahui". Menampilkan id mentah memang
 * kurang enak dibaca, tetapi ia dapat ditelusuri; sedangkan "Belum diketahui"
 * memberi tahu pemain bahwa ada yang rusak tanpa mengatakan apa — dan itu
 * menyembunyikan satu-satunya petunjuk yang ada.
 */
export function relationLabel(
  status: RelationStatus | 'unknown',
  vocabulary: readonly RelationVocabularyEntry[],
  locale: UiLocale,
  t: TranslateFn,
): string {
  if (status === 'unknown') {
    return t('relation.unknown');
  }

  const definisi = vocabulary.find((item) => item.relationId === status);
  if (definisi) {
    const label = locale === 'en-US' ? definisi.labelEn || definisi.labelId : definisi.labelId;
    if (label.trim().length > 0) {
      return label;
    }
  }

  const kunci = relationLabelKey(status);
  if (kunci) {
    return t(kunci);
  }

  return status;
}

/** Nada warna untuk status hubungan. Warna hanya pelengkap; teks selalu ada. */
export function relationTone(
  status: RelationStatus | 'unknown',
): 'success' | 'warning' | 'danger' | 'secondary' {
  switch (status) {
    case 'dekat':
    case 'sayang':
    case 'cinta':
    case 'hangat':
      return 'success';
    case 'waspada':
    case 'tegang':
      return 'warning';
    case 'renggang':
      return 'danger';
    case 'normal':
    case 'unknown':
    default:
      return 'secondary';
  }
}

/**
 * Terjemahan untuk genre bawaan.
 *
 * Peta ini SENGAJA tidak lengkap dan tidak boleh dianggap lengkap: admin dapat
 * membuat genre baru dari panel, dan genre seperti itu tidak akan pernah punya
 * kunci di sini. Karena itu `genreLabelKey` mengembalikan `null` alih-alih
 * memaksakan pengganti — lihat `genreLabel`.
 */
const genreKeys: Record<string, TranslationKey> = {
  romance: 'genre.romance',
  drama: 'genre.drama',
  office: 'genre.office',
  fantasy: 'genre.fantasy',
  mystery: 'genre.mystery',
};

/**
 * Kunci terjemahan sebuah genre, atau `null` bila tidak ada.
 *
 * Sebelumnya fungsi ini mengembalikan `'genre.drama'` sebagai pengganti. Itu
 * berarti genre buatan admin tampil dengan NAMA GENRE LAIN — bukan tanpa label,
 * melainkan salah label, dan itu jauh lebih buruk karena tampak benar.
 */
export function genreLabelKey(genre: GenreId): TranslationKey | null {
  return genreKeys[genre] ?? null;
}

/**
 * Label yang ditampilkan untuk sebuah genre.
 *
 * Tiga lapis, berurutan dari yang paling dipercaya:
 *
 * 1. Kunci terjemahan — untuk genre bawaan, sehingga labelnya ikut berganti saat
 *    bahasa antarmuka diganti.
 * 2. Label dari server — untuk genre buatan admin. Bahasa dipilih menurut locale
 *    antarmuka, bukan menurut pengaturan server.
 * 3. Id apa adanya — hanya bila server belum sempat menjawab. Menampilkan id
 *    mentah untuk sesaat masih lebih baik daripada menampilkan genre yang salah.
 */
export function genreLabel(
  genre: GenreId,
  translate: TranslateFn,
  locale: UiLocale,
  option?: GenreOption,
): string {
  const key = genreLabelKey(genre);
  if (key) {
    return translate(key);
  }
  if (option) {
    return locale === 'en-US' ? option.labelEn : option.labelId;
  }
  return genre;
}

const statusKeys: Record<WorldStatus, TranslationKey> = {
  draft: 'world.status.draft',
  published: 'world.status.published',
  retired: 'world.status.retired',
  revoked: 'world.status.revoked',
};

export function worldStatusLabelKey(status: WorldStatus): TranslationKey {
  return statusKeys[status] ?? 'world.status.draft';
}

const ratingKeys: Record<ContentRating, TranslationKey> = {
  all: 'world.rating.all',
  '13_plus': 'world.rating.13_plus',
  '18_plus': 'world.rating.18_plus',
};

export function contentRatingLabelKey(rating: ContentRating): TranslationKey {
  return ratingKeys[rating] ?? 'world.rating.all';
}
