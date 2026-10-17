import {
  GeneratedWeekPlanningSchema,
  PLANNING_WEEKDAYS,
  type CalendarConnectionStatus,
  type GeneratedWeekPlanning,
  type PlanningWeekday,
  type WeekPlanView,
} from '@pixel/contracts';
import { DateTime } from 'luxon';
import {
  fold,
  interpretMove,
  interpretWeekPlanning,
  WEEK_PLANNING_SCHEMA_NAME,
  WEEK_PLANNING_SYSTEM,
  weekPlanningPrompt,
  type AIProvider,
} from '../../ai/index.js';
import type { Logger } from '../../lib/logger.js';
import type { ToolExecutionContext, ToolAvailability } from '../actions/action.types.js';
import { errorCodeOf } from '../actions/action.executor.js';
import type { CalendarEventView } from '../actions/tools/googleCalendar.tool.js';
import type { PixelToolRegistry } from '../actions/toolRegistry.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { horizonRange, isValidTimezone, overlaps, toSpan, type Span } from './availability.js';
import { connectionView, type CalendarDeps } from './calendarConnection.service.js';
import type { TimeInterval } from './calendar.types.js';
import {
  blockLabels,
  findMoveSlot,
  planWeek,
  weekdayName,
  type PlannedBlock,
  type WeekPlan,
} from './weekPlanner.js';

/*
 * Planificación con Google Calendar dentro de PixelCommand (Prompt 19,
 * docs/PERSONAL-WEEK-PLANNER.md). Orquesta, no duplica: lee el calendario con las capacidades de
 * lectura de `google.calendar` (sin confirmación), calcula con el motor determinista y devuelve una
 * PROPUESTA. No escribe nada: guardar es un PixelActionPlan que el usuario confirma.
 */

export interface CalendarPlanningDeps {
  ai: AIProvider;
  logger: Logger;
  calendar: CalendarDeps;
  tools: PixelToolRegistry;
}

/** Lo que se guarda en el comando para ajustar después (nunca datos de Google). */
export interface CalendarPlanningState {
  timezone: string | null;
  interpretation: GeneratedWeekPlanning | null;
  /** Prompt 20: referencia opaca de la tarea que se organiza (desde «Mi agenda»), si la hay. */
  taskRef?: string | null;
}

export interface CalendarPlanStep {
  id: string;
  type: 'schedule_blocks' | 'move_block';
  title: string;
  params: Record<string, unknown>;
}

export type CalendarOutcome =
  | { kind: 'connect'; status: CalendarConnectionStatus; reply: string }
  | { kind: 'question'; question: string; field: string; planning: CalendarPlanningState }
  | { kind: 'reply'; reply: string }
  | {
      kind: 'proposal';
      summary: string;
      understood: string[];
      proposal: string[];
      creates: string[];
      steps: CalendarPlanStep[];
      weekPlan: WeekPlanView;
      planning: CalendarPlanningState;
    };

export const CALENDAR_COPY = {
  unconfigured: 'Google Calendar todavía no está configurado en esta instalación de Pixel.',
  requires_auth: 'Para consultar tu disponibilidad necesito conectar tu Google Calendar.',
  requires_reauth: 'Necesito volver a conectar tu Google Calendar.',
  unavailable:
    'Google Calendar no responde ahora mismo. No voy a proponerte horarios sin ver tu disponibilidad real; inténtalo en un momento.',
} as const;

const TOOL = 'google.calendar';

/** Estado de la herramienta → qué hace Pixel (conectar, reconectar, esperar) o null si puede seguir. */
function connectionGate(availability: ToolAvailability): CalendarOutcome | null {
  switch (availability) {
    case 'available':
      return null;
    case 'requires_auth':
    case 'disconnected':
      return { kind: 'connect', status: 'requires_auth', reply: CALENDAR_COPY.requires_auth };
    case 'requires_reauth':
      return { kind: 'connect', status: 'requires_reauth', reply: CALENDAR_COPY.requires_reauth };
    case 'unconfigured':
    case 'not_registered':
      return { kind: 'connect', status: 'unconfigured', reply: CALENDAR_COPY.unconfigured };
    default:
      return { kind: 'connect', status: 'unavailable', reply: CALENDAR_COPY.unavailable };
  }
}

