/**
 * Penyimpanan kunci-nilai — bagian netral.
 *
 * Berkas ini TIDAK mengimpor modul native apa pun. Implementasi native ada di
 * `kv.native.ts`, dan Metro memilihnya otomatis pada iOS/Android.
 *
 * Mengapa dipisah: `require()` bersyarat tetap dianalisis Metro saat build, jadi
 * mengimpor expo-sqlite di sini akan menarik `expo-sqlite/web/worker.ts` ke bundel
 * web dan menggagalkan bundling.
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

let cached: KeyValueStore | null = null;

/**
 * Default netral: memori saja. Dipakai di web dan lingkungan uji.
 * Pemulihan lintas sesi tidak berlaku di sini, dan UI menampilkannya lewat
 * `isPersistent`.
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
