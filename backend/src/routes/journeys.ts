/**
 * Endpoint perjalanan dan giliran.
 *
 * Identitas akun masih memakai placeholder (lihat http/identity.ts). Setiap route
 * di sini terikat pada akun tersebut, dan kepemilikan diperiksa di layanan —
 * bukan di route — supaya tidak ada jalur yang terlewat.
 */

import type { FastifyInstance } from 'fastify';

import { resolveAccountId } from '../http/identity';
import {
  createJourneyBodySchema,
  journeyParamsSchema,
  operationParamsSchema,
  submitTurnBodySchema,
  syncProgressBodySchema,
} from '../http/schemas';
import type { JourneyService } from '../services/journeyService';

export function registerJourneyRoutes(
  app: FastifyInstance,
  deps: { journeys: JourneyService },
): void {
  app.get('/v1/journeys', async (request) => {
    const accountId = resolveAccountId(request);
    const items = await deps.journeys.listJourneys(accountId);
    return { items };
  });

  app.post('/v1/journeys', async (request, reply) => {
    const accountId = resolveAccountId(request);
    const body = createJourneyBodySchema.parse(request.body);

    const result = await deps.journeys.createJourney({
      operationId: body.clientOperationId,
      accountId,
      worldId: body.worldId,
      persona: body.persona,
      responseLocale: body.responseLocale,
    });

    return reply.status(201).send(result);
  });

  app.get('/v1/journeys/:journeyId', async (request) => {
    const accountId = resolveAccountId(request);
    const { journeyId } = journeyParamsSchema.parse(request.params);
    return deps.journeys.journeyDetail(journeyId, accountId);
  });

  app.delete('/v1/journeys/:journeyId', async (request, reply) => {
    const accountId = resolveAccountId(request);
    const { journeyId } = journeyParamsSchema.parse(request.params);
    await deps.journeys.deleteJourney(journeyId, accountId);
    return reply.status(204).send();
  });

  /** Keadaan operasi yang tertunda (FR-52). */
  app.get('/v1/operations/:operationId', async (request) => {
    const { operationId } = operationParamsSchema.parse(request.params);
    return deps.journeys.operationStatus(operationId);
  });

  /** Sesi bermain: beat, baseline hubungan, dan dunia yang dikunci. */
  app.get('/v1/journeys/:journeyId/session', async (request) => {
    const accountId = resolveAccountId(request);
    const { journeyId } = journeyParamsSchema.parse(request.params);
    return deps.journeys.openSession(journeyId, accountId);
  });

  app.put('/v1/journeys/:journeyId/progress', async (request, reply) => {
    const accountId = resolveAccountId(request);
    const { journeyId } = journeyParamsSchema.parse(request.params);
    const body = syncProgressBodySchema.parse(request.body);
    await deps.journeys.syncReadProgress(journeyId, accountId, body);
    return reply.status(204).send();
  });

  app.post('/v1/journeys/:journeyId/turns', async (request, reply) => {
    const accountId = resolveAccountId(request);
    const { journeyId } = journeyParamsSchema.parse(request.params);
    const body = submitTurnBodySchema.parse(request.body);

    const envelope = await deps.journeys.submitTurn({
      operationId: body.clientOperationId,
      accountId,
      journeyId,
      decisionId: body.decisionId,
      ...(body.selection ? { optionId: body.selection.optionId } : null),
      ...(body.customText !== undefined ? { customText: body.customText } : null),
      responseLocale: body.responseLocale,
    });

    return reply.status(201).send(envelope);
  });
}
