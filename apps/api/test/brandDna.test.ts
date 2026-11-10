import { BrandBrainResponseSchema, type OnboardingStep } from '@pixel/contracts';
import type request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { BrandDnaModel } from '../src/modules/brand-dna/brandDna.model.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { cafeTinto, novaLabs, STEP_ORDER } from './fixtures/onboarding.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;
type Answers = typeof cafeTinto;

async function createCompany(session: Session, name = 'Café Tinto') {
  const res = await session.agent
    .post('/api/companies')
    .send({ name, industry: 'Café' })
    .expect(201);
  return res.body.company.id as string;
}

function saveStep(session: Session, companyId: string, step: OnboardingStep, answers: Answers) {
  return session.agent
    .put(`/api/companies/${companyId}/brand-dna`)
    .send({ step, data: answers[step] });
}

async function completeOnboarding(session: Session, companyId: string, answers: Answers) {
  let last: request.Response | undefined;
  for (const step of STEP_ORDER)
    last = await saveStep(session, companyId, step, answers).expect(200);
  return BrandBrainResponseSchema.parse(last!.body);
}

describe('Brand Brain: onboarding', () => {
  let owner: Session;
  let companyId: string;

  beforeEach(async () => {
    owner = await registerUser(app, 'Ana');
    companyId = await createCompany(owner);
  });

  it('una empresa nueva no tiene progreso ni ADN', async () => {
    const res = await owner.agent.get(`/api/companies/${companyId}/brand-dna`).expect(200);
    expect(BrandBrainResponseSchema.parse(res.body)).toEqual({
      onboarding: { answers: {}, completedSteps: [], isComplete: false, updatedAt: null },
      brandDna: null,
    });
  });

  it('guarda pasos, normaliza datos y marca la empresa en onboarding', async () => {
    const res = await saveStep(owner, companyId, 'personality', {
      ...cafeTinto,
      personality: { attributes: [' artesanal ', 'Artesanal', 'cercana', 'cálida'] },
    }).expect(200);

    const body = BrandBrainResponseSchema.parse(res.body);
    expect(body.onboarding.completedSteps).toEqual(['personality']);
    expect(body.onboarding.answers.personality?.attributes).toEqual([
      'artesanal',
      'cercana',
      'cálida',
    ]);
    expect(body.onboarding.isComplete).toBe(false);
    expect(body.brandDna).toBeNull();

    const company = await owner.agent.get(`/api/companies/${companyId}`).expect(200);
    expect(company.body.company.status).toBe('onboarding');
  });

  it('el paso Empresa sincroniza nombre, sector y descripción', async () => {
    await saveStep(owner, companyId, 'company', cafeTinto).expect(200);
    const company = await owner.agent.get(`/api/companies/${companyId}`).expect(200);
    expect(company.body.company).toMatchObject({
      name: 'Café Tinto',
      industry: 'Café de especialidad',
      description: cafeTinto.company.description,
      slug: 'cafe-tinto',
    });
  });

  it('valida cada paso con el schema compartido', async () => {
    const invalid = await owner.agent
      .put(`/api/companies/${companyId}/brand-dna`)
      .send({ step: 'personality', data: { attributes: ['solo-uno'] } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    await owner.agent
      .put(`/api/companies/${companyId}/brand-dna`)
      .send({ step: 'visual', data: { ...cafeTinto.visual, colors: [{ hex: 'rojo' }] } })
      .expect(400);
    await owner.agent
      .put(`/api/companies/${companyId}/brand-dna`)
      .send({ step: 'desconocido', data: {} })
      .expect(400);

    const res = await owner.agent.get(`/api/companies/${companyId}/brand-dna`).expect(200);
    expect(res.body.onboarding.completedSteps).toEqual([]);
  });

  it('al completar los 8 pasos genera el BrandDNA estructurado', async () => {
    const body = await completeOnboarding(owner, companyId, cafeTinto);

    expect(body.onboarding.isComplete).toBe(true);
    expect(body.brandDna).not.toBeNull();
    const dna = body.brandDna!;
    expect(dna).toMatchObject({
      companyId,
      version: 1,
      generator: { kind: 'deterministic', version: 'rules-1' },
    });
    expect(Object.keys(dna)).toEqual(
      expect.arrayContaining([
        'identity',
        'purpose',
        'audience',
        'personality',
        'archetypes',
        'communication',
        'visualLanguage',
        'differentiators',
        'creativePreferences',
        'restrictions',
      ]),
    );
    expect(dna.visualLanguage.palette[0]).toMatchObject({ hex: '#6B3E26', role: 'primary' });

    const company = await owner.agent.get(`/api/companies/${companyId}`).expect(200);
    expect(company.body.company.brandDnaVersion).toBe(1);

    const again = await owner.agent.get(`/api/companies/${companyId}/brand-dna`).expect(200);
    expect(again.body.brandDna.id).toBe(dna.id);
  });

  it('versiona el ADN solo cuando cambian las respuestas', async () => {
    await completeOnboarding(owner, companyId, cafeTinto);

    const same = await saveStep(owner, companyId, 'creative', cafeTinto).expect(200);
    expect(same.body.brandDna.version).toBe(1);

    const changed = await saveStep(owner, companyId, 'personality', novaLabs).expect(200);
    expect(changed.body.brandDna.version).toBe(2);
    expect(changed.body.brandDna.personality.traits[0].label).toBe('innovadora');
    expect(changed.body.brandDna.archetypes.primary.id).not.toBe(
      same.body.brandDna.archetypes.primary.id,
    );

    expect(await BrandDnaModel.countDocuments({ companyId })).toBe(2);
    const stored = await CompanyModel.findById(companyId);
    expect(stored?.brandDnaVersion).toBe(2);
  });
});

describe('Brand Brain: aislamiento por empresa', () => {
  let alice: Session;
  let bob: Session;
  let aliceCompanyId: string;

  beforeEach(async () => {
    alice = await registerUser(app, 'Alice');
    bob = await registerUser(app, 'Bob');
    aliceCompanyId = await createCompany(alice);
    await completeOnboarding(alice, aliceCompanyId, cafeTinto);
  });

  it('otro usuario no puede leer el ADN ni el onboarding (404)', async () => {
    const res = await bob.agent.get(`/api/companies/${aliceCompanyId}/brand-dna`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Café Tinto');
  });

  it('otro usuario no puede escribir en el onboarding ajeno', async () => {
    const res = await saveStep(bob, aliceCompanyId, 'personality', novaLabs);
    expect(res.status).toBe(404);

    const stored = await alice.agent.get(`/api/companies/${aliceCompanyId}/brand-dna`).expect(200);
    expect(stored.body.onboarding.answers.personality.attributes).toEqual(
      cafeTinto.personality.attributes,
    );
    expect(stored.body.brandDna.version).toBe(1);
  });

  it('dos empresas del mismo usuario no comparten ADN', async () => {
    const otherCompanyId = await createCompany(alice, 'Nova Labs');
    const empty = await alice.agent.get(`/api/companies/${otherCompanyId}/brand-dna`).expect(200);
    expect(empty.body).toMatchObject({ brandDna: null, onboarding: { completedSteps: [] } });

    const nova = await completeOnboarding(alice, otherCompanyId, novaLabs);
    expect(nova.brandDna?.companyId).toBe(otherCompanyId);
    expect(nova.brandDna?.identity.name).toBe('Nova Labs');

    const cafe = await alice.agent.get(`/api/companies/${aliceCompanyId}/brand-dna`).expect(200);
    expect(cafe.body.brandDna.identity.name).toBe('Café Tinto');
  });
});
