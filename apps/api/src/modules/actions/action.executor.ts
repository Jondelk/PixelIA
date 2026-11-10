import { ZodError } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import type { ActionErrorCode, ToolExecutionContext } from './action.types.js';
import type { ActionResultRecord, FrozenAction } from './action.snapshot.js';
import { coveredByPlanConfirmation } from './authorization.policy.js';
import type { PixelToolRegistry } from './toolRegistry.js';

/*
 * ActionExecutor (Prompt 18): ejecuta acciones CONGELADAS de un plan autorizado. Secuencial y
 * determinista (V1, síncrono; los estados ya sirven para una ejecución asíncrona futura):
 *
 *   ya hecha → se conserva · depende de una que no salió bien → skipped (dependency_failed) ·
 *   herramienta/capacidad → disponible y cubierta por la confirmación · entrada → schema ·
 *   ejecutar (con límite de tiempo) · salida → schema · VERIFICAR → success.
 *
 * Un fallo no detiene las acciones independientes: el plan queda `partial` y el resultado lo dice.
 * Nunca da algo por hecho sin verificación: la respuesta de Pixel sale de estos resultados, no de
 * la IA. Las herramientas reciben siempre el workspace autorizado, nunca uno de la entrada.
 */

/** Ninguna acción interna tarda esto; protege de una herramienta colgada (no cancela su trabajo). */
export const ACTION_TIMEOUT_MS = 30_000;

export interface ExecuteActionsInput {
  workspace: WorkspaceDocument;
  actions: FrozenAction[];
  /** Resultados de intentos anteriores de ESTA revisión (los `success` no se repiten). */
  previous: ActionResultRecord[];
  revision: number;
  actorUserId: string;
  commandId: string;
  executionId: string;
  registry: PixelToolRegistry;
  logger: Logger;
  /** Persiste cada resultado al producirse (dueño = executionId). */
  onResult: (result: ActionResultRecord) => Promise<void>;
  timeoutMs?: number;
}

class ActionTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ActionTimeout()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Error de un servicio → código normalizado (sin stack ni detalles internos). */
export function errorCodeOf(err: unknown): ActionErrorCode {
  if (err instanceof ZodError) return 'invalid_input';
  // Errores de herramientas externas que ya traen su código normalizado (p. ej. Google Calendar).
  if (typeof err === 'object' && err !== null && 'actionErrorCode' in err) {
    return (err as { actionErrorCode: ActionErrorCode }).actionErrorCode;
  }
  if (err instanceof AppError) {
    if (err.status === 404) return 'resource_not_found';
    if (err.status === 409) return 'resource_conflict';
    if (err.status === 400) return 'invalid_input';
  }
  return 'execution_failed';
}

export async function executeActions(input: ExecuteActionsInput): Promise<ActionResultRecord[]> {
  const results = new Map<string, ActionResultRecord>(
    input.previous
      .filter((result) => result.revision === input.revision)
      .map((result) => [result.actionId, result]),
  );
  for (const action of input.actions) {
    if (results.get(action.id)?.status === 'success') continue;
    const result = await runAction(action, results, input);
    results.set(action.id, result);
    await input.onResult(result);
    input.logger.info(`action.${result.status === 'success' ? 'completed' : 'failed'}`, {
      workspaceId: input.workspace._id.toString(),
      commandId: input.commandId,
      executionId: input.executionId,
      toolKey: action.toolKey,
      capability: action.capabilityKey,
      status: result.status,
      errorCode: result.errorCode,
    });
  }
  return input.actions.map((action) => results.get(action.id)!);
}

