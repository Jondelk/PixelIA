import {
  GeneratedWeekPlanningSchema,
  PLANNING_WEEKDAYS,
  type GeneratedWeekPlanning,
  type PlanningWeekday,
} from '@pixel/contracts';
import { fold } from './pixelCommandRules.js';

/*
 * Intérprete por reglas del planificador de la semana (Prompt 19). Lo usa el proveedor DEMO y es el
 * respaldo si la IA falla. Solo entiende lenguaje: no ve el calendario, ni fechas absolutas, ni
 * ids. Las fechas reales las calcula el backend en la zona del usuario (weekPlanner.ts).
 */

const DAY_TERMS: [string, PlanningWeekday][] = [
  ['lunes', 'monday'],
  ['martes', 'tuesday'],
  ['miercoles', 'wednesday'],
  ['jueves', 'thursday'],
  ['viernes', 'friday'],
  ['sabado', 'saturday'],
  ['domingo', 'sunday'],
];
const DAY = '(lunes|martes|miercoles|jueves|viernes|sabado|domingo)';
const dayFromTerm = (term: string) => DAY_TERMS.find(([word]) => word === term)?.[1] ?? null;

const shiftDay = (today: PlanningWeekday, days: number): PlanningWeekday =>
  PLANNING_WEEKDAYS[(PLANNING_WEEKDAYS.indexOf(today) + days) % 7]!;

const NUMBER_WORDS: Record<string, number> = {
  una: 1,
  un: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
};

/** «organízame la semana», «planifica mi próxima semana», «reparte… esta semana». */
const PLAN_VERB =
  /\b(?:organiza(?:me|r)?|planifica(?:me|r)?|planea(?:me|r)?|arma(?:me|r)?|distribuye(?:me)?|reparte(?:me)?|ordena(?:me|r)?|agenda(?:me|r)?|bloquea(?:me|r)?|reserva(?:me|r)?|programa(?:me|r)?|ayudame a (?:organizar|planificar|repartir))\b[\s\S]{0,40}\b(?:semana|proximos? (?:7|siete) dias|siguientes (?:7|siete) dias|horario|agenda)\b/;
const SESSION_VERB =
  /\b(estudiar|estudio|repasar|practicar|entrenar|leer|escribir|trabajar en|preparar|hacer ejercicio|ir al gimnasio|meditar|avanzar en)\b/;
const COUNT_PHRASE =
  /\b(\d{1,2}|una|un|dos|tres|cuatro|cinco|seis|siete)\s+(?:veces|sesiones|bloques|ratos|dias)\b/;
/** Contenido de marca/redes: eso es el Content Planner, no el calendario. */
const CONTENT_WORDS =
  /\b(?:contenidos?|publicaciones?|posts?|reels?|stories|carrusel(?:es)?|piezas?|parrilla|redes sociales)\b/;
const DEADLINE_NOUN =
  /\b(parcial|examen|final|quiz|entrega|sustentacion|exposicion|prueba|evaluacion|presentacion)\b/;
const COMMITMENT_NOUN =
  /\b(reunion|cita|clase|turno|viaje|evento|compromiso|partido|cumpleanos|almuerzo|cena|consulta|medico|trabajo|ensayo)\b/;

/** ¿Pide organizar su semana con el calendario? (antes que contenido o acciones externas). */
export function asksWeekPlan(t: string): boolean {
  if (CONTENT_WORDS.test(t) && !SESSION_VERB.test(t)) return false;
  if (PLAN_VERB.test(t)) return true;
  return (
    SESSION_VERB.test(t) &&
    COUNT_PHRASE.test(t) &&
    /\b(?:semana|antes del?|proximos? (?:7|siete) dias)\b/.test(t)
  );
}

/** «No pude estudiar hoy», «muévelo al jueves a las 6», «pasa el bloque del martes al jueves». */
const MISSED =
  /\bno (?:pude|alcance|logre|hice|fui a|alcanzo|pudo)\b[\s\S]{0,60}\b(?:hoy|ayer|esta manana|esta tarde|bloque|sesion|estudiar|repasar|entrenar|practicar|leer)\b/;
const MOVE_VERB =
  /\b(?:muevelo|muevela|mueve(?:me)?|pasalo|pasala|pasa(?:me)?|cambialo|cambiala|reprograma(?:lo|la|me)?|aplaza(?:lo|la)?|corre(?:lo|la))\b/;

