import { PersonalProfileResponseSchema, WorkspaceResponseSchema } from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { TenantScopeError } from '../src/db/tenantScoped.plugin.js';
import { PersonalProfileModel } from '../src/modules/personal/personalProfile.model.js';
import { photographer, streamer } from './fixtures/personal.js';
import { createCompany } from './support/brandBrain.js';
import {
  completePersonalOnboarding,
  createPersonalWorkspace,
  savePersonalStep,
} from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

describe('PersonalProfile: onboarding con guardado progresivo', () => {
  let jhon: Session;
  let workspaceId: string;
  const url = () => `/api/workspaces/${workspaceId}/personal-profile`;

  beforeEach(async () => {
    jhon = await registerUser(app, 'Jhon');
    workspaceId = await createPersonalWorkspace(jhon);
  });

  it('sin respuestas aún no hay perfil y el progreso está vacío', async () => {
    const res = await jhon.agent.get(url()).expect(200);
    expect(PersonalProfileResponseSchema.parse(res.body)).toEqual({
      profile: null,
      onboarding: { answers: {}, completedSteps: [], isComplete: false, updatedAt: null },
    });
  });

  it('guardar el paso "identity" crea el perfil y sincroniza sus datos básicos', async () => {
    const res = await savePersonalStep(jhon, workspaceId, 'identity', photographer).expect(200);
    const body = PersonalProfileResponseSchema.parse(res.body);
    expect(body.profile).toMatchObject({
      workspaceId,
      userId: jhon.user.id,
      name: 'Valeria Mora',
      profession: 'Fotógrafa de retrato',
      headline: 'Retratos editoriales con luz natural',
      bio: null,
      roles: ['fotógrafa', 'directora de arte'],
      location: 'Bogotá',
      personalDnaVersion: null,
    });
    expect(body.onboarding.completedSteps).toEqual(['identity']);
    expect(body.onboarding.isComplete).toBe(false);
    expect(body.onboarding.updatedAt).not.toBeNull();
  });

  it('se puede guardar en cualquier orden y retomar donde se dejó', async () => {
    await savePersonalStep(jhon, workspaceId, 'goals', photographer).expect(200);
    await savePersonalStep(jhon, workspaceId, 'identity', photographer).expect(200);
    const res = await jhon.agent.get(url()).expect(200);
    expect(res.body.onboarding.completedSteps).toEqual(['identity', 'goals']);
    expect(res.body.onboarding.answers.goals.professional).toEqual(['vender sesiones premium']);
    expect(await PersonalProfileModel.countDocuments({ workspaceId })).toBe(1);
  });

  it('valida cada paso con su schema (400) y no guarda nada inválido', async () => {
    const empty = await jhon.agent
      .put(url())
      .send({ step: 'personality', data: { traits: [] } })
      .expect(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');
    await jhon.agent
      .put(url())
      .send({
        step: 'goals',
        data: { professional: [], personal: [], content: [], shortTerm: [], longTerm: [] },
      })
      .expect(400);
    await jhon.agent.put(url()).send({ step: 'tasks', data: {} }).expect(400);
    const res = await jhon.agent.get(url()).expect(200);
    expect(res.body.onboarding.completedSteps).toEqual([]);
  });

  it('un Workspace Personal nunca tiene dos perfiles, aunque dos guardados lleguen a la vez', async () => {
    await Promise.all([
      savePersonalStep(jhon, workspaceId, 'identity', photographer).expect(200),
      savePersonalStep(jhon, workspaceId, 'goals', photographer).expect(200),
      savePersonalStep(jhon, workspaceId, 'audience', photographer).expect(200),
    ]);
    expect(await PersonalProfileModel.countDocuments({ workspaceId })).toBe(1);
    // El índice único lo garantiza también fuera de la API.
    await expect(
      PersonalProfileModel.create({ workspaceId, userId: jhon.user.id, name: 'Duplicado' }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('al completar los 8 pasos queda listo y genera el PersonalDNA', async () => {
    await completePersonalOnboarding(jhon, workspaceId, photographer);
    const res = await jhon.agent.get(url()).expect(200);
    expect(res.body.onboarding.isComplete).toBe(true);
    expect(res.body.profile.personalDnaVersion).toBe(1);
  });

  it('"Tus Pixels" refleja el estado del Pixel Personal', async () => {
    const before = await jhon.agent.get(`/api/workspaces/${workspaceId}`).expect(200);
    expect(WorkspaceResponseSchema.parse(before.body).personal).toEqual({
      name: null,
      completedSteps: 0,
      personalDnaVersion: null,
    });

    await completePersonalOnboarding(jhon, workspaceId, photographer);
    const list = await jhon.agent.get('/api/workspaces').expect(200);
    const personal = list.body.workspaces.find(
      (item: { workspace: { id: string } }) => item.workspace.id === workspaceId,
    );
    expect(personal).toMatchObject({
      workspace: { name: 'Jhon', type: 'personal' },
      company: null,
      personal: { name: 'Valeria Mora', completedSteps: 8, personalDnaVersion: 1 },
    });
  });
});

describe('PersonalProfile: aislamiento', () => {
  it('otro usuario no puede leer ni escribir el perfil personal ajeno (404)', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const aliceWs = await createPersonalWorkspace(alice, 'Alice');
    await completePersonalOnboarding(alice, aliceWs, photographer);

    const read = await bob.agent.get(`/api/workspaces/${aliceWs}/personal-profile`);
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('Valeria');
    await savePersonalStep(bob, aliceWs, 'identity', streamer).expect(404);

    const stored = await alice.agent.get(`/api/workspaces/${aliceWs}/personal-profile`).expect(200);
    expect(stored.body.profile.name).toBe('Valeria Mora');
  });

  it('dos usuarios tienen perfiles personales independientes', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const aliceWs = await createPersonalWorkspace(alice, 'Alice');
    const bobWs = await createPersonalWorkspace(bob, 'Bob');
    await savePersonalStep(alice, aliceWs, 'identity', photographer).expect(200);
    await savePersonalStep(bob, bobWs, 'identity', streamer).expect(200);

    const a = await alice.agent.get(`/api/workspaces/${aliceWs}/personal-profile`).expect(200);
    const b = await bob.agent.get(`/api/workspaces/${bobWs}/personal-profile`).expect(200);
    expect(a.body.profile.name).toBe('Valeria Mora');
    expect(b.body.profile.name).toBe('Mateo Ríos');
  });

  it('un workspace enterprise no puede usar los endpoints personales (400)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const companyId = await createCompany(jhon, 'TINTO');
    const enterprise = (await workspaceIdOf(companyId)).toString();

    for (const path of ['personal-profile', 'personal-dna']) {
      const res = await jhon.agent.get(`/api/workspaces/${enterprise}/${path}`).expect(400);
      expect(res.body.error.details).toMatchObject({ reason: 'workspace_type_mismatch' });
    }
    await savePersonalStep(jhon, enterprise, 'identity', photographer).expect(400);
    await jhon.agent.post(`/api/workspaces/${enterprise}/personal-dna/generate`).expect(400);
    expect(await PersonalProfileModel.countDocuments({ workspaceId: enterprise })).toBe(0);
  });

  it('el modelo exige workspaceId en cada consulta', async () => {
    await expect(PersonalProfileModel.find({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(
      PersonalProfileModel.findOne({ workspaceId: { $exists: true } }),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });
});
