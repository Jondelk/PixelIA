import { randomBytes } from 'node:crypto';
import {
  CalendarConnectionResponseSchema,
  PixelCommandConfirmResponseSchema,
  PixelCommandResponseSchema,
  type PixelCommand,
} from '@pixel/contracts';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { createApp } from '../src/app.js';
import type { Logger } from '../src/lib/logger.js';
import type { ToolExecutionContext } from '../src/modules/actions/action.types.js';
import { createDefaultToolRegistry } from '../src/modules/actions/tools/index.js';
import {
  openCalendarSession,
  type CalendarDeps,
} from '../src/modules/calendar/calendarConnection.service.js';
import { CalendarConnectionModel } from '../src/modules/calendar/calendarConnection.model.js';
import { PixelCommandModel } from '../src/modules/pixel-command/pixelCommand.model.js';
import { WorkspaceModel } from '../src/modules/workspaces/workspace.model.js';
import { cafeTinto } from './fixtures/onboarding.js';
import { completeOnboarding, createCompany } from './support/brandBrain.js';
import { FakeGoogleCalendar, TEST_CALENDAR_CONFIG } from './support/fakeGoogleCalendar.js';
import { createPersonalWorkspace } from './support/personal.js';
import { buildTestApp, registerUser, testEnv, useTestDatabase } from './support/testApp.js';
import { workspaceIdOf } from './support/workspaces.js';

/*
 * Prompt 19 — Google Calendar + planificador de la semana, de punta a punta con un Google FALSO
 * (sin red): OAuth seguro, tokens cifrados, estados, lectura, propuesta sin escrituras, una
 * confirmación, escrituras idempotentes y verificadas, conflictos, mover bloques y replanificar.
 */

useTestDatabase();

/** Lunes 12 de octubre de 2026, 08:00 en Bogotá (la zona la da el Google Calendar conectado). */
const MONDAY_8AM = new Date('2026-10-12T13:00:00Z');
let clock = MONDAY_8AM;
const fake = new FakeGoogleCalendar();
const config = TEST_CALENDAR_CONFIG();
const calendar = { config, provider: fake, now: () => clock };
const app = buildTestApp(new DemoProvider(), undefined, calendar);

beforeEach(() => {
  fake.reset();
  clock = MONDAY_8AM;
});

type Session = Awaited<ReturnType<typeof registerUser>>;
const base = (ws: string) => `/api/workspaces/${ws}`;
const commands = (ws: string) => `${base(ws)}/pixel/commands`;
const iso = (local: string) => new Date(`${local}-05:00`).toISOString();

const status = async (session: Session, ws: string) =>
  CalendarConnectionResponseSchema.parse(
    (await session.agent.get(`${base(ws)}/calendar/connection`).expect(200)).body,
  ).connection;

/** Inicia el OAuth y devuelve el estado y el desafío PKCE de la URL de Google. */
async function start(session: Session, ws: string, returnTo: 'home' | 'pixel' = 'pixel') {
  const res = await session.agent
    .post(`${base(ws)}/calendar/connect`)
    .send({ returnTo })
    .expect(200);
  const url = new URL(res.body.authUrl as string);
  return {
    url,
    state: url.searchParams.get('state')!,
    challenge: url.searchParams.get('code_challenge')!,
  };
}

async function callback(session: Session | null, query: Record<string, string>) {
  const agent = session ? session.agent : request.agent(app);
  const res = await agent.get('/api/calendar/google/callback').query(query).expect(303);
  return res.headers.location as string;
}

/** Conecta Google Calendar con el flujo real (estado + PKCE) contra el Google falso. */
async function connect(session: Session, ws: string) {
  const { state, challenge } = await start(session, ws);
  return callback(session, { state, code: fake.codeFor(challenge) });
}

async function personalPixel(session: Session) {
  return createPersonalWorkspace(session);
}

async function ask(session: Session, ws: string, text: string) {
  const res = await session.agent
    .post(commands(ws))
    .send({ request: text, tzOffset: 300 })
    .expect(201);
  return PixelCommandResponseSchema.parse(res.body).command;
}

