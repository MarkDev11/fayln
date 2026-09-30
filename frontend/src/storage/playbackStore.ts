/**
 * Port penyimpanan posisi baca.
 *
 * Yang disimpan hanya cursor dan preferensi baca — BUKAN seluruh cerita, dan bukan
 * rahasia apa pun. Pada produksi, beat canonical tetap milik server.
 *
 * Penyimpanan fisik ditangani `storage/kv`, yang punya implementasi terpisah per
 * platform. Dengan begitu hanya ada SATU berkas spesifik platform di proyek ini.
 */

import { createKeyValueStore, readJson, writeJson, type KeyValueStore } from './kv';

export type StoredPlayback = {
  journeyId: string;
  cursor: number;
  draft: string;
  autoDelayMs: number;
  savedAt: string;
};

export interface PlaybackStore {
  /** Apakah data bertahan setelah aplikasi ditutup. */
  readonly isPersistent: boolean;
  load(journeyId: string): Promise<StoredPlayback | null>;
  save(record: StoredPlayback): Promise<void>;
  remove(journeyId: string): Promise<void>;
}

export const playbackKeyFor = (journeyId: string) => `fayln.playback.${journeyId}`;

export class InMemoryPlaybackStore implements PlaybackStore {
  readonly isPersistent = false;
  private readonly records = new Map<string, StoredPlayback>();

  async load(journeyId: string): Promise<StoredPlayback | null> {
    return this.records.get(journeyId) ?? null;
  }

  async save(record: StoredPlayback): Promise<void> {
    this.records.set(record.journeyId, record);
  }

  async remove(journeyId: string): Promise<void> {
    this.records.delete(journeyId);
  }
}

/** Penyimpanan posisi baca di atas kunci-nilai. */
export class KvPlaybackStore implements PlaybackStore {
  constructor(private readonly store: KeyValueStore) {}

  get isPersistent(): boolean {
    return this.store.isPersistent;
  }

  async load(journeyId: string): Promise<StoredPlayback | null> {
    const parsed = await readJson<StoredPlayback>(this.store, playbackKeyFor(journeyId));
    // Validasi bentuk minimum agar data rusak tidak membuat layar gagal.
    if (!parsed || typeof parsed.cursor !== 'number' || parsed.journeyId !== journeyId) {
      return null;
    }
    return parsed;
  }

  async save(record: StoredPlayback): Promise<void> {
    await writeJson(this.store, playbackKeyFor(record.journeyId), record);
  }

  async remove(journeyId: string): Promise<void> {
    await this.store.remove(playbackKeyFor(journeyId));
  }
}

let cached: PlaybackStore | null = null;

export function createPlaybackStore(): PlaybackStore {
  if (!cached) {
    cached = new KvPlaybackStore(createKeyValueStore());
  }
  return cached;
}

/** Hanya untuk pengujian: mengosongkan cache penyimpanan. */
export function resetPlaybackStoreCache(): void {
  cached = null;
}
