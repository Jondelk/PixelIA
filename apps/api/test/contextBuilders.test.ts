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
import { completeOnboarding, createCompany } from './support/brandBrain.js';
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
    expect(result.meta).toEqual({ brandDnaVersion: 1, avatarVersion: null });
    expect(result.context.brief.brand).toBe('Café Tinto');
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
  it('es un placeholder explícito: el contexto personal aún no está configurado', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const res = await jhon.agent
      .post('/api/workspaces')
      .send({ type: 'personal', name: 'Jhon Trochez' })
      .expect(201);
    const workspace = await WorkspaceModel.findOne({
      _id: res.body.workspace.id,
      ownerId: jhon.user.id,
    });
    const result = await ask(workspace!);
    expect(result).toEqual({
      status: 'not_configured',
      reason: 'personal_context_not_configured',
      message: PERSONAL_CONTEXT_NOT_CONFIGURED,
    });
  });
});