async function adjust(session: Session, ws: string, command: PixelCommand, message: string) {
  const res = await session.agent
    .post(`${commands(ws)}/${command.id}/adjust`)
    .send({ message })
    .expect(200);
  return PixelCommandResponseSchema.parse(res.body).command;
}

async function confirm(session: Session, ws: string, command: PixelCommand, revision?: number) {
  const res = await session.agent
    .post(`${commands(ws)}/${command.id}/confirm`)
    .send({ revision: revision ?? command.plan!.revision })
    .expect(200);
  return PixelCommandConfirmResponseSchema.parse(res.body);
}

const PARCIAL =
  'Organízame la semana: tengo parcial de cálculo el viernes, el miércoles tengo una reunión familiar y quiero estudiar tres veces.';

/** Clase el lunes 09–10 y reunión el martes 14–15 (eventos del usuario, no de Pixel). */
function usualWeek() {
  fake.addEvent({
    title: 'Clase de física',
    start: iso('2026-10-12T09:00:00'),
    end: iso('2026-10-12T10:00:00'),
  });
  fake.addEvent({
    title: 'Reunión de equipo',
    start: iso('2026-10-13T14:00:00'),
    end: iso('2026-10-13T15:00:00'),
  });
}

async function workspaceDoc(ws: string) {
  return (await WorkspaceModel.findOne({ _id: ws }))!;
}

function toolCtx(
  workspace: Awaited<ReturnType<typeof workspaceDoc>>,
  key: string,
): ToolExecutionContext {
  return {
    workspace,
    contextType: workspace.type,
    actorUserId: workspace.ownerId.toString(),
    commandId: 'test',
    executionId: 'test',
    idempotencyKey: key,
  };
}

const deps: CalendarDeps = {
  config,
  provider: fake,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  now: () => clock,
};