/** Zona para planificar: la del Pixel → la del Google Calendar → la del navegador. Nunca la del servidor. */
export async function planningTimezone(
  workspace: WorkspaceDocument,
  clientTimezone: string | null,
  deps: CalendarPlanningDeps,
): Promise<string | null> {
  if (isValidTimezone(workspace.timezone)) return workspace.timezone;
  const connection = await connectionView(workspace, deps.calendar);
  if (isValidTimezone(connection.timezone)) return connection.timezone;
  return isValidTimezone(clientTimezone) ? clientTimezone : null;
}

const TIMEZONE_QUESTION =
  '¿En qué zona horaria estás? Por ejemplo: «America/Bogota» o «Europe/Madrid».';

/**
 * Una lectura del calendario por la herramienta (lecturas: sin confirmación, sin escribir nada). La
 * comparten el planificador y «Mi agenda» (Prompt 20): un solo camino de lectura.
 */
export async function readCalendar<O>(
  workspace: WorkspaceDocument,
  capabilityKey: 'find_availability' | 'list_events',
  /** `pixelOnly` (solo list_events): solo los bloques de Pixel (Prompt 20). */
  range: TimeInterval & { pixelOnly?: boolean },
  deps: CalendarPlanningDeps,
): Promise<O> {
  const resolved = await deps.tools.resolve(TOOL, capabilityKey, workspace);
  if (!resolved || resolved.capability.effect !== 'read') {
    throw Object.assign(new Error('calendar_unavailable'), {
      actionErrorCode: 'calendar_unavailable' as const,
    });
  }
  const input = resolved.capability.inputSchema.parse(range);
  const ctx: ToolExecutionContext = {
    workspace,
    contextType: workspace.type,
    actorUserId: workspace.ownerId.toString(),
    commandId: 'planning',
    executionId: 'planning',
    idempotencyKey: `read:${capabilityKey}`,
  };
  const result = await resolved.capability.execute(input, ctx);
  return result.output as O;
}

/** Un fallo de lectura → reconectar, o decirlo sin inventar disponibilidad. */
function readFailure(err: unknown, deps: CalendarPlanningDeps, workspace: WorkspaceDocument) {
  const code = errorCodeOf(err);
  deps.logger.warn('calendar.read_failed', { workspaceId: workspace._id.toString(), code });
  if (code === 'calendar_requires_reauth' || code === 'requires_reauth') {
    return connectionGate('requires_reauth')!;
  }
  if (code === 'calendar_not_connected' || code === 'requires_auth') {
    return connectionGate('requires_auth')!;
  }
  return connectionGate('unavailable')!;
}

const todayOf = (now: Date, timezone: string): PlanningWeekday =>
  PLANNING_WEEKDAYS[DateTime.fromJSDate(now, { zone: timezone }).weekday - 1]!;

const KEY_WORD = /[a-z0-9ñ]{3,}/g;
/** ¿Lo que devolvió la IA está en lo que escribió el usuario? (al menos la mitad de sus palabras). */
function grounded(value: string, source: string): boolean {
  const words = fold(value).match(KEY_WORD) ?? [];
  if (!words.length) return false;
  const available = new Set(fold(source).match(KEY_WORD) ?? []);
  return words.filter((word) => available.has(word)).length * 2 >= words.length;
}

/** Lo que se entendió: IA (validada contra el texto) o reglas si falla. */
async function interpret(
  request: string,
  now: Date,
  timezone: string,
  previous: GeneratedWeekPlanning | null,
  deps: CalendarPlanningDeps,
): Promise<GeneratedWeekPlanning> {
  const today = todayOf(now, timezone);
  try {
    const result = await deps.ai.generateStructuredOutput({
      system: WEEK_PLANNING_SYSTEM,
      prompt: weekPlanningPrompt({
        nowLocal: DateTime.fromJSDate(now, { zone: timezone }).toISO()!,
        timezone,
        today,
        userRequest: request,
        previous,
      }),
      schema: GeneratedWeekPlanningSchema,
      schemaName: WEEK_PLANNING_SCHEMA_NAME,
      maxOutputTokens: 1200,
      effort: 'low',
    });
    const data = GeneratedWeekPlanningSchema.parse(result.data);
    if (result.mode === 'demo') return data;
    // Lo no respaldado por el texto se descarta (compromisos o sesiones inventados).
    const source = [request, ...(previous ? [JSON.stringify(previous)] : [])].join('\n');
    return GeneratedWeekPlanningSchema.parse({
      ...data,
      commitments: data.commitments.filter(
        (item) => item.title === 'Fecha límite' || grounded(item.title, source),
      ),
      sessions: data.sessions.filter((item) => grounded(item.title, source)),
    });
  } catch (err) {
    deps.logger.warn('calendar.planning_ai_failed', {
      err: err instanceof Error ? err.name : 'unknown',
    });
    return interpretWeekPlanning(request, today, previous);
  }
}

