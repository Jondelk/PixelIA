import { MessageSchema, type Message, type MessageRole } from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

export interface MessageAttrs {
  companyId: Types.ObjectId;
  conversationId: Types.ObjectId;
  /** Usuario de la conversación (también en los mensajes de Pixel). */
  userId: Types.ObjectId;
  role: MessageRole;
  content: string;
  meta: {
    provider: string;
    model: string;
    mode: 'ai' | 'demo';
    latencyMs: number;
    brandDnaVersion: number;
    avatarVersion: number | null;
  } | null;
  createdAt: Date;
}

export type MessageDocument = HydratedDocument<MessageAttrs>;

const messageSchema = new Schema<MessageAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'pixel'], required: true },
    content: { type: String, required: true, maxlength: 20_000 },
    meta: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

messageSchema.index({ companyId: 1, conversationId: 1, createdAt: -1 });
messageSchema.plugin(tenantScoped);

export const MessageModel = model<MessageAttrs>('Message', messageSchema);

/** Acepta documentos hidratados y los devueltos por insertMany (meta opcional). */
export function toMessageDTO(
  doc: Omit<MessageAttrs, 'meta'> & { _id: Types.ObjectId; meta?: MessageAttrs['meta'] },
): Message {
  return MessageSchema.parse({
    id: doc._id.toString(),
    conversationId: doc.conversationId.toString(),
    companyId: doc.companyId.toString(),
    userId: doc.userId.toString(),
    role: doc.role,
    content: doc.content,
    meta: doc.meta ?? null,
    createdAt: doc.createdAt.toISOString(),
  });
}
