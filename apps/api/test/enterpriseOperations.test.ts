import { OperationsSummaryResponseSchema } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { enterpriseContextBuilder } from '../src/modules/conversations/context/index.js';
import { ProjectModel } from '../src/modules/operations/project.model.js';
import { timezoneOffsetMinutes } from '../src/modules/operations/operations.scope.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { cafeTinto, novaLabs } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import {
  createContent,
  createProject,
  createTask,
  daysFromNow,
  ops,
} from './support/operations.js';
import { createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

/** Pixel de empresa (opcionalmente con ADN): devuelve empresa y workspace. */
async function enterprise(session: Session, name: string, answers?: typeof cafeTinto) {
  const companyId = await createCompany(session, name);
  if (answers) await completeOnboarding(session, companyId, answers);
  return { companyId, workspaceId: (await workspaceIdOf(companyId)).toString() };
}

/** Project + Task + ContentItem con el MISMO nombre en un workspace ("Lanzamiento"). */
async function seedLaunch(session: Session, workspaceId: string) {
  const project = await createProject(session, workspaceId, { name: 'Lanzamiento' });
  const task = await createTask(session, workspaceId, {
    title: 'Lanzamiento',
    projectId: project.id,
  });
  const content = await createContent(session, workspaceId, {
    title: 'Lanzamiento',
    projectId: project.id,
  });
  return { project: project.id, task: task.id, content: content.id };
}

describe('Shared Operations: los mismos endpoints en Personal y Enterprise', () => {
  it.each(['personal', 'enterprise'] as const)(
    'en un workspace %s: proyecto, tareas, contenido y progreso',
    async (type) => {
      const jhon = await registerUser(app, 'Jhon');
      const workspaceId =
        type === 'personal'
          ? await createPersonalWorkspace(jhon)
          : (await enterprise(jhon, 'TINTO')).workspaceId;
      const url = ops(workspaceId);

      const project = await createProject(jhon, workspaceId, {
        name: 'Lanzamiento nueva presentación',
        goals: ['Presentar el empaque de 500 g'],
        dueDate: daysFromNow(20),
      });
      expect(project).toMatchObject({ workspaceId, type: 'general', status: 'active' });

      const tasks = await Promise.all(
        ['Diseñar key visual', 'Editar Reel 1', 'Revisar copy'].map((title) =>
          createTask(jhon, workspaceId, { title, projectId: project.id }),
        ),
      );
      await createContent(jhon, workspaceId, {
        title: 'Reel lanzamiento nueva presentación',
        platform: 'instagram',
        format: 'reel',
        status: 'production',
        projectId: project.id,
      });
      await createContent(jhon, workspaceId, { title: 'Carrusel', projectId: project.id });

      await jhon.agent.patch(`${url.tasks}/${tasks[0]!.id}`).send({ status: 'done' }).expect(200);
      const detail = await jhon.agent.get(`${url.projects}/${project.id}`).expect(200);
      expect(detail.body.project).toMatchObject({
        progress: 33,
        stats: { tasks: 3, completedTasks: 1, contentItems: 2 },
      });

      const list = await jhon.agent.get(url.projects).expect(200);
      expect(list.body.projects.map((p: { id: string }) => p.id)).toEqual([project.id]);
      const content = await jhon.agent.get(`${url.content}?status=production`).expect(200);
      expect(content.body.total).toBe(1);

      // Archivar no borra: desaparece de la lista por defecto y aparece con el filtro.
      await jhon.agent.delete(`${url.projects}/${project.id}`).expect(200);
      expect((await jhon.agent.get(url.projects).expect(200)).body.total).toBe(0);
      expect((await jhon.agent.get(`${url.projects}?status=archived`)).body.total).toBe(1);
    },
  );
});

describe('Aislamiento entre workspaces del MISMO usuario (prueba crítica)', () => {
  it('Personal, TINTO e INVENTIA con "Lanzamiento" en los tres: cada uno ve solo lo suyo', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaces = {
      personal: await createPersonalWorkspace(jhon),
      tinto: (await enterprise(jhon, 'TINTO')).workspaceId,
      inventia: (await enterprise(jhon, 'INVENTIA')).workspaceId,
    };
    const seeded = {
      personal: await seedLaunch(jhon, workspaces.personal),
      tinto: await seedLaunch(jhon, workspaces.tinto),
      inventia: await seedLaunch(jhon, workspaces.inventia),
    };
    const names = Object.keys(workspaces) as (keyof typeof workspaces)[];

    for (const name of names) {
      const url = ops(workspaces[name]);
      const [projects, tasks, content] = await Promise.all([
        jhon.agent.get(url.projects).expect(200),
        jhon.agent.get(url.tasks).expect(200),
        jhon.agent.get(url.content).expect(200),
      ]);
      expect(projects.body.projects.map((p: { id: string }) => p.id)).toEqual([
        seeded[name].project,
      ]);
      expect(tasks.body.tasks.map((t: { id: string }) => t.id)).toEqual([seeded[name].task]);
      expect(content.body.contentItems.map((c: { id: string }) => c.id)).toEqual([
        seeded[name].content,
      ]);
      // Buscar por el nombre compartido tampoco cruza workspaces.
      const search = await jhon.agent.get(`${url.projects}?search=Lanzamiento`).expect(200);
      expect(search.body.total).toBe(1);
    }

    // Desde cada workspace, los recursos de los otros dos responden 404 (como si no existieran).
    for (const from of names) {
      const url = ops(workspaces[from]);
      for (const other of names.filter((name) => name !== from)) {
        const foreign = seeded[other];
        const attempts = [
          () => jhon.agent.get(`${url.projects}/${foreign.project}`),
          () => jhon.agent.patch(`${url.projects}/${foreign.project}`).send({ name: 'Cruzado' }),
          () => jhon.agent.delete(`${url.projects}/${foreign.project}`),
          () => jhon.agent.get(`${url.tasks}/${foreign.task}`),
          () => jhon.agent.patch(`${url.tasks}/${foreign.task}`).send({ status: 'done' }),
          () => jhon.agent.delete(`${url.tasks}/${foreign.task}`),
          () => jhon.agent.get(`${url.content}/${foreign.content}`),
          () => jhon.agent.patch(`${url.content}/${foreign.content}`).send({ title: 'Cruzado' }),
          () => jhon.agent.delete(`${url.content}/${foreign.content}`),
        ];
        for (const attempt of attempts) {
          const res = await attempt();
          expect(res.status).toBe(404);
          // El 404 no revela a qué workspace pertenece ni que existe en otro sitio.
          expect(JSON.stringify(res.body)).not.toMatch(/TINTO|INVENTIA|Personal|Lanzamiento/);
        }
      }
    }

    // Nada cambió: cada recurso sigue intacto en su workspace.
    for (const name of names) {
      const res = await jhon.agent
        .get(`${ops(workspaces[name]).projects}/${seeded[name].project}`)
        .expect(200);
      expect(res.body.project).toMatchObject({ name: 'Lanzamiento', status: 'active' });
    }
  });

  it('una tarea de INVENTIA no puede vincularse a un proyecto de TINTO (crear ni mover)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = (await enterprise(jhon, 'TINTO')).workspaceId;
    const inventia = (await enterprise(jhon, 'INVENTIA')).workspaceId;
    const tintoProject = await createProject(jhon, tinto, { name: 'Lanzamiento 500 g' });
    const own = await createTask(jhon, inventia, { title: 'Preparar prototipo demo' });

    const created = await jhon.agent
      .post(ops(inventia).tasks)
      .send({ title: 'Intrusa', projectId: tintoProject.id })
      .expect(400);
    expect(created.body.error.details).toEqual([
      { path: 'projectId', message: 'Proyecto no encontrado' },
    ]);
    await jhon.agent
      .patch(`${ops(inventia).tasks}/${own.id}`)
      .send({ projectId: tintoProject.id })
      .expect(400);
    const stats = await jhon.agent.get(`${ops(tinto).projects}/${tintoProject.id}`).expect(200);
    expect(stats.body.project.stats.tasks).toBe(0);
  });

  it('un contenido de INVENTIA no puede vincularse a un proyecto de TINTO (crear ni mover)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = (await enterprise(jhon, 'TINTO')).workspaceId;
    const inventia = (await enterprise(jhon, 'INVENTIA')).workspaceId;
    const tintoProject = await createProject(jhon, tinto, { name: 'Lanzamiento 500 g' });
    const own = await createContent(jhon, inventia, { title: 'Reel proceso de impresión 3D' });

    await jhon.agent
      .post(ops(inventia).content)
      .send({ title: 'Intruso', projectId: tintoProject.id })
      .expect(400);
    await jhon.agent
      .patch(`${ops(inventia).content}/${own.id}`)
      .send({ projectId: tintoProject.id })
      .expect(400);
    const stats = await jhon.agent.get(`${ops(tinto).projects}/${tintoProject.id}`).expect(200);
    expect(stats.body.project.stats.contentItems).toBe(0);
  });

  it('Personal ↔ Enterprise: ni proyectos ni vínculos cruzan en ningún sentido', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const personal = await createPersonalWorkspace(jhon);
    const tinto = (await enterprise(jhon, 'TINTO')).workspaceId;
    const personalProject = await createProject(jhon, personal, { name: 'Marca personal' });
    const tintoProject = await createProject(jhon, tinto, { name: 'Campaña Sharp Ultra' });

    await jhon.agent.get(`${ops(tinto).projects}/${personalProject.id}`).expect(404);
    await jhon.agent.get(`${ops(personal).projects}/${tintoProject.id}`).expect(404);
    await jhon.agent
      .post(ops(tinto).tasks)
      .send({ title: 'X', projectId: personalProject.id })
      .expect(400);
    await jhon.agent
      .post(ops(personal).content)
      .send({ title: 'X', projectId: tintoProject.id })
      .expect(400);
  });

  it('el resumen operacional cuenta solo el workspace activo', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = (await enterprise(jhon, 'TINTO')).workspaceId;
    const inventia = (await enterprise(jhon, 'INVENTIA')).workspaceId;
    await seedLaunch(jhon, tinto);
    await createTask(jhon, tinto, { title: 'Vencida', dueDate: daysFromNow(-2) });
    await createContent(jhon, tinto, { title: 'Publicado', status: 'published' });
    await createContent(jhon, tinto, { title: 'En producción', status: 'production' });

    const summary = async (workspaceId: string) =>
      OperationsSummaryResponseSchema.parse(
        (await jhon.agent.get(`${ops(workspaceId).summary}?tzOffset=300`).expect(200)).body,
      ).summary;
    expect((await summary(tinto)).counts).toEqual({
      activeProjects: 1,
      openTasks: 2,
      overdueTasks: 1,
      contentInProduction: 1,
      activeContentItems: 2,
    });
    expect((await summary(inventia)).counts).toEqual({
      activeProjects: 0,
      openTasks: 0,
      overdueTasks: 0,
      contentInProduction: 0,
      activeContentItems: 0,
    });
  });
});