async function runAction(
  action: FrozenAction,
  results: Map<string, ActionResultRecord>,
  input: ExecuteActionsInput,
): Promise<ActionResultRecord> {
  const base = {
    actionId: action.id,
    stepId: action.stepId,
    revision: input.revision,
    toolKey: action.toolKey,
    capabilityKey: action.capabilityKey,
    executionId: input.executionId,
  };
  const outcome = (
    status: ActionResultRecord['status'],
    summary: string,
    errorCode: ActionErrorCode | null,
    extra: Partial<ActionResultRecord> = {},
  ): ActionResultRecord => ({
    ...base,
    status,
    verified: false,
    summary,
    resourceRefs: [],
    errorCode,
    executedAt: new Date(),
    ...extra,
  });

  if (action.dependsOnActionId && results.get(action.dependsOnActionId)?.status !== 'success') {
    return outcome(
      'skipped',
      'No se ejecutó porque falló la acción de la que depende',
      'dependency_failed',
    );
  }

  // Se revalida justo antes de ejecutar: una cuenta desconectada después de proponer no ejecuta.
  const resolved = await input.registry.resolve(
    action.toolKey,
    action.capabilityKey,
    input.workspace,
  );
  if (!resolved) {
    const availability = await input.registry.availability(action.toolKey, input.workspace);
    return outcome(
      'failed',
      'La herramienta no está disponible',
      availability === 'requires_auth' || availability === 'requires_reauth'
        ? availability
        : availability !== 'available'
          ? 'tool_unavailable'
          : 'capability_unavailable',
    );
  }
  if (!coveredByPlanConfirmation(resolved.authorization)) {
    return outcome('failed', 'La acción no está autorizada', 'unauthorized');
  }

  // Campos que vienen del resultado de otra acción (p. ej. el proyecto de sus tareas).
  const candidate: Record<string, unknown> = { ...action.input };
  for (const ref of action.inputRefs) {
    const source = results.get(ref.fromAction);
    const resource =
      source?.status === 'success'
        ? source.resourceRefs.find((item) => item.kind === ref.kind)
        : undefined;
    if (!resource) {
      return outcome('skipped', 'Falta el resultado del que depende', 'dependency_failed');
    }
    candidate[ref.field] = resource.id;
  }
  const parsed = resolved.capability.inputSchema.safeParse(candidate);
  if (!parsed.success)
    return outcome('failed', 'Los datos de la acción no son válidos', 'invalid_input');

  const ctx: ToolExecutionContext = {
    workspace: input.workspace,
    contextType: input.workspace.type,
    actorUserId: input.actorUserId,
    commandId: input.commandId,
    executionId: input.executionId,
    idempotencyKey: `${input.commandId}:${input.revision}:${action.id}`,
  };
  let executed;
  try {
    executed = await withTimeout(
      resolved.capability.execute(parsed.data, ctx),
      input.timeoutMs ?? ACTION_TIMEOUT_MS,
    );
  } catch (err) {
    input.logger.warn('action: la herramienta falló', {
      workspaceId: input.workspace._id.toString(),
      toolKey: action.toolKey,
      capability: action.capabilityKey,
      // Nunca la entrada completa ni el stack en la respuesta: solo el tipo de error.
      error: err instanceof Error ? err.name : 'unknown',
    });
    return outcome(
      'failed',
      'No se pudo completar',
      err instanceof ActionTimeout ? 'execution_failed' : errorCodeOf(err),
    );
  }
  if (executed.status !== 'success') {
    return outcome('failed', executed.summary, executed.errorCode ?? 'execution_failed');
  }
  if (
    resolved.capability.outputSchema &&
    !resolved.capability.outputSchema.safeParse(executed.output).success
  ) {
    return outcome('failed', 'La herramienta devolvió un resultado no válido', 'execution_failed');
  }

  // Un verificador que falla cuenta como «no verificado», nunca como éxito.
  const verified = await resolved.capability.verify(executed, parsed.data, ctx).catch(() => false);
  if (!verified) {
    return outcome(
      'failed',
      'No se pudo confirmar que la acción se completara',
      'verification_failed',
    );
  }
  return outcome('success', executed.summary, null, {
    verified: true,
    resourceRefs: executed.resourceRefs.map(({ kind, id, label }) => ({ kind, id, label })),
  });
}
