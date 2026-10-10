import {
  CampaignGenerationResponseSchema,
  PixelCommandConfirmResponseSchema,
  PixelCommandResponseSchema,
  type PixelCommand,
} from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { CampaignModel } from '../src/modules/campaigns/campaign.model.js';
import { CampaignDeliverableModel } from '../src/modules/campaigns/campaignDeliverable.model.js';
import { ContentPlanModel } from '../src/modules/content-plans/contentPlan.model.js';
import { ContentPlanItemModel } from '../src/modules/content-plans/contentPlanItem.model.js';
import { ContentItemModel } from '../src/modules/operations/contentItem.model.js';
import { ProjectModel } from '../src/modules/operations/project.model.js';
import { TaskModel } from '../src/modules/operations/task.model.js';
import { cafeTinto, inventia } from './fixtures/onboarding.js';
import { creativeDirector } from './fixtures/personal.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { createProject } from './support/operations.js';
import { completePersonalOnboarding, createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;
const commands = (workspaceId: string) => `/api/workspaces/${workspaceId}/pixel/commands`;

async function brand(session: Session, name: string, answers: typeof cafeTinto) {
  const companyId = await createCompany(session, name);
  await completeOnboarding(session, companyId, answers);
  return (await workspaceIdOf(companyId)).toString();
}

async function ask(session: Session, workspaceId: string, request: string, extra: object = {}) {
  const res = await session.agent
    .post(commands(workspaceId))
    .send({ request, tzOffset: 300, ...extra })
    .expect(201);
  return PixelCommandResponseSchema.parse(res.body).command;
}

async function adjust(
  session: Session,
  workspaceId: string,
  command: PixelCommand,
  message: string,
) {
  const res = await session.agent
    .post(`${commands(workspaceId)}/${command.id}/adjust`)
    .send({ message })
    .expect(200);
  return PixelCommandResponseSchema.parse(res.body).command;
}

async function confirm(session: Session, workspaceId: string, command: PixelCommand) {
  const res = await session.agent
    .post(`${commands(workspaceId)}/${command.id}/confirm`)
    .send({ revision: command.plan!.revision })
    .expect(200);
  return PixelCommandConfirmResponseSchema.parse(res.body);
}

/** Todos los recursos de producto, de todos los workspaces (driver nativo). */
async function resourceCounts() {
  const models = {
    campaigns: CampaignModel,
    deliverables: CampaignDeliverableModel,
    plans: ContentPlanModel,
    planItems: ContentPlanItemModel,
    projects: ProjectModel,
    tasks: TaskModel,
    content: ContentItemModel,
  };
  const entries = await Promise.all(
    Object.entries(models).map(async ([key, model]) => [
      key,
      await model.collection.countDocuments(),
    ]),
  );
  return Object.fromEntries(entries) as Record<keyof typeof models, number>;
}

describe('PixelCommand Enterprise: lanzar con una frase', () => {
  it('propone sin crear nada, confirma una vez y crea solo lo del plan', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const before = await resourceCounts();

    const command = await ask(
      jhon,
      tinto,
      'Quiero lanzar TINTO 500 g la próxima semana en Instagram.',
    );
    expect(command.status).toBe('proposed');
    expect(command.intent).toBe('create_campaign');
    expect(command.question).toBeNull();
    expect(command.plan?.steps.map((step) => step.type)).toEqual([
      'generate_campaign',
      'generate_content_plan',
    ]);
    expect(command.plan?.summary).toMatch(/Café Tinto/);
    // Proponer no escribe recursos.
    expect(await resourceCounts()).toEqual(before);

    const { command: done, executed } = await confirm(jhon, tinto, command);
    expect(executed).toBe(true);
    expect(done.status).toBe('completed');
    const after = await resourceCounts();
    expect(after.campaigns - before.campaigns).toBe(1);
    expect(after.plans - before.plans).toBe(1);
    // Solo lo del plan: ni proyectos, ni tareas, ni contenido (las piezas se revisan antes).
    expect(after.projects).toBe(before.projects);
    expect(after.tasks).toBe(before.tasks);
    expect(after.content).toBe(before.content);

    const campaign = await CampaignModel.findOne({ workspaceId: tinto });
    expect(campaign?.name).toBe('Lanzamiento TINTO 500 g');
    expect(campaign?.channels).toEqual(['Instagram']);
    const plan = await ContentPlanModel.findOne({ workspaceId: tinto });
    expect(plan?.campaignId?.toString()).toBe(campaign?._id.toString());
    expect(done.plan?.steps.every((step) => step.status === 'done')).toBe(true);

    // Confirmar otra vez no duplica nada.
    const again = await confirm(jhon, tinto, command);
    expect(again.executed).toBe(false);
    expect(await resourceCounts()).toEqual(after);
  });

  it('dos confirmaciones simultáneas ejecutan una sola vez', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = await ask(jhon, tinto, 'Quiero una campaña de Amor y Amistad para TINTO.');
    expect(command.status).toBe('proposed');
    const [a, b] = await Promise.all([
      confirm(jhon, tinto, command),
      confirm(jhon, tinto, command),
    ]);
    expect([a.executed, b.executed].sort()).toEqual([false, true]);
    expect(await CampaignModel.countDocuments({ workspaceId: tinto })).toBe(1);
  });

  it('"Haz una campaña" no pregunta el tono: el ADN ya lo sabe', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = await ask(jhon, tinto, 'Haz una campaña');
    expect(command.status).toBe('needs_information');
    expect(command.question).not.toMatch(/tono|color|personalidad|audiencia|arquetipo/i);
  });

  it('"Quiero lanzar el nuevo producto": una pregunta; la respuesta lleva a la propuesta', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = await ask(jhon, tinto, 'Quiero lanzar el nuevo producto.');
    expect(command.status).toBe('needs_information');
    expect(command.question).toBe('¿Qué producto o servicio vamos a lanzar?');
    expect(command.plan).toBeNull();
    const answered = await adjust(jhon, tinto, command, 'TINTO 500 g');
    expect(answered.status).toBe('proposed');
    expect(answered.plan?.understood.join(' ')).toMatch(/TINTO 500 g/);
  });

  it('Ajustar: "Quita Stories" actualiza la propuesta sin ejecutar', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const before = await resourceCounts();
    const command = await ask(jhon, tinto, 'Necesito Reels y Stories esta semana en Instagram');
    expect(command.plan?.understood.join(' ')).toMatch(/Historia/);
    const adjusted = await adjust(jhon, tinto, command, 'Quita Stories.');
    expect(adjusted.status).toBe('proposed');
    expect(adjusted.plan?.revision).toBe(command.plan!.revision + 1);
    expect(adjusted.plan?.understood.join(' ')).not.toMatch(/Historia/);
    expect(await resourceCounts()).toEqual(before);

    // Confirmar la revisión vieja no ejecuta la nueva a ciegas.
    await jhon.agent
      .post(`${commands(tinto)}/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(409);
    const { command: done } = await confirm(jhon, tinto, adjusted);
    expect(done.status).toBe('completed');
    const items = await ContentPlanItemModel.find({ workspaceId: tinto });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.format === 'reel')).toBe(true);
  });

  it('Cancelar: cero escrituras de recursos y ya no se puede confirmar', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = await ask(
      jhon,
      tinto,
      'Quiero lanzar TINTO 500 g la próxima semana en Instagram.',
    );
    const before = await resourceCounts();
    const res = await jhon.agent.post(`${commands(tinto)}/${command.id}/cancel`).expect(200);
    expect(PixelCommandResponseSchema.parse(res.body).command.status).toBe('cancelled');
    await jhon.agent
      .post(`${commands(tinto)}/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(409);
    expect(await resourceCounts()).toEqual(before);
  });

  it('contenido para una campaña existente: la detecta, usa sus canales y no toca la campaña', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const generated = await jhon.agent
      .post(`/api/workspaces/${tinto}/campaigns/generate`)
      .send({
        name: 'Lanzamiento TINTO 500 g',
        objective: 'Presentar la nueva presentación de 500 g',
        productOrService: 'Café TINTO 500 g',
        channels: ['Instagram'],
      })
      .expect(201);
    const { campaign } = CampaignGenerationResponseSchema.parse(generated.body);
    const command = await ask(
      jhon,
      tinto,
      'Necesito contenido para el lanzamiento de 500 g esta semana.',
    );
    expect(command.status).toBe('proposed');
    expect(command.plan?.understood[0]).toBe('Campaña: «Lanzamiento TINTO 500 g»');
    const deliverablesBefore = await CampaignDeliverableModel.find({ workspaceId: tinto }).lean();
    await confirm(jhon, tinto, command);
    const plan = await ContentPlanModel.findOne({ workspaceId: tinto });
    expect(plan?.campaignId?.toString()).toBe(campaign.id);
    const deliverablesAfter = await CampaignDeliverableModel.find({ workspaceId: tinto }).lean();
    expect(deliverablesAfter.map((d) => d.status)).toEqual(deliverablesBefore.map((d) => d.status));
  });

  it('organizar un proyecto nuevo con tareas: un proyecto y sus tareas, una confirmación', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = await ask(
      jhon,
      tinto,
      'Organiza el proyecto de rediseño de la web: revisar la home, escribir los textos y elegir fotos',
    );
    expect(command.intent).toBe('organize_project');
    expect(command.status).toBe('proposed');
    const { command: done } = await confirm(jhon, tinto, command);
    expect(done.status).toBe('completed');
    const project = await ProjectModel.findOne({ workspaceId: tinto });
    expect(project?.name).toBe('rediseño de la web');
    const tasks = await TaskModel.find({ workspaceId: tinto });
    expect(tasks.map((task) => task.title)).toEqual([
      'Revisar la home',
      'Escribir los textos',
      'Elegir fotos',
    ]);
    expect(tasks.every((task) => task.projectId?.toString() === project?._id.toString())).toBe(
      true,
    );
  });
});

