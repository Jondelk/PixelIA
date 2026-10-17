import { randomBytes } from 'node:crypto';
import { GeneratedWeekPlanningSchema } from '@pixel/contracts';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  calendarIntentOf,
  fold,
  interpretMove,
  interpretWeekPlanning,
  timeOf,
} from '../src/ai/index.js';
import { openSecret, parseSecretKey, sealSecret } from '../src/lib/secretBox.js';
import {
  dailyWindows,
  freeSlots,
  horizonRange,
  mergeSpans,
  subtractBusy,
  type Span,
} from '../src/modules/calendar/availability.js';
import { resolveCalendarConfig } from '../src/modules/calendar/calendar.config.js';
import { findMoveSlot, planWeek } from '../src/modules/calendar/weekPlanner.js';

/*
 * Prompt 19 — partes puras: motor de disponibilidad, planificador de la semana, intérprete por
 * reglas, cifrado de tokens y configuración. Sin red, sin Mongo.
 */

const BOGOTA = 'America/Bogota';
/** Lunes 12 de octubre de 2026, 08:00 en Bogotá. */
const MONDAY_8AM = new Date('2026-10-12T13:00:00Z');

const at = (iso: string, zone = BOGOTA) => DateTime.fromISO(iso, { zone }).toMillis();
const span = (start: string, end: string, zone = BOGOTA): Span => ({
  start: at(start, zone),
  end: at(end, zone),
});
const local = (ms: number | string, zone = BOGOTA) =>
  DateTime.fromMillis(typeof ms === 'string' ? Date.parse(ms) : ms, { zone }).toFormat(
    'ccc HH:mm',
    { locale: 'en' },
  );

