import { AvatarConceptSchema, type AvatarResponse } from '@pixel/contracts';
import { conflict, notFound } from '../../lib/errors.js';
import { isDuplicateKeyError } from '../../lib/mongo.js';
import { BrandDnaModel, toBrandDnaDTO } from '../brand-dna/brandDna.model.js';
import { CompanyModel } from '../companies/company.model.js';
import { assertEnterpriseScope, type EnterpriseScope } from '../workspaces/enterpriseScope.js';
import type { AvatarConceptEngine } from './engine/index.js';
import {
  AvatarProfileModel,
  toAvatarHistoryItem,
  toAvatarProfileDTO,
} from './avatarProfile.model.js';

/*
 * Avatar Concept Engine: BrandDNA → AvatarProfile (Enterprise, sourceType = brand).
 * Recibe el workspace y su empresa ya autorizados. El AvatarProfile es un recurso del workspace:
 * toda consulta va filtrada por workspaceId (plugin tenantScoped). El BrandDNA sigue filtrándose
 * por companyId. La versión vigente del avatar vive en la empresa (company.avatarVersion).
 */

const HISTORY_LIMIT = 20;

export async function getAvatar(scope: EnterpriseScope): Promise<AvatarResponse> {
  const { workspace, company } = assertEnterpriseScope(scope);
  const workspaceId = workspace._id;
  const [current, history] = await Promise.all([
    company.avatarVersion
      ? AvatarProfileModel.findOne({ workspaceId, version: company.avatarVersion })
      : null,
    AvatarProfileModel.find({ workspaceId })
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
  scope: EnterpriseScope,
  engine: AvatarConceptEngine,
): Promise<AvatarResponse> {
  const { workspace, company } = assertEnterpriseScope(scope);
  const workspaceId = workspace._id;
  const companyId = company._id;
  if (!company.brandDnaVersion) {
    throw conflict('Completa el onboarding de marca para que Pixel pueda crear su personaje');
  }

  const dnaDoc = await BrandDnaModel.findOne({ companyId, version: company.brandDnaVersion });
  if (!dnaDoc) throw conflict('No se encontró el ADN de marca vigente');
  const brandDna = toBrandDnaDTO(dnaDoc);

  const variation = await AvatarProfileModel.countDocuments({
    workspaceId,
    brandDnaVersion: brandDna.version,
  });
  // La salida de cualquier motor (reglas o IA) se valida contra el contrato.
  const concept = AvatarConceptSchema.parse(await engine.generate({ brandDna, variation }));

  for (let attempt = 0; ; attempt++) {
    const latest = await AvatarProfileModel.findOne({ workspaceId })
      .sort({ version: -1 })
      .select({ version: 1 });
    const version = (latest?.version ?? 0) + 1;
    try {
      await AvatarProfileModel.create({
        workspaceId,
        sourceType: 'brand',
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
  return getAvatar({ workspace, company: fresh });
}