describe('Conexión: estados y seguridad del OAuth', () => {
  it('sin configuración en la instalación → «sin configurar», sin OAuth, y la API sigue funcionando', async () => {
    const bare = buildTestApp();
    const session = await registerUser(bare, 'Ana');
    const ws = await personalPixel(session);
    const res = await session.agent.get(`${base(ws)}/calendar/connection`).expect(200);
    expect(res.body.connection).toMatchObject({
      status: 'unconfigured',
      connected: false,
      scopes: [],
    });
    const start = await session.agent
      .post(`${base(ws)}/calendar/connect`)
      .send({})
      .expect(409);
    expect(start.body.error.details.reason).toBe('calendar_unconfigured');
    await session.agent.get('/api/health').expect(200);
  });

  it('configurada y sin conectar → requires_auth; Enterprise → 400; workspace ajeno → 404', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    expect((await status(ana, ws)).status).toBe('requires_auth');
    const companyId = await createCompany(ana, 'Café Tinto');
    await completeOnboarding(ana, companyId, cafeTinto);
    const enterprise = (await workspaceIdOf(companyId)).toString();
    const denied = await ana.agent.get(`${base(enterprise)}/calendar/connection`).expect(400);
    expect(denied.body.error.details.reason).toBe('feature_not_available');
    const bruno = await registerUser(app, 'Bruno');
    await bruno.agent.get(`${base(ws)}/calendar/connection`).expect(404);
    await bruno.agent
      .post(`${base(ws)}/calendar/connect`)
      .send({})
      .expect(404);
  });

  it('PKCE S256, scopes mínimos, callback a una ruta interna y tokens cifrados que nunca salen', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    const { url, state, challenge } = await start(ana, ws, 'home');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('scope')!.split(' ').sort()).toEqual([
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.freebusy',
      'https://www.googleapis.com/auth/calendar.settings.readonly',
    ]);
    expect(state.length).toBeGreaterThanOrEqual(40);
    // Solo se guarda el hash del nonce, nunca el valor.
    const saved = await mongoose.connection.collection('calendar_oauth_states').findOne({});
    expect(JSON.stringify(saved)).not.toContain(state);
    expect(saved?.codeVerifierSealed).toMatch(/^v1\./);

    const location = await callback(ana, { state, code: fake.codeFor(challenge) });
    expect(location).toBe(`/workspace/${ws}?calendar=connected`);
    const view = await status(ana, ws);
    expect(view).toMatchObject({
      status: 'connected',
      connected: true,
      timezone: 'America/Bogota',
    });
    expect(view.scopes.length).toBe(4);

    const raw = await CalendarConnectionModel.collection.findOne({});
    expect(raw?.refreshTokenSealed).toMatch(/^v1\./);
    expect(JSON.stringify(raw)).not.toMatch(/refresh-\d|access-\d/);
    const body = JSON.stringify((await ana.agent.get(`${base(ws)}/calendar/connection`)).body);
    expect(body).not.toMatch(/refresh|access-|Sealed|token/i);
  });

  it('estado repetido, inventado o caducado → error humano, sin conectar', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    const first = await start(ana, ws);
    await callback(ana, { state: first.state, code: fake.codeFor(first.challenge) });
    expect(await callback(ana, { state: first.state, code: fake.codeFor(first.challenge) })).toBe(
      '/dashboard?calendar=error&reason=state_replayed',
    );
    expect(await callback(ana, { state: 'x'.repeat(43), code: 'c' })).toBe(
      '/dashboard?calendar=error&reason=state_invalid',
    );
    expect(await callback(ana, { code: 'c' })).toBe(
      '/dashboard?calendar=error&reason=state_invalid',
    );

    const bruno = await registerUser(app, 'Bruno');
    const bws = await personalPixel(bruno);
    const late = await start(bruno, bws);
    clock = new Date(MONDAY_8AM.getTime() + 11 * 60_000);
    expect(await callback(bruno, { state: late.state, code: fake.codeFor(late.challenge) })).toBe(
      '/dashboard?calendar=error&reason=state_expired',
    );
    expect((await status(bruno, bws)).status).toBe('requires_auth');
  });

  it('el estado de otro usuario (o sin sesión) no conecta nada: el workspace sale del servidor', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    const anaState = await start(ana, ws);
    const bruno = await registerUser(app, 'Bruno');
    expect(
      await callback(bruno, { state: anaState.state, code: fake.codeFor(anaState.challenge) }),
    ).toBe('/dashboard?calendar=error&reason=session_mismatch');
    const other = await start(ana, ws);
    expect(await callback(null, { state: other.state, code: fake.codeFor(other.challenge) })).toBe(
      '/dashboard?calendar=error&reason=session_mismatch',
    );
    expect((await status(ana, ws)).status).toBe('requires_auth');
    expect(await CalendarConnectionModel.collection.countDocuments()).toBe(0);
  });

  it('sin open redirect: returnTo es una lista cerrada y el cliente no elige workspace ni destino', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await ana.agent
      .post(`${base(ws)}/calendar/connect`)
      .send({ returnTo: 'https://evil.test' })
      .expect(400);
    await ana.agent
      .post(`${base(ws)}/calendar/connect`)
      .send({ returnTo: 'pixel', workspaceId: ws })
      .expect(400);
    const { state, challenge } = await start(ana, ws);
    const location = await callback(ana, {
      state,
      code: fake.codeFor(challenge),
      redirect_uri: 'https://evil.test',
      returnTo: 'https://evil.test',
    });
    expect(location).toBe(`/workspace/${ws}/pixel?calendar=connected`);
  });

  it('permiso denegado, canje fallido, sin refresh token o scopes insuficientes → mensaje y nada guardado', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    let flow = await start(ana, ws);
    expect(await callback(ana, { state: flow.state, error: 'access_denied' })).toBe(
      `/workspace/${ws}/pixel?calendar=error&reason=denied`,
    );
    flow = await start(ana, ws);
    expect(await callback(ana, { state: flow.state, code: 'codigo-equivocado' })).toBe(
      `/workspace/${ws}/pixel?calendar=error&reason=exchange_failed`,
    );
    fake.omitRefreshToken = true;
    flow = await start(ana, ws);
    expect(await callback(ana, { state: flow.state, code: fake.codeFor(flow.challenge) })).toBe(
      `/workspace/${ws}/pixel?calendar=error&reason=missing_refresh_token`,
    );
    fake.omitRefreshToken = false;
    fake.grantedScopes = ['https://www.googleapis.com/auth/calendar.events'];
    flow = await start(ana, ws);
    expect(await callback(ana, { state: flow.state, code: fake.codeFor(flow.challenge) })).toBe(
      `/workspace/${ws}/pixel?calendar=error&reason=insufficient_scope`,
    );
    expect(fake.calls.revoke).toBe(1);
    expect(await CalendarConnectionModel.collection.countDocuments()).toBe(0);
  });

  it('desconectar revoca, borra los tokens y no toca los eventos', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    fake.addEvent({
      title: 'Clase',
      start: iso('2026-10-12T09:00:00'),
      end: iso('2026-10-12T10:00:00'),
    });
    const res = await ana.agent.post(`${base(ws)}/calendar/disconnect`).expect(200);
    expect(res.body.connection.status).toBe('requires_auth');
    expect(fake.calls.revoke).toBe(1);
    const raw = await CalendarConnectionModel.collection.findOne({});
    expect(raw).toMatchObject({
      status: 'disconnected',
      refreshTokenSealed: null,
      accessTokenSealed: null,
    });
    expect(fake.events.size).toBe(1);
  });
});