export function asksReplan(t: string): boolean {
  if (MISSED.test(t)) return true;
  return (
    MOVE_VERB.test(t) &&
    new RegExp(`\\b(?:${DAY.slice(1, -1)}|manana|pasado manana|bloque|sesion)\\b`).test(t)
  );
}

/** ¿Qué intención de calendario pide la frase? (null = ninguna). */
export function calendarIntentOf(t: string): 'plan_week' | 'replan_block' | null {
  if (asksReplan(t)) return 'replan_block';
  if (asksWeekPlan(t)) return 'plan_week';
  return null;
}

/** «a las 6» → 18:00 (sin am/pm, de 1 a 7 se entiende tarde); «a las 9 de la mañana» → 09:00. */
export function timeOf(t: string): string | null {
  const match =
    /\ba (?:las|la) (\d{1,2})(?:(?::|\.|\s?y\s?)(\d{2}|media|cuarto))?\s*(am|a\.?\s?m\.?|pm|p\.?\s?m\.?|de la manana|de la tarde|de la noche|del mediodia)?/.exec(
      t,
    );
  if (!match) return null;
  let hour = Number(match[1]);
  const minute =
    match[2] === 'media' ? 30 : match[2] === 'cuarto' ? 15 : match[2] ? Number(match[2]) : 0;
  const suffix = match[3] ?? '';
  if (hour > 23 || minute > 59) return null;
  if (/p|tarde|noche/.test(suffix) && hour < 12) hour += 12;
  else if (/a\.?\s?m|manana/.test(suffix) && hour === 12) hour = 0;
  else if (!suffix && hour >= 1 && hour <= 7) hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Día de una frase: un día de la semana, «hoy», «mañana» o «pasado mañana». */
export function dayOf(t: string, today: PlanningWeekday): PlanningWeekday | null {
  if (/\bpasado manana\b/.test(t)) return shiftDay(today, 2);
  // «mañana» = el día siguiente; «por/en/de la mañana» es una franja.
  if (/(?<!(?:la|las|por|en|de|esta) )\bmanana\b/.test(t)) return shiftDay(today, 1);
  if (/\bhoy\b/.test(t)) return today;
  const match = new RegExp(`\\b${DAY}\\b`).exec(t);
  return match ? dayFromTerm(match[1]!) : null;
}

const STOP_WORDS = new Set([
  'tres',
  'dos',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'una',
  'un',
  'veces',
  'sesiones',
  'bloques',
  'antes',
  'esta',
  'semana',
  'proxima',
  'el',
  'los',
  'la',
  'las',
  'a',
  'al',
  'en',
  'hoy',
  'manana',
  'durante',
  'cada',
  'minutos',
  'horas',
  'hora',
  'y',
  'que',
  'por',
  ...DAY_TERMS.map(([word]) => word),
]);

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);

/** Frase desde `index` en el original, hasta la primera palabra de parada (máx. `max` palabras). */
function phraseAt(original: string, folded: string, index: number, max: number): string {
  const words: string[] = [];
  const re = /[a-zñ0-9]+/g;
  re.lastIndex = index;
  let match: RegExpExecArray | null;
  while ((match = re.exec(folded)) && words.length < max) {
    if (STOP_WORDS.has(match[0]) || /^\d+$/.test(match[0])) break;
    words.push(original.slice(match.index, match.index + match[0].length));
  }
  return words.join(' ');
}

function durationOf(t: string): number | null {
  if (/\bhora y media\b/.test(t)) return 90;
  if (/\bmedia hora\b/.test(t)) return 30;
  const hours = /\b(\d(?:[.,]5)?)\s*(?:horas?|h)\b/.exec(t);
  if (hours) return Math.round(Number(hours[1]!.replace(',', '.')) * 60);
  if (/\b(?:una|1) hora\b/.test(t)) return 60;
  const minutes = /\b(\d{2,3})\s*(?:minutos|min)\b/.exec(t);
  return minutes ? Number(minutes[1]) : null;
}

