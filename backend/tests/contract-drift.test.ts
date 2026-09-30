/**
 * Pemeriksaan penyimpangan kontrak.
 *
 * Backend dan frontend masing-masing memiliki berkas tipe sendiri. Keduanya harus
 * menyebut nilai enum yang sama. Uji ini membaca berkas frontend sebagai teks dan
 * membandingkannya dengan konstanta backend.
 *
 * Yang dijaga adalah bagian yang paling merusak bila berbeda: daftar nilai enum
 * dan kode kesalahan. Bila uji ini gagal, perbaiki sisi yang salah dengan sadar;
 * jangan melonggarkan uji ini.
 *
 * Catatan letak konstanta di frontend:
 * - `domain/types.ts`   — sebagian besar enum
 * - `data/gateway.ts`   — kategori laporan
 * - `ResponseLocale`    — berupa union type, bukan larik
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../src/contracts/errors';
import {
  CONTENT_RATINGS,
  EVENT_TYPES,
  GENRES,
  RELATION_STATUSES,
  REPORT_CATEGORIES,
  RESPONSE_LOCALES,
  TIERS,
  WORLD_STATUSES,
} from '../src/contracts/types';

const FRONTEND_ROOT = join(__dirname, '..', '..', 'frontend', 'src');
const FRONTEND_TYPES = join(FRONTEND_ROOT, 'domain', 'types.ts');
const FRONTEND_GATEWAY = join(FRONTEND_ROOT, 'data', 'gateway.ts');

const typesSource = readFileSync(FRONTEND_TYPES, 'utf8');
const gatewaySource = readFileSync(FRONTEND_GATEWAY, 'utf8');

/** Membaca isi larik `export const NAMA = [...] as const` dari sumber frontend. */
function readArray(source: string, name: string, origin: string): string[] {
  const pattern = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`, 's');
  const match = pattern.exec(source);
  if (!match || match[1] === undefined) {
    throw new Error(`Larik ${name} tidak ditemukan di ${origin}`);
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1] as string);
}

/** Membaca nilai dari union type, misalnya `export type X = 'a' | 'b';`. */
function readUnion(source: string, name: string, origin: string): string[] {
  const pattern = new RegExp(`export type ${name} =([^;]*);`, 's');
  const match = pattern.exec(source);
  if (!match || match[1] === undefined) {
    throw new Error(`Union ${name} tidak ditemukan di ${origin}`);
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1] as string);
}

describe('penyimpangan kontrak dengan frontend', () => {
  const fromTypes: [string, readonly string[]][] = [
    ['WORLD_STATUSES', WORLD_STATUSES],
    ['CONTENT_RATINGS', CONTENT_RATINGS],
    ['GENRES', GENRES],
    ['RELATION_STATUSES', RELATION_STATUSES],
    ['EVENT_TYPES', EVENT_TYPES],
    ['TIERS', TIERS],
  ];

  for (const [name, backendValues] of fromTypes) {
    it(`menyamakan ${name}`, () => {
      expect(readArray(typesSource, name, FRONTEND_TYPES)).toEqual([...backendValues]);
    });
  }

  it('menyamakan kategori laporan', () => {
    expect(readArray(gatewaySource, 'REPORT_CATEGORIES', FRONTEND_GATEWAY)).toEqual([
      ...REPORT_CATEGORIES,
    ]);
  });

  it('menyamakan bahasa respons yang didukung', () => {
    expect(readUnion(typesSource, 'ResponseLocale', FRONTEND_TYPES)).toEqual([
      ...RESPONSE_LOCALES,
    ]);
  });
});

describe('kode kesalahan', () => {
  it('memuat kode yang sama di kedua sisi, kecuali yang memang khusus satu sisi', () => {
    const frontendCodes = readArray(typesSource, 'ERROR_CODES', FRONTEND_TYPES);

    // Kode yang hanya muncul di sisi klien: keduanya tidak pernah dikirim server.
    const frontendOnly = new Set(['NETWORK', 'UNKNOWN']);

    const missingInBackend = frontendCodes.filter(
      (code) => !frontendOnly.has(code) && !ERROR_CODES.includes(code as never),
    );
    const missingInFrontend = ERROR_CODES.filter(
      (code) => !frontendOnly.has(code) && !frontendCodes.includes(code),
    );

    expect(missingInBackend).toEqual([]);
    expect(missingInFrontend).toEqual([]);
  });
});
