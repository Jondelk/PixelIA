import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PLATFORM_LABELS,
  localDateIn,
  PixelCommandEntitiesSchema,
  type CreativeMemoryDimension,
  pixelIntentAvailable,
  type AdjustPixelCommandInput,
  type ConfirmPixelCommandInput,
  type CreatePixelCommandData,
  type PixelCommand,
  type PixelCommandConfirmResponse,
  type PixelCommandEntities,
  type PixelCommandIntent,
  type PixelCommandStatus,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import { fold, removeTaskTitles, type AIProvider } from '../../ai/index.js';
import { recordCreativeDecision } from '../creative-memory/memory.detector.js';
import {
  placementDirectives,
  resolveCreativeMemories,
} from '../creative-memory/memory.resolver.js';
import { formatSignal, platformSignal } from '../creative-memory/memory.signals.js';
import { AppError, notFound } from '../../lib/errors.js';
import { CampaignModel } from '../campaigns/campaign.model.js';
import { ContentPlanModel } from '../content-plans/contentPlan.model.js';
import { ContentItemModel } from '../operations/contentItem.model.js';
import { ProjectModel } from '../operations/project.model.js';
import { workspaceTimezone } from '../daily-director/dailyTime.js';
import {
  guardianPreflight,
  overridePreflight,
  type GuardianDeps,
} from '../guardian/guardian.service.js';
import type { GuardianText } from '../guardian/guardian.types.js';
import { hasWorkspaceFeature } from '../workspaces/workspaceFeatures.js';
import { fieldError, resourceId } from '../operations/operations.scope.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import {
  carriedOverResults,
  expandSteps,
  freezeActions,
  type AuthorizedActionSnapshot,
} from '../actions/action.snapshot.js';
import { answerExternalRequest } from '../actions/external.capabilities.js';
import { taskEventRef, type CalendarDeps } from '../calendar/calendarConnection.service.js';
import { TaskModel } from '../operations/task.model.js';
import {
  planWeekCommand,
  replanCommand,
  type CalendarOutcome,
  type CalendarPlanningState,
} from '../calendar/weekPlanning.service.js';
import { executeCommand, type PixelExecutorDeps } from './pixelCommand.executor.js';
import {
  PixelCommandModel,
  toPixelCommandDTO,
  type PixelCommandAttrs,
  type PixelCommandDocument,
} from './pixelCommand.model.js';
import { planMemoryCommand, type MemoryOutcome } from './pixelCommand.memory.js';
import { matchCampaigns, planCommand } from './pixelCommand.planner.js';
import { creativeAdviceReply, unknownReply, workStatusReply } from './pixelCommand.replies.js';
import {
  resolvePixelContext,
  type KnownProject,
  type PixelKnownContext,
} from './pixelContext.resolver.js';
import type { PixelIntentResolver, PreviousInterpretation } from './pixelIntent.resolver.js';

/*
 * PixelCommand (docs/PIXEL-COMMAND.md): solicitud natural → intención → contexto → falta algo
 * (UNA pregunta) o propuesta → confirmación → servicios existentes. Las lecturas y respuestas
 * ocurren en el acto; lo que crea recursos espera a una confirmación, que cubre todo el plan
 * aprobado (sin confirmar cada micro-acción). Recurso ajeno, inexistente o malformado → 404.
 */

export const PIXEL_COMMAND_NOT_FOUND = 'Solicitud no encontrada';

export interface PixelCommandDeps extends PixelExecutorDeps {
  resolver: PixelIntentResolver;
  ai: AIProvider;
  defaultTimezone: string;
  guardian: GuardianDeps;
  /** Prompt 19: Google Calendar (conexión, proveedor y reloj). */
  calendar: CalendarDeps;
}

const conflict = (message: string, reason: string) =>
  new AppError(409, 'CONFLICT', message, { reason });

async function findCommand(workspace: WorkspaceDocument, rawId: unknown) {
  const command = await PixelCommandModel.findOne({
    _id: resourceId(rawId, PIXEL_COMMAND_NOT_FOUND),
    workspaceId: workspace._id,
  });
  if (!command) throw notFound(PIXEL_COMMAND_NOT_FOUND);
  return command;
}

/** Una campaña que llega del cliente (la pantalla) debe ser de ESTE workspace: si no, 400. */
async function campaignInWorkspace(workspace: WorkspaceDocument, id: string) {
  const exists = await CampaignModel.exists({
    _id: new Types.ObjectId(id),
    workspaceId: workspace._id,
  });
  if (!exists) throw fieldError('contextHint.campaignId', 'Campaña no encontrada');
  return id;
}

type ContextResource = NonNullable<NonNullable<CreatePixelCommandData['contextHint']>['resource']>;

/**
 * Prompt 17 (Pixel Dock): el recurso que el usuario está viendo. Solo orienta y SIEMPRE se valida
 * contra el workspace (de otro workspace o inexistente → 400, sin revelar nada); de él se derivan la
 * campaña y el proyecto. Nunca se envía a la IA como autoridad.
 */
