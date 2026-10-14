import type {
  DailyBrief,
  DailyContentSuggestion,
  DailyPriority,
  DailyResourceType,
  FocusBlock,
} from '@pixel/contracts';
import { errorReason } from '../../lib/api';

/*
 * Lógica pura del Daily Director en la web: enlaces a cada recurso, "actualizado hace…",
 * etiquetas y detección de "aún no hay dirección". Sin React: se testea directamente.
 */

export function isNotGenerated(err: unknown): boolean {
  return errorReason(err) === 'daily_brief_not_generated';
}

/** Enlace del recurso de una prioridad o bloque (no hay detalle de tarea: va a Tareas). */
export function resourceHref(
  base: string,
  type: DailyResourceType | DailyPriority['type'] | null,
  id: string | null,
): string | null {
  if (!type) return null;
  switch (type) {
    case 'task':
      return `${base}/tasks`;
    case 'project':
      return id ? `${base}/projects/${id}` : `${base}/projects`;
    case 'content':
      return `${base}/content`;
    case 'plan_item':
      return `${base}/content-planner`;
  }
}

export const RESOURCE_LINK_LABEL: Record<DailyPriority['type'], string> = {
  task: 'Ver tarea',
  project: 'Ver proyecto',
  content: 'Abrir contenido',
};

export function suggestionLink(
  base: string,
  suggestion: DailyContentSuggestion,
): { href: string; label: string } {
  if (suggestion.contentItemId) return { href: `${base}/content`, label: 'Abrir contenido' };
  if (suggestion.contentPlanId) {
    return { href: `${base}/content-planner/${suggestion.contentPlanId}`, label: 'Ver en el plan' };
  }
  if (suggestion.projectId)
    return { href: `${base}/projects/${suggestion.projectId}`, label: 'Ver proyecto' };
  return { href: `${base}/content`, label: 'Ir a Contenido' };
}

/** "hace un momento", "hace 5 min", "hace 2 h", "ayer". */
export function updatedAgo(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return hours < 48 ? 'ayer' : `hace ${Math.round(hours / 24)} días`;
}

/** Cómo se generó, dicho con honestidad. */
export function generationLabel(brief: Pick<DailyBrief, 'generationMode' | 'generation'>): string {
  if (brief.generationMode === 'ai') return 'Dirección de Pixel';
  switch (brief.generation.fallbackReason) {
    case 'ai_unavailable':
      return 'Dirección básica: la IA no estaba disponible';
    case 'invalid_output':
      return 'Dirección básica: la propuesta de la IA no superó la validación';
    case 'no_work':
      return 'Sin trabajo registrado';
    default:
      return 'Dirección básica, calculada con tus fechas y prioridades (sin IA)';
  }
}

export const pad2 = (value: number) => String(value).padStart(2, '0');

/** "≈ 90 min, según tu estimación" (solo si la tarea lo tiene). */
export function minutesLabel(block: Pick<FocusBlock, 'suggestedMinutes'>): string | null {
  return block.suggestedMinutes ? `≈ ${block.suggestedMinutes} min, según tu estimación` : null;
}

/** Zona horaria del navegador (para proponer, nunca para imponer). */
export function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
