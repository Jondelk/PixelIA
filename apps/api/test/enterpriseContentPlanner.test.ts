import {
  AcceptContentPlanItemResponseSchema,
  CampaignGenerationResponseSchema,
  ContentPlanListResponseSchema,
  ContentPlanResponseSchema,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { CampaignDeliverableModel } from '../src/modules/campaigns/campaignDeliverable.model.js';
import { migrateContentPlanContexts } from '../src/modules/content-plans/contentPlan.migration.js';
import { ContentPlanModel } from '../src/modules/content-plans/contentPlan.model.js';
import { ContentPlanItemModel } from '../src/modules/content-plans/contentPlanItem.model.js';
import { enterpriseContextBuilder } from '../src/modules/conversations/context/index.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { cafeTinto, inventia } from './fixtures/onboarding.js';
import { creativeDirector } from './fixtures/personal.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { createContent, createProject, ops } from './support/operations.js';
import { completePersonalOnboarding, createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

const plans = (workspaceId: string) => `/api/workspaces/${workspaceId}/content-plans`;
/** "Crea un plan de contenido de 7 días con 3 publicaciones para Instagram." */
const sevenDays = {
  startDate: '2026-10-19',
  endDate: '2026-10-25',
  frequency: 3,
  platforms: ['instagram'],
  tzOffset: 300,
};

async function brand(session: Session, name: string, answers: typeof cafeTinto) {
  const companyId = await createCompany(session, name);
  await completeOnboarding(session, companyId, answers);
  return { companyId, workspaceId: (await workspaceIdOf(companyId)).toString() };
}

async function campaignOf(session: Session, workspaceId: string, body: object) {
  const res = await session.agent
    .post(`/api/workspaces/${workspaceId}/campaigns/generate`)
    .send(body)
    .expect(201);
  return CampaignGenerationResponseSchema.parse(res.body);
}

const launch = {
  name: 'Lanzamiento TINTO 500 g',
  objective: 'Presentar la nueva presentación de 500 g y reforzar el origen.',
  campaignType: 'launch',
  productOrService: 'Café TINTO 500 g',
  channels: ['Instagram', 'Punto de venta'],
};

async function generate(session: Session, workspaceId: string, body: object = sevenDays) {
  const res = await session.agent
    .post(`${plans(workspaceId)}/generate`)
    .send(body)
    .expect(201);
  return ContentPlanResponseSchema.parse(res.body);
}

describe('Enterprise sin campaña: plan editorial desde el BrandDNA', () => {
  it('contexto enterprise, BrandDNA y propuestas con porqué de marca; no finge campaña', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { plan, items } = await generate(jhon, tinto.workspaceId);
    expect(plan).toMatchObject({
      contextType: 'enterprise',
      generatedBy: 'pixel',
      brandDnaVersion: 1,
      personalDnaVersion: null,
      campaignId: null,
      campaignStrategyVersion: null,
      campaignAlignment: null,
      status: 'draft',
    });
    expect(plan.editorialObjective).toBeTruthy();
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item).toMatchObject({ status: 'proposed', platform: 'instagram', campaignId: null });
      expect(item.brandRationale).toMatch(/Café Tinto|marca/);
      expect(item.strategicRole).toBeTruthy();
    }
  });

  it('el plan manual también funciona en Enterprise (contexto enterprise, sin IA)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const res = await jhon.agent
      .post(plans(tinto.workspaceId))
      .send({ name: 'Octubre', startDate: '2026-10-19', endDate: '2026-10-25' })
      .expect(201);
    expect(res.body.plan).toMatchObject({
      contextType: 'enterprise',
      generatedBy: 'manual',
      brandDnaVersion: null,
    });
  });
});

