import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { CreativeMemoryModel } from '../src/modules/creative-memory/creativeMemory.model.js';
import {
  enterpriseContextBuilder,
  PERSONAL_CONTEXT_NOT_CONFIGURED,
  personalContextBuilder,
  resolveContextBuilder,
} from '../src/modules/conversations/context/index.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { cafeTinto, novaLabs } from './fixtures/onboarding.js';
import { photographer, streamer, type PersonalAnswers } from './fixtures/personal.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { completePersonalOnboarding, createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

async function enterpriseWorkspace(session: Session, answers: typeof cafeTinto) {
  const companyId = await createCompany(session, answers.company.name);
  await completeOnboarding(session, companyId, answers);
  const workspaceId = await workspaceIdOf(companyId);
  const workspace = await WorkspaceModel.findOne({ _id: workspaceId, ownerId: session.user.id });
  if (!workspace) throw new Error('workspace no encontrado');
  return { companyId, workspace };
}

const ask = (workspace: Awaited<ReturnType<typeof enterpriseWorkspace>>['workspace']) =>
  resolveContextBuilder(workspace.type).build({
    workspace,
    history: [],
    userMessage: 'Necesito una campaña para redes.',
    historyLimit: 20,
  });

describe('resolveContextBuilder', () => {
  it('elige la estrategia según el tipo de workspace', () => {
    expect(resolveContextBuilder('enterprise')).toBe(enterpriseContextBuilder);
    expect(resolveContextBuilder('personal')).toBe(personalContextBuilder);
  });
});

describe('EnterpriseContextBuilder', () => {
  it('recupera el BrandDNA de la empresa del workspace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { companyId, workspace } = await enterpriseWorkspace(jhon, cafeTinto);

    const result = await ask(workspace);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.companyId?.toString()).toBe(companyId);
    expect(result.meta).toEqual({
      brandDnaVersion: 1,
      personalDnaVersion: null,
      avatarVersion: null,
    });
    expect(result.context.brief).toMatchObject({ brand: 'Café Tinto' });
    expect(result.context.system).toContain('director creativo de Café Tinto');
  });

  it('dos workspaces del mismo dueño nunca mezclan ADN ni memorias', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await enterpriseWorkspace(jhon, cafeTinto);
    const inventia = await enterpriseWorkspace(jhon, novaLabs);
    const memory = (workspaceId: Types.ObjectId, content: string) => ({
      workspaceId,
      memoryScope: 'enterprise' as const,
      kind: 'decision' as const,
      content,
      source: { type: 'manual' as const, conversationId: null, messageId: null },
      createdByUserId: new Types.ObjectId(jhon.user.id),
    });
    await CreativeMemoryModel.create([
      memory(tinto.workspace._id, 'Las fotos siempre con luz natural de la finca'),
      memory(inventia.workspace._id, 'Nada de capturas de pantalla sin contexto'),
    ]);

    const a = await ask(tinto.workspace);
    const b = await ask(inventia.workspace);
    if (a.status !== 'ready' || b.status !== 'ready') throw new Error('contexto no listo');

    expect(a.context.system).toContain('luz natural de la finca');
    expect(a.context.system).not.toContain('capturas de pantalla');
    expect(a.context.system).not.toContain('Nova Labs');
    expect(b.context.system).toContain('capturas de pantalla');
    expect(b.context.system).not.toContain('luz natural de la finca');
    expect(b.context.system).not.toMatch(/Café Tinto|Huila/);
    expect(a.context.stats.memories).toBe(1);
  });

  it('sin ADN responde not_configured, no inventa contexto', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const companyId = await createCompany(jhon, 'Sin ADN');
    const workspace = await WorkspaceModel.findOne({
      _id: await workspaceIdOf(companyId),
      ownerId: jhon.user.id,
    });
    const result = await ask(workspace!);
    expect(result).toMatchObject({ status: 'not_configured', reason: 'brand_dna_missing' });
  });
});

