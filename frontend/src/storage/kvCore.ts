/**
 * Penyimpanan kunci-nilai — BAGIAN INTI YANG NETRAL PLATFORM.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA BERKAS INI TERPISAH DARI `kv.ts`
 * ---------------------------------------------------------------------------
 * Ini bukan pemisahan gaya, melainkan perbaikan atas kesalahan nyata.
 *
 * Sebelumnya antarmuka `KeyValueStore`, `InMemoryKeyValueStore`, dan
 * `readJson`/`writeJson` tinggal bersama `createKeyValueStore()` di `kv.ts`.
 * Metro memilih varian platform lewat nama berkas: di web, impor `'./kv'`
 * MENYELESAIKAN KE `kv.web.ts` — bukan ke `kv.ts`. Akibatnya `kv.web.ts` yang
 * mencoba memakai ulang primitif dari `'./kv'` mengimpor DIRINYA SENDIRI.
 *
 * Kegagalannya tidak halus: `export { InMemoryKeyValueStore } from './kv'`
 * menjadi getter yang memanggil dirinya sendiri tanpa henti, dan aplikasi mati
 * dengan `RangeError: Maximum call stack size exceeded` sebelum halaman pertama
 * sempat dirender. Metro bahkan sudah memperingatkannya lebih dulu
 * ("Require cycle: src/storage/kv.web.ts -> src/storage/kv.web.ts") — peringatan
 * yang mudah diabaikan sampai menjadi layar putih.
 *
 * ATURANNYA: berkas varian platform (`*.web.ts`, `*.native.ts`) TIDAK BOLEH
 * mengimpor dari nama modul yang ia gantikan. Primitiif bersama harus tinggal
 * di modul yang TIDAK punya varian — seperti berkas ini.
 */

export interface KeyValueStore {
  /**
   * Apakah data bertahan setelah aplikasi ditutup. UI tidak boleh mengklaim
   * penyimpanan permanen bila nilainya `false`.
   */
  readonly isPersistent: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class InMemoryKeyValueStore implements KeyValueStore {
  readonly isPersistent = false;
  private readonly records = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.records.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.records.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.records.delete(key);
  }
}

/** Bentuk minimal penyimpanan native; sengaja tidak bergantung tipe paket. */
export type NativeKeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export class NativeKeyValueStore implements KeyValueStore {
  readonly isPersistent = true;

  constructor(private readonly storage: NativeKeyValueStorage) {}

  get(key: string): Promise<string | null> {
    return this.storage.getItem(key);
  }

  set(key: string, value: string): Promise<void> {
    return this.storage.setItem(key, value);
  }

  remove(key: string): Promise<void> {
    return this.storage.removeItem(key);
  }
}

/** Membaca JSON dengan aman; data rusak dianggap tidak ada. */
export async function readJson<T>(
  store: KeyValueStore,
  key: string,
): Promise<T | null> {
  const raw = await store.get(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson<T>(
  store: KeyValueStore,
  key: string,
  value: T,
): Promise<void> {
  await store.set(key, JSON.stringify(value));
}
