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
 * ---------------------------------------------------------------------------
 * DI PERAMBAN, `SecureStore` TIDAK ADA — dan itu membuat perjalanan hilang
 * ---------------------------------------------------------------------------
 * Bentuk pertama fungsi ini hanya memakai `SecureStore`, lalu jatuh ke nilai acak
 * ketika penyimpanannya tidak tersedia. Di peramban, `SecureStore` memang tidak
 * ada, sehingga SETIAP MUAT ULANG halaman menghasilkan akun baru.
 *
 * Akibatnya terlihat seperti bug yang sama sekali lain: pemain membuat perjalanan,
 * memuat ulang, lalu daftar Perjalanan berkata "Belum ada perjalanan" — padahal
 * perjalanannya ada, hanya saja tercatat pada akun yang sudah tidak dipakai lagi.
 * Ia juga membuat pemain dapat membuat perjalanan berkali-kali di dunia yang sama,
 * karena setiap sesi adalah akun yang berbeda.
 *
 * `localStorage` dipakai sebagai gantinya di peramban. Ia BUKAN penyimpanan aman,
 * tetapi identitas ini memang bukan autentikasi (lihat catatan di atas) — dan
 * akun yang tidak bertahan sama sekali lebih buruk daripada akun yang dapat
 * dibaca perangkat itu sendiri.
 */
export async function deviceAccountId(): Promise<string> {
  if (memoryOverride) {
    return memoryOverride;
  }

  const dariPeramban = bacaPenyimpananPeramban();
  if (dariPeramban) {
    return dariPeramban;
  }

  try {
    const stored = await SecureStore.getItemAsync(ACCOUNT_KEY);
    if (stored && stored.length > 0) {
      tulisPenyimpananPeramban(stored);
      return stored;
    }

    const created = randomId();
    await SecureStore.setItemAsync(ACCOUNT_KEY, created);
    tulisPenyimpananPeramban(created);
    return created;
  } catch {
    /*
     * Penyimpanan aman tidak tersedia — di peramban, dan mungkin di perangkat
     * yang penyimpanannya terkunci. Nilainya tetap disimpan di peramban bila
     * memungkinkan; hanya bila keduanya gagal, akunnya bertahan selama sesi.
     */
    const dibuat = randomId();
    tulisPenyimpananPeramban(dibuat);
    return dibuat;
  }
}

/** Membaca `localStorage` bila ada; null di lingkungan yang tidak punya. */
function bacaPenyimpananPeramban(): string | null {
  try {
    const nilai = globalThis.localStorage?.getItem(ACCOUNT_KEY);
    return nilai && nilai.length > 0 ? nilai : null;
  } catch {
    // Mode privat atau penyimpanan yang diblokir dapat melempar saat diakses.
    return null;
  }
}

/** Menulis `localStorage` bila ada; gagal dengan tenang bila tidak. */
function tulisPenyimpananPeramban(nilai: string): void {
  try {
    globalThis.localStorage?.setItem(ACCOUNT_KEY, nilai);
  } catch {
    // Tidak dapat ditulis — bukan alasan menggagalkan permintaan.
  }
}
