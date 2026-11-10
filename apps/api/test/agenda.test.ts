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
import type { CalendarDeps } from '../src/modules/calendar/calendarConnection.service.js';
import { CalendarConnectionModel } from '../src/modules/calendar/calendarConnection.model.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { cafeTinto } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { FakeGoogleCalendar, TEST_CALENDAR_CONFIG } from './support/fakeGoogleCalendar.js';
import { createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

/*
 * «Mi agenda» (Prompt 20): modelo de lectura que combina Google (falso), los bloques de Pixel, las
 * tareas con fecha y las fechas límite. Solo lectura: abrir cualquier vista no escribe nada.
 */

useTestDatabase();

/** Miércoles 14 de octubre de 2026, 09:00 en Bogotá (semana del 12 al 18). */
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

async function agenda(
  session: Session,
  ws: string,
  query: Record<string, string | number> = {},
): Promise<AgendaView> {
  const res = await session.agent
    .get(`${base(ws)}/agenda`)
    .query(query)
    .expect(200);
  return AgendaResponseSchema.parse(res.body).agenda;
}

async function pixelBlock(ws: string, title: string, start: string, end: string, key: string) {
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
  await create.capability.execute(
    { summary: title, start: iso(start), end: iso(end), timezone: 'America/Bogota' },
    ctx,
  );
  fake.calls.insert = 0;
}

async function task(session: Session, ws: string, title: string, dueDate: string | null) {
  await session.agent
    .post(`${base(ws)}/tasks`)
    .send({ title, dueDate })
    .expect(201);
}

async function project(session: Session, ws: string, name: string, dueDate: string) {
  await session.agent
    .post(`${base(ws)}/projects`)
    .send({ name, dueDate })
    .expect(201);
}

/** Un día típico: clase pasada, bloque de Pixel, reunión, evento de todo el día y una tarea de hoy. */
async function typicalDay(session: Session, ws: string) {
  fake.addEvent({
    title: 'Clase de especialización',
    start: iso('2026-10-14T07:00:00'),
    end: iso('2026-10-14T08:30:00'),
  });
  await pixelBlock(ws, 'Avanzar Pixel', '2026-10-14T11:00:00', '2026-10-14T12:30:00', 'seed:1');
  fake.addEvent({
    title: 'Reunión',
    start: iso('2026-10-14T15:00:00'),
    end: iso('2026-10-14T16:00:00'),
  });
  fake.addEvent({
    title: 'Cumpleaños de Ana',
    start: '2026-10-14',
    end: '2026-10-15',
    allDay: true,
  });
  await task(session, ws, 'Entrega informe', iso('2026-10-14T12:00:00'));
  await task(session, ws, 'Pagar matrícula', iso('2026-10-10T12:00:00'));
}

describe('Mi agenda · Hoy', () => {
  it('combina Google, bloques de Pixel, tareas y vencidas, en orden y con sus etiquetas', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    await typicalDay(ana, ws);
    const view = await agenda(ana, ws, { view: 'today' });
    expect(view.timezone).toBe('America/Bogota');
    expect(view.today).toBe('2026-10-14');
    expect(view.title).toBe('Hoy · Miércoles 14 de octubre');
    expect(view.connection).toEqual({ status: 'connected', message: null });
    expect(
      view.items.map((item) => [item.title, item.kindLabel, item.timeLabel, item.status]),
    ).toEqual([
      ['Cumpleaños de Ana', 'Compromiso', 'Todo el día', 'now'],
      ['Clase de especialización', 'Compromiso', '07:00–08:30', 'past'],
      ['Avanzar Pixel', 'Organizado por Pixel', '11:00–12:30', 'upcoming'],
      ['Reunión', 'Compromiso', '15:00–16:00', 'upcoming'],
    ]);
    expect(view.items.find((item) => item.title === 'Avanzar Pixel')).toMatchObject({
      pixelManaged: true,
      movableByPixel: true,
    });
    expect(view.items.find((item) => item.title === 'Reunión')).toMatchObject({
      pixelManaged: false,
      movableByPixel: false,
    });
    // Todo el día: sin hora inventada (ni 00:00 ni 19:00 del día anterior por la zona).
    expect(view.items[0]).toMatchObject({
      allDay: true,
      start: null,
      end: null,
      date: '2026-10-14',
    });
    expect(
      view.pendingItems.map((item) => [
        item.title,
        item.kindLabel,
        item.statusLabel,
        item.timeLabel,
      ]),
    ).toEqual([
      ['Pagar matrícula', 'Por organizar', 'Vencida · por organizar', null],
      ['Entrega informe', 'Por organizar', 'Vence hoy', null],
    ]);
    expect(view.summary).toBe(
      'Hoy tienes 3 compromisos, 1 bloque organizado por Pixel y 2 pendientes por organizar. Lo próximo: «Avanzar Pixel» a las 11:00.',
    );
    expect(view.navigation).toEqual({
      previous: '2026-10-13',
      next: '2026-10-15',
      today: '2026-10-14',
    });
  });

  it('referencias controladas: ni ids del proveedor ni parámetros de calendario, usuario o evento', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    await typicalDay(ana, ws);
    const view = await agenda(ana, ws);
    const body = JSON.stringify(view);
    for (const id of fake.events.keys()) expect(body).not.toContain(id);
    expect(body).not.toMatch(/calendarId|primary|pixelWorkspace|pixelAction|token/);
    expect(
      view.items.every((item) => /^(evt_[a-f0-9]{20}|project_[a-f0-9]{24})$/.test(item.id)),
    ).toBe(true);
    for (const extra of [
      { calendarId: 'otro' },
      { eventId: 'user1event' },
      { userId: 'x' },
      { workspaceId: ws },
    ]) {
      await ana.agent
        .get(`${base(ws)}/agenda`)
        .query(extra)
        .expect(400);
    }
    await ana.agent
      .get(`${base(ws)}/agenda`)
      .query({ view: 'year' })
      .expect(400);
    await ana.agent
      .get(`${base(ws)}/agenda`)
      .query({ anchor: '14/10/2026' })
      .expect(400);
  });
});