describe('Lo que solo se responde no crea nada', () => {
  it('"¿Qué debería publicar?" responde con contexto y no crea contenido', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const before = await resourceCounts();
    const command = await ask(jhon, tinto, '¿Qué debería publicar?');
    expect(command.intent).toBe('creative_advice');
    expect(command.status).toBe('answered');
    expect(command.reply).toBeTruthy();
    expect(command.plan).toBeNull();
    expect(await resourceCounts()).toEqual(before);
  });

  it('"¿Cómo vamos con el lanzamiento?" lee el estado sin modificar nada', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    await createProject(jhon, tinto, { name: 'Fotos del empaque' });
    const before = await resourceCounts();
    const projects = await ProjectModel.find({ workspaceId: tinto }).lean();
    const command = await ask(jhon, tinto, '¿Cómo vamos con el lanzamiento?');
    expect(command.intent).toBe('work_status');
    expect(command.status).toBe('answered');
    expect(command.reply).toMatch(/1 proyecto activo/);
    expect(await resourceCounts()).toEqual(before);
    expect(await ProjectModel.find({ workspaceId: tinto }).lean()).toEqual(projects);
  });
});

describe('Aislamiento: el workspace actual es la única frontera', () => {
  it('desde TINTO no se puede usar una campaña de INVENTIA del mismo dueño', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const lab = await brand(jhon, 'INVENTIA', inventia);
    const labCampaign = CampaignGenerationResponseSchema.parse(
      (
        await jhon.agent
          .post(`/api/workspaces/${lab}/campaigns/generate`)
          .send({
            name: 'Campaña INVENTIA prototipos',
            objective: 'Dar a conocer el servicio de prototipado',
            channels: ['Instagram'],
          })
          .expect(201)
      ).body,
    );
    // Por texto: no la encuentra (nunca busca fuera del workspace).
    const byText = await ask(
      jhon,
      tinto,
      'Haz contenido usando la campaña de INVENTIA en Instagram',
    );
    expect(byText.status).toBe('proposed');
    expect(byText.plan?.understood.join(' ')).toMatch(/No encontré una campaña «INVENTIA»/);
    await confirm(jhon, tinto, byText);
    const plan = await ContentPlanModel.findOne({ workspaceId: tinto });
    expect(plan?.campaignId).toBeNull();
    // Por id (pantalla): 400, sin revelar que existe.
    const byId = await jhon.agent
      .post(commands(tinto))
      .send({
        request: 'Contenido para esta campaña',
        contextHint: { campaignId: labCampaign.campaign.id },
      })
      .expect(400);
    expect(JSON.stringify(byId.body)).not.toMatch(/INVENTIA|prototip/i);
    // Una solicitud de INVENTIA no se lee desde TINTO.
    const labCommand = await ask(jhon, lab, '¿Cómo vamos?');
    await jhon.agent.get(`${commands(tinto)}/${labCommand.id}`).expect(404);
    await jhon.agent.post(`${commands(tinto)}/${labCommand.id}/cancel`).expect(404);
  });

  it('otro usuario recibe 404', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const ana = await registerUser(app, 'Ana');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const command = await ask(jhon, tinto, 'Quiero una campaña de Amor y Amistad para TINTO.');
    await ana.agent.get(`${commands(tinto)}/${command.id}`).expect(404);
    await ana.agent
      .post(`${commands(tinto)}/${command.id}/confirm`)
      .send({ revision: 1 })
      .expect(404);
    expect(await CampaignModel.countDocuments({ workspaceId: tinto })).toBe(0);
  });

  it('sin BrandDNA: 409 brand_dna_missing, sin inventar', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const companyId = await createCompany(jhon, 'Sin ADN');
    const workspaceId = (await workspaceIdOf(companyId)).toString();
    const res = await jhon.agent
      .post(commands(workspaceId))
      .send({ request: 'Necesito lanzar un producto' })
      .expect(409);
    expect(res.body.error.details.reason).toBe('brand_dna_missing');
  });
});

