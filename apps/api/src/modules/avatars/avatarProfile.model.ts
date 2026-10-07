import {
  AvatarProfileSchema,
  AvatarSourceTypeSchema,
  type AvatarConcept,
  type AvatarSourceType,
  type AvatarHistoryItem,
  type AvatarProfile,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

export interface AvatarProfileAttrs {
  /** Contexto principal: workspace al que pertenece (clave de aislamiento). */
  workspaceId: Types.ObjectId;
  /** brand = sale de un BrandDNA (enterprise); personal = sale de un PersonalDNA (próximamente). */
  sourceType: AvatarSourceType;
  /** Legacy/enterprise: empresa de origen. Obligatorio cuando sourceType = brand. */
  companyId?: Types.ObjectId;
  version: number;
  /** Versión del BrandDNA del que se derivó: el avatar siempre sale del ADN, no del onboarding. */
  brandDnaVersion: number;
  engine: { kind: 'deterministic' | 'ai'; version: string; variation: number };
  /** Concepto completo; su forma la define y valida AvatarConceptSchema (contracts). */
  concept: AvatarConcept;
  /** Copias para listar el historial sin leer el concepto completo. */
  name: string;
  baseObjectId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AvatarProfileDocument = HydratedDocument<AvatarProfileAttrs>;

const avatarProfileSchema = new Schema<AvatarProfileAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    sourceType: {
      type: String,
      enum: AvatarSourceTypeSchema.options,
      required: true,
      default: 'brand',
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required(this: AvatarProfileAttrs) {
        return this.sourceType === 'brand';
      },
    },
    version: { type: Number, required: true, min: 1 },
    brandDnaVersion: { type: Number, required: true, min: 1 },
    engine: {
      kind: { type: String, enum: ['deterministic', 'ai'], required: true },
      version: { type: String, required: true },
      variation: { type: Number, required: true, min: 0 },
    },
    concept: { type: Schema.Types.Mixed, required: true },
    name: { type: String, required: true },
    baseObjectId: { type: String, required: true },
  },
  { timestamps: true, minimize: false },
);

// Versiones por workspace. Parciales: documentos legacy aún sin migrar no tienen workspaceId.
avatarProfileSchema.index(
  { workspaceId: 1, version: -1 },
  { unique: true, partialFilterExpression: { workspaceId: { $exists: true } } },
);
avatarProfileSchema.index({ workspaceId: 1, brandDnaVersion: 1 });
// Legacy (por empresa): se conservan mientras todos los avatares sean de marca. Antes de crear
// avatares personales hay que hacerlos parciales (ver docs/WORKSPACE-MIGRATION.md).
avatarProfileSchema.index({ companyId: 1, version: -1 }, { unique: true });
avatarProfileSchema.index({ companyId: 1, brandDnaVersion: 1 });
avatarProfileSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const AvatarProfileModel = model<AvatarProfileAttrs>(
  'AvatarProfile',
  avatarProfileSchema,
  'avatar_profiles',
);

export function toAvatarProfileDTO(doc: AvatarProfileDocument): AvatarProfile {
  return AvatarProfileSchema.parse({
    ...doc.concept,
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    sourceType: doc.sourceType ?? 'brand',
    companyId: doc.companyId?.toString() ?? null,
    version: doc.version,
    brandDnaVersion: doc.brandDnaVersion,
    engine: {
      kind: doc.engine.kind,
      version: doc.engine.version,
      variation: doc.engine.variation,
    },
    createdAt: doc.createdAt.toISOString(),
  });
}

export function toAvatarHistoryItem(doc: {
  version: number;
  name: string;
  concept: AvatarConcept;
  brandDnaVersion: number;
  createdAt: Date;
}): AvatarHistoryItem {
  return {
    version: doc.version,
    name: doc.name,
    baseObject: doc.concept.baseObject,
    brandDnaVersion: doc.brandDnaVersion,
    createdAt: doc.createdAt.toISOString(),
  };
}
