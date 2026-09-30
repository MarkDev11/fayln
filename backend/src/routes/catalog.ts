/**
 * Endpoint katalog.
 *
 * Route tidak menulis SQL dan tidak menyusun bentuk respons secara mendalam;
 * keduanya ada di repository. Yang dilakukan route: memvalidasi masukan,
 * memanggil repository, dan memetakan hasil menjadi respons HTTP.
 */

import type { FastifyInstance } from 'fastify';

import { notFound } from '../contracts/errors';
import { catalogQuerySchema, worldParamsSchema } from '../http/schemas';
import type { CatalogRepository } from '../repositories/catalogRepository';

export function registerCatalogRoutes(app: FastifyInstance, deps: { catalog: CatalogRepository }): void {
  app.get('/v1/worlds', async (request) => {
    const query = catalogQuerySchema.parse(request.query);
    const page = await deps.catalog.listWorlds({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.search !== undefined ? { search: query.search } : null),
      genres: query.genres as never,
    });
    return page;
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