describe('Tokens: renovación, clave equivocada, revocación y caídas', () => {
  it('un access token caducado se renueva una vez (centralizado) y la lectura funciona', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    await CalendarConnectionModel.collection.updateOne(
      {},
      { $set: { accessTokenExpiresAt: new Date(MONDAY_8AM.getTime() - 60_000) } },
    );
    usualWeek();
    const command = await ask(ana, ws, PARCIAL);
    expect(command.status).toBe('proposed');
    expect(fake.calls.refresh).toBe(1);
  });

  it('refresh token revocado → «Necesito volver a conectar tu Google Calendar», sin bucle', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    fake.revokeEverything();
    const first = await ask(ana, ws, PARCIAL);
    expect(first.status).toBe('answered');
    expect(first.reply).toBe('Necesito volver a conectar tu Google Calendar.');
    expect(first.connect).toEqual({ provider: 'google_calendar', status: 'requires_reauth' });
    expect((await status(ana, ws)).status).toBe('requires_reauth');
    const refreshes = fake.calls.refresh;
    const second = await ask(ana, ws, PARCIAL);
    expect(second.connect?.status).toBe('requires_reauth');
    expect(fake.calls.refresh).toBe(refreshes);
  });

  it('con otra clave de cifrado los tokens no sirven: requires_reauth, nunca un token en claro', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    await CalendarConnectionModel.collection.updateOne(
      {},
      { $set: { accessTokenExpiresAt: new Date(0) } },
    );
    await expect(
      openCalendarSession(await workspaceDoc(ws), {
        ...deps,
        config: { ...config, encryptionKey: randomBytes(32) },
      }).then((s) =>
        s.freeBusy({
          start: MONDAY_8AM.toISOString(),
          end: new Date(MONDAY_8AM.getTime() + 3600_000).toISOString(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'calendar_requires_reauth' });
    expect((await status(ana, ws)).status).toBe('requires_reauth');
  });

  it('Google caído → «no disponible»: sin propuesta y sin inventar disponibilidad', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    fake.down = true;
    const command = await ask(ana, ws, PARCIAL);
    expect(command.status).toBe('answered');
    expect(command.plan).toBeNull();
    expect(command.weekPlan).toBeNull();
    expect(command.reply).toMatch(/no responde ahora mismo/);
  });
});

