import {
  CreateContentItemSchema,
  GenerateCampaignSchema,
  GenerateContentPlanSchema,
  type PixelCreatedResource,
} from '@pixel/contracts';
import { ZodError } from 'zod';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { generateCampaign, type CampaignDeps } from '../campaigns/campaigns.service.js';
import {
  generateContentPlan,
  type ContentPlanDeps,
} from '../content-plans/contentPlans.service.js';
import { createContentItem } from '../operations/content.service.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import {
  forgetCreativeMemory,
  rememberCreativeMemory,
  resolveMemoryScope,
} from '../creative-memory/creativeMemory.service.js';
import { executeActions } from '../actions/action.executor.js';
import { ACTION_ERROR_TEXT, describeOutcome } from '../actions/action.report.js';
import {
  isToolStep,
  type ActionResultRecord,
  type AuthorizedActionSnapshot,
} from '../actions/action.snapshot.js';
import type { PixelToolRegistry } from '../actions/toolRegistry.js';
import type { PixelCommandDocument, PixelStepAttrs } from './pixelCommand.model.js';

/*
 * Ejecución de un plan CONFIRMADO (docs/PIXEL-COMMAND.md §7, docs/PIXEL-ACTIONS.md). Solo orquesta
 * servicios existentes: nunca escribe en Mongo directamente ni duplica su lógica.
 *
 * - Pasos con herramientas (Prompt 18: create_project, create_tasks): ejecutan las acciones
 *   CONGELADAS del snapshot autorizado con el ActionExecutor (una por proyecto y por tarea), que
 *   verifica cada efecto. Un fallo no detiene las acciones independientes; las dependientes se
 *   omiten. La respuesta sale de los resultados verificados.
 * - Pasos anteriores (campaña, plan, pieza, memoria): como siempre. Cada uno valida sus parámetros
 *   con el schema del servicio, se ejecuta una vez y guarda lo que creó; si uno falla, los
 *   siguientes no se ejecutan.
 * En los dos casos: `partial` (algo se hizo) o `failed` (nada), con el motivo, y reintentar retoma
 * sin duplicar lo hecho.
 */

export interface PixelExecutorDeps {
  campaigns: CampaignDeps;
  contentPlans: ContentPlanDeps;
  logger: Logger;
  /** Herramientas que Pixel puede usar (Prompt 18). */
  tools: PixelToolRegistry;
}

/** Quién y qué autorizó esta ejecución (lo congelado en la reserva atómica). */
export interface AuthorizedExecution {
  actorUserId: string;
  executionId: string;
  authorization: AuthorizedActionSnapshot;
}

export interface ExecutionProgress {
  steps: PixelStepAttrs[];
  actionResults: ActionResultRecord[];
}

type StepOutputs = Map<string, PixelCreatedResource[]>;

function fromStep(outputs: StepOutputs, stepId: unknown, kind: PixelCreatedResource['kind']) {
  if (typeof stepId !== 'string') return null;
  return outputs.get(stepId)?.find((resource) => resource.kind === kind)?.id ?? null;
}

async function runStep(
  workspace: WorkspaceDocument,
  step: PixelStepAttrs,
  outputs: StepOutputs,
  deps: PixelExecutorDeps,
  commandId: string,
): Promise<PixelCreatedResource[]> {
  switch (step.type) {
    case 'generate_campaign': {
      const result = await generateCampaign(
        workspace,
        GenerateCampaignSchema.parse(step.params),
        deps.campaigns,
      );
      return [{ kind: 'campaign', id: result.campaign.id, label: result.campaign.name }];
    }
    case 'generate_content_plan': {
      const { campaignFromStep, ...params } = step.params;
      const campaignId = fromStep(outputs, campaignFromStep, 'campaign');
      const result = await generateContentPlan(
        workspace,
        GenerateContentPlanSchema.parse({ ...params, ...(campaignId ? { campaignId } : {}) }),
        deps.contentPlans,
      );
      return [
        {
          kind: 'content_plan',
          id: result.plan.id,
          label: `${result.plan.name} · ${result.items.length} ${result.items.length === 1 ? 'pieza' : 'piezas'}`,
        },
      ];
    }
    // create_project y create_tasks: herramientas (workspace.projects / workspace.tasks).
    case 'create_project':
    case 'create_tasks':
      throw new Error(`El paso ${step.type} se ejecuta con herramientas`);
    case 'create_content_item': {
      const item = await createContentItem(workspace, CreateContentItemSchema.parse(step.params), {
        source: 'pixel',
      });
      return [{ kind: 'content_item', id: item.id, label: item.title }];
    }
    // Creative Memory (Prompt 16): la confirmación de PixelCommand ES la confirmación del usuario.
    case 'remember_memory': {
      const scopeType = step.params.scopeType === 'campaign' ? 'campaign' : 'workspace';
      const scope = await resolveMemoryScope(
        workspace,
        scopeType === 'campaign'
          ? { type: 'campaign', id: String(step.params.scopeId) }
          : { type: 'workspace' },
      );
      const { memory } = await rememberCreativeMemory(workspace, String(step.params.text), scope, {
        sourceEventKey: `pixel-command:${commandId}:remember`,
        source: 'pixel_command',
      });
      return [{ kind: 'creative_memory', id: memory.id, label: memory.statement }];
    }
    case 'forget_memory': {
      const memory = await forgetCreativeMemory(workspace, step.params.memoryId);
      return [{ kind: 'creative_memory', id: memory.id, label: memory.statement }];
    }
  }
}

