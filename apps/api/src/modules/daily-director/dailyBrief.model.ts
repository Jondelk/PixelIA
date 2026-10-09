import {
  DailyBriefSchema,
  DailyGenerationModeSchema,
  WorkspaceTypeSchema,
  type DailyBrief,
  type DailyContentSuggestion,
  type DailyFacts,
  type DailyGeneration,
  type DailyGenerationMode,
  type DailyPriority,
  type DailyWarning,
  type FocusBlock,
  type WorkspaceType,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * DailyBrief: la dirección del día de un workspace. Resultado DERIVADO (no se edita a mano):
 * regenerar crea una versión nueva del mismo día y se devuelve siempre la última. Toda consulta
 * filtra por workspaceId (tenantScoped).
 */

/** Huella del estado al generar: detecta borrados que `updatedAt` no puede detectar. */
export interface DailySourceFingerprint {
  openTasks: number;
  activeContent: number;
}

export interface DailyBriefAttrs {
  workspaceId: Types.ObjectId;
  contextType: WorkspaceType;
  localDate: string;
  timezone: string;
  version: number;
  personalDnaVersion: number | null;
  generationMode: DailyGenerationMode;
  summary: string;
  priorities: DailyPriority[];
  warnings: DailyWarning[];
  contentSuggestion: DailyContentSuggestion | null;
  focusBlocks: FocusBlock[];
  closingNote: string | null;
  facts: DailyFacts;
  generation: DailyGeneration;
  fingerprint: DailySourceFingerprint;
  contextSnapshotAt: Date;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type DailyBriefDocument = HydratedDocument<DailyBriefAttrs>;

// Estructuras anidadas: se validan con Zod (DailyBriefSchema) al escribir y al leer.
const dailyBriefSchema = new Schema<DailyBriefAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    contextType: { type: String, enum: WorkspaceTypeSchema.options, required: true },
    localDate: { type: String, required: true },
    timezone: { type: String, required: true },
    version: { type: Number, required: true, min: 1 },
    personalDnaVersion: { type: Number, default: null },
    generationMode: { type: String, enum: DailyGenerationModeSchema.options, required: true },
    summary: { type: String, required: true },
    priorities: { type: Schema.Types.Mixed, default: () => [] },
    warnings: { type: Schema.Types.Mixed, default: () => [] },
    contentSuggestion: { type: Schema.Types.Mixed, default: null },
    focusBlocks: { type: Schema.Types.Mixed, default: () => [] },
    closingNote: { type: String, default: null },
    facts: { type: Schema.Types.Mixed, required: true },
    generation: { type: Schema.Types.Mixed, required: true },
    fingerprint: { type: Schema.Types.Mixed, required: true },
    contextSnapshotAt: { type: Date, required: true },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: true, minimize: false },
);

// Una versión por día; el mismo índice sirve para recuperar la vigente (prefijo + version desc)
// y el historial del workspace (prefijo workspaceId).
dailyBriefSchema.index({ workspaceId: 1, localDate: -1, version: -1 }, { unique: true });
dailyBriefSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const DailyBriefModel = model<DailyBriefAttrs>(
  'DailyBrief',
  dailyBriefSchema,
  'daily_briefs',
);

export function toDailyBriefDTO(doc: DailyBriefDocument): DailyBrief {
  return DailyBriefSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    contextType: doc.contextType,
    localDate: doc.localDate,
    timezone: doc.timezone,
    version: doc.version,
    personalDnaVersion: doc.personalDnaVersion ?? null,
    generationMode: doc.generationMode,
    summary: doc.summary,
    priorities: doc.priorities,
    warnings: doc.warnings,
    contentSuggestion: doc.contentSuggestion ?? null,
    focusBlocks: doc.focusBlocks,
    closingNote: doc.closingNote ?? null,
    facts: doc.facts,
    generation: doc.generation,
    contextSnapshotAt: doc.contextSnapshotAt.toISOString(),
    generatedAt: doc.generatedAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
