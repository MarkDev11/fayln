/**
 * Pemformat angka untuk antarmuka.
 *
 * Ditulis manual, bukan memakai `toLocaleString`. Alasannya bukan kerapian:
 * hasil `toLocaleString` bergantung pada data lokal yang tersedia di perangkat,
 * dan dukungan `Intl` berbeda antara Hermes di Android, JavaScriptCore di iOS,
 * dan peramban. Satu angka kuota yang tampil "24,480" di satu perangkat dan
 * "24.480" di perangkat lain akan terbaca sebagai cacat.
 *
 * Gaya yang dipakai adalah Indonesia: titik sebagai pemisah ribuan.
 */

/**
 * Memformat bilangan bulat dengan pemisah ribuan.
 *
 * Nilai pecahan dibulatkan; nilai yang bukan angka dikembalikan sebagai `'0'`
 * supaya tampilan tidak pernah menampilkan `NaN`.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = Math.round(value);
  const isNegative = rounded < 0;
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return isNegative ? `-${grouped}` : grouped;
}
