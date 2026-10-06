import { CompanyStatusSchema, type Company, type CompanyStatus } from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';

export interface CompanyAttrs {
  ownerId: Types.ObjectId;
  name: string;
  slug: string;
  industry: string;
  description: string;
  logoUrl: string | null;
  status: CompanyStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type CompanyDocument = HydratedDocument<CompanyAttrs>;

const companySchema = new Schema<CompanyAttrs>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, maxlength: 80 },
    industry: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 2000 },
    logoUrl: { type: String, default: null },
    status: { type: String, enum: CompanyStatusSchema.options, default: 'draft', required: true },
  },
  { timestamps: true },
);

companySchema.index({ ownerId: 1, createdAt: -1 });
// El slug es único dentro de las empresas de un mismo dueño.
companySchema.index({ ownerId: 1, slug: 1 }, { unique: true });

export const CompanyModel = model<CompanyAttrs>('Company', companySchema);

export function toCompanyDTO(company: CompanyDocument): Company {
  return {
    id: company._id.toString(),
    ownerId: company.ownerId.toString(),
    name: company.name,
    slug: company.slug,
    industry: company.industry,
    description: company.description,
    logoUrl: company.logoUrl,
    status: company.status,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}