function windowOf(t: string): GeneratedWeekPlanning['window'] {
  const after = /\b(?:despues de|desde) las (\d{1,2})/.exec(t);
  const until = /\b(?:antes de|hasta) las (\d{1,2})/.exec(t);
  const toHour = (value: string, afternoon: boolean) => {
    const hour = Number(value);
    return afternoon && hour >= 1 && hour <= 11 ? hour + 12 : hour;
  };
  let startHour = after ? toHour(after[1]!, Number(after[1]) <= 7) : null;
  let endHour = until ? toHour(until[1]!, Number(until[1]) <= 11) : null;
  if (startHour === null && endHour === null) {
    if (/\b(?:en|por) las mananas\b|\bpor la manana\b/.test(t)) [startHour, endHour] = [7, 12];
    else if (/\b(?:en|por) las tardes\b|\bpor la tarde\b/.test(t)) [startHour, endHour] = [14, 19];
    else if (/\b(?:en|por) las noches\b|\bpor la noche\b/.test(t)) [startHour, endHour] = [19, 23];
  }
  return {
    startHour: startHour !== null && startHour <= 23 ? startHour : null,
    endHour: endHour !== null && endHour >= 1 && endHour <= 24 ? endHour : null,
  };
}

/** Partes de la frase (comas, puntos y «y» antes de otro compromiso). */
function clauses(original: string): { original: string; folded: string }[] {
  const folded = fold(original);
  const parts: { original: string; folded: string }[] = [];
  const re =
    /[,.;:!?\n]+|\s+(?:y|pero)\s+(?=(?:el|la|los|las|tengo|quiero|mi|me|necesito|debo)\b)/g;
  let last = 0;
  for (const match of folded.matchAll(re)) {
    parts.push({
      original: original.slice(last, match.index),
      folded: folded.slice(last, match.index),
    });
    last = match.index! + match[0].length;
  }
  parts.push({ original: original.slice(last), folded: folded.slice(last) });
  return parts.filter((part) => part.folded.trim().length > 0);
}

/** Interpreta «organízame la semana…» (una solicitud; `previous` es la de antes, si se ajusta). */
export function interpretWeekPlanning(
  request: string,
  today: PlanningWeekday,
  previous: GeneratedWeekPlanning | null = null,
): GeneratedWeekPlanning {
  const t = fold(request);
  const horizon = /\b(?:proxima semana|semana que viene|siguiente semana)\b/.test(t)
    ? 'next_week'
    : /\b(?:proximos|siguientes) (?:7|siete) dias\b/.test(t)
      ? 'next_7_days'
      : (previous?.horizon ?? 'this_week');

  const commitments: GeneratedWeekPlanning['commitments'] = [];
  const sessions: GeneratedWeekPlanning['sessions'] = [];
  let subject: string | null = null;
  const duration = durationOf(t);

  for (const part of clauses(request)) {
    const f = part.folded;
    const before = new RegExp(`\\bantes del? ${DAY}\\b`).exec(f);
    const deadline = DEADLINE_NOUN.exec(f);
    const day = dayOf(f.replace(new RegExp(`\\bantes del? ${DAY}\\b`), ''), today);
    if (deadline && (day || before)) {
      const of = /\b(?:de|del)\s+([a-zñ]+)/.exec(f.slice(deadline.index + deadline[0].length));
      const subjectWord =
        of && !STOP_WORDS.has(of[1]!)
          ? part.original.slice(
              deadline.index + deadline[0].length + of.index + of[0].length - of[1]!.length,
              deadline.index + deadline[0].length + of.index + of[0].length,
            )
          : null;
      subject ??= subjectWord;
      commitments.push({
        title: capitalize(
          `${part.original.slice(deadline.index, deadline.index + deadline[0].length)}${subjectWord ? ` de ${subjectWord}` : ''}`,
        ),
        day: before ? dayFromTerm(before[1]!) : day,
        time: before ? null : timeOf(f),
        isDeadline: true,
      });
    } else if (before && !SESSION_VERB.test(f)) {
      commitments.push({
        title: 'Fecha límite',
        day: dayFromTerm(before[1]!),
        time: null,
        isDeadline: true,
      });
    }

    const verb = SESSION_VERB.exec(f);
    if (verb) {
      if (before && !deadline) {
        commitments.push({
          title: 'Fecha límite',
          day: dayFromTerm(before[1]!),
          time: null,
          isDeadline: true,
        });
      }
      const count = COUNT_PHRASE.exec(f);
      const object = phraseAt(part.original, f, verb.index + verb[0].length, 4);
      sessions.push({
        title: capitalize(
          `${part.original.slice(verb.index, verb.index + verb[0].length)}${object ? ` ${object}` : ''}`,
        ),
        count: count ? (NUMBER_WORDS[count[1]!] ?? Math.min(10, Math.max(1, Number(count[1])))) : 1,
        durationMinutes: duration,
        day: before ? null : day,
        time: before ? null : timeOf(f),
      });
      continue;
    }

    const noun = COMMITMENT_NOUN.exec(f);
    if (noun && day && !deadline) {
      const rest = phraseAt(part.original, f, noun.index + noun[0].length, 2);
      commitments.push({
        title: capitalize(
          `${part.original.slice(noun.index, noun.index + noun[0].length)}${rest ? ` ${rest}` : ''}`,
        ),
        day,
        time: timeOf(f),
        isDeadline: false,
      });
    }
  }

  // «Estudiar» a secas antes de un «parcial de cálculo» → «Estudiar cálculo».
  for (const session of sessions) {
    if (subject && !session.title.includes(' ')) session.title = `${session.title} ${subject}`;
  }

  const avoidDays = [
    ...new Set(
      [
        ...t.matchAll(
          new RegExp(`\\b(?:no puedo|sin|evita|excepto|menos|nada)\\b(?: (?:el|los))? ${DAY}`, 'g'),
        ),
      ]
        .map((match) => dayFromTerm(match[1]!))
        .filter((day): day is PlanningWeekday => Boolean(day)),
    ),
  ];

  const merged = previous
    ? {
        horizon,
        commitments: [...previous.commitments, ...commitments],
        sessions: sessions.length ? sessions : previous.sessions,
        window: { ...previous.window, ...nonNull(windowOf(t)) },
        avoidDays: [...new Set([...previous.avoidDays, ...avoidDays])],
      }
    : { horizon, commitments, sessions, window: windowOf(t), avoidDays };
  return GeneratedWeekPlanningSchema.parse({
    ...merged,
    clarificationNeeded: merged.sessions.length
      ? null
      : '¿Qué quieres que reserve en tu semana? Por ejemplo: «estudiar cálculo tres veces antes del viernes».',
  });
}

