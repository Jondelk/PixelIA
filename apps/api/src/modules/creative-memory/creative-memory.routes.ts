import { Router } from 'express';

/**
 * Módulo creative-memory — memorias creativas de la empresa
 * (/api/companies/:companyId/memories). Se implementa en la Etapa 9 (docs/BACKLOG.md).
 */
export const creativeMemoryRouter: Router = Router({ mergeParams: true });
