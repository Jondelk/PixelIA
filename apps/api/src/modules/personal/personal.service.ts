import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  PERSONAL_ONBOARDING_STEP_SCHEMAS,
  PERSONAL_ONBOARDING_STEPS,
  PersonalDnaContentSchema,
  PersonalOnboardingSchema,
  personalDnaCompleteness,
  type PersonalDnaContent,
  type PersonalDnaResponse,
  type PersonalOnboarding,
  type PersonalOnboardingDraft,
  type PersonalOnboardingProgress,
  type PersonalProfileResponse,
  type PersonalSummary,
  type SavePersonalOnboardingStepInputSchema,
  type UpdatePersonalDnaInput,
} from '@pixel/contracts';
import type { z } from 'zod';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { isDuplicateKeyError } from '../../lib/mongo.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import type { PersonalDnaGenerator } from './personalDna.generator.js';
import {
  PersonalDnaModel,
  personalDnaContentOf,
  toPersonalDnaDTO,
  type PersonalDnaDocument,
  type PersonalDnaGeneratorKind,
} from './personalDna.model.js';
import {
  PersonalProfileModel,
  toPersonalProfileDTO,
  type PersonalProfileDocument,
} from './personalProfile.model.js';

/*
 * Pixel Personal: Workspace (personal) → PersonalProfile → PersonalDNA.
 * Todas las funciones reciben el workspace ya autorizado (requireWorkspaceAccess +
 * requirePersonalWorkspace) y todas las consultas van filtradas por su workspaceId (tenantScoped).
 * Nunca se lee un id de perfil o de workspace del cuerpo de la petición.
 */

export interface PersonalDeps {
  personalDnaGenerator: PersonalDnaGenerator;
}

type SaveStepInput = z.output<typeof SavePersonalOnboardingStepInputSchema>;

/** Versión de las ediciones manuales del ADN (no salen de reglas ni de IA). */
export const PERSONAL_DNA_MANUAL_VERSION = 'manual-1';

export const PERSONAL_ONLY = 'Disponible solo en un Pixel Personal';

/** Defensa en profundidad: además del middleware, el servicio exige un workspace personal. */
export function assertPersonalWorkspace(workspace: WorkspaceDocument): void {
  if (workspace.type !== 'personal') {
    throw badRequest(PERSONAL_ONLY, { reason: 'workspace_type_mismatch', expected: 'personal' });
  }
}

export async function findPersonalProfile(
  workspace: WorkspaceDocument,
): Promise<PersonalProfileDocument | null> {
  if (workspace.type !== 'personal') return null;
  return PersonalProfileModel.findOne({ workspaceId: workspace._id, userId: workspace.ownerId });
}

/** Respuestas guardadas; un paso corrupto o de un esquema anterior se descarta (queda pendiente). */
function readAnswers(profile: PersonalProfileDocument | null): PersonalOnboardingDraft {
  const stored = (profile?.onboarding?.answers ?? {}) as Record<string, unknown>;
  const answers: Record<string, unknown> = {};
  for (const step of PERSONAL_ONBOARDING_STEPS) {
    const parsed = PERSONAL_ONBOARDING_STEP_SCHEMAS[step].safeParse(stored[step]);
    if (parsed.success) answers[step] = parsed.data;
  }
  return answers as PersonalOnboardingDraft;
}

function toProgress(profile: PersonalProfileDocument | null): PersonalOnboardingProgress {
  const answers = readAnswers(profile);
  const completedSteps = PERSONAL_ONBOARDING_STEPS.filter((step) => answers[step] !== undefined);
  return {
    answers,
    completedSteps,
    isComplete: completedSteps.length === PERSONAL_ONBOARDING_STEPS.length,
    updatedAt: profile?.onboarding?.updatedAt?.toISOString() ?? null,
  };
}

function completeAnswers(profile: PersonalProfileDocument): PersonalOnboarding | null {
  const progress = toProgress(profile);
  return progress.isComplete ? PersonalOnboardingSchema.parse(progress.answers) : null;
}

export async function activePersonalDna(
  workspace: WorkspaceDocument,
  profile: PersonalProfileDocument,
): Promise<PersonalDnaDocument | null> {
  if (!profile.personalDnaVersion) return null;
  return PersonalDnaModel.findOne({
    workspaceId: workspace._id,
    version: profile.personalDnaVersion,
  });
}

