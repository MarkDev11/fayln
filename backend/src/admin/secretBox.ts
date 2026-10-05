/**
 * Kotak rahasia: mengenkripsi kunci API provider sebelum disimpan.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA PERNAH MENYIMPAN RAHASIA DI BASIS DATA
 * ---------------------------------------------------------------------------
 * Aturan awal proyek ini: rahasia tidak masuk basis data yang isinya dapat
 * dibaca panel, tidak masuk image, dan tidak masuk repositori. Itu masih
 * berlaku untuk rahasia SISTEM — kunci database, kunci sesi, sandi bootstrap.
 *
 * Yang berbeda di sini: kunci API provider adalah rahasia yang harus
 * DIUBAH ADMIN dari panel, dan menaruhnya di variabel lingkungan berarti
 * mengganti rahasia memerlukan akses ke pengaturan platform, bukan sekadar
 * hak `owner` di panel. Pemilik produk memilih kenyamanan itu.
 *
 * Karena itu komprominya bukan "simpan apa adanya", melainkan:
 *
 *   - Nilainya DIENKRIPSI dengan AES-256-GCM sebelum menyentuh basis data.
 *     Isi tabel dan cadangan malamnya tidak berisi kunci yang dapat dibaca.
 *   - Kunci enkripsinya TIDAK ada di basis data dan tidak ada di repositori —
 *     ia hidup di variabel lingkungan server (`FAYLN_SECRETS_KEY`).
 *   - Nilainya TIDAK PERNAH dikembalikan ke panel. Yang ditampilkan hanya
 *     "ada" atau "tidak ada". Tidak ada bidang yang menampilkannya kembali.
 *
 * ---------------------------------------------------------------------------
 * KONSEKUENSI YANG HARUS DIINGAT
 * ---------------------------------------------------------------------------
 * Kalau `FAYLN_SECRETS_KEY` hilang atau diganti, seluruh kunci tersimpan
 * menjadi tidak terbaca. Itu bukan bug — itulah sifat enkripsi. Karena itu
 * variabel itu harus diperlakukan seperti kunci brankas: dicadangkan
 * terpisah, dan tidak pernah dirotasi tanpa sengaja.
 *
 * Format tersimpan: `v1.<iv>.<tag>.<ciphertext>`, semuanya base64url.
 * Versi dicantumkan sejak awal supaya algoritme dapat diganti kelak tanpa
 * menebak isi baris lama.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Nama variabel lingkungan yang memegang kunci enkripsi. */
export const SECRETS_KEY_ENV = 'FAYLN_SECRETS_KEY';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Dilempar bila kunci enkripsi belum terpasang di lingkungan. */
export class SecretsUnavailableError extends Error {
  constructor() {
    super(
      `Kunci enkripsi belum terpasang. Setel ${SECRETS_KEY_ENV} di lingkungan server.`,
    );
    this.name = 'SecretsUnavailableError';
  }
}

/** Apakah kunci enkripsi tersedia. Dipakai panel untuk menonaktifkan bidangnya. */
export function secretsKeyConfigured(): boolean {
  return readKey() !== null;
}

/**
 * Mengenkripsi satu nilai.
 *
 * IV-nya acak tiap kali dipanggil, jadi dua nilai yang sama menghasilkan
 * teks tersandi yang berbeda — tidak ada yang dapat membaca "provider ini
 * memakai kunci yang sama dengan provider itu" dari isi basis data.
 */
export function encryptSecret(plain: string): string {
  const key = readKey();
  if (!key) {
    throw new SecretsUnavailableError();
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Mengembalikan nilai aslinya, atau `null` bila tidak dapat dibuka.
 *
 * `null` untuk tiga keadaan yang sengaja disamakan: variabelnya tidak ada,
 * formatnya tidak dikenal, dan autentikasinya gagal (nilainya diubah orang).
 * Membedakan ketiganya tidak ada gunanya bagi pemanggil, dan justru memberi
 * petunjuk yang tidak perlu.
 */
export function decryptSecret(boxed: string): string | null {
  const key = readKey();
  if (!key) {
    return null;
  }

  const parts = boxed.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    return null;
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(parts[1]!, 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parts[3]!, 'base64url')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Membaca kunci enkripsi dari lingkungan.
 *
 * Dua bentuk diterima: base64 persis 32 byte (itulah yang seharusnya
 * dibangkitkan), atau teks apa pun yang kemudian di-hash menjadi 32 byte.
 * Bentuk kedua ada supaya variabel yang terlanjur diisi frasa biasa tidak
 * membuat seluruh kunci tersimpan tiba-tiba tidak terbaca — tetapi ia
 * selemah frasanya, jadi yang benar tetap base64 acak.
 */
function readKey(): Buffer | null {
  const raw = process.env[SECRETS_KEY_ENV];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  const trimmed = raw.trim();
  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length === KEY_BYTES) {
    return decoded;
  }
  return createHash('sha256').update(trimmed).digest();
}
