import type { PixelActionPlan, PixelCommand, PixelCreatedResource } from '@pixel/contracts';

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
    case 'creative_memory':
      return `${base}/memory`;
  }
}

/** La confirmación dice lo que hará: recordar u olvidar (Creative Memory) u organizar. */
export function confirmLabel(plan: PixelActionPlan): string {
  if (plan.steps.length && plan.steps.every((step) => step.type === 'remember_memory')) {
    return 'Recordar';
  }
  if (plan.steps.length && plan.steps.every((step) => step.type === 'forget_memory')) {
    return 'Olvidar';
  }
  return 'Organizar';
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

/**
 * Prompt 17: qué refleja la presencia tras una respuesta de PixelCommand (campaña, plan, pieza…):
 * éxito al organizar, aviso si el Guardian vio algo, error si falló; si no, reposo.
 */
export function presenceAfterCommand(
  command: Pick<PixelCommand, 'status' | 'guardian'>,
): 'success' | 'warn' | 'fail' | 'idle' {
  if (command.status === 'completed') return 'success';
  if (command.status === 'partial' || command.status === 'failed') return 'fail';
  if (command.status === 'proposed' && command.guardian && command.guardian.status !== 'pass') {
    return 'warn';
  }
  return 'idle';
}

/** Lo que Pixel dice en una sesión de voz: la pregunta, el resumen de la propuesta o la respuesta. */
export function spokenFor(command: PixelCommand): string | null {
  if (command.status === 'needs_information') return command.question;
  if (command.status === 'proposed') return command.plan?.summary ?? null;
  return command.reply;
}