function toProfileResponse(profile: PersonalProfileDocument | null): PersonalProfileResponse {
  return {
    profile: profile ? toPersonalProfileDTO(profile) : null,
    onboarding: toProgress(profile),
  };
}

export async function getPersonalProfile(
  workspace: WorkspaceDocument,
): Promise<PersonalProfileResponse> {
  assertPersonalWorkspace(workspace);
  return toProfileResponse(await findPersonalProfile(workspace));
}

/** Resumen para "Tus Pixels" (null si el workspace no es personal). */
export async function getPersonalSummary(
  workspace: WorkspaceDocument,
): Promise<PersonalSummary | null> {
  if (workspace.type !== 'personal') return null;
  const profile = await findPersonalProfile(workspace);
  return {
    name: profile?.name || null,
    completedSteps: toProgress(profile).completedSteps.length,
    personalDnaVersion: profile?.personalDnaVersion ?? null,
  };
}

/** Crea el perfil en el primer guardado; el índice único resuelve dos primeros guardados a la vez. */
async function ensurePersonalProfile(
  workspace: WorkspaceDocument,
): Promise<PersonalProfileDocument> {
  const existing = await findPersonalProfile(workspace);
  if (existing) return existing;
  try {
    return await PersonalProfileModel.create({
      workspaceId: workspace._id,
      userId: workspace.ownerId,
      name: workspace.name,
    });
  } catch (err) {
    if (!isDuplicateKeyError(err, 'workspaceId')) throw err;
    const created = await findPersonalProfile(workspace);
    if (!created) throw err;
    return created;
  }
}

function sourceHash(generatorVersion: string, answers: PersonalOnboarding): string {
  // Las respuestas vienen de Zod: el orden de claves es estable.
  return createHash('sha256')
    .update(`${generatorVersion}:${JSON.stringify(answers)}`)
    .digest('hex');
}

/** Guarda una versión nueva del ADN (historial) y la marca como vigente sin retroceder nunca. */
async function insertPersonalDnaVersion(
  workspace: WorkspaceDocument,
  profile: PersonalProfileDocument,
  data: {
    content: PersonalDnaContent;
    sourceHash: string;
    generator: { kind: PersonalDnaGeneratorKind; version: string };
  },
): Promise<void> {
  const content = PersonalDnaContentSchema.parse(data.content);
  for (let attempt = 0; ; attempt++) {
    const latest = await PersonalDnaModel.findOne({ workspaceId: workspace._id })
      .sort({ version: -1 })
      .select({ version: 1 });
    const version = (latest?.version ?? 0) + 1;
    try {
      await PersonalDnaModel.create({
        workspaceId: workspace._id,
        personalProfileId: profile._id,
        version,
        sourceHash: data.sourceHash,
        generator: data.generator,
        ...content,
      });
      await PersonalProfileModel.updateOne(
        {
          _id: profile._id,
          workspaceId: workspace._id,
          $or: [{ personalDnaVersion: null }, { personalDnaVersion: { $lt: version } }],
        },
        { $set: { personalDnaVersion: version } },
      );
      return;
    } catch (err) {
      if (!isDuplicateKeyError(err) || attempt >= 3) throw err;
    }
  }
}

/**
 * Genera el ADN desde las respuestas si cambiaron respecto a la versión vigente. Las mismas
 * respuestas no crean versiones duplicadas; una edición manual se conserva salvo que se pida
 * regenerar explícitamente (`force`).
 */
async function syncPersonalDna(
  workspace: WorkspaceDocument,
  profile: PersonalProfileDocument,
  answers: PersonalOnboarding,
  deps: PersonalDeps,
  { force }: { force: boolean },
): Promise<void> {
  const generator = deps.personalDnaGenerator;
  const hash = sourceHash(generator.version, answers);
  const current = await activePersonalDna(workspace, profile);
  if (current?.sourceHash === hash && !(force && current.generator.kind === 'manual')) return;

  const generated = await generator.generate(answers);
  await insertPersonalDnaVersion(workspace, profile, {
    content: generated.content,
    sourceHash: hash,
    generator: generated.generator,
  });
}

async function reloadProfile(workspace: WorkspaceDocument): Promise<PersonalProfileDocument> {
  const profile = await findPersonalProfile(workspace);
  if (!profile) throw notFound('Perfil personal no encontrado');
  return profile;
}

