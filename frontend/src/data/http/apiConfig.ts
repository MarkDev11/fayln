/**
 * Konfigurasi alamat API.
 *
 * Bawaan menunjuk ke backend produksi di blitz.cloud supaya aplikasi langsung
 * terhubung tanpa langkah tambahan. Untuk pengembangan lokal, ganti lewat
 * `EXPO_PUBLIC_API_URL`, misalnya `http://localhost:8080`.
 *
 * Catatan Expo: variabel berawalan `EXPO_PUBLIC_` disisipkan ke dalam berkas
 * jadi pada saat build, bukan dibaca saat berjalan. Mengubahnya berarti build
 * ulang.
 */

/** Alamat backend produksi. */
export const PRODUCTION_API_URL = 'https://fayln-api.marky.blitz.cloud';

/**
 * Nilai khusus untuk memaksa gateway contoh.
 *
 * Berguna saat ingin memeriksa UI tanpa menyentuh server, misalnya saat backend
 * sedang tidak tersedia.
 */
export const MOCK_MODE = 'mock';

export type ApiMode = 'http' | 'mock';

export function apiBaseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (!raw || raw.length === 0) {
    return PRODUCTION_API_URL;
  }
  if (raw.toLowerCase() === MOCK_MODE) {
    return null;
  }
  return raw.replace(/\/+$/, '');
}

export function apiMode(): ApiMode {
  return apiBaseUrl() === null ? 'mock' : 'http';
}
