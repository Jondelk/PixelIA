import {
  CREATIVE_MEMORY_DIMENSIONS,
  CreativeDecisionEventTypeSchema,
  CreativeSignalActionSchema,
  CreativeSignalStrengthSchema,
  MemoryScopeSchema,
  type CompactDecisionSnapshot,
  type CreativeDecisionEventType,
  type CreativeSignal,
  type MemoryScope,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * CreativeDecisionEvent (Prompt 16): evidencia histórica de UNA decisión creativa humana. Es
 * INMUTABLE: si ocurre otra decisión se crea otro evento (el historial debe ser auditable). Es
 * idempotente por `{ workspaceId, sourceEventKey }` (índice único): repetir la misma acción no
 * duplica la señal. No tiene CRUD público: solo lo escribe `recordCreativeDecision` desde los
 * servicios, y la UI solo ve un resumen controlado.
 */
export interface CreativeDecisionEventAttrs {
  workspaceId: Types.ObjectId;
  contextType: MemoryScope;
  eventType: CreativeDecisionEventType;
  resourceType: string | null;
  resourceId: Types.ObjectId | null;
  campaignId: Types.ObjectId | null;
  projectId: Types.ObjectId | null;
  contentPlanId: Types.ObjectId | null;
  actorUserId: Types.ObjectId;
  signals: CreativeSignal[];
  before: CompactDecisionSnapshot;
  after: CompactDecisionSnapshot;
  sourceEventKey: string;
  /** Frase humana para "¿Por qué Pixel piensa esto?" ("Quitaste Stories en «Plan de junio»"). */
  description: string;
  metadata: {
    source: string | null;
    dimension: string | null;
    reason: string | null;
    /** La propuesta decidida ya venía influida por una memoria: no cuenta como señal independiente. */
    influencedByMemory: boolean;
  };
  occurredAt: Date;
  createdAt: Date;
}

export type CreativeDecisionEventDocument = HydratedDocument<CreativeDecisionEventAttrs>;

const signalSchema = new Schema<CreativeSignal>(
  {
    dimension: { type: String, enum: CREATIVE_MEMORY_DIMENSIONS, required: true },
    subject: { type: String, required: true, maxlength: 60 },
    action: { type: String, enum: CreativeSignalActionSchema.options, required: true },
    value: { type: String, default: null, maxlength: 200 },
    previousValue: { type: String, default: null, maxlength: 200 },
    normalizedKey: { type: String, required: true, maxlength: 80 },
    strength: { type: String, enum: CreativeSignalStrengthSchema.options, required: true },
  },
  { _id: false },
);

const snapshotSchema = new Schema(
  {
    field: { type: String, required: true, maxlength: 60 },
    value: { type: String, required: true, maxlength: 300 },
  },
  { _id: false },
);

const eventSchema = new Schema<CreativeDecisionEventAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    contextType: { type: String, enum: MemoryScopeSchema.options, required: true },
    eventType: { type: String, enum: CreativeDecisionEventTypeSchema.options, required: true },
    resourceType: { type: String, default: null, maxlength: 40 },
    resourceId: { type: Schema.Types.ObjectId, default: null },
    campaignId: { type: Schema.Types.ObjectId, default: null },
    projectId: { type: Schema.Types.ObjectId, default: null },
    contentPlanId: { type: Schema.Types.ObjectId, default: null },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    signals: { type: [signalSchema], default: [] },
    before: { type: [snapshotSchema], default: [] },
    after: { type: [snapshotSchema], default: [] },
    sourceEventKey: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 300 },
    metadata: {
      source: { type: String, default: null, maxlength: 60 },
      dimension: { type: String, default: null, maxlength: 40 },
      reason: { type: String, default: null, maxlength: 200 },
      influencedByMemory: { type: Boolean, default: false },
    },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

eventSchema.index({ workspaceId: 1, sourceEventKey: 1 }, { unique: true });
// Detector de patrones: eventos de una clave posteriores a una fecha (anti-reaprendizaje).
eventSchema.index({ workspaceId: 1, 'signals.normalizedKey': 1, occurredAt: -1 });
eventSchema.plugin(tenantScoped, { key: 'workspaceId' });

// Inmutable: ninguna operación de actualización sobre los eventos.
const immutable = function (): never {
  throw new Error('CreativeDecisionEvent es inmutable: registra otro evento');
};
for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
] as const) {
  eventSchema.pre(op, immutable);
}

export const CreativeDecisionEventModel = model<CreativeDecisionEventAttrs>(
  'CreativeDecisionEvent',
  eventSchema,
  'creative_decision_events',
);
