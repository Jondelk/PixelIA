import { AvatarConceptSchema, type AvatarConcept, type AvatarResponse } from '@pixel/contracts';
import type { Types } from 'mongoose';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { isDuplicateKeyError } from '../../lib/mongo.js';
import { BrandDnaModel, toBrandDnaDTO } from '../brand-dna/brandDna.model.js';
import { CompanyModel } from '../companies/company.model.js';
import { assertPersonalWorkspace, loadPersonalDna } from '../personal/personal.service.js';
import { personalDnaContentOf } from '../personal/personalDna.model.js';
import { PersonalProfileModel } from '../personal/personalProfile.model.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { assertEnterpriseScope, type EnterpriseScope } from '../workspaces/enterpriseScope.js';
import type { AvatarConceptEngine, PersonalAvatarConceptEngine } from './engine/index.js';
import {
  AvatarProfileModel,
  toAvatarHistoryItem,
  toAvatarProfileDTO,
  type AvatarProfileAttrs,
} from './avatarProfile.model.js';

/*
 * Avatar Concept Engine: ADN → AvatarProfile. Un único modelo y un único flujo para los dos tipos
 * de workspace; cambia solo el ADN de origen:
 * - Enterprise (sourceType = brand): BrandDNA de la empresa del workspace. Versión vigente en
 *   company.avatarVersion.
 * - Personal (sourceType = personal): PersonalDNA del workspace, sin companyId y sin BrandDNA.
 *   Versión vigente en personalProfile.avatarVersion.
 * El AvatarProfile es un recurso del workspace: toda consulta va filtrada por workspaceId
 * (plugin tenantScoped). El BrandDNA sigue filtrándose por companyId.
 */

const HISTORY_LIMIT = 20;

export interface AvatarEngines {
  avatarEngine: AvatarConceptEngine;
  personalAvatarEngine: PersonalAvatarConceptEngine;
}

async function avatarState(
  workspaceId: Types.ObjectId,
  currentVersion: number | null,
): Promise<Pick<AvatarResponse, 'avatar' | 'history'>> {
  const [current, history] = await Promise.all([
    currentVersion ? AvatarProfileModel.findOne({ workspaceId, version: currentVersion }) : null,
    AvatarProfileModel.find({ workspaceId })
      .sort({ version: -1 })
      .limit(HISTORY_LIMIT)
      .select({
        version: 1,
        name: 1,
        concept: 1,
        brandDnaVersion: 1,
        personalDnaVersion: 1,
        createdAt: 1,
      })
      .lean(),
  ]);
  return {
    avatar: current ? toAvatarProfileDTO(current) : null,
    history: history.map(toAvatarHistoryItem),
  };
}

/** Guarda una versión nueva del avatar del workspace (las versiones son por workspace). */
async function insertAvatarVersion(
  workspaceId: Types.ObjectId,
  data: Omit<
    AvatarProfileAttrs,
    'workspaceId' | 'version' | 'name' | 'baseObjectId' | 'createdAt' | 'updatedAt'
  > & {
    concept: AvatarConcept;
  },
): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    const latest = await AvatarProfileModel.findOne({ workspaceId })
      .sort({ version: -1 })
      .select({ version: 1 });
    const version = (latest?.version ?? 0) + 1;
    try {
      await AvatarProfileModel.create({
        ...data,
        workspaceId,
        version,
        name: data.concept.name,
        baseObjectId: data.concept.baseObject.id,
      });
      return version;
    } catch (err) {
      if (!isDuplicateKeyError(err) || attempt >= 3) throw err;
    }
  }
}

// ---------- Enterprise (BrandDNA) ----------

export async function getAvatar(scope: EnterpriseScope): Promise<AvatarResponse> {
  const { workspace, company } = assertEnterpriseScope(scope);
  const { avatar, history } = await avatarState(workspace._id, company.avatarVersion);
  return {
    avatar,
    history,
    sourceType: 'brand',
    dnaVersion: company.brandDnaVersion,
    brandDnaVersion: company.brandDnaVersion,
    isStale: Boolean(
      avatar && company.brandDnaVersion && avatar.brandDnaVersion !== company.brandDnaVersion,
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

  const version = await insertAvatarVersion(workspaceId, {
    sourceType: 'brand',
    companyId,
    brandDnaVersion: brandDna.version,
    engine: { kind: engine.kind, version: engine.version, variation },
    concept,
  });
  await CompanyModel.updateOne(
    {
      _id: companyId,
      ownerId: company.ownerId,
      $or: [{ avatarVersion: null }, { avatarVersion: { $lt: version } }],
    },
    { $set: { avatarVersion: version, status: 'ready' } },
  );

  const fresh = await CompanyModel.findOne({ _id: companyId, ownerId: company.ownerId });
  if (!fresh) throw notFound('Empresa no encontrada');
  return getAvatar({ workspace, company: fresh });
}

// ---------- Personal (PersonalDNA) ----------

export async function getPersonalAvatar(workspace: WorkspaceDocument): Promise<AvatarResponse> {
  assertPersonalWorkspace(workspace);
  const { profile } = await loadPersonalDna(workspace);
  const dnaVersion = profile?.personalDnaVersion ?? null;
  const { avatar, history } = await avatarState(workspace._id, profile?.avatarVersion ?? null);
  return {
    avatar,
    history,
    sourceType: 'personal',
    dnaVersion,
    brandDnaVersion: null,
    isStale: Boolean(avatar && dnaVersion && avatar.personalDnaVersion !== dnaVersion),
  };
}

/** Igual que en Enterprise, pero desde el PersonalDNA: nunca lee BrandDNA ni guarda companyId. */
export async function generatePersonalAvatar(
  workspace: WorkspaceDocument,
  engine: PersonalAvatarConceptEngine,
): Promise<AvatarResponse> {
  assertPersonalWorkspace(workspace);
  const workspaceId = workspace._id;
  const { profile, personalDna } = await loadPersonalDna(workspace);
  if (!profile || !personalDna) {
    throw new AppError(
      409,
      'CONFLICT',
      'Completa tu onboarding personal para que Pixel pueda crear tu personaje',
      { reason: 'personal_dna_missing' },
    );
  }

  const variation = await AvatarProfileModel.countDocuments({
    workspaceId,
    personalDnaVersion: personalDna.version,
  });
  const concept = AvatarConceptSchema.parse(
    await engine.generate({ personalDna: personalDnaContentOf(personalDna), variation }),
  );

  const version = await insertAvatarVersion(workspaceId, {
    sourceType: 'personal',
    personalDnaVersion: personalDna.version,
    engine: { kind: engine.kind, version: engine.version, variation },
    concept,
  });
  await PersonalProfileModel.updateOne(
    {
      _id: profile._id,
      workspaceId,
      $or: [{ avatarVersion: null }, { avatarVersion: { $lt: version } }],
    },
    { $set: { avatarVersion: version } },
  );

  return getPersonalAvatar(workspace);
}
