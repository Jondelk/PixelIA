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
import { fold, type AIProvider } from '../../ai/index.js';
import { recordCreativeDecision } from '../creative-memory/memory.detector.js';
import {
  placementDirectives,
  resolveCreativeMemories,
} from '../creative-memory/memory.resolver.js';
import { formatSignal, platformSignal } from '../creative-memory/memory.signals.js';
import { AppError, notFound } from '../../lib/errors.js';
import { CampaignModel } from '../campaigns/campaign.model.js';
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
import { executeCommand, type PixelExecutorDeps } from './pixelCommand.executor.js';
import {
  PixelCommandModel,
  toPixelCommandDTO,
  type PixelCommandAttrs,
  type PixelCommandDocument,
  type PixelStepAttrs,
} from './pixelCommand.model.js';
import { planMemoryCommand, type MemoryOutcome } from './pixelCommand.memory.js';
import { matchCampaigns, planCommand } from './pixelCommand.planner.js';
import { creativeAdviceReply, unknownReply, workStatusReply } from './pixelCommand.replies.js';
import { resolvePixelContext, type PixelKnownContext } from './pixelContext.resolver.js';
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
  const campaignId = input.contextHint?.campaignId
    ? await campaignInWorkspace(workspace, input.contextHint.campaignId)
    : null;
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
    },
    deps,
  );
  const command = await PixelCommandModel.create({
    ...fields,
    workspaceId: workspace._id,
    request: input.request,
    source: input.source,
    tzOffset: input.tzOffset,
    contextHint: { intent: input.contextHint?.intent ?? null },
  });
  deps.logger.info('PixelCommand: solicitud interpretada', {
    workspaceId: workspace._id.toString(),
    workspaceType: workspace.type,
    intent: command.intent,
    status: command.status,
    mode: command.interpretation.mode,
  });
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

export async function confirmPixelCommand(
  workspace: WorkspaceDocument,
  rawId: unknown,
  input: ConfirmPixelCommandInput,
  deps: PixelCommandDeps,
): Promise<PixelCommandConfirmResponse> {
  const id = resourceId(rawId, PIXEL_COMMAND_NOT_FOUND);
  const executionId = new Types.ObjectId();
  // Reserva atómica: solo una confirmación ejecuta, y solo la revisión que el usuario vio.
  const command = await PixelCommandModel.findOneAndUpdate(
    {
      _id: id,
      workspaceId: workspace._id,
      status: { $in: CONFIRMABLE },
      'plan.revision': input.revision,
      // Un BLOCK del Brand Guardian sin override no se ejecuta solo.
      guardianBlocked: { $ne: true },
    },
    { $set: { status: 'executing', executionId } },
    { new: true },
  );
  if (!command) {
    const current = await findCommand(workspace, id.toString());
    if (current.status === 'executing' || current.status === 'completed') {
      return { command: toPixelCommandDTO(current), executed: false };
    }
    if (CONFIRMABLE.includes(current.status) && current.guardianBlocked) {
      throw conflict(
        'Brand Guardian encontró algo que hay que resolver antes de organizar',
        'guardian_preflight_blocked',
      );
    }
    if (CONFIRMABLE.includes(current.status)) {
      throw conflict(
        'La propuesta cambió: revisa la versión actual antes de confirmar',
        'pixel_command_revision_changed',
      );
    }
    throw conflict('Esta solicitud no tiene nada que confirmar', 'pixel_command_not_confirmable');
  }

  const persist = async (steps: PixelStepAttrs[]) => {
    await PixelCommandModel.updateOne(
      { _id: command._id, workspaceId: workspace._id, executionId },
      { $set: { steps } },
    );
  };
  const result = await executeCommand(workspace, command, deps, persist);
  const final = await PixelCommandModel.findOneAndUpdate(
    { _id: command._id, workspaceId: workspace._id, executionId },
    {
      $set: { status: result.status, reply: result.reply },
      $push: { turns: { role: 'pixel', text: result.reply, at: new Date() } },
    },
    { new: true },
  );
  deps.logger.info('PixelCommand: plan ejecutado', {
    workspaceId: workspace._id.toString(),
    intent: command.intent,
    status: result.status,
  });
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
): Promise<PixelCommand> {
  return toPixelCommandDTO(await findCommand(workspace, rawId));
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
