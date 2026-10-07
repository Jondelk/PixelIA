import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';
import { WorkspaceTypeSchema } from './workspace.js';

export const MESSAGE_MAX_LENGTH = 4000;

export const MessageRoleSchema = z.enum(['user', 'pixel']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const ConversationSchema = z.object({
  id: ObjectIdSchema,
  /** Contexto principal: las conversaciones son recursos del workspace. */
  workspaceId: ObjectIdSchema,
  /** Tipo de contexto con el que habla Pixel (igual al tipo del workspace). */
  contextType: WorkspaceTypeSchema,
  /** Legacy/enterprise: empresa del workspace (null en conversaciones personales). */
  companyId: ObjectIdSchema.nullable(),
  userId: ObjectIdSchema,
  title: z.string(),
  messageCount: z.number().int().min(0),
  lastMessageAt: IsoDateSchema.nullable(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MessageMetaSchema = z.object({
  provider: z.string(),
  model: z.string(),
  /** 'demo' = respuesta local sin IA. */
  mode: z.enum(['ai', 'demo']),
  latencyMs: z.number().int().min(0),
  /** ADN con el que respondió: BrandDNA (enterprise) o PersonalDNA (personal); el otro es null. */
  brandDnaVersion: z.number().int().min(1).nullable(),
  personalDnaVersion: z.number().int().min(1).nullable().default(null),
  avatarVersion: z.number().int().min(1).nullable(),
});

export const MessageSchema = z.object({
  id: ObjectIdSchema,
  conversationId: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  /** Legacy/enterprise. */
  companyId: ObjectIdSchema.nullable(),
  userId: ObjectIdSchema,
  role: MessageRoleSchema,
  content: z.string(),
  meta: MessageMetaSchema.nullable(),
  createdAt: IsoDateSchema,
});
export type Message = z.infer<typeof MessageSchema>;

export const SendMessageInputSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Escribe un mensaje')
    .max(MESSAGE_MAX_LENGTH, `Máximo ${MESSAGE_MAX_LENGTH} caracteres`),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const ConversationResponseSchema = z.object({ conversation: ConversationSchema });
export const ConversationListResponseSchema = z.object({
  conversations: z.array(ConversationSchema),
});
export const ConversationMessagesResponseSchema = z.object({
  conversation: ConversationSchema,
  messages: z.array(MessageSchema),
});
export const SendMessageResponseSchema = z.object({
  conversation: ConversationSchema,
  userMessage: MessageSchema,
  pixelMessage: MessageSchema,
});
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;
