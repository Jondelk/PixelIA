import { OperationsSummaryResponseSchema } from '@pixel/contracts';
import mongoose, { type Model } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { TenantScopeError } from '../src/db/tenantScoped.plugin.js';
import { ContentItemModel } from '../src/modules/operations/contentItem.model.js';
import { ProjectModel } from '../src/modules/operations/project.model.js';
import { TaskModel } from '../src/modules/operations/task.model.js';
import { createCompany } from './support/brandBrain.js';
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

describe('Operations: aislamiento entre usuarios (404, nunca 403)', () => {
  let userA: Session;
  let userB: Session;
  let workspaceA: string;
  let workspaceB: string;
  let projectA: string;
  let taskA: string;
  let contentA: string;

  beforeEach(async () => {
    userA = await registerUser(app, 'Usuario A');
    userB = await registerUser(app, 'Usuario B');
    workspaceA = await createPersonalWorkspace(userA, 'Pixel A');
    workspaceB = await createPersonalWorkspace(userB, 'Pixel B');
    projectA = (await createProject(userA, workspaceA, { name: 'Project A' })).id;
    taskA = (await createTask(userA, workspaceA, { title: 'Task A', projectId: projectA })).id;
    contentA = (await createContent(userA, workspaceA, { title: 'Content A', projectId: projectA }))
      .id;
  });

  it('B recibe 404 en cualquier endpoint del workspace de A', async () => {
    const a = ops(workspaceA);
    const attempts = [
      () => userB.agent.get(a.projects),
      () => userB.agent.post(a.projects).send({ name: 'Intruso' }),
      () => userB.agent.get(`${a.projects}/${projectA}`),
      () => userB.agent.patch(`${a.projects}/${projectA}`).send({ name: 'Hackeado' }),
      () => userB.agent.delete(`${a.projects}/${projectA}`),
      () => userB.agent.get(a.tasks),
      () => userB.agent.post(a.tasks).send({ title: 'Intrusa' }),
      () => userB.agent.get(`${a.tasks}/${taskA}`),
      () => userB.agent.patch(`${a.tasks}/${taskA}`).send({ status: 'done' }),
      () => userB.agent.delete(`${a.tasks}/${taskA}`),
      () => userB.agent.get(a.content),
      () => userB.agent.post(a.content).send({ title: 'Intruso' }),
      () => userB.agent.get(`${a.content}/${contentA}`),
      () => userB.agent.patch(`${a.content}/${contentA}`).send({ status: 'published' }),
      () => userB.agent.delete(`${a.content}/${contentA}`),
      () => userB.agent.get(a.summary),
    ];
    for (const attempt of attempts) {
      const res = await attempt();
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('B tampoco alcanza los recursos de A desde SU propio workspace', async () => {
    const b = ops(workspaceB);
    for (const path of [
      `${b.projects}/${projectA}`,
      `${b.tasks}/${taskA}`,
      `${b.content}/${contentA}`,
    ]) {
      await userB.agent.get(path).expect(404);
      await userB.agent.delete(path).expect(404);
    }
    await userB.agent.patch(`${b.tasks}/${taskA}`).send({ title: 'X' }).expect(404);
    await userB.agent.patch(`${b.content}/${contentA}`).send({ title: 'X' }).expect(404);
    // Filtrar por un proyecto ajeno no devuelve nada.
    const res = await userB.agent.get(`${b.tasks}?projectId=${projectA}`).expect(200);
    expect(res.body).toEqual({ tasks: [], total: 0 });
  });

  it('nada cambió en A tras los intentos de B', async () => {
    const a = ops(workspaceA);
    await userB.agent.patch(`${a.tasks}/${taskA}`).send({ status: 'done' });
    await userB.agent.delete(`${a.content}/${contentA}`);
    const task = await userA.agent.get(`${a.tasks}/${taskA}`).expect(200);
    expect(task.body.task).toMatchObject({ status: 'inbox', completedAt: null });
    await userA.agent.get(`${a.content}/${contentA}`).expect(200);
    expect(await ProjectModel.countDocuments({ workspaceId: workspaceB })).toBe(0);
  });

  it('operadores de Mongo en la query no saltan el aislamiento', async () => {
    const b = ops(workspaceB);
    for (const query of [
      'projectId[$ne]=x',
      'status[$ne]=done',
      'workspaceId=' + workspaceA,
      'search[$regex]=.*',
    ]) {
      const res = await userB.agent.get(`${b.tasks}?${query}`);
      // La query simple de Express no anida objetos: o es un 400 o una lista vacía de B.
      if (res.status === 200) expect(res.body.total).toBe(0);
      else expect(res.status).toBe(400);
    }
  });
});

describe('Operations: dos workspaces del mismo dueño no se mezclan', () => {
  let jhon: Session;
  let personal: string;
  let enterprise: string;

  beforeEach(async () => {
    jhon = await registerUser(app, 'Jhon');
    personal = await createPersonalWorkspace(jhon);
    const companyId = await createCompany(jhon, 'TINTO');
    enterprise = (await workspaceIdOf(companyId)).toString();
  });

  it('un workspace Enterprise también puede tener Operations (Opción A)', async () => {
    const project = await createProject(jhon, enterprise, { name: 'Campaña de lanzamiento' });
    const task = await createTask(jhon, enterprise, {
      title: 'Brief',
      projectId: project.id,
    });
    expect(task).toMatchObject({ workspaceId: enterprise, projectId: project.id });
  });

  it('un proyecto del workspace personal no sirve en el enterprise ni al revés', async () => {
    const personalProject = await createProject(jhon, personal, { name: 'Marca personal' });
    const enterpriseProject = await createProject(jhon, enterprise, { name: 'Campaña' });
    await jhon.agent
      .post(ops(enterprise).tasks)
      .send({ title: 'X', projectId: personalProject.id })
      .expect(400);
    await jhon.agent
      .post(ops(personal).content)
      .send({ title: 'X', projectId: enterpriseProject.id })
      .expect(400);
    await jhon.agent.get(`${ops(personal).projects}/${enterpriseProject.id}`).expect(404);

    const personalList = await jhon.agent.get(ops(personal).projects).expect(200);
    expect(personalList.body.projects.map((p: { name: string }) => p.name)).toEqual([
      'Marca personal',
    ]);
  });

  it('el progreso de un proyecto solo cuenta operaciones de su workspace', async () => {
    const project = await createProject(jhon, personal, { name: 'Marca personal' });
    await createTask(jhon, personal, { title: 'Hecha', projectId: project.id, status: 'done' });
    // Una tarea del otro workspace con el mismo projectId solo podría existir saltándose la API.
    await TaskModel.create({
      workspaceId: enterprise,
      projectId: project.id,
      title: 'Inyectada',
      status: 'todo',
    });
    const res = await jhon.agent.get(`${ops(personal).projects}/${project.id}`).expect(200);
    expect(res.body.project).toMatchObject({
      progress: 100,
      stats: { tasks: 1, completedTasks: 1 },
    });
  });
});

describe('Operations: resumen del Inicio', () => {
  it('cuenta y lista solo datos reales del workspace', async () => {
    const jhon = await registerUser(app, 'Jhon');
    const workspaceId = await createPersonalWorkspace(jhon);
    const ana = await registerUser(app, 'Ana');
    const anaWorkspace = await createPersonalWorkspace(ana, 'Ana');
    await createProject(ana, anaWorkspace, { name: 'De Ana' });
    await createTask(ana, anaWorkspace, { title: 'De Ana' });

    const empty = await jhon.agent.get(ops(workspaceId).summary).expect(200);
    expect(OperationsSummaryResponseSchema.parse(empty.body).summary).toEqual({
      counts: {
        activeProjects: 0,
        openTasks: 0,
        overdueTasks: 0,
        contentInProduction: 0,
        activeContentItems: 0,
      },
      upcomingTasks: [],
      recentProjects: [],
      upcomingContent: [],
    });

    await createProject(jhon, workspaceId, { name: 'Activo' });
    await createProject(jhon, workspaceId, { name: 'Planificado', status: 'planned' });
    await createTask(jhon, workspaceId, { title: 'Vencida', dueDate: daysFromNow(-3) });
    await createTask(jhon, workspaceId, { title: 'Próxima', dueDate: daysFromNow(2) });
    await createTask(jhon, workspaceId, { title: 'Sin fecha', status: 'todo' });
    await createTask(jhon, workspaceId, {
      title: 'Hecha',
      status: 'done',
      dueDate: daysFromNow(1),
    });
    await createContent(jhon, workspaceId, { title: 'En producción', status: 'production' });
    await createContent(jhon, workspaceId, { title: 'Programado', scheduledFor: daysFromNow(5) });
    await createContent(jhon, workspaceId, {
      title: 'Publicado',
      status: 'published',
      scheduledFor: daysFromNow(4),
    });

    const res = await jhon.agent.get(`${ops(workspaceId).summary}?tzOffset=300`).expect(200);
    const { summary } = OperationsSummaryResponseSchema.parse(res.body);
    expect(summary.counts).toEqual({
      activeProjects: 1,
      openTasks: 3,
      overdueTasks: 1,
      contentInProduction: 1,
      // En producción + Programado (idea); el publicado no cuenta.
      activeContentItems: 2,
    });
    expect(summary.upcomingTasks.map((task) => task.title)).toEqual(['Próxima']);
    expect(summary.recentProjects.map((project) => project.name)).toEqual([
      'Planificado',
      'Activo',
    ]);
    expect(summary.upcomingContent.map((item) => item.title)).toEqual(['Programado']);
  });
});

describe('Operations: tenantScoped e índices', () => {
  const workspaceId = new mongoose.Types.ObjectId();
  const models = [ProjectModel, TaskModel, ContentItemModel] as unknown as Model<
    Record<string, unknown>
  >[];

  it('rechaza consultas, updates, deletes, counts, agregaciones y bulk sin workspaceId', async () => {
    for (const model of models) {
      await expect(model.find({})).rejects.toBeInstanceOf(TenantScopeError);
      await expect(model.findById(new mongoose.Types.ObjectId())).rejects.toBeInstanceOf(
        TenantScopeError,
      );
      await expect(model.countDocuments({ status: 'active' })).rejects.toBeInstanceOf(
        TenantScopeError,
      );
      await expect(model.updateMany({}, { status: 'done' })).rejects.toBeInstanceOf(
        TenantScopeError,
      );
      await expect(model.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
      await expect(model.aggregate([{ $match: {} }])).rejects.toBeInstanceOf(TenantScopeError);
      await expect(
        model.bulkWrite([{ deleteMany: { filter: { status: 'done' } } }]),
      ).rejects.toBeInstanceOf(TenantScopeError);
      await expect(model.estimatedDocumentCount()).rejects.toBeInstanceOf(TenantScopeError);
    }
  });

  it('exige un valor concreto: $exists, $ne, $in o vacío no valen', async () => {
    for (const model of models) {
      for (const workspaceFilter of [
        { $exists: true },
        { $ne: null },
        { $in: [workspaceId] },
        '',
      ]) {
        await expect(model.find({ workspaceId: workspaceFilter })).rejects.toBeInstanceOf(
          TenantScopeError,
        );
        await expect(
          model.updateOne({ workspaceId: workspaceFilter }, { title: 'X' }),
        ).rejects.toBeInstanceOf(TenantScopeError);
      }
      await expect(model.find({ workspaceId })).resolves.toEqual([]);
    }
  });

  it('declara los índices esperados (sin índice redundante solo por workspaceId)', async () => {
    const keys = async (model: Model<Record<string, unknown>>) =>
      (await model.collection.indexes()).map((index) => index.key);
    expect(await keys(ProjectModel as unknown as Model<Record<string, unknown>>)).toEqual([
      { _id: 1 },
      { workspaceId: 1, status: 1, updatedAt: -1 },
      { workspaceId: 1, dueDate: 1 },
    ]);
    expect(await keys(TaskModel as unknown as Model<Record<string, unknown>>)).toEqual([
      { _id: 1 },
      { workspaceId: 1, status: 1, createdAt: -1 },
      { workspaceId: 1, dueDate: 1 },
      { workspaceId: 1, projectId: 1, status: 1 },
    ]);
    expect(await keys(ContentItemModel as unknown as Model<Record<string, unknown>>)).toEqual([
      { _id: 1 },
      { workspaceId: 1, status: 1, updatedAt: -1 },
      { workspaceId: 1, scheduledFor: 1 },
      { workspaceId: 1, projectId: 1, status: 1 },
    ]);
  });
});
