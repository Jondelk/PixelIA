import type { PixelActionStepType, PixelResourceKind } from '@pixel/contracts';
import { AppError } from '../../lib/errors.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import type {
  ActionAuthorization,
  ActionEffect,
  ActionErrorCode,
  ActionTarget,
  ControlledResourceRef,
} from './action.types.js';
import { coveredByPlanConfirmation } from './authorization.policy.js';
import type { PixelToolRegistry } from './toolRegistry.js';

/*
 * Del plan humano a acciones concretas (Prompt 18, docs/PIXEL-ACTIONS.md).
 *
 * PixelActionPlan ES la propuesta que ve el usuario: no hay un segundo agregado de propuestas. Al
 * confirmar, sus pasos migrados se EXPANDEN en acciones de herramienta (un proyecto, CADA tarea) y
 * se CONGELAN en el snapshot autorizado: revisión, quién, cuándo y la entrada exacta de cada acción.
 * Lo congelado no se modifica nunca; un ajuste crea otra revisión antes de confirmar.
 *
 * Pasos migrados: create_project y create_tasks. Los demás (campaña, plan, pieza, memoria) siguen
 * por el ejecutor anterior sin cambios.
 */

/** Un campo de la entrada que se rellena con el recurso que produjo otra acción. */
export interface ActionInputRef {
  field: string;
  fromAction: string;
  kind: PixelResourceKind;
}

/** Una acción expandida del plan (antes de congelarla). */
export interface ActionDraft {
  id: string;
  stepId: string;
  toolKey: string;
  capabilityKey: string;
  kind: PixelResourceKind;
  effect: Exclude<ActionEffect, 'read'>;
  title: string;
  label: string;
  input: Record<string, unknown>;
  inputRefs: ActionInputRef[];
  dependsOnActionId: string | null;
}

/** Acción autorizada: lo que se ejecutará EXACTAMENTE. */
export interface FrozenAction extends ActionDraft {
  target: ActionTarget;
  authorization: ActionAuthorization;
}

export interface AuthorizedActionSnapshot {
  revision: number;
  authorizedBy: string;
  authorizedAt: Date;
  actions: FrozenAction[];
}

/** Lo que REALMENTE ocurrió con una acción (embebido en el PixelCommand). */
export interface ActionResultRecord {
  actionId: string;
  stepId: string;
  revision: number;
  toolKey: string;
  capabilityKey: string;
  status: 'success' | 'failed' | 'skipped';
  /**
   * true solo si la verificación encontró el efecto. Todo `success` del ejecutor está verificado; la
   * única excepción son los recursos heredados de un comando anterior al Prompt 18.
   */
  verified: boolean;
  summary: string;
  resourceRefs: ControlledResourceRef[];
  errorCode: ActionErrorCode | null;
  executionId: string;
  executedAt: Date;
}

interface PlanStepLike {
  id: string;
  type: PixelActionStepType;
  params: Record<string, unknown>;
}

const projectActionId = (stepId: string) => `${stepId}.project`;

type Expander = (step: PlanStepLike) => ActionDraft[];

/** Cómo se expande cada paso migrado. Un mapa, no un switch: añadir uno no toca el ejecutor. */
const EXPANDERS: Partial<Record<PixelActionStepType, Expander>> = {
  create_project: (step) => {
    const name = typeof step.params.name === 'string' ? step.params.name : 'Proyecto';
    return [
      {
        id: projectActionId(step.id),
        stepId: step.id,
        toolKey: 'workspace.projects',
        capabilityKey: 'create_project',
        kind: 'project',
        effect: 'create',
        title: `Crear el proyecto «${name}»`,
        label: name,
        input: { ...step.params },
        inputRefs: [],
        dependsOnActionId: null,
      },
    ];
  },
  create_tasks: (step) => {
    const { tasks, projectFromStep } = step.params;
    const fromAction =
      typeof projectFromStep === 'string' ? projectActionId(projectFromStep) : null;
    return (Array.isArray(tasks) ? tasks : []).map((raw, index) => {
      const input = { ...(raw as Record<string, unknown>) };
      const title = typeof input.title === 'string' ? input.title : `Tarea ${index + 1}`;
      return {
        id: `${step.id}.task_${index + 1}`,
        stepId: step.id,
        toolKey: 'workspace.tasks',
        capabilityKey: 'create_task',
        kind: 'task',
        effect: 'create',
        title: `Crear la tarea «${title}»`,
        label: title,
        input,
        inputRefs: fromAction ? [{ field: 'projectId', fromAction, kind: 'project' }] : [],
        dependsOnActionId: fromAction,
      };
    });
  },
  // Prompt 19: cada bloque del plan de la semana es UNA acción create_event (su propio resultado).
  schedule_blocks: (step) => {
    const blocks = Array.isArray(step.params.blocks) ? step.params.blocks : [];
    return blocks.map((raw, index) => {
      const block = raw as { input?: Record<string, unknown>; label?: unknown };
      const input = { ...(block.input ?? {}) };
      const title = typeof input.summary === 'string' ? input.summary : `Bloque ${index + 1}`;
      const label = typeof block.label === 'string' ? block.label : title;
      return {
        id: `${step.id}.block_${index + 1}`,
        stepId: step.id,
        toolKey: 'google.calendar',
        capabilityKey: 'create_event',
        kind: 'calendar_event',
        effect: 'create',
        title: `Guardar «${title}» · ${label}`,
        label,
        input,
        inputRefs: [],
        dependsOnActionId: null,
      };
    });
  },
  move_block: (step) => {
    const input = { ...((step.params.input as Record<string, unknown> | undefined) ?? {}) };
    const title = typeof step.params.title === 'string' ? step.params.title : 'Bloque';
    const label = typeof step.params.label === 'string' ? step.params.label : title;
    return [
      {
        id: `${step.id}.move`,
        stepId: step.id,
        toolKey: 'google.calendar',
        capabilityKey: 'update_event',
        kind: 'calendar_event',
        effect: 'update',
        title: `Mover «${title}» · ${label}`,
        label,
        input,
        inputRefs: [],
        dependsOnActionId: null,
      },
    ];
  },
};

