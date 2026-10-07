import { BrandDnaSchema, type BrandDna, type BrandDnaContent } from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

export interface BrandDnaAttrs extends BrandDnaContent {
  companyId: Types.ObjectId;
  version: number;
  /** Hash de las respuestas + versión del generador: evita versiones idénticas. */
  sourceHash: string;
  generator: { kind: 'deterministic' | 'ai'; version: string };
  createdAt: Date;
  updatedAt: Date;
}

export type BrandDnaDocument = HydratedDocument<BrandDnaAttrs>;

/*
 * Los bloques del ADN se guardan como subdocumentos estructurados. Su forma la define y
 * valida BrandDnaContentSchema (Zod, en contracts) al escribir y al leer: una sola fuente
 * de verdad en lugar de duplicar cada campo en Mongoose.
 */
const block = { type: Schema.Types.Mixed, required: true } as const;

const brandDnaSchema = new Schema<BrandDnaAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    version: { type: Number, required: true, min: 1 },
    sourceHash: { type: String, required: true },
    generator: {
      kind: { type: String, enum: ['deterministic', 'ai'], required: true },
      version: { type: String, required: true },
    },
    identity: block,
    purpose: block,
    audience: block,
    personality: block,
    archetypes: block,
    communication: block,
    visualLanguage: block,
    differentiators: block,
    creativePreferences: block,
    restrictions: block,
  },
  { timestamps: true, minimize: false },
);

brandDnaSchema.index({ companyId: 1, version: -1 }, { unique: true });
brandDnaSchema.plugin(tenantScoped);

export const BrandDnaModel = model<BrandDnaAttrs>('BrandDna', brandDnaSchema, 'brand_dnas');

export function toBrandDnaDTO(doc: BrandDnaDocument): BrandDna {
  return BrandDnaSchema.parse({
    id: doc._id.toString(),
    companyId: doc.companyId.toString(),
    version: doc.version,
    generator: { kind: doc.generator.kind, version: doc.generator.version },
    createdAt: doc.createdAt.toISOString(),
    identity: doc.identity,
    purpose: doc.purpose,
    audience: doc.audience,
    personality: doc.personality,
    archetypes: doc.archetypes,
    communication: doc.communication,
    visualLanguage: doc.visualLanguage,
    differentiators: doc.differentiators,
    creativePreferences: doc.creativePreferences,
    restrictions: doc.restrictions,
  });
}
