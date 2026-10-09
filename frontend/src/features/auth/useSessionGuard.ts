/**
 * Gerbang sesi: mengalihkan ke layar masuk bila belum ada sesi.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA "SEDANG MEMUAT" DIBEDAKAN DARI "BELUM MASUK"
 * ---------------------------------------------------------------------------
 * Token dibaca dari penyimpanan perangkat secara asinkron, jadi ada saat singkat
 * ketika kita belum tahu apakah pemain sudah masuk. Bila kedua keadaan itu
 * diperlakukan sama, aplikasi akan berkedip ke layar masuk setiap kali dibuka —
 * lalu melompat kembali ke Beranda begitu tokennya terbaca. Itu terlihat seperti
 * sesi yang hilang, padahal hanya belum selesai dibaca.
 *
 * Karena itu pengalihan hanya dilakukan SETELAH `isLoading` selesai.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA DI SINI, BUKAN DI SETIAP LAYAR
 * ---------------------------------------------------------------------------
 * Satu tempat berarti tidak ada layar yang bisa lupa memeriksa. Route yang
 * dilindungi ditentukan oleh daftar di berkas ini, bukan oleh pilihan masing-masing
 * layar — sehingga menambah layar baru tidak diam-diam membuka data pribadi.
 */

import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from './SessionProvider';

/**
 * Route yang boleh dibuka tanpa masuk.
 *
 * Katalog memang publik: orang harus dapat melihat ada cerita apa saja sebelum
 * memutuskan mendaftar. Yang dilindungi adalah hal yang bersifat pribadi —
 * daftar perjalanan, pemutar cerita, dan pengaturan profil.
 */
const PUBLIC_ROUTES = ['/login'];

export function useSessionGuard(): void {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, isAuthenticated } = useSession();

  useEffect(() => {
    // Belum selesai membaca token: jangan putuskan apa pun.
    if (isLoading) {
      return;
    }

    const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

    if (isAuthenticated && isPublicRoute) {
      // Sudah masuk tetapi berada di layar masuk: pindahkan ke Beranda.
      router.replace('/(tabs)');
      return;
    }

    if (!isAuthenticated && !isPublicRoute) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, pathname, router]);
}