/** Ocupado real + eventos (para contar compromisos) del rango, en paralelo y una sola vez. */
async function readRange(
  workspace: WorkspaceDocument,
  range: TimeInterval,
  deps: CalendarPlanningDeps,
) {
  const [availability, listing] = await Promise.all([
    readCalendar<{ busy: TimeInterval[] }>(workspace, 'find_availability', range, deps),
    readCalendar<{ events: CalendarEventView[] }>(workspace, 'list_events', range, deps),
  ]);
  return { busy: availability.busy.map(toSpan), events: listing.events };
}

function toView(plan: WeekPlan, checkedAt: Date): WeekPlanView {
  return {
    timezone: plan.timezone,
    rangeStart: plan.range.start,
    rangeEnd: plan.range.end,
    availabilityCheckedAt: checkedAt.toISOString(),
    blocks: plan.proposedBlocks,
    unscheduled: [...plan.unscheduledItems, ...plan.conflicts],
    assumptions: plan.assumptions,
    fixedCommitments: plan.fixedCommitments,
  };
}

const blocksWord = (count: number) => (count === 1 ? 'bloque' : 'bloques');

/** Paso único: cada bloque será UNA acción create_event (con su propio resultado verificado). */
function scheduleStep(
  blocks: PlannedBlock[],
  timezone: string,
  taskRef: string | null = null,
): CalendarPlanStep {
  return {
    id: 'step_1',
    type: 'schedule_blocks',
    title: `Guardar ${blocks.length} ${blocksWord(blocks.length)} en Google Calendar`,
    params: {
      blocks: blocks.map((block) => ({
        input: {
          summary: block.title,
          start: block.start,
          end: block.end,
          timezone,
          // Prompt 20: cada bloque queda vinculado a la tarea (si se organizó para una).
          ...(taskRef ? { taskRef } : {}),
        },
        label: `${block.dayLabel}, ${block.timeLabel}`,
      })),
    },
  };
}

function weekProposal(
  plan: WeekPlan,
  checkedAt: Date,
  planning: CalendarPlanningState,
): CalendarOutcome {
  const blocks = plan.proposedBlocks;
  if (!blocks.length) {
    const reasons = plan.unscheduledItems.map((item) => item.reason);
    return {
      kind: 'reply',
      reply:
        `Revisé tu Google Calendar y no encontré huecos que cumplan lo que pediste. ${[...new Set(reasons)].join(' ')} No guardé nada.`.trim(),
    };
  }
  const titles = [...new Set(blocks.map((block) => `«${block.title}»`))].join(' y ');
  const summary = `Te propongo ${blocks.length} ${blocksWord(blocks.length)} para ${titles}${plan.unscheduledItems.length ? `; ${plan.unscheduledItems.length} no ${plan.unscheduledItems.length === 1 ? 'cupo' : 'cupieron'}` : ''}. No guardo nada en Google Calendar hasta que lo apruebes.`;
  return {
    kind: 'proposal',
    summary,
    understood: [
      `Revisé tu Google Calendar: ${plan.fixedCommitments === 1 ? '1 compromiso que no muevo' : `${plan.fixedCommitments} compromisos que no muevo`}.`,
      ...plan.assumptions,
    ],
    proposal: [
      ...blocks.map((block) => `${block.dayLabel} · ${block.timeLabel} · ${block.title}`),
      ...plan.unscheduledItems.map((item) => `Sin hueco: ${item.title}. ${item.reason}`),
    ],
    creates: [`${blocks.length} ${blocksWord(blocks.length)} en Google Calendar`],
    steps: [scheduleStep(blocks, plan.timezone, planning.taskRef ?? null)],
    weekPlan: toView(plan, checkedAt),
    planning,
  };
}

