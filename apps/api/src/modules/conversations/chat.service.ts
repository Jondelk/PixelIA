import {
  DEFAULT_TIMEZONE,
  type Conversation,
  type Message,
  type SendMessageResponse,
} from '@pixel/contracts';
import { Types } from 'mongoose';
import { AIProviderError, type AIProvider } from '../../ai/index.js';
import { AppError, notFound } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { isObjectIdString } from '../../lib/mongo.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';
import { findWorkspaceCompany } from '../workspaces/workspace.service.js';
import { resolveContextBuilder } from './context/index.js';
import {
  ConversationModel,
  toConversationDTO,
  type ConversationDocument,
} from './conversation.model.js';
import { MessageModel, toMessageDTO } from './message.model.js';

/*
 * Conversaciones con Pixel: recursos del workspace. Toda consulta va filtrada por el workspaceId
 * del workspace ya autorizado (requireWorkspaceAccess o requireCompanyAccess) y por el usuario;
 * los modelos aplican tenantScoped por workspaceId. El contexto de dominio (marca o perfil
 * personal) lo pone la estrategia de contexto del tipo de workspace.
 */

const MESSAGES_PAGE = 200;
const CONVERSATIONS_PAGE = 50;
const NOT_FOUND = 'Conversación no encontrada';

export interface ChatDeps {
  ai: AIProvider;
  historyLimit: number;
  logger: Logger;
  /** Zona horaria por defecto para saber qué es "hoy" (dirección del día en el contexto). */
  defaultTimezone?: string;
}

async function findConversation(
  workspace: WorkspaceDocument,
  userId: string,
  conversationId: string,
) {
  if (!isObjectIdString(conversationId)) return null;
  return ConversationModel.findOne({ _id: conversationId, workspaceId: workspace._id, userId });
}

export async function listConversations(
  workspace: WorkspaceDocument,
  userId: string,
): Promise<Conversation[]> {
  const docs = await ConversationModel.find({ workspaceId: workspace._id, userId })
    .sort({ updatedAt: -1 })
    .limit(CONVERSATIONS_PAGE);
  return docs.map(toConversationDTO);
}

export async function createConversation(
  workspace: WorkspaceDocument,
  userId: string,
): Promise<Conversation> {
  // Enterprise guarda también su empresa (compatibilidad con datos y consultas legacy).
  const company = await findWorkspaceCompany(workspace);
  const doc = await ConversationModel.create({
    workspaceId: workspace._id,
    contextType: workspace.type,
    ...(company ? { companyId: company._id } : {}),
    userId,
  });
  return toConversationDTO(doc);
}

export async function getConversationMessages(
  workspace: WorkspaceDocument,
  userId: string,
  conversationId: string,
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const conversation = await findConversation(workspace, userId, conversationId);
  if (!conversation) throw notFound(NOT_FOUND);
  const messages = await MessageModel.find({
    workspaceId: workspace._id,
    conversationId: conversation._id,
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MESSAGES_PAGE);
  return {
    conversation: toConversationDTO(conversation),
    messages: messages.reverse().map(toMessageDTO),
  };
}

function toAppError(err: AIProviderError): AppError {
  switch (err.kind) {
    case 'refused':
      return new AppError(
        422,
        'BAD_REQUEST',
        'Pixel no puede ayudar con esa petición. Prueba a reformularla.',
      );
    case 'rate_limited':
      return new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Pixel está atendiendo muchas peticiones. Inténtalo en un momento.',
      );
    default:
      return new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Pixel no pudo responder ahora. Inténtalo de nuevo.',
      );
  }
}

/**
 * Flujo de un mensaje: conversación del workspace → historial → estrategia de contexto según
 * workspace.type (Enterprise: Company → BrandDNA → AvatarProfile → CreativeMemory; Personal:
 * PersonalProfile → PersonalDNA → AvatarProfile → CreativeMemory) → IA →
 * persistencia. Los dos mensajes se guardan solo si la IA respondió, para que un fallo no deje
 * conversaciones a medias.
 */
export async function sendMessage(
  workspace: WorkspaceDocument,
  userId: string,
  conversationId: string,
  content: string,
  deps: ChatDeps,
): Promise<SendMessageResponse> {
  const conversation: ConversationDocument | null = await findConversation(
    workspace,
    userId,
    conversationId,
  );
  if (!conversation) throw notFound(NOT_FOUND);

  const history = deps.historyLimit
    ? (
        await MessageModel.find({ workspaceId: workspace._id, conversationId: conversation._id })
          .sort({ createdAt: -1, _id: -1 })
          .limit(deps.historyLimit)
          .select({ role: 1, content: 1 })
          .lean()
      ).reverse()
    : [];

  const result = await resolveContextBuilder(workspace.type).build({
    workspace,
    history: history.map((message) => ({ role: message.role, content: message.content })),
    userMessage: content,
    historyLimit: deps.historyLimit,
    defaultTimezone: deps.defaultTimezone ?? DEFAULT_TIMEZONE,
  });
  if (result.status === 'not_configured') {
    throw new AppError(409, 'CONFLICT', result.message, { reason: result.reason });
  }
  const { context, companyId, meta } = result;
  const logContext = {
    workspaceId: workspace._id.toString(),
    workspaceType: workspace.type,
  };

  const askedAt = new Date();
  const author = new Types.ObjectId(userId);
  let reply;
  try {
    reply = await deps.ai.generateText({
      system: context.system,
      messages: context.messages,
      maxOutputTokens: 4000,
      effort: 'medium',
    });
  } catch (err) {
    if (err instanceof AIProviderError) {
      deps.logger.error('Pixel no pudo generar respuesta', {
        ...logContext,
        kind: err.kind,
        err: err.cause ?? err,
      });
      throw toAppError(err);
    }
    throw err;
  }

  const scope = { workspaceId: workspace._id, ...(companyId ? { companyId } : {}) };
  const [userMessage, pixelMessage] = await MessageModel.insertMany([
    {
      ...scope,
      conversationId: conversation._id,
      userId: author,
      role: 'user',
      content,
      createdAt: askedAt,
    },
    {
      ...scope,
      conversationId: conversation._id,
      userId: author,
      role: 'pixel',
      content: reply.text,
      createdAt: new Date(Math.max(Date.now(), askedAt.getTime() + 1)),
      meta: {
        provider: reply.provider,
        model: reply.model,
        mode: reply.mode,
        latencyMs: reply.latencyMs,
        brandDnaVersion: meta.brandDnaVersion,
        personalDnaVersion: meta.personalDnaVersion,
        avatarVersion: meta.avatarVersion,
      },
    },
  ]);

  const set: Record<string, unknown> = { lastMessageAt: new Date() };
  if (conversation.messageCount === 0) set.title = content.replace(/\s+/g, ' ').slice(0, 60);
  const updated = await ConversationModel.findOneAndUpdate(
    { _id: conversation._id, workspaceId: workspace._id, userId },
    { $set: set, $inc: { messageCount: 2 } },
    { returnDocument: 'after' },
  );

  deps.logger.info('Pixel respondió', {
    ...logContext,
    provider: reply.provider,
    latencyMs: reply.latencyMs,
    historyMessages: context.stats.historyMessages,
    systemChars: context.stats.systemChars,
  });

  return {
    conversation: toConversationDTO(updated ?? conversation),
    userMessage: toMessageDTO(userMessage!),
    pixelMessage: toMessageDTO(pixelMessage!),
  };
}