describe('Personal Week Planner con PixelCommand', () => {
  it('sin conectar → pide conectar; sin configurar → lo dice; nunca inventa eventos', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    const command = await ask(ana, ws, PARCIAL);
    expect(command.intent).toBe('plan_week');
    expect(command.status).toBe('answered');
    expect(command.reply).toBe(
      'Para consultar tu disponibilidad necesito conectar tu Google Calendar.',
    );
    expect(command.connect).toEqual({ provider: 'google_calendar', status: 'requires_auth' });
    expect(command.weekPlan).toBeNull();
    expect(fake.calls.list + fake.calls.freeBusy).toBe(0);

    const bare = buildTestApp();
    const bruno = await registerUser(bare, 'Bruno');
    const bws = await personalPixel(bruno);
    const res = await bruno.agent.post(commands(bws)).send({ request: PARCIAL }).expect(201);
    expect(res.body.command.reply).toBe(
      'Google Calendar todavía no está configurado en esta instalación de Pixel.',
    );
    expect(res.body.command.connect.status).toBe('unconfigured');
  });

  it('lee el calendario real (clase 09–10 y reunión 14–15) con las capacidades de lectura', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    usualWeek();
    const registry = createDefaultToolRegistry(deps);
    const workspace = await workspaceDoc(ws);
    const range = { start: iso('2026-10-12T00:00:00'), end: iso('2026-10-14T00:00:00') };
    const list = await registry.resolve('google.calendar', 'list_events', workspace);
    const listed = await list!.capability.execute(range, toolCtx(workspace, 'read'));
    expect(
      (listed.output as { events: { title: string; pixelOwned: boolean }[] }).events.map((e) => [
        e.title,
        e.pixelOwned,
      ]),
    ).toEqual([
      ['Clase de física', false],
      ['Reunión de equipo', false],
    ]);
    const free = await registry.resolve('google.calendar', 'find_availability', workspace);
    expect(free!.authorization).toBe('none');
    const busy = await free!.capability.execute(range, toolCtx(workspace, 'read'));
    expect((busy.output as { busy: unknown[] }).busy).toHaveLength(2);
    expect(fake.writes()).toBe(0);
  });

  it('parcial el viernes + reunión el miércoles + 3 sesiones → 3 bloques, 0 escrituras; «Guardar semana» → 3/3 verificados', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    usualWeek();
    const command = await ask(ana, ws, PARCIAL);
    expect(command.intent).toBe('plan_week');
    expect(command.status).toBe('proposed');
    expect(command.weekPlan?.blocks).toHaveLength(3);
    expect(command.weekPlan?.timezone).toBe('America/Bogota');
    expect(command.weekPlan?.fixedCommitments).toBe(2);
    expect(command.weekPlan?.assumptions[0]).toBe(
      'He reservado bloques de 90 minutos porque no indicaste la duración.',
    );
    expect(command.weekPlan?.blocks.map((b) => b.dayLabel)).toEqual([
      'Lunes 12 de octubre',
      'Martes 13 de octubre',
      'Jueves 15 de octubre',
    ]);
    expect(command.plan?.actions.map((a) => [a.kind, a.effect, a.status])).toEqual([
      ['calendar_event', 'create', 'pending'],
      ['calendar_event', 'create', 'pending'],
      ['calendar_event', 'create', 'pending'],
    ]);
    // Planificar no escribe nada en Google.
    expect(fake.writes()).toBe(0);
    expect(JSON.stringify(command)).not.toMatch(/calendarId|primary|refresh|access-/);

    const result = await confirm(ana, ws, command);
    expect(result.executed).toBe(true);
    expect(result.command.status).toBe('completed');
    expect(result.command.reply).toBe('3 de 3 bloques guardados y comprobados en Google Calendar.');
    expect(fake.pixelEvents()).toHaveLength(3);
    expect(fake.calls.insert).toBe(3);
    const doc = await PixelCommandModel.collection.findOne({
      _id: new mongoose.Types.ObjectId(command.id),
    });
    expect(doc?.actionResults.every((r: { verified: boolean }) => r.verified)).toBe(true);
    // Nada de tokens en el comando (ni en el snapshot autorizado ni en los resultados).
    expect(JSON.stringify(doc)).not.toMatch(/refresh-\d|access-\d|Sealed/);

    // Reintento (doble clic): no ejecuta otra vez ni duplica.
    const again = await confirm(ana, ws, command);
    expect(again.executed).toBe(false);
    expect(fake.pixelEvents()).toHaveLength(3);
  });

  it('sin disponibilidad suficiente → 2 programadas y 1 sin programar, explicado', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    usualWeek();
    fake.addEvent({
      title: 'Práctica todo el día',
      start: iso('2026-10-13T07:00:00'),
      end: iso('2026-10-13T22:00:00'),
    });
    const command = await ask(ana, ws, PARCIAL);
    expect(command.weekPlan?.blocks).toHaveLength(2);
    expect(command.weekPlan?.unscheduled).toEqual([
      {
        title: 'Estudiar cálculo',
        reason: 'No encontré otro hueco libre de 90 minutos antes del viernes.',
      },
    ]);
    expect(command.plan?.summary).toMatch(/1 no cupo/);
  });

  it('un compromiso nuevo en el hueco antes de guardar → calendar_conflict, nunca otro horario por su cuenta', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    usualWeek();
    const command = await ask(ana, ws, PARCIAL);
    const tuesday = command.weekPlan!.blocks[1]!;
    fake.addEvent({ title: 'Cita médica', start: tuesday.start, end: tuesday.end });
    const result = await confirm(ana, ws, command);
    expect(result.command.status).toBe('partial');
    expect(result.command.reply).toBe(
      'Guardé 2 de los 3 bloques. No pude guardar el del martes (ese horario ya no está libre: apareció otro compromiso). Puedes reintentarlo: lo que ya está guardado no se duplica.',
    );
    expect(result.command.plan?.actions[1]?.status).toBe('failed');
    expect(fake.pixelEvents()).toHaveLength(2);
  });

  it('desconectar antes de confirmar → no se ejecuta nada (requires_auth)', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    usualWeek();
    const command = await ask(ana, ws, PARCIAL);
    await ana.agent.post(`${base(ws)}/calendar/disconnect`).expect(200);
    const res = await ana.agent
      .post(`${commands(ws)}/${command.id}/confirm`)
      .send({ revision: command.plan!.revision })
      .expect(409);
    expect(res.body.error.details.reason).toBe('action_requires_auth');
    expect(fake.writes()).toBe(0);
  });

  it('«Ajustar»: «Ese bloque del martes pásalo al jueves» → revisión nueva; la anterior ya no se ejecuta', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    usualWeek();
    const first = await ask(ana, ws, PARCIAL);
    const adjusted = await adjust(ana, ws, first, 'Ese bloque del martes pásalo al jueves');
    expect(adjusted.status).toBe('proposed');
    expect(adjusted.plan?.revision).toBe(first.plan!.revision + 1);
    const days = adjusted.weekPlan!.blocks.map((b) => b.dayLabel);
    expect(days).not.toContain('Martes 13 de octubre');
    expect(days.filter((d) => d === 'Jueves 15 de octubre')).toHaveLength(2);
    const [a, b, c] = adjusted.weekPlan!.blocks.map(
      (block) => [Date.parse(block.start), Date.parse(block.end)] as const,
    );
    expect(b![0]).toBeGreaterThanOrEqual(a![1]);
    expect(c![0]).toBeGreaterThanOrEqual(b![1]);
    const stale = await ana.agent
      .post(`${commands(ws)}/${first.id}/confirm`)
      .send({ revision: first.plan!.revision })
      .expect(409);
    expect(stale.body.error.details.reason).toBe('pixel_command_revision_changed');
    expect(fake.writes()).toBe(0);
    const saved = await confirm(ana, ws, adjusted);
    expect(saved.command.reply).toBe('3 de 3 bloques guardados y comprobados en Google Calendar.');
  });

  it('Enterprise no tiene planificador de calendario', async () => {
    const ana = await registerUser(app, 'Ana');
    const companyId = await createCompany(ana, 'Café Tinto');
    await completeOnboarding(ana, companyId, cafeTinto);
    const enterprise = (await workspaceIdOf(companyId)).toString();
    const command = await ask(ana, enterprise, PARCIAL);
    expect(command.intent).not.toBe('plan_week');
    expect(command.weekPlan).toBeNull();
    expect(fake.calls.list + fake.calls.freeBusy).toBe(0);
  });
});

