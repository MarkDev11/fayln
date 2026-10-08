/**
 * Titik masuk fayLN backend.
 *
 * Catatan penting untuk blitz.cloud:
 * - Port WAJIB dibaca dari `process.env.PORT`. Platform menyuntikkannya dan
 *   mengirim lalu lintas ke port itu. Mematok port di kode akan membuat aplikasi
 *   "Starting" tanpa pernah menjawab.
 * - Server mendengarkan di 0.0.0.0, bukan 127.0.0.1, karena lalu lintas datang
 *   dari luar container.
 * - Aplikasi dapat tidur setelah 30 menit tanpa pengunjung (paket gratis) dan
 *   dibangunkan lagi oleh kunjungan peramban manusia. Hanya pemilik yang dapat
 *   membangunkan lewat program (`keepAwake`, bagian dari paket Pro), jadi tidak
 *   ada state di memori yang diandalkan, dan pool database dibiarkan membuang
 *   koneksi yang sudah mati.
 */

import { randomUUID } from 'node:crypto';

import { AdminRepository } from './admin/adminRepository';
import { AccountsAdminRepository } from './admin/accountsAdminRepository';
import { CatalogAdminRepository } from './admin/catalogAdminRepository';
import { ModelsRepository } from './admin/modelsRepository';
import { PromotionsRepository } from './admin/promotionsRepository';
import { SettingsRepository } from './admin/settingsRepository';
import { WorldDraftRepository } from './admin/worldDraftRepository';
import { GenresRepository } from './admin/genresRepository';
import { CharactersRepository } from './admin/charactersRepository';
import { LocationsRepository } from './admin/locationsRepository';
import { ProvidersRepository } from './admin/providersRepository';
import { validatePassword } from './admin/password';
import type { AdminPageContext } from './admin/pages/context';
import { parseConfig } from './config';
import { DEFAULT_MIGRATION_ATTEMPTS, runMigrations } from './db/migrate';
import { createDatabase, createPool } from './db/pool';
import { createLogger } from './logging';
import { CatalogRepository } from './repositories/catalogRepository';
import { AccountRepository } from './repositories/accountRepository';
import { JourneyRepository } from './repositories/journeyRepository';
import { MediaRepository } from './repositories/mediaRepository';
import { OperationRepository } from './repositories/operationRepository';
import { ReportRepository } from './repositories/reportRepository';
import { UsageRepository } from './repositories/usageRepository';
import { buildApp } from './server';
import { JourneyService } from './services/journeyService';
import { chooseOpeningBackground } from './admin/visionClient';
import type { OpeningBackgroundPicker } from './services/journeyService';
import { DeterministicStoryEngine, STORY_ENGINE_IS_SIMULATOR } from './services/storyEngine';

