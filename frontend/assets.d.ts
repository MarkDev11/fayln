/**
 * Deklarasi modul untuk aset statis yang diimpor sebagai berkas.
 *
 * Expo/Metro mengubah `import star from './star.png'` menjadi penunjuk aset saat
 * bundling, tetapi TypeScript tidak tahu soal itu: `expo/types` hanya menyediakan
 * tipe untuk `require`/`module` (lihat `metro-require.d.ts`), bukan untuk impor
 * berkas gambar. Tanpa deklarasi ini setiap impor aset menjadi galat TS2307.
 *
 * Tipenya `number` mengikuti konvensi React Native — `require()` sebuah aset
 * mengembalikan ID aset yang diselesaikan Metro, dan `expo-image` menerima ID itu
 * sebagai `source` (lihat `ImageSource` di `expo-image`, yang memuat `number`).
 */
declare module '*.png' {
  const asset: number;
  export default asset;
}
