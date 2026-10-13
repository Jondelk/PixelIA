import {
  CreateContentItemSchema,
  CreateProjectSchema,
  CreateTaskSchema,
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
import { createProject } from '../operations/projects.service.js';
import { createTask } from '../operations/tasks.service.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import {
  forgetCreativeMemory,
  rememberCreativeMemory,
  resolveMemoryScope,
} from '../creative-memory/creativeMemory.service.js';
import type { PixelCommandDocument, PixelStepAttrs } from './pixelCommand.model.js';

/*
 * Ejecución de un plan CONFIRMADO (docs/PIXEL-COMMAND.md §7). Solo orquesta servicios existentes
 * (Campaign Manager, Content Planner, Operations): nunca escribe en Mongo directamente ni duplica
 * su lógica. Cada paso valida sus parámetros con el schema del servicio, se ejecuta una vez y
 * guarda lo que creó; si uno falla, los siguientes no se ejecutan y el comando queda `partial`
 * (algo se creó) o `failed` (nada), con el motivo. Reintentar retoma desde el paso que falló.
 */

export interface PixelExecutorDeps {
  campaigns: CampaignDeps;
  contentPlans: ContentPlanDeps;
  logger: Logger;
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
    case 'create_project': {
      const project = await createProject(workspace, CreateProjectSchema.parse(step.params));
      return [{ kind: 'project', id: project.id, label: project.name }];
    }
    case 'create_tasks': {
      const projectId = fromStep(outputs, step.params.projectFromStep, 'project');
      const tasks = Array.isArray(step.params.tasks) ? step.params.tasks : [];
      // Reintento: las tareas ya creadas en este paso no se repiten.
      const created = [...step.resources];
      for (const raw of tasks.slice(created.length)) {
        const input = CreateTaskSchema.parse({
          ...(raw as Record<string, unknown>),
          ...(projectId ? { projectId } : {}),
        });
        const task = await createTask(workspace, input, { source: 'pixel' });
        created.push({ kind: 'task', id: task.id, label: task.title });
        step.resources = created;
      }
      return created;
    }
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

/** Ejecuta los pasos pendientes del comando (ya reservado en estado `executing`). */
export async function executeCommand(
  workspace: WorkspaceDocument,
  command: PixelCommandDocument,
  deps: PixelExecutorDeps,
  persist: (steps: PixelStepAttrs[]) => Promise<void>,
): Promise<ExecutionResult> {
  // Copias planas (un subdocumento de Mongoose no se copia con spread).
  const steps = (command.toObject().steps as PixelStepAttrs[]).map((step) => ({
    ...step,
    params: { ...step.params },
    resources: [...step.resources],
  }));
  const outputs: StepOutputs = new Map(
    steps.filter((step) => step.status === 'done').map((step) => [step.id, step.resources]),
  );
  let failure: { step: PixelStepAttrs; message: string } | null = null;
  for (const step of steps) {
    if (step.status === 'done') continue;
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
    await persist(steps);
    if (failure) break;
  }

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
