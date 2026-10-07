import { AvatarResponseSchema } from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { TenantScopeError } from '../src/db/tenantScoped.plugin.js';
import { AvatarProfileModel } from '../src/modules/avatars/avatarProfile.model.js';
import { cafeTinto, novaLabs } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany, saveStep } from './support/brandBrain.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

describe('Avatar: generación y versiones', () => {
  let owner: Session;
  let companyId: string;
  const url = () => `/api/companies/${companyId}/avatar`;

  beforeEach(async () => {
    owner = await registerUser(app, 'Ana');
    companyId = await createCompany(owner);
  });

  it('sin BrandDNA no hay avatar y no se puede generar (409)', async () => {
    const res = await owner.agent.get(url()).expect(200);
    expect(AvatarResponseSchema.parse(res.body)).toEqual({
      avatar: null,
      history: [],
      brandDnaVersion: null,
      isStale: false,
    });

    const generate = await owner.agent.post(`${url()}/generate`);
    expect(generate.status).toBe(409);
    expect(generate.body.error.code).toBe('CONFLICT');
  });

  it('crea el Pixel a partir del ADN y marca la empresa como lista', async () => {
    await completeOnboarding(owner, companyId, cafeTinto);

    const res = await owner.agent.post(`${url()}/generate`).expect(201);
    const body = AvatarResponseSchema.parse(res.body);
    expect(body.avatar).toMatchObject({
      companyId,
      version: 1,
      brandDnaVersion: 1,
      engine: { kind: 'deterministic', version: 'avatar-rules-1', variation: 0 },
      avatarType: 'anthropomorphic_object',
      baseObject: { id: 'coffee_bean' },
    });
    expect(body.avatar!.rationale.summary.length).toBeGreaterThan(50);
    expect(body.history).toHaveLength(1);

    const company = await owner.agent.get(`/api/companies/${companyId}`).expect(200);
    expect(company.body.company).toMatchObject({ status: 'ready', avatarVersion: 1 });

    const again = await owner.agent.get(url()).expect(200);
    expect(again.body.avatar.id).toBe(body.avatar!.id);
  });

  it('regenerar crea una versión nueva, conserva el historial y explora otra variación', async () => {
    await completeOnboarding(owner, companyId, cafeTinto);
    const first = await owner.agent.post(`${url()}/generate`).expect(201);
    const second = await owner.agent.post(`${url()}/generate`).expect(201);

    expect(second.body.avatar.version).toBe(2);
    expect(second.body.avatar.engine.variation).toBe(1);
    expect(second.body.avatar.name).not.toBe(first.body.avatar.name);
    expect(second.body.history.map((item: { version: number }) => item.version)).toEqual([2, 1]);
    expect(
      await AvatarProfileModel.countDocuments({ workspaceId: await workspaceIdOf(companyId) }),
    ).toBe(2);
  });

  it('detecta cuando el ADN cambió y regenera desde el ADN nuevo', async () => {
    await completeOnboarding(owner, companyId, cafeTinto);
    await owner.agent.post(`${url()}/generate`).expect(201);

    await saveStep(owner, companyId, 'personality', novaLabs).expect(200);
    const stale = await owner.agent.get(url()).expect(200);
    expect(stale.body).toMatchObject({
      brandDnaVersion: 2,
      isStale: true,
      avatar: { brandDnaVersion: 1 },
    });

    const fresh = await owner.agent.post(`${url()}/generate`).expect(201);
    expect(fresh.body).toMatchObject({
      isStale: false,
      avatar: { version: 2, brandDnaVersion: 2, engine: { variation: 0 } },
    });
  });
});

describe('Avatar: aislamiento por empresa', () => {
  it('otro usuario no puede ver ni generar el avatar ajeno', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const companyId = await createCompany(alice);
    await completeOnboarding(alice, companyId, cafeTinto);
    await alice.agent.post(`/api/companies/${companyId}/avatar/generate`).expect(201);

    const read = await bob.agent.get(`/api/companies/${companyId}/avatar`);
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('Grano');
    await bob.agent.post(`/api/companies/${companyId}/avatar/generate`).expect(404);
    expect(
      await AvatarProfileModel.countDocuments({ workspaceId: await workspaceIdOf(companyId) }),
    ).toBe(1);
  });

  it('dos empresas del mismo dueño tienen avatares independientes', async () => {
    const alice = await registerUser(app, 'Alice');
    const cafeId = await createCompany(alice, 'Café Tinto');
    const novaId = await createCompany(alice, 'Nova Labs');
    await completeOnboarding(alice, cafeId, cafeTinto);
    await completeOnboarding(alice, novaId, novaLabs);

    const cafe = await alice.agent.post(`/api/companies/${cafeId}/avatar/generate`).expect(201);
    const nova = await alice.agent.post(`/api/companies/${novaId}/avatar/generate`).expect(201);
    expect(cafe.body.avatar.baseObject.id).toBe('coffee_bean');
    expect(nova.body.avatar.baseObject.id).toBe('crystal_core');
    expect(nova.body.history).toHaveLength(1);
  });

  it('el modelo exige companyId en cada consulta', async () => {
    await expect(AvatarProfileModel.find({})).rejects.toBeInstanceOf(TenantScopeError);
  });
});