describe('create_event: idempotencia externa (sin deduplicar por título)', () => {
  const input = {
    summary: 'Estudiar cálculo',
    start: iso('2026-10-14T10:00:00'),
    end: iso('2026-10-14T11:30:00'),
    timezone: 'America/Bogota',
  };

  it('reintento tras crear (caída) → 1 evento; concurrente → 1; otra acción con el mismo título → 2', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    const workspace = await workspaceDoc(ws);
    const create = (await createDefaultToolRegistry(deps).resolve(
      'google.calendar',
      'create_event',
      workspace,
    ))!;
    const ctx = toolCtx(workspace, 'cmd:1:step_1.block_1');
    const once = await create.capability.execute(input, ctx);
    const retry = await create.capability.execute(input, ctx);
    expect(retry.resourceRefs[0]?.id).toBe(once.resourceRefs[0]?.id);
    expect(retry.summary).toMatch(/ya estaba guardado/);
    expect(await create.capability.verify(retry, input, ctx)).toBe(true);
    expect(fake.pixelEvents()).toHaveLength(1);

    const ctx2 = toolCtx(workspace, 'cmd:1:step_1.block_2');
    const later = { ...input, start: iso('2026-10-14T12:00:00'), end: iso('2026-10-14T13:30:00') };
    await Promise.all([
      create.capability.execute(later, ctx2),
      create.capability.execute(later, ctx2),
    ]);
    expect(fake.pixelEvents()).toHaveLength(2);

    const ctx3 = toolCtx(workspace, 'cmd:2:step_1.block_1');
    const other = { ...input, start: iso('2026-10-14T15:00:00'), end: iso('2026-10-14T16:30:00') };
    await create.capability.execute(other, ctx3);
    expect(fake.pixelEvents().filter((e) => e.summary === 'Estudiar cálculo')).toHaveLength(3);
  });

  it('la entrada es estricta: sin calendarId, eventId ni campos extra del cliente', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    const workspace = await workspaceDoc(ws);
    const create = (await createDefaultToolRegistry(deps).resolve(
      'google.calendar',
      'create_event',
      workspace,
    ))!;
    for (const extra of [{ calendarId: 'otro' }, { id: 'abc' }, { workspaceId: ws }]) {
      expect(create.capability.inputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    expect(
      create.capability.inputSchema.safeParse({ ...input, timezone: 'Mars/Base' }).success,
    ).toBe(false);
    expect(create.capability.inputSchema.safeParse({ ...input, end: input.start }).success).toBe(
      false,
    );
    expect(create.authorization).toBe('confirm');
  });
});