async function resolveContextResource(
  workspace: WorkspaceDocument,
  resource: ContextResource | undefined,
): Promise<{ campaignId: string | null; project: KnownProject | null; taskId?: string }> {
  const none = { campaignId: null, project: null };
  if (!resource) return none;
  const filter = { _id: new Types.ObjectId(resource.id), workspaceId: workspace._id };
  const missing = () =>
    fieldError('contextHint.resource.id', 'Ese recurso no existe en este Pixel');
  switch (resource.type) {
    case 'campaign':
      return { campaignId: await campaignInWorkspace(workspace, resource.id), project: null };
    case 'content_plan': {
      const plan = await ContentPlanModel.findOne(filter).select({ campaignId: 1 });
      if (!plan) throw missing();
      return { campaignId: plan.campaignId?.toString() ?? null, project: null };
    }
    case 'project': {
      const project = await ProjectModel.findOne(filter).select({ name: 1, status: 1 });
      if (!project) throw missing();
      return { campaignId: null, project: projectRef(project) };
    }
    // Prompt 20: «Pedirle a Pixel que lo organice» desde «Mi agenda» (tarea de ESTE workspace).
    case 'task': {
      const task = await TaskModel.findOne(filter).select({ _id: 1 });
      if (!task) throw missing();
      return { ...none, taskId: task._id.toString() };
    }
    case 'content_item': {
      const item = await ContentItemModel.findOne(filter).select({ campaignId: 1, projectId: 1 });
      if (!item) throw missing();
      const project = item.projectId
        ? await ProjectModel.findOne({ _id: item.projectId, workspaceId: workspace._id }).select({
            name: 1,
            status: 1,
          })
        : null;
      return {
        campaignId: item.campaignId?.toString() ?? null,
        project: project ? projectRef(project) : null,
      };
    }
  }
}

const projectRef = (project: { _id: Types.ObjectId; name: string; status: string }) => ({
  id: project._id.toString(),
  name: project.name,
  status: project.status,
});

async function savedProject(workspace: WorkspaceDocument, id: Types.ObjectId | null | undefined) {
  if (!id) return null;
  const project = await ProjectModel.findOne({ _id: id, workspaceId: workspace._id }).select({
    name: 1,
    status: 1,
  });
  return project ? projectRef(project) : null;
}

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
const cleanAnswer = (value: string) =>
  value
    .trim()
    .replace(/[.!?¿¡]+$/, '')
    .trim();

/** Una respuesta a la pregunta rellena el dato que faltaba si el intérprete no lo hizo. */
function fillFromAnswer(
  field: string | null,
  answer: string,
  entities: PixelCommandEntities,
  context: PixelKnownContext,
): { entities: PixelCommandEntities; campaignId?: string; noCampaign?: boolean } {
  const text = cleanAnswer(answer).slice(0, 200);
  const next = { ...entities };
  switch (field) {
    case 'productOrService':
      next.productOrService ??= text;
      next.campaignType ??= 'launch';
      break;
    case 'objective':
      next.objective ??= capitalize(text);
      break;
    case 'topic':
      next.topic ??= text;
      break;
    case 'projectHint':
      next.projectHint ??= text.slice(0, 120);
      break;
    case 'tasks':
      if (!next.taskTitles.length) {
        next.taskTitles = text
          .split(/\s*(?:,|;|\n|\s+y\s+)\s*/)
          .map((item) => capitalize(item.trim()))
          .filter((item) => item.length >= 3)
          .slice(0, 20);
      }
      break;
    case 'campaign': {
      if (/\b(?:sin|ninguna|ninguno|no)\b/i.test(text)) return { entities: next, noCampaign: true };
      const [match] = matchCampaigns(context.campaigns, text, text);
      if (match) return { entities: next, campaignId: match.id };
      break;
    }
    // Creative Memory: "¿solo para esta campaña o para TINTO en general?" y "¿para cuál campaña?".
    case 'memoryScope': {
      const folded = fold(text);
      if (/\bcampan/.test(folded)) {
        next.memoryScopeHint = 'campaign';
        const [match] = matchCampaigns(context.campaigns, text, text);
        if (match)
          return { entities: PixelCommandEntitiesSchema.parse(next), campaignId: match.id };
      } else if (
        /\b(?:general|marca|todo|todas|siempre|habitual|global)\b/.test(folded) ||
        folded.includes(fold(context.ownerName))
      ) {
        next.memoryScopeHint = 'workspace';
      }
      break;
    }
    case 'memoryCampaign': {
      next.memoryScopeHint = 'campaign';
      const [match] = matchCampaigns(context.campaigns, text, text);
      if (match) return { entities: PixelCommandEntitiesSchema.parse(next), campaignId: match.id };
      break;
    }
  }
  return { entities: PixelCommandEntitiesSchema.parse(next) };
}

interface Turn {
  role: 'user' | 'pixel';
  text: string;
  at: Date;
}

