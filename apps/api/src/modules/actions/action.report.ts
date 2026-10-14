import type { PixelPlanAction } from '@pixel/contracts';
import type { ActionErrorCode } from './action.types.js';
import type { ActionDraft, ActionResultRecord } from './action.snapshot.js';

/*
 * Lo que Pixel DICE de una ejecución sale de los resultados verificados (Prompt 18), nunca de la IA:
 * - todo verificado → «Listo. Creé…»;
 * - algo verificado → «Creé X, pero no pude Y»;
 * - nada → «No pude…».
 * «Creé» solo aparece si existe un resultado `success`.
 */

export const ACTION_ERROR_TEXT: Record<ActionErrorCode, string> = {
  tool_unavailable: 'Esta acción no está disponible ahora',
  capability_unavailable: 'Esta acción no está disponible ahora',
  unauthorized: 'Necesita una autorización que Pixel todavía no puede pedir',
  invalid_input: 'Sus datos no son válidos',
  resource_not_found: 'Lo que necesitaba ya no existe en este Pixel',
  resource_conflict: 'Chocó con el estado actual de este Pixel',
  execution_failed: 'No se pudo completar',
  verification_failed: 'No pude confirmar que se completara',
  dependency_failed: 'No se hizo porque falló lo anterior',
  execution_interrupted: 'La ejecución se interrumpió',
};

/** Vista humana de las acciones del plan, con su resultado (sin claves ni entradas internas). */
export function planActionsView(
  drafts: ActionDraft[],
  results: ActionResultRecord[],
  revision: number,
): PixelPlanAction[] {
  const latest = new Map(
    results
      .filter((result) => result.revision === revision)
      .map((result) => [result.actionId, result]),
  );
  return drafts.map((draft) => {
    const result = latest.get(draft.id);
    const resource =
      result?.status === 'success'
        ? (result.resourceRefs.find((ref) => ref.kind === draft.kind) ?? null)
        : null;
    return {
      id: draft.id,
      stepId: draft.stepId,
      kind: draft.kind,
      effect: draft.effect,
      title: draft.title,
      label: draft.label,
      status: result?.status ?? 'pending',
      resource,
      error:
        result && result.status !== 'success' && result.errorCode
          ? ACTION_ERROR_TEXT[result.errorCode]
          : null,
    };
  });
}

const quoted = (labels: string[]) => {
  const items = labels.map((label) => `«${label}»`);
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
};

const tasksWord = (count: number) => (count === 1 ? 'tarea' : 'tareas');

export interface ActionOutcome {
  status: 'completed' | 'partial' | 'failed';
  reply: string;
}

/** Estado y respuesta del plan a partir de los resultados. Única fuente: PixelCommand.status. */
export function describeOutcome(
  drafts: ActionDraft[],
  results: ActionResultRecord[],
): ActionOutcome {
  const byId = new Map(results.map((result) => [result.actionId, result]));
  const ok = (draft: ActionDraft) => byId.get(draft.id)?.status === 'success';
  const projects = drafts.filter((draft) => draft.kind === 'project');
  const tasks = drafts.filter((draft) => draft.kind === 'task');
  const others = drafts.filter((draft) => draft.kind !== 'project' && draft.kind !== 'task');
  const done = drafts.filter(ok);

  if (done.length === drafts.length) {
    const project = projects[0];
    if (project && tasks.length) {
      return {
        status: 'completed',
        reply: `Listo. Creé el proyecto «${project.label}» y ${tasks.length === 1 ? `su tarea «${tasks[0]!.label}»` : `sus ${tasks.length} tareas: ${quoted(tasks.map((t) => t.label))}`}.`,
      };
    }
    if (project)
      return { status: 'completed', reply: `Listo. Creé el proyecto «${project.label}».` };
    if (tasks.length && !others.length) {
      return {
        status: 'completed',
        reply: `Listo. Creé ${tasks.length === 1 ? 'la tarea' : `${tasks.length} tareas:`} ${quoted(tasks.map((t) => t.label))}.`,
      };
    }
    return { status: 'completed', reply: `Listo. ${quoted(done.map((d) => d.label))}: hecho.` };
  }

  // Qué salió y qué no, con el motivo honesto de cada cosa.
  const failedProject = projects.find((draft) => !ok(draft));
  const notDone = drafts.filter((draft) => !ok(draft));
  const unconfirmed = notDone.filter((d) => byId.get(d.id)?.errorCode === 'verification_failed');
  const missing = notDone.filter(
    (d) =>
      !unconfirmed.includes(d) &&
      byId.get(d.id)?.errorCode !== 'dependency_failed' &&
      d !== failedProject,
  );
  const lines: string[] = [];
  if (failedProject) {
    const dependants = tasks.filter((t) => byId.get(t.id)?.errorCode === 'dependency_failed');
    lines.push(
      byId.get(failedProject.id)?.errorCode === 'verification_failed'
        ? `No pude confirmar que el proyecto «${failedProject.label}» se creara${dependants.length ? `, así que no creé sus ${dependants.length} ${tasksWord(dependants.length)}` : ''}.`
        : `No pude crear el proyecto «${failedProject.label}»${dependants.length ? `, así que no creé sus ${dependants.length} ${tasksWord(dependants.length)}` : ''}.`,
    );
  }
  const unconfirmedOthers = unconfirmed.filter((d) => d !== failedProject);
  if (missing.length) lines.push(`No pude crear ${quoted(missing.map((d) => d.label))}.`);
  if (unconfirmedOthers.length) {
    lines.push(`No pude confirmar que ${quoted(unconfirmedOthers.map((d) => d.label))} se creara.`);
  }

  if (!done.length) {
    return { status: 'failed', reply: `${lines.join(' ')} No se creó nada.` };
  }
  const doneProject = projects.find(ok);
  const doneTasks = tasks.filter(ok);
  const created = doneProject
    ? doneTasks.length
      ? `Creé el proyecto «${doneProject.label}» y ${doneTasks.length} de las ${tasks.length} ${tasksWord(tasks.length)}`
      : `Creé el proyecto «${doneProject.label}»`
    : doneTasks.length
      ? `Creé ${doneTasks.length} de las ${tasks.length} ${tasksWord(tasks.length)}`
      : `Creé ${quoted(done.map((d) => d.label))}`;
  return {
    status: 'partial',
    reply: `${created}. ${lines.join(' ')} Puedes reintentarlo: lo que ya está creado no se duplica.`,
  };
}
