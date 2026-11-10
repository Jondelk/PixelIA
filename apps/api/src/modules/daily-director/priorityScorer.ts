import type { ContentItem, ContentPlanItem, DailyUrgency, Task } from '@pixel/contracts';
import { daysUntil, relativeDay, type DayContext } from './dailyTime.js';
import type { ProjectHealth } from './projectHealth.js';

/*
 * DailyPriorityScorer: puntuación DETERMINÍSTICA de lo que merece atención hoy. Fórmula simple,
 * legible y testeable (docs/DAILY-DIRECTOR.md §PriorityScorer). La IA no decide desde cero: recibe
 * los candidatos ordenados con sus señales y los interpreta.
 *
 * Tareas                         Contenido (no publicado)
 *   vencida          +40 (+2/día, máx. +10)    prevista y pasada  +35 (+2/día, máx. +10)
 *   vence hoy        +35                       prevista hoy       +30
 *   vence mañana     +25                       prevista mañana    +22
 *   vence en ≤ 3 d   +15                       prevista en ≤ 3 d  +12
 *   vence en ≤ 7 d   +8                        prevista en ≤ 7 d  +6
 *   prioridad alta   +20 · media +10           lista +12 · revisión +8 · producción +6 · planificada +4
 *   en curso         +8  · inbox −3            proyecto en riesgo +6
 *   proyecto en riesgo +12 · necesita atención +6
 *
 * Urgencia: ≥ 60 crítica · ≥ 40 alta · ≥ 20 media · resto baja.
 * No existe un modelo de dependencias entre tareas: "bloquea a otra" no se puede saber y no se
 * afirma. El plazo del proyecto actúa como señal de impacto.
 */

export interface Signal {
  code: string;
  points: number;
  /** Frase de hecho, en español (fallback y contexto de la IA). */
  text: string;
}

export interface Scored<T> {
  item: T;
  score: number;
  urgency: DailyUrgency;
  signals: Signal[];
  daysUntil: number | null;
}

export function urgencyOf(score: number): DailyUrgency {
  if (score >= 60) return 'critical';
  if (score >= 40) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

function dateSignals(
  days: number | null,
  points: { overdue: number; today: number; tomorrow: number; soon: number; week: number },
  words: { past: (days: number) => string; future: (days: number) => string },
): Signal[] {
  if (days === null) return [];
  if (days < 0) {
    return [
      {
        code: 'overdue',
        points: points.overdue + Math.min(10, -days * 2),
        text: words.past(days),
      },
    ];
  }
  if (days === 0) return [{ code: 'due_today', points: points.today, text: words.future(0) }];
  if (days === 1) return [{ code: 'due_tomorrow', points: points.tomorrow, text: words.future(1) }];
  if (days <= 3) return [{ code: 'due_soon', points: points.soon, text: words.future(days) }];
  if (days <= 7) return [{ code: 'due_week', points: points.week, text: words.future(days) }];
  return [];
}

const finish = <T>(item: T, signals: Signal[], days: number | null): Scored<T> => {
  const score = Math.max(
    0,
    signals.reduce((sum, signal) => sum + signal.points, 0),
  );
  return { item, score, urgency: urgencyOf(score), signals, daysUntil: days };
};

export function scoreTask(
  task: Task,
  day: DayContext,
  projects: ReadonlyMap<string, { name: string; health: ProjectHealth }>,
): Scored<Task> {
  const days = daysUntil(task.dueDate, day);
  const signals = dateSignals(
    days,
    { overdue: 40, today: 35, tomorrow: 25, soon: 15, week: 8 },
    { past: (d) => `Venció ${relativeDay(d)}`, future: (d) => `Vence ${relativeDay(d)}` },
  );
  if (task.priority === 'high')
    signals.push({ code: 'priority_high', points: 20, text: 'Es de prioridad alta' });
  if (task.priority === 'medium')
    signals.push({ code: 'priority_medium', points: 10, text: 'Es de prioridad media' });
  if (task.status === 'doing')
    signals.push({ code: 'in_progress', points: 8, text: 'Ya está en curso' });
  if (task.status === 'inbox')
    signals.push({ code: 'inbox', points: -3, text: 'Aún está en el inbox' });
  const project = task.projectId ? projects.get(task.projectId) : undefined;
  if (project?.health.status === 'at_risk') {
    signals.push({
      code: 'project_at_risk',
      points: 12,
      text: `Forma parte de «${project.name}», que está en riesgo`,
    });
  } else if (project?.health.status === 'attention') {
    signals.push({
      code: 'project_attention',
      points: 6,
      text: `Forma parte de «${project.name}», que necesita atención`,
    });
  }
  return finish(task, signals, days);
}

const CONTENT_STATUS_POINTS: Partial<Record<ContentItem['status'], Signal>> = {
  ready: { code: 'content_ready', points: 12, text: 'Está lista para publicar' },
  review: { code: 'content_review', points: 8, text: 'Está en revisión' },
  production: { code: 'content_production', points: 6, text: 'Está en producción' },
  planned: { code: 'content_planned', points: 4, text: 'Está planificada' },
};

export function scoreContent(
  item: ContentItem,
  day: DayContext,
  projects: ReadonlyMap<string, { name: string; health: ProjectHealth }>,
): Scored<ContentItem> {
  const days = daysUntil(item.scheduledFor, day);
  const signals = dateSignals(
    days,
    { overdue: 35, today: 30, tomorrow: 22, soon: 12, week: 6 },
    {
      past: (d) => `Estaba prevista para ${relativeDay(d)} y no se ha publicado`,
      future: (d) => `Está prevista para ${relativeDay(d)}`,
    },
  );
  const status = CONTENT_STATUS_POINTS[item.status];
  if (status) signals.push(status);
  const project = item.projectId ? projects.get(item.projectId) : undefined;
  if (project?.health.status === 'at_risk') {
    signals.push({
      code: 'project_at_risk',
      points: 6,
      text: `Es del proyecto «${project.name}», que está en riesgo`,
    });
  }
  return finish(item, signals, days);
}

/** Propuestas de un plan de contenido aún sin aceptar: solo cuentan por su fecha sugerida. */
export function scorePlanItem(item: ContentPlanItem, day: DayContext): Scored<ContentPlanItem> {
  const days = daysUntil(item.scheduledFor, day);
  const signals = dateSignals(
    days,
    { overdue: 0, today: 14, tomorrow: 10, soon: 6, week: 3 },
    {
      past: (d) => `Tenía fecha sugerida ${relativeDay(d)}`,
      future: (d) => `Tu plan de contenido la sugiere para ${relativeDay(d)}`,
    },
  );
  return finish(item, signals, days);
}

export function byScore<T>(items: Scored<T>[]): Scored<T>[] {
  return [...items].sort((a, b) => b.score - a.score || (a.daysUntil ?? 99) - (b.daysUntil ?? 99));
}
