/**
 * Pool koneksi PostgreSQL.
 *
 * Catatan penting untuk blitz.cloud: aplikasi dapat tidur setelah dua jam tanpa
 * pengunjung. Saat bangun, koneksi lama sudah mati. Karena itu pool dikonfigurasi
 * untuk mendeteksi koneksi mati dan membuangnya, bukan mengembalikannya ke klien.
 */

import { Pool, type PoolClient, type QueryResultRow } from 'pg';

export type Database = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: T[]; rowCount: number }>;
  /** Menjalankan beberapa pernyataan dalam satu transaksi. */
  transaction: <T>(work: (client: DbClient) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
  /** Dipakai pengujian untuk memastikan pool benar-benar terpakai. */
  readonly kind: 'pg' | 'injected';
};

export type DbClient = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: T[]; rowCount: number }>;
};

export function createPool(databaseUrl: string, isProduction: boolean): Pool {
  return new Pool({
    connectionString: databaseUrl,
    // Platform gratis membatasi memori; pool kecil sudah cukup untuk satu instance.
    max: isProduction ? 5 : 2,
    idleTimeoutMillis: 30_000,
    // Jangan menunggu selamanya bila database tidak menjawab.
    connectionTimeoutMillis: 10_000,
    // Buang koneksi mati yang tertinggal setelah aplikasi tidur.
    allowExitOnIdle: false,
  });
}

export function createDatabase(pool: Pool): Database {
  return {
    kind: 'pg',

    async query<T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) {
      const result = await pool.query<T>(text, values as unknown[] | undefined);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },

    async transaction<T>(work: (client: DbClient) => Promise<T>): Promise<T> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work({
          async query<R extends QueryResultRow = QueryResultRow>(
            text: string,
            values?: readonly unknown[],
          ) {
            const queryResult = await client.query<R>(text, values as unknown[] | undefined);
            return { rows: queryResult.rows, rowCount: queryResult.rowCount ?? 0 };
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    },
  };
}
