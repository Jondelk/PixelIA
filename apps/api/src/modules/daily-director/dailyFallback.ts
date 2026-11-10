import {
  DAILY_MAX_PRIORITIES,
  type DailyContentAction,
  type DailyContentSuggestion,
  type DailyPriority,
  type FocusBlock,
} from '@pixel/contracts';
import type { DailyAnalysis, RefTarget } from './dailyAnalysis.js';

/*
 * Dirección determinística: la que se guarda si no hay IA (modo demo), si el proveedor falla o si
 * la IA devuelve referencias inválidas. Solo usa hechos y el ranking del PriorityScorer. No imita
 * la creatividad de un modelo; también sirve de base para sustituir textos de la IA no fundamentados.
 */

export interface BriefDraft {
  summary: string;
  priorities: DailyPriority[];
  contentSuggestion: DailyContentSuggestion | null;
  focusBlocks: FocusBlock[];
  closingNote: string | null;
}

export const NO_WORK_SUMMARY =
  'Aún no tienes suficiente trabajo registrado para construir una dirección útil para hoy.';

const lowerFirst = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);
const joinEs = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** "Venció ayer, es de prioridad alta y forma parte de «X», que está en riesgo." */
export function factualRationale(target: RefTarget): string {
  const facts = [...target.signals]
    .filter((signal) => signal.points > 0 || signal.code.startsWith('project_'))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((signal, index) => (index === 0 ? signal.text : lowerFirst(signal.text)));
  if (facts.length > 0) return `${joinEs(facts)}.`;
  return target.type === 'task'
    ? 'No tiene fecha ni prioridad alta, pero es lo siguiente en tu lista.'
    : 'Es lo siguiente con más sentido en tu trabajo actual.';
}

export function contentAction(
  target: Pick<RefTarget, 'contentStatus' | 'format'>,
): DailyContentAction {
  switch (target.contentStatus) {
    case 'ready':
      return 'publish';
    case 'review':
      return 'edit';
    case 'production':
      return ['reel', 'short_video', 'long_video', 'story', 'podcast'].includes(target.format ?? '')
        ? 'record'
        : target.format === 'article' || target.format === 'newsletter'
          ? 'develop'
          : 'design';
    default:
      return 'develop';
  }
}

const CONTENT_ACTION_TEXT: Record<DailyContentAction, string> = {
  publish: 'Publícala o dale una fecha nueva.',
  edit: 'Revísala y déjala lista.',
  record: 'Avanza la grabación.',
  design: 'Avanza el diseño.',
  develop: 'Desarróllala un paso más.',
  plan: 'Decide si la llevas a Contenido.',
};

export function factualAction(target: RefTarget): string {
  if (target.type === 'project') return 'Revisa sus tareas abiertas y decide qué entra hoy.';
  if (target.type === 'content' || target.type === 'plan_item') {
    return CONTENT_ACTION_TEXT[target.type === 'plan_item' ? 'plan' : contentAction(target)];
  }
  const has = (code: string) => target.signals.some((signal) => signal.code === code);
  if (has('overdue')) return 'Ciérrala hoy o dale una fecha nueva realista.';
  if (has('in_progress')) return 'Retómala donde la dejaste.';
  const dated = ['due_today', 'due_tomorrow', 'due_soon', 'due_week'].some(has);
  if (has('inbox') && !dated) return 'Decide si es para hoy o dale una fecha.';
  return 'Empieza por ella.';
}

export function toPriority(
  target: RefTarget,
  rank: number,
  rationale?: string,
  action?: string | null,
): DailyPriority {
  return {
    rank,
    type: target.type === 'plan_item' ? 'content' : target.type,
    resourceId: target.id,
    title: target.title,
    rationale: rationale ?? factualRationale(target),
    suggestedAction: action === undefined ? factualAction(target) : action,
    urgency: target.urgency,
  };
}

/** Sugerencia de contenido: pieza existente → propuesta de un plan → proyecto real. Nunca una idea nueva. */
export function factualContentSuggestion(
  analysis: DailyAnalysis,
  exclude: ReadonlySet<string>,
): DailyContentSuggestion | null {
  if (!analysis.helpAreas.content && !analysis.urgentContent) return null;
  const refs = [...analysis.refs.values()];
  // Una pieza que ya es prioridad solo se repite aquí si no hay otra: así su acción queda clara.
  const content =
    refs.find((target) => target.type === 'content' && !exclude.has(target.id)) ??
    refs.find((target) => target.type === 'content' && target.urgency !== 'low');
  if (content) {
    return {
      contentItemId: content.id,
      contentPlanItemId: null,
      contentPlanId: null,
      projectId: content.projectId ?? null,
      title: content.title,
      reason: `Ya existe en Contenido: ${lowerFirst(factualRationale(content))}`,
      suggestedAction: contentAction(content),
    };
  }
  const planItem = refs.find((target) => target.type === 'plan_item');
  if (planItem && analysis.helpAreas.content) {
    return {
      contentItemId: null,
      contentPlanItemId: planItem.id,
      contentPlanId: planItem.contentPlanId ?? null,
      projectId: planItem.projectId ?? null,
      title: planItem.title,
      reason: `Es una propuesta de tu plan de contenido: ${lowerFirst(factualRationale(planItem))}`,
      suggestedAction: 'plan',
    };
  }
  const project = analysis.projects.find((entry) => entry.project.status === 'active');
  if (project && analysis.helpAreas.content) {
    return {
      contentItemId: null,
      contentPlanItemId: null,
      contentPlanId: null,
      projectId: project.project.id,
      title: `Contenido a partir de «${project.project.name}»`,
      reason:
        'Es trabajo real en marcha: puede convertirse en contenido en lugar de partir de una idea nueva.',
      suggestedAction: 'plan',
    };
  }
  return null;
}

