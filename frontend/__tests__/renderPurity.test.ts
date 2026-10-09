import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Penjaga "tidak ada navigasi saat render".
 *
 * ---------------------------------------------------------------------------
 * MENGAPA UJI INI ADA
 * ---------------------------------------------------------------------------
 * Peringatan React yang dilindungi di sini:
 *
 *   "Cannot update a component (ForwardRef(NavigationContainerInner)) while
 *    rendering a different component (LoginScreen(./login.tsx))"
 *
 * Penyebabnya adalah `router.replace(...)` yang dipanggil langsung di badan
 * fungsi komponen, di luar handler atau `useEffect`. Render React harus MURNI:
 * ia tidak boleh menulis keadaan komponen lain. Pelanggarannya mudah terjadi
 * dan mudah lolos, karena:
 *
 *   1. Tidak ada galat. Yang muncul hanya peringatan di konsol — dan konsol
 *      tidak pernah dilihat di produksi.
 *   2. Uji unit biasa TIDAK menangkapnya. `render()` dari React Testing Library
 *      tidak menghukum penulisan keadaan saat render, jadi seluruh uji tetap
 *      hijau walau peringatannya menyala.
 *   3. `tsc` juga diam. Ini kesalahan waktu jalan, bukan kesalahan tipe.
 *
 * Akibat nyatanya bukan sekadar berisik: pengalihan yang dijalankan saat render
 * dapat dibuang atau diulang oleh React, sehingga navigasinya tidak dapat
 * diandalkan.
 *
 * ---------------------------------------------------------------------------
 * MENGAPA MEMAKAI AST, BUKAN POLA TEKS
 * ---------------------------------------------------------------------------
 * Dua versi sebelumnya memakai heuristik berbasis teks dan DUANYA BOHONG:
 * keduanya melaporkan hijau padahal pelanggarannya sengaja dipasang kembali.
 * Penyebabnya sepele tetapi menentukan — fungsi komponen di proyek ini
 * berbentuk `export default function LoginScreen() {`, dan pencocokan pola yang
 * menuntut parameter menolak mengenalinya, sehingga pelacakan kedalaman tidak
 * pernah dimulai dari tempat yang benar.
 *
 * Pelajaran itu yang menjadikan berkas ini memakai parser TypeScript yang sudah
 * ada di proyek. AST tidak peduli pada bentuk tanda tangan fungsi, spasi,
 * komentar, atau gaya penulisan. Ia mengenali STRUKTUR, dan struktur itulah yang
 * sebenarnya diperiksa.
 *
 * Penjaga yang bohong lebih berbahaya daripada tidak ada penjaga sama sekali,
 * karena ia memberi rasa aman. Karena itu uji di bawah memuat pemeriksaan yang
 * membuktikan dirinya sendiri: sumber tiruan yang memuat pelanggaran HARUS
 * terdeteksi, dan yang memuat handler yang benar TIDAK boleh ditandai.
 */

const APP_DIR = path.join(__dirname, '..', 'app');
const PROJECT_DIR = path.join(__dirname, '..');

/**
 * Panggilan yang mengubah keadaan navigasi sehingga dilarang saat render.
 *
 * Ditulis sebagai nama properti yang dipanggil pada apa pun — `router` maupun
 * `navigation` — supaya penggantian nama variabel tidak diam-diam melumpuhkan
 * penjaga ini.
 */
const NAVIGATION_MEMBERS = new Set([
  'replace',
  'push',
  'back',
  'dismiss',
  'navigate',
  'setParams',
  'dispatch',
]);

const NAVIGATION_RECEIVERS = new Set(['router', 'navigation']);

function collectScreenFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectScreenFiles(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

type Violation = { line: number; column: number; text: string };

/**
 * Apakah simpul ini berada LANGSUNG di badan sebuah fungsi komponen?
 *
 * "Langsung" berarti: telusuri rantai induknya ke atas. Bila kita menemukan
 * fungsi bersarang (handler, useCallback, useEffect) sebelum menemukan fungsi
 * terluar, maka panggilan itu aman — ia berjalan saat dipanggil, bukan saat
 * render.
 */
function classify(node: ts.Node): 'component-body' | 'inside-nested' | 'unknown' {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isFunctionLike(current)) {
      /*
       * Fungsi pertama yang kita temui. Bila ia sendiri bersarang di dalam
       * fungsi lain, panggilan ini berada di dalam handler — aman.
       */
      return ts.isFunctionDeclaration(current) && !current.parent
        ? 'component-body'
        : isTopLevelComponent(current)
          ? 'component-body'
          : 'inside-nested';
    }
    current = current.parent;
  }

  return 'unknown';
}