export interface WeekPlanInput {
  /** Toda la solicitud hasta ahora (original + ajustes). */
  request: string;
  /** El mensaje nuevo (ajuste o respuesta). */
  message: string;
  clientTimezone: string | null;
  previous: { planning: CalendarPlanningState | null; weekPlan: WeekPlanView | null } | null;
  /** Prompt 20: la tarea en contexto (referencia opaca), validada por PixelCommand. */
  taskRef?: string | null;
}

/** «Organízame la semana…» y sus ajustes. */
export async function planWeekCommand(
  workspace: WorkspaceDocument,
  input: WeekPlanInput,
  deps: CalendarPlanningDeps,
): Promise<CalendarOutcome> {
  const gate = connectionGate(await deps.tools.availability(TOOL, workspace));
  if (gate) return gate;
  const now = deps.calendar.now();
  const timezone =
    input.previous?.planning?.timezone ??
    (await planningTimezone(workspace, input.clientTimezone, deps)) ??
    (isValidTimezone(input.message.trim()) ? input.message.trim() : null);
  if (!timezone) {
    return {
      kind: 'question',
      question: TIMEZONE_QUESTION,
      field: 'timezone',
      planning: { timezone: null, interpretation: null },
    };
  }

  // Prompt 20: la tarea en contexto (o la del plan que se ajusta) vincula todos sus bloques.
  const taskRef = input.taskRef ?? input.previous?.planning?.taskRef ?? null;

  // «Ese bloque del martes pásalo al jueves»: ajuste de UN bloque del plan propuesto.
  const previousPlan = input.previous?.weekPlan ?? null;
  const previousInterpretation = input.previous?.planning?.interpretation ?? null;
  if (previousPlan && previousInterpretation) {
    const move = interpretMove(input.message, todayOf(now, timezone));
    if (move.to || (move.time && move.from)) {
      return moveInPlan(
        workspace,
        previousPlan,
        previousInterpretation,
        move,
        timezone,
        now,
        deps,
        taskRef,
      );
    }
  }

  const interpretation = await interpret(
    previousInterpretation ? input.message : input.request,
    now,
    timezone,
    previousInterpretation,
    deps,
  );
  const planning = { timezone, interpretation, taskRef };
  if (!interpretation.sessions.length) {
    return {
      kind: 'question',
      question:
        interpretation.clarificationNeeded ??
        '¿Qué quieres que reserve en tu semana? Por ejemplo: «estudiar cálculo tres veces antes del viernes».',
      field: 'week_plan',
      planning,
    };
  }
  const range = horizonRange(interpretation.horizon, now, timezone);
  let read;
  try {
    read = await readRange(
      workspace,
      { start: new Date(range.start).toISOString(), end: new Date(range.end).toISOString() },
      deps,
    );
  } catch (err) {
    return readFailure(err, deps, workspace);
  }
  const plan = planWeek({
    now,
    timezone,
    request: interpretation,
    busy: read.busy,
    fixedCommitments: read.events.filter((event) => !event.pixelOwned && event.busy).length,
  });
  deps.logger.info('calendar.week_planned', {
    workspaceId: workspace._id.toString(),
    blocks: plan.proposedBlocks.length,
    unscheduled: plan.unscheduledItems.length,
  });
  return weekProposal(plan, now, planning);
}