interface CommandState {
  request: string;
  turns: Turn[];
  previous: PreviousInterpretation | null;
  pendingField: string | null;
  campaignId: string | null;
  noCampaign: boolean;
  hintIntent: 'create_campaign' | 'plan_content' | null;
  tzOffset: number;
  revision: number;
  /** Prompt 17: proyecto del recurso que el usuario estaba viendo (validado). */
  chosenProject: KnownProject | null;
  /** Prompt 20: referencia opaca de la tarea en contexto (sus bloques quedan vinculados). */
  taskRef: string | null;
  /** Prompt 19: zona IANA del navegador (último recurso para planificar) y lo planificado antes. */
  clientTimezone: string | null;
  calendar: {
    planning: CalendarPlanningState | null;
    weekPlan: PixelCommandAttrs['weekPlan'];
  } | null;
}

/** ¿Es una petición de calendario que este Pixel atiende con Google Calendar (Prompt 19)? */
const usesCalendar = (
  workspace: WorkspaceDocument,
  intent: PixelCommandIntent,
  entities: PixelCommandEntities,
) =>
  hasWorkspaceFeature(workspace, 'calendar') &&
  (intent === 'plan_week' ||
    intent === 'replan_block' ||
    (intent === 'external_action' &&
      (entities.externalService === 'google_calendar' || entities.externalService === 'calendar')));

/** Resultado del planificador → campos del comando (propuesta, pregunta, conectar o respuesta). */
function calendarFields(
  outcome: CalendarOutcome,
  state: CommandState,
  userTurn: Turn,
): Partial<PixelCommandAttrs> {
  const at = userTurn.at;
  const common = {
    guardian: null,
    guardianBlocked: false,
    connect: null,
    weekPlan: null,
    plan: null,
    steps: [],
    question: null,
    pendingField: null,
  };
  switch (outcome.kind) {
    case 'connect':
      return {
        ...common,
        status: 'answered',
        reply: outcome.reply,
        connect: { provider: 'google_calendar', status: outcome.status },
        turns: [...state.turns, userTurn, { role: 'pixel', text: outcome.reply, at }],
      };
    case 'reply':
      return {
        ...common,
        status: 'answered',
        reply: outcome.reply,
        turns: [...state.turns, userTurn, { role: 'pixel', text: outcome.reply, at }],
      };
    case 'question':
      return {
        ...common,
        status: 'needs_information',
        question: outcome.question,
        pendingField: outcome.field,
        reply: outcome.question,
        planning:
          outcome.planning.interpretation || outcome.planning.timezone ? outcome.planning : null,
        // Lo ya propuesto se conserva mientras se aclara un ajuste.
        weekPlan: state.calendar?.weekPlan ?? null,
        turns: [...state.turns, userTurn, { role: 'pixel', text: outcome.question, at }],
      };
    case 'proposal':
      return {
        ...common,
        status: 'proposed',
        reply: outcome.summary,
        plan: {
          summary: outcome.summary,
          understood: outcome.understood,
          proposal: outcome.proposal,
          creates: outcome.creates,
          requiresConfirmation: true,
          revision: state.revision + 1,
        },
        steps: outcome.steps.map((step) => ({
          ...step,
          status: 'pending' as const,
          resources: [],
          error: null,
        })),
        weekPlan: outcome.weekPlan,
        planning: outcome.planning,
        turns: [...state.turns, userTurn, { role: 'pixel', text: outcome.summary, at }],
      };
  }
}