/** Fungsi tingkat atas berkas — yaitu komponennya. */
function isTopLevelComponent(fn: ts.Node): boolean {
  const parent = fn.parent;
  if (!parent) {
    return false;
  }
  // `export default function X() {}` → induknya SourceFile atau ExportAssignment.
  return ts.isSourceFile(parent) || ts.isExportAssignment(parent);
}

function findViolations(file: string, sourceOverride?: string): Violation[] {
  const source = sourceOverride ?? fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: Violation[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        NAVIGATION_RECEIVERS.has(callee.expression.text) &&
        NAVIGATION_MEMBERS.has(callee.name.text)
      ) {
        if (classify(node) === 'component-body') {
          const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          violations.push({
            line: line + 1,
            column: character + 1,
            text: node.getText(sf).replace(/\s+/g, ' ').slice(0, 80),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return violations;
}

const format = (file: string, v: Violation) =>
  `  ${path.relative(PROJECT_DIR, file)}:${v.line}:${v.column}\n    ${v.text}`;

describe('tidak ada navigasi saat render', () => {
  const files = collectScreenFiles(APP_DIR);

  it('menemukan berkas layar untuk diperiksa', () => {
    // Penjaga atas penjaga: bila penelusurannya rusak dan tidak menemukan
    // berkas apa pun, uji di bawah akan lulus tanpa memeriksa sesuatu.
    expect(files.length).toBeGreaterThan(5);
  });

  /*
   * UJI ATAS UJI INI SENDIRI — inilah bagian yang paling penting di berkas ini.
   *
   * Dua versi sebelumnya LOLOS padahal pelanggarannya sudah dipasang kembali.
   * Karena itu di sini pola yang dilarang diuji dengan tanda tangan fungsi yang
   * PERSIS seperti di proyek — `export default function Nama() {` tanpa
   * parameter — sebab justru bentuk itulah yang menjatuhkan versi sebelumnya.
   */
  it('mendeteksi navigasi langsung di badan komponen', () => {
    const fake = [
      'export default function LayarContoh() {',
      '  const { isReady } = useSomething();',
      '  if (isReady) {',
      "    router.replace('/(tabs)');",
      '    return null;',
      '  }',
      '  return null;',
      '}',
    ].join('\n');

    const found = findViolations('__fake.tsx', fake);
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(4);
  });

  it('TIDAK menandai navigasi di dalam useCallback', () => {
    const fake = [
      'export default function LayarContoh() {',
      '  const go = useCallback(() => {',
      "    router.replace('/(tabs)');",
      '  }, []);',
      '  return null;',
      '}',
    ].join('\n');

    expect(findViolations('__fake.tsx', fake)).toHaveLength(0);
  });

  it('TIDAK menandai navigasi di dalam useEffect', () => {
    const fake = [
      'export default function LayarContoh() {',
      '  useEffect(() => {',
      "    router.replace('/(tabs)');",
      '  }, []);',
      '  return null;',
      '}',
    ].join('\n');

    expect(findViolations('__fake.tsx', fake)).toHaveLength(0);
  });

  it('TIDAK menandai navigasi di dalam fungsi bernama', () => {
    const fake = [
      'export default function LayarContoh() {',
      '  function go() {',
      "    router.replace('/(tabs)');",
      '  }',
      '  return null;',
      '}',
    ].join('\n');

    expect(findViolations('__fake.tsx', fake)).toHaveLength(0);
  });

  it('setiap panggilan navigasi berada di dalam handler atau useEffect', () => {
    const all: string[] = [];
    for (const file of files) {
      for (const v of findViolations(file)) {
        all.push(format(file, v));
      }
    }

    if (all.length > 0) {
      throw new Error(
        'Navigasi dipanggil saat render. React melarang menulis keadaan komponen lain ' +
          'selagi render, dan mengalihkan dari sini membuat navigasinya tidak dapat ' +
          'diandalkan. Pindahkan ke dalam useCallback/useEffect.\n\n' +
          all.join('\n\n'),
      );
    }
  });
});