async function moveInPlan(
  workspace: WorkspaceDocument,
  previous: WeekPlanView,
  interpretation: GeneratedWeekPlanning,
  move: ReturnType<typeof interpretMove>,
  timezone: string,
  now: Date,
  deps: CalendarPlanningDeps,
  taskRef: string | null,
): Promise<CalendarOutcome> {
  const planning = { timezone, interpretation, taskRef };
  const weekdayOf = (iso: string) =>
    PLANNING_WEEKDAYS[DateTime.fromISO(iso, { zone: timezone }).weekday - 1]!;
  const candidates = previous.blocks.filter(
    (block) =>
      (!move.from || weekdayOf(block.start) === move.from) &&
      (!move.subject.length ||
        move.subject.some((word) => fold(block.title).includes(word)) ||
        move.from),
  );
  if (candidates.length !== 1) {
    return {
      kind: 'question',
      question: `¿Qué bloque muevo: ${previous.blocks.map((block) => `el del ${weekdayName(weekdayOf(block.start))} (${block.timeLabel})`).join(', ')}?`,
      field: 'week_plan',
      planning,
    };
  }
  const block = candidates[0]!;
  const range = { start: previous.rangeStart, end: previous.rangeEnd };
  let read;
  try {
    read = await readRange(workspace, range, deps);
  } catch (err) {
    return readFailure(err, deps, workspace);
  }
  const others = previous.blocks.filter((other) => other.id !== block.id).map(toSpan);
  const found = findMoveSlot({
    block: toSpan(block),
    target: { weekday: move.to, time: move.time },
    now,
    timezone,
    busy: [...read.busy, ...others],
    within: { start: Date.parse(range.start), end: Date.parse(range.end) },
    window: {
      startHour: interpretation.window.startHour ?? 8,
      endHour: interpretation.window.endHour ?? 21,
    },
  });
  const outside =
    'span' in found &&
    (found.span.start < Date.parse(range.start) || found.span.end > Date.parse(range.end));
  if (!('span' in found) || outside) {
    return {
      kind: 'question',
      question: `${'reason' in found ? found.reason : 'Ese día queda fuera de este plan.'} ¿A qué otro día u hora lo paso?`,
      field: 'week_plan',
      planning,
    };
  }
  const moved: PlannedBlock = {
    ...block,
    start: new Date(found.span.start).toISOString(),
    end: new Date(found.span.end).toISOString(),
    ...blockLabels(found.span, timezone),
  };
  const blocks = previous.blocks
    .map((other) => (other.id === block.id ? moved : other))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map((other, index) => ({ ...other, id: `block_${index + 1}` }));
  const plan: WeekPlan = {
    timezone,
    range,
    assumptions: [
      ...previous.assumptions,
      `Moví el bloque del ${weekdayName(weekdayOf(block.start))} al ${moved.dayLabel.toLocaleLowerCase('es')}, ${moved.timeLabel}.`,
    ],
    fixedCommitments: previous.fixedCommitments,
    proposedBlocks: blocks,
    unscheduledItems: previous.unscheduled,
    conflicts: [],
    rationale: '',
  };
  return weekProposal(plan, now, planning);
}

