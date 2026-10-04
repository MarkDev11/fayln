/**
 * Endpoint katalog.
 *
 * Route tidak menulis SQL dan tidak menyusun bentuk respons secara mendalam;
 * keduanya ada di repository. Yang dilakukan route: memvalidasi masukan,
 * memanggil repository, dan memetakan hasil menjadi respons HTTP.
 */

import type { FastifyInstance } from 'fastify';

import { notFound } from '../contracts/errors';
import { catalogQuerySchema, railQuerySchema, worldParamsSchema } from '../http/schemas';
import type { CatalogRepository } from '../repositories/catalogRepository';

/** Jendela peringkat "Top 10 Minggu Ini", dalam hari. */
const TOP_WINDOW_DAYS = 7;

export function registerCatalogRoutes(app: FastifyInstance, deps: { catalog: CatalogRepository }): void {
  app.get('/v1/worlds', async (request) => {
    const query = catalogQuerySchema.parse(request.query);
    const page = await deps.catalog.listWorlds({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.search !== undefined ? { search: query.search } : {}),
      genres: query.genres as never,
    });
    return page;
  });

  /**
   * Rail "Top 10 Minggu Ini".
   *
   * WAJIB didaftarkan SEBELUM `/v1/worlds/:worldId`. Fastify mencocokkan rute
   * statis lebih dahulu daripada rute berparameter, tetapi urutan pendaftaran
   * tetap dijadikan pengaman agar `top` tidak pernah diperlakukan sebagai ID
   * dunia — kesalahan itu akan muncul sebagai 404 "Cerita tidak ditemukan",
   * bukan sebagai galat yang jelas.
   */
  app.get('/v1/worlds/top', async (request) => {
    const { limit } = railQuerySchema.parse(request.query);
    const items = await deps.catalog.listTopWorlds(limit, TOP_WINDOW_DAYS);
    return { items, windowDays: TOP_WINDOW_DAYS };
  });

  /** Rail "Terbaru Dirilis". */
  app.get('/v1/worlds/new', async (request) => {
    const { limit } = railQuerySchema.parse(request.query);
    const items = await deps.catalog.listNewWorlds(limit);
    return { items };
  });

  app.get('/v1/worlds/:worldId', async (request) => {
    const { worldId } = worldParamsSchema.parse(request.params);

    const version = await deps.catalog.findWorldVersion(worldId);
    if (!version) {
      throw notFound('Cerita tidak ditemukan.');
    }

    const detail = await deps.catalog.getWorldDetail(worldId, version.world_version);
    if (!detail) {
      throw notFound('Cerita tidak ditemukan.');
    }

    return detail;
  });
}
