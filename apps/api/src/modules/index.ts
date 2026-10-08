import type { DatabaseStatus } from '@pixel/contracts';
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireCompanyAccess } from '../middleware/requireCompanyAccess.js';
import {
  requirePersonalWorkspace,
  requireWorkspaceAccess,
  resolveWorkspaceDomain,
} from '../middleware/requireWorkspaceAccess.js';
import { createAuthRouter } from './auth/auth.routes.js';
import type { AuthService } from './auth/auth.service.js';
import type { SessionConfig } from './auth/session.js';
import { createAvatarsRouter } from './avatars/avatars.routes.js';
import type { AvatarConceptEngine, PersonalAvatarConceptEngine } from './avatars/engine/index.js';
import { brandDnaRouter } from './brand-dna/brand-dna.routes.js';
import { companiesRouter, companyRouter } from './companies/companies.routes.js';
import { createContentPlansRouter } from './content-plans/contentPlans.routes.js';
import { createDailyBriefRouter } from './daily-director/dailyBrief.routes.js';
import type { DailyDirectorEngine } from './daily-director/dailyDirector.engine.js';
import type { ContentPlanningEngine } from './content-plans/contentPlanning.engine.js';
import { createConversationsRouter } from './conversations/conversations.routes.js';
import type { ChatDeps } from './conversations/chat.service.js';
import { creativeMemoryRouter } from './creative-memory/creative-memory.routes.js';
import { createHealthRouter } from './health/health.routes.js';
import {
  contentRouter,
  operationsRouter,
  projectsRouter,
  tasksRouter,
} from './operations/operations.routes.js';
import type { PersonalDnaGenerator } from './personal/personalDna.generator.js';
import {
  createPersonalDnaRouter,
  createPersonalProfileRouter,
} from './personal/personal.routes.js';
import { workspaceRouter, workspacesRouter } from './workspaces/workspaces.routes.js';
import type { Logger } from '../lib/logger.js';

export interface ApiDependencies {
  getDatabaseStatus: () => DatabaseStatus;
  authService: AuthService;
  session: SessionConfig;
  avatarEngine: AvatarConceptEngine;
  personalAvatarEngine: PersonalAvatarConceptEngine;
  chat: ChatDeps;
  personalDnaGenerator: PersonalDnaGenerator;
  planningEngine: ContentPlanningEngine;
  dailyDirector: DailyDirectorEngine;
  defaultTimezone: string;
  logger: Logger;
}

/**
 * Registro único de módulos.
 *
 * El Workspace es la frontera de aislamiento (ver CLAUDE.md):
 * - /workspaces/:workspaceId pasa por requireWorkspaceAccess: `req.workspace` ya validado
 *   (dueño = usuario de la sesión). Las rutas solo de Enterprise resuelven además su empresa; las
 *   solo de Personal (perfil y ADN personal) exigen un workspace personal (requirePersonalWorkspace).
 * - /companies/:companyId (legacy Enterprise) pasa por requireCompanyAccess, que valida la empresa
 *   y adjunta también su workspace: los módulos compartidos trabajan siempre con `req.workspace`.
 * Todo exige sesión.
 */
export function createApiRouter(deps: ApiDependencies): Router {
  const api = Router();

  api.use('/health', createHealthRouter(deps));
  api.use('/auth', createAuthRouter(deps));

  api.use('/workspaces', requireAuth(deps.session));
  api.use('/workspaces', workspacesRouter);

  const workspace = Router({ mergeParams: true });
  workspace.use(requireWorkspaceAccess);
  workspace.use('/', workspaceRouter);
  // Mismo endpoint de avatar para ambos tipos: el ADN de origen se resuelve por workspace.type.
  workspace.use('/avatar', resolveWorkspaceDomain, createAvatarsRouter(deps));
  workspace.use('/conversations', createConversationsRouter(deps.chat));
  workspace.use('/personal-profile', requirePersonalWorkspace, createPersonalProfileRouter(deps));
  workspace.use('/personal-dna', requirePersonalWorkspace, createPersonalDnaRouter(deps));
  // Operations: recursos compartidos de cualquier tipo de workspace (aislados por workspaceId).
  workspace.use('/projects', projectsRouter);
  workspace.use('/tasks', tasksRouter);
  workspace.use('/content', contentRouter);
  workspace.use('/operations', operationsRouter);
  workspace.use('/content-plans', createContentPlansRouter(deps));
  workspace.use('/', createDailyBriefRouter(deps));
  api.use('/workspaces/:workspaceId', workspace);

  api.use('/companies', requireAuth(deps.session));
  api.use('/companies', companiesRouter);

  const company = Router({ mergeParams: true });
  company.use(requireCompanyAccess);
  company.use('/', companyRouter);
  company.use('/brand-dna', brandDnaRouter);
  company.use('/avatar', createAvatarsRouter(deps));
  company.use('/conversations', createConversationsRouter(deps.chat));
  company.use('/memories', creativeMemoryRouter);
  api.use('/companies/:companyId', company);

  return api;
}