/** «No pude estudiar cálculo hoy», «Muévelo al jueves a las 6»: mover UN bloque de Pixel. */
export async function replanCommand(
  workspace: WorkspaceDocument,
  input: { request: string; clientTimezone: string | null },
  deps: CalendarPlanningDeps,
): Promise<CalendarOutcome> {
  const gate = connectionGate(await deps.tools.availability(TOOL, workspace));
  if (gate) return gate;
  const now = deps.calendar.now();
  const timezone = await planningTimezone(workspace, input.clientTimezone, deps);
  if (!timezone) {
    return {
      kind: 'question',
      question: TIMEZONE_QUESTION,
      field: 'timezone',
      planning: { timezone: null, interpretation: null },
    };
  }
  const local = DateTime.fromJSDate(now, { zone: timezone });
  const move = interpretMove(input.request, todayOf(now, timezone));
  if (move.unavailable) return freeUpCommand(workspace, move.unavailable, now, timezone, deps);
  const search: TimeInterval = {
    start: local
      .minus({ days: move.from ? 6 : 0 })
      .startOf('day')
      .toUTC()
      .toISO()!,
    end: local.plus({ days: 8 }).endOf('day').toUTC().toISO()!,
  };
  let events;
  try {
    events = (
      await readCalendar<{
        events: CalendarEventView[];
      }>(workspace, 'list_events', search, deps)
    ).events;
  } catch (err) {
    return readFailure(err, deps, workspace);
  }
  // Solo bloques de Pixel (marca privada) y no los que ya terminaron hace días.
  const weekdayOf = (iso: string) =>
    PLANNING_WEEKDAYS[DateTime.fromISO(iso, { zone: timezone }).weekday - 1]!;
  const isToday = (iso: string) => DateTime.fromISO(iso, { zone: timezone }).hasSame(local, 'day');
  let candidates = events.filter((event) => event.pixelOwned && event.busy);
  if (move.from) {
    const fromToday = move.from === todayOf(now, timezone);
    candidates = candidates.filter((event) =>
      fromToday ? isToday(event.start) : weekdayOf(event.start) === move.from,
    );
  } else {
    candidates = candidates.filter(
      (event) => Date.parse(event.end) >= local.startOf('day').toMillis(),
    );
  }
  const bySubject = candidates.filter((event) =>
    move.subject.some((word) => fold(event.title).includes(word)),
  );
  if (bySubject.length) candidates = bySubject;
  const planning = { timezone, interpretation: null };
  if (!candidates.length) {
    return {
      kind: 'reply',
      reply:
        'No encontré bloques creados por Pixel en tu Google Calendar para mover. Solo muevo los bloques que Pixel guardó; tus otros eventos no los toco.',
    };
  }
  if (candidates.length > 1) {
    const options = candidates
      .slice(0, 4)
      .map(
        (event) =>
          `«${event.title}» del ${weekdayName(weekdayOf(event.start))} (${blockLabels(toSpan(event), timezone).timeLabel})`,
      );
    return {
      kind: 'question',
      question: `¿Cuál bloque muevo: ${options.join(' o ')}?`,
      field: 'replan_target',
      planning,
    };
  }
  const event = candidates[0]!;
  const busy: Span[] = events.filter((other) => other.id !== event.id && other.busy).map(toSpan);
  const found = findMoveSlot({
    block: toSpan(event),
    target: { weekday: move.to, time: move.time },
    now,
    timezone,
    busy,
  });
  if (!('span' in found)) {
    return { kind: 'reply', reply: `${found.reason} No cambié nada en tu Google Calendar.` };
  }
  const from = blockLabels(toSpan(event), timezone);
  const to = blockLabels(found.span, timezone);
  const startIso = new Date(found.span.start).toISOString();
  const endIso = new Date(found.span.end).toISOString();
  const block: PlannedBlock = {
    id: 'block_1',
    title: event.title,
    start: startIso,
    end: endIso,
    ...to,
    estimated: false,
    reason: `Antes: ${from.dayLabel.toLocaleLowerCase('es')}, ${from.timeLabel}`,
  };
  const summary = `Propongo mover «${event.title}» del ${from.dayLabel.toLocaleLowerCase('es')}, ${from.timeLabel}, al ${to.dayLabel.toLocaleLowerCase('es')}, ${to.timeLabel}. No cambio nada hasta que lo apruebes.`;
  return {
    kind: 'proposal',
    summary,
    understood: [
      'Solo muevo bloques que Pixel guardó; tus demás eventos se quedan como están.',
      ...(move.to ? [] : ['Busqué el primer hueco libre desde mañana con la misma duración.']),
    ],
    proposal: [`${to.dayLabel} · ${to.timeLabel} · ${event.title}`],
    creates: ['1 cambio en Google Calendar'],
    steps: [
      {
        id: 'step_1',
        type: 'move_block',
        title: `Mover «${event.title}» en Google Calendar`,
        params: {
          input: { eventId: event.id, start: startIso, end: endIso, timezone },
          title: event.title,
          label: `${to.dayLabel}, ${to.timeLabel}`,
        },
      },
    ],
    weekPlan: {
      timezone,
      rangeStart: search.start,
      rangeEnd: search.end,
      availabilityCheckedAt: now.toISOString(),
      blocks: [block],
      unscheduled: [],
      assumptions: [],
      fixedCommitments: events.filter((other) => !other.pixelOwned && other.busy).length,
    },
    planning,
  };
}

const PART_WINDOWS = {
  morning: { from: 6, to: 12, label: 'por la mañana' },
  afternoon: { from: 12, to: 19, label: 'por la tarde' },
  evening: { from: 19, to: 24, label: 'por la noche' },
} as const;

/**
 * Prompt 20 («Reorganizar con Pixel» desde Mi agenda): «el jueves en la tarde no puedo». Mueve SOLO
 * los bloques de Pixel que caen en esa franja, cada uno al primer hueco libre (fuera de la franja,
 * sin solapar nada); los compromisos del usuario no se tocan. Una propuesta con un paso move_block
 * por bloque y UNA confirmación.
 */
