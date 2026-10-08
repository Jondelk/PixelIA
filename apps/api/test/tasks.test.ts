import { TaskListResponseSchema, TaskResponseSchema } from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { localDayBounds } from '../src/modules/operations/operations.scope.js';
import { TaskModel } from '../src/modules/operations/task.model.js';
import { createProject, createTask, daysFromNow, ops } from './support/operations.js';
import { createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

useTestDatabase();
const app = buildTestApp();

type Session = Awaited<ReturnType<typeof registerUser>>;

describe('Tasks', () => {
  let jhon: Session;
  let workspaceId: string;
  let url: ReturnType<typeof ops>;

  beforeEach(async () => {
    jhon = await registerUser(app, 'Jhon');
    workspaceId = await createPersonalWorkspace(jhon);
    url = ops(workspaceId);
  });

  it('crea una tarea sin proyecto (Quick Task): entra al inbox como manual', async () => {
    const res = await jhon.agent.post(url.tasks).send({ title: 'Grabar intro' }).expect(201);
    expect(TaskResponseSchema.parse(res.body).task).toMatchObject({
      workspaceId,
      projectId: null,
      title: 'Grabar intro',
      status: 'inbox',
      priority: 'medium',
      source: 'manual',
      completedAt: null,
      dueDate: null,
      tags: [],
    });
  });

  it('crea una tarea dentro de un proyecto del mismo workspace', async () => {
    const project = await createProject(jhon, workspaceId, { name: 'Marca personal' });
    const task = await createTask(jhon, workspaceId, {
      title: 'Escribir guion',
      projectId: project.id,
      priority: 'high',
      dueDate: daysFromNow(2),
      estimatedMinutes: 45,
      tags: ['guion'],
    });
    expect(task).toMatchObject({
      projectId: project.id,
      priority: 'high',
      estimatedMinutes: 45,
      tags: ['guion'],
    });
  });

  it('rechaza un proyecto de otro workspace o inexistente (mismo 400, sin revelar nada)', async () => {
    const ana = await registerUser(app, 'Ana');
    const anaWorkspace = await createPersonalWorkspace(ana, 'Ana');
    const foreign = await createProject(ana, anaWorkspace, { name: 'Proyecto de Ana' });

    for (const projectId of [foreign.id, '507f1f77bcf86cd799439011']) {
      const res = await jhon.agent
        .post(url.tasks)
        .send({ title: 'Colarme', projectId })
        .expect(400);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'projectId', message: 'Proyecto no encontrado' }],
      });
    }
    // Tampoco al editar.
    const task = await createTask(jhon, workspaceId, { title: 'Mía' });
    await jhon.agent.patch(`${url.tasks}/${task.id}`).send({ projectId: foreign.id }).expect(400);
    expect(await TaskModel.countDocuments({ workspaceId })).toBe(1);
    expect((await TaskModel.findOne({ _id: task.id, workspaceId }))?.projectId).toBeNull();
  });

  it('el workspaceId, source o completedAt del cuerpo son un 400', async () => {
    const other = await createPersonalWorkspace(await registerUser(app, 'Otra'), 'Otra');
    await jhon.agent.post(url.tasks).send({ title: 'X', workspaceId: other }).expect(400);
    await jhon.agent.post(url.tasks).send({ title: 'X', source: 'pixel' }).expect(400);
    await jhon.agent
      .post(url.tasks)
      .send({ title: 'X', completedAt: new Date().toISOString() })
      .expect(400);
    expect(await TaskModel.countDocuments({ workspaceId: other })).toBe(0);
  });

  it('completar fija completedAt; reabrir lo limpia; editar otra cosa no lo toca', async () => {
    const task = await createTask(jhon, workspaceId, { title: 'Editar video' });
    const done = await jhon.agent
      .patch(`${url.tasks}/${task.id}`)
      .send({ status: 'done' })
      .expect(200);
    expect(done.body.task.status).toBe('done');
    const completedAt = done.body.task.completedAt as string;
    expect(Date.now() - Date.parse(completedAt)).toBeLessThan(10_000);

    const renamed = await jhon.agent
      .patch(`${url.tasks}/${task.id}`)
      .send({ title: 'Editar video final', status: 'done' })
      .expect(200);
    expect(renamed.body.task.completedAt).toBe(completedAt);

    const reopened = await jhon.agent
      .patch(`${url.tasks}/${task.id}`)
      .send({ status: 'todo' })
      .expect(200);
    expect(reopened.body.task).toMatchObject({ status: 'todo', completedAt: null });

    const createdDone = await createTask(jhon, workspaceId, { title: 'Ya hecha', status: 'done' });
    expect(createdDone.completedAt).not.toBeNull();
  });

  it('edita prioridad, fecha y proyecto, y los puede quitar', async () => {
    const project = await createProject(jhon, workspaceId, { name: 'Marca personal' });
    const task = await createTask(jhon, workspaceId, { title: 'Tarea' });
    const dueDate = daysFromNow(3);
    const res = await jhon.agent
      .patch(`${url.tasks}/${task.id}`)
      .send({ priority: 'low', dueDate, projectId: project.id })
      .expect(200);
    expect(res.body.task).toMatchObject({ priority: 'low', dueDate, projectId: project.id });

    const cleared = await jhon.agent
      .patch(`${url.tasks}/${task.id}`)
      .send({ dueDate: null, projectId: null })
      .expect(200);
    expect(cleared.body.task).toMatchObject({ dueDate: null, projectId: null });
  });

  it('filtra por estado (uno o varios), prioridad, proyecto y búsqueda', async () => {
    const project = await createProject(jhon, workspaceId, { name: 'Marca personal' });
    await createTask(jhon, workspaceId, { title: 'Inbox' });
    await createTask(jhon, workspaceId, { title: 'Por hacer', status: 'todo', priority: 'high' });
    await createTask(jhon, workspaceId, {
      title: 'Hecha del proyecto',
      status: 'done',
      projectId: project.id,
    });

    const titles = async (query: string) =>
      TaskListResponseSchema.parse(
        (await jhon.agent.get(`${url.tasks}?${query}`).expect(200)).body,
      ).tasks.map((task) => task.title);
    expect(await titles('status=inbox')).toEqual(['Inbox']);
    expect(await titles('status=inbox,todo')).toEqual(['Por hacer', 'Inbox']);
    expect(await titles('status=done')).toEqual(['Hecha del proyecto']);
    expect(await titles(`projectId=${project.id}`)).toEqual(['Hecha del proyecto']);
    expect(await titles('priority=high')).toEqual(['Por hacer']);
    expect(await titles('search=proyecto')).toEqual(['Hecha del proyecto']);
    expect(await titles('')).toHaveLength(3);

    await jhon.agent.get(`${url.tasks}?status=nope`).expect(400);
    await jhon.agent.get(`${url.tasks}?projectId=abc`).expect(400);
  });

  it('filtra por vencimiento (hoy, vencidas, próximas) según el día local del usuario', async () => {
    const tzOffset = 300; // Bogotá (UTC-5)
    const { start } = localDayBounds(new Date(), tzOffset);
    const hour = 3_600_000;
    await createTask(jhon, workspaceId, {
      title: 'Vencida',
      dueDate: new Date(start.getTime() - hour).toISOString(),
    });
    await createTask(jhon, workspaceId, {
      title: 'Hoy',
      dueDate: new Date(start.getTime() + 12 * hour).toISOString(),
    });
    await createTask(jhon, workspaceId, {
      title: 'Mañana',
      dueDate: new Date(start.getTime() + 36 * hour).toISOString(),
    });
    await createTask(jhon, workspaceId, { title: 'Sin fecha' });

    const titles = async (due: string) =>
      (
        await jhon.agent.get(`${url.tasks}?due=${due}&tzOffset=${tzOffset}`).expect(200)
      ).body.tasks.map((task: { title: string }) => task.title);
    expect(await titles('today')).toEqual(['Hoy']);
    expect(await titles('overdue')).toEqual(['Vencida']);
    expect(await titles('upcoming')).toEqual(['Mañana']);
  });

  it('elimina una tarea (204) y luego es 404', async () => {
    const task = await createTask(jhon, workspaceId, { title: 'Borrar' });
    await jhon.agent.delete(`${url.tasks}/${task.id}`).expect(204);
    await jhon.agent.get(`${url.tasks}/${task.id}`).expect(404);
    await jhon.agent.delete(`${url.tasks}/${task.id}`).expect(404);
  });

  it('localDayBounds calcula el día local en UTC', () => {
    // 2026-10-07 02:00 UTC = 2026-10-06 21:00 en Bogotá.
    const now = new Date('2026-10-07T02:00:00.000Z');
    expect(localDayBounds(now, 300)).toEqual({
      start: new Date('2026-10-06T05:00:00.000Z'),
      end: new Date('2026-10-07T05:00:00.000Z'),
    });
    expect(localDayBounds(now, 0).start).toEqual(new Date('2026-10-07T00:00:00.000Z'));
    // Madrid en verano (UTC+2): ya es 07/10 a las 04:00.
    expect(localDayBounds(now, -120).start).toEqual(new Date('2026-10-06T22:00:00.000Z'));
  });
});
