import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { EMPTY_PROFILE, isProfileComplete, type PlayerProfile } from '@/domain/profile';
import { createProfileStore, type ProfileStore } from '@/storage/profileStore';

export type ProfileValue = {
  profile: PlayerProfile;
  /** Masih memuat profil tersimpan; jangan putuskan apa pun sebelum selesai. */
  isLoading: boolean;
  /** Apakah profil bertahan setelah aplikasi ditutup. */
  isPersistent: boolean;
  /** Profil lengkap boleh melewati lembar persona saat memulai perjalanan. */
  isComplete: boolean;
  saveProfile: (next: PlayerProfile) => Promise<void>;
  /** Menggabungkan sebagian perubahan tanpa menimpa kolom lain. */
  patchProfile: (patch: Partial<PlayerProfile>) => Promise<void>;
};

const ProfileContext = createContext<ProfileValue | null>(null);

export type ProfileProviderProps = {
  children: ReactNode;
  /** Disuntikkan pengujian. */
  store?: ProfileStore;
};

/**
 * Menyimpan profil pemain (nama, usia, bahasa respons) di satu tempat.
 *
 * Profil ini milik AKUN. Saat perjalanan dibuat, nilainya di-snapshot menjadi
 * persona cerita, sehingga mengubah profil nanti tidak menulis ulang cerita lama.
 */
export function ProfileProvider({ children, store }: ProfileProviderProps) {
  const profileStore = useMemo(() => store ?? createProfileStore(), [store]);
  const [profile, setProfile] = useState<PlayerProfile>({ ...EMPTY_PROFILE });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await profileStore.load();
      if (!cancelled) {
        setProfile(loaded);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileStore]);

  const saveProfile = useCallback(
    async (next: PlayerProfile) => {
      setProfile(next);
      await profileStore.save(next);
    },
    [profileStore],
  );

  const patchProfile = useCallback(
    async (patch: Partial<PlayerProfile>) => {
      setProfile((current) => {
        const merged = { ...current, ...patch };
        void profileStore.save(merged);
        return merged;
      });
    },
    [profileStore],
  );

  const value = useMemo<ProfileValue>(
    () => ({
      profile,
      isLoading,
      isPersistent: profileStore.isPersistent,
      isComplete: isProfileComplete(profile),
      saveProfile,
      patchProfile,
    }),
    [profile, isLoading, profileStore.isPersistent, saveProfile, patchProfile],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileValue {
  const value = useContext(ProfileContext);
  if (!value) {
    throw new Error('useProfile harus dipakai di dalam ProfileProvider.');
  }
  return value;
}