describe('Enterprise con campaña', () => {
  it('guarda la versión EXACTA de la estrategia y no toca la campaña ni sus piezas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const c = await campaignOf(jhon, tinto.workspaceId, launch);
    const before = await CampaignDeliverableModel.find({
      workspaceId: new Types.ObjectId(tinto.workspaceId),
      campaignId: new Types.ObjectId(c.campaign.id),
    }).lean();

    const { plan, items } = await generate(jhon, tinto.workspaceId, {
      ...sevenDays,
      endDate: '2026-11-01',
      frequency: 4,
      campaignId: c.campaign.id,
    });
    expect(plan).toMatchObject({
      contextType: 'enterprise',
      campaignId: c.campaign.id,
      campaignStrategyVersion: 1,
      brandDnaVersion: 1,
    });
    expect(plan.campaignAlignment).toMatch(new RegExp(c.strategy.keyMessage.slice(0, 20)));
    expect(plan.pillars.map((p) => p.name)).toEqual(c.strategy.contentPillars.map((p) => p.name));
    expect(items.every((item) => item.campaignId === c.campaign.id)).toBe(true);
    const deliverableIds = new Set(c.deliverables.map((d) => d.id));
    const linked = items.filter((item) => item.campaignDeliverableId);
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.every((item) => deliverableIds.has(item.campaignDeliverableId!))).toBe(true);

    // Generar un plan no cambia el estado de ninguna pieza de la campaña.
    const after = await CampaignDeliverableModel.find({
      workspaceId: new Types.ObjectId(tinto.workspaceId),
      campaignId: new Types.ObjectId(c.campaign.id),
    }).lean();
    expect(after.map((d) => d.status)).toEqual(before.map((d) => d.status));

    // Regenerar la estrategia (v2) no reescribe el plan histórico: sigue en v1.
    await jhon.agent
      .post(`/api/workspaces/${tinto.workspaceId}/campaigns/${c.campaign.id}/strategy/generate`)
      .send({})
      .expect(201);
    const stored = await jhon.agent.get(`${plans(tinto.workspaceId)}/${plan.id}`).expect(200);
    expect(stored.body.plan.campaignStrategyVersion).toBe(1);
    expect(stored.body.items).toHaveLength(items.length);

    // Los planes de la campaña se listan por campaignId.
    const list = ContentPlanListResponseSchema.parse(
      (await jhon.agent.get(`${plans(tinto.workspaceId)}?campaignId=${c.campaign.id}`)).body,
    );
    expect(list.plans.map((p) => p.id)).toEqual([plan.id]);
  });

  it('Campaña A y campaña B de TINTO, mismo pedido: planes distintos', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const a = await campaignOf(jhon, tinto.workspaceId, launch);
    const b = await campaignOf(jhon, tinto.workspaceId, {
      name: 'Educación sobre origen',
      objective: 'Explicar de dónde viene cada lote y por qué importa.',
      campaignType: 'education',
      channels: ['Instagram'],
    });
    const planA = await generate(jhon, tinto.workspaceId, {
      ...sevenDays,
      campaignId: a.campaign.id,
    });
    const planB = await generate(jhon, tinto.workspaceId, {
      ...sevenDays,
      campaignId: b.campaign.id,
    });
    expect(planA.plan.strategySummary).not.toBe(planB.plan.strategySummary);
    expect(planA.plan.pillars.map((p) => p.name)).not.toEqual(
      planB.plan.pillars.map((p) => p.name),
    );
    expect(planA.items.map((i) => i.title)).not.toEqual(planB.items.map((i) => i.title));
  });

  it('varios planes seguidos de la misma campaña (como la UI: sin plataformas) no repiten títulos', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { campaign } = await campaignOf(jhon, tinto.workspaceId, launch);
    // El formulario no envía plataformas: salen de los canales de la campaña (Instagram).
    const request = { startDate: '2026-10-12', endDate: '2026-10-25', tzOffset: 300 };
    const titles: string[] = [];
    for (let round = 0; round < 3; round++) {
      const { plan, items } = await generate(jhon, tinto.workspaceId, {
        ...request,
        campaignId: campaign.id,
      });
      expect(plan.campaignId).toBe(campaign.id);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.platform === 'instagram')).toBe(true);
      titles.push(...items.map((item) => item.title));
    }
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('si el historial agota las ideas, responde 502 "no fundamentado", nunca 503 "no disponible"', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { campaign } = await campaignOf(jhon, tinto.workspaceId, launch);
    const statuses: number[] = [];
    for (let round = 0; round < 10 && !statuses.includes(502); round++) {
      const res = await jhon.agent
        .post(`${plans(tinto.workspaceId)}/generate`)
        .send({ ...sevenDays, frequency: 7, campaignId: campaign.id });
      statuses.push(res.status);
      if (res.status !== 201) {
        expect(res.status).toBe(502);
        expect(res.body.error.details.reason).toBe('content_plan_generation_failed');
      }
    }
    expect(statuses[0]).toBe(201);
    expect(statuses).not.toContain(503);
  });

  it('una pieza de campaña ya en Contenido no vuelve como pendiente idéntica', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const c = await campaignOf(jhon, tinto.workspaceId, launch);
    const reel = c.deliverables.find((d) => d.type === 'content' && /Reel/.test(d.title))!;
    await jhon.agent
      .post(
        `/api/workspaces/${tinto.workspaceId}/campaigns/${c.campaign.id}/deliverables/${reel.id}/accept`,
      )
      .expect(201);
    const { items } = await generate(jhon, tinto.workspaceId, {
      ...sevenDays,
      campaignId: c.campaign.id,
    });
    expect(items.some((item) => item.campaignDeliverableId === reel.id)).toBe(false);
    expect(items.some((item) => item.title === reel.title)).toBe(false);
  });

  it('campaña sin estrategia → 409 campaign_strategy_missing', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const manual = await jhon.agent
      .post(`/api/workspaces/${tinto.workspaceId}/campaigns`)
      .send({ name: 'Manual', objective: 'Sin estrategia' })
      .expect(201);
    const res = await jhon.agent
      .post(`${plans(tinto.workspaceId)}/generate`)
      .send({ ...sevenDays, campaignId: manual.body.campaign.id })
      .expect(409);
    expect(res.body.error.details.reason).toBe('campaign_strategy_missing');
  });

  it('sin plataformas y con una campaña solo de punto de venta → 400 content_platforms_missing', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const c = await campaignOf(jhon, tinto.workspaceId, {
      ...launch,
      channels: ['Punto de venta'],
    });
    const { platforms: _platforms, ...noPlatforms } = sevenDays;
    const res = await jhon.agent
      .post(`${plans(tinto.workspaceId)}/generate`)
      .send({ ...noPlatforms, campaignId: c.campaign.id })
      .expect(400);
    expect(res.body.error.details.reason).toBe('content_platforms_missing');
  });
});

