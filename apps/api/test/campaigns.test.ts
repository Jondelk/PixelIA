import {
  AcceptCampaignDeliverableResponseSchema,
  CampaignGenerationResponseSchema,
  CampaignListResponseSchema,
  CampaignResponseSchema,
  CampaignStrategyResponseSchema,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { AIProviderError, type AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { CampaignModel } from '../src/modules/campaigns/campaign.model.js';
import { CampaignDeliverableModel } from '../src/modules/campaigns/campaignDeliverable.model.js';
import { CampaignStrategyModel } from '../src/modules/campaigns/campaignStrategy.model.js';
import { enterpriseContextBuilder } from '../src/modules/conversations/context/index.js';
import { ContentItemModel } from '../src/modules/operations/contentItem.model.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { cafeTinto, inventia } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { createProject, ops } from './support/operations.js';
import { createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();

/** Demo por defecto; los tests de indisponibilidad cambian `failing`. */
let failing = false;
const demo = new DemoProvider();
const provider: AIProvider = {
  name: 'switch',
  model: demo.model,
  mode: 'demo',
  generateText: (input) => demo.generateText(input),
  async generateStructuredOutput(input) {
    if (failing) throw new AIProviderError('unavailable', 'proveedor caído');
    return demo.generateStructuredOutput(input);
  },
};
const app = buildTestApp(provider);

type Session = Awaited<ReturnType<typeof registerUser>>;

const campaigns = (workspaceId: string) => `/api/workspaces/${workspaceId}/campaigns`;

async function enterprise(session: Session, name: string, answers?: typeof cafeTinto) {
  const companyId = await createCompany(session, name);
  if (answers) await completeOnboarding(session, companyId, answers);
  return { companyId, workspaceId: (await workspaceIdOf(companyId)).toString() };
}

const launchBrief = {
  name: 'Lanzamiento TINTO 500 g',
  objective: 'Presentar la nueva presentación de 500 g y reforzar el origen.',
  campaignType: 'launch',
  productOrService: 'Café TINTO 500 g',
  channels: ['Instagram', 'Punto de venta'],
  startDate: '2026-11-01T12:00:00.000Z',
  endDate: '2026-11-30T12:00:00.000Z',
};

async function generate(session: Session, workspaceId: string, body: object = launchBrief) {
  const res = await session.agent
    .post(`${campaigns(workspaceId)}/generate`)
    .send(body)
    .expect(201);
  return CampaignGenerationResponseSchema.parse(res.body);
}

describe('Campañas manuales (sin IA)', () => {
  it('crear con nombre y objetivo, listar, editar, archivar y filtrar', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspaceId } = await enterprise(jhon, 'TINTO');
    const url = campaigns(workspaceId);

    const created = CampaignResponseSchema.parse(
      (
        await jhon.agent
          .post(url)
          .send({ name: 'Navidad en la finca', objective: 'Vender más en diciembre' })
          .expect(201)
      ).body,
    ).campaign;
    expect(created).toMatchObject({
      status: 'draft',
      generatedBy: 'manual',
      currentStrategyVersion: null,
      brandDnaVersion: null,
      workspaceId,
      stats: { deliverables: 0, projects: 0, contentItems: 0 },
    });

    await jhon.agent.patch(`${url}/${created.id}`).send({ status: 'active' }).expect(200);
    const badDates = await jhon.agent
      .patch(`${url}/${created.id}`)
      .send({ startDate: '2026-12-10T12:00:00.000Z', endDate: '2026-12-01T12:00:00.000Z' })
      .expect(400);
    expect(badDates.body.error.code).toBe('VALIDATION_ERROR');
    const list = CampaignListResponseSchema.parse((await jhon.agent.get(url).expect(200)).body);
    expect(list.campaigns.map((c) => [c.name, c.status])).toEqual([
      ['Navidad en la finca', 'active'],
    ]);

    const archived = await jhon.agent.delete(`${url}/${created.id}`).expect(200);
    expect(archived.body.campaign.status).toBe('archived');
    expect((await jhon.agent.get(url)).body.total).toBe(0);
    expect((await jhon.agent.get(`${url}?status=archived`)).body.total).toBe(1);
    // Archivar no borra nada.
    expect(
      await CampaignModel.countDocuments({
        workspaceId: (await WorkspaceModel.findOne({ _id: workspaceId, ownerId: jhon.user.id }))!
          ._id,
      }),
    ).toBe(1);
  });

  it('valida en el borde: objetivo obligatorio y cuerpo estricto', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspaceId } = await enterprise(jhon, 'TINTO');
    await jhon.agent.post(campaigns(workspaceId)).send({ name: 'Sin objetivo' }).expect(400);
    await jhon.agent
      .post(campaigns(workspaceId))
      .send({ name: 'X', objective: 'Y', workspaceId, generatedBy: 'pixel' })
      .expect(400);
  });
});

