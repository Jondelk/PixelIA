import type { PixelCommand, PixelCreatedResource } from '@pixel/contracts';

/*
 * Lógica pura de la entrada de Pixel (sin React): en qué fase está la conversación y adónde lleva
 * cada recurso creado. La UI solo pinta el resultado.
 */

export type CommandPhase =
  | 'idle'
  | 'interpreting'
  | 'question'
  | 'proposal'
  | 'adjusting'
  | 'executing'
  | 'answered'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

/** Fase visible: la petición en curso (local) manda sobre el último estado del servidor. */
export function commandPhase(
  command: PixelCommand | null,
  pending: 'send' | 'adjust' | 'confirm' | null,
): CommandPhase {
  if (pending === 'send') return 'interpreting';
  if (pending === 'adjust') return 'adjusting';
  if (pending === 'confirm') return 'executing';
  if (!command) return 'idle';
  switch (command.status) {
    case 'needs_information':
      return 'question';
    case 'proposed':
      return 'proposal';
    case 'executing':
      return 'executing';
    default:
      return command.status;
  }
}

/** Enlace a lo que Pixel creó (las pantallas de detalle existentes). */
export function resourceLink(base: string, resource: PixelCreatedResource): string {
  switch (resource.kind) {
    case 'campaign':
      return `${base}/campaigns/${encodeURIComponent(resource.id)}`;
    case 'content_plan':
      return `${base}/content-planner/${encodeURIComponent(resource.id)}`;
    case 'project':
      return `${base}/projects/${encodeURIComponent(resource.id)}`;
    case 'task':
      return `${base}/tasks`;
    case 'content_item':
      return `${base}/content`;
  }
}

/** Recursos creados por el comando, sin repetir enlaces (varias tareas → una sola "Ver tareas"). */
export function createdResources(command: PixelCommand): PixelCreatedResource[] {
  const resources = command.plan?.steps.flatMap((step) => step.resources) ?? [];
  const seenTasks = resources.filter((resource) => resource.kind === 'task');
  const others = resources.filter((resource) => resource.kind !== 'task');
  return seenTasks.length
    ? [
        ...others,
        {
          kind: 'task',
          id: seenTasks[0]!.id,
          label: seenTasks.length === 1 ? seenTasks[0]!.label : `${seenTasks.length} tareas`,
        },
      ]
    : others;
}

export const THINKING_COPY = {
  interpreting: {
    title: 'Pixel está entendiendo lo que necesitas…',
    description: 'Lee tu solicitud y la cruza con lo que ya sabe de este Pixel.',
  },
  executing: {
    title: 'Pixel está organizándolo…',
    description: 'Crea lo que aprobaste con los módulos de siempre. Puede tardar un poco.',
  },
} as const;
