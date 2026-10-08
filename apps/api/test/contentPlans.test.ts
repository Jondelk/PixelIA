import {
  AcceptContentPlanItemResponseSchema,
  ContentPlanListResponseSchema,
  ContentPlanResponseSchema,
} from '@pixel/contracts';
import mongoose, { type Model } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { AIProviderError, type AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { TenantScopeError } from '../src/db/tenantScoped.plugin.js';
import { ContentPlanModel } from '../src/modules/content-plans/contentPlan.model.js';
import { ContentPlanItemModel } from '../src/modules/content-plans/contentPlanItem.model.js';
import { ProjectModel } from '../src/modules/operations/project.model.js';
import { ContentItemModel } from '../src/modules/operations/contentItem.model.js';
import { createCompany } from './support/brandBrain.js';
import { creativeDirector, photographer } from './fixtures/personal.js';
import { createProject, ops } from './support/operations.js';
import { completePersonalOnboarding, createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

const plansUrl = (workspaceId: string) => `/api/workspaces/${workspaceId}/content-plans`;
const twoWeeks = {
  startDate: '2026-10-12',
  endDate: '2026-10-25',
  frequency: 3,
  platforms: ['instagram'],
  goal: 'posicionamiento',
  tzOffset: 300,
};

async function personalPixel(session: Session, answers = creativeDirector) {
  const workspaceId = await createPersonalWorkspace(session);
  await completePersonalOnboarding(session, workspaceId, answers);
  return workspaceId;
}

async function generate(session: Session, workspaceId: string, body: object = twoWeeks) {
  const res = await session.agent
    .post(`${plansUrl(workspaceId)}/generate`)
    .send(body)
    .expect(201);
  return ContentPlanResponseSchema.parse(res.body);
}

describe('Content Planner: generar con Pixel', () => {
  let jhon: Session;
  let workspaceId: string;

  beforeEach(async () => {
    jhon = await registerUser(app, 'Jhon');
    workspaceId = await personalPixel(jhon);
  });

  it('genera un plan borrador con estrategia, pilares y propuestas justificadas', async () => {
    const project = await createProject(jhon, workspaceId, {
      name: 'Pixel Personal MVP',
      description: 'Asistente creativo con ADN personal',
      type: 'creative',
    });
    const { plan, items } = await generate(jhon, workspaceId);

    expect(plan).toMatchObject({
      workspaceId,
      name: 'Octubre · 12–25',
      objective: 'posicionamiento',
      period: { startDate: '2026-10-12', endDate: '2026-10-25' },
      status: 'draft',
      generatedBy: 'pixel',
      personalDnaVersion: 1,
      platforms: ['instagram'],
      generation: {
        mode: 'demo',
        frequencyPerWeek: 3,
        frequencySource: 'request',
        requestedGoal: 'posicionamiento',
      },
      itemCounts: { proposed: 6, accepted: 0, rejected: 0, converted: 0 },
    });
    expect(plan.strategySummary).toMatch(/proyectos activos/);
    expect(plan.pillars.length).toBeGreaterThanOrEqual(2);
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(item.status).toBe('proposed');
      expect(item.platform).toBe('instagram');
      expect(['reel', 'carousel', 'story']).toContain(item.format);
      expect(item.rationale?.length).toBeGreaterThan(20);
      expect(item.scheduledFor! >= '2026-10-12').toBe(true);
      expect(item.scheduledFor! <= '2026-10-26').toBe(true);
    }
    // Usa el proyecto real como fuente, sin modificarlo.
    expect(items.some((item) => item.projectId === project.id)).toBe(true);
    const after = await ProjectModel.findOne({ _id: project.id, workspaceId });
    expect(after?.status).toBe('active');
    expect(after?.updatedAt.toISOString()).toBe(project.updatedAt);
  });

  it('valida la petición: periodo de máx. 30 días, fechas en orden, sin workspaceId en el cuerpo', async () => {
    const url = `${plansUrl(workspaceId)}/generate`;
    await jhon.agent
      .post(url)
      .send({ ...twoWeeks, endDate: '2026-11-30' })
      .expect(400);
    await jhon.agent
      .post(url)
      .send({ ...twoWeeks, endDate: '2026-10-01' })
      .expect(400);
    await jhon.agent
      .post(url)
      .send({ ...twoWeeks, workspaceId })
      .expect(400);
    await jhon.agent.post(url).send({ startDate: '2026-10-12' }).expect(400);
    await jhon.agent
      .post(url)
      .send({ ...twoWeeks, frequency: 50 })
      .expect(400);
    // Solo las fechas son obligatorias.
    await jhon.agent.post(url).send({ startDate: '2026-10-12', endDate: '2026-10-18' }).expect(201);
  });

  it('sin plataformas pedidas usa las del ADN', async () => {
    const ana = await registerUser(app, 'Ana');
    const anaWorkspace = await personalPixel(ana, photographer);
    const { items } = await generate(ana, anaWorkspace, {
      startDate: '2026-10-12',
      endDate: '2026-10-18',
    });
    expect(items.every((item) => ['instagram', 'linkedin'].includes(item.platform!))).toBe(true);
  });

  it('regenerar crea un plan NUEVO y conserva el anterior', async () => {
    const first = await generate(jhon, workspaceId);
    const second = await generate(jhon, workspaceId, {
      ...twoWeeks,
      regenerateFrom: first.plan.id,
    });
    expect(second.plan.id).not.toBe(first.plan.id);
    expect(second.plan.generation?.regeneratedFromPlanId).toBe(first.plan.id);
    const list = ContentPlanListResponseSchema.parse(
      (await jhon.agent.get(plansUrl(workspaceId)).expect(200)).body,
    );
    expect(list.total).toBe(2);
    expect(
      (await jhon.agent.get(`${plansUrl(workspaceId)}/${first.plan.id}`).expect(200)).body.items,
    ).toHaveLength(6);
  });

  it('sin PersonalDNA → 409 personal_context_not_configured', async () => {
    const nuevo = await registerUser(app, 'Nuevo');
    const empty = await createPersonalWorkspace(nuevo, 'Nuevo');
    const res = await nuevo.agent
      .post(`${plansUrl(empty)}/generate`)
      .send(twoWeeks)
      .expect(409);
    expect(res.body.error.details.reason).toBe('personal_context_not_configured');
    expect(await ContentPlanModel.countDocuments({ workspaceId: empty })).toBe(0);
  });

  it('Enterprise todavía no genera planes (feature_not_available)', async () => {
    const companyId = await createCompany(jhon, 'TINTO');
    const enterprise = (await workspaceIdOf(companyId)).toString();
    const res = await jhon.agent
      .post(`${plansUrl(enterprise)}/generate`)
      .send(twoWeeks)
      .expect(400);
    expect(res.body.error.details.reason).toBe('feature_not_available');
  });

  it('sin proveedor de IA disponible: 503, sin plan falso', async () => {
    const failing: AIProvider = {
      ...new DemoProvider(),
      name: 'down',
      model: 'down',
      mode: 'ai',
      generateText: () => Promise.reject(new AIProviderError('unavailable', 'sin red')),
      generateStructuredOutput: () => Promise.reject(new AIProviderError('unavailable', 'sin red')),
    };
    const downApp = buildTestApp(failing);
    const ana = await registerUser(downApp, 'Ana');
    const wid = await personalPixel(ana);
    const res = await ana.agent
      .post(`${plansUrl(wid)}/generate`)
      .send(twoWeeks)
      .expect(503);
    expect(res.body.error.details.reason).toBe('content_plan_generation_unavailable');
    expect(await ContentPlanModel.countDocuments({ workspaceId: wid })).toBe(0);
  });
});

describe('Content Planner: propuestas', () => {
  let jhon: Session;
  let workspaceId: string;
  let planId: string;
  let items: Awaited<ReturnType<typeof generate>>['items'];
  const itemUrl = (itemId: string) => `${plansUrl(workspaceId)}/${planId}/items/${itemId}`;

  beforeEach(async () => {
    jhon = await registerUser(app, 'Jhon');
    workspaceId = await personalPixel(jhon);
    await createProject(jhon, workspaceId, { name: 'Videoclip musical', type: 'creative' });
    const generated = await generate(jhon, workspaceId);
    planId = generated.plan.id;
    items = generated.items;
  });

  it('aceptar crea exactamente 1 ContentItem (source pixel, idea) y es idempotente', async () => {
    const target = items.find((item) => item.projectId)!;
    const first = await jhon.agent.post(`${itemUrl(target.id)}/accept`).expect(201);
    const body = AcceptContentPlanItemResponseSchema.parse(first.body);
    expect(body.created).toBe(true);
    expect(body.item).toMatchObject({
      status: 'converted',
      convertedContentItemId: body.contentItem!.id,
    });
    expect(body.contentItem).toMatchObject({
      title: target.title,
      concept: target.concept,
      hook: target.hook,
      platform: target.platform,
      format: target.format,
      status: 'idea',
      source: 'pixel',
      projectId: target.projectId,
      scheduledFor: target.scheduledFor,
    });
    expect(body.contentItem!.notes).toContain('Por qué:');

    const second = await jhon.agent.post(`${itemUrl(target.id)}/accept`).expect(200);
    expect(second.body).toMatchObject({
      created: false,
      contentItem: { id: body.contentItem!.id },
    });
    expect(await ContentItemModel.countDocuments({ workspaceId })).toBe(1);

    // Aparece en Contenido.
    const content = await jhon.agent.get(ops(workspaceId).content).expect(200);
    expect(content.body.contentItems.map((item: { id: string }) => item.id)).toEqual([
      body.contentItem!.id,
    ]);
  });

  it('dos aceptaciones simultáneas no duplican', async () => {
    const target = items[0]!;
    const results = await Promise.all([
      jhon.agent.post(`${itemUrl(target.id)}/accept`),
      jhon.agent.post(`${itemUrl(target.id)}/accept`),
      jhon.agent.post(`${itemUrl(target.id)}/accept`),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 200, 201]);
    expect(await ContentItemModel.countDocuments({ workspaceId })).toBe(1);
  });

  it('editar antes de aceptar guarda en la propuesta; aceptar usa lo editado', async () => {
    const target = items[1]!;
    const res = await jhon.agent
      .patch(itemUrl(target.id))
      .send({
        title: 'Mi versión del título',
        hook: 'Un hook mío.',
        format: 'carousel',
        scheduledFor: '2026-10-20T17:00:00.000Z',
      })
      .expect(200);
    expect(res.body.item).toMatchObject({
      title: 'Mi versión del título',
      status: 'proposed',
      format: 'carousel',
    });
    const accepted = await jhon.agent.post(`${itemUrl(target.id)}/accept`).expect(201);
    expect(accepted.body.contentItem).toMatchObject({
      title: 'Mi versión del título',
      hook: 'Un hook mío.',
      scheduledFor: '2026-10-20T17:00:00.000Z',
    });
    // Convertida: ya no se edita ni se rechaza desde el plan.
    await jhon.agent.patch(itemUrl(target.id)).send({ title: 'Otro' }).expect(409);
    await jhon.agent
      .post(`${itemUrl(target.id)}/reject`)
      .send({})
      .expect(409);
    await jhon.agent.patch(itemUrl(target.id)).send({ rationale: 'x' }).expect(400);
  });

  it('rechazar no borra (con motivo opcional) y se puede recuperar', async () => {
    const target = items[2]!;
    const res = await jhon.agent
      .post(`${itemUrl(target.id)}/reject`)
      .send({ reason: 'No encaja con mi tono' })
      .expect(200);
    expect(res.body.item).toMatchObject({
      status: 'rejected',
      rejectionReason: 'No encaja con mi tono',
    });
    const plan = await jhon.agent.get(`${plansUrl(workspaceId)}/${planId}`).expect(200);
    expect(plan.body.items).toHaveLength(6);
    expect(plan.body.plan.itemCounts).toMatchObject({ proposed: 5, rejected: 1 });
    const restored = await jhon.agent
      .patch(itemUrl(target.id))
      .send({ status: 'proposed' })
      .expect(200);
    expect(restored.body.item).toMatchObject({ status: 'proposed', rejectionReason: null });
    // Una rechazada también se puede aceptar después.
    await jhon.agent
      .post(`${itemUrl(target.id)}/reject`)
      .send()
      .expect(200);
    await jhon.agent.post(`${itemUrl(target.id)}/accept`).expect(201);
  });

  it('editar y archivar el plan; DELETE archiva y conserva las propuestas', async () => {
    const res = await jhon.agent
      .patch(`${plansUrl(workspaceId)}/${planId}`)
      .send({ name: 'Octubre · autoridad', status: 'active' })
      .expect(200);
    expect(res.body.plan).toMatchObject({ name: 'Octubre · autoridad', status: 'active' });
    await jhon.agent
      .patch(`${plansUrl(workspaceId)}/${planId}`)
      .send({ generatedBy: 'manual' })
      .expect(400);
    const archived = await jhon.agent.delete(`${plansUrl(workspaceId)}/${planId}`).expect(200);
    expect(archived.body.plan.status).toBe('archived');
    expect(archived.body.items).toHaveLength(6);
    expect((await jhon.agent.get(plansUrl(workspaceId)).expect(200)).body.total).toBe(0);
    expect(
      (await jhon.agent.get(`${plansUrl(workspaceId)}?status=archived`).expect(200)).body.total,
    ).toBe(1);
  });

  it('plan manual vacío (sin Pixel)', async () => {
    const res = await jhon.agent
      .post(plansUrl(workspaceId))
      .send({
        name: 'Mi plan',
        startDate: '2026-11-01',
        endDate: '2026-11-07',
        platforms: ['instagram'],
      })
      .expect(201);
    expect(res.body).toMatchObject({
      plan: {
        generatedBy: 'manual',
        personalDnaVersion: null,
        generation: null,
        strategySummary: null,
      },
      items: [],
    });
  });

  it('ids malformados o de otro plan → 404', async () => {
    const other = await generate(jhon, workspaceId, {
      startDate: '2026-11-02',
      endDate: '2026-11-08',
    });
    await jhon.agent.get(`${plansUrl(workspaceId)}/no-es-id`).expect(404);
    await jhon.agent
      .post(`${plansUrl(workspaceId)}/${planId}/items/${other.items[0]!.id}/accept`)
      .expect(404);
    await jhon.agent
      .post(`${plansUrl(workspaceId)}/${planId}/items/x/reject`)
      .send({})
      .expect(404);
  });
});

describe('Content Planner: aislamiento (404, nunca 403)', () => {
  it('B no puede leer, editar, aceptar, rechazar ni convertir nada de A', async () => {
    const userA = await registerUser(app, 'Usuario A');
    const userB = await registerUser(app, 'Usuario B');
    const workspaceA = await personalPixel(userA);
    const workspaceB = await personalPixel(userB, photographer);
    const { plan, items } = await generate(userA, workspaceA);
    const itemId = items[0]!.id;

    for (const base of [plansUrl(workspaceA), plansUrl(workspaceB)]) {
      const attempts = [
        () => userB.agent.get(`${base}/${plan.id}`),
        () => userB.agent.patch(`${base}/${plan.id}`).send({ name: 'Hackeado' }),
        () => userB.agent.delete(`${base}/${plan.id}`),
        () => userB.agent.patch(`${base}/${plan.id}/items/${itemId}`).send({ title: 'X' }),
        () => userB.agent.post(`${base}/${plan.id}/items/${itemId}/accept`),
        () => userB.agent.post(`${base}/${plan.id}/items/${itemId}/reject`).send({}),
      ];
      for (const attempt of attempts) expect((await attempt()).status).toBe(404);
    }
    expect((await userB.agent.get(plansUrl(workspaceA))).status).toBe(404);
    expect((await userB.agent.post(`${plansUrl(workspaceA)}/generate`).send(twoWeeks)).status).toBe(
      404,
    );
    expect((await userB.agent.get(plansUrl(workspaceB)).expect(200)).body.total).toBe(0);

    const intact = await userA.agent.get(`${plansUrl(workspaceA)}/${plan.id}`).expect(200);
    expect(intact.body.plan.name).toBe(plan.name);
    expect(intact.body.items[0]).toMatchObject({ status: 'proposed', title: items[0]!.title });
    expect(await ContentItemModel.countDocuments({ workspaceId: workspaceB })).toBe(0);
  });

  it('el planner solo usa el workspace activo: proyectos de otro workspace del mismo dueño no entran', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const personal = await personalPixel(jhon);
    const companyId = await createCompany(jhon, 'TINTO');
    const enterprise = (await workspaceIdOf(companyId)).toString();
    const foreign = await createProject(jhon, enterprise, { name: 'Campaña de TINTO' });
    const { items, plan } = await generate(jhon, personal);
    expect(items.every((item) => item.projectId !== foreign.id)).toBe(true);
    expect(JSON.stringify({ items, plan })).not.toContain('TINTO');
  });

  it('tenantScoped: ContentPlan y ContentPlanItem exigen workspaceId concreto', async () => {
    const models = [ContentPlanModel, ContentPlanItemModel] as unknown as Model<
      Record<string, unknown>
    >[];
    const workspaceId = new mongoose.Types.ObjectId();
    for (const model of models) {
      await expect(model.find({})).rejects.toBeInstanceOf(TenantScopeError);
      await expect(model.find({ workspaceId: { $ne: null } })).rejects.toBeInstanceOf(
        TenantScopeError,
      );
      await expect(model.updateMany({}, { status: 'archived' })).rejects.toBeInstanceOf(
        TenantScopeError,
      );
      await expect(model.aggregate([{ $match: {} }])).rejects.toBeInstanceOf(TenantScopeError);
      await expect(model.find({ workspaceId })).resolves.toEqual([]);
    }
    expect((await ContentPlanModel.collection.indexes()).map((index) => index.key)).toEqual([
      { _id: 1 },
      { workspaceId: 1, status: 1, createdAt: -1 },
    ]);
    expect((await ContentPlanItemModel.collection.indexes()).map((index) => index.key)).toEqual([
      { _id: 1 },
      { workspaceId: 1, contentPlanId: 1, position: 1 },
    ]);
  });
});
