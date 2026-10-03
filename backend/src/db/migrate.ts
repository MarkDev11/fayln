/**
 * Runner migrasi.
 *
 * Sederhana dengan sengaja: berkas `.sql` dijalankan berurutan berdasarkan nama,
 * satu kali saja, masing-masing di dalam transaksinya sendiri. Berkas yang sudah
 * dijalankan dicatat di `schema_migrations`.
 *
 * Berkas migrasi yang sudah pernah dijalankan TIDAK boleh diubah — perubahannya
 * tidak akan diterapkan. Tambahkan berkas baru.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Database } from './pool';

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

export type MigrationOptions = {
  /** Batas percobaan, termasuk percobaan pertama. */
  attempts?: number;
  /** Jeda sebelum percobaan ke-`attempt` (berbasis nol). Disuntikkan pengujian. */
  backoffMs?: (attempt: number) => number;
};

/**
 * Galat koneksi yang layak dicoba ulang.
 *
 * Di blitz.cloud, aplikasi dan databasenya dapat bangun bersamaan. Sesaat setelah
 * bangun, port database belum menerima koneksi sehingga muncul `ECONNREFUSED`.
 * Itu keadaan sementara, bukan skema yang salah — mencoba ulang menyelesaikannya.
 */
const RETRYABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  // PostgreSQL memakai kode ini saat belum siap menerima koneksi.
  '57P03',
  // Koneksi diputus oleh server, mis. setelah idle panjang.
  '57P01',
  '08006',
  '08003',
]);

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && RETRYABLE_CODES.has(code);
}

/** Menunggu tanpa menahan proses lain. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


/** Direktori migrasi di samping berkas ini, baik saat dev maupun hasil kompilasi. */
export function migrationsDirectory(): string {
  return join(__dirname, 'migrations');
}

export function listMigrationFiles(directory = migrationsDirectory()): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

async function ensureMigrationsTable(db: Database): Promise<void> {
  // Keberadaan tabel diperiksa lebih dahulu, bukan memakai `IF NOT EXISTS`.
  // Alasannya: pernyataan itu diperlakukan berbeda oleh mesin uji in-memory dan
  // gagal ketika tabelnya sudah ada, sedangkan pemeriksaan eksplisit berperilaku
  // sama di PostgreSQL 17 maupun di lingkungan pengujian.
  const { rows } = await db.query<{ present: number }>(
    `SELECT 1 AS present
     FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = 'schema_migrations'`,
  );

  if (rows.length > 0) {
    return;
  }

  await db.query(`
    CREATE TABLE schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL
    )
  `);
}

async function appliedMigrations(db: Database): Promise<Set<string>> {
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  return new Set(rows.map((row) => row.name));
}

/**
 * Menjalankan seluruh migrasi yang belum diterapkan, dengan percobaan ulang.
 *
 * Percobaan ulang diperlukan karena database dapat belum siap tepat saat aplikasi
 * bangun. Tanpa ini, satu `ECONNREFUSED` sesaat membuat proses keluar dan
 * platform menganggap aplikasi rusak — padahal hanya perlu menunggu sebentar.
 *
 * Backoff-nya 1s, 2s, 4s, 8s, 8s (total ± 23 detik). Hanya galat koneksi yang
 * dicoba ulang; galat SQL yang sebenarnya langsung dilempar supaya kesalahan
 * migrasi tetap terlihat, bukan tersamarkan sebagai masalah koneksi.
 */
export async function runMigrations(
  db: Database,
  directory = migrationsDirectory(),
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const attempts = options.attempts ?? 5;
  const backoffMs = options.backoffMs ?? ((attempt: number) => Math.min(1_000 * 2 ** attempt, 8_000));

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await runMigrationsOnce(db, directory);
    } catch (error) {
      lastError = error;

      // Galat yang bukan masalah koneksi tidak akan membaik dengan menunggu.
      if (!isRetryable(error) || attempt === attempts - 1) {
        throw error;
      }

      await delay(backoffMs(attempt));
    }
  }

  // Tidak tercapai: perulangan di atas selalu mengembalikan atau melempar.
  throw lastError;
}

/** Satu percobaan penuh. Dipisah agar logika percobaan ulang tetap sederhana. */
async function runMigrationsOnce(
  db: Database,
  directory: string,
): Promise<MigrationResult> {
  await ensureMigrationsTable(db);
  const applied = await appliedMigrations(db);

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of listMigrationFiles(directory)) {
    if (applied.has(file)) {
      result.skipped.push(file);
      continue;
    }

    const sql = readFileSync(join(directory, file), 'utf8');

    await db.transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, applied_at) VALUES ($1, now())', [
        file,
      ]);
    });

    result.applied.push(file);
  }

  return result;
}
