import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';

/** Estado del Pixel de la empresa (ver máquina de estados en docs/MVP.md). */
export const CompanyStatusSchema = z.enum(['draft', 'onboarding', 'analyzing', 'ready', 'failed']);
export type CompanyStatus = z.infer<typeof CompanyStatusSchema>;

const LogoUrlSchema = z
  .url({ protocol: /^https?$/, error: 'Debe ser una URL http(s) válida' })
  .max(2048);

export const CompanySchema = z.object({
  id: ObjectIdSchema,
  ownerId: ObjectIdSchema,
  name: z.string(),
  slug: z.string(),
  industry: z.string(),
  description: z.string(),
  logoUrl: z.string().nullable(),
  status: CompanyStatusSchema,
  /** Versión del BrandDNA vigente; null mientras el onboarding no esté completo. */
  brandDnaVersion: z.number().int().min(1).nullable(),
  /** Versión del AvatarProfile vigente; null si aún no se creó el Pixel. */
  avatarVersion: z.number().int().min(1).nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Company = z.infer<typeof CompanySchema>;

const companyFields = {
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  industry: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80, 'Máximo 80 caracteres'),
  description: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
};

export const CreateCompanyInputSchema = z.object({
  name: companyFields.name,
  industry: companyFields.industry,
  description: companyFields.description.default(''),
  logoUrl: LogoUrlSchema.optional(),
});
export type CreateCompanyInput = z.input<typeof CreateCompanyInputSchema>;

/** PATCH parcial. `logoUrl: null` elimina el logo. El slug y el estado no son editables. */
export const UpdateCompanyInputSchema = z
  .object({
    name: companyFields.name,
    industry: companyFields.industry,
    description: companyFields.description,
    logoUrl: LogoUrlSchema.nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar');
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInputSchema>;

export const CompanyResponseSchema = z.object({ company: CompanySchema });
export type CompanyResponse = z.infer<typeof CompanyResponseSchema>;

export const CompanyListResponseSchema = z.object({ companies: z.array(CompanySchema) });
export type CompanyListResponse = z.infer<typeof CompanyListResponseSchema>;
