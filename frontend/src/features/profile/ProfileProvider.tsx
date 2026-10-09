import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  adoptAccountFields,
  EMPTY_PROFILE,
  isProfileComplete,
  type PlayerProfile,
} from '@/domain/profile';
import { useOptionalSession } from '@/features/auth/SessionProvider';
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
 *
 * ---------------------------------------------------------------------------
 * MENGAPA PROFIL DIISI DARI AKUN
 * ---------------------------------------------------------------------------
 * Layar daftar menanyakan nama dan usia, lalu menyimpannya di AKUN (server).
 * Profil ini disimpan di PERANGKAT. Tanpa jembatan di antara keduanya, pemain
 * yang baru mendaftar menemukan halaman Profil kosong padahal ia baru saja
 * mengetikkan namanya — dan karena profil kosong berarti `isComplete` salah,
 * lembar persona muncul LAGI saat memulai cerita, persis hal yang pendaftaran
 * seharusnya sudah menghindarkan.
 *
 * Pengisian hanya dilakukan sekali per pemuatan akun, dan hanya pada kolom yang
 * masih kosong. Pilihan pemain tidak pernah ditimpa.
 */
export function ProfileProvider({ children, store }: ProfileProviderProps) {
  const profileStore = useMemo(() => store ?? createProfileStore(), [store]);
  const [profile, setProfile] = useState<PlayerProfile>({ ...EMPTY_PROFILE });
  const [isLoading, setIsLoading] = useState(true);

  /*
   * Sesi dipakai sebagai TAMBAHAN, bukan syarat. Profil tetap berfungsi tanpa
   * masuk sama sekali — hanya saja tidak dapat diisi otomatis dari akun.
   */
  const session = useOptionalSession();
  const account = session?.account ?? null;
  const sessionLoading = session?.isLoading ?? false;

  /**
   * Akun yang datanya sudah pernah dicoba disalin.
   *
   * Sekali per akun. Tanpa penanda ini, pemain yang sengaja MENGOSONGKAN namanya
   * di Pengaturan akan melihatnya terisi kembali dari akun setiap kali layar
   * dirender — dan itu membuat penghapusan mustahil.
   */
  const adoptedFor = useRef<string | null>(null);

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

  useEffect(() => {
    // Tunggu profil tersimpan selesai dibaca: keputusannya bergantung pada
    // isinya, dan menyimpulkan lebih awal akan menimpa data yang belum termuat.
    if (isLoading || sessionLoading || !account) {
      return;
    }
    if (adoptedFor.current === account.accountId) {
      return;
    }
    adoptedFor.current = account.accountId;

    setProfile((current) => {
      const next = adoptAccountFields(current, {
        displayName: account.displayName,
        age: account.age,
      });
      if (next === current) {
        // Tidak ada yang berubah: jangan tulis ulang penyimpanan.
        return current;
      }
      void profileStore.save(next);
      return next;
    });
  }, [account, isLoading, profileStore, sessionLoading]);

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
