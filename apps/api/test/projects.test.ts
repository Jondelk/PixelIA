import { ProjectListResponseSchema, ProjectResponseSchema } from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectModel } from '../src/modules/operations/project.model.js';
import { createContent, createProject, createTask, ops } from './support/operations.js';
import { createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

describe('Projects', () => {
  let jhon: Session;
  let workspaceId: string;
  let url: ReturnType<typeof ops>;

  beforeEach(async () => {
    jhon = await registerUser(app, 'Jhon');
    workspaceId = await createPersonalWorkspace(jhon);
    url = ops(workspaceId);
  });

  it('crea un proyecto solo con el nombre y valores por defecto', async () => {
    const res = await jhon.agent.post(url.projects).send({ name: 'Marca personal' }).expect(201);
    const { project } = ProjectResponseSchema.parse(res.body);
    expect(project).toMatchObject({
      workspaceId,
      name: 'Marca personal',
      description: null,
      type: 'general',
      status: 'active',
      priority: 'medium',
      goals: [],
      startDate: null,
      dueDate: null,
      progress: 0,
      stats: { tasks: 0, completedTasks: 0, contentItems: 0 },
    });
  });

  it('guarda todos los campos y las fechas en UTC', async () => {
    const project = await createProject(jhon, workspaceId, {
      name: 'Lanzamiento',
      description: 'Lanzar la nueva web',
      type: 'creative',
      status: 'planned',
      priority: 'high',
      goals: ['Publicar la web', ' ', 'Conseguir 10 clientes'],
      startDate: '2026-10-01T05:00:00.000Z',
      dueDate: '2026-11-30T05:00:00.000Z',
    });
    expect(project).toMatchObject({
      type: 'creative',
      status: 'planned',
      priority: 'high',
      goals: ['Publicar la web', 'Conseguir 10 clientes'],
      startDate: '2026-10-01T05:00:00.000Z',
      dueDate: '2026-11-30T05:00:00.000Z',
    });
  });

  it('ignora el workspace del cuerpo: workspaceId, progress o source son un 400', async () => {
    const other = await createPersonalWorkspace(await registerUser(app, 'Otra'), 'Otra');
    for (const extra of [{ workspaceId: other }, { progress: 90 }, { source: 'pixel' }]) {
      const res = await jhon.agent
        .post(url.projects)
        .send({ name: 'X', ...extra })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await ProjectModel.countDocuments({ workspaceId: other })).toBe(0);
    expect(await ProjectModel.countDocuments({ workspaceId })).toBe(0);
  });

  it('valida el nombre y el orden de las fechas', async () => {
    await jhon.agent.post(url.projects).send({}).expect(400);
    await jhon.agent.post(url.projects).send({ name: '  ' }).expect(400);
    await jhon.agent
      .post(url.projects)
      .send({ name: 'X', startDate: '2026-10-10T00:00:00Z', dueDate: '2026-10-01T00:00:00Z' })
      .expect(400);
  });

  it('lista los proyectos propios (más recientes primero) y su total', async () => {
    await createProject(jhon, workspaceId, { name: 'Uno' });
    await createProject(jhon, workspaceId, { name: 'Dos' });
    const res = await jhon.agent.get(url.projects).expect(200);
    const body = ProjectListResponseSchema.parse(res.body);
    expect(body.total).toBe(2);
    expect(body.projects.map((project) => project.name)).toEqual(['Dos', 'Uno']);
  });

  it('filtra por estado, prioridad y búsqueda; pagina con limit/offset', async () => {
    await createProject(jhon, workspaceId, { name: 'Marca personal', priority: 'high' });
    await createProject(jhon, workspaceId, { name: 'Curso de fotografía', status: 'planned' });
    await createProject(jhon, workspaceId, { name: 'Web antigua', status: 'completed' });

    const names = async (query: string) =>
      (await jhon.agent.get(`${url.projects}?${query}`).expect(200)).body.projects.map(
        (project: { name: string }) => project.name,
      );
    expect(await names('status=planned')).toEqual(['Curso de fotografía']);
    expect(await names('status=active,completed')).toEqual(['Web antigua', 'Marca personal']);
    expect(await names('priority=high')).toEqual(['Marca personal']);
    expect(await names('search=FOTO')).toEqual(['Curso de fotografía']);
    // La búsqueda es literal: no es una expresión regular.
    expect(await names('search=.*')).toEqual([]);
    const page = await jhon.agent.get(`${url.projects}?limit=1&offset=1`).expect(200);
    expect(page.body).toMatchObject({ total: 3, projects: [{ name: 'Curso de fotografía' }] });

    await jhon.agent.get(`${url.projects}?status=deleted`).expect(400);
    await jhon.agent.get(`${url.projects}?limit=1000`).expect(400);
  });

  it('edita un proyecto y valida las fechas contra lo guardado', async () => {
    const project = await createProject(jhon, workspaceId, {
      name: 'Marca personal',
      startDate: '2026-10-10T05:00:00.000Z',
    });
    const res = await jhon.agent
      .patch(`${url.projects}/${project.id}`)
      .send({ name: 'Marca personal 2027', status: 'on_hold', description: '' })
      .expect(200);
    expect(res.body.project).toMatchObject({
      name: 'Marca personal 2027',
      status: 'on_hold',
      description: null,
    });

    const invalid = await jhon.agent
      .patch(`${url.projects}/${project.id}`)
      .send({ dueDate: '2026-10-01T05:00:00.000Z' })
      .expect(400);
    expect(invalid.body.error.details).toEqual([
      { path: 'dueDate', message: 'La fecha límite no puede ser anterior a la fecha de inicio' },
    ]);
    await jhon.agent.patch(`${url.projects}/${project.id}`).send({}).expect(400);
    await jhon.agent.patch(`${url.projects}/${project.id}`).send({ progress: 50 }).expect(400);
  });

  it('el progreso se calcula de las tareas (sin canceladas) y cuenta el contenido', async () => {
    const project = await createProject(jhon, workspaceId, { name: 'Marca personal' });
    const projectId = project.id;
    await createTask(jhon, workspaceId, { title: 'A', projectId, status: 'done' });
    await createTask(jhon, workspaceId, { title: 'B', projectId, status: 'done' });
    await createTask(jhon, workspaceId, { title: 'C', projectId });
    await createTask(jhon, workspaceId, { title: 'D', projectId, status: 'cancelled' });
    await createTask(jhon, workspaceId, { title: 'Sin proyecto', status: 'done' });
    await createContent(jhon, workspaceId, { title: 'Reel', projectId });
    await createContent(jhon, workspaceId, { title: 'Viejo', projectId, status: 'archived' });

    const res = await jhon.agent.get(`${url.projects}/${projectId}`).expect(200);
    expect(res.body.project).toMatchObject({
      progress: 67,
      stats: { tasks: 3, completedTasks: 2, contentItems: 1 },
    });
    // La lista calcula lo mismo (dos agregaciones para toda la página, sin N+1).
    const list = await jhon.agent.get(url.projects).expect(200);
    expect(list.body.projects[0]).toMatchObject({ progress: 67, stats: { tasks: 3 } });
  });

  it('DELETE archiva: conserva tareas y contenido y lo oculta de la lista por defecto', async () => {
    const project = await createProject(jhon, workspaceId, { name: 'Marca personal' });
    const task = await createTask(jhon, workspaceId, { title: 'A', projectId: project.id });

    const res = await jhon.agent.delete(`${url.projects}/${project.id}`).expect(200);
    expect(res.body.project.status).toBe('archived');
    // Idempotente.
    await jhon.agent.delete(`${url.projects}/${project.id}`).expect(200);

    expect((await jhon.agent.get(url.projects).expect(200)).body.total).toBe(0);
    const archived = await jhon.agent.get(`${url.projects}?status=archived`).expect(200);
    expect(archived.body.projects).toHaveLength(1);
    const kept = await jhon.agent.get(`${url.tasks}/${task.id}`).expect(200);
    expect(kept.body.task.projectId).toBe(project.id);

    // Se puede desarchivar.
    await jhon.agent.patch(`${url.projects}/${project.id}`).send({ status: 'active' }).expect(200);
    expect((await jhon.agent.get(url.projects).expect(200)).body.total).toBe(1);
  });

  it('un id malformado o inexistente es 404', async () => {
    await jhon.agent.get(`${url.projects}/no-es-un-id`).expect(404);
    await jhon.agent.get(`${url.projects}/507f1f77bcf86cd799439011`).expect(404);
    await jhon.agent
      .patch(`${url.projects}/507f1f77bcf86cd799439011`)
      .send({ name: 'X' })
      .expect(404);
    await jhon.agent.delete(`${url.projects}/507f1f77bcf86cd799439011`).expect(404);
  });

  it('exige sesión', async () => {
    const { default: request } = await import('supertest');
    await request(app).get(url.projects).expect(401);
  });
});
