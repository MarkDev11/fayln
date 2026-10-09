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

/**
 * Profil yang belum pernah disentuh pemain.
 *
 * Dipakai untuk memutuskan apakah profil boleh diisi otomatis dari akun. Nama
 * kosong DAN usia kosong berarti pemain belum pernah membuka Pengaturan, jadi
 * tidak ada pilihan yang bisa tertimpa.
 */
export function isProfileUntouched(profile: PlayerProfile): boolean {
  return profile.name.trim().length === 0 && profile.age === null;
}

/**
 * Mengisi kekosongan profil dari data akun, TANPA pernah menimpa isian pemain.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA INI ADA
 * ---------------------------------------------------------------------------
 * Layar daftar menanyakan nama dan usia, lalu menyimpannya di AKUN (server).
 * Pengaturan menyimpan profil di PERANGKAT. Keduanya tidak pernah bicara, jadi
 * pemain yang baru mendaftar menemukan halaman Profil KOSONG padahal ia baru
 * saja mengetikkan namanya — dan karena profil kosong berarti `isComplete`
 * bernilai salah, LEMBAR PERSONA muncul lagi saat memulai cerita.
 *
 * Hanya diisi bila profil benar-benar masih kosong. Kalau pemain sudah pernah
 * mengubah namanya di Pengaturan, mengubahnya lagi dari akun akan terasa seperti
 * penyimpanan yang tidak menghormati pilihannya — dan itu lebih buruk daripada
 * halaman yang perlu diisi sekali.
 *
 * Nama sengaja TIDAK menggantikan usia yang sudah ada, dan sebaliknya: setiap
 * kolom diisi sendiri-sendiri, sehingga profil setengah terisi tetap tertolong.
 */
export function adoptAccountFields(
  profile: PlayerProfile,
  account: { displayName: string; age: number | null },
): PlayerProfile {
  const nextName = profile.name.trim().length === 0 ? account.displayName.trim() : profile.name;

  /*
   * Usia dari akun hanya dipakai bila sah menurut aturan profil. Akun lama bisa
   * saja menyimpan usia di luar rentang yang sekarang berlaku, dan menyalinnya
   * begitu saja akan menghasilkan profil yang "terisi" tetapi tetap TIDAK lengkap
   * — pemain lalu melihat kolom berisi angka yang ditolak validasinya sendiri.
   */
  const accountAge = account.age;
  const ageUsable = accountAge !== null && validateAge(accountAge) === null;

  const nextAge = profile.age === null && ageUsable ? accountAge : profile.age;

  if (nextName === profile.name && nextAge === profile.age) {
    // Tidak ada yang berubah: kembalikan objek yang SAMA supaya pemanggil dapat
    // membandingkan dengan `===` dan tidak memicu render atau penulisan ulang.
    return profile;
  }

  return { ...profile, name: nextName, age: nextAge };
}
