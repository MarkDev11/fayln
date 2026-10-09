/**
 * Penyimpanan kunci-nilai — bagian netral.
 *
 * Berkas ini TIDAK mengimpor modul native apa pun, sehingga Metro dapat
 * menggantinya dengan varian platform: `kv.web.ts` di web, `kv.native.ts` di
 * iOS/Android.
 *
 * Mengapa dipisah: `require()` bersyarat tetap dianalisis Metro saat build, jadi
 * mengimpor expo-sqlite di sini akan menarik `expo-sqlite/web/worker.ts` ke bundel
 * web dan menggagalkan bundling.
 *
 * Primitif bersama (antarmuka, penyimpanan memori, pembaca/penulis JSON) tinggal
 * di `kvCore.ts` dan DIEKSPOR ULANG dari sini, supaya pemanggil lama yang
 * mengimpor `'@/storage/kv'` tetap bekerja tanpa perubahan.
 *
 * PENTING: berkas varian platform tidak boleh mengimpor dari `'./kv'`; lihat
 * penjelasan lengkap beserta kegagalan nyatanya di kepala `kvCore.ts`.
 */

export {
  InMemoryKeyValueStore,
  NativeKeyValueStore,
  readJson,
  writeJson,
} from './kvCore';
export type { KeyValueStore, NativeKeyValueStorage } from './kvCore';

import { InMemoryKeyValueStore, type KeyValueStore } from './kvCore';

let cached: KeyValueStore | null = null;

/**
 * Default netral: memori saja. Dipakai di lingkungan uji dan sebagai cadangan
 * bila varian platform tidak tersedia.
 *
 * Di web, Metro memilih `kv.web.ts` yang memakai `localStorage` sungguhan. Di
 * native, `kv.native.ts` memakai `expo-sqlite/kv-store`. Keduanya melaporkan
 * apakah data benar-benar bertahan lewat `isPersistent`; berkas ini jujur
 * menyatakan `false`.
 */
export function createKeyValueStore(): KeyValueStore {
  if (!cached) {
    cached = new InMemoryKeyValueStore();
  }
  return cached;
}

/** Hanya untuk pengujian. */
export function resetKeyValueStoreCache(): void {
  cached = null;
}