describe('Mi agenda · Semana y Mes', () => {
  it('semana: solo lunes a domingo de ESA semana, en la zona del usuario', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    fake.addEvent({
      title: 'Domingo pasado',
      start: iso('2026-10-11T10:00:00'),
      end: iso('2026-10-11T11:00:00'),
    });
    fake.addEvent({
      title: 'Lunes',
      start: iso('2026-10-12T09:00:00'),
      end: iso('2026-10-12T10:00:00'),
    });
    // 23:30 del domingo en Bogotá = 04:30 UTC del lunes siguiente: es del domingo.
    fake.addEvent({
      title: 'Domingo noche',
      start: iso('2026-10-18T23:30:00'),
      end: iso('2026-10-18T23:59:00'),
    });
    fake.addEvent({
      title: 'Lunes siguiente',
      start: iso('2026-10-19T09:00:00'),
      end: iso('2026-10-19T10:00:00'),
    });
    await task(ana, ws, 'Tarea del jueves', iso('2026-10-15T12:00:00'));
    await task(ana, ws, 'Vencida', iso('2026-10-01T12:00:00'));
    await task(ana, ws, 'Del lunes', iso('2026-10-12T12:00:00'));
    const view = await agenda(ana, ws, { view: 'week' });
    expect(view.title).toBe('Semana del 12 al 18 de octubre');
    expect(view.days.map((day) => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(view.days.find((day) => day.isToday)?.date).toBe('2026-10-14');
    expect(view.items.map((item) => [item.title, item.date])).toEqual([
      ['Lunes', '2026-10-12'],
      ['Domingo noche', '2026-10-18'],
    ]);
    // En la semana, solo las tareas de la semana (las anteriores están en Hoy y Próximos); una
    // vencida de esta semana sigue en SU día, marcada como vencida (no se adelanta a hoy).
    expect(view.pendingItems.map((item) => [item.title, item.dates, item.statusLabel])).toEqual([
      ['Del lunes', ['2026-10-12'], 'Vencida · por organizar'],
      ['Tarea del jueves', ['2026-10-15'], 'Vence el 15 oct'],
    ]);
    const next = await agenda(ana, ws, { view: 'week', anchor: view.navigation.next! });
    expect(next.items.map((item) => item.title)).toEqual(['Lunes siguiente']);
  });

  it('mes: octubre, luego noviembre (solo ese rango), cuadrícula de semanas completas y varios días', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    fake.addEvent({ title: 'Congreso', start: '2026-10-21', end: '2026-10-24', allDay: true });
    fake.addEvent({
      title: 'Noviembre',
      start: iso('2026-11-12T10:00:00'),
      end: iso('2026-11-12T11:00:00'),
    });
    await project(ana, ws, 'Fondo Emprender', iso('2026-10-30T12:00:00'));
    const october = await agenda(ana, ws, { view: 'month', anchor: '2026-10-14' });
    expect(october.title).toBe('Octubre 2026');
    expect(october.range).toEqual({
      start: '2026-10-01T05:00:00.000Z',
      end: '2026-11-01T05:00:00.000Z',
    });
    expect(october.days).toHaveLength(35);
    expect(october.days[0]).toMatchObject({ date: '2026-09-28', inRange: false });
    expect(october.days.filter((day) => day.inRange)).toHaveLength(31);
    const congress = october.items.find((item) => item.title === 'Congreso')!;
    expect(congress).toMatchObject({
      multiDay: true,
      allDay: true,
      date: '2026-10-21',
      endDate: '2026-10-23',
      dayLabel: '21–23 de octubre',
    });
    expect(congress.dates).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
    const deadline = october.items.find((item) => item.kind === 'deadline')!;
    expect(deadline).toMatchObject({
      title: 'Fondo Emprender',
      kindLabel: 'Fecha límite',
      start: null,
      end: null,
      timeLabel: null,
      deadline: true,
    });
    expect(deadline.link?.type).toBe('project');
    expect(october.items.map((item) => item.title)).not.toContain('Noviembre');
    const november = await agenda(ana, ws, { view: 'month', anchor: october.navigation.next! });
    expect(november.title).toBe('Noviembre 2026');
    expect(november.items.map((item) => item.title)).toEqual(['Noviembre']);
  });
});

