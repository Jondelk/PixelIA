import { AvatarConceptSchema, type AvatarResponse } from '@pixel/contracts';
import { conflict, notFound } from '../../lib/errors.js';
import { isDuplicateKeyError } from '../../lib/mongo.js';
import { BrandDnaModel, toBrandDnaDTO } from '../brand-dna/brandDna.model.js';
import { CompanyModel, type CompanyDocument } from '../companies/company.model.js';
import type { AvatarConceptEngine } from './engine/index.js';
import {
  AvatarProfileModel,
  toAvatarHistoryItem,
  toAvatarProfileDTO,
} from './avatarProfile.model.js';

/*
 * Avatar Concept Engine: BrandDNA → AvatarProfile.
 * Recibe la empresa ya autorizada por requireCompanyAccess; toda consulta va filtrada por
 * su companyId (plugin tenantScoped).
 */

const HISTORY_LIMIT = 20;

export async function getAvatar(company: CompanyDocument): Promise<AvatarResponse> {
  const companyId = company._id;
  const [current, history] = await Promise.all([
    company.avatarVersion
      ? AvatarProfileModel.findOne({ companyId, version: company.avatarVersion })
      : null,
    AvatarProfileModel.find({ companyId })
      .sort({ version: -1 })
      .limit(HISTORY_LIMIT)
      .select({ version: 1, name: 1, concept: 1, brandDnaVersion: 1, createdAt: 1 })
      .lean(),
  ]);

  return {
    avatar: current ? toAvatarProfileDTO(current) : null,
    history: history.map(toAvatarHistoryItem),
    brandDnaVersion: company.brandDnaVersion,
    isStale: Boolean(
      current && company.brandDnaVersion && current.brandDnaVersion !== company.brandDnaVersion,
    ),
  };
}

/**
 * Genera una versión nueva del avatar a partir del BrandDNA vigente.
 * La primera generación para un ADN es la que mejor encaja (variación 0); cada regeneración
 * sobre el mismo ADN explora la siguiente alternativa válida. Se conserva el historial.
 */
export async function generateAvatar(
  company: CompanyDocument,
  engine: AvatarConceptEngine,
): Promise<AvatarResponse> {
  const companyId = company._id;
  if (!company.brandDnaVersion) {
    throw conflict('Completa el onboarding de marca para que Pixel pueda crear su personaje');
  }

  const dnaDoc = await BrandDnaModel.findOne({ companyId, version: company.brandDnaVersion });
  if (!dnaDoc) throw conflict('No se encontró el ADN de marca vigente');
  const brandDna = toBrandDnaDTO(dnaDoc);

  const variation = await AvatarProfileModel.countDocuments({
    companyId,
    brandDnaVersion: brandDna.version,
  });
  // La salida de cualquier motor (reglas o IA) se valida contra el contrato.
  const concept = AvatarConceptSchema.parse(await engine.generate({ brandDna, variation }));

  for (let attempt = 0; ; attempt++) {
    const latest = await AvatarProfileModel.findOne({ companyId })
      .sort({ version: -1 })
      .select({ version: 1 });
    const version = (latest?.version ?? 0) + 1;
    try {
      await AvatarProfileModel.create({
        companyId,
        version,
        brandDnaVersion: brandDna.version,
        engine: { kind: engine.kind, version: engine.version, variation },
        concept,
        name: concept.name,
        baseObjectId: concept.baseObject.id,
      });
      await CompanyModel.updateOne(
        {
          _id: companyId,
          ownerId: company.ownerId,
          $or: [{ avatarVersion: null }, { avatarVersion: { $lt: version } }],
        },
        { $set: { avatarVersion: version, status: 'ready' } },
      );
      break;
    } catch (err) {
      if (!isDuplicateKeyError(err) || attempt >= 3) throw err;
    }
  }

  const fresh = await CompanyModel.findOne({ _id: companyId, ownerId: company.ownerId });
  if (!fresh) throw notFound('Empresa no encontrada');
  return getAvatar(fresh);
}