export function factualFocusBlocks(
  analysis: DailyAnalysis,
  priorities: DailyPriority[],
  contentSuggestion: DailyContentSuggestion | null,
): FocusBlock[] {
  const targetOf = (id: string | null) =>
    id ? [...analysis.refs.values()].find((target) => target.id === id) : undefined;
  const block = (priority: DailyPriority, order: number): FocusBlock => ({
    order,
    title: truncate(priority.title, 80),
    objective: priority.suggestedAction ?? 'Avanzar lo esencial.',
    relatedResourceId: priority.resourceId,
    relatedResourceType: priority.type,
    suggestedMinutes: targetOf(priority.resourceId)?.estimatedMinutes ?? null,
  });
  const max = analysis.maxFocusBlocks;
  const blocks: FocusBlock[] = priorities
    .slice(0, max)
    .map((priority, index) => block(priority, index + 1));

  // Trabajo profundo: pocos bloques; lo que no cabe se agrupa en el último en vez de abrir otro.
  if (priorities.length > max && blocks.length > 0) {
    const rest = priorities.slice(max - 1);
    const minutes = rest.map((priority) => targetOf(priority.resourceId)?.estimatedMinutes ?? null);
    blocks[max - 1] = {
      order: max,
      title: truncate(`Cerrar ${joinEs(rest.map((priority) => `«${priority.title}»`))}`, 80),
      objective: 'Avanzar lo siguiente sin abrir frentes nuevos.',
      relatedResourceId: null,
      relatedResourceType: null,
      suggestedMinutes: minutes.every((value) => value !== null)
        ? minutes.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        : null,
    };
  }
  if (contentSuggestion && blocks.length < max && analysis.helpAreas.content) {
    blocks.push({
      order: blocks.length + 1,
      title: truncate(contentSuggestion.title, 80),
      objective: CONTENT_ACTION_TEXT[contentSuggestion.suggestedAction],
      relatedResourceId:
        contentSuggestion.contentItemId ??
        contentSuggestion.contentPlanItemId ??
        contentSuggestion.projectId,
      relatedResourceType: contentSuggestion.contentItemId
        ? 'content'
        : contentSuggestion.contentPlanItemId
          ? 'plan_item'
          : contentSuggestion.projectId
            ? 'project'
            : null,
      suggestedMinutes: null,
    });
  }
  // Sesiones cortas: si queda hueco, el siguiente candidato en un bloque propio.
  if (analysis.focusMode === 'short') {
    const used = new Set(blocks.map((entry) => entry.relatedResourceId));
    for (const target of analysis.candidates) {
      if (blocks.length >= max) break;
      if (used.has(target.id)) continue;
      blocks.push(block(toPriority(target, 1), blocks.length + 1));
    }
  }
  return blocks;
}

const count = (value: number) =>
  value === 1 ? 'una cosa' : value === 2 ? 'dos cosas' : 'tres cosas';

export function factualSummary(
  analysis: DailyAnalysis,
  priorities: number,
  hasContent: boolean,
): string {
  if (!analysis.hasWork) return NO_WORK_SUMMARY;
  const { openTasks, overdueTasks, dueToday } = analysis.facts;
  const parts: string[] = [];
  if (openTasks === 0) parts.push('No tienes tareas pendientes.');
  else {
    const extras = [
      overdueTasks ? `${overdueTasks} ${overdueTasks === 1 ? 'vencida' : 'vencidas'}` : null,
      dueToday ? `${dueToday} que ${dueToday === 1 ? 'vence' : 'vencen'} hoy` : null,
    ].filter(Boolean) as string[];
    parts.push(
      `Tienes ${openTasks} ${openTasks === 1 ? 'tarea pendiente' : 'tareas pendientes'}${extras.length ? `, ${joinEs(extras)}` : ''}.`,
    );
  }
  if (priorities > 0) {
    parts.push(
      openTasks > priorities
        ? `No intentaría resolverlo todo: hoy concentraría tu atención en ${count(priorities)}.`
        : `Hoy concentraría tu atención en ${count(priorities)}.`,
    );
  }
  if (analysis.focusMode === 'deep') parts.push('Mejor en bloques largos, sin cambiar de frente.');
  if (analysis.focusMode === 'short') parts.push('Mejor en bloques cortos, uno detrás de otro.');
  if (hasContent && analysis.helpAreas.content)
    parts.push('Y hay una pieza de contenido que ya puede avanzar.');
  return parts.join(' ');
}

export function deterministicBrief(analysis: DailyAnalysis): BriefDraft {
  const priorities = analysis.candidates
    .slice(0, DAILY_MAX_PRIORITIES)
    .map((target, index) => toPriority(target, index + 1));
  const contentSuggestion = analysis.hasWork
    ? factualContentSuggestion(
        analysis,
        new Set(priorities.map((priority) => priority.resourceId ?? '')),
      )
    : null;
  return {
    summary: factualSummary(analysis, priorities.length, Boolean(contentSuggestion)),
    priorities,
    contentSuggestion,
    focusBlocks: factualFocusBlocks(analysis, priorities, contentSuggestion),
    closingNote:
      analysis.facts.openTasks > priorities.length && priorities.length > 0
        ? 'Lo demás puede esperar. Actualiza la dirección cuando cierres algo.'
        : null,
  };
}
