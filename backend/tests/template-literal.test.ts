/**
 * Backtick liar di dalam template literal.
 *
 * Dua berkas ini menyimpan CSS dan JavaScript sebagai template literal TypeScript.
 * Satu backtick di dalamnya — biasanya di dalam KOMENTAR, tempat ia tidak terlihat
 * salah — menutup literalnya lebih awal dan merusak seluruh berkas.
 *
 * `tsc` sebenarnya menangkapnya, tetapi pesannya `TS1005: ',' expected` pada baris
 * yang tampak tidak bersalah. Uji ini memberi barisnya langsung.
 *
 * Sudah terjadi ENAM kali (5-6 Oktober 2026), dan peringatan di kepala berkas
 * tidak mencegahnya — jadi ia diperiksa, bukan diingat.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type Kasus = {
  berkas: string;
  /** Baris yang membuka template literal. */
  pembuka: RegExp;
  /** Baris yang menutupnya. */
  penutup: RegExp;
};

const KASUS: Kasus[] = [
  {
    berkas: 'src/admin/wizardClient.ts',
    pembuka: /^export const WIZARD_JS = `$/,
    penutup: /^`;$/,
  },
  {
    berkas: 'src/admin/html.ts',
    pembuka: /^const STYLES = `$/,
    penutup: /^`;$/,
  },
];

describe('template literal CSS dan JavaScript', () => {
  for (const kasus of KASUS) {
    it(`${kasus.berkas} tidak memuat backtick liar`, () => {
      const baris = readFileSync(kasus.berkas, 'utf8').split('\n');

      let didalam = false;
      const tersangka: string[] = [];

      baris.forEach((isi, indeks) => {
        if (!didalam && kasus.pembuka.test(isi)) {
          didalam = true;
          return;
        }
        if (didalam && kasus.penutup.test(isi)) {
          didalam = false;
          return;
        }
        if (didalam && isi.includes('`')) {
          tersangka.push(`baris ${String(indeks + 1)}: ${isi.trim().slice(0, 100)}`);
        }
      });

      expect(
        tersangka,
        'Backtick di dalam template literal menutupnya lebih awal. Ganti dengan tanda kutip biasa.',
      ).toEqual([]);
    });
  }
});