async function freeUpCommand(
  workspace: WorkspaceDocument,
  unavailable: NonNullable<ReturnType<typeof interpretMove>['unavailable']>,
  now: Date,
  timezone: string,
  deps: CalendarPlanningDeps,
): Promise<CalendarOutcome> {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  const weekday = PLANNING_WEEKDAYS.indexOf(unavailable.day) + 1;
  let day = local.startOf('day');
  while (day.weekday !== weekday) day = day.plus({ days: 1 });
  const part = unavailable.part ? PART_WINDOWS[unavailable.part] : null;
  const blocked: Span = {
    start: day.set({ hour: part?.from ?? 0 }).toMillis(),
    end: (part && part.to < 24 ? day.set({ hour: part.to }) : day.plus({ days: 1 })).toMillis(),
  };
  const where = `el ${weekdayName(unavailable.day)}${part ? ` ${part.label}` : ''}`;
  const search: TimeInterval = {
    start: local.startOf('day').toUTC().toISO()!,
    end: local.plus({ days: 9 }).endOf('day').toUTC().toISO()!,
  };
  let events: CalendarEventView[];
  try {
    events = (
      await readCalendar<{ events: CalendarEventView[] }>(workspace, 'list_events', search, deps)
    ).events;
  } catch (err) {
    return readFailure(err, deps, workspace);
  }
  const affected = events.filter(
    (event) =>
      event.pixelOwned &&
      event.busy &&
      overlaps(toSpan(event), blocked) &&
      Date.parse(event.end) > now.getTime(),
  );
  if (!affected.length) {
    return {
      kind: 'reply',
      reply: `No tienes bloques organizados por Pixel ${where}. Tus compromisos no los muevo; si quieres, dime qué cambiar.`,
    };
  }
  // Ocupado: los demás eventos, la franja que no puede y lo que se va recolocando.
  const busy: Span[] = [
    ...events.filter((event) => event.busy && !affected.includes(event)).map(toSpan),
    blocked,
  ];
  const steps: CalendarPlanStep[] = [];
  const blocks: PlannedBlock[] = [];
  const unplaced: string[] = [];
  for (const event of affected) {
    const found = findMoveSlot({
      block: toSpan(event),
      target: { weekday: null, time: null },
      now,
      timezone,
      busy,
    });
    if (!('span' in found)) {
      unplaced.push(event.title);
      continue;
    }
    busy.push(found.span);
    const to = blockLabels(found.span, timezone);
    const input = {
      eventId: event.id,
      start: new Date(found.span.start).toISOString(),
      end: new Date(found.span.end).toISOString(),
      timezone,
    };
    steps.push({
      id: `step_${steps.length + 1}`,
      type: 'move_block',
      title: `Mover «${event.title}» en Google Calendar`,
      params: { input, title: event.title, label: `${to.dayLabel}, ${to.timeLabel}` },
    });
    blocks.push({
      id: `block_${blocks.length + 1}`,
      title: event.title,
      start: input.start,
      end: input.end,
      ...to,
      estimated: false,
      reason: `Antes: ${blockLabels(toSpan(event), timezone).timeLabel} ${where}`,
    });
  }
  if (!steps.length) {
    return {
      kind: 'reply',
      reply: `No encontré huecos libres para mover ${affected.length === 1 ? 'el bloque' : 'los bloques'} de ${where}. No cambié nada en tu Google Calendar.`,
    };
  }
  const summary = `Propongo mover ${steps.length === 1 ? 'el bloque' : `${steps.length} bloques`} que Pixel organizó ${where}. No cambio nada hasta que lo apruebes.`;
  return {
    kind: 'proposal',
    summary,
    understood: [
      `No puedes ${where}: solo muevo los bloques que Pixel organizó; tus compromisos se quedan como están.`,
      ...unplaced.map((title) => `Sin hueco para «${title}»: se queda donde está.`),
    ],
    proposal: blocks.map((block) => `${block.dayLabel} · ${block.timeLabel} · ${block.title}`),
    creates: [`${plural(steps.length, 'cambio')} en Google Calendar`],
    steps,
    weekPlan: {
      timezone,
      rangeStart: search.start,
      rangeEnd: search.end,
      availabilityCheckedAt: now.toISOString(),
      blocks,
      unscheduled: unplaced.map((title) => ({
        title,
        reason: 'No encontré otro hueco libre en los próximos días.',
      })),
      assumptions: [],
      fixedCommitments: events.filter((other) => !other.pixelOwned && other.busy).length,
    },
    planning: { timezone, interpretation: null },
  };
}

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;