describe('Historial: no repite contenido reciente', () => {
  it('una idea ya en Contenido (mismo título y hook) no se vuelve a proponer', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const first = await generate(jhon, tinto.workspaceId);
    const repeated = first.items[0]!;
    await createContent(jhon, tinto.workspaceId, {
      title: repeated.title,
      hook: repeated.hook,
      status: 'published',
    });
    const second = await generate(jhon, tinto.workspaceId);
    expect(second.items.map((item) => item.title)).not.toContain(repeated.title);
  });
});

describe('Aceptar: un solo ContentItem, con sus relaciones', () => {
  async function setup() {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const c = await campaignOf(jhon, tinto.workspaceId, launch);
    const project = await createProject(jhon, tinto.workspaceId, {
      name: 'Sesión de fotos en la finca',
      campaignId: c.campaign.id,
    });
    const { plan, items } = await generate(jhon, tinto.workspaceId, {
      ...sevenDays,
      frequency: 7,
      campaignId: c.campaign.id,
    });
    const url = (itemId: string) => `${plans(tinto.workspaceId)}/${plan.id}/items/${itemId}`;
    return { jhon, tinto, project, c, plan, items, url };
  }

  it('crea exactamente un ContentItem (source pixel) con campaña y proyecto; aceptar otra vez no duplica', async () => {
    const { jhon, tinto, project, c, items, url } = await setup();
    const fromProject = items.find((item) => item.projectId === project.id);
    expect(fromProject).toBeDefined();
    const first = AcceptContentPlanItemResponseSchema.parse(
      (await jhon.agent.post(`${url(fromProject!.id)}/accept`).expect(201)).body,
    );
    expect(first.contentItem).toMatchObject({
      source: 'pixel',
      status: 'idea',
      campaignId: c.campaign.id,
      projectId: project.id,
      platform: 'instagram',
      title: fromProject!.title,
    });
    const again = await jhon.agent.post(`${url(fromProject!.id)}/accept`).expect(200);
    expect(again.body.contentItem.id).toBe(first.contentItem!.id);
    const content = await jhon.agent.get(
      `${ops(tinto.workspaceId).content}?campaignId=${c.campaign.id}`,
    );
    expect(content.body.contentItems.map((i: { id: string }) => i.id)).toEqual([
      first.contentItem!.id,
    ]);
  });

  it('dos aceptaciones simultáneas crean un solo ContentItem', async () => {
    const { jhon, tinto, items, url } = await setup();
    const item = items[0]!;
    const results = await Promise.all([
      jhon.agent.post(`${url(item.id)}/accept`),
      jhon.agent.post(`${url(item.id)}/accept`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    const content = await jhon.agent.get(
      `${ops(tinto.workspaceId).content}?search=${encodeURIComponent(item.title.slice(0, 20))}`,
    );
    expect(content.body.total).toBe(1);
  });

  it('aceptar y rechazar a la vez: nunca "rechazada" con su ContentItem creado', async () => {
    const { jhon, tinto, items, url, plan } = await setup();
    for (const item of items.slice(0, 4)) {
      const [accept, reject] = await Promise.all([
        jhon.agent.post(`${url(item.id)}/accept`),
        jhon.agent.post(`${url(item.id)}/reject`).send({}),
      ]);
      const stored = await ContentPlanItemModel.findOne({
        _id: new Types.ObjectId(item.id),
        workspaceId: new Types.ObjectId(tinto.workspaceId),
      });
      if (stored!.convertedContentItemId) {
        expect(stored!.status).toBe('converted');
        expect([200, 201]).toContain(accept.status);
        expect([200, 409]).toContain(reject.status);
      } else {
        expect(stored!.status).toBe('rejected');
      }
    }
    const converted = await ContentPlanItemModel.countDocuments({
      workspaceId: new Types.ObjectId(tinto.workspaceId),
      contentPlanId: new Types.ObjectId(plan.id),
      status: 'rejected',
      convertedContentItemId: { $ne: null },
    });
    expect(converted).toBe(0);
  });

  it('editar antes de aceptar (objetivo y ángulo); convertida → 409 al editar o rechazar', async () => {
    const { jhon, items, url } = await setup();
    const item = items[0]!;
    const edited = await jhon.agent
      .patch(url(item.id))
      .send({ objective: 'Mostrar el origen del producto', suggestedAngle: 'Plano cenital' })
      .expect(200);
    expect(edited.body.item).toMatchObject({
      objective: 'Mostrar el origen del producto',
      suggestedAngle: 'Plano cenital',
    });
    await jhon.agent.post(`${url(item.id)}/accept`).expect(201);
    await jhon.agent.patch(url(item.id)).send({ title: 'Tarde' }).expect(409);
    await jhon.agent
      .post(`${url(item.id)}/reject`)
      .send({})
      .expect(409);
  });
});

describe('Aislamiento: TINTO e INVENTIA del mismo usuario', () => {
  it('TINTO no puede planificar con una campaña de INVENTIA (sin revelar que existe)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const lab = await brand(jhon, 'INVENTIA', inventia);
    const labCampaign = await campaignOf(jhon, lab.workspaceId, {
      name: 'Prototipado',
      objective: 'Lanzar el servicio de prototipado.',
      channels: ['Instagram'],
    });
    const res = await jhon.agent
      .post(`${plans(tinto.workspaceId)}/generate`)
      .send({ ...sevenDays, campaignId: labCampaign.campaign.id })
      .expect(400);
    expect(res.body.error.details).toEqual([
      { path: 'campaignId', message: 'Campaña no encontrada' },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/INVENTIA|Prototipado/);
    expect(
      await ContentPlanModel.countDocuments({ workspaceId: new Types.ObjectId(tinto.workspaceId) }),
    ).toBe(0);

    // Planes y propuestas de INVENTIA no existen desde TINTO.
    const labPlan = await generate(jhon, lab.workspaceId);
    await jhon.agent.get(`${plans(tinto.workspaceId)}/${labPlan.plan.id}`).expect(404);
    await jhon.agent
      .post(`${plans(tinto.workspaceId)}/${labPlan.plan.id}/items/${labPlan.items[0]!.id}/accept`)
      .expect(404);
    const filtered = await jhon.agent
      .get(`${plans(tinto.workspaceId)}?campaignId=${labCampaign.campaign.id}`)
      .expect(200);
    expect(filtered.body.total).toBe(0);
    // Y el plan de INVENTIA no lleva rastro de TINTO.
    expect(JSON.stringify(labPlan)).not.toMatch(/Huila|Tinto|café|finca/i);
  });

  it('los proyectos de un plan son siempre del mismo workspace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const lab = await brand(jhon, 'INVENTIA', inventia);
    const labProject = await createProject(jhon, lab.workspaceId, {
      name: 'Prototipo estación solar',
    });
    const { items } = await generate(jhon, tinto.workspaceId, { ...sevenDays, frequency: 7 });
    expect(items.some((item) => item.projectId === labProject.id)).toBe(false);
    const labPlan = await generate(jhon, lab.workspaceId, { ...sevenDays, frequency: 7 });
    expect(labPlan.items.some((item) => item.projectId === labProject.id)).toBe(true);
    expect(labPlan.items.find((item) => item.projectId)?.title).toMatch(
      /prototipo estación solar/i,
    );
  });
});

describe('Personal no cambia', () => {
  it('genera y acepta como siempre; nunca usa BrandDNA ni campañas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const personal = await createPersonalWorkspace(jhon);
    await completePersonalOnboarding(jhon, personal, creativeDirector);
    const { plan, items } = await generate(jhon, personal, {
      startDate: '2026-10-12',
      endDate: '2026-10-25',
      frequency: 3,
      platforms: ['instagram'],
      tzOffset: 300,
    });
    expect(plan).toMatchObject({
      contextType: 'personal',
      personalDnaVersion: 1,
      brandDnaVersion: null,
      campaignId: null,
      campaignStrategyVersion: null,
      editorialObjective: null,
    });
    expect(items.every((item) => item.brandRationale === null && item.campaignId === null)).toBe(
      true,
    );
    const accepted = await jhon.agent
      .post(`${plans(personal)}/${plan.id}/items/${items[0]!.id}/accept`)
      .expect(201);
    expect(accepted.body.contentItem).toMatchObject({ source: 'pixel', campaignId: null });
    // Un Pixel Personal no puede pedir una campaña.
    const res = await jhon.agent
      .post(`${plans(personal)}/generate`)
      .send({ ...sevenDays, campaignId: '64b7f0c2a1b2c3d4e5f60001' })
      .expect(400);
    expect(res.body.error.details[0].path).toBe('campaignId');
  });
});

describe('Migración de contextType (planes anteriores al Prompt 14)', () => {
  it('dry-run cuenta, la real asigna el tipo del workspace, la segunda no hace nada', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const personal = await createPersonalWorkspace(jhon);
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const legacy = (workspaceId: string) => ({
      workspaceId: new Types.ObjectId(workspaceId),
      name: 'Plan anterior',
      objective: null,
      period: { startDate: '2026-09-01', endDate: '2026-09-07' },
      strategySummary: 'Texto generado antes',
      pillars: [],
      targetAudience: [],
      platforms: [],
      status: 'draft',
      generatedBy: 'manual',
      personalDnaVersion: null,
      generation: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await ContentPlanModel.collection.insertMany([
      legacy(personal),
      legacy(tinto.workspaceId),
      legacy(new Types.ObjectId().toString()), // workspace inexistente: no se toca
    ]);

    // Antes de migrar, la lectura ya devuelve el tipo correcto (el de su workspace).
    const before = await jhon.agent.get(plans(tinto.workspaceId)).expect(200);
    expect(before.body.plans[0].contextType).toBe('enterprise');

    const dry = await migrateContentPlanContexts({ dryRun: true });
    expect(dry).toEqual({
      pending: 3,
      migrated: 0,
      orphaned: 1,
      byType: { personal: 1, enterprise: 1 },
    });
    expect(
      await ContentPlanModel.collection.countDocuments({ contextType: { $exists: true } }),
    ).toBe(0);

    const real = await migrateContentPlanContexts();
    expect(real).toMatchObject({
      migrated: 2,
      orphaned: 1,
      byType: { personal: 1, enterprise: 1 },
    });
    const stored = await ContentPlanModel.collection
      .find(
        { contextType: { $exists: true } },
        { projection: { contextType: 1, strategySummary: 1 } },
      )
      .toArray();
    expect(stored.map((doc) => doc.contextType).sort()).toEqual(['enterprise', 'personal']);
    expect(stored.every((doc) => doc.strategySummary === 'Texto generado antes')).toBe(true);

    const again = await migrateContentPlanContexts();
    expect(again).toMatchObject({ pending: 1, migrated: 0, orphaned: 1 });
  });
});

describe('Chat Enterprise: planes en el estado operativo (solo conteos)', () => {
  it('conoce cuántos planes activos hay, sin cargar sus propuestas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { plan, items } = await generate(jhon, tinto.workspaceId);
    await jhon.agent
      .patch(`${plans(tinto.workspaceId)}/${plan.id}`)
      .send({ status: 'active' })
      .expect(200);
    const workspace = await WorkspaceModel.findOne({
      _id: tinto.workspaceId,
      ownerId: jhon.user.id,
    });
    const context = await enterpriseContextBuilder.build({
      workspace: workspace!,
      history: [],
      userMessage: '¿Cómo vamos?',
      historyLimit: 20,
      defaultTimezone: 'America/Bogota',
    });
    if (context.status !== 'ready') throw new Error('contexto no listo');
    expect(context.context.system).toContain('- Planes de contenido activos: 1');
    for (const item of items) expect(context.context.system).not.toContain(item.title);
  });
});
