/**
 * Mengenali berkas gambar dari ISINYA, bukan dari nama atau header permintaan.
 *
 * Ini pertahanan pertama unggahan. `content-type` yang dikirim klien, dan
 * akhiran nama berkas, keduanya dikendalikan penyerang: berkas `.svg` berisi
 * skrip dapat menyamar sebagai `image/png`. Karena itu jenis berkas ditentukan
 * dari deretan byte pertamanya, dan apa pun yang tidak dikenali ditolak —
 * termasuk SVG, yang sengaja TIDAK ada dalam daftar: SVG adalah dokumen yang
 * dapat memuat skrip, dan menyajikannya dari domain yang sama sama dengan
 * menyerahkan panel admin.
 *
 * Dimensi dibaca dari berkas, bukan diterima dari klien. Nilainya dipakai untuk
 * menghitung titik fokus dan rujukan rasio; kalau klien boleh mengarangnya,
 * angka itu menjadi tidak berarti.
 */

/** Jenis yang diterima. Sengaja daftar tertutup. */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export type ImageInspection = {
  contentType: AcceptedImageType;
  width: number;
  height: number;
  /** Apakah gambar memuat saluran alfa. Dipakai memilih format simpan. */
  hasAlpha: boolean;
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Batas akal sehat. Di atas ini bukan gambar yang masuk akal untuk katalog. */
const MAX_DIMENSION = 12_000;

/**
 * Memeriksa isi berkas gambar.
 *
 * Mengembalikan `null` bila jenisnya tidak dikenali, rusak, atau dimensinya
 * tidak masuk akal. Pemanggil memperlakukan `null` sebagai penolakan.
 */
export function inspectImage(bytes: Buffer): ImageInspection | null {
  if (bytes.length < 16) {
    return null;
  }

  if (bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return inspectPng(bytes);
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return inspectJpeg(bytes);
  }

  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return inspectWebp(bytes);
  }

  return null;
}

/**
 * PNG.
 *
 * Blok IHDR selalu blok pertama, jadi letaknya pasti: lebar 4 byte, tinggi 4
 * byte, lalu kedalaman bit dan tipe warna. Tipe warna 4 (skala kelabu + alfa)
 * dan 6 (RGBA) berarti gambar punya transparansi.
 */
function inspectPng(bytes: Buffer): ImageInspection | null {
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') {
    return null;
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colourType = bytes[25];

  if (!plausible(width, height)) {
    return null;
  }

  return {
    contentType: 'image/png',
    width,
    height,
    hasAlpha: colourType === 4 || colourType === 6,
  };
}

/**
 * JPEG.
 *
 * Dimensi tidak berada di tempat tetap: berkas tersusun dari penanda, dan yang
 * memuat ukuran adalah penanda "start of frame" (SOF). Karena itu penanda
 * ditelusuri satu per satu. Penanda yang tidak memuat panjang (mis. 0xD8)
 * dilewati satu byte, sisanya dilewati sesuai panjang yang dinyatakannya.
 */
function inspectJpeg(bytes: Buffer): ImageInspection | null {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1] as number;

    // Penanda tanpa muatan: tidak punya panjang untuk dibaca.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) {
      return null;
    }

    // SOF0..SOF15, kecuali DHT (0xc4), JPG (0xc8), dan DAC (0xcc).
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      if (!plausible(width, height)) {
        return null;
      }
      // JPEG tidak punya saluran alfa.
      return { contentType: 'image/jpeg', width, height, hasAlpha: false };
    }

    offset += 2 + length;
  }

  return null;
}

/**
 * WebP.
 *
 * Tiga varian penanda awal, masing-masing menyimpan ukuran dengan cara
 * berbeda. Yang beralfa: `VP8X` dengan bendera alfa, dan `VP8L` (lossless)
 * yang memang mendukung transparansi.
 */
function inspectWebp(bytes: Buffer): ImageInspection | null {
  const chunk = bytes.subarray(12, 16).toString('latin1');

  if (chunk === 'VP8X') {
    // Kanvas disimpan sebagai nilai minus satu, tiga byte little-endian.
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    if (!plausible(width, height)) {
      return null;
    }
    // Bit alfa ada di byte bendera.
    const hasAlpha = (bytes[20]! & 0x10) !== 0;
    return { contentType: 'image/webp', width, height, hasAlpha };
  }

  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) {
      return null;
    }
    // 14 bit lebar lalu 14 bit tinggi, berimpit tanpa batas byte.
    const width = 1 + (bytes[21]! | ((bytes[22]! & 0x3f) << 8));
    const height = 1 + ((bytes[22]! >> 6) | (bytes[23]! << 2) | ((bytes[24]! & 0x0f) << 10));
    if (!plausible(width, height)) {
      return null;
    }
    return { contentType: 'image/webp', width, height, hasAlpha: true };
  }

  if (chunk === 'VP8 ') {
    // Tiga byte sinkronisasi menandai varian lossy yang sah.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    if (!plausible(width, height)) {
      return null;
    }
    return { contentType: 'image/webp', width, height, hasAlpha: false };
  }

  return null;
}

function plausible(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_DIMENSION &&
    height <= MAX_DIMENSION
  );
}
