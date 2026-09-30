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
 * Menjalankan seluruh migrasi yang belum diterapkan.
 *
 * Aman dijalankan berulang: migrasi yang sudah tercatat dilewati. Aman dijalankan
 * bersamaan oleh dua instance karena `CREATE TABLE IF NOT EXISTS` dan kunci
 * primer `schema_migrations` membuat penerapan ganda gagal, bukan merusak.
 */
export async function runMigrations(
  db: Database,
  directory = migrationsDirectory(),
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
