/**
 * Titik masuk fayLN backend.
 *
 * Catatan penting untuk blitz.cloud:
 * - Port WAJIB dibaca dari `process.env.PORT`. Platform menyuntikkannya dan
 *   mengirim lalu lintas ke port itu. Mematok port di kode akan membuat aplikasi
 *   "Starting" tanpa pernah menjawab.
 * - Server mendengarkan di 0.0.0.0, bukan 127.0.0.1, karena lalu lintas datang
 *   dari luar container.
 * - Aplikasi dapat tidur setelah dua jam tanpa pengunjung dan dibangunkan lagi
 *   oleh permintaan berikutnya. Karena itu tidak ada state di memori yang
 *   diandalkan, dan pool database dibiarkan membuang koneksi yang sudah mati.
 */

import { randomUUID } from 'node:crypto';

import { parseConfig } from './config';
import { runMigrations } from './db/migrate';
import { createDatabase, createPool } from './db/pool';
import { createLogger } from './logging';
import { CatalogRepository } from './repositories/catalogRepository';
import { AccountRepository } from './repositories/accountRepository';
import { JourneyRepository } from './repositories/journeyRepository';
import { OperationRepository } from './repositories/operationRepository';
import { ReportRepository } from './repositories/reportRepository';
import { UsageRepository } from './repositories/usageRepository';
import { buildApp } from './server';
import { JourneyService } from './services/journeyService';
import { DeterministicStoryEngine } from './services/storyEngine';

async function main(): Promise<void> {
  const config = parseConfig();
  const logger = createLogger({ level: config.logLevel, isProduction: config.isProduction });

  const pool = createPool(config.databaseUrl, config.isProduction);
  const db = createDatabase(pool);

  if (config.runMigrationsOnStart) {
    try {
      const result = await runMigrations(db);
      logger.info({ applied: result.applied }, 'Migrasi diterapkan saat mulai.');
    } catch (error) {
      // Gagal migrasi berarti skema tidak sesuai harapan; lebih baik berhenti
      // daripada melayani permintaan dengan skema yang salah.
      logger.error(
        { message: error instanceof Error ? error.message : 'tidak diketahui' },
        'Migrasi gagal; server tidak dijalankan.',
      );
      await db.close();
      process.exitCode = 1;
      return;
    }
  }

  const usage = new UsageRepository(db, config.plan);

  // Akun diadakan saat pertama kali terlihat. Klien membuat ID perangkat sendiri,
  // jadi baris `accounts`-nya belum ada sampai hook identitas membuatkannya.
  const accounts = new AccountRepository(db);

  /**
   * Mengubah jalur aset tersimpan menjadi URL yang dapat dimuat klien.
   *
   * Database menyimpan jalur relatif saja (`/assets/portrait/...`) supaya baris
   * yang sama dapat dipakai di lokal maupun produksi. Alamat dasar dibaca dari
   * `PUBLIC_BASE_URL`; bila kosong, jalur dikirim apa adanya dan klien akan
   * memakai placeholder-nya.
   */
  const catalog = new CatalogRepository(db, (path) =>
    config.publicBaseUrl ? `${config.publicBaseUrl}${path}` : path,
  );
  const journeys = new JourneyRepository(db);
  const operations = new OperationRepository(db);
  const reports = new ReportRepository(db);

  const journeyService = new JourneyService({
    catalog,
    journeys,
    operations,
    usage,
    engine: new DeterministicStoryEngine(),
    newId: () => randomUUID(),
    now: () => new Date(),
  });

  const app = await buildApp({
    config,
    db,
    accounts,
    catalog,
    usage,
    reports,
    journeys: journeyService,
    logger: true,
  });

  /* ---------------- Shutdown yang rapi ---------------- */
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Menutup server.');
    try {
      await app.close();
      await db.close();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(
    {
      port: config.port,
      nodeEnv: config.nodeEnv,
      simulator: true,
    },
    'fayLN backend siap menerima permintaan.',
  );
}

main().catch((error: unknown) => {
  // Hanya pesan: connection string dapat muncul di jejak tumpukan.
  const message = error instanceof Error ? error.message : 'Kesalahan tidak dikenal';
  console.error(`Server gagal dijalankan: ${message}`);
  process.exitCode = 1;
});