const nonNull = (window: GeneratedWeekPlanning['window']) =>
  Object.fromEntries(Object.entries(window).filter(([, value]) => value !== null));

export interface MoveRequest {
  /** Día del bloque que se mueve («del martes», «hoy»). */
  from: PlanningWeekday | null;
  /** Día destino («al jueves»). */
  to: PlanningWeekday | null;
  time: string | null;
  /** Palabras del tema («cálculo»), para elegir entre varios bloques. */
  subject: string[];
}

/** «Ese bloque del martes pásalo al jueves», «No pude estudiar cálculo hoy», «Muévelo al jueves a las 6». */
export function interpretMove(request: string, today: PlanningWeekday): MoveRequest {
  const t = fold(request);
  const day = (re: RegExp) => {
    const match = re.exec(t);
    if (!match) return null;
    if (match[1] === 'hoy') return today;
    if (match[1] === 'manana') return shiftDay(today, 1);
    return dayFromTerm(match[1]!);
  };
  const to =
    day(new RegExp(`\\b(?:al|para el|para|hacia el|hasta el)\\s+${DAY}\\b`)) ??
    day(/\b(?:para|a)\s+(manana)\b/) ??
    (MOVE_VERB.test(t)
      ? day(new RegExp(`\\b(?:el|este|el proximo)\\s+${DAY}\\b(?![\\s\\S]*\\bal\\b)`))
      : null);
  const from =
    day(new RegExp(`\\b(?:del|de el|de este|de)\\s+${DAY}\\b`)) ?? day(/\b(hoy)\b/) ?? null;
  const subject = [
    ...(t.match(/\b[a-zñ]{4,}\b/g) ?? []).filter(
      (word) =>
        !STOP_WORDS.has(word) &&
        !/^(?:pude|estudiar|bloque|sesion|muevelo|muevela|pasalo|pasala|cambialo|cambiala|mueve|para|ese|este|esta|reprograma|despues)$/.test(
          word,
        ),
    ),
  ];
  return { from: from === to ? (to ? null : from) : from, to, time: timeOf(t), subject };
}
