/**
 * Kotak rahasia penyimpan kunci API.
 *
 * Yang diuji di sini bukan "AES bekerja" — itu urusan pustaka. Yang diuji
 * adalah tiga janji yang dibuat berkasnya, karena ketiganya mudah dilanggar
 * tanpa terlihat:
 *
 * 1. Nilai aslinya tidak pernah muncul di teks tersandinya.
 * 2. Dua nilai yang sama menghasilkan teks tersandi yang BERBEDA, sehingga
 *    isi basis data tidak mengatakan "provider ini dan itu kuncinya sama".
 * 3. Bila kunci enkripsi tidak ada, GAGAL — bukan menyimpan apa adanya.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decryptSecret,
  encryptSecret,
  SECRETS_KEY_ENV,
  secretsKeyConfigured,
  SecretsUnavailableError,
} from '../src/admin/secretBox';

/** Base64 persis 32 byte — bentuk yang seharusnya dibangkitkan. */
const KUNCI = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

let sebelumnya: string | undefined;

beforeEach(() => {
  sebelumnya = process.env[SECRETS_KEY_ENV];
});

afterEach(() => {
  if (sebelumnya === undefined) {
    delete process.env[SECRETS_KEY_ENV];
  } else {
    process.env[SECRETS_KEY_ENV] = sebelumnya;
  }
});

describe('kotak rahasia', () => {
  it('membuka kembali apa yang dikuncinya', () => {
    process.env[SECRETS_KEY_ENV] = KUNCI;

    const tersandi = encryptSecret('sk-rahasia-123');
    expect(tersandi).toMatch(/^v1\./);
    expect(decryptSecret(tersandi)).toBe('sk-rahasia-123');
  });

  it('menyembunyikan nilai aslinya', () => {
    process.env[SECRETS_KEY_ENV] = KUNCI;

    // Ini inti seluruh fitur: isi tabel dan cadangan malamnya tidak boleh
    // berisi kunci yang dapat dibaca.
    expect(encryptSecret('sk-rahasia-123')).not.toContain('sk-rahasia');
  });

  it('menghasilkan teks tersandi berbeda untuk nilai yang sama', () => {
    process.env[SECRETS_KEY_ENV] = KUNCI;

    const pertama = encryptSecret('sk-sama');
    const kedua = encryptSecret('sk-sama');
    expect(pertama).not.toBe(kedua);
    // Tetapi keduanya terbuka menjadi nilai yang sama.
    expect(decryptSecret(kedua)).toBe('sk-sama');
  });

  it('mengembalikan null bila nilainya diubah orang', () => {
    process.env[SECRETS_KEY_ENV] = KUNCI;

    const tersandi = encryptSecret('sk-rahasia');
    const bagian = tersandi.split('.');
    bagian[3] = 'AAAA' + (bagian[3] ?? '').slice(4);
    expect(decryptSecret(bagian.join('.'))).toBeNull();
  });

  it('menolak bekerja bila kunci enkripsi belum terpasang', () => {
    delete process.env[SECRETS_KEY_ENV];

    expect(secretsKeyConfigured()).toBe(false);
    // Gagal, bukan menyimpan apa adanya.
    expect(() => encryptSecret('sk-rahasia')).toThrow(SecretsUnavailableError);
    expect(decryptSecret('v1.a.b.c')).toBeNull();
  });

  it('tetap bekerja bila variabelnya berisi frasa, bukan base64', () => {
    // Jalan keluar untuk variabel yang terlanjur diisi frasa biasa: ia
    // selemah frasanya, tetapi tidak membuat kunci tersimpan tiba-tiba
    // tidak terbaca.
    process.env[SECRETS_KEY_ENV] = 'frasa yang bukan base64';

    expect(secretsKeyConfigured()).toBe(true);
    expect(decryptSecret(encryptSecret('sk-rahasia'))).toBe('sk-rahasia');
  });
});
