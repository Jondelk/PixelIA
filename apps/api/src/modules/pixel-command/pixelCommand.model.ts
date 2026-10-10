import {
  PixelActionStepTypeSchema,
  PixelCommandEntitiesSchema,
  PixelCommandIntentSchema,
  PixelCommandSchema,
  PixelCommandSourceSchema,
  PixelCommandStatusSchema,
  PixelResourceKindSchema,
  type PixelActionStepType,
  type PixelCommand,
  type PixelCommandEntities,
  type PixelCommandIntent,
  type PixelCommandSource,
  type PixelCommandStatus,
  type PixelCreatedResource,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * PixelCommand (docs/PIXEL-COMMAND.md): una solicitud natural y su ciclo de vida
 * (needs_information → proposed → executing → completed | partial | failed, o cancelled; answered
 * para lo que solo se responde). Guarda la propuesta, sus pasos con los parámetros internos (nunca
 * salen de la API) y lo que se creó en cada uno: así confirmar dos veces no duplica y un fallo
 * parcial queda explicado. Recurso del workspace (tenantScoped).
 */

export interface PixelStepAttrs {
  id: string;
  type: PixelActionStepType;
  title: string;
  status: 'pending' | 'done' | 'failed';
  /** Parámetros internos del paso (entrada validada del servicio existente). */
  params: Record<string, unknown>;
  resources: PixelCreatedResource[];
  error: string | null;
}

export interface PixelCommandAttrs {
  workspaceId: Types.ObjectId;
  status: PixelCommandStatus;
  intent: PixelCommandIntent;
  request: string;
  source: PixelCommandSource;
  tzOffset: number;
  turns: { role: 'user' | 'pixel'; text: string; at: Date }[];
  entities: PixelCommandEntities;
  /** Dato que se preguntó (needs_information): la respuesta lo rellena. */
  pendingField: string | null;
  question: string | null;
  reply: string | null;
  plan: {
    summary: string;
    understood: string[];
    proposal: string[];
    creates: string[];
    requiresConfirmation: boolean;
    revision: number;
  } | null;
  steps: PixelStepAttrs[];
  /** Campaña elegida por el usuario o por la pantalla (siempre de este workspace). */
  campaignId: Types.ObjectId | null;
  /** El usuario dijo "sin campaña" al preguntarle. */
  noCampaign: boolean;
  contextHint: { intent: 'create_campaign' | 'plan_content' | null };
  interpretation: { mode: 'ai' | 'demo' | 'rules'; confidence: number };
  executionId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PixelCommandDocument = HydratedDocument<PixelCommandAttrs>;

const resourceSchema = new Schema<PixelCreatedResource>(
  {
    kind: { type: String, enum: PixelResourceKindSchema.options, required: true },
    id: { type: String, required: true },
    label: { type: String, required: true, maxlength: 200 },
  },
  { _id: false },
);

const stepSchema = new Schema<PixelStepAttrs>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: PixelActionStepTypeSchema.options, required: true },
    title: { type: String, required: true, maxlength: 300 },
    status: {
      type: String,
      enum: ['pending', 'done', 'failed'],
      required: true,
      default: 'pending',
    },
    params: { type: Schema.Types.Mixed, default: {} },
    resources: { type: [resourceSchema], default: [] },
    error: { type: String, default: null, maxlength: 500 },
  },
  { _id: false },
);

const pixelCommandSchema = new Schema<PixelCommandAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    status: { type: String, enum: PixelCommandStatusSchema.options, required: true },
    intent: { type: String, enum: PixelCommandIntentSchema.options, required: true },
    request: { type: String, required: true, maxlength: 2000 },
    source: { type: String, enum: PixelCommandSourceSchema.options, default: 'text' },
    tzOffset: { type: Number, default: 0 },
    turns: {
      type: [
        new Schema(
          {
            role: { type: String, enum: ['user', 'pixel'], required: true },
            text: { type: String, required: true, maxlength: 4000 },
            at: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    entities: { type: Schema.Types.Mixed, default: () => PixelCommandEntitiesSchema.parse({}) },
    pendingField: { type: String, default: null },
    question: { type: String, default: null, maxlength: 600 },
    reply: { type: String, default: null, maxlength: 6000 },
    plan: {
      type: new Schema(
        {
          summary: { type: String, required: true, maxlength: 1500 },
          understood: { type: [String], default: [] },
          proposal: { type: [String], default: [] },
          creates: { type: [String], default: [] },
          requiresConfirmation: { type: Boolean, default: true },
          revision: { type: Number, required: true, default: 1 },
        },
        { _id: false },
      ),
      default: null,
    },
    steps: { type: [stepSchema], default: [] },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },
    noCampaign: { type: Boolean, default: false },
    contextHint: {
      intent: { type: String, enum: ['create_campaign', 'plan_content', null], default: null },
    },
    interpretation: {
      mode: { type: String, enum: ['ai', 'demo', 'rules'], required: true },
      confidence: { type: Number, required: true },
    },
    executionId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

pixelCommandSchema.index({ workspaceId: 1, createdAt: -1 });
pixelCommandSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const PixelCommandModel = model<PixelCommandAttrs>(
  'PixelCommand',
  pixelCommandSchema,
  'pixel_commands',
);

export function toPixelCommandDTO(doc: PixelCommandDocument): PixelCommand {
  return PixelCommandSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    status: doc.status,
    intent: doc.intent,
    request: doc.request,
    source: doc.source ?? 'text',
    turns: doc.turns.map((turn) => ({
      role: turn.role,
      text: turn.text,
      at: turn.at.toISOString(),
    })),
    question: doc.question ?? null,
    reply: doc.reply ?? null,
    plan: doc.plan
      ? {
          intent: doc.intent,
          summary: doc.plan.summary,
          understood: doc.plan.understood,
          proposal: doc.plan.proposal,
          creates: doc.plan.creates,
          requiresConfirmation: doc.plan.requiresConfirmation,
          revision: doc.plan.revision,
          steps: doc.steps.map((step) => ({
            id: step.id,
            type: step.type,
            title: step.title,
            status: step.status,
            resources: step.resources.map((resource) => ({
              kind: resource.kind,
              id: resource.id,
              label: resource.label,
            })),
            error: step.error ?? null,
          })),
        }
      : null,
    interpretation: { mode: doc.interpretation.mode, confidence: doc.interpretation.confidence },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
