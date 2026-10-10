import {
  GuardianDimensionSchema,
  GuardianModeSchema,
  GuardianReportSchema,
  GuardianResourceTypeSchema,
  GuardianSeveritySchema,
  GuardianStatusSchema,
  type GuardianCorrectionField,
  type GuardianDimension,
  type GuardianMode,
  type GuardianReport,
  type GuardianResourceType,
  type GuardianSeverity,
  type GuardianStatus,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';
import type { GuardianFixHint, GuardianResourceSnapshot } from './guardian.types.js';

/*
 * GuardianReport (docs/BRAND-GUARDIAN.md §7): el resultado de una revisión. Se guarda para
 * auditoría, revisión histórica y, más adelante, memoria creativa. Es una INSTANTÁNEA: si el
 * recurso cambia, el informe no cambia (al leerlo se marca `stale`). Abrir un informe nunca vuelve
 * a llamar a la IA. Recurso del workspace (tenantScoped).
 *
 * `snapshot` guarda los textos revisados (necesarios para "Corregir con Pixel"); un texto pegado
 * vive solo aquí, nunca se convierte en ContentItem. No sale de la API.
 */

export interface StoredFinding {
  id: string;
  evaluator: string;
  dimension: GuardianDimension;
  severity: GuardianSeverity;
  blocking: boolean;
  code: string;
  title: string;
  message: string;
  evidence: string[];
  brandEvidence: string[];
  recommendation: string | null;
  canAutoFix: boolean;
  canOverride: boolean;
  overridden: boolean;
  overriddenAt: Date | null;
  fix: GuardianFixHint[];
}

export interface GuardianReportAttrs {
  workspaceId: Types.ObjectId;
  mode: GuardianMode;
  resourceType: GuardianResourceType;
  resourceId: Types.ObjectId | null;
  resourceLabel: string;
  brandDnaVersion: number;
  campaignId: Types.ObjectId | null;
  campaignStrategyVersion: number | null;
  status: GuardianStatus;
  score: number | null;
  dimensions: {
    dimension: GuardianDimension;
    applicable: boolean;
    score: number | null;
    status: GuardianStatus;
    summary: string | null;
    findingIds: string[];
  }[];
  findings: StoredFinding[];
  summary: string;
  generation: {
    deterministic: boolean;
    aiUsed: boolean;
    provider: string | null;
    model: string | null;
    mode: 'ai' | 'demo' | 'rules';
  };
  correction: {
    fromReportId: Types.ObjectId;
    fields: GuardianCorrectionField[];
    changes: string[];
    appliedAt: Date | null;
  } | null;
  snapshot: GuardianResourceSnapshot & { userSupplied: string[] };
  sourceSnapshotHash: string;
  /** Fecha del recurso al revisarlo: si después cambia, el informe está desactualizado. */
  resourceUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GuardianReportDocument = HydratedDocument<GuardianReportAttrs>;

const findingSchema = new Schema<StoredFinding>(
  {
    id: { type: String, required: true },
    evaluator: { type: String, required: true },
    dimension: { type: String, enum: GuardianDimensionSchema.options, required: true },
    severity: { type: String, enum: GuardianSeveritySchema.options, required: true },
    blocking: { type: Boolean, required: true },
    code: { type: String, required: true, maxlength: 80 },
    title: { type: String, required: true, maxlength: 300 },
    message: { type: String, required: true, maxlength: 1500 },
    evidence: { type: [String], default: [] },
    brandEvidence: { type: [String], default: [] },
    recommendation: { type: String, default: null, maxlength: 800 },
    canAutoFix: { type: Boolean, required: true },
    canOverride: { type: Boolean, required: true },
    overridden: { type: Boolean, default: false },
    overriddenAt: { type: Date, default: null },
    fix: { type: Schema.Types.Mixed, default: () => [] },
  },
  { _id: false },
);

const guardianReportSchema = new Schema<GuardianReportAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    mode: { type: String, enum: GuardianModeSchema.options, required: true },
    resourceType: { type: String, enum: GuardianResourceTypeSchema.options, required: true },
    resourceId: { type: Schema.Types.ObjectId, default: null },
    resourceLabel: { type: String, required: true, maxlength: 200 },
    brandDnaVersion: { type: Number, required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },
    campaignStrategyVersion: { type: Number, default: null },
    status: { type: String, enum: GuardianStatusSchema.options, required: true },
    score: { type: Number, default: null },
    dimensions: { type: Schema.Types.Mixed, default: () => [] },
    findings: { type: [findingSchema], default: [] },
    summary: { type: String, required: true, maxlength: 2000 },
    generation: {
      deterministic: { type: Boolean, required: true },
      aiUsed: { type: Boolean, required: true },
      provider: { type: String, default: null },
      model: { type: String, default: null },
      mode: { type: String, enum: ['ai', 'demo', 'rules'], required: true },
    },
    correction: { type: Schema.Types.Mixed, default: null },
    snapshot: { type: Schema.Types.Mixed, required: true },
    sourceSnapshotHash: { type: String, required: true },
    resourceUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

guardianReportSchema.index({ workspaceId: 1, createdAt: -1 });
guardianReportSchema.index({ workspaceId: 1, resourceType: 1, resourceId: 1, createdAt: -1 });
guardianReportSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const GuardianReportModel = model<GuardianReportAttrs>(
  'GuardianReport',
  guardianReportSchema,
  'guardian_reports',
);

export function toGuardianReportDTO(doc: GuardianReportDocument, stale = false): GuardianReport {
  return GuardianReportSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    contextType: 'enterprise',
    mode: doc.mode,
    resourceType: doc.resourceType,
    resourceId: doc.resourceId?.toString() ?? null,
    resourceLabel: doc.resourceLabel,
    brandDnaVersion: doc.brandDnaVersion,
    campaignId: doc.campaignId?.toString() ?? null,
    campaignStrategyVersion: doc.campaignStrategyVersion ?? null,
    status: doc.status,
    score: doc.score ?? null,
    dimensions: doc.dimensions,
    findings: doc.findings.map((finding) => ({
      id: finding.id,
      evaluator: finding.evaluator,
      dimension: finding.dimension,
      severity: finding.severity,
      blocking: finding.blocking,
      code: finding.code,
      title: finding.title,
      message: finding.message,
      evidence: finding.evidence,
      brandEvidence: finding.brandEvidence,
      recommendation: finding.recommendation ?? null,
      canAutoFix: finding.canAutoFix,
      canOverride: finding.canOverride,
      overridden: finding.overridden ?? false,
    })),
    summary: doc.summary,
    generation: doc.generation,
    correction: doc.correction
      ? {
          fromReportId: doc.correction.fromReportId.toString(),
          fields: doc.correction.fields,
          changes: doc.correction.changes,
          appliedAt: doc.correction.appliedAt
            ? new Date(doc.correction.appliedAt).toISOString()
            : null,
        }
      : null,
    sourceSnapshotHash: doc.sourceSnapshotHash,
    stale,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
