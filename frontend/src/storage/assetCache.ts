/**
 * Pengelolaan cache aset.
 *
 * Cache hanya mempercepat tampilan gambar. Membersihkannya TIDAK menghapus save,
 * riwayat, atau draft — pemisahan ini penting agar pemain tidak takut menekan tombol
 * bersihkan (SC-21).
 *
 * Catatan: proyek belum memiliki aset gambar sungguhan, jadi cache saat ini praktis
 * kosong. Fungsi ini tetap benar dan akan bekerja begitu aset manual ditambahkan.
 */

import { Image } from 'expo-image';

export type CacheClearOutcome = 'cleared' | 'unsupported' | 'failed';

export type CacheClearResult = {
  outcome: CacheClearOutcome;
  /** Apakah cache memori berhasil dibersihkan. */
  memory: boolean;
  /** Apakah cache disk berhasil dibersihkan. */
  disk: boolean;
};

/**
 * Membersihkan cache gambar.
 *
 * Kegagalan tidak pernah dilempar ke pemanggil: pemain cukup diberi tahu bahwa
 * pembersihan tidak berhasil, tanpa aplikasi ikut gagal.
 */
export async function clearAssetCache(): Promise<CacheClearResult> {
  let memory = false;
  let disk = false;

  try {
    memory = await Image.clearMemoryCache();
  } catch {
    memory = false;
  }

  try {
    disk = await Image.clearDiskCache();
  } catch {
    disk = false;
  }

  if (memory || disk) {
    return { outcome: 'cleared', memory, disk };
  }

  // Pada platform yang tidak mendukung, keduanya mengembalikan false tanpa error.
  return { outcome: 'unsupported', memory, disk };
}