describe('Motor de disponibilidad', () => {
  const day = span('2026-10-13T00:00', '2026-10-14T00:00');
  const windows = dailyWindows(day, BOGOTA, 8, 18).filter((w) => w.date === '2026-10-13');

  it('08–18 con ocupado 09–10 y 14–15, mínimo 120 min → 10–14 y 15–18', () => {
    const busy = [
      span('2026-10-13T09:00', '2026-10-13T10:00'),
      span('2026-10-13T14:00', '2026-10-13T15:00'),
    ];
    const slots = freeSlots(windows, busy, 120).map((s) => [
      local(s.span.start),
      local(s.span.end),
    ]);
    expect(slots).toEqual([
      ['Tue 10:00', 'Tue 14:00'],
      ['Tue 15:00', 'Tue 18:00'],
    ]);
  });

  it('ocupados adyacentes y anidados se unen; los vacíos se ignoran', () => {
    expect(
      mergeSpans([
        span('2026-10-13T09:00', '2026-10-13T10:00'),
        span('2026-10-13T10:00', '2026-10-13T11:00'),
        span('2026-10-13T12:00', '2026-10-13T15:00'),
        span('2026-10-13T13:00', '2026-10-13T14:00'),
        span('2026-10-13T16:00', '2026-10-13T16:00'),
      ]).map((s) => [local(s.start), local(s.end)]),
    ).toEqual([
      ['Tue 09:00', 'Tue 11:00'],
      ['Tue 12:00', 'Tue 15:00'],
    ]);
  });

  it('un hueco demasiado pequeño no sirve', () => {
    const busy = [
      span('2026-10-13T08:00', '2026-10-13T12:00'),
      span('2026-10-13T13:30', '2026-10-13T18:00'),
    ];
    expect(freeSlots(windows, busy, 120)).toEqual([]);
    expect(subtractBusy(windows[0]!.span, busy).map((s) => [local(s.start), local(s.end)])).toEqual(
      [['Tue 12:00', 'Tue 13:30']],
    );
  });

  it('varios días: una ventana por día local', () => {
    const range = span('2026-10-12T00:00', '2026-10-15T00:00');
    expect(dailyWindows(range, BOGOTA, 8, 18).map((w) => w.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
  });

  it('zona horaria con cambio de horario: 08–18 locales en Madrid antes y después del 25 de octubre', () => {
    const madrid = 'Europe/Madrid';
    const range = span('2026-10-24T00:00', '2026-10-26T00:00', madrid);
    const [sat, sun] = dailyWindows(range, madrid, 8, 18);
    expect(new Date(sat!.span.start).toISOString()).toBe('2026-10-24T06:00:00.000Z');
    expect(new Date(sun!.span.start).toISOString()).toBe('2026-10-25T07:00:00.000Z');
    // Nunca la zona del servidor: lo mismo en Bogotá son otras horas UTC.
    const [bogota] = dailyWindows(span('2026-10-24T00:00', '2026-10-25T00:00'), BOGOTA, 8, 18);
    expect(new Date(bogota!.span.start).toISOString()).toBe('2026-10-24T13:00:00.000Z');
  });

  it('ventana que cruza la medianoche (22–2)', () => {
    const range = span('2026-10-13T00:00', '2026-10-14T00:00');
    const night = dailyWindows(range, BOGOTA, 22, 2).find((w) => w.date === '2026-10-13');
    expect(local(night!.span.start)).toBe('Tue 22:00');
    // El rango termina a medianoche: la ventana se recorta ahí.
    expect(local(night!.span.end)).toBe('Wed 00:00');
    const wide = dailyWindows(span('2026-10-13T00:00', '2026-10-15T00:00'), BOGOTA, 22, 2).find(
      (w) => w.date === '2026-10-13',
    );
    expect(local(wide!.span.end)).toBe('Wed 02:00');
  });

  it('horizontes en la zona del usuario y nunca en el pasado', () => {
    const thisWeek = horizonRange('this_week', MONDAY_8AM, BOGOTA);
    expect(thisWeek.start).toBe(MONDAY_8AM.getTime());
    expect(new Date(thisWeek.end).toISOString()).toBe('2026-10-19T05:00:00.000Z');
    const nextWeek = horizonRange('next_week', MONDAY_8AM, BOGOTA);
    expect(new Date(nextWeek.start).toISOString()).toBe('2026-10-19T05:00:00.000Z');
    expect(new Date(nextWeek.end).toISOString()).toBe('2026-10-26T05:00:00.000Z');
  });
});

const parcialRequest = GeneratedWeekPlanningSchema.parse({
  horizon: 'this_week',
  commitments: [
    { title: 'Parcial de cálculo', day: 'friday', isDeadline: true },
    { title: 'Reunión familiar', day: 'wednesday' },
  ],
  sessions: [{ title: 'Estudiar cálculo', count: 3 }],
});

describe('PersonalWeekPlanner', () => {
  const busy = [
    span('2026-10-12T09:00', '2026-10-12T10:00'), // clase del lunes
    span('2026-10-13T14:00', '2026-10-13T15:00'), // reunión del martes
  ];

  it('parcial el viernes, reunión familiar el miércoles, tres sesiones → 3 bloques sin solapes antes del viernes', () => {
    const plan = planWeek({
      now: MONDAY_8AM,
      timezone: BOGOTA,
      request: parcialRequest,
      busy,
      fixedCommitments: 2,
    });
    expect(plan.proposedBlocks).toHaveLength(3);
    expect(plan.unscheduledItems).toEqual([]);
    const blocks = plan.proposedBlocks.map((b) => ({
      start: Date.parse(b.start),
      end: Date.parse(b.end),
    }));
    // Días distintos, ninguno el miércoles (reunión sin hora) ni desde el viernes (el parcial).
    expect(plan.proposedBlocks.map((b) => local(b.start).slice(0, 3))).toEqual([
      'Mon',
      'Tue',
      'Thu',
    ]);
    for (const block of blocks) {
      expect(block.end - block.start).toBe(90 * 60_000);
      expect(block.start).toBeGreaterThanOrEqual(MONDAY_8AM.getTime());
      expect(block.end).toBeLessThanOrEqual(at('2026-10-16T00:00'));
      for (const taken of busy)
        expect(block.start < taken.end && taken.start < block.end).toBe(false);
      const hour = DateTime.fromMillis(block.start, { zone: BOGOTA });
      expect(hour.hour).toBeGreaterThanOrEqual(8);
      expect(DateTime.fromMillis(block.end, { zone: BOGOTA }).hour).toBeLessThanOrEqual(21);
    }
    for (let i = 1; i < blocks.length; i += 1)
      expect(blocks[i]!.start).toBeGreaterThanOrEqual(blocks[i - 1]!.end);
    expect(plan.proposedBlocks.every((b) => b.estimated)).toBe(true);
    expect(plan.assumptions[0]).toBe(
      'He reservado bloques de 90 minutos porque no indicaste la duración.',
    );
    expect(plan.assumptions.join(' ')).toMatch(/horario provisional de 8:00 a 21:00/);
    expect(plan.assumptions.join(' ')).toMatch(/Dejé libre el miércoles por «Reunión familiar»/);
    expect(plan.timezone).toBe(BOGOTA);
    expect(plan.proposedBlocks[0]!.dayLabel).toBe('Lunes 12 de octubre');
  });

  it('sin disponibilidad suficiente → 2 programadas y 1 sin programar, con el motivo', () => {
    const full = [...busy, span('2026-10-13T08:00', '2026-10-13T21:00')];
    const plan = planWeek({
      now: MONDAY_8AM,
      timezone: BOGOTA,
      request: parcialRequest,
      busy: full,
      fixedCommitments: 3,
    });
    expect(plan.proposedBlocks).toHaveLength(2);
    expect(plan.unscheduledItems).toEqual([
      {
        title: 'Estudiar cálculo',
        reason: 'No encontré otro hueco libre de 90 minutos antes del viernes.',
      },
    ]);
  });

  it('nunca en el pasado: a las 15:00 del lunes, el bloque del lunes empieza después', () => {
    const now = new Date(at('2026-10-12T15:10'));
    const plan = planWeek({
      now,
      timezone: BOGOTA,
      request: parcialRequest,
      busy,
      fixedCommitments: 0,
    });
    expect(local(plan.proposedBlocks[0]!.start)).toBe('Mon 15:30');
  });

  it('duración dicha por el usuario: no es estimada ni se avisa', () => {
    const request = GeneratedWeekPlanningSchema.parse({
      horizon: 'this_week',
      sessions: [{ title: 'Leer', count: 1, durationMinutes: 60 }],
      window: { startHour: 18, endHour: 21 },
    });
    const plan = planWeek({
      now: MONDAY_8AM,
      timezone: BOGOTA,
      request,
      busy: [],
      fixedCommitments: 0,
    });
    expect(plan.proposedBlocks[0]).toMatchObject({ estimated: false, timeLabel: '18:00–19:00' });
    expect(plan.assumptions).toEqual([]);
  });

  it('mover un bloque al jueves a las 6: mismo largo, exacto si está libre', () => {
    const block = span('2026-10-13T16:00', '2026-10-13T17:30');
    const moved = findMoveSlot({
      block,
      target: { weekday: 'thursday', time: '18:00' },
      now: MONDAY_8AM,
      timezone: BOGOTA,
      busy: [],
    });
    expect('span' in moved && [local(moved.span.start), local(moved.span.end)]).toEqual([
      'Thu 18:00',
      'Thu 19:30',
    ]);
    const taken = findMoveSlot({
      block,
      target: { weekday: 'thursday', time: '18:00' },
      now: MONDAY_8AM,
      timezone: BOGOTA,
      busy: [span('2026-10-15T18:30', '2026-10-15T19:00')],
    });
    expect(taken).toEqual({ reason: 'El jueves a las 18:00 ya está ocupado.' });
  });

  it('«Ajustar» un plan de la próxima semana: «al jueves» es el jueves de ESE plan, no el más cercano', () => {
    const nextWeek = horizonRange('next_week', MONDAY_8AM, BOGOTA);
    const moved = findMoveSlot({
      block: span('2026-10-20T08:00', '2026-10-20T09:30'),
      target: { weekday: 'thursday', time: null },
      now: MONDAY_8AM,
      timezone: BOGOTA,
      busy: [span('2026-10-22T08:00', '2026-10-22T09:30')],
      within: nextWeek,
    });
    expect('span' in moved && DateTime.fromMillis(moved.span.start, { zone: BOGOTA }).toISO()).toBe(
      '2026-10-22T09:30:00.000-05:00',
    );
  });
});

describe('Intérprete por reglas (demo y respaldo)', () => {
  it('entiende el parcial, la reunión y las tres sesiones (sin fechas absolutas)', () => {
    const plan = interpretWeekPlanning(
      'Organízame la semana: tengo parcial de cálculo el viernes, el miércoles tengo una reunión familiar y quiero estudiar tres veces.',
      'monday',
    );
    expect(plan.horizon).toBe('this_week');
    expect(plan.commitments).toEqual([
      { title: 'Parcial de cálculo', day: 'friday', time: null, isDeadline: true },
      { title: 'Reunión familiar', day: 'wednesday', time: null, isDeadline: false },
    ]);
    expect(plan.sessions).toEqual([
      { title: 'Estudiar cálculo', count: 3, durationMinutes: null, day: null, time: null },
    ]);
    expect(plan.clarificationNeeded).toBeNull();
  });

  it('sin nada que reservar → una sola pregunta', () => {
    expect(interpretWeekPlanning('Organízame la semana', 'monday').clarificationNeeded).toMatch(
      /^¿Qué quieres que reserve/,
    );
  });

  it('horas en español y franjas', () => {
    expect(timeOf('a las 6')).toBe('18:00');
    expect(timeOf('a las 9 de la mañana')).toBe('09:00');
    expect(timeOf('a las 10')).toBe('10:00');
    expect(timeOf('a las 4 y media')).toBe('16:30');
    expect(
      interpretWeekPlanning('estudiar dos veces esta semana después de las 6', 'monday').window,
    ).toEqual({ startHour: 18, endHour: null });
  });

  it('intenciones de calendario sin confundir el contenido ni la acción externa genérica', () => {
    expect(calendarIntentOf('organizame la semana')).toBe('plan_week');
    expect(calendarIntentOf('quiero estudiar tres veces antes del viernes')).toBe('plan_week');
    expect(calendarIntentOf('no pude estudiar hoy.')).toBe('replan_block');
    expect(calendarIntentOf('muevelo al jueves a las 6.')).toBe('replan_block');
    expect(
      calendarIntentOf('arma el calendario de contenido de esta semana para instagram'),
    ).toBeNull();
    expect(calendarIntentOf('organiza el contenido de la semana')).toBeNull();
    expect(calendarIntentOf('pon manana a las 3 una reunion en mi google calendar.')).toBeNull();
  });

  it('mover: origen, destino, hora y tema', () => {
    expect(interpretMove('Ese bloque del martes pásalo al jueves', 'monday')).toMatchObject({
      from: 'tuesday',
      to: 'thursday',
      time: null,
    });
    expect(interpretMove('Muévelo al jueves a las 6.', 'tuesday')).toMatchObject({
      from: null,
      to: 'thursday',
      time: '18:00',
    });
    const missed = interpretMove('No pude estudiar cálculo hoy', 'tuesday');
    expect(missed).toMatchObject({ from: 'tuesday', to: null });
    expect(missed.subject).toContain('calculo');
  });
});

describe('Tokens cifrados (AES-256-GCM)', () => {
  const key = randomBytes(32);

  it('no guarda texto plano, abre con la clave correcta y falla con otra o con datos alterados', () => {
    const sealed = sealSecret('1//refresh-token-secreto', key);
    expect(sealed).not.toContain('refresh-token-secreto');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(openSecret(sealed, key)).toBe('1//refresh-token-secreto');
    // El mismo secreto cifrado dos veces no se repite (IV aleatorio).
    expect(sealSecret('1//refresh-token-secreto', key)).not.toBe(sealed);
    expect(() => openSecret(sealed, randomBytes(32))).toThrow();
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith('A') ? 'B' : 'A'}A`;
    expect(() => openSecret(tampered, key)).toThrow();
  });

  it('clave: 32 bytes en base64 o hex; cualquier otra cosa no vale', () => {
    expect(parseSecretKey(key.toString('base64'))?.equals(key)).toBe(true);
    expect(parseSecretKey(key.toString('hex'))?.equals(key)).toBe(true);
    expect(parseSecretKey('corta')).toBeNull();
    expect(parseSecretKey(undefined)).toBeNull();
  });
});

describe('Configuración de Google Calendar (opcional)', () => {
  const full = {
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_CALENDAR_REDIRECT_URI: 'http://localhost:5173/api/calendar/google/callback',
    GOOGLE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };

  it('sin variables → sin configurar y sin problema; incompleta o inválida → problema sin valores', () => {
    expect(resolveCalendarConfig({})).toEqual({ config: null, problem: null });
    expect(resolveCalendarConfig(full).config?.clientId).toBe('id');
    const partial = resolveCalendarConfig({ GOOGLE_CLIENT_ID: 'id' });
    expect(partial.config).toBeNull();
    expect(partial.problem).toMatch(/GOOGLE_CLIENT_SECRET/);
    expect(partial.problem).not.toMatch(/\bid\b/);
    expect(resolveCalendarConfig({ ...full, GOOGLE_TOKEN_ENCRYPTION_KEY: 'x' }).problem).toMatch(
      /32 bytes/,
    );
    const badUrl = resolveCalendarConfig({ ...full, GOOGLE_CALENDAR_REDIRECT_URI: 'no-url' });
    expect(badUrl.problem).toMatch(/no es una URL/);
    expect(JSON.stringify(badUrl)).not.toContain('secret');
  });
});

describe('Prompt 20: liberar una franja («el jueves en la tarde no puedo»)', () => {
  it('es replanificar solo con un día; dentro de «organízame la semana» sigue siendo planificar', () => {
    expect(calendarIntentOf('el jueves en la tarde no puedo.')).toBe('replan_block');
    expect(calendarIntentOf('manana no voy a poder.')).toBe('replan_block');
    expect(calendarIntentOf('no puedo')).toBeNull();
    expect(
      calendarIntentOf('organizame la semana: el miercoles no puedo y quiero estudiar dos veces'),
    ).toBe('plan_week');
  });

  it('día y franja; «mañana» como día y «la mañana» como franja', () => {
    expect(interpretMove('El jueves en la tarde no puedo.', 'monday').unavailable).toEqual({
      day: 'thursday',
      part: 'afternoon',
    });
    expect(interpretMove('Mañana por la mañana no puedo', 'monday').unavailable).toEqual({
      day: 'tuesday',
      part: 'morning',
    });
    expect(interpretMove('Muévelo al jueves a las 6.', 'monday').unavailable).toBeNull();
  });
});

describe('Prompt 20: el borrador de «Mi agenda» para una tarea es planificar', () => {
  it('«Quiero trabajar en «Entrega informe» una vez esta semana» → plan_week con 1 sesión', () => {
    const request = 'Quiero trabajar en «Entrega informe» una vez esta semana';
    expect(calendarIntentOf(fold(request))).toBe('plan_week');
    expect(interpretWeekPlanning(request, 'wednesday').sessions).toEqual([
      {
        title: 'Trabajar en Entrega informe',
        count: 1,
        durationMinutes: null,
        day: null,
        time: null,
      },
    ]);
  });
});
