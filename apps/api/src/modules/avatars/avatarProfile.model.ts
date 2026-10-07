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
  /** brand = sale de un BrandDNA (enterprise); personal = sale de un PersonalDNA. */
  sourceType: AvatarSourceType;
  /** Legacy/enterprise: empresa de origen. Obligatorio cuando sourceType = brand; nunca en personal. */
  companyId?: Types.ObjectId;
  version: number;
  /**
   * Versión del ADN del que se derivó (el avatar siempre sale del ADN, no del onboarding):
   * brandDnaVersion en brand, personalDnaVersion en personal.
   */
  brandDnaVersion?: number;
  personalDnaVersion?: number;
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
    brandDnaVersion: {
      type: Number,
      min: 1,
      required(this: AvatarProfileAttrs) {
        return this.sourceType === 'brand';
      },
    },
    personalDnaVersion: {
      type: Number,
      min: 1,
      required(this: AvatarProfileAttrs) {
        return this.sourceType === 'personal';
      },
    },
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
avatarProfileSchema.index(
  { workspaceId: 1, personalDnaVersion: 1 },
  { partialFilterExpression: { personalDnaVersion: { $exists: true } } },
);
// Compatibilidad Enterprise (por empresa). PARCIALES: solo indexan documentos con companyId, así
// los avatares personales (sin companyId) no chocan entre sí. Sustituyen a los índices legacy no
// parciales `companyId_1_version_-1` y `companyId_1_brandDnaVersion_1`, que retira
// upgradeAvatarProfileIndexes() (ver avatarProfile.indexes.ts y docs/PERSONAL.md).
avatarProfileSchema.index(
  { companyId: 1, version: -1 },
  {
    unique: true,
    name: 'brand_company_version',
    partialFilterExpression: { companyId: { $exists: true } },
  },
);
avatarProfileSchema.index(
  { companyId: 1, brandDnaVersion: 1 },
  {
    name: 'brand_company_dna_version',
    partialFilterExpression: { companyId: { $exists: true } },
  },
);
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
    brandDnaVersion: doc.brandDnaVersion ?? null,
    personalDnaVersion: doc.personalDnaVersion ?? null,
    engine: {
      kind: doc.engine.kind,
      version: doc.engine.version,
      variation: doc.engine.variation,
    },
    createdAt: doc.createdAt.toISOString(),
  });
}

/** Versión del ADN de origen, sea de marca o personal. */
export function sourceDnaVersion(doc: {
  brandDnaVersion?: number;
  personalDnaVersion?: number;
}): number {
  const version = doc.brandDnaVersion ?? doc.personalDnaVersion;
  if (!version) throw new Error('AvatarProfile sin versión de ADN de origen');
  return version;
}

export function toAvatarHistoryItem(doc: {
  version: number;
  name: string;
  concept: AvatarConcept;
  brandDnaVersion?: number;
  personalDnaVersion?: number;
  createdAt: Date;
}): AvatarHistoryItem {
  return {
    version: doc.version,
    name: doc.name,
    baseObject: doc.concept.baseObject,
    dnaVersion: sourceDnaVersion(doc),
    brandDnaVersion: doc.brandDnaVersion ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}
