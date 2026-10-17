import { createHash } from 'node:crypto';
import {
  AgendaResponseSchema,
  PixelCommandConfirmResponseSchema,
  PixelCommandResponseSchema,
  type AgendaView,
} from '@pixel/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import type { ToolExecutionContext } from '../src/modules/actions/action.types.js';
import { createDefaultToolRegistry } from '../src/modules/actions/tools/index.js';
import {
  taskEventRef,
  workspaceEventRef,
  type CalendarDeps,
} from '../src/modules/calendar/calendarConnection.service.js';
import { TaskModel } from '../src/modules/operations/task.model.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { FakeGoogleCalendar, TEST_CALENDAR_CONFIG } from './support/fakeGoogleCalendar.js';
import { createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';

/*
 * Prompt 20 · cierre: una tarea que Pixel ya organizó en bloques de Google Calendar NO aparece como
 * «Por organizar». El vínculo es una referencia opaca en la marca privada de cada bloque (nunca el
 * título), y como la agenda lee Google en el momento, si el bloque desaparece la tarea vuelve.
 */

useTestDatabase();

/** Miércoles 14 de octubre de 2026, 09:00 en Bogotá. */
const WEDNESDAY_9AM = new Date('2026-10-14T14:00:00Z');
let clock = WEDNESDAY_9AM;
const fake = new FakeGoogleCalendar();
const config = TEST_CALENDAR_CONFIG();
const app = buildTestApp(new DemoProvider(), undefined, {
  config,
  provider: fake,
  now: () => clock,
});
const deps: CalendarDeps = {
  config,
  provider: fake,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  now: () => clock,
};

beforeEach(() => {
  fake.reset();
  clock = WEDNESDAY_9AM;
});

type Session = Awaited<ReturnType<typeof registerUser>>;
const base = (ws: string) => `/api/workspaces/${ws}`;
const iso = (local: string) => new Date(`${local}-05:00`).toISOString();

async function connect(session: Session, ws: string) {
  const res = await session.agent
    .post(`${base(ws)}/calendar/connect`)
    .send({})
    .expect(200);
  const url = new URL(res.body.authUrl as string);
  await session.agent
    .get('/api/calendar/google/callback')
    .query({
      state: url.searchParams.get('state')!,
      code: fake.codeFor(url.searchParams.get('code_challenge')!),
    })
    .expect(303);
}

async function agenda(session: Session, ws: string, view = 'week'): Promise<AgendaView> {
  const res = await session.agent
    .get(`${base(ws)}/agenda`)
    .query({ view })
    .expect(200);
  return AgendaResponseSchema.parse(res.body).agenda;
}

async function task(session: Session, ws: string, title: string, due = '2026-10-16T12:00:00') {
  const res = await session.agent
    .post(`${base(ws)}/tasks`)
    .send({ title, dueDate: iso(due) })
    .expect(201);
  return res.body.task.id as string;
}

/** Un bloque de Pixel creado por la herramienta (con o sin la tarea que organiza). */
async function block(
  ws: string,
  title: string,
  start: string,
  end: string,
  key: string,
  taskId?: string,
) {
  const workspace = (await WorkspaceModel.findOne({ _id: ws }))!;
  const create = (await createDefaultToolRegistry(deps).resolve(
    'google.calendar',
    'create_event',
    workspace,
  ))!;
  const ctx: ToolExecutionContext = {
    workspace,
    contextType: workspace.type,
    actorUserId: workspace.ownerId.toString(),
    commandId: 'seed',
    executionId: 'seed',
    idempotencyKey: key,
  };
  const input = {
    summary: title,
    start: iso(start),
    end: iso(end),
    timezone: 'America/Bogota',
    ...(taskId ? { taskRef: taskEventRef(workspace, taskId) } : {}),
  };
  const result = await create.capability.execute(input, ctx);
  expect(await create.capability.verify(result, input, ctx)).toBe(true);
  return result.resourceRefs[0]!.id;
}

const pendingTitles = (view: AgendaView) => view.pendingItems.map((item) => item.title);

describe('Tarea ↔ bloque de Pixel en «Mi agenda»', () => {
  it('A. una tarea sin bloque aparece «Por organizar»', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    await task(ana, ws, 'Estudiar cálculo');
    expect(pendingTitles(await agenda(ana, ws))).toEqual(['Estudiar cálculo']);
  });

  it('B. organizarla desde la agenda (tarea en contexto) vincula el bloque: deja de estar «Por organizar», sigue pendiente', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    const id = await task(ana, ws, 'Estudiar cálculo');
    const res = await ana.agent
      .post(`${base(ws)}/pixel/commands`)
      .send({
        request: 'Quiero trabajar en «Estudiar cálculo» una vez esta semana',
        contextHint: { resource: { type: 'task', id } },
      })
      .expect(201);
    const command = PixelCommandResponseSchema.parse(res.body).command;
    expect(command.status).toBe('proposed');
    // Antes de confirmar: nada en Google y la tarea sigue por organizar.
    expect(fake.writes()).toBe(0);
    expect(pendingTitles(await agenda(ana, ws))).toEqual(['Estudiar cálculo']);
    const confirmed = await ana.agent
      .post(`${base(ws)}/pixel/commands/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(200);
    expect(PixelCommandConfirmResponseSchema.parse(confirmed.body).command.status).toBe(
      'completed',
    );
    // La marca privada lleva la referencia OPACA (ni el título ni el id de Mongo).
    const workspace = (await WorkspaceModel.findOne({ _id: ws }))!;
    const [event] = fake.pixelEvents();
    expect(event!.private.pixelTask).toBe(taskEventRef(workspace, id));
    expect(JSON.stringify(event!.private)).not.toContain(id);
    const view = await agenda(ana, ws);
    expect(pendingTitles(view)).toEqual([]);
    const pixel = view.items.find((item) => item.kind === 'pixel_block')!;
    expect(pixel.kindLabel).toBe('Organizado por Pixel');
    expect(pixel.link).toEqual({ type: 'task', id });
    // Programar no es completar.
    expect((await TaskModel.findOne({ _id: id, workspaceId: ws }))!.status).not.toBe('done');
  });

  it('C. una tarea con 3 bloques vinculados no se duplica ni aparece «Por organizar»', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    const id = await task(ana, ws, 'Estudiar cálculo', '2026-10-17T12:00:00');
    await block(ws, 'Estudiar cálculo', '2026-10-14T15:00:00', '2026-10-14T16:30:00', 'k:1', id);
    await block(ws, 'Estudiar cálculo', '2026-10-15T15:00:00', '2026-10-15T16:30:00', 'k:2', id);
    await block(ws, 'Estudiar cálculo', '2026-10-16T15:00:00', '2026-10-16T16:30:00', 'k:3', id);
    const view = await agenda(ana, ws);
    expect(pendingTitles(view)).toEqual([]);
    expect(view.items.filter((item) => item.kind === 'pixel_block')).toHaveLength(3);
    expect(await TaskModel.collection.countDocuments()).toBe(1);
  });

  it('D. dos tareas con el mismo título: la referencia distingue cuál está organizada', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    const a = await task(ana, ws, 'Estudiar cálculo', '2026-10-15T12:00:00');
    const b = await task(ana, ws, 'Estudiar cálculo', '2026-10-16T12:00:00');
    await block(ws, 'Estudiar cálculo', '2026-10-14T15:00:00', '2026-10-14T16:30:00', 'k:1', a);
    const view = await agenda(ana, ws);
    expect(view.pendingItems.map((item) => item.id)).toEqual([`task_${b}`]);
  });

  it('E. mover el bloque conserva el vínculo', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    const id = await task(ana, ws, 'Estudiar cálculo', '2026-10-17T12:00:00');
    const eventId = await block(
      ws,
      'Estudiar cálculo',
      '2026-10-14T15:00:00',
      '2026-10-14T16:30:00',
      'k:1',
      id,
    );
    const res = await ana.agent
      .post(`${base(ws)}/pixel/commands`)
      .send({ request: 'Muévelo al jueves a las 6.' })
      .expect(201);
    const command = PixelCommandResponseSchema.parse(res.body).command;
    await ana.agent
      .post(`${base(ws)}/pixel/commands/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(200);
    const moved = fake.events.get(eventId)!;
    expect(moved.start).toBe(iso('2026-10-15T18:00:00'));
    const workspace = (await WorkspaceModel.findOne({ _id: ws }))!;
    expect(moved.private.pixelTask).toBe(taskEventRef(workspace, id));
    expect(pendingTitles(await agenda(ana, ws))).toEqual([]);
  });

  it('F. si el bloque desaparece de Google (o ya terminó), la tarea vuelve a «Por organizar»', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    const id = await task(ana, ws, 'Estudiar cálculo', '2026-10-17T12:00:00');
    const eventId = await block(
      ws,
      'Estudiar cálculo',
      '2026-10-14T15:00:00',
      '2026-10-14T16:30:00',
      'k:1',
      id,
    );
    expect(pendingTitles(await agenda(ana, ws))).toEqual([]);
    fake.events.delete(eventId);
    expect(pendingTitles(await agenda(ana, ws))).toEqual(['Estudiar cálculo']);
    // Un bloque que ya pasó tampoco la cubre: el tiempo reservado ya se usó.
    await block(ws, 'Estudiar cálculo', '2026-10-14T06:00:00', '2026-10-14T07:30:00', 'k:2', id);
    expect(pendingTitles(await agenda(ana, ws))).toEqual(['Estudiar cálculo']);
  });

  it('G. un bloque genérico de Pixel (sin tarea) funciona igual y no cubre ninguna tarea', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    await task(ana, ws, 'Estudiar cálculo');
    await block(ws, 'Estudiar cálculo', '2026-10-14T15:00:00', '2026-10-14T16:30:00', 'k:1');
    const view = await agenda(ana, ws);
    expect(pendingTitles(view)).toEqual(['Estudiar cálculo']);
    const pixel = view.items.find((item) => item.kind === 'pixel_block')!;
    expect(pixel).toMatchObject({ movableByPixel: true, link: null });
    expect(fake.pixelEvents()[0]!.private.pixelTask).toBeUndefined();
  });

  it('H. entre workspaces: una referencia de otro Pixel nunca cubre la tarea, y la tarea de otro no entra en contexto', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    const id = await task(ana, ws, 'Estudiar cálculo', '2026-10-17T12:00:00');
    const workspace = (await WorkspaceModel.findOne({ _id: ws }))!;
    const bruno = await registerUser(app, 'Bruno');
    const other = await createPersonalWorkspace(bruno);
    const otherWorkspace = (await WorkspaceModel.findOne({ _id: other }))!;
    const crafted = (key: string, pixelWorkspace: string, pixelTask: string) =>
      fake.events.set(key, {
        id: key,
        summary: 'Estudiar cálculo',
        start: iso('2026-10-15T15:00:00'),
        end: iso('2026-10-15T16:30:00'),
        allDay: false,
        status: 'confirmed',
        transparent: false,
        private: { pixelManaged: 'true', pixelWorkspace, pixelAction: 'x', pixelTask },
      });
    // Un bloque de OTRO Pixel con la referencia correcta de esta tarea: no es de este Pixel.
    crafted('aaaa1', workspaceEventRef(otherWorkspace), taskEventRef(workspace, id));
    // Un bloque de ESTE Pixel con la referencia calculada para otro workspace: no coincide.
    crafted('aaaa2', workspaceEventRef(workspace), taskEventRef(otherWorkspace, id));
    expect(pendingTitles(await agenda(ana, ws))).toEqual(['Estudiar cálculo']);
    expect(taskEventRef(workspace, id)).not.toBe(taskEventRef(otherWorkspace, id));
    expect(taskEventRef(workspace, id)).toMatch(/^[a-f0-9]{32}$/);
    expect(taskEventRef(workspace, id)).not.toContain(
      createHash('sha256').update(id).digest('hex').slice(0, 32),
    );
    // Bruno no puede poner la tarea de Ana en contexto (400, sin revelar nada).
    await bruno.agent
      .post(`${base(other)}/pixel/commands`)
      .send({
        request: 'Quiero trabajar en esto una vez esta semana',
        contextHint: { resource: { type: 'task', id } },
      })
      .expect(400);
  });
});
