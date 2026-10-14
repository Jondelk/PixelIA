import type { PixelCommandEntities } from '@pixel/contracts';
import { Types } from 'mongoose';
import { fold } from '../../ai/index.js';
import { CreativeMemoryModel } from '../creative-memory/creativeMemory.model.js';
import {
  findMemoriesToForget,
  previewMemory,
  WORKSPACE_SCOPE,
  type ResolvedScope,
} from '../creative-memory/creativeMemory.service.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { matchCampaigns, type PlanningOutcome } from './pixelCommand.planner.js';
import type { KnownCampaign, PixelKnownContext } from './pixelContext.resolver.js';

/*
 * manage_memory (Prompt 16, docs/PIXEL-COMMAND.md §8 ter): recordar, olvidar o mostrar lo que Pixel
 * ha aprendido, con el mismo flujo que el resto de PixelCommand. Recordar y olvidar esperan UNA
 * confirmación ("Recordar" / "Olvidar"); mostrar responde en el acto. Como mucho una pregunta: el
 * alcance si es ambiguo ("¿solo para esta campaña o para TINTO en general?") o cuál memoria olvidar
 * si hay varias. Lo factual, sensible o con credenciales se explica y no se guarda.
 */

export type MemoryOutcome = PlanningOutcome | { kind: 'memory_reply'; reply: string };

export interface MemoryPlanningState {
  entities: PixelCommandEntities;
  request: string;
  context: PixelKnownContext;
  /** Campaña ya elegida (pantalla o respuesta), siempre de este workspace. */
  chosenCampaignId: string | null;
  /** Pregunta pendiente que el mensaje responde. */
  pendingField: string | null;
  message: string;
}