describe('PersonalContextBuilder', () => {
  async function personalWorkspace(session: Session, answers?: PersonalAnswers) {
    const id = await createPersonalWorkspace(session, session.user.name);
    if (answers) await completePersonalOnboarding(session, id, answers);
    const workspace = await WorkspaceModel.findOne({ _id: id, ownerId: session.user.id });
    if (!workspace) throw new Error('workspace no encontrado');
    return workspace;
  }

  it('sin PersonalDNA responde que el contexto personal no está configurado', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const result = await ask(await personalWorkspace(jhon));
    expect(result).toEqual({
      status: 'not_configured',
      reason: 'personal_context_not_configured',
      message: PERSONAL_CONTEXT_NOT_CONFIGURED,
    });
  });

  it('carga el PersonalDNA del workspace: Director Creativo Personal, en segunda persona', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const result = await ask(await personalWorkspace(jhon, photographer));
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.companyId).toBeNull();
    expect(result.meta).toEqual({
      brandDnaVersion: null,
      personalDnaVersion: 1,
      avatarVersion: null,
    });
    const { system } = result.context;
    expect(system).toContain('Director Creativo Personal de Valeria Mora');
    expect(system).toMatch(/No eres terapeuta, ni un life coach genérico/);
    expect(system).toContain('<personal_context>');
    expect(system).not.toContain('<brand_context>');
    expect(result.context.brief).toMatchObject({
      person: 'Valeria Mora',
      goals: { professional: ['vender sesiones premium'] },
      content: { platforms: ['Instagram', 'LinkedIn'] },
    });
    expect(system).toContain('Nunca uses: «barato», «promo»');
  });

  it('el Pixel Personal de A nunca usa el ADN de B', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const a = await ask(await personalWorkspace(alice, photographer));
    const b = await ask(await personalWorkspace(bob, streamer));
    if (a.status !== 'ready' || b.status !== 'ready') throw new Error('contexto no listo');
    expect(a.context.system).toContain('Valeria Mora');
    expect(a.context.system).not.toMatch(/Mateo|Twitch|streamer/i);
    expect(b.context.system).toContain('Mateo Ríos');
    expect(b.context.system).not.toMatch(/Valeria|sesiones premium|fotógraf/i);
  });

  it('el mismo dueño con empresa y Pixel Personal: los contextos no se mezclan', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspace: enterprise } = await enterpriseWorkspace(jhon, cafeTinto);
    const personal = await personalWorkspace(jhon, streamer);

    const brand = await ask(enterprise);
    const own = await ask(personal);
    if (brand.status !== 'ready' || own.status !== 'ready') throw new Error('contexto no listo');
    expect(own.context.system).not.toMatch(/Café Tinto|Huila|<brand_context>/);
    expect(brand.context.system).not.toMatch(/Mateo|Twitch|<personal_context>/);
    expect(brand.meta.personalDnaVersion).toBeNull();
    expect(own.meta.brandDnaVersion).toBeNull();
  });

  it('incluye las memorias creativas de SU workspace, nunca las de otro', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspace: enterprise } = await enterpriseWorkspace(jhon, cafeTinto);
    const personal = await personalWorkspace(jhon, photographer);
    const memory = (
      workspaceId: Types.ObjectId,
      memoryScope: 'enterprise' | 'personal',
      content: string,
    ) => ({
      workspaceId,
      memoryScope,
      kind: 'decision' as const,
      content,
      source: { type: 'manual' as const, conversationId: null, messageId: null },
      createdByUserId: new Types.ObjectId(jhon.user.id),
    });
    await CreativeMemoryModel.create([
      memory(personal._id, 'personal', 'Nada de fondos blancos de estudio'),
      memory(enterprise._id, 'enterprise', 'Campaña de cosecha aprobada'),
    ]);
    const result = await ask(personal);
    if (result.status !== 'ready') throw new Error('contexto no listo');
    expect(result.context.system).toContain('Nada de fondos blancos de estudio');
    expect(result.context.system).not.toContain('Campaña de cosecha aprobada');
  });
});
