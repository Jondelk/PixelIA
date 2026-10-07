import type { Conversation, Message, SendMessageResponse } from '@pixel/contracts';
import { Types } from 'mongoose';
import { AIProviderError, type AIProvider } from '../../ai/index.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { isObjectIdString } from '../../lib/mongo.js';
import { AvatarProfileModel, toAvatarProfileDTO } from '../avatars/avatarProfile.model.js';
import { BrandDnaModel, toBrandDnaDTO } from '../brand-dna/brandDna.model.js';
import type { CompanyDocument } from '../companies/company.model.js';
import {
  ConversationModel,
  toConversationDTO,
  type ConversationDocument,
} from './conversation.model.js';
import { MessageModel, toMessageDTO } from './message.model.js';
import { buildPixelContext } from './pixelContext.builder.js';

/*
 * Conversaciones con Pixel. Toda consulta va filtrada por el companyId de la empresa ya
 * autorizada (requireCompanyAccess) y por el usuario; los modelos aplican tenantScoped.
 */

const MESSAGES_PAGE = 200;
const CONVERSATIONS_PAGE = 50;
const NOT_FOUND = 'Conversación no encontrada';

export interface ChatDeps {
  ai: AIProvider;
  historyLimit: number;
  logger: Logger;
}

async function findConversation(company: CompanyDocument, userId: string, conversationId: string) {
  if (!isObjectIdString(conversationId)) return null;
  return ConversationModel.findOne({ _id: conversationId, companyId: company._id, userId });
}

export async function listConversations(
  company: CompanyDocument,
  userId: string,
): Promise<Conversation[]> {
  const docs = await ConversationModel.find({ companyId: company._id, userId })
    .sort({ updatedAt: -1 })
    .limit(CONVERSATIONS_PAGE);
  return docs.map(toConversationDTO);
}

export async function createConversation(
  company: CompanyDocument,
  userId: string,
): Promise<Conversation> {
  const doc = await ConversationModel.create({ companyId: company._id, userId });
  return toConversationDTO(doc);
}

export async function getConversationMessages(
  company: CompanyDocument,
  userId: string,
  conversationId: string,
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const conversation = await findConversation(company, userId, conversationId);
  if (!conversation) throw notFound(NOT_FOUND);
  const messages = await MessageModel.find({
    companyId: company._id,
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
 * Flujo de un mensaje: conversación → empresa → BrandDNA → AvatarProfile → historial →
 * contexto → IA → persistencia. Los dos mensajes se guardan solo si la IA respondió, para que
 * un fallo no deje conversaciones a medias.
 */
export async function sendMessage(
  company: CompanyDocument,
  userId: string,
  conversationId: string,
  content: string,
  deps: ChatDeps,
): Promise<SendMessageResponse> {
  const conversation: ConversationDocument | null = await findConversation(
    company,
    userId,
    conversationId,
  );
  if (!conversation) throw notFound(NOT_FOUND);

  if (!company.brandDnaVersion) {
    throw conflict('Pixel aún no conoce esta marca: completa el onboarding para conversar con él');
  }
  const dnaDoc = await BrandDnaModel.findOne({
    companyId: company._id,
    version: company.brandDnaVersion,
  });
  if (!dnaDoc) throw conflict('No se encontró el ADN de marca vigente');
  const brandDna = toBrandDnaDTO(dnaDoc);

  const avatarDoc = company.avatarVersion
    ? await AvatarProfileModel.findOne({ companyId: company._id, version: company.avatarVersion })
    : null;
  const avatar = avatarDoc ? toAvatarProfileDTO(avatarDoc) : null;

  const history = deps.historyLimit
    ? (
        await MessageModel.find({ companyId: company._id, conversationId: conversation._id })
          .sort({ createdAt: -1, _id: -1 })
          .limit(deps.historyLimit)
          .select({ role: 1, content: 1 })
          .lean()
      ).reverse()
    : [];

  const context = buildPixelContext({
    company: { name: company.name },
    brandDna,
    avatar,
    history: history.map((message) => ({ role: message.role, content: message.content })),
    userMessage: content,
    limits: { historyMessages: deps.historyLimit },
  });

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
        companyId: company._id.toString(),
        kind: err.kind,
        err: err.cause ?? err,
      });
      throw toAppError(err);
    }
    throw err;
  }

  const [userMessage, pixelMessage] = await MessageModel.insertMany([
    {
      companyId: company._id,
      conversationId: conversation._id,
      userId: author,
      role: 'user',
      content,
      createdAt: askedAt,
    },
    {
      companyId: company._id,
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
        brandDnaVersion: brandDna.version,
        avatarVersion: avatar?.version ?? null,
      },
    },
  ]);

  const set: Record<string, unknown> = { lastMessageAt: new Date() };
  if (conversation.messageCount === 0) set.title = content.replace(/\s+/g, ' ').slice(0, 60);
  const updated = await ConversationModel.findOneAndUpdate(
    { _id: conversation._id, companyId: company._id, userId },
    { $set: set, $inc: { messageCount: 2 } },
    { returnDocument: 'after' },
  );

  deps.logger.info('Pixel respondió', {
    companyId: company._id.toString(),
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
