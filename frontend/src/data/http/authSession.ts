/**
 * Sesi pemain: token masuk yang disimpan di perangkat.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA BERKAS INI ADA
 * ---------------------------------------------------------------------------
 * Sebelumnya identitas pemain adalah id acak yang dibuat perangkat sendiri
 * (`deviceAccount.ts`) dan dikirim apa adanya. Itu bukan autentikasi: siapa pun
 * yang mengetahui sebuah id dapat membaca perjalanan akun itu. Server sekarang
 * menuntut token yang dibuktikan, dan berkas ini yang menyimpannya.
 *
 * ---------------------------------------------------------------------------
 * PELAJARAN YANG DIPAKAI DARI deviceAccount.ts
 * ---------------------------------------------------------------------------
 * 1. `SecureStore` TIDAK ADA di peramban. Bentuk pertama `deviceAccount.ts` hanya
 *    memakainya, sehingga setiap muat ulang halaman menghasilkan id baru dan
 *    pemain kehilangan perjalanannya. Di sini `localStorage` dipakai sebagai
 *    cadangan sejak awal.
 *
 * 2. PEMBACAAN HARUS MEMOIZED. Beranda memanggil beberapa endpoint sekaligus;
 *    tanpa memoization, masing-masing membaca "belum ada token" lalu memulai
 *    pembacaannya sendiri. Untuk token, akibatnya lebih halus tetapi tetap nyata:
 *    beberapa permintaan berangkat tanpa header.
 */

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'fayln.sessionToken';

/** Dipakai pengujian agar tidak menyentuh penyimpanan perangkat. */
let memoryOverride: string | null | undefined;

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

export type AccountInfo = {
  accountId: string;
  email: string;
  displayName: string;
  age: number | null;
};

/** Mengganti token untuk pengujian. `undefined` mengembalikan perilaku normal. */
export function setSessionForTesting(value: string | null | undefined): void {
  memoryOverride = value;
}

/** Memberi tahu bagian lain bahwa sesi berubah (masuk atau keluar). */
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(token: string | null): void {
  for (const listener of listeners) {
    listener(token);
  }
}

/**
 * Token yang sedang dibaca, supaya pemanggil bersamaan menunggu hasil yang sama.
 *
 * Lihat catatan di `deviceAccount.ts`: menyimpan JANJINYA, bukan hasilnya, adalah
 * yang membuatnya benar.
 */
let sedangDibaca: Promise<string | null> | null = null;

export function readToken(): Promise<string | null> {
  if (memoryOverride !== undefined) {
    return Promise.resolve(memoryOverride);
  }
  sedangDibaca ??= bacaToken();
  return sedangDibaca;
}

/** Nilai sinkron bila sudah ada di memori. Dipakai pengambilan header. */
let cachedToken: string | null = null;

/** Mengembalikan token yang sudah dibaca, tanpa menunggu penyimpanan. */
export function cachedTokenSync(): string | null {
  return cachedToken;
}

async function bacaToken(): Promise<string | null> {
  const dariPeramban = bacaPeramban();
  if (dariPeramban) {
    cachedToken = dariPeramban;
    return dariPeramban;
  }

  try {
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    if (stored && stored.length > 0) {
      cachedToken = stored;
      tulisPeramban(stored);
      return stored;
    }
  } catch {
    // Penyimpanan aman tidak tersedia. Bukan alasan menggagalkan permintaan.
  }

  cachedToken = null;
  return null;
}

/** Menyimpan token setelah masuk atau daftar. */
export async function saveToken(token: string): Promise<void> {
  memoryOverride = undefined;
  cachedToken = token;
  // Pembacaan berikutnya harus memakai nilai baru, bukan janji lama.
  sedangDibaca = Promise.resolve(token);
  tulisPeramban(token);

  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Di peramban ini memang selalu gagal; `localStorage` sudah menyimpannya.
  }

  notify(token);
}

/** Menghapus token saat keluar. */
export async function clearToken(): Promise<void> {
  memoryOverride = undefined;
  cachedToken = null;
  sedangDibaca = Promise.resolve(null);
  hapusPeramban();

  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Tidak ada yang perlu dilakukan.
  }

  notify(null);
}

/** Membaca `localStorage` bila ada; null di lingkungan yang tidak punya. */
function bacaPeramban(): string | null {
  try {
    const nilai = globalThis.localStorage?.getItem(TOKEN_KEY);
    return nilai && nilai.length > 0 ? nilai : null;
  } catch {
    // Mode privat atau penyimpanan yang diblokir dapat melempar saat diakses.
    return null;
  }
}

function tulisPeramban(nilai: string): void {
  try {
    globalThis.localStorage?.setItem(TOKEN_KEY, nilai);
  } catch {
    // Tidak dapat ditulis — bukan alasan menggagalkan permintaan.
  }
}

function hapusPeramban(): void {
  try {
    globalThis.localStorage?.removeItem(TOKEN_KEY);
  } catch {
    // Diabaikan.
  }
}
