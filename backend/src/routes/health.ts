/**
 * Endpoint kesehatan.
 *
 * Dipakai blitz.cloud untuk memeriksa apakah port menjawab sebelum mengirim
 * lalu lintas, dan berguna saat mendiagnosis aplikasi yang tidak bangun.
 *
 * Dua tingkat sengaja dipisahkan:
 * - `/health`  — proses hidup. Tidak menyentuh database, jadi tetap menjawab
 *                meski database sedang bermasalah.
 * - `/health/ready` — siap melayani, termasuk koneksi database.
 */

import type { FastifyInstance } from 'fastify';

import type { Database } from '../db/pool';

export type HealthDeps = {
  db: Database;
  startedAt: number;
  version: string;
};

export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get('/health', async () => ({
    status: 'ok',
    version: deps.version,
    uptimeSec: Math.round((Date.now() - deps.startedAt) / 1000),
  }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      await deps.db.query('SELECT 1 AS ok');
      return {
        status: 'ready',
        database: 'ok',
        uptimeSec: Math.round((Date.now() - deps.startedAt) / 1000),
      };
    } catch {
      // Pesan tidak memuat detail koneksi: connection string dapat berisi kredensial.
      return reply.status(503).send({
        status: 'not_ready',
        database: 'unreachable',
      });
    }
  });
}
