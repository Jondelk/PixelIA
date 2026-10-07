import {
  AvatarResponseSchema,
  CompanyResponseSchema,
  ConversationResponseSchema,
  SendMessageResponseSchema,
  WorkspaceResponseSchema,
} from '@pixel/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { AvatarProfileModel } from '../src/modules/avatars/avatarProfile.model.js';
import { CompanyModel } from '../src/modules/companies/company.model.js';
import { ConversationModel } from '../src/modules/conversations/conversation.model.js';
import { MessageModel } from '../src/modules/conversations/message.model.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { cafeTinto, novaLabs } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany, saveStep } from './support/brandBrain.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

afterEach(() => {
  vi.restoreAllMocks();
});

async function enterprisePixel(session: Session, answers: typeof cafeTinto) {
  const companyId = await createCompany(session, answers.company.name);
  await completeOnboarding(session, companyId, answers);
  const workspaceId = (await workspaceIdOf(companyId)).toString();
  return { companyId, workspaceId };
}

describe('Enterprise: crear empresa crea su Workspace', () => {
  it('la empresa nace dentro de un Workspace enterprise del mismo dueño', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const res = await jhon.agent
      .post('/api/companies')
      .send({ name: 'TINTO', industry: 'Café' })
      .expect(201);
    const { company } = CompanyResponseSchema.parse(res.body);

    const workspace = await WorkspaceModel.findOne({
      _id: company.workspaceId,
      ownerId: jhon.user.id,
    });
    expect(workspace).toMatchObject({ type: 'enterprise', name: 'TINTO', status: 'active' });
    expect(workspace?.ownerId.toString()).toBe(company.ownerId);

    const overview = await jhon.agent.get(`/api/workspaces/${company.workspaceId}`).expect(200);
    expect(WorkspaceResponseSchema.parse(overview.body).company?.id).toBe(company.id);
  });

  it('si crear la empresa falla, no queda un workspace huérfano (rollback lógico)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    vi.spyOn(CompanyModel, 'create').mockRejectedValueOnce(new Error('fallo simulado'));
    await jhon.agent.post('/api/companies').send({ name: 'TINTO', industry: 'Café' }).expect(500);
    expect(await WorkspaceModel.countDocuments({ ownerId: jhon.user.id })).toBe(0);
  });

  it('no deshace el workspace si la empresa sí llegó a guardarse (corte tras el insert)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const original = CompanyModel.create.bind(CompanyModel);
    // El insert se confirma pero la respuesta "se pierde": el driver devuelve un error de red.
    vi.spyOn(CompanyModel, 'create').mockImplementationOnce((async (doc: object) => {
      await original(doc);
      throw new Error('conexión cerrada');
    }) as unknown as typeof CompanyModel.create);
    await jhon.agent.post('/api/companies').send({ name: 'TINTO', industry: 'Café' }).expect(500);

    const company = await CompanyModel.findOne({ ownerId: jhon.user.id });
    expect(company?.workspaceId).toBeDefined();
    expect(
      await WorkspaceModel.exists({ _id: company!.workspaceId, ownerId: jhon.user.id }),
    ).toBeTruthy();
    await jhon.agent.get(`/api/companies/${company!._id.toString()}`).expect(200);
  });

  it('completa un Workspace enterprise creado vacío; no admite personales, ajenos ni ocupados', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const bob = await registerUser(app, 'Bob');
    const empty = (
      await jhon.agent
        .post('/api/workspaces')
        .send({ type: 'enterprise', name: 'Nuevo' })
        .expect(201)
    ).body.workspace.id as string;
    const personal = (
      await jhon.agent.post('/api/workspaces').send({ type: 'personal', name: 'Jhon' }).expect(201)
    ).body.workspace.id as string;

    const body = { name: 'INVENTIA', industry: 'Tecnología' };
    await bob.agent.post(`/api/workspaces/${empty}/company`).send(body).expect(404);
    await jhon.agent.post(`/api/workspaces/${personal}/company`).send(body).expect(400);

    const res = await jhon.agent.post(`/api/workspaces/${empty}/company`).send(body).expect(201);
    expect(res.body.company.workspaceId).toBe(empty);
    // El workspace toma el nombre de su empresa.
    const ws = await jhon.agent.get(`/api/workspaces/${empty}`).expect(200);
    expect(ws.body.workspace.name).toBe('INVENTIA');
    expect(ws.body.company.id).toBe(res.body.company.id);

    await jhon.agent.post(`/api/workspaces/${empty}/company`).send(body).expect(409);
    expect(await WorkspaceModel.countDocuments({ ownerId: jhon.user.id })).toBe(2);
    expect(await CompanyModel.countDocuments({ ownerId: jhon.user.id })).toBe(1);
  });

  it('un workspaceId en el cuerpo de POST /api/companies se ignora', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const bob = await registerUser(app, 'Bob');
    const bobWorkspace = (
      await bob.agent
        .post('/api/workspaces')
        .send({ type: 'enterprise', name: 'De Bob' })
        .expect(201)
    ).body.workspace.id as string;

    const res = await jhon.agent
      .post('/api/companies')
      .send({ name: 'TINTO', industry: 'Café', workspaceId: bobWorkspace })
      .expect(201);
    expect(res.body.company.workspaceId).not.toBe(bobWorkspace);
    const bobView = await bob.agent.get(`/api/workspaces/${bobWorkspace}`).expect(200);
    expect(bobView.body.company).toBeNull();
  });

  it('PATCH no puede mover una empresa de workspace ni cambiar el dueño de un workspace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const bob = await registerUser(app, 'Bob');
    const companyId = await createCompany(jhon, 'TINTO');
    const original = (await workspaceIdOf(companyId)).toString();
    const other = (
      await jhon.agent
        .post('/api/workspaces')
        .send({ type: 'enterprise', name: 'Otro' })
        .expect(201)
    ).body.workspace.id as string;

    await jhon.agent.patch(`/api/companies/${companyId}`).send({ workspaceId: other }).expect(400);
    await jhon.agent
      .patch(`/api/companies/${companyId}`)
      .send({ ownerId: bob.user.id })
      .expect(400);
    await jhon.agent
      .patch(`/api/workspaces/${original}`)
      .send({ ownerId: bob.user.id })
      .expect(400);
    expect((await workspaceIdOf(companyId)).toString()).toBe(original);
    const bobList = await bob.agent.get('/api/workspaces').expect(200);
    expect(bobList.body.workspaces).toEqual([]);
  });

  it('renombrar la empresa (PATCH u onboarding) renombra su workspace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const companyId = await createCompany(jhon, 'Tinto');
    const workspaceId = (await workspaceIdOf(companyId)).toString();

    await jhon.agent.patch(`/api/companies/${companyId}`).send({ name: 'TINTO Café' }).expect(200);
    let ws = await jhon.agent.get(`/api/workspaces/${workspaceId}`).expect(200);
    expect(ws.body.workspace.name).toBe('TINTO Café');

    await saveStep(jhon, companyId, 'company', cafeTinto).expect(200);
    ws = await jhon.agent.get(`/api/workspaces/${workspaceId}`).expect(200);
    expect(ws.body.workspace.name).toBe(cafeTinto.company.name);
  });
});

