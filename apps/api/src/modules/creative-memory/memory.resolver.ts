import {
  CREATIVE_MEMORY_SCOPE_SPECIFICITY,
  type ContentFormat,
  type ContentPlatform,
  type CreativeMemoryDimension,
  type CreativeMemoryKind,
  type CreativeMemoryPolarity,
  type CreativeMemoryScopeType,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { hasWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import { CreativeMemoryModel } from './creativeMemory.model.js';
import { parseMemoryKey, subjectOf } from './memory.lexicon.js';

/*
 * CreativeMemoryResolver + CreativeMemoryConflictResolver (docs/CREATIVE-MEMORY.md §9–§10).
 *
 * Nunca "todas las memorias": UNA consulta acotada (activas del workspace en los alcances que
 * aplican y las dimensiones pedidas), después:
 *   - por tema (`dimension:subject`) gana el alcance más específico (plan > proyecto / campaña >
 *     workspace); una EXCEPCIÓN (`allow`) de la campaña suspende la preferencia general SOLO en esa
 *     campaña (no la borra);
 *   - ranking: especificidad → confirmada por el usuario → relevancia de la dimensión → confianza →
 *     última observación (la recencia nunca es la única señal);
 *   - como máximo 8 memorias con alcance y 8 del workspace, con referencias MEMORY_n.
 * Las memorias `legacy`, candidatas, descartadas, olvidadas o reemplazadas nunca entran.
 */

export const MEMORY_RESOLVER_LIMITS = { scoped: 8, workspace: 8, query: 60 };

export interface ResolvedMemory {
  ref: string;
  id: string;
  statement: string;
  normalizedKey: string;
  dimension: CreativeMemoryDimension;
  subject: string;
  polarity: CreativeMemoryPolarity;
  value: string | null;
  kind: CreativeMemoryKind;
  scopeType: CreativeMemoryScopeType;
  scopeLabel: string | null;
}

export interface ResolvedMemories {
  memories: ResolvedMemory[];
  /** Preferencias del workspace suspendidas por una excepción de este alcance (para explicar). */
  suspended: ResolvedMemory[];
}

export interface MemoryQuery {
  /** Dimensiones relevantes para el motor (vacío = todas). */
  dimensions?: CreativeMemoryDimension[];
  campaignId?: string | Types.ObjectId | null;
  projectId?: string | Types.ObjectId | null;
  contentPlanId?: string | Types.ObjectId | null;
}

export const NO_MEMORIES: ResolvedMemories = { memories: [], suspended: [] };

interface Row {
  _id: Types.ObjectId;
  content: string;
  normalizedKey?: string;
  dimension?: CreativeMemoryDimension;
  polarity?: CreativeMemoryPolarity;
  value?: string | null;
  kind: CreativeMemoryKind;
  scope?: { type: CreativeMemoryScopeType; id: Types.ObjectId | null; label: string | null };
  confirmedByUser?: boolean;
  confidence?: number;
  lastObservedAt?: Date | null;
  updatedAt: Date;
}

const toId = (value: string | Types.ObjectId) => new Types.ObjectId(value.toString());

export async function resolveCreativeMemories(
  workspace: WorkspaceDocument,
  query: MemoryQuery = {},
): Promise<ResolvedMemories> {
  if (!hasWorkspaceFeature(workspace, 'creativeMemory')) return NO_MEMORIES;
  const scopes: Record<string, unknown>[] = [{ 'scope.type': 'workspace' }];
  if (query.campaignId)
    scopes.push({ 'scope.type': 'campaign', 'scope.id': toId(query.campaignId) });
  if (query.projectId) scopes.push({ 'scope.type': 'project', 'scope.id': toId(query.projectId) });
  if (query.contentPlanId) {
    scopes.push({ 'scope.type': 'content_plan', 'scope.id': toId(query.contentPlanId) });
  }
  const rows = (await CreativeMemoryModel.find({
    workspaceId: workspace._id,
    status: 'active',
    ...(query.dimensions?.length ? { dimension: { $in: query.dimensions } } : {}),
    $or: scopes,
  })
    .sort({ confirmedByUser: -1, confidence: -1, lastObservedAt: -1 })
    .limit(MEMORY_RESOLVER_LIMITS.query)
    .lean()) as Row[];
  return rankAndResolve(rows, query.dimensions ?? []);
}

const specificity = (row: Row) => CREATIVE_MEMORY_SCOPE_SPECIFICITY[row.scope?.type ?? 'workspace'];

/** Pura (testeable): conflictos por tema, excepciones, ranking y límites. */
export function rankAndResolve(
  rows: Row[],
  dimensions: CreativeMemoryDimension[],
): ResolvedMemories {
  const bySubject = new Map<string, Row[]>();
  for (const row of rows) {
    const parsed = row.normalizedKey ? parseMemoryKey(row.normalizedKey) : null;
    if (!parsed) continue;
    const topic = `${parsed.dimension}:${parsed.subject}`;
    bySubject.set(topic, [...(bySubject.get(topic) ?? []), row]);
  }
  const chosen: Row[] = [];
  const suspended: Row[] = [];
  for (const group of bySubject.values()) {
    const sorted = [...group].sort(
      (a, b) => specificity(b) - specificity(a) || Number(b.updatedAt) - Number(a.updatedAt),
    );
    const winner = sorted[0]!;
    chosen.push(winner);
    // Lo menos específico del mismo tema queda suspendido mientras aplique el alcance concreto.
    suspended.push(...sorted.slice(1).filter((row) => specificity(row) < specificity(winner)));
  }
  const relevance = (row: Row) => {
    const index = row.dimension ? dimensions.indexOf(row.dimension) : -1;
    return index === -1 ? dimensions.length : index;
  };
  chosen.sort(
    (a, b) =>
      specificity(b) - specificity(a) ||
      Number(b.confirmedByUser ?? false) - Number(a.confirmedByUser ?? false) ||
      relevance(a) - relevance(b) ||
      (b.confidence ?? 0) - (a.confidence ?? 0) ||
      Number(b.lastObservedAt ?? b.updatedAt) - Number(a.lastObservedAt ?? a.updatedAt),
  );
  const scoped = chosen
    .filter((row) => row.scope && row.scope.type !== 'workspace')
    .slice(0, MEMORY_RESOLVER_LIMITS.scoped);
  const general = chosen
    .filter((row) => !row.scope || row.scope.type === 'workspace')
    .slice(0, MEMORY_RESOLVER_LIMITS.workspace);
  const toResolved = (row: Row, index: number): ResolvedMemory => {
    const parsed = parseMemoryKey(row.normalizedKey!)!;
    return {
      ref: `MEMORY_${index + 1}`,
      id: row._id.toString(),
      statement: row.content,
      normalizedKey: row.normalizedKey!,
      dimension: parsed.dimension,
      subject: parsed.subject,
      polarity: parsed.polarity,
      value: row.value ?? null,
      kind: row.kind,
      scopeType: row.scope?.type ?? 'workspace',
      scopeLabel: row.scope?.label ?? null,
    };
  };
  const memories = [...scoped, ...general].map(toResolved);
  return {
    memories,
    suspended: suspended.map((row, index) => toResolved(row, memories.length + index)),
  };
}

/* ---------- Directivas deterministas para los motores ---------- */

export interface PlacementDirectives {
  avoidFormats: ContentFormat[];
  preferFormats: ContentFormat[];
  avoidPlatforms: ContentPlatform[];
  preferPlatforms: ContentPlatform[];
  /** Claves aplicadas (para marcar lo generado como influido por la memoria). */
  keys: string[];
}

/** Formatos y plataformas que la memoria orienta (la solicitud actual siempre manda sobre esto). */
export function placementDirectives(resolved: ResolvedMemories): PlacementDirectives {
  const result: PlacementDirectives = {
    avoidFormats: [],
    preferFormats: [],
    avoidPlatforms: [],
    preferPlatforms: [],
    keys: [],
  };
  for (const memory of resolved.memories) {
    const subject = subjectOf(memory.dimension, memory.subject);
    if (subject?.format) {
      if (memory.polarity === 'avoid') result.avoidFormats.push(subject.format);
      else result.preferFormats.push(subject.format);
      result.keys.push(memory.normalizedKey);
    } else if (subject?.platform) {
      if (memory.polarity === 'avoid') result.avoidPlatforms.push(subject.platform);
      else result.preferPlatforms.push(subject.platform);
      result.keys.push(memory.normalizedKey);
    }
  }
  return result;
}

export const hasMemory = (resolved: ResolvedMemories, key: string) =>
  resolved.memories.some((memory) => memory.normalizedKey === key);

/** Resumen compacto para la IA: "MEMORY_1: Evitar Stories salvo petición explícita". */
export function memoryLines(resolved: ResolvedMemories): { ref: string; statement: string }[] {
  return resolved.memories.map((memory) => ({
    ref: memory.ref,
    statement:
      memory.scopeType === 'workspace' || !memory.scopeLabel
        ? memory.statement
        : `${memory.statement} (solo en «${memory.scopeLabel}»)`,
  }));
}