const list = (values: string[]) =>
  values.length <= 1
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} o ${values[values.length - 1]}`;

const question = (field: string, text: string): PlanningOutcome => ({
  kind: 'question',
  field,
  question: text,
});

const scopeName = (scope: ResolvedScope, owner: string, personal: boolean) =>
  scope.type === 'workspace'
    ? personal
      ? 'ti'
      : owner
    : `la campaña «${scope.label ?? 'elegida'}»`;

const campaignScope = (campaign: KnownCampaign): ResolvedScope => ({
  type: 'campaign',
  id: new Types.ObjectId(campaign.id),
  label: campaign.name,
});

export async function planMemoryCommand(
  workspace: WorkspaceDocument,
  state: MemoryPlanningState,
): Promise<MemoryOutcome> {
  switch (state.entities.memoryAction) {
    case 'show':
      return { kind: 'memory_reply', reply: await showReply(workspace, state.context) };
    case 'forget':
      return planForget(workspace, state);
    default:
      return planRemember(workspace, state);
  }
}

async function planRemember(
  workspace: WorkspaceDocument,
  state: MemoryPlanningState,
): Promise<MemoryOutcome> {
  const { entities, context } = state;
  const personal = context.workspaceType === 'personal';
  const text = entities.memoryText ?? state.request;

  // Alcance: dicho por el usuario, deducido (Personal o sin campañas) o UNA pregunta.
  let scope: ResolvedScope = WORKSPACE_SCOPE;
  const hint = personal ? 'workspace' : entities.memoryScopeHint;
  if (hint === 'campaign') {
    const campaign = state.chosenCampaignId
      ? (context.campaigns.find((c) => c.id === state.chosenCampaignId) ?? null)
      : pickCampaign(context.campaigns, entities.campaignHint, state.request);
    if (!campaign) {
      if (!context.campaigns.length) {
        return {
          kind: 'memory_reply',
          reply: `No encontré campañas en este Pixel. Si quieres, lo recuerdo para ${context.ownerName} en general.`,
        };
      }
      const names = context.campaigns.slice(0, 3).map((c) => `«${c.name}»`);
      return question('memoryCampaign', `¿Para cuál campaña? ${list(names)}.`);
    }
    scope = campaignScope(campaign);
  } else if (!hint && context.campaigns.length) {
    return question(
      'memoryScope',
      `¿Quieres que lo recuerde solo para ${state.chosenCampaignId ? 'esta campaña' : 'una campaña'} o para ${context.ownerName} en general?`,
    );
  }
  const campaignId = scope.type === 'campaign' ? scope.id!.toString() : null;

  const preview = await previewMemory(workspace, text, scope);
  if (preview.kind === 'rejected') return { kind: 'memory_reply', reply: preview.message };
  if (preview.kind === 'unclear') {
    return {
      kind: 'memory_reply',
      reply:
        'No entendí qué debo recordar. Dímelo como una preferencia: por ejemplo, «evita las Stories» o «prefiero carruseles educativos».',
    };
  }
  const where = scopeName(scope, context.ownerName, personal);
  if (preview.duplicate) {
    return {
      kind: 'memory_reply',
      reply: `Ya lo tengo en cuenta para ${where}: «${preview.duplicate.content}».`,
    };
  }
  const statement = preview.parsed.statement;
  const exception = preview.parsed.polarity === 'allow';
  return {
    kind: 'proposal',
    summary: `Voy a recordar para ${where}: ${statement}${exception ? ' (como excepción)' : ''}.`,
    understood: [
      `Qué: ${statement}`,
      `Aplica a: ${scope.type === 'workspace' ? (personal ? 'todo tu Pixel' : `${context.ownerName} en general`) : `solo la campaña «${scope.label}»`}`,
      ...preview.replaces.map((memory) => `Reemplaza a: «${memory.content}»`),
    ],
    proposal: [
      exception
        ? `Una excepción solo para «${scope.label}»: fuera de esa campaña sigue valiendo lo de siempre`
        : 'Lo tendré en cuenta en tus próximas campañas, planes y revisiones; lo que pidas en cada momento siempre manda',
    ],
    creates: ['Una memoria en «Lo que Pixel ha aprendido» (puedes olvidarla cuando quieras)'],
    steps: [
      {
        id: 'step_1',
        type: 'remember_memory',
        title: `Recordar «${statement}»`,
        params: {
          text,
          scopeType: scope.type,
          ...(campaignId ? { scopeId: campaignId } : {}),
        },
      },
    ],
    campaignId,
  };
}

async function planForget(
  workspace: WorkspaceDocument,
  state: MemoryPlanningState,
): Promise<MemoryOutcome> {
  const text = state.entities.memoryText ?? state.request;
  let matches = await findMemoriesToForget(workspace, text);
  // Respuesta a "¿cuál quieres que olvide?": se elige entre las que coinciden con la respuesta.
  if (state.pendingField === 'memoryForget' && matches.length > 1) {
    const answer = fold(state.message);
    const chosen = matches.filter((memory) =>
      (fold(memory.content).match(/[a-z0-9ñ]+/g) ?? []).some(
        (word) => word.length >= 5 && answer.includes(word),
      ),
    );
    if (chosen.length) matches = chosen;
  }
  if (matches.length === 0) {
    return {
      kind: 'memory_reply',
      reply:
        'No encontré nada parecido en lo que recuerdo. Puedes verlo todo en «Lo que Pixel ha aprendido».',
    };
  }
  if (matches.length > 1) {
    const names = matches.slice(0, 3).map((memory) => `«${memory.content}»`);
    return question('memoryForget', `¿Cuál quieres que olvide? ${list(names)}.`);
  }
  const memory = matches[0]!;
  return {
    kind: 'proposal',
    summary: `Voy a dejar de usar esta preferencia: «${memory.content}».`,
    understood: [`Olvidar: «${memory.content}»`],
    proposal: ['Pixel dejará de tenerla en cuenta; queda en el historial por si la necesitas'],
    creates: ['Nada nuevo: la memoria pasa al historial como olvidada'],
    steps: [
      {
        id: 'step_1',
        type: 'forget_memory',
        title: `Olvidar «${memory.content}»`,
        params: { memoryId: memory._id.toString() },
      },
    ],
    campaignId: null,
  };
}

/** "¿Qué has aprendido de TINTO?": las activas y, aparte, las candidatas (nunca se inventa nada). */
async function showReply(
  workspace: WorkspaceDocument,
  context: PixelKnownContext,
): Promise<string> {
  const [active, candidates] = await Promise.all([
    CreativeMemoryModel.find({ workspaceId: workspace._id, status: 'active' })
      .sort({ confirmedByUser: -1, updatedAt: -1 })
      .limit(8),
    CreativeMemoryModel.find({ workspaceId: workspace._id, status: 'candidate' })
      .sort({ updatedAt: -1 })
      .limit(3),
  ]);
  const owner = context.workspaceType === 'personal' ? 'ti' : context.ownerName;
  if (!active.length && !candidates.length) {
    return `Todavía no he aprendido nada de ${owner} más allá de su ADN. Si quieres que recuerde algo, dímelo («de ahora en adelante…»).`;
  }
  const scoped = (memory: (typeof active)[number]) =>
    memory.scope?.type === 'campaign' && memory.scope.label
      ? ` (solo en «${memory.scope.label}»)`
      : '';
  const lines = [
    ...(active.length
      ? [
          `Esto es lo que tengo en cuenta de ${owner}:`,
          ...active.map((m) => `• ${m.content}${scoped(m)}`),
        ]
      : [`Aún no tengo preferencias confirmadas de ${owner}.`]),
    ...(candidates.length
      ? [
          'Y he notado estos patrones, sin confirmar todavía (puedes confirmarlos en «Lo que Pixel ha aprendido»):',
          ...candidates.map((m) => `• ${m.content}`),
        ]
      : []),
  ];
  return lines.join('\n');
}

function pickCampaign(
  campaigns: KnownCampaign[],
  hint: string | null,
  request: string,
): KnownCampaign | null {
  // Sin pista explícita, cualquier palabra del nombre de una campaña en la frase vale.
  const matches = matchCampaigns(campaigns, hint ?? request, request);
  if (matches.length === 1) return matches[0]!;
  return campaigns.length === 1 ? campaigns[0]! : null;
}
