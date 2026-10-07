import {
  PersonalDnaContentSchema,
  PersonalDnaSchema,
  type PersonalDna,
  type PersonalDnaContent,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

export type PersonalDnaGeneratorKind = 'deterministic' | 'ai' | 'manual';

export interface PersonalDnaAttrs extends PersonalDnaContent {
  workspaceId: Types.ObjectId;
  personalProfileId: Types.ObjectId;
  version: number;
  /**
   * Hash de las respuestas del onboarding + versión del generador. Una edición manual conserva el
   * hash de las respuestas de las que partió: volver a guardar las mismas respuestas no la pisa.
   */
  sourceHash: string;
  generator: { kind: PersonalDnaGeneratorKind; version: string };
  createdAt: Date;
  updatedAt: Date;
}

export type PersonalDnaDocument = HydratedDocument<PersonalDnaAttrs>;

/*
 * Igual que BrandDNA: cada sección es un subdocumento cuya forma define y valida
 * PersonalDnaContentSchema (Zod, en contracts) al escribir y al leer. Es una entidad distinta de
 * BrandDNA (otra colección y otra clave de aislamiento: workspaceId).
 */
const section = { type: Schema.Types.Mixed, required: true } as const;

const personalDnaSchema = new Schema<PersonalDnaAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    personalProfileId: { type: Schema.Types.ObjectId, ref: 'PersonalProfile', required: true },
    version: { type: Number, required: true, min: 1 },
    sourceHash: { type: String, required: true },
    generator: {
      kind: { type: String, enum: ['deterministic', 'ai', 'manual'], required: true },
      version: { type: String, required: true },
    },
    identity: section,
    professionalProfile: section,
    goals: section,
    audience: section,
    personality: section,
    communication: section,
    creativeIdentity: section,
    contentIdentity: section,
    workStyle: section,
    supportNeeds: section,
    preferences: section,
    restrictions: section,
  },
  { timestamps: true, minimize: false },
);

personalDnaSchema.index({ workspaceId: 1, version: -1 }, { unique: true });
personalDnaSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const PersonalDnaModel = model<PersonalDnaAttrs>(
  'PersonalDna',
  personalDnaSchema,
  'personal_dnas',
);

/** Solo las secciones del ADN (validadas), sin metadatos. */
export function personalDnaContentOf(doc: PersonalDnaDocument): PersonalDnaContent {
  return PersonalDnaContentSchema.parse({
    identity: doc.identity,
    professionalProfile: doc.professionalProfile,
    goals: doc.goals,
    audience: doc.audience,
    personality: doc.personality,
    communication: doc.communication,
    creativeIdentity: doc.creativeIdentity,
    contentIdentity: doc.contentIdentity,
    workStyle: doc.workStyle,
    supportNeeds: doc.supportNeeds,
    preferences: doc.preferences,
    restrictions: doc.restrictions,
  });
}

export function toPersonalDnaDTO(doc: PersonalDnaDocument): PersonalDna {
  return PersonalDnaSchema.parse({
    ...personalDnaContentOf(doc),
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    personalProfileId: doc.personalProfileId.toString(),
    version: doc.version,
    generator: { kind: doc.generator.kind, version: doc.generator.version },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