/** Interpreta, resuelve el contexto y decide: pregunta, propuesta o respuesta. */
async function interpretAndPlan(
  workspace: WorkspaceDocument,
  message: string,
  state: CommandState,
  deps: PixelCommandDeps,
): Promise<Partial<PixelCommandAttrs>> {
  const resolved = await deps.resolver.resolve({
    workspaceType: workspace.type,
    userRequest: message,
    previous: state.previous,
  });
  let intent = resolved.intent;
  if (
    intent === 'unknown' &&
    state.hintIntent &&
    pixelIntentAvailable(workspace.type, state.hintIntent)
  ) {
    intent = state.hintIntent;
  }
  // Desde la pantalla de campañas, una frase suelta ("Amor y Amistad") es el objetivo.
  let entities = resolved.entities;
  if (
    intent === 'create_campaign' &&
    !entities.objective &&
    !entities.productOrService &&
    state.hintIntent === 'create_campaign' &&
    resolved.intent === 'unknown'
  ) {
    entities = { ...entities, objective: capitalize(cleanAnswer(message)).slice(0, 500) };
  }

  // Ajuste de una propuesta de tareas: «Quita la segunda» crea otra revisión sin esa tarea.
  if (state.previous && (intent === 'organize_project' || intent === 'create_tasks')) {
    const kept = removeTaskTitles(message, entities.taskTitles);
    if (kept.length !== entities.taskTitles.length) entities = { ...entities, taskTitles: kept };
  }

  // Prompt 19: organizar la semana y mover bloques con Google Calendar (solo Personal).
  if (usesCalendar(workspace, intent, entities)) {
    const request = [state.previous?.request, message].filter(Boolean).join('\n');
    const calendarDeps = {
      ai: deps.ai,
      logger: deps.logger,
      calendar: deps.calendar,
      tools: deps.tools,
    };
    const isReplan = intent === 'replan_block';
    const outcome = isReplan
      ? await replanCommand(
          workspace,
          { request, clientTimezone: state.clientTimezone },
          calendarDeps,
        )
      : await planWeekCommand(
          workspace,
          {
            request,
            message,
            clientTimezone: state.clientTimezone,
            previous: state.calendar,
            taskRef: state.taskRef,
          },
          calendarDeps,
        );
    return {
      intent,
      entities,
      campaignId: null,
      noCampaign: false,
      interpretation: {
        mode: resolved.mode,
        confidence: Math.round(resolved.confidence * 100) / 100,
      },
      ...calendarFields(outcome, state, { role: 'user', text: message, at: new Date() }),
    };
  }

  const context = await resolvePixelContext(workspace, intent);
  let { campaignId, noCampaign } = state;
  if (state.pendingField) {
    const filled = fillFromAnswer(state.pendingField, message, entities, context);
    entities = filled.entities;
    if (filled.campaignId) campaignId = filled.campaignId;
    if (filled.noCampaign) noCampaign = true;
  }

  const timezone = workspaceTimezone(workspace, deps.defaultTimezone);
  const request = [state.previous?.request, message].filter(Boolean).join('\n');
  const outcome: MemoryOutcome =
    intent === 'manage_memory'
      ? await planMemoryCommand(workspace, {
          entities,
          request,
          context,
          chosenCampaignId: campaignId,
          pendingField: state.pendingField,
          message,
        })
      : planCommand({
          intent,
          request,
          entities,
          context,
          today: localDateIn(new Date(), timezone),
          tzOffset: state.tzOffset,
          chosenCampaignId: campaignId,
          noCampaign,
          chosenProject: state.chosenProject,
        });
  const at = new Date();
  const base = {
    intent,
    entities,
    campaignId: campaignId ? new Types.ObjectId(campaignId) : null,
    noCampaign,
    interpretation: {
      mode: resolved.mode,
      confidence: Math.round(resolved.confidence * 100) / 100,
    },
  };
  const userTurn: Turn = { role: 'user', text: message, at };

  if (outcome.kind === 'question') {
    return {
      ...base,
      guardian: null,
      guardianBlocked: false,
      status: 'needs_information',
      question: outcome.question,
      pendingField: outcome.field,
      reply: outcome.question,
      plan: null,
      steps: [],
      turns: [...state.turns, userTurn, { role: 'pixel', text: outcome.question, at }],
    };
  }
  if (outcome.kind === 'proposal') {
    const remembered = await withMemories(workspace, intent, entities, outcome);
    const reviewed = await reviewProposal(workspace, intent, remembered, state, message, deps);
    return {
      ...base,
      guardian: reviewed.guardian,
      guardianBlocked: reviewed.guardian?.status === 'block',
      status: 'proposed',
      question: null,
      pendingField: null,
      reply: reviewed.summary,
      campaignId: outcome.campaignId ? new Types.ObjectId(outcome.campaignId) : base.campaignId,
      plan: {
        summary: reviewed.summary,
        understood: reviewed.understood,
        proposal: reviewed.proposal,
        creates: outcome.creates,
        requiresConfirmation: true,
        revision: state.revision + 1,
      },
      steps: reviewed.steps.map((step) => ({
        ...step,
        status: 'pending' as const,
        resources: [],
        error: null,
      })),
      turns: [...state.turns, userTurn, { role: 'pixel', text: reviewed.summary, at }],
    };
  }
  const reply =
    outcome.kind === 'memory_reply'
      ? outcome.reply
      : intent === 'external_action'
        ? (await answerExternalRequest(entities.externalService, deps.tools, workspace)).reply
        : intent === 'work_status'
          ? await workStatusReply(workspace, entities, message, context, state.tzOffset)
          : intent === 'creative_advice'
            ? await creativeAdviceReply(workspace, message, deps)
            : unknownReply(workspace.type);
  return {
    ...base,
    guardian: null,
    guardianBlocked: false,
    status: 'answered',
    question: null,
    pendingField: null,
    reply,
    plan: null,
    steps: [],
    turns: [...state.turns, userTurn, { role: 'pixel', text: reply, at }],
  };
}

