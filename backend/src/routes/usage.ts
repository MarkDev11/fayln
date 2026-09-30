/**
 * Endpoint kuota dan laporan.
 *
 * Kuota dibaca dengan menghitung hari UTC saat permintaan masuk. Tidak ada
 * pekerjaan terjadwal yang mereset apa pun (docs/14 bagian 5).
 */

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { resolveAccountId } from '../http/identity';
import { reportBodySchema } from '../http/schemas';
import type { ReportRepository } from '../repositories/reportRepository';
import type { UsageRepository } from '../repositories/usageRepository';

export type UsageRoutesDeps = {
  usage: UsageRepository;
  reports: ReportRepository;
};

export function registerUsageAndReportRoutes(app: FastifyInstance, deps: UsageRoutesDeps): void {
  app.get('/v1/usage', async (request) => {
    const accountId = resolveAccountId(request);
    return deps.usage.usage(accountId);
  });

  app.post('/v1/reports', async (request, reply) => {
    const accountId = resolveAccountId(request);
    const body = reportBodySchema.parse(request.body);
    const reportId = `rep_${randomUUID()}`;

    await deps.reports.create({
      reportId,
      accountId,
      category: body.category,
      detail: body.detail,
      ...(body.journeyId !== undefined ? { journeyId: body.journeyId } : null),
      ...(body.beatId !== undefined ? { beatId: body.beatId } : null),
    });

    // `localOnly: false` karena laporan benar-benar tersimpan di server.
    // Frontend memakai penanda ini untuk membedakan simulator dari server nyata.
    return reply.status(201).send({ reportId, accepted: true, localOnly: false });
  });
}
