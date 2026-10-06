import type { DatabaseStatus } from '@pixel/contracts';
import { Router } from 'express';
import { authRouter } from './auth/auth.routes.js';
import { avatarsRouter } from './avatars/avatars.routes.js';
import { brandDnaRouter } from './brand-dna/brand-dna.routes.js';
import { companiesRouter } from './companies/companies.routes.js';
import { conversationsRouter } from './conversations/conversations.routes.js';
import { creativeMemoryRouter } from './creative-memory/creative-memory.routes.js';
import { createHealthRouter } from './health/health.routes.js';

export interface ApiDependencies {
  getDatabaseStatus: () => DatabaseStatus;
}

/**
 * Registro único de módulos. Los recursos de una empresa cuelgan siempre de
 * /companies/:companyId (aislamiento por companyId, ver CLAUDE.md).
 */
export function createApiRouter(deps: ApiDependencies): Router {
  const api = Router();

  api.use('/health', createHealthRouter(deps));
  api.use('/auth', authRouter);
  api.use('/companies/:companyId/brand-dna', brandDnaRouter);
  api.use('/companies/:companyId/avatar-profile', avatarsRouter);
  api.use('/companies/:companyId/conversations', conversationsRouter);
  api.use('/companies/:companyId/memories', creativeMemoryRouter);
  api.use('/companies', companiesRouter);

  return api;
}