describe('Feature gating: Campaigns solo en Enterprise', () => {
  it('Personal recibe 400 feature_not_available y no puede vincular campaignId', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const personal = await createPersonalWorkspace(jhon);
    for (const request of [
      () => jhon.agent.get(campaigns(personal)),
      () => jhon.agent.post(campaigns(personal)).send({ name: 'X', objective: 'Y' }),
      () => jhon.agent.post(`${campaigns(personal)}/generate`).send({ objective: 'Y' }),
    ]) {
      const res = await request();
      expect(res.status).toBe(400);
      expect(res.body.error.details).toMatchObject({
        reason: 'feature_not_available',
        feature: 'campaigns',
        expected: 'enterprise',
      });
    }
    const res = await jhon.agent
      .post(ops(personal).projects)
      .send({ name: 'X', campaignId: '64b7f0c2a1b2c3d4e5f60001' })
      .expect(400);
    expect(res.body.error.details).toEqual([
      { path: 'campaignId', message: 'Campaña no encontrada' },
    ]);
  });
});

describe('Aislamiento: TINTO e INVENTIA del mismo usuario', () => {
  it('la campaña de TINTO no existe desde INVENTIA (404 en todas sus rutas)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await enterprise(jhon, 'Café Tinto', cafeTinto);
    const lab = await enterprise(jhon, 'INVENTIA', inventia);
    const { campaign, deliverables } = await generate(jhon, tinto.workspaceId);
    const deliverable = deliverables[0]!.id;
    const foreign = `${campaigns(lab.workspaceId)}/${campaign.id}`;

    for (const request of [
      () => jhon.agent.get(foreign),
      () => jhon.agent.patch(foreign).send({ name: 'Cruzada' }),
      () => jhon.agent.delete(foreign),
      () => jhon.agent.get(`${foreign}/strategy`),
      () => jhon.agent.post(`${foreign}/strategy/generate`).send({}),
      () => jhon.agent.get(`${foreign}/deliverables`),
      () => jhon.agent.patch(`${foreign}/deliverables/${deliverable}`).send({ title: 'X' }),
      () => jhon.agent.post(`${foreign}/deliverables/${deliverable}/accept`),
      () => jhon.agent.post(`${foreign}/deliverables/${deliverable}/reject`),
    ]) {
      const res = await request();
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/TINTO|Tinto|Huila/);
    }
    expect((await jhon.agent.get(campaigns(lab.workspaceId))).body.total).toBe(0);
    // Ni Projects ni ContentItems de INVENTIA pueden apuntar a una campaña de TINTO.
    const labProject = await createProject(jhon, lab.workspaceId, {
      name: 'Presentación laboratorio',
    });
    await jhon.agent
      .patch(`${ops(lab.workspaceId).projects}/${labProject.id}`)
      .send({ campaignId: campaign.id })
      .expect(400);
    await jhon.agent
      .post(ops(lab.workspaceId).content)
      .send({ title: 'Cruzado', campaignId: campaign.id })
      .expect(400);
    // Y nada cambió en INVENTIA: su proyecto sigue sin campaña.
    const labProjects = await jhon.agent.get(ops(lab.workspaceId).projects).expect(200);
    expect(
      labProjects.body.projects.map((p: { campaignId: string | null }) => p.campaignId),
    ).toEqual([null]);
  });

  it('otro usuario recibe 404', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ana = await registerUser(app, 'Ana');
    const tinto = await enterprise(jhon, 'Café Tinto', cafeTinto);
    const { campaign } = await generate(jhon, tinto.workspaceId);
    await ana.agent.get(`${campaigns(tinto.workspaceId)}/${campaign.id}`).expect(404);
  });
});