describe('Mover y replanificar bloques de Pixel', () => {
  async function pixelBlock(ws: string, title: string, start: string, end: string, key: string) {
    const workspace = await workspaceDoc(ws);
    const create = (await createDefaultToolRegistry(deps).resolve(
      'google.calendar',
      'create_event',
      workspace,
    ))!;
    const result = await create.capability.execute(
      { summary: title, start: iso(start), end: iso(end), timezone: 'America/Bogota' },
      toolCtx(workspace, key),
    );
    fake.calls.insert = 0;
    return result.resourceRefs[0]!.id;
  }

  it('martes 16:00–17:30 + «Muévelo al jueves a las 6.» → jueves 18:00, el mismo evento, verificado', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    const id = await pixelBlock(
      ws,
      'Estudiar cálculo',
      '2026-10-13T16:00:00',
      '2026-10-13T17:30:00',
      'seed:1',
    );
    const command = await ask(ana, ws, 'Muévelo al jueves a las 6.');
    expect(command.intent).toBe('replan_block');
    expect(command.status).toBe('proposed');
    expect(command.plan?.actions[0]).toMatchObject({ kind: 'calendar_event', effect: 'update' });
    expect(command.weekPlan?.blocks[0]).toMatchObject({
      dayLabel: 'Jueves 15 de octubre',
      timeLabel: '18:00–19:30',
    });
    expect(fake.writes()).toBe(0);
    const result = await confirm(ana, ws, command);
    expect(result.command.status).toBe('completed');
    expect(result.command.reply).toBe(
      'Listo. Moví el bloque a jueves 15 de octubre, 18:00–19:30 y lo comprobé en Google Calendar.',
    );
    expect(fake.events.get(id)).toMatchObject({
      start: iso('2026-10-15T18:00:00'),
      end: iso('2026-10-15T19:30:00'),
    });
    expect(fake.pixelEvents()).toHaveLength(1);
  });

  it('un evento que no es de Pixel nunca se mueve', async () => {
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    const userEvent = fake.addEvent({
      title: 'Clase de física',
      start: iso('2026-10-13T16:00:00'),
      end: iso('2026-10-13T17:30:00'),
    });
    const command = await ask(ana, ws, 'Muévelo al jueves a las 6.');
    expect(command.status).toBe('answered');
    expect(command.reply).toMatch(/Solo muevo los bloques que Pixel guardó/);
    const workspace = await workspaceDoc(ws);
    const update = (await createDefaultToolRegistry(deps).resolve(
      'google.calendar',
      'update_event',
      workspace,
    ))!;
    await expect(
      update.capability.execute(
        {
          eventId: userEvent,
          start: iso('2026-10-15T18:00:00'),
          end: iso('2026-10-15T19:30:00'),
          timezone: 'America/Bogota',
        },
        toolCtx(workspace, 'x'),
      ),
    ).rejects.toMatchObject({ code: 'calendar_permission_denied' });
    expect(fake.calls.patch).toBe(0);
  });

  it('«No pude estudiar hoy.» con un bloque hoy → propone el primer hueco desde mañana; con dos → una pregunta', async () => {
    clock = new Date(iso('2026-10-13T18:00:00'));
    const ana = await registerUser(app, 'Ana');
    const ws = await personalPixel(ana);
    await connect(ana, ws);
    await pixelBlock(
      ws,
      'Estudiar cálculo',
      '2026-10-13T16:00:00',
      '2026-10-13T17:30:00',
      'seed:1',
    );
    const single = await ask(ana, ws, 'No pude estudiar hoy.');
    expect(single.intent).toBe('replan_block');
    expect(single.status).toBe('proposed');
    expect(single.weekPlan?.blocks[0]).toMatchObject({
      dayLabel: 'Miércoles 14 de octubre',
      timeLabel: '08:00–09:30',
    });

    await pixelBlock(ws, 'Leer historia', '2026-10-13T19:00:00', '2026-10-13T20:00:00', 'seed:2');
    const ambiguous = await ask(ana, ws, 'No pude estudiar hoy.');
    expect(ambiguous.status).toBe('needs_information');
    expect(ambiguous.question).toMatch(
      /^¿Cuál bloque muevo: «Estudiar cálculo» del martes .* o «Leer historia» del martes/,
    );
    const answered = await adjust(ana, ws, ambiguous, 'El de cálculo');
    expect(answered.status).toBe('proposed');
    expect(answered.plan?.proposal[0]).toMatch(/Estudiar cálculo/);
    expect(fake.writes()).toBe(0);
  });
});