describe('Tipos de proyecto (compatibilidad del enum)', () => {
  it('los tipos Enterprise se validan; los existentes (type: personal) siguen funcionando', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = (await enterprise(jhon, 'TINTO')).workspaceId;
    const personal = await createPersonalWorkspace(jhon);

    for (const type of ['campaign', 'branding', 'product_launch', 'event', 'internal']) {
      expect((await createProject(jhon, tinto, { name: `P ${type}`, type })).type).toBe(type);
    }
    const invalid = await jhon.agent.post(ops(tinto).projects).send({ name: 'X', type: 'mega' });
    expect(invalid.status).toBe(400);

    // Un documento anterior, escrito directamente con type "personal", se lee y se edita igual.
    const legacy = await ProjectModel.create({
      workspaceId: (await WorkspaceModel.findOne({ _id: personal, ownerId: jhon.user.id }))!._id,
      name: 'Proyecto antiguo',
      type: 'personal',
    });
    const read = await jhon.agent.get(`${ops(personal).projects}/${legacy._id}`).expect(200);
    expect(read.body.project.type).toBe('personal');
    await jhon.agent
      .patch(`${ops(personal).projects}/${legacy._id}`)
      .send({ priority: 'high' })
      .expect(200);
  });
});

describe('Feature gating por tipo de workspace', () => {
  it('Enterprise: Operations sí; Content Planner con IA y Daily Director no', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = (await enterprise(jhon, 'TINTO')).workspaceId;
    const base = `/api/workspaces/${tinto}`;

    for (const path of ['projects', 'tasks', 'content', 'operations/summary']) {
      await jhon.agent.get(`${base}/${path}`).expect(200);
    }
    const plan = await jhon.agent.post(`${base}/content-plans/generate`).send({
      startDate: '2026-10-12',
      endDate: '2026-10-25',
      frequency: 3,
      platforms: ['instagram'],
      goal: 'posicionamiento',
      tzOffset: 300,
    });
    expect(plan.status).toBe(400);
    expect(plan.body.error.details).toMatchObject({
      reason: 'feature_not_available',
      feature: 'contentPlanner',
      expected: 'personal',
    });
    const brief = await jhon.agent.get(`${base}/daily-brief`).expect(400);
    expect(brief.body.error.details).toMatchObject({
      reason: 'feature_not_available',
      feature: 'dailyDirector',
    });
  });

  it('Personal no cambia: el Daily Director sigue disponible (409 si aún no hay ADN)', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const personal = await createPersonalWorkspace(jhon);
    const res = await jhon.agent.post(`/api/workspaces/${personal}/daily-brief/generate`);
    expect(res.status).toBe(409);
    expect(res.body.error.details.reason).toBe('personal_context_not_configured');
  });

  it('legacy: /api/companies sigue igual y no gana rutas de Operations', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const { companyId } = await enterprise(jhon, 'TINTO');
    await jhon.agent.get(`/api/companies/${companyId}`).expect(200);
    await jhon.agent.get(`/api/companies/${companyId}/projects`).expect(404);
  });
});

