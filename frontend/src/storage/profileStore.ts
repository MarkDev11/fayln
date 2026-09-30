/**
 * Penyimpanan profil pemain.
 *
 * Hanya menyimpan nama, usia, dan preferensi bahasa respons. Tidak ada rahasia.
 * Bila penyimpanan native tidak tersedia (web), data hanya bertahan selama
 * aplikasi terbuka dan UI menampilkannya lewat `isPersistent`.
 */

import { createKeyValueStore, readJson, writeJson } from './kv';

import { EMPTY_PROFILE, normalizeProfile, type PlayerProfile } from '@/domain/profile';

const PROFILE_KEY = 'fayln.profile.v1';

export interface ProfileStore {
  readonly isPersistent: boolean;
  load(): Promise<PlayerProfile>;
  save(profile: PlayerProfile): Promise<void>;
}

export class KeyValueProfileStore implements ProfileStore {
  constructor(private readonly store: ReturnType<typeof createKeyValueStore>) {}

  get isPersistent(): boolean {
    return this.store.isPersistent;
  }

  async load(): Promise<PlayerProfile> {
    const parsed = await readJson<unknown>(this.store, PROFILE_KEY);
    return normalizeProfile(parsed);
  }

  async save(profile: PlayerProfile): Promise<void> {
    await writeJson(this.store, PROFILE_KEY, profile);
  }
}

export class InMemoryProfileStore implements ProfileStore {
  readonly isPersistent = false;
  private profile: PlayerProfile = { ...EMPTY_PROFILE };

  async load(): Promise<PlayerProfile> {
    return this.profile;
  }

  async save(profile: PlayerProfile): Promise<void> {
    this.profile = profile;
  }
}

let cached: ProfileStore | null = null;

export function createProfileStore(): ProfileStore {
  if (!cached) {
    cached = new KeyValueProfileStore(createKeyValueStore());
  }
  return cached;
}

/** Hanya untuk pengujian. */
export function resetProfileStoreCache(): void {
  cached = null;
}

export { PROFILE_KEY };