describe('PixelCommand Personal', () => {
  it('usa el PersonalDNA (sus plataformas) y nunca crea campañas', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const personal = await createPersonalWorkspace(jhon);
    await completePersonalOnboarding(jhon, personal, creativeDirector);
    const command = await ask(jhon, personal, 'Necesito publicar algo esta semana sobre Pixel.');
    expect(command.intent).toBe('plan_content');
    expect(command.status).toBe('proposed');
    expect(command.plan?.understood.join(' ')).toMatch(/Tema: Pixel/);
    expect(command.plan?.understood.join(' ')).toMatch(/Instagram/);
    const { command: done } = await confirm(jhon, personal, command);
    expect(done.status).toBe('completed');
    expect(
      await ContentPlanModel.countDocuments({ workspaceId: personal, contextType: 'personal' }),
    ).toBe(1);

    const launch = await ask(jhon, personal, 'Quiero lanzar mi portafolio en Instagram');
    expect(launch.intent).toBe('plan_content');
    expect(await CampaignModel.collection.countDocuments()).toBe(0);
  });
});

describe('Fallos parciales: se informa qué pasó y reintentar no duplica', () => {
  it('si un paso falla tras crear algo, queda partial con lo creado y el motivo', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await brand(jhon, 'Café Tinto', cafeTinto);
    const { PixelCommandModel } =
      await import('../src/modules/pixel-command/pixelCommand.model.js');
    const command = await PixelCommandModel.create({
      workspaceId: tinto,
      status: 'proposed',
      intent: 'organize_project',
      request: 'Organiza el proyecto Empaque',
      interpretation: { mode: 'rules', confidence: 0.75 },
      plan: { summary: 'Creo el proyecto', understood: [], proposal: [], creates: [], revision: 1 },
      steps: [
        {
          id: 'step_1',
          type: 'create_project',
          title: 'Crear el proyecto «Empaque»',
          params: { name: 'Empaque' },
        },
        // Paso inválido a propósito (título vacío): el servicio lo rechaza.
        {
          id: 'step_2',
          type: 'create_tasks',
          title: 'Crear 1 tarea',
          params: { tasks: [{ title: '' }], projectFromStep: 'step_1' },
        },
      ],
    });
    const res = await jhon.agent
      .post(`${commands(tinto)}/${command._id.toString()}/confirm`)
      .send({ revision: 1 })
      .expect(200);
    const first = PixelCommandConfirmResponseSchema.parse(res.body).command;
    expect(first.status).toBe('partial');
    expect(first.reply).toMatch(/Creé «Empaque», pero no pude completar «Crear 1 tarea»/);
    expect(first.plan?.steps.map((step) => step.status)).toEqual(['done', 'failed']);
    expect(await ProjectModel.countDocuments({ workspaceId: tinto })).toBe(1);

    // Reintentar retoma desde el paso que falló: el proyecto no se duplica.
    await jhon.agent
      .post(`${commands(tinto)}/${command._id.toString()}/confirm`)
      .send({ revision: 1 })
      .expect(200);
    expect(await ProjectModel.countDocuments({ workspaceId: tinto })).toBe(1);
  });
});
