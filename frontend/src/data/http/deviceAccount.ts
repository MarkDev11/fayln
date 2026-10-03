/**
 * Identitas akun perangkat.
 *
 * Backend belum punya autentikasi (B-02 masih terbuka), sehingga klien mengirim
 * sebuah ID akun lewat header `x-account-id`. Nilai itu dibuat sekali di perangkat
 * lalu dipakai terus, supaya perjalanan pemain tetap terbaca lintas sesi.
 *
 * PENTING: ini BUKAN autentikasi. Siapa pun yang mengetahui sebuah ID akun dapat
 * membaca perjalanan akun itu. Jangan dipakai untuk data nyata sebelum B-02 selesai.
 */

import * as SecureStore from 'expo-secure-store';

const ACCOUNT_KEY = 'fayln.accountId';

/** Dipakai pengujian agar tidak menyentuh penyimpanan perangkat. */
let memoryOverride: string | null = null;

export function setAccountIdForTesting(value: string | null): void {
  memoryOverride = value;
}

function randomId(): string {
  // Awalan `acc_` agar mudah dikenali di log server, tanpa memuat data pribadi.
  const random = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  return `acc_${random}${stamp}`;
}

/**
 * Mengambil ID akun perangkat, membuatnya bila belum ada.
 *
 * Bila penyimpanan aman tidak tersedia (misal di peramban), jatuh ke nilai acak
 * yang hanya bertahan selama sesi — aplikasi tetap dapat dipakai, hanya saja
 * perjalanannya tidak terbaca lagi setelah dimuat ulang.
 */
export async function deviceAccountId(): Promise<string> {
  if (memoryOverride) {
    return memoryOverride;
  }

  try {
    const stored = await SecureStore.getItemAsync(ACCOUNT_KEY);
    if (stored && stored.length > 0) {
      return stored;
    }

    const created = randomId();
    await SecureStore.setItemAsync(ACCOUNT_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}
