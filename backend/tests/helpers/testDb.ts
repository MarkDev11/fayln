/**
 * Basis data pengujian.
 *
 * Memakai PostgreSQL in-memory (pg-mem) supaya migrasi dan query benar-benar
 * dijalankan, bukan diganti dengan tiruan. Ini penting: kesalahan SQL, batasan
 * (constraint), dan indeks unik hanya terlihat bila pernyataannya benar-benar
 * dieksekusi.
 *
 * Keterbatasan yang harus disadari: pg-mem bukan PostgreSQL sungguhan. Fitur
 * yang tidak didukungnya akan tampak sebagai kegagalan di sini, bukan sebagai
 * kebenaran bahwa kode salah. Bila itu terjadi, jalankan pengujian yang sama
 * terhadap PostgreSQL sungguhan sebelum menyimpulkan.
 */

import { newDb, type IMemoryDb } from 'pg-mem';

import { runMigrations } from '../../src/db/migrate';
import { createDatabase, type Database } from '../../src/db/pool';

export type TestDatabase = {
  db: Database;
  mem: IMemoryDb;
  close: () => Promise<void>;
};

export async function createTestDatabase(): Promise<TestDatabase> {
  const mem = newDb();
  const adapter = mem.adapters.createPg();

  // Adapter pg-mem kompatibel dengan node-postgres pada permukaan yang kami pakai.
  const pool = new adapter.Pool() as unknown as Parameters<typeof createDatabase>[0];
  const db = createDatabase(pool);

  await runMigrations(db);

  return {
    db,
    mem,
    close: async () => {
      await db.close();
    },
  };
}