export const isToolStep = (type: PixelActionStepType): boolean => type in EXPANDERS;

/** Expande los pasos migrados (vista previa y base del snapshot). Puro. */
export function expandSteps(steps: PlanStepLike[]): ActionDraft[] {
  return steps.flatMap((step) => EXPANDERS[step.type]?.(step) ?? []);
}

const rejected = (message: string, reason: string) =>
  new AppError(409, 'CONFLICT', message, { reason });

/**
 * Congela las acciones de una revisión confirmada. Antes de ejecutar nada, cada acción debe:
 * existir en el registro y estar disponible en este workspace, quedar cubierta por la confirmación
 * del plan (no `elevated` ni `unsupported`) y tener una entrada válida para su capacidad (los campos
 * que vienen de otra acción se validan al ejecutar). Si algo falla, no se ejecuta NADA.
 */
export async function freezeActions(
  steps: PlanStepLike[],
  registry: PixelToolRegistry,
  workspace: WorkspaceDocument,
): Promise<FrozenAction[]> {
  const frozen: FrozenAction[] = [];
  for (const draft of expandSteps(steps)) {
    const resolved = await registry.resolve(draft.toolKey, draft.capabilityKey, workspace);
    if (!resolved) {
      const availability = await registry.availability(draft.toolKey, workspace);
      if (availability === 'requires_auth' || availability === 'requires_reauth') {
        // Prompt 19: la cuenta se desconectó (o caducó) después de proponer: nada se ejecuta.
        throw rejected(
          'Necesito que vuelvas a conectar tu cuenta antes de guardar esto',
          `action_${availability}`,
        );
      }
      throw rejected(
        'Esta acción no está disponible en este Pixel',
        'action_capability_unavailable',
      );
    }
    if (!coveredByPlanConfirmation(resolved.authorization)) {
      throw rejected(
        'Esta acción necesita una autorización que Pixel todavía no puede pedir',
        'action_unauthorized',
      );
    }
    const refFields = new Set(draft.inputRefs.map((ref) => ref.field));
    const declared = resolved.capability.refFields ?? {};
    if ([...refFields].some((field) => !(field in declared))) {
      throw rejected('La propuesta no es válida; vuelve a pedirla', 'action_invalid_input');
    }
    if (!resolved.capability.inputSchema.safeParse(draft.input).success) {
      throw rejected(
        `«${draft.label}» no tiene datos válidos; ajusta la propuesta antes de organizar`,
        'action_invalid_input',
      );
    }
    frozen.push({
      ...draft,
      target: resolved.capability.target,
      authorization: resolved.authorization,
    });
  }
  return frozen;
}

/**
 * Compatibilidad: un comando parcial anterior al Prompt 18 guardó lo creado solo en sus pasos. Al
 * congelarlo, esos recursos cuentan como acciones ya hechas para que reintentar no los duplique.
 */
export function carriedOverResults(
  steps: (PlanStepLike & { resources: ControlledResourceRef[] })[],
  actions: FrozenAction[],
  revision: number,
  executionId: string,
): ActionResultRecord[] {
  const results: ActionResultRecord[] = [];
  for (const step of steps) {
    if (!step.resources.length) continue;
    const ofStep = actions.filter((action) => action.stepId === step.id);
    ofStep.slice(0, step.resources.length).forEach((action, index) => {
      results.push({
        actionId: action.id,
        stepId: action.stepId,
        revision,
        toolKey: action.toolKey,
        capabilityKey: action.capabilityKey,
        status: 'success',
        // Lo registró el ejecutor anterior (sin verificación): se conserva para no duplicarlo.
        verified: false,
        summary: 'Creado antes de la verificación por acción',
        resourceRefs: [step.resources[index]!],
        errorCode: null,
        executionId,
        executedAt: new Date(),
      });
    });
  }
  return results;
}