const humanError = (err: unknown) =>
  err instanceof AppError
    ? err.message
    : err instanceof ZodError
      ? 'Los datos del paso no son válidos'
      : 'Error inesperado';

export interface ExecutionResult {
  status: 'completed' | 'partial' | 'failed';
  reply: string;
}

/** El último resultado de cada acción. */
function upsertResult(results: ActionResultRecord[], result: ActionResultRecord) {
  return [...results.filter((item) => item.actionId !== result.actionId), result];
}

/** Lo que un paso con herramientas ya tiene hecho y verificado (acumulado entre reintentos). */
function stepResources(stepId: string, results: ActionResultRecord[], revision: number) {
  return results
    .filter(
      (result) =>
        result.stepId === stepId && result.revision === revision && result.status === 'success',
    )
    .flatMap((result) => result.resourceRefs);
}

/** Ejecuta los pasos pendientes del comando (ya reservado en estado `executing`). */
export async function executeCommand(
  workspace: WorkspaceDocument,
  command: PixelCommandDocument,
  deps: PixelExecutorDeps,
  authorized: AuthorizedExecution,
  persist: (progress: ExecutionProgress) => Promise<void>,
): Promise<ExecutionResult> {
  // Copias planas (un subdocumento de Mongoose no se copia con spread).
  const plain = command.toObject();
  const steps = (plain.steps as PixelStepAttrs[]).map((step) => ({
    ...step,
    params: { ...step.params },
    resources: [...step.resources],
  }));
  const { authorization } = authorized;
  const revision = authorization.revision;
  let results = ((plain.actionResults ?? []) as ActionResultRecord[]).map((result) => ({
    ...result,
  }));
  const outputs: StepOutputs = new Map(
    steps.filter((step) => step.status === 'done').map((step) => [step.id, step.resources]),
  );
  const save = () => persist({ steps, actionResults: results });
  let failure: { step: PixelStepAttrs; message: string } | null = null;

  for (const step of steps) {
    if (step.status === 'done') continue;

    if (isToolStep(step.type)) {
      const actions = authorization.actions.filter((action) => action.stepId === step.id);
      const stepResults = await executeActions({
        workspace,
        actions,
        previous: results,
        revision,
        actorUserId: authorized.actorUserId,
        commandId: command._id.toString(),
        executionId: authorized.executionId,
        registry: deps.tools,
        logger: deps.logger,
        onResult: async (result) => {
          results = upsertResult(results, result);
          step.resources = stepResources(step.id, results, revision);
          await save();
        },
      });
      const notDone = stepResults.find((result) => result.status !== 'success');
      step.resources = stepResources(step.id, results, revision);
      step.status = notDone ? 'failed' : 'done';
      step.error = notDone?.errorCode ? ACTION_ERROR_TEXT[notDone.errorCode] : null;
      outputs.set(step.id, step.resources);
      await save();
      continue;
    }

    // Un paso anterior no se ejecuta tras un fallo (no declara dependencias).
    if (failure || steps.some((other) => isToolStep(other.type) && other.status === 'failed'))
      break;
    try {
      step.resources = await runStep(workspace, step, outputs, deps, command._id.toString());
      step.status = 'done';
      step.error = null;
      outputs.set(step.id, step.resources);
    } catch (err) {
      step.status = 'failed';
      step.error = humanError(err).slice(0, 500);
      failure = { step, message: step.error };
      deps.logger.warn('PixelCommand: un paso falló', {
        workspaceId: workspace._id.toString(),
        step: step.type,
        err,
      });
    }
    await save();
    if (failure) break;
  }

  // Plan solo con herramientas: estado y respuesta salen de los resultados verificados.
  if (steps.every((step) => isToolStep(step.type))) {
    return describeOutcome(
      authorization.actions,
      results.filter((result) => result.revision === revision),
    );
  }
  return legacyOutcome(steps, failure);
}

function legacyOutcome(
  steps: PixelStepAttrs[],
  failure: { step: PixelStepAttrs; message: string } | null,
): ExecutionResult {
  const created = steps.flatMap((step) => step.resources);
  const names = created.map((resource) => `«${resource.label}»`);
  if (!failure && steps.every((step) => step.type === 'remember_memory')) {
    return {
      status: 'completed',
      reply: `Listo. Lo recordaré: ${names.join(', ')}. Puedes verlo u olvidarlo en «Lo que Pixel ha aprendido».`,
    };
  }
  if (!failure && steps.every((step) => step.type === 'forget_memory')) {
    return {
      status: 'completed',
      reply: `Listo. Ya no tendré en cuenta ${names.join(', ')}.`,
    };
  }
  if (!failure) {
    return {
      status: 'completed',
      reply: `Listo. Organicé ${names.join(', ')}. Revísalo cuando quieras: nada se publica sin ti.`,
    };
  }
  return created.length
    ? {
        status: 'partial',
        reply: `Creé ${names.join(', ')}, pero no pude completar «${failure.step.title}»: ${failure.message} Puedes reintentarlo; lo que ya está creado no se duplica.`,
      }
    : {
        status: 'failed',
        reply: `No pude completar «${failure.step.title}»: ${failure.message} No se creó nada.`,
      };
}
