/**
 * Penyimpanan kunci-nilai untuk iOS/Android.
 *
 * Metro memilih berkas ini otomatis pada platform native, sehingga impor
 * `expo-sqlite` tidak pernah masuk ke bundel web (worker-nya tidak dapat
 * diserialkan di sana dan akan menggagalkan bundling).
 *
 * Bila modul native gagal dimuat, kita jatuh ke memori dan melaporkan
 * `isPersistent: false` — bukan berpura-pura penyimpanan berhasil.
 *
 * Impor primitif dari `./kvCore`, BUKAN `./kv`: di native, `'./kv'` akan
 * menyelesaikan ke berkas ini sendiri. Lihat `kvCore.ts` untuk kegagalan nyata
 * yang pernah ditimbulkan oleh kekeliruan itu.
 */

import Storage from 'expo-sqlite/kv-store';

import {
  InMemoryKeyValueStore,
  NativeKeyValueStore,
  type KeyValueStore,
  type NativeKeyValueStorage,
} from './kvCore';

export {
  InMemoryKeyValueStore,
  NativeKeyValueStore,
  readJson,
  writeJson,
} from './kvCore';
export type { KeyValueStore, NativeKeyValueStorage } from './kvCore';

let cached: KeyValueStore | null = null;

export function createKeyValueStore(): KeyValueStore {
  if (cached) {
    return cached;
  }

  try {
    const storage = Storage as unknown as NativeKeyValueStorage;
    if (storage && typeof storage.getItem === 'function') {
      cached = new NativeKeyValueStore(storage);
      return cached;
    }
  } catch {
    // Diabaikan dengan sengaja: fallback memori adalah perilaku yang diinginkan.
  }

  cached = new InMemoryKeyValueStore();
  return cached;
}
