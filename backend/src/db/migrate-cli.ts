/**
 * Menjalankan migrasi dari baris perintah: `npm run migrate`.
 *
 * Dipakai saat deploy pertama atau saat memperbaiki database secara manual.
 * Server juga dapat menjalankan migrasi otomatis saat mulai, diatur oleh
 * RUN_MIGRATIONS_ON_START.
 */

import { parseConfig } from '../config';
import { createLogger } from '../logging';

import { runMigrations } from './migrate';
import { createDatabase, createPool } from './pool';

async function main(): Promise<void> {
  const config = parseConfig();
  const logger = createLogger({ level: config.logLevel, isProduction: config.isProduction });

  const pool = createPool(config.databaseUrl, config.isProduction);
  const db = createDatabase(pool);

  try {
    const result = await runMigrations(db);
    logger.info(
      { applied: result.applied, skipped: result.skipped.length },
      'Migrasi selesai dijalankan.',
    );
    if (result.applied.length === 0) {
      logger.info('Tidak ada migrasi baru; skema sudah terbaru.');
    }
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  // Pesan saja, tanpa jejak tumpukan: kredensial dapat muncul di connection string.
  const message = error instanceof Error ? error.message : 'Kesalahan tidak dikenal';
  console.error(`Migrasi gagal: ${message}`);
  process.exitCode = 1;
});