describe('Nada sensible en los logs', () => {
  it('ni tokens, ni el código de OAuth, ni el client secret', async () => {
    const lines: string[] = [];
    const capture: Logger = {
      debug: (m, meta) => lines.push(`${m} ${JSON.stringify(meta ?? {})}`),
      info: (m, meta) => lines.push(`${m} ${JSON.stringify(meta ?? {})}`),
      warn: (m, meta) => lines.push(`${m} ${JSON.stringify(meta ?? {})}`),
      error: (m, meta) => lines.push(`${m} ${JSON.stringify(meta ?? {})}`),
    };
    const logged = createApp({
      env: testEnv,
      logger: capture,
      getDatabaseStatus: () => 'connected',
      ai: new DemoProvider(),
      calendar,
    });
    const ana = await registerUser(logged, 'Ana');
    const ws = await createPersonalWorkspace(ana);
    const res = await ana.agent
      .post(`${base(ws)}/calendar/connect`)
      .send({})
      .expect(200);
    const url = new URL(res.body.authUrl as string);
    const code = fake.codeFor(url.searchParams.get('code_challenge')!);
    await ana.agent
      .get('/api/calendar/google/callback')
      .query({ state: url.searchParams.get('state')!, code })
      .expect(303);
    usualWeek();
    const command = await ana.agent.post(commands(ws)).send({ request: PARCIAL }).expect(201);
    await ana.agent
      .post(`${commands(ws)}/${command.body.command.id}/confirm`)
      .send({ revision: command.body.command.plan.revision })
      .expect(200);
    const all = lines.join('\n');
    expect(all).toContain('calendar.connected');
    expect(all).not.toContain(code);
    expect(all).not.toContain(url.searchParams.get('state')!);
    expect(all).not.toMatch(/refresh-\d|access-\d|Bearer|test-client-secret/);
  });
});
