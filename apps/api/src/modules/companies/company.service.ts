import type { CreateCompanyInput, UpdateCompanyInput } from '@pixel/contracts';
import { CreateCompanyInputSchema } from '@pixel/contracts';
import { isDuplicateKeyError, isObjectIdString } from '../../lib/mongo.js';
import { CompanyModel, type CompanyDocument } from './company.model.js';
import { nextAvailableSlug, slugify } from './slug.js';

/*
 * Todas las consultas incluyen ownerId: un usuario solo puede ver o modificar sus empresas.
 * El ownerId siempre viene de la sesión (req.auth), nunca del cuerpo de la petición.
 */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function availableSlug(ownerId: string, name: string): Promise<string> {
  const base = slugify(name);
  const existing = await CompanyModel.find(
    { ownerId, slug: { $regex: `^${escapeRegex(base)}(-\\d+)?$` } },
    { slug: 1 },
  ).lean();
  return nextAvailableSlug(base, new Set(existing.map((company) => company.slug)));
}

export async function createCompany(
  ownerId: string,
  rawInput: CreateCompanyInput,
): Promise<CompanyDocument> {
  const input = CreateCompanyInputSchema.parse(rawInput);
  // Reintenta si dos creaciones simultáneas compiten por el mismo slug.
  for (let attempt = 0; ; attempt++) {
    const slug = await availableSlug(ownerId, input.name);
    try {
      return await CompanyModel.create({
        ownerId,
        name: input.name,
        slug,
        industry: input.industry,
        description: input.description,
        logoUrl: input.logoUrl ?? null,
        status: 'draft',
      });
    } catch (err) {
      if (!isDuplicateKeyError(err) || attempt >= 3) throw err;
    }
  }
}

export async function listCompanies(ownerId: string): Promise<CompanyDocument[]> {
  return CompanyModel.find({ ownerId }).sort({ createdAt: -1 });
}

/** null si no existe, si el id es inválido o si pertenece a otro usuario. */
export async function findOwnedCompany(
  ownerId: string,
  companyId: string,
): Promise<CompanyDocument | null> {
  if (!isObjectIdString(companyId) || !isObjectIdString(ownerId)) return null;
  return CompanyModel.findOne({ _id: companyId, ownerId });
}

/** El slug es estable: no cambia al renombrar la empresa. */
export async function updateCompany(
  ownerId: string,
  companyId: string,
  input: UpdateCompanyInput,
): Promise<CompanyDocument | null> {
  if (!isObjectIdString(companyId)) return null;
  return CompanyModel.findOneAndUpdate(
    { _id: companyId, ownerId },
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  );
}