export async function createPixelCommand(
  workspace: WorkspaceDocument,
  input: CreatePixelCommandData,
  deps: PixelCommandDeps,
): Promise<PixelCommand> {
  const fromResource = await resolveContextResource(workspace, input.contextHint?.resource);
  const campaignId = input.contextHint?.campaignId
    ? await campaignInWorkspace(workspace, input.contextHint.campaignId)
    : fromResource.campaignId;
  const fields = await interpretAndPlan(
    workspace,
    input.request,
    {
      request: input.request,
      turns: [],
      previous: null,
      pendingField: null,
      campaignId,
      noCampaign: false,
      hintIntent: input.contextHint?.intent ?? null,
      tzOffset: input.tzOffset,
      revision: 0,
      chosenProject: fromResource.project,
      taskRef: fromResource.taskId ? taskEventRef(workspace, fromResource.taskId) : null,
      clientTimezone: input.timezone ?? null,
      calendar: null,
    },
    deps,
  );
  const command = await PixelCommandModel.create({
    ...fields,
    workspaceId: workspace._id,
    request: input.request,
    source: input.source,
    tzOffset: input.tzOffset,
    contextHint: {
      intent: input.contextHint?.intent ?? null,
      projectId: fromResource.project ? new Types.ObjectId(fromResource.project.id) : null,
      taskId: fromResource.taskId ? new Types.ObjectId(fromResource.taskId) : null,
    },
  });
  deps.logger.info('PixelCommand: solicitud interpretada', {
    workspaceId: workspace._id.toString(),
    workspaceType: workspace.type,
    intent: command.intent,
    status: command.status,
    mode: command.interpretation.mode,
  });
  logProposed(deps, workspace, command);
  return toPixelCommandDTO(command);
}

const ADJUSTABLE: PixelCommandStatus[] = ['needs_information', 'proposed'];

export async function adjustPixelCommand(
  workspace: WorkspaceDocument,
  rawId: unknown,
  input: AdjustPixelCommandInput & { message: string },
  deps: PixelCommandDeps,
): Promise<PixelCommand> {
  const command = await findCommand(workspace, rawId);
  if (!ADJUSTABLE.includes(command.status)) {
    throw conflict('Esta solicitud ya no se puede ajustar', 'pixel_command_not_adjustable');
  }
  const fields = await interpretAndPlan(
    workspace,
    input.message,
    {
      request: command.request,
      turns: command.turns.map((turn) => ({ role: turn.role, text: turn.text, at: turn.at })),
      previous: {
        intent: command.intent,
        request: [
          command.request,
          ...command.turns
            .filter((t) => t.role === 'user')
            .slice(1)
            .map((t) => t.text),
        ].join('\n'),
        entities: PixelCommandEntitiesSchema.parse(command.entities ?? {}),
      },
      pendingField: command.status === 'needs_information' ? command.pendingField : null,
      campaignId: command.campaignId?.toString() ?? null,
      noCampaign: command.noCampaign,
      hintIntent: command.contextHint?.intent ?? null,
      tzOffset: command.tzOffset,
      revision: command.plan?.revision ?? 0,
      chosenProject: await savedProject(workspace, command.contextHint?.projectId),
      taskRef: command.contextHint?.taskId
        ? taskEventRef(workspace, command.contextHint.taskId.toString())
        : null,
      clientTimezone: input.timezone ?? null,
      calendar:
        command.planning || command.weekPlan
          ? { planning: command.planning ?? null, weekPlan: command.weekPlan ?? null }
          : null,
    },
    deps,
  );
  // Concurrencia optimista: si el comando cambió (otra pestaña confirmó o ajustó), no se pisa.
  const updated = await PixelCommandModel.findOneAndUpdate(
    {
      _id: command._id,
      workspaceId: workspace._id,
      status: command.status,
      updatedAt: command.updatedAt,
    },
    { $set: fields },
    { new: true },
  );
  if (!updated) {
    throw conflict('La solicitud cambió mientras la ajustabas', 'pixel_command_changed');
  }
  if (command.status === 'proposed') await recordAdjustment(workspace, command, updated);
  return toPixelCommandDTO(updated);
}

const CONFIRMABLE: PixelCommandStatus[] = ['proposed', 'partial', 'failed'];

/** Sin actividad durante este tiempo, una ejecución se da por abandonada (caída del proceso). */
export const STALE_EXECUTION_MS = 5 * 60_000;

function logProposed(
  deps: PixelCommandDeps,
  workspace: WorkspaceDocument,
  command: PixelCommandDocument,
) {
  if (command.status !== 'proposed') return;
  const actions = expandSteps(command.steps);
  if (!actions.length) return;
  deps.logger.info('action.proposed', {
    workspaceId: workspace._id.toString(),
    commandId: command._id.toString(),
    revision: command.plan?.revision ?? 0,
    actions: actions.length,
  });
}

/**
 * Recuperación mínima (Prompt 18): una ejecución sin actividad en STALE_EXECUTION_MS se libera
 * (`partial` si algo quedó hecho, `failed` si no) para que el usuario pueda reintentar; lo hecho
 * no se repite. Atómica y ligada al executionId abandonado: si dos peticiones lo detectan, solo una
 * la libera, y el ejecutor antiguo ya no puede escribir (todas sus escrituras filtran por su id).
 */
