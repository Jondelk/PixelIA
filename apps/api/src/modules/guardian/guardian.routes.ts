import {
  EvaluateGuardianSchema,
  GuardianOverrideSchema,
  GuardianReportListQuerySchema,
  type GuardianReportListResponse,
  type GuardianReportResponse,
} from '@pixel/contracts';
import { Router } from 'express';
import { getWorkspace } from '../../middleware/requireWorkspaceAccess.js';
import {
  applyGuardianCorrection,
  correctGuardianReport,
  evaluateGuardian,
  getGuardianReport,
  listGuardianReports,
  overrideGuardianFinding,
  type GuardianDeps,
} from './guardian.service.js';

/**
 * Módulo guardian — /api/workspaces/:workspaceId/guardian, detrás de requireWorkspaceAccess. Solo
 * Enterprise (capacidad `brandGuardian`; Personal → 400 feature_not_available). Ver
 * docs/BRAND-GUARDIAN.md.
 */
export function createGuardianRouter(deps: GuardianDeps): Router {
  const router = Router({ mergeParams: true });

  router.post('/evaluate', async (req, res) => {
    const input = EvaluateGuardianSchema.parse(req.body);
    const body: GuardianReportResponse = {
      report: await evaluateGuardian(getWorkspace(req), input, deps),
    };
    res.status(201).json(body);
  });

  router.get('/reports', async (req, res) => {
    const query = GuardianReportListQuerySchema.parse(req.query);
    const body: GuardianReportListResponse = await listGuardianReports(getWorkspace(req), query);
    res.json(body);
  });

  router.get('/reports/:reportId', async (req, res) => {
    const body: GuardianReportResponse = {
      report: await getGuardianReport(getWorkspace(req), req.params.reportId),
    };
    res.json(body);
  });

  router.post('/reports/:reportId/override', async (req, res) => {
    const { findingId } = GuardianOverrideSchema.parse(req.body);
    const body: GuardianReportResponse = {
      report: await overrideGuardianFinding(getWorkspace(req), req.params.reportId, findingId),
    };
    res.json(body);
  });

  router.post('/reports/:reportId/correct', async (req, res) => {
    const body: GuardianReportResponse = {
      report: await correctGuardianReport(getWorkspace(req), req.params.reportId, deps),
    };
    res.status(201).json(body);
  });

  router.post('/reports/:reportId/apply', async (req, res) => {
    const body: GuardianReportResponse = {
      report: await applyGuardianCorrection(getWorkspace(req), req.params.reportId),
    };
    res.json(body);
  });

  return router;
}