describe('Generar con Pixel', () => {
  it('sin BrandDNA: 409 brand_dna_missing y no se guarda nada', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspaceId } = await enterprise(jhon, 'Sin ADN');
    const res = await jhon.agent
      .post(`${campaigns(workspaceId)}/generate`)
      .send({ objective: 'Lanzar algo' })
      .expect(409);
    expect(res.body.error.details.reason).toBe('brand_dna_missing');
    expect(await CampaignModel.collection.countDocuments()).toBe(0);
  });

  it('sin IA disponible: 503 sin estrategia falsa; la campaña manual sigue funcionando', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspaceId } = await enterprise(jhon, 'Café Tinto', cafeTinto);
    failing = true;
    try {
      const res = await jhon.agent
        .post(`${campaigns(workspaceId)}/generate`)
        .send(launchBrief)
        .expect(503);
      expect(res.body.error.details.reason).toBe('campaign_generation_unavailable');
      expect(await CampaignModel.collection.countDocuments()).toBe(0);
      expect(await CampaignStrategyModel.collection.countDocuments()).toBe(0);
      await jhon.agent
        .post(campaigns(workspaceId))
        .send({ name: 'Manual', objective: 'Sin IA' })
        .expect(201);
    } finally {
      failing = false;
    }
  });

  it('crea la campaña con su estrategia v1 y sus piezas propuestas, desde el ADN de TINTO', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspaceId } = await enterprise(jhon, 'Café Tinto', cafeTinto);
    const { campaign, strategy, deliverables } = await generate(jhon, workspaceId);

    expect(campaign).toMatchObject({
      name: 'Lanzamiento TINTO 500 g',
      status: 'draft',
      generatedBy: 'pixel',
      currentStrategyVersion: 1,
      brandDnaVersion: 1,
      keyMessage: strategy.keyMessage,
      stats: { deliverables: deliverables.length, proposedDeliverables: deliverables.length },
    });
    expect(strategy).toMatchObject({
      version: 1,
      brandDnaVersion: 1,
      channels: ['Instagram', 'Punto de venta'],
    });
    expect(strategy.generation.mode).toBe('demo');
    expect(strategy.insight.length).toBeGreaterThan(10);
    expect(strategy.visualDirection.colors.join(' ')).toMatch(/Tostado/);
    expect(strategy.visualDirection.avoid).toEqual(expect.arrayContaining(['Neón']));
    expect(strategy.rationale).toMatch(/ADN de Café Tinto/);
    expect(deliverables.every((d) => d.status === 'proposed' && d.strategyVersion === 1)).toBe(
      true,
    );
    expect(deliverables.map((d) => d.type)).toEqual(
      expect.arrayContaining(['content', 'design', 'print']),
    );
  });

  it('mismo objetivo genérico, TINTO e INVENTIA: campañas claramente distintas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await enterprise(jhon, 'Café Tinto', cafeTinto);
    const lab = await enterprise(jhon, 'INVENTIA', inventia);
    const body = { objective: 'Necesitamos lanzar un nuevo producto.', channels: ['Instagram'] };
    const a = await generate(jhon, tinto.workspaceId, body);
    const b = await generate(jhon, lab.workspaceId, body);
    expect(a.strategy.concept).not.toBe(b.strategy.concept);
    expect(a.strategy.keyMessage).not.toBe(b.strategy.keyMessage);
    expect(a.strategy.tone).not.toEqual(b.strategy.tone);
    expect(a.strategy.visualDirection.colors).not.toEqual(b.strategy.visualDirection.colors);
    expect(a.deliverables.map((d) => d.title)).not.toEqual(b.deliverables.map((d) => d.title));
    expect(JSON.stringify(b)).not.toMatch(/Huila|Tinto|finca/);
    expect(JSON.stringify(a)).not.toMatch(/INVENTIA|filamento|prototipo/i);
  });

  it('regenerar crea la v2 y conserva la v1; las piezas por defecto son las de la vigente', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspaceId } = await enterprise(jhon, 'Café Tinto', cafeTinto);
    const v1 = await generate(jhon, workspaceId);
    const url = `${campaigns(workspaceId)}/${v1.campaign.id}`;
    // Una pieza de la v1 aceptada sigue visible tras regenerar (ya es trabajo real).
    const reel = v1.deliverables.find((d) => d.type === 'content')!;
    await jhon.agent.post(`${url}/deliverables/${reel.id}/accept`).expect(201);

    const v2 = CampaignGenerationResponseSchema.parse(
      (await jhon.agent.post(`${url}/strategy/generate`).send({}).expect(201)).body,
    );
    expect(v2.strategy.version).toBe(2);
    expect(v2.strategy.concept).not.toBe(v1.strategy.concept);
    expect(v2.campaign.currentStrategyVersion).toBe(2);

    const current = CampaignStrategyResponseSchema.parse(
      (await jhon.agent.get(`${url}/strategy`).expect(200)).body,
    );
    expect(current.strategy?.version).toBe(2);
    expect(current.versions).toEqual([1, 2]);
    const old = CampaignStrategyResponseSchema.parse(
      (await jhon.agent.get(`${url}/strategy?version=1`).expect(200)).body,
    );
    expect(old.strategy).toMatchObject({ version: 1, concept: v1.strategy.concept });
    await jhon.agent.get(`${url}/strategy?version=9`).expect(404);

    const listed = (await jhon.agent.get(`${url}/deliverables`).expect(200)).body.deliverables as {
      id: string;
      strategyVersion: number;
    }[];
    expect(listed.filter((d) => d.strategyVersion === 2)).toHaveLength(v2.deliverables.length);
    expect(listed.filter((d) => d.strategyVersion === 1).map((d) => d.id)).toEqual([reel.id]);
    const onlyV1 = (await jhon.agent.get(`${url}/deliverables?strategyVersion=1`)).body
      .deliverables;
    expect(onlyV1).toHaveLength(v1.deliverables.length);
  });

  it('regenerar con cambios del brief los guarda en la campaña', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { workspaceId } = await enterprise(jhon, 'Café Tinto', cafeTinto);
    const { campaign } = await generate(jhon, workspaceId);
    const res = await jhon.agent
      .post(`${campaigns(workspaceId)}/${campaign.id}/strategy/generate`)
      .send({ channels: ['Instagram'] })
      .expect(201);
    expect(res.body.campaign.channels).toEqual(['Instagram']);
    expect(res.body.strategy.channels).toEqual(['Instagram']);
  });
});

