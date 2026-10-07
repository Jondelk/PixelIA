import { createHash } from 'node:crypto';
import {
  BrandOnboardingSchema,
  ONBOARDING_STEP_SCHEMAS,
  ONBOARDING_STEPS,
  type BrandBrainResponse,
  type BrandOnboarding,
  type BrandOnboardingDraft,
  type OnboardingProgress,
  type SaveOnboardingStepInputSchema,
} from '@pixel/contracts';
import type { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { isDuplicateKeyError } from '../../lib/mongo.js';
import { CompanyModel, type CompanyDocument } from '../companies/company.model.js';
import { BRAND_DNA_GENERATOR_VERSION, generateBrandDna } from './brandDna.generator.js';
import { BrandDnaModel, toBrandDnaDTO, type BrandDnaDocument } from './brandDna.model.js';

/*
 * Brand Brain: onboarding de marca → BrandDNA.
 * Todas las funciones reciben la empresa ya autorizada por requireCompanyAccess y
 * todas las consultas a BrandDNA van filtradas por su companyId (plugin tenantScoped).
 */

type SaveStepInput = z.output<typeof SaveOnboardingStepInputSchema>;

/** Respuestas guardadas; un paso corrupto o de un esquema anterior se descarta (queda pendiente). */
function readAnswers(company: CompanyDocument): BrandOnboardingDraft {
  const stored = (company.onboarding?.answers ?? {}) as Record<string, unknown>;
  const answers: Record<string, unknown> = {};
  for (const step of ONBOARDING_STEPS) {
    const parsed = ONBOARDING_STEP_SCHEMAS[step].safeParse(stored[step]);
    if (parsed.success) answers[step] = parsed.data;
  }
  return answers as BrandOnboardingDraft;
}

function toProgress(company: CompanyDocument): OnboardingProgress {
  const answers = readAnswers(company);
  const completedSteps = ONBOARDING_STEPS.filter((step) => answers[step] !== undefined);
  return {
    answers,
    completedSteps,
    isComplete: completedSteps.length === ONBOARDING_STEPS.length,
    updatedAt: company.onboarding?.updatedAt?.toISOString() ?? null,
  };
}

async function activeBrandDna(company: CompanyDocument): Promise<BrandDnaDocument | null> {
  if (!company.brandDnaVersion) return null;
  return BrandDnaModel.findOne({ companyId: company._id, version: company.brandDnaVersion });
}

export async function getBrandBrain(company: CompanyDocument): Promise<BrandBrainResponse> {
  const brandDna = await activeBrandDna(company);
  return {
    onboarding: toProgress(company),
    brandDna: brandDna ? toBrandDnaDTO(brandDna) : null,
  };
}

function sourceHash(answers: BrandOnboarding): string {
  // Las respuestas vienen de Zod: el orden de claves es estable.
  return createHash('sha256')
    .update(`${BRAND_DNA_GENERATOR_VERSION}:${JSON.stringify(answers)}`)
    .digest('hex');
}

/**
 * Genera el ADN si cambió algo respecto a la versión vigente. Cada cambio crea una versión
 * nueva (historial); las respuestas idénticas no generan versiones duplicadas.
 */
async function syncBrandDna(company: CompanyDocument, answers: BrandOnboarding): Promise<void> {
  const hash = sourceHash(answers);
  const current = await activeBrandDna(company);
  if (current?.sourceHash === hash) return;

  const content = generateBrandDna(answers);
  for (let attempt = 0; ; attempt++) {
    const latest = await BrandDnaModel.findOne({ companyId: company._id })
      .sort({ version: -1 })
      .select({ version: 1 });
    const version = (latest?.version ?? 0) + 1;
    try {
      await BrandDnaModel.create({
        companyId: company._id,
        version,
        sourceHash: hash,
        generator: { kind: 'deterministic', version: BRAND_DNA_GENERATOR_VERSION },
        ...content,
      });
      // Nunca retrocede de versión si dos guardados compiten.
      await CompanyModel.updateOne(
        {
          _id: company._id,
          ownerId: company.ownerId,
          $or: [{ brandDnaVersion: null }, { brandDnaVersion: { $lt: version } }],
        },
        { $set: { brandDnaVersion: version } },
      );
      return;
    } catch (err) {
      if (!isDuplicateKeyError(err) || attempt >= 3) throw err;
    }
  }
}

export async function saveOnboardingStep(
  company: CompanyDocument,
  input: SaveStepInput,
): Promise<BrandBrainResponse> {
  const set: Record<string, unknown> = {
    [`onboarding.answers.${input.step}`]: input.data,
    'onboarding.updatedAt': new Date(),
  };
  // El paso "Empresa" mantiene sincronizados los datos básicos de la empresa.
  if (input.step === 'company') {
    set.name = input.data.name;
    set.industry = input.data.industry;
    set.description = input.data.description;
  }
  if (company.status === 'draft') set.status = 'onboarding';

  const updated = await CompanyModel.findOneAndUpdate(
    { _id: company._id, ownerId: company.ownerId },
    { $set: set },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) throw notFound('Empresa no encontrada');

  const progress = toProgress(updated);
  if (progress.isComplete) {
    await syncBrandDna(updated, BrandOnboardingSchema.parse(progress.answers));
  }

  const fresh = await CompanyModel.findOne({ _id: company._id, ownerId: company.ownerId });
  if (!fresh) throw notFound('Empresa no encontrada');
  return getBrandBrain(fresh);
}
