/**
 * Pemetaan nilai domain ke kunci terjemahan.
 *
 * Tujuan: memastikan tidak ada enum mentah dari server yang tampil ke pemain (NFR-12),
 * dan memusatkan satu tempat untuk memperbarui label ketika admin menambah nilai baru.
 */

import type { TranslationKey } from '@/i18n';
import type {
  ContentRating,
  GenreId,
  RelationStatus,
  WorldStatus,
} from './types';

const relationKeys: Record<RelationStatus, TranslationKey> = {
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
 * Status tak dikenal — termasuk status baru buatan admin — jatuh ke label netral,
 * bukan menampilkan string mentah atau membuat kartu kosong.
 */
export function relationLabelKey(status: RelationStatus | 'unknown'): TranslationKey {
  if (status === 'unknown') {
    return 'relation.unknown';
  }
  return relationKeys[status] ?? 'relation.unknown';
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

const genreKeys: Record<GenreId, TranslationKey> = {
  romance: 'genre.romance',
  drama: 'genre.drama',
  office: 'genre.office',
  fantasy: 'genre.fantasy',
  mystery: 'genre.mystery',
};

export function genreLabelKey(genre: GenreId): TranslationKey {
  return genreKeys[genre] ?? 'genre.drama';
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