async function main(): Promise<void> {
  const config = parseConfig();
  const logger = createLogger({ level: config.logLevel, isProduction: config.isProduction });

  const pool = createPool(config.databaseUrl, config.isProduction);
  const db = createDatabase(pool);

  if (config.runMigrationsOnStart) {
    try {
      const result = await runMigrations(db, undefined, {
        /*
         * Setiap penantian dicatat.
         *
         * Tanpa ini, satu-satunya jejak adalah baris kegagalan TERAKHIR — dan
         * penantian dua menit tampak sama persis dengan proses yang menggantung.
         * Saat database blitz.cloud menolak koneksi, log inilah yang membedakan
         * "sedang menunggu" dari "sudah mati".
         */
        onRetry: (attempt, error) => {
          logger.warn(
            {
              attempt,
              maxAttempts: DEFAULT_MIGRATION_ATTEMPTS,
              message: error instanceof Error ? error.message : 'tidak diketahui',
            },
            'Database belum siap; menunggu lalu mencoba lagi.',
          );
        },
      });
      logger.info({ applied: result.applied }, 'Migrasi diterapkan saat mulai.');
    } catch (error) {
      // Gagal migrasi berarti skema tidak sesuai harapan; lebih baik berhenti
      // daripada melayani permintaan dengan skema yang salah.
      //
      // Catatan: galat KONEKSI sudah dicoba ulang lebih dahulu selama jendela
      // yang cukup panjang (lihat `DEFAULT_MIGRATION_ATTEMPTS`). Yang sampai ke
      // sini karena itu sudah benar-benar gagal — entah karena databasenya tidak
      // kunjung kembali, atau karena skemanya memang bermasalah.
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

  /*
   * Pemilih latar pembuka memakai MODEL yang aktif.
   *
   * Diletakkan di sini, bukan di dalam layanan, karena hanya lapisan inilah yang
   * tahu provider dan model mana yang dikonfigurasi. Layanan pemain hanya menerima
   * satu fungsi, dan tidak perlu tahu dari mana jawabannya datang.
   *
   * Bila belum ada model aktif atau kuncinya, pemilihnya null — mesin cerita lalu
   * menebak seperti sebelumnya, dan perjalanan tetap dapat dimulai.
   */
  const providerRepo = new ProvidersRepository(db);
  const modelRepo = new ModelsRepository(db);

  const pickOpeningBackground: OpeningBackgroundPicker = async (narration, backgrounds) => {
    const model = (await modelRepo.listModels()).find(
      (item) => item.isActive && item.providerId !== null,
    );
    if (!model?.providerId) {
      return null;
    }

    const provider = await providerRepo.find(model.providerId);
    if (!provider) {
      return null;
    }

    const apiKey = await providerRepo.apiKeyFor(provider.providerId);
    if (!apiKey) {
      return null;
    }

    const hasil = await chooseOpeningBackground(
      { baseUrl: provider.baseUrl, apiType: provider.apiType, modelKey: model.modelKey },
      apiKey,
      { narration, backgrounds },
    );

    return hasil.ok ? hasil.assetId : null;
  };

  const journeyService = new JourneyService({
    catalog,
    journeys,
    operations,
    usage,
    engine: new DeterministicStoryEngine(),
    pickOpeningBackground,
    newId: () => randomUUID(),
    now: () => new Date(),
  });

  /* ---------------- Panel admin ---------------- */
  const adminRepository = new AdminRepository(db);
  const mediaRepository = new MediaRepository(db);
  const adminPages: AdminPageContext = {
    admins: adminRepository,
    settings: new SettingsRepository(db),
    // Katalog admin TIDAK memakai resolver URI: panel menampilkan jalur apa
    // adanya sebagai teks, bukan gambar. Menyuntikkan resolver yang sama akan
    // mengubah kolom teks menjadi alamat lengkap tanpa manfaat.
    catalog: new CatalogAdminRepository(db),
    accounts: new AccountsAdminRepository(db),
    promotions: new PromotionsRepository(db),
    models: new ModelsRepository(db),
    drafts: new WorldDraftRepository(db),
    genres: new GenresRepository(db),
    characters: new CharactersRepository(db),
    locations: new LocationsRepository(db),
    providers: new ProvidersRepository(db),

    plan: config.plan,
    media: mediaRepository,
  };

  await bootstrapAdmin(adminRepository, logger);

  const app = await buildApp({
    config,
    db,
    accounts,
    catalog,
    usage,
    reports,
    journeys: journeyService,
    admin: {
      repository: adminRepository,
      pages: adminPages,
    },
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
      simulator: STORY_ENGINE_IS_SIMULATOR,
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

/**
 * Membuat akun admin pertama bila panel masih kosong.
 *
 * Mengapa perlu ada: panel admin tertutup rapat — tidak ada pendaftaran mandiri.
 * Tanpa satu akun awal, panel tidak dapat dibuka sama sekali, dan satu-satunya
 * cara masuk adalah menulis SQL langsung ke produksi.
 *
 * Kata sandi diambil dari `ADMIN_BOOTSTRAP_PASSWORD`, bukan dari kode. Bila
 * variabel itu kosong dan belum ada admin, server memberi tahu dengan jelas
 * bahwa panel belum dapat dipakai — bukan diam-diam membiarkannya terkunci.
 */
async function bootstrapAdmin(
  admins: AdminRepository,
  logger: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void },
): Promise<void> {
  const existing = await admins.countAdmins();
  if (existing > 0) {
    return;
  }

  const username = process.env.ADMIN_BOOTSTRAP_USERNAME ?? 'admin';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';

  if (password.length === 0) {
    logger.warn(
      { username },
      'Panel admin belum punya akun. Setel ADMIN_BOOTSTRAP_PASSWORD lalu jalankan ulang untuk membuatnya.',
    );
    return;
  }

  const problem = validatePassword(password);
  if (problem) {
    logger.warn({ problem }, 'ADMIN_BOOTSTRAP_PASSWORD tidak memenuhi syarat; akun admin tidak dibuat.');
    return;
  }

  const created = await admins.createAdmin({
    username,
    password,
    displayName: username,
    role: 'owner',
  });

  logger.info(
    { username: created.username },
    'Akun admin pertama dibuat. Segera ganti kata sandinya dari halaman Pengaturan.',
  );
}
