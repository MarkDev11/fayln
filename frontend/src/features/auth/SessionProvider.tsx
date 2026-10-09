/**
 * Sesi pemain di sisi antarmuka.
 *
 * Menyimpan apakah seseorang sedang masuk, siapa dia, dan menyediakan aksi
 * masuk/daftar/keluar. Layar-layar lain memakainya untuk mengalihkan ke layar
 * masuk bila sesinya belum ada.
 *
 * Mengapa bukan sekadar `readToken()` di setiap layar: keadaan "sedang memuat
 * token" harus dibedakan dari "belum masuk". Tanpa pembedaan itu, aplikasi
 * berkedip ke layar masuk setiap kali dibuka, sebelum token terbaca — dan itu
 * terlihat seperti sesi yang hilang padahal hanya belum selesai dibaca.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { readToken } from '@/data/http/authSession';
import {
  currentAccount,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthAccount,
  type AuthFailureReason,
} from './authClient';

export type SessionValue = {
  account: AuthAccount | null;
  /** Token sudah dibaca dan server sudah dikonfirmasi. */
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (input: { email: string; password: string }) => Promise<AuthFailureReason | null>;
  signUp: (input: {
    email: string;
    password: string;
    displayName: string;
    age: number | null;
  }) => Promise<AuthFailureReason | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export type SessionProviderProps = {
  children: ReactNode;
};

export function SessionProvider({ children }: SessionProviderProps) {
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /*
   * Saat dibuka, token lokal diperiksa ke server.
   *
   * Verifikasi ke server penting: token bisa saja dicabut atau kedaluwarsa
   * sementara nilainya masih ada di perangkat. Mempercayai keberadaannya saja
   * berarti pemain melihat antarmuka "sudah masuk" lalu setiap permintaan gagal
   * dengan 401 — dan itu membingungkan.
   */
  useEffect(() => {
    let masihBerlaku = true;

    void (async () => {
      const token = await readToken();
      if (!token) {
        if (masihBerlaku) {
          setAccount(null);
          setIsLoading(false);
        }
        return;
      }

      const found = await currentAccount();
      if (!masihBerlaku) {
        return;
      }
      setAccount(found);
      setIsLoading(false);
    })();

    return () => {
      masihBerlaku = false;
    };
  }, []);

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    const result = await apiLogin(input);
    if (result.ok) {
      setAccount(result.account);
      return null;
    }
    return result.reason;
  }, []);

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName: string; age: number | null }) => {
      const result = await apiRegister(input);
      if (result.ok) {
        setAccount(result.account);
        return null;
      }
      return result.reason;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await apiLogout();
    setAccount(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      account,
      isLoading,
      isAuthenticated: account !== null,
      signIn,
      signUp,
      signOut,
    }),
    [account, isLoading, signIn, signUp, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession harus dipakai di dalam SessionProvider.');
  }
  return value;
}

/**
 * Sesi bila ada, tanpa mewajibkannya.
 *
 * Dipakai oleh konsumen yang HANYA memanfaatkan sesi sebagai tambahan, bukan
 * sebagai syarat. `ProfileProvider` adalah contohnya: profil adalah data
 * perangkat dan tetap berfungsi tanpa masuk sama sekali — hanya saja ia tidak
 * dapat diisi otomatis dari akun. Mewajibkan penyedia sesi di sana akan membuat
 * profil tidak dapat dipakai di mode contoh.
 *
 * Ia tetap melempar bila `SessionProvider` ada tetapi nilainya rusak, supaya
 * kesalahan penyusunan yang sesungguhnya tidak diam-diam berubah menjadi
 * "dianggap belum masuk".
 */
export function useOptionalSession(): SessionValue | null {
  return useContext(SessionContext);
}