describe('Chat Enterprise: estado operativo compacto', () => {
  async function contextOf(session: Session, workspaceId: string, userMessage: string) {
    const workspace = await WorkspaceModel.findOne({ _id: workspaceId, ownerId: session.user.id });
    const result = await enterpriseContextBuilder.build({
      workspace: workspace!,
      history: [],
      userMessage,
      historyLimit: 20,
      defaultTimezone: 'America/Bogota',
    });
    if (result.status !== 'ready') throw new Error('contexto no listo');
    return result.context;
  }

  it('solo conteos del workspace activo: sin nombres ni datos de otro Pixel', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await enterprise(jhon, 'Café Tinto', cafeTinto);
    const inventia = await enterprise(jhon, 'Nova Labs', novaLabs);
    await seedLaunch(jhon, tinto.workspaceId);
    await createProject(jhon, tinto.workspaceId, { name: 'Presentación 500 g' });
    await createTask(jhon, tinto.workspaceId, {
      title: 'Aprobar fotografía',
      dueDate: daysFromNow(-1),
    });
    await createProject(jhon, inventia.workspaceId, { name: 'Presentación laboratorio' });

    const a = await contextOf(jhon, tinto.workspaceId, '¿Cómo vamos con el lanzamiento?');
    const b = await contextOf(jhon, inventia.workspaceId, '¿Cómo vamos con el lanzamiento?');

    expect(a.system).toContain('<operations_status>');
    expect(a.system).toContain('- Proyectos activos: 2');
    expect(a.system).toContain('- Tareas pendientes: 2 (vencidas: 1)');
    expect(a.system).toContain('- Contenido en curso: 1');
    expect(b.system).toContain('- Proyectos activos: 1');
    expect(b.system).toContain('- Tareas pendientes: 0 (vencidas: 0)');
    expect(a.stats.includesOperations).toBe(true);
    // Nunca títulos ni nombres de proyectos o tareas (de este ni de otro workspace).
    for (const text of ['Lanzamiento', 'Presentación 500 g', 'Aprobar fotografía']) {
      expect(a.system).not.toContain(text);
    }
    expect(b.system).not.toContain('Presentación laboratorio');
    expect(b.system).not.toMatch(/Café Tinto|Huila/);
  });

  it('el chat responde con el estado real y no inventa una campaña inexistente', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const tinto = await enterprise(jhon, 'Café Tinto', cafeTinto);
    await seedLaunch(jhon, tinto.workspaceId);
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

    const status = await send('¿Cómo vamos con el lanzamiento?');
    const reply = status.body.pixelMessage.content as string;
    expect(reply).toContain('1 proyecto activo');
    expect(reply).toContain('1 tarea pendiente');
    expect(reply).toMatch(/solo veo estos conteos/);

    const christmas = await send('¿Cómo va la campaña Navidad?');
    const answer = christmas.body.pixelMessage.content as string;
    expect(answer).not.toMatch(/Navidad/i);
    expect(answer).toMatch(/no el detalle/);

    const list = await send('Dime todas las tareas');
    expect(list.body.pixelMessage.content).not.toContain('Lanzamiento');
  });
});

describe('timezoneOffsetMinutes', () => {
  it('sigue la convención de Date#getTimezoneOffset', () => {
    const winter = new Date('2026-01-15T12:00:00Z');
    const summer = new Date('2026-07-15T12:00:00Z');
    expect(timezoneOffsetMinutes(winter, 'America/Bogota')).toBe(300);
    expect(timezoneOffsetMinutes(winter, 'UTC')).toBe(0);
    expect(timezoneOffsetMinutes(summer, 'Europe/Madrid')).toBe(-120);
    expect(timezoneOffsetMinutes(winter, 'Asia/Kolkata')).toBe(-330);
  });
});
