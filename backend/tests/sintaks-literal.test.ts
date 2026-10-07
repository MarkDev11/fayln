/**
 * Sintaks WIZARD_JS dan STYLES diperiksa sebagai KODE.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA UJI INI ADA
 * ---------------------------------------------------------------------------
 * Keduanya disimpan sebagai template literal di dalam berkas TypeScript:
 * `export const WIZARD_JS = ` ... `;`. Bagi TypeScript, isinya hanyalah STRING —
 * ia tidak pernah mengurainya sebagai JavaScript.
 *
 * Akibatnya satu tanda kurung yang salah di dalamnya membuat SELURUH skrip panel
 * gagal diurai oleh peramban, dan tidak ada satu pun pemeriksaan yang
 * menangkapnya:
 *
 *   - `tsc` bersih, karena yang diperiksa hanya tipe stringnya;
 *   - uji render bersih, karena markupnya tetap benar;
 *   - halaman tetap TAMPak benar — hanya tidak ada satu pun yang bekerja.
 *
 * Itu terjadi pada 7 Oktober 2026: penggantian satu fungsi memotong badan fungsi
 * lain di tengah, dan seluruh panel diam. Ditemukan hanya dengan menjalankan
 * halamannya di peramban sungguhan dan membaca galat konsolnya.
 *
 * Uji ini menjalankan pengurai JavaScript sungguhan (node --check) atas isi
 * kedua literal, sehingga kerusakan seperti itu tertangkap dalam hitungan detik.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

type Kasus = {
  nama: string;
  berkas: string;
  pembuka: RegExp;
  ekstensi: 'js' | 'css';
};

const KASUS: Kasus[] = [
  {
    nama: 'WIZARD_JS',
    berkas: 'src/admin/wizardClient.ts',
    pembuka: /^export const WIZARD_JS = `$/,
    ekstensi: 'js',
  },
  {
    nama: 'STYLES',
    berkas: 'src/admin/html.ts',
    pembuka: /^const STYLES = `$/,
    ekstensi: 'css',
  },
];

/** Mengambil isi template literal, dari baris pembuka sampai baris penutupnya. */
function isiLiteral(berkas: string, pembuka: RegExp): string {
  const baris = readFileSync(berkas, 'utf8').split('\n');
  const mulai = baris.findIndex((b) => pembuka.test(b));
  if (mulai < 0) {
    throw new Error(`pembuka literal tidak ditemukan di ${berkas}`);
  }

  for (let i = mulai + 1; i < baris.length; i += 1) {
    if (baris[i] === '`;') {
      return baris.slice(mulai + 1, i).join('\n');
    }
  }
  throw new Error(`penutup literal tidak ditemukan di ${berkas}`);
}

describe('sintaks CSS dan JavaScript yang disimpan sebagai string', () => {
  for (const kasus of KASUS) {
    it(`${kasus.nama} dapat diurai`, () => {
      const isi = isiLiteral(kasus.berkas, kasus.pembuka);
      expect(isi.length, `${kasus.nama} kosong`).toBeGreaterThan(0);

      const dir = mkdtempSync(join(tmpdir(), 'sintaks-'));
      const jalur = join(dir, `berkas.${kasus.ekstensi}`);

      try {
        writeFileSync(jalur, isi, 'utf8');

        if (kasus.ekstensi === 'js') {
          /*
           * Pengurai sungguhan, bukan pencocokan kurung. Menghitung kurung
           * sendiri akan tertipu oleh kurung di dalam string, komentar, dan
           * regex — dan justru ketidakseimbangan itulah yang dicari.
           */
          expect(
            () => execFileSync(process.execPath, ['--check', jalur], { stdio: 'pipe' }),
            `${kasus.nama} tidak dapat diurai. Satu kurung yang salah di dalamnya ` +
              'membuat SELURUH skrip panel diam, dan halaman tetap tampak benar.',
          ).not.toThrow();
        } else {
          // CSS tidak punya pengurai bawaan; yang diperiksa keseimbangan kurung
          // kurawalnya, karena itulah kerusakan yang paling mungkin terjadi.
          const buka = (isi.match(/\{/g) ?? []).length;
          const tutup = (isi.match(/\}/g) ?? []).length;
          expect(tutup, `${kasus.nama}: kurung kurawal tidak seimbang`).toBe(buka);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it(
    'setiap fungsi di dalam WIZARD_JS seimbang',
    () => {
      /*
       * Pemeriksaan tambahan yang menunjukkan LETAKNYA, bukan hanya bahwa ada yang
       * salah. Tanpa ini, pesan dari node --check menunjuk baris terakhir berkas —
       * dan baris terakhir selalu tampak tidak bersalah.
       */
      const isi = isiLiteral(KASUS[0].berkas, KASUS[0].pembuka).split('\n');
      const dir = mkdtempSync(join(tmpdir(), 'fungsi-'));
      const jalur = join(dir, 'cek.js');

      try {
        const tersangka: string[] = [];

        for (let i = 0; i < isi.length; i += 1) {
          if (!/^  function [A-Za-z0-9_]+\(/.test(isi[i])) {
            continue;
          }
          let tutup = -1;
          for (let k = i + 1; k < isi.length; k += 1) {
            if (isi[k] === '  }') {
              tutup = k;
              break;
            }
          }
          if (tutup < 0) {
            tersangka.push(`${isi[i].trim()} — penutup tidak ditemukan`);
            continue;
          }

          writeFileSync(
            jalur,
            `(function () {\n${isi.slice(i, tutup + 1).join('\n')}\n})();`,
            'utf8',
          );
          try {
            execFileSync(process.execPath, ['--check', jalur], { stdio: 'pipe' });
          } catch {
            tersangka.push(`${isi[i].trim()} — baris ${String(i + 1)} sampai ${String(tutup + 1)}`);
          }
        }

        expect(tersangka, 'fungsi yang kurung kurawalnya tidak seimbang').toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    /*
     * Batas waktunya longgar dengan sengaja: uji ini menjalankan pengurai
     * JavaScript sekali per fungsi, dan di bawah beban uji paralel jumlahnya
     * melewati batas bawaan lima detik. Batas yang terlalu ketat membuat uji ini
     * gagal karena lambat, bukan karena ada yang salah.
     */
    60_000,
  );

  it('tidak memuat backtick liar di dalam literalnya', () => {
    /*
     * Backtick di dalam template literal menutupnya lebih awal. Ia SUDAH enam
     * kali terjadi, dan selalu di dalam KOMENTAR — tempat ia tidak terlihat
     * salah.
     *
     * Pemeriksaan sintaks di atas sebenarnya juga menangkapnya, tetapi pesannya
     * menunjuk baris terakhir berkas. Yang ini menyebut nomor barisnya langsung,
     * dan itu bedanya antara lima detik dan lima menit.
     */
    for (const kasus of KASUS) {
      const baris = readFileSync(kasus.berkas, 'utf8').split('\n');
      const mulai = baris.findIndex((b) => kasus.pembuka.test(b));
      const penutup = baris.findIndex((b, i) => i > mulai && b === '`;');

      const tersangka = baris
        .slice(mulai + 1, penutup)
        .map((isi, i) => (isi.includes('`') ? `baris ${String(mulai + 2 + i)}: ${isi.trim()}` : null))
        .filter((x): x is string => x !== null);

      expect(
        tersangka,
        `${kasus.nama}: backtick di dalam template literal menutupnya lebih awal. ` +
          'Ganti dengan tanda kutip biasa.',
      ).toEqual([]);
    }
  });
});
