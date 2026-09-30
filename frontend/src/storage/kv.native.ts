/**
 * Penyimpanan kunci-nilai untuk iOS/Android.
 *
 * Metro memilih berkas ini otomatis pada platform native, sehingga impor
 * `expo-sqlite` tidak pernah masuk ke bundel web (worker-nya tidak dapat
 * diserialkan di sana dan akan menggagalkan bundling).
 *
 * Bila modul native gagal dimuat, kita jatuh ke memori dan melaporkan
 * `isPersistent: false` — bukan berpura-pura penyimpanan berhasil.
 */

import Storage from 'expo-sqlite/kv-store';

import {
  InMemoryKeyValueStore,
  NativeKeyValueStore,
  type KeyValueStore,
  type NativeKeyValueStorage,
} from './kv';

export {
  InMemoryKeyValueStore,
  NativeKeyValueStore,
  readJson,
  resetKeyValueStoreCache,
  writeJson,
} from './kv';
export type { KeyValueStore, NativeKeyValueStorage } from './kv';

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