describe('Enterprise por rutas de Workspace', () => {
  it('BrandDNA, avatar y chat siguen funcionando y quedan en el workspace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { companyId, workspaceId } = await enterprisePixel(jhon, cafeTinto);

    // BrandDNA sigue por su ruta de empresa, como antes.
    const brain = await jhon.agent.get(`/api/companies/${companyId}/brand-dna`).expect(200);
    expect(brain.body.brandDna.identity.name).toBe('Café Tinto');

    // Avatar por la ruta nueva y por la legacy: el mismo recurso.
    const generated = await jhon.agent
      .post(`/api/workspaces/${workspaceId}/avatar/generate`)
      .expect(201);
    const { avatar } = AvatarResponseSchema.parse(generated.body);
    expect(avatar).toMatchObject({ workspaceId, sourceType: 'brand', companyId, version: 1 });
    const legacy = await jhon.agent.get(`/api/companies/${companyId}/avatar`).expect(200);
    expect(legacy.body.avatar.id).toBe(avatar!.id);

    // Conversación por la ruta nueva; visible también por la legacy.
    const created = await jhon.agent
      .post(`/api/workspaces/${workspaceId}/conversations`)
      .expect(201);
    const { conversation } = ConversationResponseSchema.parse(created.body);
    expect(conversation).toMatchObject({ workspaceId, contextType: 'enterprise', companyId });

    const sent = await jhon.agent
      .post(`/api/workspaces/${workspaceId}/conversations/${conversation.id}/messages`)
      .send({ content: 'Necesito una campaña para redes.' })
      .expect(201);
    const reply = SendMessageResponseSchema.parse(sent.body);
    expect(reply.pixelMessage).toMatchObject({ workspaceId, companyId, role: 'pixel' });
    expect(reply.pixelMessage.content).toMatch(/Huila|caf[eé]|origen/i);

    const legacyList = await jhon.agent
      .get(`/api/companies/${companyId}/conversations`)
      .expect(200);
    expect(legacyList.body.conversations[0].messageCount).toBe(2);
  });

  it('un Workspace enterprise sin empresa explica que falta configurarla', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const id = (
      await jhon.agent
        .post('/api/workspaces')
        .send({ type: 'enterprise', name: 'Vacío' })
        .expect(201)
    ).body.workspace.id as string;
    await jhon.agent.get(`/api/workspaces/${id}/avatar`).expect(409);
    const conversation = (await jhon.agent.post(`/api/workspaces/${id}/conversations`).expect(201))
      .body.conversation.id as string;
    const res = await jhon.agent
      .post(`/api/workspaces/${id}/conversations/${conversation}/messages`)
      .send({ content: 'Hola' })
      .expect(409);
    expect(res.body.error.details).toEqual({ reason: 'enterprise_company_missing' });
  });
});

