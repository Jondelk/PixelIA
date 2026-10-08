import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../lib/api';
import { queryString } from '../../lib/query';
import {
  contentFixture,
  OTHER_WORKSPACE_ID,
  projectFixture,
  taskFixture,
  WORKSPACE_ID,
} from '../../test/operationsFixtures';
import { createContentItem, listContent, updateContentItem } from './contentApi';
import { getOperationsSummary } from './operationsApi';
import { quickTaskInput } from './operationsForms';
import { archiveProject, createProject, getProject, listProjects } from './projectsApi';
import { completeTask, createTask, deleteTask, listTasks, reopenTask } from './tasksApi';

interface Call {
  url: string;
  method: string;
  body: unknown;
}

let calls: Call[] = [];
let respond: (call: Call) => { status: number; body?: unknown } = () => ({ status: 200 });

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const call = {
      url,
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const { status, body } = respond(call);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = `/api/workspaces/${WORKSPACE_ID}`;

describe('projectsApi', () => {
  it('crear un proyecto hace POST al workspace activo y valida la respuesta', async () => {
    respond = () => ({ status: 201, body: { project: projectFixture() } });
    const project = await createProject(WORKSPACE_ID, { name: 'Marca personal' });
    expect(project.name).toBe('Marca personal');
    expect(calls).toEqual([
      { url: `${base}/projects`, method: 'POST', body: { name: 'Marca personal' } },
    ]);
  });

  it('lista con filtros en la query (estados separados por comas)', async () => {
    respond = () => ({ status: 200, body: { projects: [], total: 0 } });
    await listProjects(WORKSPACE_ID, { status: ['active', 'planned'], search: 'marca' });
    expect(calls[0]?.url).toBe(`${base}/projects?status=active%2Cplanned&search=marca`);
  });

  it('archivar es DELETE y devuelve el proyecto archivado', async () => {
    respond = () => ({ status: 200, body: { project: projectFixture({ status: 'archived' }) } });
    expect((await archiveProject(WORKSPACE_ID, 'p1')).status).toBe('archived');
    expect(calls[0]).toMatchObject({ url: `${base}/projects/p1`, method: 'DELETE' });
  });

  it('un proyecto de otro workspace llega como 404 y no expone datos', async () => {
    respond = () => ({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' } },
    });
    const error = await getProject(OTHER_WORKSPACE_ID, 'p1').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, message: 'Proyecto no encontrado' });
    expect(calls[0]?.url).toBe(`/api/workspaces/${OTHER_WORKSPACE_ID}/projects/p1`);
  });

  it('rechaza respuestas que no cumplen el contrato', async () => {
    respond = () => ({ status: 200, body: { project: { id: 'x' } } });
    await expect(getProject(WORKSPACE_ID, 'p1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('tasksApi', () => {
  it('Quick Task: POST con solo el título', async () => {
    respond = () => ({ status: 201, body: { task: taskFixture({ status: 'inbox' }) } });
    const result = quickTaskInput({ title: 'Grabar intro' });
    if (!result.ok) throw new Error('quick task inválida');
    await createTask(WORKSPACE_ID, result.input);
    expect(calls[0]).toEqual({
      url: `${base}/tasks`,
      method: 'POST',
      body: {
        title: 'Grabar intro',
        projectId: null,
        priority: 'medium',
        dueDate: null,
        status: 'inbox',
      },
    });
  });

  it('completar y reabrir son PATCH de estado (la API gestiona completedAt)', async () => {
    respond = (call) => ({
      status: 200,
      body: { task: taskFixture({ status: (call.body as { status: 'done' | 'todo' }).status }) },
    });
    expect((await completeTask(WORKSPACE_ID, 't1')).status).toBe('done');
    expect((await reopenTask(WORKSPACE_ID, 't1')).status).toBe('todo');
    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ['PATCH', `${base}/tasks/t1`, { status: 'done' }],
      ['PATCH', `${base}/tasks/t1`, { status: 'todo' }],
    ]);
  });

  it('los filtros por fecha envían la zona horaria del navegador', async () => {
    respond = () => ({ status: 200, body: { tasks: [], total: 0 } });
    await listTasks(WORKSPACE_ID, { status: ['inbox', 'todo'], due: 'today', projectId: 'p1' });
    const url = new URL(calls[0]!.url, 'http://x');
    expect(url.pathname).toBe(`${base}/tasks`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: 'inbox,todo',
      due: 'today',
      projectId: 'p1',
      tzOffset: String(new Date().getTimezoneOffset()),
    });
  });

  it('eliminar es DELETE sin cuerpo de respuesta', async () => {
    respond = () => ({ status: 204 });
    await deleteTask(WORKSPACE_ID, 't1');
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: `${base}/tasks/t1` });
  });
});

describe('contentApi y resumen', () => {
  it('crear un ContentItem hace POST a /content', async () => {
    respond = () => ({ status: 201, body: { contentItem: contentFixture() } });
    await createContentItem(WORKSPACE_ID, { title: 'Reel', platform: 'instagram' });
    expect(calls[0]).toEqual({
      url: `${base}/content`,
      method: 'POST',
      body: { title: 'Reel', platform: 'instagram' },
    });
  });

  it('mover en el pipeline es PATCH de estado; los filtros van en la query', async () => {
    respond = (call) =>
      call.method === 'PATCH'
        ? { status: 200, body: { contentItem: contentFixture({ status: 'review' }) } }
        : { status: 200, body: { contentItems: [], total: 0 } };
    await updateContentItem(WORKSPACE_ID, 'c1', { status: 'review' });
    await listContent(WORKSPACE_ID, { platform: 'tiktok', format: 'reel' });
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { status: 'review' } });
    expect(calls[1]?.url).toBe(`${base}/content?platform=tiktok&format=reel`);
  });

  it('el resumen se pide para el workspace activo con su zona horaria', async () => {
    respond = () => ({
      status: 200,
      body: {
        summary: {
          counts: {
            activeProjects: 1,
            openTasks: 2,
            overdueTasks: 0,
            contentInProduction: 1,
            activeContentItems: 2,
          },
          upcomingTasks: [],
          recentProjects: [projectFixture()],
          upcomingContent: [],
        },
      },
    });
    const summary = await getOperationsSummary(WORKSPACE_ID);
    expect(summary.counts.openTasks).toBe(2);
    expect(calls[0]?.url).toMatch(new RegExp(`^${base}/operations/summary\\?tzOffset=-?\\d+$`));
  });
});

describe('queryString', () => {
  it('omite vacíos y une listas', () => {
    expect(queryString({ a: 'x', b: undefined, c: '', d: [], e: ['1', '2'], f: 0 })).toBe(
      '?a=x&e=1%2C2&f=0',
    );
    expect(queryString({})).toBe('');
  });
});
