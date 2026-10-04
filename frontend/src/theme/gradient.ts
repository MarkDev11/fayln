/**
 * Pembantu gradasi.
 *
 * Beranda memakai gradasi supaya permukaan menyatu dengan latar, bukan dipisah
 * garis tegas. Dua hal yang mudah salah dan dihindari di sini:
 *
 * 1. **`'transparent'` bukan warna yang aman untuk ujung gradasi.** Di React
 *    Native, `transparent` adalah `rgba(0,0,0,0)` — hitam dengan alfa nol. Saat
 *    peramban meng-interpolasi ke warna latar yang gelap-hangat, hasilnya
 *    melewati abu-abu kotor dan terlihat sebagai kabut. Karena itu ujung
 *    transparan selalu dibuat dari warna tujuan itu sendiri dengan alfa 0.
 *
 * 2. **Alfa tidak boleh ditulis manual sebagai string.** Latar tema terang dan
 *    gelap berbeda, jadi nilainya harus diturunkan dari token yang sedang aktif.
 */

/** Mengubah `#RRGGBB` menjadi `rgba(r, g, b, alpha)`. */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.trim().replace('#', '');

  // Hanya bentuk 6 digit yang didukung; selain itu nilainya dikembalikan apa
  // adanya supaya kegagalan terlihat, bukan menghasilkan warna diam-diam salah.
  if (normalized.length !== 6) {
    return hex;
  }

  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    return hex;
  }

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

/**
 * Rangkaian warna untuk gradasi yang menyatu ke latar.
 *
 * `from` adalah keadaan di ujung yang terlihat, `to` adalah warna latar tujuan.
 * Dipakai untuk memudarkan gambar atau permukaan supaya tidak ada tepi keras.
 */
export function fadeTo(color: string, from: number, to: number): [string, string] {
  return [withAlpha(color, from), withAlpha(color, to)];
}