describe('Mi agenda · Próximos', () => {
  it('agrupa por esta semana, este mes, los meses siguientes y más adelante, dentro del horizonte', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    fake.addEvent({
      title: 'Entrega proyecto',
      start: iso('2026-10-16T10:00:00'),
      end: iso('2026-10-16T11:00:00'),
    });
    fake.addEvent({
      title: 'Parcial de cálculo',
      start: iso('2026-10-30T08:00:00'),
      end: iso('2026-10-30T10:00:00'),
    });
    fake.addEvent({
      title: 'Presentación Fondo Emprender',
      start: iso('2026-11-12T09:00:00'),
      end: iso('2026-11-12T10:00:00'),
    });
    fake.addEvent({
      title: 'Cierre semestre',
      start: '2026-12-15',
      end: '2026-12-16',
      allDay: true,
    });
    fake.addEvent({
      title: 'Evento programado',
      start: iso('2027-01-10T09:00:00'),
      end: iso('2027-01-10T10:00:00'),
    });
    fake.addEvent({
      title: 'Muy lejos',
      start: iso('2027-03-01T09:00:00'),
      end: iso('2027-03-01T10:00:00'),
    });
    await task(ana, ws, 'Vencida', iso('2026-10-01T12:00:00'));
    const view = await agenda(ana, ws, { view: 'upcoming' });
    expect(view.title).toBe('Próximos 90 días');
    expect(view.horizonDays).toBe(90);
    expect(view.canExtend).toBe(true);
    expect(view.groups).toEqual([
      'Vencidas',
      'Esta semana',
      'Este mes',
      'Noviembre',
      'Diciembre',
      'Más adelante',
    ]);
    const grouped = Object.fromEntries(
      view.groups.map((group) => [
        group,
        [...view.items, ...view.pendingItems]
          .filter((item) => item.group === group)
          .map((item) => item.title),
      ]),
    );
    expect(grouped).toEqual({
      Vencidas: ['Vencida'],
      'Esta semana': ['Entrega proyecto'],
      'Este mes': ['Parcial de cálculo'],
      Noviembre: ['Presentación Fondo Emprender'],
      Diciembre: ['Cierre semestre'],
      'Más adelante': ['Evento programado'],
    });
    expect(view.items.map((item) => item.title)).not.toContain('Muy lejos');
    const longer = await agenda(ana, ws, { view: 'upcoming', horizon: 180 });
    expect(longer.items.map((item) => item.title)).toContain('Muy lejos');
  });
});

describe('Mi agenda · Google sin conectar, caído o por reconectar', () => {
  it('sin conectar: la agenda interna sigue y pide conectar', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await task(ana, ws, 'Entrega informe', iso('2026-10-14T12:00:00'));
    const view = await agenda(ana, ws);
    expect(view.connection).toEqual({
      status: 'requires_auth',
      message: 'Conecta Google Calendar para incluir tus compromisos reales.',
    });
    expect(view.pendingItems.map((item) => item.title)).toEqual(['Entrega informe']);
    expect(fake.calls.list).toBe(0);
  });

  it('Google caído: aviso humano y lo interno sobrevive', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    await task(ana, ws, 'Entrega informe', iso('2026-10-14T12:00:00'));
    fake.down = true;
    const view = await agenda(ana, ws, { view: 'week' });
    expect(view.connection.status).toBe('unavailable');
    expect(view.connection.message).toBe(
      'No pude actualizar tus compromisos de Google en este momento. Tu agenda interna sigue disponible.',
    );
    expect(view.pendingItems.map((item) => item.title)).toEqual(['Entrega informe']);
  });

  it('requiere reconectar: aviso para volver a conectar y lo interno visible', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    await task(ana, ws, 'Entrega informe', iso('2026-10-14T12:00:00'));
    await CalendarConnectionModel.collection.updateOne(
      {},
      { $set: { accessTokenExpiresAt: new Date(0) } },
    );
    fake.revokeEverything();
    const view = await agenda(ana, ws);
    expect(view.connection).toEqual({
      status: 'requires_reauth',
      message: 'Necesito volver a conectar Google Calendar para actualizar tu agenda.',
    });
    expect(view.pendingItems).toHaveLength(1);
    expect((await agenda(ana, ws)).connection.status).toBe('requires_reauth');
  });

  it('sin configuración en la instalación: lo dice sin ofrecer OAuth', async () => {
    const bare = buildTestApp();
    const ana = await registerUser(bare, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    const res = await ana.agent.get(`${base(ws)}/agenda`).expect(200);
    expect(res.body.agenda.connection.status).toBe('unconfigured');
  });
});