/**
 * Guardado progresivo de un paso del onboarding. El paso "identity" mantiene sincronizados los
 * datos básicos del perfil. Al completar los 8 pasos se (re)genera el PersonalDNA.
 */
export async function savePersonalOnboardingStep(
  workspace: WorkspaceDocument,
  input: SaveStepInput,
  deps: PersonalDeps,
): Promise<PersonalProfileResponse> {
  assertPersonalWorkspace(workspace);
  const profile = await ensurePersonalProfile(workspace);

  const set: Record<string, unknown> = {
    [`onboarding.answers.${input.step}`]: input.data,
    'onboarding.updatedAt': new Date(),
  };
  if (input.step === 'identity') {
    const identity = input.data;
    set.name = identity.name;
    set.profession = identity.profession;
    set.headline = identity.headline ?? null;
    set.bio = identity.bio ?? null;
    set.roles = identity.roles;
    set.skills = identity.skills;
    set.interests = identity.interests;
    set.location = identity.location ?? null;
  }

  const updated = await PersonalProfileModel.findOneAndUpdate(
    { _id: profile._id, workspaceId: workspace._id },
    { $set: set },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) throw notFound('Perfil personal no encontrado');

  const answers = completeAnswers(updated);
  if (answers) await syncPersonalDna(workspace, updated, answers, deps, { force: false });

  return toProfileResponse(await reloadProfile(workspace));
}

async function toDnaResponse(
  workspace: WorkspaceDocument,
  profile: PersonalProfileDocument | null,
): Promise<PersonalDnaResponse> {
  const dna = profile ? await activePersonalDna(workspace, profile) : null;
  if (!dna) return { personalDna: null, completeness: null };
  const personalDna = toPersonalDnaDTO(dna);
  return { personalDna, completeness: personalDnaCompleteness(personalDna) };
}

export async function getPersonalDna(workspace: WorkspaceDocument): Promise<PersonalDnaResponse> {
  assertPersonalWorkspace(workspace);
  return toDnaResponse(workspace, await findPersonalProfile(workspace));
}

/** POST …/personal-dna/generate: (re)genera el ADN desde el onboarding completo. */
export async function generatePersonalDna(
  workspace: WorkspaceDocument,
  deps: PersonalDeps,
): Promise<PersonalDnaResponse> {
  assertPersonalWorkspace(workspace);
  const profile = await findPersonalProfile(workspace);
  const answers = profile ? completeAnswers(profile) : null;
  if (!profile || !answers) {
    throw conflict('Completa los 8 pasos del onboarding para generar tu ADN personal');
  }
  await syncPersonalDna(workspace, profile, answers, deps, { force: true });
  return toDnaResponse(workspace, await reloadProfile(workspace));
}

/**
 * PUT …/personal-dna: corrige secciones del ADN. Crea una versión manual (el historial se conserva)
 * que parte del hash de las mismas respuestas: volver a guardar esas respuestas no la pisa.
 */
export async function updatePersonalDna(
  workspace: WorkspaceDocument,
  input: UpdatePersonalDnaInput,
): Promise<PersonalDnaResponse> {
  assertPersonalWorkspace(workspace);
  const profile = await findPersonalProfile(workspace);
  const current = profile ? await activePersonalDna(workspace, profile) : null;
  if (!profile || !current) {
    throw conflict('Aún no hay ADN personal: completa el onboarding para generarlo');
  }

  const base = personalDnaContentOf(current);
  const content = PersonalDnaContentSchema.parse({ ...base, ...input });
  if (!isDeepStrictEqual(content, base)) {
    await insertPersonalDnaVersion(workspace, profile, {
      content,
      sourceHash: current.sourceHash,
      generator: { kind: 'manual', version: PERSONAL_DNA_MANUAL_VERSION },
    });
  }
  return toDnaResponse(workspace, await reloadProfile(workspace));
}

/** Perfil + ADN vigente del workspace personal (para el avatar y el contexto del chat). */
export async function loadPersonalDna(workspace: WorkspaceDocument): Promise<{
  profile: PersonalProfileDocument | null;
  personalDna: PersonalDnaDocument | null;
}> {
  const profile = await findPersonalProfile(workspace);
  const personalDna = profile ? await activePersonalDna(workspace, profile) : null;
  return { profile, personalDna };
}
