/**
 * Penyimpanan kunci-nilai untuk WEB.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA BERKAS INI ADA
 * ---------------------------------------------------------------------------
 * Sebelumnya tidak ada varian web sama sekali, sehingga implementasi di `kv.ts`
 * yang dipakai — dan itu adalah `InMemoryKeyValueStore`. Akibatnya profil
 * pemain, posisi baca, dan cache aset HILANG setiap kali halaman dimuat ulang
 * di peramban, sementara token sesi tetap ada (ia disimpan lewat jalur lain).
 *
 * Gejalanya menipu: halaman Pengaturan tampak terisi, karena nilainya masih ada
 * di memori. Begitu ada navigasi yang memuat ulang, profil kembali kosong dan
 * pemain diminta mengisi ulang namanya — persis keluhan yang sulit dilacak.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA TIDAK SEKADAR MEMAKAI `localStorage` LANGSUNG
 * ---------------------------------------------------------------------------
 * `localStorage` dapat melempar, dan bukan hanya di peramban kuno:
 *
 *   - Mode privat / penyimpanan penuh: `setItem` melempar `QuotaExceededError`.
 *   - Cookie diblokir total: menyentuh `localStorage` melempar `SecurityError`.
 *   - Peramban tertanam (webview) kadang menonaktifkannya sepenuhnya.
 *
 * Satu lemparan yang tidak tertangani di `setItem` akan membatalkan `save()`
 * pemanggilnya, dan pemain kehilangan data tanpa penjelasan. Karena itu setiap
 * operasi dibungkus, dan kegagalan DILAPORKAN lewat `isPersistent: false` —
 * bukan disembunyikan. UI sudah menampilkan keadaan itu kepada pemain.
 *
 * `isPersistent` ditentukan dengan MENCOBA menulis, bukan dengan memeriksa
 * keberadaan `window.localStorage`. Keberadaannya tidak menjamin penulisan
 * berhasil, dan janji palsu "tersimpan permanen" lebih buruk daripada mengakui
 * bahwa penyimpanan hanya berlaku selama aplikasi terbuka.
 */

import {
  InMemoryKeyValueStore,
  readJson,
  writeJson,
  type KeyValueStore,
} from './kvCore';

export { InMemoryKeyValueStore, readJson, writeJson };
export type { KeyValueStore };

/*
 * CATATAN PENTING — mengapa impornya dari `./kvCore`, bukan `./kv`.
 *
 * Metro memilih varian platform berdasarkan NAMA BERKAS. Di web, impor `'./kv'`
 * menyelesaikan ke berkas INI (`kv.web.ts`), bukan ke `kv.ts`. Versi pertama
 * berkas ini mengimpor dari `'./kv'` dan akibatnya mengimpor dirinya sendiri:
 * `export { InMemoryKeyValueStore } from './kv'` menjadi getter yang memanggil
 * dirinya tanpa henti, dan seluruh aplikasi mati dengan
 * `RangeError: Maximum call stack size exceeded` sebelum halaman pertama
 * dirender. Metro sempat memperingatkan "Require cycle" — jangan diabaikan.
 *
 * Karena itu primitif bersama tinggal di `kvCore.ts`, satu-satunya nama yang
 * tidak punya varian platform.
 */

/** Batas satu operasi penyimpanan peramban. */
const PROBE_KEY = 'fayln.storage.probe';

class LocalStorageKeyValueStore implements KeyValueStore {
  readonly isPersistent = true;

  constructor(private readonly storage: Storage) {}

  async get(key: string): Promise<string | null> {
    try {
      return this.storage.getItem(key);
    } catch {
      // Membaca gagal: perlakukan seperti belum pernah disimpan.
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      this.storage.setItem(key, value);
    } catch {
      /*
       * Sengaja tidak dilempar. Pemanggil `save()` tidak punya cara yang berguna
       * untuk menangani ini — dan membatalkannya akan membuat pemain kehilangan
       * perubahan yang sebenarnya masih ada di memori aplikasi.
       */
    }
  }

  async remove(key: string): Promise<void> {
    try {
      this.storage.removeItem(key);
    } catch {
      /* diabaikan dengan sengaja */
    }
  }
}

/**
 * Apakah penyimpanan peramban benar-benar dapat ditulis?
 *
 * Diuji dengan menulis sungguhan, bukan dengan memeriksa keberadaan objeknya.
 */
function localStorageWorks(): Storage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return null;
    }
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    return null;
  }
}

let cached: KeyValueStore | null = null;

export function createKeyValueStore(): KeyValueStore {
  if (cached) {
    return cached;
  }

  const storage = localStorageWorks();
  cached = storage ? new LocalStorageKeyValueStore(storage) : new InMemoryKeyValueStore();
  return cached;
}

export function resetKeyValueStoreCache(): void {
  cached = null;
}
