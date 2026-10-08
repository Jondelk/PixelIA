import {
  DailyBriefSchema,
  localDateIn,
  type DailyBrief,
  type DailyBriefListResponse,
  type DailyBriefResponse,
} from '@pixel/contracts';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { isDuplicateKeyError } from '../../lib/mongo.js';
import { PERSONAL_CONTEXT_NOT_CONFIGURED } from '../conversations/context/personalContext.builder.js';
import { resourceId } from '../operations/operations.scope.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { assertWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import { analyzeDay } from './dailyAnalysis.js';
import { DailyBriefModel, toDailyBriefDTO } from './dailyBrief.model.js';
import { collectDailyData } from './dailyData.collector.js';
import type { DailyDirectorEngine } from './dailyDirector.engine.js';
import { workspaceTimezone } from './dailyTime.js';
import { currentBriefDoc, isBriefStale } from './dailyBrief.current.js';

export { currentBriefForContext, isBriefStale } from './dailyBrief.current.js';

/*
 * Daily Director de un workspace (Personal). Pipeline:
 *   DailyDataCollector → PriorityScorer + ProjectHealth + ContentHealth (dailyAnalysis)
 *   → DailyDirectorEngine (IA o determinístico) → DailyBrief persistido (versión del día).
 *
 * - Un brief vigente por workspace y día local: regenerar crea la versión siguiente.
 * - GET no regenera nunca: si hubo cambios desde la generación responde `stale: true`.
 * - Dos "generar" simultáneos del mismo workspace y día comparten la misma generación.
 * - Solo LEE el trabajo: nunca modifica tareas, proyectos ni contenido.
 */

export interface DailyBriefDeps {
  dailyDirector: DailyDirectorEngine;
  defaultTimezone: string;
  logger: Logger;
}

export const DAILY_BRIEF_NOT_GENERATED = 'Aún no hay dirección para hoy';
export const DAILY_BRIEF_NOT_FOUND = 'Dirección del día no encontrada';

/** Daily Director Enterprise: todavía no (los modelos ya son recursos de workspace). */
export function assertDailyDirectorAvailable(workspace: WorkspaceDocument): void {
  assertWorkspaceFeature(
    workspace,
    'dailyDirector',
    'El Daily Director está disponible solo en un Pixel Personal',
  );
}

export async function getCurrentDailyBrief(
  workspace: WorkspaceDocument,
  deps: Pick<DailyBriefDeps, 'defaultTimezone'>,
  now = new Date(),
): Promise<DailyBriefResponse> {
  assertDailyDirectorAvailable(workspace);
  const timezone = workspaceTimezone(workspace, deps.defaultTimezone);
  const localDate = localDateIn(now, timezone);
  const doc = await currentBriefDoc(workspace, localDate);
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', DAILY_BRIEF_NOT_GENERATED, {
      reason: 'daily_brief_not_generated',
      localDate,
      timezone,
    });
  }
  return { brief: toDailyBriefDTO(doc), stale: await isBriefStale(workspace, doc) };
}

/** Partes derivadas del brief que se validan con el contrato antes de guardar. */
const PersistedPartsSchema = DailyBriefSchema.pick({
  summary: true,
  priorities: true,
  warnings: true,
  contentSuggestion: true,
  focusBlocks: true,
  closingNote: true,
  facts: true,
  generation: true,
  localDate: true,
  timezone: true,
  generationMode: true,
});

const inFlight = new Map<string, Promise<DailyBriefResponse>>();

async function runGeneration(
  workspace: WorkspaceDocument,
  timezone: string,
  localDate: string,
  deps: DailyBriefDeps,
  now: Date,
): Promise<DailyBriefResponse> {
  const log = { workspaceId: workspace._id.toString(), localDate };
  deps.logger.info('daily_brief_generation_started', log);
  try {
    const raw = await collectDailyData(workspace, now);
    if (!raw) {
      throw new AppError(409, 'CONFLICT', PERSONAL_CONTEXT_NOT_CONFIGURED, {
        reason: 'personal_context_not_configured',
      });
    }
    const analysis = analyzeDay(raw, timezone, now);
    const { draft, mode, generation } = await deps.dailyDirector.generate(analysis);
    const generatedAt = new Date();

    // Valida el resultado completo ANTES de persistir: nunca se guarda un brief corrupto.
    const candidate = {
      workspaceId: workspace._id,
      contextType: workspace.type,
      localDate,
      timezone,
      personalDnaVersion: raw.personalDnaVersion,
      generationMode: mode,
      ...draft,
      warnings: analysis.warnings,
      facts: analysis.facts,
      generation,
      fingerprint: raw.fingerprint,
      contextSnapshotAt: raw.snapshotAt,
      generatedAt,
    };
    PersistedPartsSchema.parse(candidate);

    for (let attempt = 0; ; attempt += 1) {
      const latest = await currentBriefDoc(workspace, localDate);
      try {
        const doc = await DailyBriefModel.create({
          ...candidate,
          version: (latest?.version ?? 0) + 1,
        });
        deps.logger.info('daily_brief_generation_completed', {
          ...log,
          version: doc.version,
          mode,
          provider: generation.provider,
          model: generation.model,
          fallbackReason: generation.fallbackReason,
          priorities: draft.priorities.length,
          sanitizedFields: generation.sanitizedFields,
        });
        return { brief: toDailyBriefDTO(doc), stale: false };
      } catch (err) {
        if (!isDuplicateKeyError(err) || attempt >= 2) throw err;
      }
    }
  } catch (err) {
    deps.logger.warn('daily_brief_generation_failed', {
      ...log,
      reason: err instanceof AppError ? err.message : 'error',
    });
    if (err instanceof AppError) throw err;
    throw new AppError(500, 'INTERNAL_ERROR', 'No se pudo generar la dirección del día', {
      reason: 'daily_brief_generation_failed',
    });
  }
}

/** Genera (o regenera) la dirección de hoy. Idempotente frente a dobles clics simultáneos. */
export async function generateDailyBrief(
  workspace: WorkspaceDocument,
  deps: DailyBriefDeps,
  now = new Date(),
): Promise<DailyBriefResponse> {
  assertDailyDirectorAvailable(workspace);
  const timezone = workspaceTimezone(workspace, deps.defaultTimezone);
  const localDate = localDateIn(now, timezone);
  const key = `${workspace._id.toString()}:${localDate}`;
  const running = inFlight.get(key);
  if (running) return running;
  const promise = runGeneration(workspace, timezone, localDate, deps, now).finally(() =>
    inFlight.delete(key),
  );
  inFlight.set(key, promise);
  return promise;
}

export async function listDailyBriefs(
  workspace: WorkspaceDocument,
  query: { limit: number; offset: number },
): Promise<DailyBriefListResponse> {
  assertDailyDirectorAvailable(workspace);
  const filter = { workspaceId: workspace._id };
  const [docs, total] = await Promise.all([
    DailyBriefModel.find(filter)
      .sort({ localDate: -1, version: -1 })
      .skip(query.offset)
      .limit(query.limit),
    DailyBriefModel.countDocuments(filter),
  ]);
  return { briefs: docs.map(toDailyBriefDTO), total };
}

export async function getDailyBrief(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<DailyBrief> {
  assertDailyDirectorAvailable(workspace);
  const doc = await DailyBriefModel.findOne({
    _id: resourceId(rawId, DAILY_BRIEF_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', DAILY_BRIEF_NOT_FOUND, {
      reason: 'daily_brief_not_found',
    });
  }
  return toDailyBriefDTO(doc);
}
