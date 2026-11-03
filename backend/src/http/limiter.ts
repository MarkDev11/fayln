/**
 * Pembatas laju jendela-tetap di memori.
 *
 * Dipakai untuk hal yang tidak cocok dengan `@fastify/rate-limit`: batas per
 * akun yang sudah TERBUKTI, batas percobaan masuk yang hanya menghitung
 * kegagalan, dan batas pendaftaran per alamat IP.
 *
 * Di memori dengan sengaja: untuk satu instance itu cukup, dan hitungannya
 * hilang saat restart. Bila nanti ada beberapa instance, ganti isinya dengan
 * Redis (Valkey tersedia di blitz.cloud) tanpa mengubah pemanggil.
 *
 * `maxKeys` menjaga memori: tanpa batas, penyerang yang mengirim kunci acak
 * (email palsu, IP palsu) dapat membuat peta ini tumbuh sampai proses habis
 * memori. Saat penuh, entri yang jendelanya sudah lewat dibuang lebih dulu;
 * bila masih penuh, entri tertua yang dibuang.
 */

type Entry = { count: number; firstAt: number };

export type LimitState = {
  /** Apakah kunci ini sudah melewati batasnya. */
  blocked: boolean;
  /** Berapa detik lagi jendelanya berakhir. 0 bila tidak diblokir. */
  retryAfterSec: number;
};

export class WindowLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly options: {
      max: number;
      windowMs: number;
      maxKeys?: number;
      /** Disuntikkan pengujian. */
      now?: () => number;
    },
  ) {}

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  /** Membaca keadaan TANPA menambah hitungan. */
  check(key: string): LimitState {
    const entry = this.live(key);
    if (!entry || entry.count < this.options.max) {
      return { blocked: false, retryAfterSec: 0 };
    }
    return { blocked: true, retryAfterSec: this.retryAfter(entry) };
  }

  /**
   * Mencatat satu KEGAGALAN. Keadaan sesudahnya sudah "diblokir" begitu
   * hitungan mencapai `max` — dipakai bersama `check()` SEBELUM percobaan
   * berikutnya (percobaan ke-`max` + 1 ditolak).
   */
  hit(key: string): LimitState {
    this.increment(key);
    return this.check(key);
  }

  /**
   * Menghitung satu PERMINTAAN yang dibatasi: `max` permintaan pertama dalam
   * jendela diizinkan, yang ke-`max` + 1 ditolak.
   */
  consume(key: string): LimitState {
    const entry = this.increment(key);
    if (entry.count <= this.options.max) {
      return { blocked: false, retryAfterSec: 0 };
    }
    return { blocked: true, retryAfterSec: this.retryAfter(entry) };
  }

  private increment(key: string): Entry {
    const existing = this.live(key);
    if (existing) {
      existing.count += 1;
      return existing;
    }

    this.makeRoom();
    const created: Entry = { count: 1, firstAt: this.now() };
    this.entries.set(key, created);
    return created;
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  reset(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /** Entri yang jendelanya masih berlaku; yang sudah lewat dibuang. */
  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.now() - entry.firstAt >= this.options.windowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private retryAfter(entry: Entry): number {
    const remaining = entry.firstAt + this.options.windowMs - this.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  private makeRoom(): void {
    const maxKeys = this.options.maxKeys ?? 10_000;
    if (this.entries.size < maxKeys) {
      return;
    }

    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.firstAt >= this.options.windowMs) {
        this.entries.delete(key);
      }
    }

    // Masih penuh: buang yang tertua. Map menjaga urutan penyisipan.
    while (this.entries.size >= maxKeys) {
      const oldest = this.entries.keys().next();
      if (oldest.done) {
        break;
      }
      this.entries.delete(oldest.value);
    }
  }
}
