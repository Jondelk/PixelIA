import {
  CREATIVE_MEMORY_DIMENSIONS,
  CreativeMemoryKindSchema,
  CreativeMemoryOriginSchema,
  CreativeMemoryPolaritySchema,
  CreativeMemorySchema,
  CreativeMemoryScopeTypeSchema,
  CreativeMemoryStatusSchema,
  MemoryScopeSchema,
  type CreativeMemory,
  type CreativeMemoryDimension,
  type CreativeMemoryKind,
  type CreativeMemoryOrigin,
  type CreativeMemoryPolarity,
  type CreativeMemoryScopeType,
  type CreativeMemoryStatus,
  type MemoryScope,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * CreativeMemory (Prompt 16, docs/CREATIVE-MEMORY.md): conocimiento creativo operativo de un
 * workspace, derivado de decisiones y confirmado por el usuario, o indicado explícitamente.
 *
 * Compatibilidad con el modelo anterior (solo modelo, sin escritura en producción):
 * - `content` es el enunciado (`statement` en el DTO) y `memoryScope` el tipo de workspace;
 * - `source` {message|manual} se conserva tal cual; la procedencia nueva va en `origin`;
 * - `status` NO tiene default en Mongoose: un default se aplicaría al leer y convertiría en
 *   "active" las memorias antiguas. Sin `status` = legacy (fuera del retrieval); la migración lo
 *   escribe (creativeMemory.migration.ts).
 * Nunca se borra: olvidar, descartar o reemplazar cambia el estado.
 */
export interface CreativeMemoryAttrs {
  workspaceId: Types.ObjectId;
  memoryScope: MemoryScope;
  /** Enterprise: empresa del workspace. Ausente en memorias personales. */
  companyId?: Types.ObjectId;
  kind: CreativeMemoryKind;
  content: string;
  source?: {
    type: 'message' | 'manual';
    conversationId: Types.ObjectId | null;
    messageId: Types.ObjectId | null;
  };
  createdByUserId: Types.ObjectId;
  /** Anterior al Prompt 16; se mantiene sincronizado con `status === 'active'`. */
  active: boolean;
  status?: CreativeMemoryStatus;
  origin?: CreativeMemoryOrigin;
  dimension?: CreativeMemoryDimension;
  normalizedKey?: string;
  polarity?: CreativeMemoryPolarity;
  value?: string | null;
  scope?: { type: CreativeMemoryScopeType; id: Types.ObjectId | null; label: string | null };
  confidence?: number;
  occurrenceCount?: number;
  evidenceCount?: number;
  evidenceSummary?: string | null;
  /** Los 20 más recientes; el total va en evidenceCount. */
  evidenceEventIds?: Types.ObjectId[];
  confirmedByUser?: boolean;
  confirmedAt?: Date | null;
  supersedesMemoryId?: Types.ObjectId | null;
  supersededByMemoryId?: Types.ObjectId | null;
  forgottenAt?: Date | null;
  dismissedAt?: Date | null;
  lastObservedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreativeMemoryDocument = HydratedDocument<CreativeMemoryAttrs>;

const creativeMemorySchema = new Schema<CreativeMemoryAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    memoryScope: { type: String, enum: MemoryScopeSchema.options, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    kind: { type: String, enum: CreativeMemoryKindSchema.options, required: true },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
    source: {
      type: { type: String, enum: ['message', 'manual'] },
      conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
      messageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    active: { type: Boolean, required: true, default: true },
    status: { type: String, enum: CreativeMemoryStatusSchema.options },
    origin: { type: String, enum: CreativeMemoryOriginSchema.options },
    dimension: { type: String, enum: CREATIVE_MEMORY_DIMENSIONS },
    normalizedKey: { type: String, maxlength: 80 },
    polarity: { type: String, enum: CreativeMemoryPolaritySchema.options },
    value: { type: String, default: null, maxlength: 40 },
    scope: {
      type: { type: String, enum: CreativeMemoryScopeTypeSchema.options },
      id: { type: Schema.Types.ObjectId, default: null },
      label: { type: String, default: null, maxlength: 160 },
    },
    confidence: { type: Number, min: 0, max: 1 },
    occurrenceCount: { type: Number, min: 0 },
    evidenceCount: { type: Number, min: 0 },
    evidenceSummary: { type: String, default: null, maxlength: 300 },
    evidenceEventIds: { type: [Schema.Types.ObjectId], default: undefined },
    confirmedByUser: { type: Boolean },
    confirmedAt: { type: Date, default: null },
    supersedesMemoryId: { type: Schema.Types.ObjectId, default: null },
    supersededByMemoryId: { type: Schema.Types.ObjectId, default: null },
    forgottenAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
    lastObservedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Consultas reales: lista por estado (página de memoria), retrieval por alcance y búsqueda por clave
// (detector, duplicados, supersesión y anti-reaprendizaje). El índice anterior queda para el chat legacy.
creativeMemorySchema.index({ workspaceId: 1, active: 1, createdAt: -1 });
creativeMemorySchema.index({ workspaceId: 1, status: 1, updatedAt: -1 });
creativeMemorySchema.index({ workspaceId: 1, normalizedKey: 1, status: 1 });
// Sin duplicados: una sola memoria activa (y una candidata) por clave y alcance. Dos instrucciones
// simultáneas iguales chocan aquí y la segunda refuerza la existente.
for (const status of ['active', 'candidate'] as const) {
  creativeMemorySchema.index(
    { workspaceId: 1, normalizedKey: 1, 'scope.type': 1, 'scope.id': 1 },
    { unique: true, partialFilterExpression: { status }, name: `one_${status}_per_key_scope` },
  );
}
creativeMemorySchema.plugin(tenantScoped, { key: 'workspaceId' });

export const CreativeMemoryModel = model<CreativeMemoryAttrs>(
  'CreativeMemory',
  creativeMemorySchema,
  'creative_memories',
);

const LEGACY_DIMENSION: CreativeMemoryDimension = 'other';

export function toCreativeMemoryDTO(doc: CreativeMemoryDocument): CreativeMemory {
  const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
  const status = doc.status ?? 'legacy';
  return CreativeMemorySchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    contextType: doc.memoryScope,
    kind: doc.kind,
    dimension: doc.dimension ?? LEGACY_DIMENSION,
    scope: {
      type: doc.scope?.type ?? 'workspace',
      id: doc.scope?.id?.toString() ?? null,
      label: doc.scope?.label ?? null,
    },
    normalizedKey: doc.normalizedKey ?? `other:legacy:neutral`,
    statement: doc.content,
    polarity: doc.polarity ?? 'neutral',
    value: doc.value ?? null,
    status,
    origin: doc.origin ?? 'legacy',
    confidence: doc.confidence ?? 0,
    occurrenceCount: doc.occurrenceCount ?? 0,
    evidenceCount: doc.evidenceCount ?? 0,
    evidenceSummary: doc.evidenceSummary ?? null,
    confirmedByUser: doc.confirmedByUser ?? false,
    confirmedAt: iso(doc.confirmedAt),
    supersedesMemoryId: doc.supersedesMemoryId?.toString() ?? null,
    supersededByMemoryId: doc.supersededByMemoryId?.toString() ?? null,
    forgottenAt: iso(doc.forgottenAt),
    dismissedAt: iso(doc.dismissedAt),
    lastObservedAt: iso(doc.lastObservedAt),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