describe('Piezas: aceptar, rechazar y editar', () => {
  async function setup() {
    const jhon = await registerUser(app, 'Jhon');
    const { workspaceId } = await enterprise(jhon, 'Café Tinto', cafeTinto);
    const generated = await generate(jhon, workspaceId);
    const url = `${campaigns(workspaceId)}/${generated.campaign.id}`;
    return { jhon, workspaceId, url, ...generated };
  }

  it('una pieza de contenido crea exactamente un ContentItem; aceptar otra vez no duplica', async () => {
    const { jhon, workspaceId, url, campaign, deliverables } = await setup();
    const reel = deliverables.find((d) => d.type === 'content')!;

    const first = AcceptCampaignDeliverableResponseSchema.parse(
      (await jhon.agent.post(`${url}/deliverables/${reel.id}/accept`).expect(201)).body,
    );
    expect(first.created).toBe(true);
    expect(first.project).toBeNull();
    expect(first.contentItem).toMatchObject({
      title: reel.title,
      status: 'idea',
      source: 'pixel',
      campaignId: campaign.id,
      platform: 'instagram',
      format: 'reel',
      workspaceId,
    });
    expect(first.deliverable).toMatchObject({
      status: 'converted',
      convertedContentItemId: first.contentItem!.id,
    });

    const again = AcceptCampaignDeliverableResponseSchema.parse(
      (await jhon.agent.post(`${url}/deliverables/${reel.id}/accept`).expect(200)).body,
    );
    expect(again.created).toBe(false);
    expect(again.contentItem?.id).toBe(first.contentItem!.id);
    expect(
      await ContentItemModel.countDocuments({
        workspaceId: first.contentItem!.workspaceId,
        campaignId: campaign.id,
      }),
    ).toBe(1);

    const linked = await jhon.agent
      .get(`${ops(workspaceId).content}?campaignId=${campaign.id}`)
      .expect(200);
    expect(linked.body.contentItems.map((item: { id: string }) => item.id)).toEqual([
      first.contentItem!.id,
    ]);
  });

  it('dos aceptaciones simultáneas crean un solo recurso', async () => {
    const { jhon, url, deliverables, campaign } = await setup();
    const reel = deliverables.find((d) => d.type === 'content')!;
    const results = await Promise.all([
      jhon.agent.post(`${url}/deliverables/${reel.id}/accept`),
      jhon.agent.post(`${url}/deliverables/${reel.id}/accept`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(
      await ContentItemModel.countDocuments({
        workspaceId: results[0]!.body.deliverable.workspaceId,
        campaignId: campaign.id,
      }),
    ).toBe(1);
  });

  it('una pieza de diseño crea un Project planificado con campaignId (y aparece en la campaña)', async () => {
    const { jhon, workspaceId, url, campaign, deliverables } = await setup();
    const design = deliverables.find((d) => d.type === 'design')!;
    const res = AcceptCampaignDeliverableResponseSchema.parse(
      (await jhon.agent.post(`${url}/deliverables/${design.id}/accept`).expect(201)).body,
    );
    expect(res.contentItem).toBeNull();
    expect(res.project).toMatchObject({
      name: design.title.slice(0, 120),
      status: 'planned',
      campaignId: campaign.id,
      workspaceId,
      startDate: launchBrief.startDate,
      dueDate: launchBrief.endDate,
    });
    const projects = await jhon.agent
      .get(`${ops(workspaceId).projects}?campaignId=${campaign.id}`)
      .expect(200);
    expect(projects.body.projects.map((p: { id: string }) => p.id)).toEqual([res.project!.id]);
    const updated = await jhon.agent.get(url).expect(200);
    expect(updated.body.campaign.stats).toMatchObject({ projects: 1, convertedDeliverables: 1 });
    // Las tareas cuelgan del proyecto: Campaign → Project → Task, sin campaignId en Task.
    await jhon.agent
      .post(ops(workspaceId).tasks)
      .send({ title: 'Bocetos del key visual', projectId: res.project!.id })
      .expect(201);
  });

  it('rechazar no borra; editar antes de aceptar; convertida → 409 al editar o rechazar', async () => {
    const { jhon, url, deliverables } = await setup();
    const [first, second] = deliverables;
    const rejected = await jhon.agent.post(`${url}/deliverables/${first!.id}/reject`).expect(200);
    expect(rejected.body.deliverable.status).toBe('rejected');
    expect(await CampaignDeliverableModel.collection.countDocuments()).toBe(deliverables.length);

    const edited = await jhon.agent
      .patch(`${url}/deliverables/${second!.id}`)
      .send({ title: 'Carrusel de la finca', type: 'content', format: 'Carrusel' })
      .expect(200);
    expect(edited.body.deliverable).toMatchObject({
      title: 'Carrusel de la finca',
      status: 'proposed',
    });

    await jhon.agent.post(`${url}/deliverables/${second!.id}/accept`).expect(201);
    const lateEdit = await jhon.agent
      .patch(`${url}/deliverables/${second!.id}`)
      .send({ title: 'Tarde' })
      .expect(409);
    expect(lateEdit.body.error.details.reason).toBe('campaign_deliverable_converted');
    await jhon.agent.post(`${url}/deliverables/${second!.id}/reject`).expect(409);
    // Una pieza rechazada puede aceptarse después (decisión del creador, no una aprobación formal).
    await jhon.agent.post(`${url}/deliverables/${first!.id}/accept`).expect(201);
  });
});

describe('Resumen operacional y chat Enterprise', () => {
  it('cuenta campañas activas y el chat las conoce (nombre y objetivo) sin inventar otras', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await enterprise(jhon, 'Café Tinto', cafeTinto);
    const lab = await enterprise(jhon, 'INVENTIA', inventia);
    const { campaign } = await generate(jhon, tinto.workspaceId);
    await jhon.agent
      .patch(`${campaigns(tinto.workspaceId)}/${campaign.id}`)
      .send({ status: 'active' })
      .expect(200);
    await jhon.agent
      .post(campaigns(lab.workspaceId))
      .send({ name: 'Servicio de prototipado', objective: 'Lanzar el servicio', status: 'active' })
      .expect(201);

    const summary = await jhon.agent
      .get(`${ops(tinto.workspaceId).summary}?tzOffset=300`)
      .expect(200);
    expect(summary.body.summary.counts.activeCampaigns).toBe(1);

    const workspace = await WorkspaceModel.findOne({
      _id: tinto.workspaceId,
      ownerId: jhon.user.id,
    });
    const context = await enterpriseContextBuilder.build({
      workspace: workspace!,
      history: [],
      userMessage: '¿Qué campañas tenemos activas?',
      historyLimit: 20,
      defaultTimezone: 'America/Bogota',
    });
    if (context.status !== 'ready') throw new Error('contexto no listo');
    expect(context.context.system).toContain('- Campañas activas: 1');
    expect(context.context.system).toContain('«Lanzamiento TINTO 500 g»');
    expect(context.context.system).not.toContain('Servicio de prototipado');
    // Nunca la estrategia completa.
    expect(context.context.system).not.toContain('<campaign_input>');

    const conversation = await jhon.agent
      .post(`/api/workspaces/${tinto.workspaceId}/conversations`)
      .expect(201);
    const send = (content: string) =>
      jhon.agent
        .post(
          `/api/workspaces/${tinto.workspaceId}/conversations/${conversation.body.conversation.id}/messages`,
        )
        .send({ content })
        .expect(201);
    const reply = (await send('¿Qué campañas tenemos activas?')).body.pixelMessage
      .content as string;
    expect(reply).toContain('1 campaña activa: «Lanzamiento TINTO 500 g»');
    const christmas = (await send('¿Cómo va la campaña Navidad?')).body.pixelMessage
      .content as string;
    expect(christmas).not.toMatch(/Navidad/i);
  });

  it('Personal: activeCampaigns = 0 y su resumen no cambia', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const personal = await createPersonalWorkspace(jhon);
    const summary = await jhon.agent.get(ops(personal).summary).expect(200);
    expect(summary.body.summary.counts.activeCampaigns).toBe(0);
  });
});
