import type { DatabaseStatus, HealthResponse } from '@pixel/contracts';
import { Router } from 'express';
import { SERVICE_NAME, SERVICE_VERSION } from '../../config/env.js';

/** GET /api/health — 200 si todo está bien, 503 si la base de datos no está conectada. */
export function createHealthRouter(deps: { getDatabaseStatus: () => DatabaseStatus }): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const database = deps.getDatabaseStatus();
    const body: HealthResponse = {
      status: database === 'connected' ? 'ok' : 'degraded',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      database,
      timestamp: new Date().toISOString(),
    };
    res.status(body.status === 'ok' ? 200 : 503).json(body);
  });

  return router;
}