async function releaseStaleExecution(
  workspace: WorkspaceDocument,
  command: PixelCommandDocument,
  deps: PixelCommandDeps,
  now = new Date(),
): Promise<PixelCommandDocument> {
  if (command.status !== 'executing') return command;
  const lastActivity =
    command.executionUpdatedAt ?? command.executionStartedAt ?? command.updatedAt;
  const cutoff = new Date(now.getTime() - STALE_EXECUTION_MS);
  if (lastActivity > cutoff) return command;
  const somethingDone =
    command.steps.some((step) => step.resources.length > 0) ||
    (command.actionResults ?? []).some((result) => result.status === 'success');
  const reply =
    'La ejecución anterior se interrumpió antes de terminar. Lo que ya estaba hecho se conserva; puedes reintentarlo y no se duplicará.';
  const released = await PixelCommandModel.findOneAndUpdate(
    {
      _id: command._id,
      workspaceId: workspace._id,
      status: 'executing',
      executionId: command.executionId,
      $or: [
        { executionUpdatedAt: { $lte: cutoff } },
        { executionUpdatedAt: null, updatedAt: { $lte: cutoff } },
      ],
    },
    {
      $set: { status: somethingDone ? 'partial' : 'failed', reply, executionId: null },
      $push: { turns: { role: 'pixel', text: reply, at: now } },
    },
    { new: true },
  );
  if (released) {
    deps.logger.warn('action.execution_interrupted', {
      workspaceId: workspace._id.toString(),
      commandId: command._id.toString(),
    });
  }
  return released ?? (await findCommand(workspace, command._id.toString()));
}

export async function confirmPixelCommand(
  workspace: WorkspaceDocument,
  rawId: unknown,
  input: ConfirmPixelCommandInput,
  actorUserId: string,
  deps: PixelCommandDeps,
): Promise<PixelCommandConfirmResponse> {
  const id = resourceId(rawId, PIXEL_COMMAND_NOT_FOUND);
  const current = await releaseStaleExecution(
    workspace,
    await findCommand(workspace, id.toString()),
    deps,
  );

  // Lo autorizado se congela UNA vez por revisión y nunca se cambia: un reintento usa el mismo
  // snapshot. Las acciones se validan ANTES de reservar: si alguna no es ejecutable, nada se hace.
  const revision = input.revision;
  const frozen: AuthorizedActionSnapshot | null =
    current.authorization && current.authorization.revision === revision
      ? null
      : current.plan?.revision === revision && CONFIRMABLE.includes(current.status)
        ? {
            revision,
            authorizedBy: actorUserId,
            authorizedAt: new Date(),
            actions: await freezeActions(current.steps, deps.tools, workspace),
          }
        : null;

  const executionId = new Types.ObjectId();
  const now = new Date();
  // Reserva atómica: solo una confirmación ejecuta, y solo la revisión que el usuario vio.
  const command = await PixelCommandModel.findOneAndUpdate(
    {
      _id: id,
      workspaceId: workspace._id,
      status: { $in: CONFIRMABLE },
      'plan.revision': revision,
      // Un BLOCK del Brand Guardian sin override no se ejecuta solo.
      guardianBlocked: { $ne: true },
      // El snapshot no se pisa: o no había, o es de esta misma revisión.
      ...(frozen ? { authorization: null } : { 'authorization.revision': revision }),
    },
    {
      $set: {
        status: 'executing',
        executionId,
        executionStartedAt: now,
        executionUpdatedAt: now,
        ...(frozen
          ? {
              authorization: frozen,
              actionResults: carriedOverResults(
                current.steps,
                frozen.actions,
                revision,
                executionId.toString(),
              ),
            }
          : {}),
      },
    },
    { new: true },
  );
  if (!command) {
    const latest = await findCommand(workspace, id.toString());
    if (latest.status === 'executing' || latest.status === 'completed') {
      return { command: toPixelCommandDTO(latest), executed: false };
    }
    if (CONFIRMABLE.includes(latest.status) && latest.guardianBlocked) {
      throw conflict(
        'Brand Guardian encontró algo que hay que resolver antes de organizar',
        'guardian_preflight_blocked',
      );
    }
    if (CONFIRMABLE.includes(latest.status)) {
      throw conflict(
        'La propuesta cambió: revisa la versión actual antes de confirmar',
        'pixel_command_revision_changed',
      );
    }
    throw conflict('Esta solicitud no tiene nada que confirmar', 'pixel_command_not_confirmable');
  }
  const authorization = command.toObject().authorization as AuthorizedActionSnapshot;
  const logBase = {
    workspaceId: workspace._id.toString(),
    commandId: command._id.toString(),
    executionId: executionId.toString(),
  };
  if (frozen) {
    deps.logger.info('action.authorized', { ...logBase, revision, actions: frozen.actions.length });
  }
  deps.logger.info('action.execution_started', logBase);

  const result = await executeCommand(
    workspace,
    command,
    deps,
    { actorUserId, executionId: executionId.toString(), authorization },
    async ({ steps, actionResults }) => {
      await PixelCommandModel.updateOne(
        { _id: command._id, workspaceId: workspace._id, executionId },
        { $set: { steps, actionResults, executionUpdatedAt: new Date() } },
      );
    },
  );
  const final = await PixelCommandModel.findOneAndUpdate(
    { _id: command._id, workspaceId: workspace._id, executionId },
    {
      $set: { status: result.status, reply: result.reply, executionUpdatedAt: new Date() },
      $push: { turns: { role: 'pixel', text: result.reply, at: new Date() } },
    },
    { new: true },
  );
  deps.logger.info(`action.${result.status}`, { ...logBase, intent: command.intent });
  return { command: toPixelCommandDTO(final ?? command), executed: true };
}

