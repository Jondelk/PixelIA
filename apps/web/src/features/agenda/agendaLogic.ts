import {
  AGENDA_UPCOMING_DEFAULT_DAYS,
  AGENDA_UPCOMING_MAX_DAYS,
  AGENDA_VIEWS,
  type AgendaDay,
  type AgendaItem,
  type AgendaViewKind,
} from '@pixel/contracts';

/*
 * Lógica pura de «Mi agenda» (Prompt 20, sin React y SIN cálculo de fechas: los días, rangos y
 * etiquetas llegan resueltos del servidor). Aquí solo: qué vista pide la URL, qué marca lleva cada
 * tipo, qué está en cada día y qué borrador se le propone a Pixel.
 */

export const AGENDA_TABS: { view: AgendaViewKind; label: string; question: string }[] = [
  { view: 'today', label: 'Hoy', question: '¿Qué tengo que hacer hoy?' },
  { view: 'week', label: 'Semana', question: '¿Cómo está distribuido mi tiempo esta semana?' },
  { view: 'month', label: 'Mes', question: '¿Qué compromisos importantes tengo este mes?' },
  { view: 'upcoming', label: 'Próximos', question: '¿Qué se me viene después?' },
];

export function viewFromParam(value: string | null): AgendaViewKind {
  return (AGENDA_VIEWS as readonly string[]).includes(value ?? '')
    ? (value as AgendaViewKind)
    : 'today';
}

export function anchorFromParam(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function horizonFromParam(value: string | null): number {
  const days = Number(value);
  return Number.isInteger(days) && days >= 30 && days <= AGENDA_UPCOMING_MAX_DAYS
    ? days
    : AGENDA_UPCOMING_DEFAULT_DAYS;
}

/** «Ver más» en Próximos: 90 días más, sin pasar del máximo. */
export const nextHorizon = (days: number) => Math.min(days + 90, AGENDA_UPCOMING_MAX_DAYS);

/** Marca de cada tipo: forma + texto (nunca solo color). */
export const AGENDA_MARKS: Record<AgendaItem['kind'], string> = {
  commitment: '●',
  pixel_block: '◆',
  pending: '○',
  deadline: '◇',
};

export const AGENDA_LEGEND: { kind: AgendaItem['kind']; label: string }[] = [
  { kind: 'commitment', label: 'Compromiso' },
  { kind: 'pixel_block', label: 'Organizado por Pixel' },
  { kind: 'pending', label: 'Por organizar' },
  { kind: 'deadline', label: 'Fecha límite' },
];

/** Lo que hay en un día (las fechas que cubre cada elemento ya vienen del servidor). */
export const itemsOn = (date: string, items: AgendaItem[]) =>
  items.filter((item) => item.dates.includes(date));

/** Mes: «↳» para un evento de varios días que viene de un día anterior. */
export const continuesFrom = (item: AgendaItem, date: string) =>
  item.multiDay && item.date !== date;

const lower = (text: string) => text.charAt(0).toLocaleLowerCase('es') + text.slice(1);

/** Etiqueta accesible completa de un elemento. */
export function itemAriaLabel(item: AgendaItem): string {
  return [item.kindLabel, item.title, item.timeLabel, item.statusLabel, item.dayLabel]
    .filter(Boolean)
    .join(', ');
}

/** Acción que se ofrece en cada tipo: nunca «Mover» directo (todo pasa por Pixel y confirmación). */
export function itemAction(item: AgendaItem): string {
  if (item.kind === 'pixel_block') return 'Reorganizar';
  if (item.kind === 'pending') return 'Pedirle a Pixel que lo organice';
  return 'Hablar con Pixel';
}

/**
 * Borrador para PixelCommand desde un elemento: texto, nunca ids. El usuario lo completa y lo envía;
 * Pixel propone y nada cambia hasta confirmar.
 */
export function draftForItem(item: AgendaItem): string {
  const when = lower(item.dayLabel);
  switch (item.kind) {
    case 'pixel_block':
      return `Mueve «${item.title}» del ${when} al `;
    case 'pending':
      return `Quiero trabajar en «${item.title}» una vez esta semana`;
    case 'deadline':
      return `Organízame la semana para llegar a «${item.title}» (${lower(item.statusLabel ?? when)}): `;
    default:
      return `Sobre «${item.title}» del ${when}: `;
  }
}

export const draftForDay = (day: AgendaDay) => `Quiero reorganizar el ${lower(day.label)}: `;

/**
 * Prompt 20: el recurso que va en contexto con el borrador. Solo una tarea (la referencia que ya
 * trae el elemento; el servidor la valida contra el workspace): así los bloques que Pixel organice
 * quedan vinculados a ESA tarea. Los eventos nunca van como contexto (ids opacos).
 */
export function contextFor(item: AgendaItem): { type: 'task'; id: string } | undefined {
  return item.kind === 'pending' && item.link?.type === 'task'
    ? { type: 'task', id: item.link.id }
    : undefined;
}

export const REORGANIZE_PLACEHOLDER =
  '¿Qué quieres cambiar? Por ejemplo: «El jueves en la tarde no puedo»';

/** Mes en móvil: puntos por tipo (máximo 3) en vez de texto ilegible. */
export function dotsFor(items: AgendaItem[]): AgendaItem['kind'][] {
  const kinds = [...new Set(items.map((item) => item.kind))];
  return kinds.slice(0, 3);
}
