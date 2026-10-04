/**
 * Rasio baku untuk seluruh gambar di aplikasi.
 *
 * Sebelumnya setiap layar menuliskan rasionya sendiri, dan hasilnya ada lima
 * angka berbeda: 16/9, 3/4, 16/10, 1, dan 2/3. Karena sumber gambarnya juga
 * berbeda-beda ukuran, pemotongan tiap gambar jatuh di titik yang berbeda dan
 * halaman terlihat tidak serasi.
 *
 * Aturannya sekarang sederhana: setiap gambar memakai salah satu dari tiga rasio
 * di bawah, dan selalu dipotong (`contentFit: 'cover'`) — tidak pernah diregangkan.
 *
 * Menambah rasio keempat berarti mengembalikan masalah yang sama. Kalau sebuah
 * gambar terasa tidak pas, ubah PEMOTONGANNYA (lewat `contentPosition`), bukan
 * rasionya.
 */

export const MEDIA_ASPECT = {
  /** Sampul mendatar: hero beranda, tajuk dunia, tajuk perjalanan. */
  landscape: 16 / 9,
  /** Sampul tegak: kartu cerita, kartu perjalanan, sampul katalog. */
  portrait: 3 / 4,
  /** Potret karakter dan aset yang tampil sebagai bidang persegi. */
  square: 1,
} as const;

export type MediaAspect = keyof typeof MEDIA_ASPECT;
