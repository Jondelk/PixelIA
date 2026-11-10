import { CAMPAIGN_STATUS_LABELS, type PixelCommandEntities } from '@pixel/contracts';
import { AIProviderError, type AIProvider } from '../../ai/index.js';
import { AppError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { getCampaign } from '../campaigns/campaigns.service.js';
import { resolveContextBuilder } from '../conversations/context/index.js';
import { getOperationsSummary } from '../operations/summary.service.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { matchCampaigns } from './pixelCommand.planner.js';
import type { PixelKnownContext } from './pixelContext.resolver.js';

/*
 * Lo que Pixel RESPONDE sin crear nada (docs/PIXEL-COMMAND.md §6):
 * - work_status: datos reales del workspace (conteos, campañas, próximas tareas). Sin IA.
 * - creative_advice: la misma cadena de contexto que el chat (ADN → avatar → memoria → estado) y
 *   AIProvider.generateText. No crea recursos: ofrece llevarlo al plan.
 * - unknown: qué puede hacer Pixel, con ejemplos.
 */

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export async function workStatusReply(
  workspace: WorkspaceDocument,
  entities: PixelCommandEntities,
  request: string,
  context: PixelKnownContext,
  tzOffset: number,
): Promise<string> {
  const lines: string[] = [];
  const [campaign] = entities.campaignHint
    ? matchCampaigns(context.campaigns, entities.campaignHint, request)
    : [];
  if (campaign) {
    const { campaign: detail } = await getCampaign(workspace, campaign.id);
    lines.push(
      `«${detail.name}» está ${CAMPAIGN_STATUS_LABELS[detail.status].toLocaleLowerCase('es')}: ${plural(detail.stats.deliverables, 'pieza propuesta', 'piezas propuestas')}, ${plural(detail.stats.convertedDeliverables, 'en producción', 'en producción')}, ${plural(detail.stats.projects, 'proyecto', 'proyectos')} y ${plural(detail.stats.contentItems, 'contenido', 'contenidos')} vinculados.`,
    );
  }
  const summary = await getOperationsSummary(workspace, { tzOffset });
  const { counts } = summary;
  const active = context.campaigns.filter((c) => c.status === 'active');
  if (!campaign && context.workspaceType === 'enterprise') {
    lines.push(
      active.length
        ? `En marcha: ${active
            .slice(0, 3)
            .map((c) => `«${c.name}»`)
            .join(', ')} (${plural(active.length, 'campaña activa', 'campañas activas')}).`
        : 'No hay campañas activas ahora mismo.',
    );
  }
  lines.push(
    `Trabajo: ${plural(counts.activeProjects, 'proyecto activo', 'proyectos activos')}, ${plural(counts.openTasks, 'tarea pendiente', 'tareas pendientes')}${counts.overdueTasks ? ` (${plural(counts.overdueTasks, 'vencida', 'vencidas')})` : ''} y ${plural(counts.activeContentItems, 'pieza de contenido en curso', 'piezas de contenido en curso')}.`,
  );
  const next = summary.upcomingTasks.slice(0, 3).map((task) => `«${task.title}»`);
  if (next.length) lines.push(`Lo próximo: ${next.join(', ')}.`);
  if (entities.campaignHint && !campaign && context.workspaceType === 'enterprise') {
    lines.unshift(`No encontré una campaña «${entities.campaignHint}» en este Pixel.`);
  }
  return lines.join('\n');
}

export async function creativeAdviceReply(
  workspace: WorkspaceDocument,
  request: string,
  deps: { ai: AIProvider; logger: Logger; defaultTimezone: string },
): Promise<string> {
  const result = await resolveContextBuilder(workspace.type).build({
    workspace,
    history: [],
    userMessage: request,
    historyLimit: 0,
    defaultTimezone: deps.defaultTimezone,
  });
  if (result.status === 'not_configured') {
    throw new AppError(409, 'CONFLICT', result.message, { reason: result.reason });
  }
  try {
    const reply = await deps.ai.generateText({
      system: result.context.system,
      messages: result.context.messages,
      maxOutputTokens: 1500,
      effort: 'medium',
    });
    return `${reply.text.trim()}\n\nSi quieres, dime «llévalo a un plan» y lo organizo.`;
  } catch (err) {
    if (err instanceof AIProviderError) {
      deps.logger.warn('PixelCommand: el consejo creativo no se pudo generar', { kind: err.kind });
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Pixel no puede responder ahora mismo', {
        reason: 'pixel_command_reply_unavailable',
      });
    }
    throw err;
  }
}

export function unknownReply(workspaceType: 'personal' | 'enterprise'): string {
  return workspaceType === 'enterprise'
    ? 'No estoy seguro de qué necesitas. Puedo lanzar una campaña, planear contenido, organizar un proyecto, apuntar tareas o contarte cómo va el trabajo. Por ejemplo: «Necesito lanzar el nuevo producto la próxima semana en Instagram».'
    : 'No estoy seguro de qué necesitas. Puedo planear tu contenido, organizar un proyecto, apuntar tareas, darte ideas o contarte cómo va tu trabajo. Por ejemplo: «Necesito publicar algo esta semana sobre mi proyecto».';
}