describe('Personal sin ADN todavía', () => {
  it('avatar y chat responden de forma controlada que falta configurarlo', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const id = (
      await jhon.agent.post('/api/workspaces').send({ type: 'personal', name: 'Jhon' }).expect(201)
    ).body.workspace.id as string;

    const avatar = await jhon.agent.get(`/api/workspaces/${id}/avatar`).expect(200);
    expect(avatar.body).toMatchObject({ avatar: null, sourceType: 'personal', dnaVersion: null });
    const generate = await jhon.agent.post(`/api/workspaces/${id}/avatar/generate`).expect(409);
    expect(generate.body.error.details).toEqual({ reason: 'personal_dna_missing' });
    const created = await jhon.agent.post(`/api/workspaces/${id}/conversations`).expect(201);
    expect(created.body.conversation).toMatchObject({ contextType: 'personal', companyId: null });

    const res = await jhon.agent
      .post(`/api/workspaces/${id}/conversations/${created.body.conversation.id}/messages`)
      .send({ content: 'Organiza mi semana' })
      .expect(409);
    expect(res.body.error.details).toEqual({ reason: 'personal_context_not_configured' });
    expect(res.body.error.message).toMatch(/onboarding personal/i);
  });
});

describe('Aislamiento entre usuarios en rutas de Workspace', () => {
  it('otro usuario no puede escribir en el workspace ajeno ni dejar rastro', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const { workspaceId } = await enterprisePixel(alice, cafeTinto);
    const conversation = (
      await alice.agent.post(`/api/workspaces/${workspaceId}/conversations`).expect(201)
    ).body.conversation.id as string;
    const base = `/api/workspaces/${workspaceId}`;

    await bob.agent.post(`${base}/conversations`).expect(404);
    await bob.agent
      .post(`${base}/conversations/${conversation}/messages`)
      .send({ content: 'Intruso' })
      .expect(404);
    await bob.agent.post(`${base}/avatar/generate`).expect(404);
    await bob.agent.post(`${base}/company`).send({ name: 'Mía', industry: 'Café' }).expect(404);
    await bob.agent.patch(base).send({ status: 'archived' }).expect(404);

    const own = new mongoose.Types.ObjectId(workspaceId);
    expect(await ConversationModel.countDocuments({ workspaceId: own })).toBe(1);
    expect(await MessageModel.countDocuments({ workspaceId: own })).toBe(0);
    expect(await AvatarProfileModel.countDocuments({ workspaceId: own })).toBe(0);
    expect((await alice.agent.get(base).expect(200)).body.workspace.status).toBe('active');
  });

  it('un workspace ajeno y uno inexistente responden exactamente igual', async () => {
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');
    const id = (
      await alice.agent
        .post('/api/workspaces')
        .send({ type: 'personal', name: 'Alice' })
        .expect(201)
    ).body.workspace.id as string;
    const foreign = await bob.agent.get(`/api/workspaces/${id}`).expect(404);
    const missing = await bob.agent
      .get(`/api/workspaces/${new mongoose.Types.ObjectId()}`)
      .expect(404);
    expect(foreign.body.error.message).toBe(missing.body.error.message);
    expect(foreign.body.error.code).toBe(missing.body.error.code);
  });
});

describe('Aislamiento entre Workspaces del mismo dueño', () => {
  it('una conversación del Workspace A no se puede usar desde el Workspace B', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await enterprisePixel(jhon, cafeTinto);
    const inventia = await enterprisePixel(jhon, novaLabs);

    const conversation = (
      await jhon.agent.post(`/api/workspaces/${tinto.workspaceId}/conversations`).expect(201)
    ).body.conversation.id as string;
    const inB = `/api/workspaces/${inventia.workspaceId}/conversations/${conversation}/messages`;
    await jhon.agent.get(inB).expect(404);
    await jhon.agent.post(inB).send({ content: 'Hola' }).expect(404);
    // Tampoco mezclando la ruta legacy de B con la conversación de A.
    await jhon.agent
      .post(`/api/companies/${inventia.companyId}/conversations/${conversation}/messages`)
      .send({ content: 'Hola' })
      .expect(404);

    const listB = await jhon.agent
      .get(`/api/workspaces/${inventia.workspaceId}/conversations`)
      .expect(200);
    expect(listB.body.conversations).toEqual([]);
  });

  it('el avatar de A no aparece en B', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await enterprisePixel(jhon, cafeTinto);
    const inventia = await enterprisePixel(jhon, novaLabs);
    await jhon.agent.post(`/api/workspaces/${tinto.workspaceId}/avatar/generate`).expect(201);

    const b = await jhon.agent.get(`/api/workspaces/${inventia.workspaceId}/avatar`).expect(200);
    expect(b.body).toMatchObject({ avatar: null, history: [] });
  });
});