export async function cancelPixelCommand(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<PixelCommand> {
  const id = resourceId(rawId, PIXEL_COMMAND_NOT_FOUND);
  const reply = 'Cancelado. No se creó nada.';
  const command = await PixelCommandModel.findOneAndUpdate(
    { _id: id, workspaceId: workspace._id, status: { $in: ADJUSTABLE } },
    {
      $set: { status: 'cancelled', reply, question: null, pendingField: null },
      $push: { turns: { role: 'pixel', text: reply, at: new Date() } },
    },
    { new: true },
  );
  if (command) return toPixelCommandDTO(command);
  const current: PixelCommandDocument = await findCommand(workspace, id.toString());
  if (current.status === 'cancelled') return toPixelCommandDTO(current);
  throw conflict('Esta solicitud ya no se puede cancelar', 'pixel_command_not_cancellable');
}

export async function getPixelCommand(
  workspace: WorkspaceDocument,
  rawId: unknown,
  deps: PixelCommandDeps,
): Promise<PixelCommand> {
  return toPixelCommandDTO(
    await releaseStaleExecution(workspace, await findCommand(workspace, rawId), deps),
  );
}

/* ---------- Creative Memory ---------- */

const MEMORY_DIMENSIONS: Partial<Record<PixelCommandIntent, CreativeMemoryDimension[]>> = {
  create_campaign: ['communication', 'strategy', 'visual', 'campaign', 'platform', 'format'],
  plan_content: ['format', 'platform', 'content', 'communication'],
  create_content: ['format', 'platform', 'content', 'communication'],
};

/**
 * La propuesta dice qué memorias tendrá en cuenta (las aplican después los motores) y, si la
 * solicitud pide justo lo que la memoria evita, lo respeta: lo que pides ahora manda.
 */
async function withMemories(
  workspace: WorkspaceDocument,
  intent: PixelCommandIntent,
  entities: PixelCommandEntities,
  outcome: ProposalOutcome,
): Promise<ProposalOutcome> {
  const dimensions = MEMORY_DIMENSIONS[intent];
  if (!dimensions) return outcome;
  const resolved = await resolveCreativeMemories(workspace, {
    dimensions,
    campaignId: outcome.campaignId,
  });
  if (!resolved.memories.length) return outcome;
  const { avoidFormats } = placementDirectives(resolved);
  const requested = entities.formats.filter((format) => avoidFormats.includes(format));
  const notes = [
    `Tengo en cuenta lo que he aprendido: ${resolved.memories
      .slice(0, 2)
      .map((memory) => `«${memory.statement}»`)
      .join(' y ')}`,
    ...requested.map(
      (format) =>
        `Esta vez incluyo ${CONTENT_FORMAT_LABELS[format]} porque lo pediste, aunque normalmente se evita`,
    ),
  ];
  return { ...outcome, understood: [...outcome.understood, ...notes] };
}

/**
 * Un ajuste a una propuesta ("sin Stories") es evidencia de una decisión, nunca una memoria por sí
 * solo: se registra (idempotente por revisión) y el detector decide si hay patrón.
 */
async function recordAdjustment(
  workspace: WorkspaceDocument,
  before: PixelCommandDocument,
  after: PixelCommandDocument,
): Promise<void> {
  const previous = PixelCommandEntitiesSchema.parse(before.entities ?? {});
  const next = PixelCommandEntitiesSchema.parse(after.entities ?? {});
  const formats = next.excludedFormats.filter((f) => !previous.excludedFormats.includes(f));
  const platforms = next.excludedPlatforms.filter((p) => !previous.excludedPlatforms.includes(p));
  const signals = [
    ...formats.flatMap((format) => formatSignal(format, 'avoid', 'avoid', 'medium')),
    ...platforms.flatMap((platform) => platformSignal(platform, 'avoid', 'avoid', 'medium')),
  ];
  if (!signals.length) return;
  const names = [
    ...formats.map((format) => CONTENT_FORMAT_LABELS[format]),
    ...platforms.map((platform) => CONTENT_PLATFORM_LABELS[platform]),
  ];
  await recordCreativeDecision(workspace, {
    eventType: 'pixel_command_adjusted',
    resourceType: 'pixel_command',
    resourceId: after._id,
    campaignId: after.campaignId ?? null,
    signals,
    before: [{ field: 'Propuesta', value: (before.plan?.summary ?? before.request).slice(0, 300) }],
    after: [{ field: 'Ajuste', value: after.turns.at(-2)?.text.slice(0, 300) ?? '' }],
    sourceEventKey: `pixel-command:${after._id.toString()}:adjustment:${after.plan?.revision ?? 0}`,
    description: `Pediste quitar ${names.join(' y ')} de una propuesta de Pixel`,
    metadata: { source: 'pixel_command', dimension: signals[0]!.dimension },
  });
}

/* ---------- Brand Guardian preflight ---------- */

const PREFLIGHT_INTENTS: PixelCommandIntent[] = [
  'create_campaign',
  'plan_content',
  'create_content',
];

type ProposalOutcome = Extract<ReturnType<typeof planCommand>, { kind: 'proposal' }>;

/** Textos de lo que se va a crear (lo que Pixel escribió a partir de la solicitud). */
function proposalTexts(outcome: ProposalOutcome): GuardianText[] {
  const texts: GuardianText[] = [];
  const add = (
    label: string,
    value: unknown,
    role: GuardianText['role'],
    field: string,
    stepId: string,
  ) => {
    if (typeof value !== 'string' || !value.trim()) return;
    texts.push({
      ref: `RESOURCE_TEXT_${texts.length + 1}`,
      label,
      text: value.trim(),
      role,
      field,
      targetId: stepId,
    });
  };
  for (const step of outcome.steps) {
    if (step.type === 'generate_campaign') {
      add('Nombre de la campaña', step.params.name, 'title', 'name', step.id);
      add('Objetivo de la campaña', step.params.objective, 'objective', 'objective', step.id);
      add(
        'Producto o servicio',
        step.params.productOrService,
        'other',
        'productOrService',
        step.id,
      );
    } else if (step.type === 'generate_content_plan') {
      add('Objetivo del plan', step.params.goal, 'objective', 'goal', step.id);
    } else if (step.type === 'create_content_item') {
      add('Pieza', step.params.title, 'title', 'title', step.id);
    }
  }
  return texts;
}

/**
 * Pixel se revisa a sí mismo antes de pedir "Organizar" (Enterprise, propuestas que crean
 * recursos). Si el Guardian corrige, los textos corregidos sustituyen a los originales en los pasos
 * y en la propuesta visible. Lo que escribió el usuario fundamenta lo que dijo: no es "inventado".
 */
async function reviewProposal(
  workspace: WorkspaceDocument,
  intent: PixelCommandIntent,
  outcome: ProposalOutcome,
  state: CommandState,
  message: string,
  deps: PixelCommandDeps,
) {
  const unchanged = {
    guardian: null,
    summary: outcome.summary,
    understood: outcome.understood,
    proposal: outcome.proposal,
    steps: outcome.steps,
  };
  if (!hasWorkspaceFeature(workspace, 'brandGuardian') || !PREFLIGHT_INTENTS.includes(intent)) {
    return unchanged;
  }
  const texts = proposalTexts(outcome);
  const userSupplied = [
    state.request,
    ...state.turns.filter((turn) => turn.role === 'user').map((turn) => turn.text),
    message,
  ];
  const result = await guardianPreflight(
    workspace,
    {
      label: outcome.steps[0]?.title ?? 'Propuesta de Pixel',
      texts,
      userSupplied,
      campaignId: outcome.campaignId,
    },
    deps.guardian,
  );
  if (!result) return unchanged;
  const replacements = texts
    .map((text) => [text.text, result.corrected.get(text.ref)] as const)
    .filter(
      (pair): pair is readonly [string, string] => pair[1] !== undefined && pair[1] !== pair[0],
    );
  const lower = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);
  // La propuesta cita los textos tal cual o en minúscula inicial ("Entendí que quieres lanzar…").
  const swap = (value: string) =>
    replacements.reduce((acc, [from, to]) => {
      const clean = to.replace(/.$/, '');
      return acc.split(from).join(clean).split(lower(from)).join(lower(clean));
    }, value);
  const steps = outcome.steps.map((step) => {
    const params = { ...step.params };
    for (const text of texts) {
      const fixed = result.corrected.get(text.ref);
      if (text.targetId === step.id && text.field && fixed) params[text.field] = fixed;
    }
    return { ...step, params, title: swap(step.title) };
  });
  return {
    guardian: result.summary,
    summary: swap(outcome.summary),
    understood: outcome.understood.map(swap),
    proposal: outcome.proposal.map(swap),
    steps,
  };
}

/** "Continuar de todas formas" en el preflight: solo si todo lo que bloquea lo admite. */
export async function overridePixelCommandGuardian(
  workspace: WorkspaceDocument,
  rawId: unknown,
): Promise<PixelCommand> {
  const command = await findCommand(workspace, rawId);
  if (command.status !== 'proposed' || !command.guardian) {
    throw conflict(
      'Esta solicitud no tiene una revisión del Guardian pendiente',
      'pixel_command_not_adjustable',
    );
  }
  const findings = await overridePreflight(workspace, command.guardian.reportId);
  const updated = await PixelCommandModel.findOneAndUpdate(
    { _id: command._id, workspaceId: workspace._id, status: 'proposed' },
    {
      $set: {
        guardianBlocked: false,
        guardian: { ...command.guardian, findings, overridden: true },
      },
    },
    { new: true },
  );
  if (!updated) throw conflict('La solicitud cambió mientras decidías', 'pixel_command_changed');
  return toPixelCommandDTO(updated);
}