describe('Mi agenda · aislamiento y solo lectura', () => {
  it('abrir Hoy, Semana, Mes y Próximos no escribe nada; Enterprise → 400; workspace ajeno → 404', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    await typicalDay(ana, ws);
    for (const view of ['today', 'week', 'month', 'upcoming']) await agenda(ana, ws, { view });
    expect(fake.writes()).toBe(0);
    await ana.agent
      .post(`${base(ws)}/agenda`)
      .send({})
      .expect(404);
    const companyId = await createCompany(ana, 'Café Tinto');
    await completeOnboarding(ana, companyId, cafeTinto);
    const enterprise = (await workspaceIdOf(companyId)).toString();
    const denied = await ana.agent.get(`${base(enterprise)}/agenda`).expect(400);
    expect(denied.body.error.details.reason).toBe('feature_not_available');
    const bruno = await registerUser(app, 'Bruno');
    await bruno.agent.get(`${base(ws)}/agenda`).expect(404);
  });
});

describe('Reorganizar con Pixel: «El jueves en la tarde no puedo.»', () => {
  it('propone mover solo los bloques de Pixel de esa franja; nada cambia hasta confirmar; luego verificado', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    await pixelBlock(
      ws,
      'Estudiar cálculo',
      '2026-10-15T15:00:00',
      '2026-10-15T16:30:00',
      'seed:1',
    );
    await pixelBlock(ws, 'Leer', '2026-10-15T09:00:00', '2026-10-15T10:00:00', 'seed:2');
    fake.addEvent({
      title: 'Clase',
      start: iso('2026-10-15T17:00:00'),
      end: iso('2026-10-15T18:00:00'),
    });
    const res = await ana.agent
      .post(`${base(ws)}/pixel/commands`)
      .send({ request: 'El jueves en la tarde no puedo.' })
      .expect(201);
    const command = PixelCommandResponseSchema.parse(res.body).command;
    expect(command.intent).toBe('replan_block');
    expect(command.status).toBe('proposed');
    expect(command.plan?.actions.map((action) => [action.kind, action.effect])).toEqual([
      ['calendar_event', 'update'],
    ]);
    expect(command.plan?.summary).toMatch(
      /Propongo mover el bloque que Pixel organizó el jueves por la tarde/,
    );
    expect(fake.writes()).toBe(0);
    const confirmed = await ana.agent
      .post(`${base(ws)}/pixel/commands/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(200);
    const done = PixelCommandConfirmResponseSchema.parse(confirmed.body).command;
    expect(done.status).toBe('completed');
    const moved = fake.pixelEvents().find((event) => event.summary === 'Estudiar cálculo')!;
    const start = Date.parse(moved.start);
    expect(
      start < Date.parse(iso('2026-10-15T12:00:00')) ||
        start >= Date.parse(iso('2026-10-15T19:00:00')),
    ).toBe(true);
    // La clase y el bloque de la mañana no se tocan.
    expect(fake.pixelEvents().find((event) => event.summary === 'Leer')?.start).toBe(
      iso('2026-10-15T09:00:00'),
    );
    expect([...fake.events.values()].find((event) => event.summary === 'Clase')?.start).toBe(
      iso('2026-10-15T17:00:00'),
    );
  });

  it('sin bloques de Pixel en la franja: lo dice y no propone nada', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    await connect(ana, ws);
    fake.addEvent({
      title: 'Clase',
      start: iso('2026-10-15T15:00:00'),
      end: iso('2026-10-15T16:00:00'),
    });
    const res = await ana.agent
      .post(`${base(ws)}/pixel/commands`)
      .send({ request: 'El jueves en la tarde no puedo.' })
      .expect(201);
    expect(res.body.command.status).toBe('answered');
    expect(res.body.command.reply).toMatch(
      /No tienes bloques organizados por Pixel el jueves por la tarde/,
    );
  });
});
