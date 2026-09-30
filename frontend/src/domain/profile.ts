/**
 * Aturan profil pemain.
 *
 * Satu sumber untuk Pengaturan dan lembar persona, supaya keduanya tidak pernah
 * berbeda aturan. Usia di sini adalah usia AKUN; usia persona cerita disimpan
 * terpisah di perjalanan (D-09).
 */

import type { TranslationKey } from '@/i18n';
import type { ResponseLocale } from './types';

export const NAME_MAX = 30;
export const AGE_MIN = 13;
export const AGE_MAX = 99;

export type PlayerProfile = {
  name: string;
  /** `null` berarti belum diisi. */
  age: number | null;
  responseLocale: ResponseLocale;
};

export const EMPTY_PROFILE: PlayerProfile = {
  name: '',
  age: null,
  responseLocale: 'id-ID',
};

/** Kesalahan nama dalam bentuk kunci terjemahan, bukan teks siap tampil. */
export function validateName(raw: string): TranslationKey | null {
  const value = raw.trim();
  if (value.length === 0 || value.length > NAME_MAX) {
    return 'persona.nameError';
  }
  return null;
}

export function validateAge(raw: string | number | null): TranslationKey | null {
  if (raw === null || raw === '') {
    return 'persona.ageError';
  }
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < AGE_MIN || parsed > AGE_MAX) {
    return 'persona.ageError';
  }
  return null;
}

/**
 * Profil dianggap lengkap bila nama sah dan usia sah. Hanya profil lengkap yang
 * boleh melewati lembar persona saat memulai perjalanan.
 */
export function isProfileComplete(profile: PlayerProfile): boolean {
  return validateName(profile.name) === null && validateAge(profile.age) === null;
}

export function normalizeProfile(raw: unknown): PlayerProfile {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_PROFILE };
  }
  const candidate = raw as Partial<PlayerProfile>;
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const age =
    typeof candidate.age === 'number' && !Number.isNaN(candidate.age) ? candidate.age : null;
  const responseLocale: ResponseLocale =
    candidate.responseLocale === 'en-US' ? 'en-US' : 'id-ID';
  return { name, age, responseLocale };
}
