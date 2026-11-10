import {
  type EvaluateGuardianData,
  type GuardianPreflightSummary,
  type GuardianReport,
  type GuardianReportListQuery,
  type GuardianReportListResponse,
  type GuardianResourceType,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import type { AIProvider } from '../../ai/index.js';
import { AppError, notFound } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { CampaignModel } from '../campaigns/campaign.model.js';
import {
  getCampaign,
  getCampaignStrategy,
  loadBrandContext,
} from '../campaigns/campaigns.service.js';
import { ContentPlanModel } from '../content-plans/contentPlan.model.js';
import { ContentPlanItemModel } from '../content-plans/contentPlanItem.model.js';
import { updateContentPlanItem } from '../content-plans/contentPlans.service.js';
import { ContentItemModel } from '../operations/contentItem.model.js';
import { updateContentItem } from '../operations/content.service.js';
import { resourceId } from '../operations/operations.scope.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { assertWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import { correctSnapshot } from './guardian.correction.js';
import type { GuardianEngine, GuardianOutcome } from './guardian.engine.js';
import { aggregate } from './guardian.score.js';
import { loadGuardianResource, snapshotHash, type LoadedResource } from './guardian.snapshot.js';
import type {
  GuardianEvaluationInput,
  GuardianResourceSnapshot,
  GuardianText,
} from './guardian.types.js';
import {
  GuardianReportModel,
  toGuardianReportDTO,
  type GuardianReportAttrs,
  type GuardianReportDocument,
} from './guardianReport.model.js';
import { recordCreativeDecision } from '../creative-memory/memory.detector.js';
import { resolveCreativeMemories } from '../creative-memory/memory.resolver.js';
import { GUARDIAN_MEMORY_DIMENSIONS } from './guardian.memory.js';
import {
  COPY_EDIT_KEY,
  dedupe,
  guardianOverrideSignals,
  textEditSignals,
} from '../creative-memory/memory.signals.js';

/*
 * Brand Guardian (docs/BRAND-GUARDIAN.md): read → evaluate → report. Nunca modifica el recurso al
 * revisarlo; aplicar una corrección es otra acción explícita que usa el servicio del recurso.
 * Solo Enterprise (capacidad `brandGuardian`). Recurso o informe ajeno, inexistente o malformado →
 * 404. Logs sin copiar textos ni el ADN.
 */

export const GUARDIAN_REPORT_NOT_FOUND = 'Revisión no encontrada';

export interface GuardianDeps {
  engine: GuardianEngine;
  ai: AIProvider;
  logger: Logger;
}

const conflict = (message: string, reason: string) =>
  new AppError(409, 'CONFLICT', message, { reason });

function assertGuardian(workspace: WorkspaceDocument) {
  assertWorkspaceFeature(
    workspace,
    'brandGuardian',
    'Brand Guardian solo está disponible en un Pixel de empresa',
  );
}

async function brandInput(
  workspace: WorkspaceDocument,
  mode: GuardianEvaluationInput['mode'],
  resourceType: GuardianResourceType,
  loaded: Pick<LoadedResource, 'snapshot' | 'resourceId' | 'campaign' | 'strategy'>,
  userSupplied: string[],
): Promise<GuardianEvaluationInput> {
  const [{ company, brandDna }, memory] = await Promise.all([
    loadBrandContext(workspace),
    resolveCreativeMemories(workspace, {
      dimensions: [...GUARDIAN_MEMORY_DIMENSIONS],
      campaignId: loaded.campaign?.id ?? null,
    }),
  ]);
  return {
    workspaceId: workspace._id.toString(),
    mode,
    resourceType,
    resourceId: loaded.resourceId,
    brandName: company.name,
    brandDna,
    campaign: loaded.campaign,
    campaignStrategy: loaded.strategy,
    resource: loaded.snapshot,
    memories: memory.memories,
    userSupplied,
  };
}

function reportFields(
  input: GuardianEvaluationInput,
  outcome: GuardianOutcome,
): Omit<GuardianReportAttrs, 'createdAt' | 'updatedAt' | 'correction'> {
  return {
    workspaceId: new Types.ObjectId(input.workspaceId),
    mode: input.mode,
    resourceType: input.resourceType,
    resourceId: input.resourceId ? new Types.ObjectId(input.resourceId) : null,
    resourceLabel: input.resource.label.slice(0, 200),
    brandDnaVersion: input.brandDna.version,
    campaignId: input.campaign ? new Types.ObjectId(input.campaign.id) : null,
    campaignStrategyVersion: input.campaignStrategy?.version ?? null,
    status: outcome.status,
    score: outcome.score,
    dimensions: outcome.dimensions,
    findings: outcome.findings.map((finding) => ({ ...finding, overriddenAt: null })),
    summary: outcome.summary,
    generation: outcome.generation,
    snapshot: { ...input.resource, userSupplied: input.userSupplied },
    sourceSnapshotHash: snapshotHash(input.resource, input.userSupplied),
    resourceUpdatedAt: input.resource.updatedAt,
  };
}

async function evaluateAndStore(
  input: GuardianEvaluationInput,
  deps: GuardianDeps,
  correction: GuardianReportAttrs['correction'] = null,
): Promise<GuardianReportDocument> {
  deps.logger.info('guardian_evaluation_started', {
    workspaceId: input.workspaceId,
    mode: input.mode,
    resourceType: input.resourceType,
  });
  const outcome = await deps.engine.evaluate(input);
  const report = await GuardianReportModel.create({ ...reportFields(input, outcome), correction });
  deps.logger.info('guardian_evaluation_completed', {
    workspaceId: input.workspaceId,
    reportId: report._id.toString(),
    resourceType: input.resourceType,
    status: outcome.status,
    score: outcome.score,
    findings: outcome.findings.length,
    aiUsed: outcome.generation.aiUsed,
  });
  return report;
}

/** POST …/guardian/evaluate */
export async function evaluateGuardian(
  workspace: WorkspaceDocument,
  data: EvaluateGuardianData,
  deps: GuardianDeps,
): Promise<GuardianReport> {
  assertGuardian(workspace);
  const resourceType = data.resourceType;
  const loaded = await loadGuardianResource(workspace, resourceType, data.resourceId, data.content);
  const input = await brandInput(
    workspace,
    data.mode ??
      (resourceType === 'copy'
        ? 'copy'
        : resourceType.startsWith('campaign')
          ? 'campaign'
          : resourceType === 'content_plan'
            ? 'content_plan'
            : 'content'),
    resourceType,
    loaded,
    data.confirmedFacts,
  );
  return toGuardianReportDTO(await evaluateAndStore(input, deps));
}

async function findReport(workspace: WorkspaceDocument, rawId: unknown) {
  const report = await GuardianReportModel.findOne({
    _id: resourceId(rawId, GUARDIAN_REPORT_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (!report) throw notFound(GUARDIAN_REPORT_NOT_FOUND);
  return report;
}

/** ¿El recurso cambió después de la revisión? (nunca regenera: solo avisa). */
async function isStale(
  workspace: WorkspaceDocument,
  report: GuardianReportDocument,
): Promise<boolean> {
  if (!report.resourceId || !report.resourceUpdatedAt) return false;
  const since = report.resourceUpdatedAt.getTime();
  const scope = { _id: report.resourceId, workspaceId: workspace._id };
  switch (report.resourceType) {
    case 'content_item': {
      const item = await ContentItemModel.findOne(scope).select({ updatedAt: 1 }).lean();
      return !item || item.updatedAt.getTime() > since;
    }
    case 'content_plan_item': {
      const item = await ContentPlanItemModel.findOne(scope).select({ updatedAt: 1 }).lean();
      return !item || item.updatedAt.getTime() > since;
    }
    case 'content_plan': {
      const plan = await ContentPlanModel.findOne(scope).select({ updatedAt: 1 }).lean();
      if (!plan) return true;
      const newest = await ContentPlanItemModel.findOne({
        workspaceId: workspace._id,
        contentPlanId: report.resourceId,
      })
        .sort({ updatedAt: -1 })
        .select({ updatedAt: 1 })
        .lean();
      return Math.max(plan.updatedAt.getTime(), newest?.updatedAt.getTime() ?? 0) > since;
    }
    case 'campaign':
    case 'campaign_strategy': {
      const campaign = await CampaignModel.findOne(scope)
        .select({ updatedAt: 1, currentStrategyVersion: 1 })
        .lean();
      return (
        !campaign ||
        (campaign.currentStrategyVersion ?? null) !== report.campaignStrategyVersion ||
        campaign.updatedAt.getTime() > since
      );
    }
    default:
      return false;
  }
}

export async function getGuardianReport(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<GuardianReport> {
  assertGuardian(workspace);
  const report = await findReport(workspace, rawId);
  return toGuardianReportDTO(report, await isStale(workspace, report));
}

export async function listGuardianReports(
  workspace: WorkspaceDocument,
  query: GuardianReportListQuery,
): Promise<GuardianReportListResponse> {
  assertGuardian(workspace);
  const filter = {
    workspaceId: workspace._id,
    // Los informes del preflight viven con su propuesta; la lista muestra revisiones del usuario.
    resourceType: query.resourceType ?? { $ne: 'pixel_proposal' as GuardianResourceType },
    ...(query.resourceId ? { resourceId: new Types.ObjectId(query.resourceId) } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const [reports, total] = await Promise.all([
    GuardianReportModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(query.limit),
    GuardianReportModel.countDocuments(filter),
  ]);
  const withStale = await Promise.all(
    reports.map(async (report) => toGuardianReportDTO(report, await isStale(workspace, report))),
  );
  return { reports: withStale, total };
}

/** "Continuar de todas formas": solo hallazgos con canOverride; queda registrado. */
export async function overrideGuardianFinding(
  workspace: WorkspaceDocument,
  rawId: unknown,
  findingId: string,
): Promise<GuardianReport> {
  assertGuardian(workspace);
  const report = await findReport(workspace, rawId);
  const finding = report.findings.find((item) => item.id === findingId);
  if (!finding) throw notFound('Hallazgo no encontrado');
  if (!finding.canOverride) {
    throw conflict(
      'Este hallazgo es de integridad factual: corrígelo o aporta el dato, no se puede pasar por alto',
      'guardian_not_overridable',
    );
  }
  const updated = await GuardianReportModel.findOneAndUpdate(
    { _id: report._id, workspaceId: workspace._id, 'findings.id': findingId },
    { $set: { 'findings.$.overridden': true, 'findings.$.overriddenAt': new Date() } },
    { new: true },
  );
  const recomputed = await recomputeStatus(updated!);
  await recordOverride(workspace, recomputed, [finding], `finding:${findingId}`);
  return toGuardianReportDTO(recomputed, await isStale(workspace, recomputed));
}

/* ---------- Creative Memory (Prompt 16): decisiones, nunca memorias directas ---------- */

/**
 * "Continuar de todas formas" sobre hallazgos creativos: una decisión con señal media. Un override
 * aislado nunca crea una memoria; los factuales no producen ninguna señal.
 */
async function recordOverride(
  workspace: WorkspaceDocument,
  report: GuardianReportDocument,
  findings: { code: string; title: string; message: string; evidence: string[] }[],
  key: string,
) {
  const signals = dedupe(findings.flatMap((finding) => guardianOverrideSignals(finding)));
  await recordCreativeDecision(workspace, {
    eventType: 'guardian_override',
    resourceType: 'guardian_report',
    resourceId: report.resourceId ?? report._id,
    campaignId: report.campaignId,
    signals,
    before: findings.slice(0, 3).map((finding) => ({ field: 'Hallazgo', value: finding.title })),
    sourceEventKey: `guardian-report:${report._id.toString()}:override:${key}`,
    description: `Decidiste continuar pese a «${findings[0]?.title ?? 'un aviso'}» en «${report.resourceLabel}»`,
    metadata: { source: 'brand_guardian', dimension: signals[0]?.dimension ?? null },
  });
}

/** Corrección aplicada: el antes/después de cada texto (solo señales del léxico, nunca factuales). */
async function recordCorrectionApplied(
  workspace: WorkspaceDocument,
  report: GuardianReportDocument,
) {
  const fields = report.correction?.fields ?? [];
  const signals = dedupe(
    fields
      .flatMap((field) => textEditSignals(field.original, field.corrected, 'high'))
      .filter((signal) => signal.normalizedKey !== COPY_EDIT_KEY),
  );
  await recordCreativeDecision(workspace, {
    eventType: 'guardian_correction_applied',
    resourceType: 'guardian_report',
    resourceId: report.resourceId ?? report._id,
    campaignId: report.campaignId,
    signals,
    before: fields
      .slice(0, 3)
      .map((field) => ({ field: field.label.slice(0, 60), value: field.original.slice(0, 300) })),
    after: fields
      .slice(0, 3)
      .map((field) => ({ field: field.label.slice(0, 60), value: field.corrected.slice(0, 300) })),
    sourceEventKey: `guardian-report:${report._id.toString()}:apply`,
    description: `Aplicaste la corrección del Guardian en «${report.resourceLabel}»`,
    metadata: { source: 'brand_guardian', dimension: signals[0]?.dimension ?? null },
  });
}

/** Tras un override, el estado se recalcula con las mismas reglas (el score no cambia). */
async function recomputeStatus(report: GuardianReportDocument): Promise<GuardianReportDocument> {
  const findings = report.findings.map((finding) => ({
    ...finding,
    overridden: finding.overridden ?? false,
  }));
  const applicable = report.dimensions
    .filter((entry) => entry.applicable)
    .map((entry) => entry.dimension);
  const summaries = Object.fromEntries(
    report.dimensions.map((entry) => [entry.dimension, entry.summary]),
  );
  const { dimensions, status } = aggregate(
    applicable,
    report.dimensions.map((entry) => entry.dimension),
    findings,
    summaries,
  );
  report.set({ status, dimensions });
  await report.save();
  return report;
}

function inputFromReport(
  report: GuardianReportDocument,
  base: GuardianEvaluationInput,
): GuardianEvaluationInput {
  return {
    ...base,
    resource: report.snapshot as GuardianResourceSnapshot,
    userSupplied: report.snapshot.userSupplied ?? [],
  };
}

/**
 * "Corregir con Pixel" (revisión manual): UNA pasada + UNA re-evaluación, guardada como un informe
 * nuevo con la corrección propuesta. El recurso no cambia hasta aplicarla.
 */
export async function correctGuardianReport(
  workspace: WorkspaceDocument,
  rawId: unknown,
  deps: GuardianDeps,
): Promise<GuardianReport> {
  assertGuardian(workspace);
  const report = await findReport(workspace, rawId);
  if (report.correction) {
    throw conflict(
      'Esta revisión ya es una corrección: Pixel corrige una sola vez',
      'guardian_single_correction_pass',
    );
  }
  const hints = report.findings
    .filter((finding) => finding.canAutoFix && !finding.overridden)
    .flatMap((finding) => finding.fix ?? []);
  if (!hints.length)
    throw conflict('No hay nada que Pixel pueda corregir solo', 'guardian_nothing_to_fix');
  const base = await brandInput(
    workspace,
    report.mode,
    report.resourceType,
    {
      snapshot: report.snapshot as GuardianResourceSnapshot,
      resourceId: report.resourceId?.toString() ?? null,
      campaign: report.campaignId ? { id: report.campaignId.toString(), name: '' } : null,
      strategy: null,
    },
    report.snapshot.userSupplied ?? [],
  );
  // La estrategia con la que se revisó (misma versión) para re-evaluar con el mismo contexto.
  if (report.campaignId) {
    const { campaign } = await getCampaign(workspace, report.campaignId.toString());
    const { strategy } = await getCampaignStrategy(
      workspace,
      campaign.id,
      report.campaignStrategyVersion ?? undefined,
    );
    base.campaign = { id: campaign.id, name: campaign.name };
    base.campaignStrategy = strategy;
  }
  const input = inputFromReport(report, base);
  const correction = await correctSnapshot(input, hints, deps);
  if (!correction)
    throw conflict(
      'Pixel no encontró una corrección segura para este texto',
      'guardian_no_safe_correction',
    );
  const corrected = await evaluateAndStore({ ...input, resource: correction.snapshot }, deps, {
    fromReportId: report._id,
    fields: correction.fields,
    changes: correction.changes,
    appliedAt: null,
  });
  deps.logger.info('guardian_auto_fix_applied', {
    workspaceId: workspace._id.toString(),
    reportId: corrected._id.toString(),
    fields: correction.fields.length,
    status: corrected.status,
  });
  return toGuardianReportDTO(corrected);
}

/** Aplica una corrección propuesta al recurso con SU servicio (solo contenido y piezas del plan). */
export async function applyGuardianCorrection(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<GuardianReport> {
  assertGuardian(workspace);
  const report = await findReport(workspace, rawId);
  if (!report.correction)
    throw conflict('Esta revisión no tiene una corrección propuesta', 'guardian_no_correction');
  if (report.correction.appliedAt) return toGuardianReportDTO(report);
  if (await isStale(workspace, report)) {
    throw conflict(
      'El recurso cambió después de la revisión: revísalo de nuevo',
      'guardian_report_stale',
    );
  }
  const texts = (report.snapshot as GuardianResourceSnapshot).texts;
  const byLabel = new Map(report.correction.fields.map((field) => [field.label, field]));
  const edits = new Map<string, Record<string, string>>();
  for (const text of texts as GuardianText[]) {
    const field = byLabel.get(text.label);
    if (!field || !text.field || !text.targetId) continue;
    edits.set(text.targetId, {
      ...(edits.get(text.targetId) ?? {}),
      [text.field]: field.corrected,
    });
  }
  if (
    !edits.size ||
    !['content_item', 'content_plan_item', 'content_plan'].includes(report.resourceType)
  ) {
    throw new AppError(
      400,
      'BAD_REQUEST',
      'Esta corrección se copia a mano: el recurso no admite cambios directos',
      {
        reason: 'guardian_apply_not_supported',
      },
    );
  }
  for (const [targetId, fields] of edits) {
    if (report.resourceType === 'content_item') {
      // La decisión se registra como corrección aplicada (no como otra edición).
      await updateContentItem(workspace, targetId, fields, new Date(), { recordDecision: false });
    } else {
      const item = await ContentPlanItemModel.findOne({
        _id: new Types.ObjectId(targetId),
        workspaceId: workspace._id,
      })
        .select({ contentPlanId: 1 })
        .lean();
      if (!item) throw notFound('Propuesta no encontrada');
      // Una propuesta ya convertida no se edita desde el plan (409 del servicio existente).
      await updateContentPlanItem(workspace, item.contentPlanId.toString(), targetId, fields);
    }
  }
  report.set({ correction: { ...report.correction, appliedAt: new Date() } });
  await report.save();
  await recordCorrectionApplied(workspace, report);
  return toGuardianReportDTO(report);
}

/* ---------- Preflight de PixelCommand ---------- */

export interface PreflightInput {
  label: string;
  texts: GuardianText[];
  /** Lo que el usuario escribió (no es inventado: fundamenta lo que dijo). */
  userSupplied: string[];
  campaignId: string | null;
}

export interface PreflightResult {
  summary: GuardianPreflightSummary;
  /** Textos corregidos (ref → texto) si la corrección automática se aplicó. */
  corrected: Map<string, string>;
}

/**
 * Pixel se revisa a sí mismo antes de pedir "Organizar": evalúa la propuesta y, si hay hallazgos
 * corregibles, corrige UNA vez y re-evalúa UNA vez. Lo que quede se muestra al usuario.
 */
export async function guardianPreflight(
  workspace: WorkspaceDocument,
  preflight: PreflightInput,
  deps: GuardianDeps,
): Promise<PreflightResult | null> {
  if (!preflight.texts.some((text) => text.text.split(/\s+/).length >= 2)) return null;
  let campaign: LoadedResource['campaign'] = null;
  let strategy: LoadedResource['strategy'] = null;
  if (preflight.campaignId) {
    const loaded = await getCampaign(workspace, preflight.campaignId);
    campaign = { id: loaded.campaign.id, name: loaded.campaign.name };
    strategy = (await getCampaignStrategy(workspace, loaded.campaign.id, undefined)).strategy;
  }
  const input = await brandInput(
    workspace,
    'preflight',
    'pixel_proposal',
    {
      snapshot: {
        label: preflight.label,
        texts: preflight.texts,
        visualDirection: null,
        pieces: [],
        updatedAt: null,
      },
      resourceId: null,
      campaign,
      strategy,
    },
    preflight.userSupplied,
  );
  let report = await evaluateAndStore(input, deps);
  let correctionNote: string | null = null;
  const corrected = new Map<string, string>();
  const hints = report.findings
    .filter((finding) => finding.canAutoFix)
    .flatMap((finding) => finding.fix ?? []);
  if (hints.length) {
    const correction = await correctSnapshot(input, hints, deps);
    if (correction) {
      const fixed = await evaluateAndStore({ ...input, resource: correction.snapshot }, deps, {
        fromReportId: report._id,
        fields: correction.fields,
        changes: correction.changes,
        appliedAt: new Date(),
      });
      for (const text of correction.snapshot.texts) corrected.set(text.ref, text.text);
      correctionNote = `Antes de mostrarte la propuesta ajusté ${correction.fields.length === 1 ? 'un texto' : `${correction.fields.length} textos`}: ${correction.changes.map((change) => change.charAt(0).toLocaleLowerCase('es') + change.slice(1).replace(/\.$/, '')).join('; ')}.`;
      deps.logger.info('guardian_auto_fix_applied', {
        workspaceId: workspace._id.toString(),
        reportId: fixed._id.toString(),
        status: fixed.status,
      });
      report = fixed;
    }
  }
  if (report.status === 'block') {
    deps.logger.info('guardian_preflight_blocked', {
      workspaceId: workspace._id.toString(),
      reportId: report._id.toString(),
    });
  }
  return {
    summary: {
      reportId: report._id.toString(),
      status: report.status,
      score: report.score ?? null,
      findings: report.findings.map((finding) => ({
        id: finding.id,
        severity: finding.severity,
        blocking: finding.blocking,
        title: finding.title,
        message: finding.message,
        recommendation: finding.recommendation ?? null,
        canOverride: finding.canOverride,
        overridden: finding.overridden ?? false,
      })),
      correctionNote,
      overridden: false,
    },
    corrected,
  };
}

/** Override del preflight: solo si TODOS los hallazgos bloqueantes lo admiten. */
export async function overridePreflight(
  workspace: WorkspaceDocument,
  reportId: string,
): Promise<GuardianPreflightSummary['findings']> {
  const report = await findReport(workspace, reportId);
  const blocking = report.findings.filter((finding) => finding.blocking && !finding.overridden);
  if (blocking.some((finding) => !finding.canOverride)) {
    throw conflict(
      'Hay un problema de integridad factual: ajusta la solicitud o aporta el dato antes de organizar',
      'guardian_not_overridable',
    );
  }
  const now = new Date();
  report.findings.forEach((finding) => {
    if (finding.blocking && finding.canOverride) {
      finding.overridden = true;
      finding.overriddenAt = now;
    }
  });
  report.markModified('findings');
  await report.save();
  const recomputed = await recomputeStatus(report);
  await recordOverride(workspace, recomputed, blocking, 'preflight');
  return recomputed.findings.map((finding) => ({
    id: finding.id,
    severity: finding.severity,
    blocking: finding.blocking,
    title: finding.title,
    message: finding.message,
    recommendation: finding.recommendation ?? null,
    canOverride: finding.canOverride,
    overridden: finding.overridden ?? false,
  }));
}
