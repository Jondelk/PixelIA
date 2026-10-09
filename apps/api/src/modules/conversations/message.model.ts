import { MessageSchema, type Message, type MessageRole } from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

export interface MessageAttrs {
  /** Contexto principal (clave de aislamiento), el de su conversación. */
  workspaceId: Types.ObjectId;
  /** Legacy/enterprise. Ausente en mensajes personales. */
  companyId?: Types.ObjectId;
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
    /** ADN con el que respondió: BrandDNA (enterprise) o PersonalDNA (personal); el otro es null. */
    brandDnaVersion: number | null;
    personalDnaVersion?: number | null;
    avatarVersion: number | null;
  } | null;
  createdAt: Date;
}

export type MessageDocument = HydratedDocument<MessageAttrs>;

const messageSchema = new Schema<MessageAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'pixel'], required: true },
    content: { type: String, required: true, maxlength: 20_000 },
    meta: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

messageSchema.index({ workspaceId: 1, conversationId: 1, createdAt: -1 });
messageSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const MessageModel = model<MessageAttrs>('Message', messageSchema);

/** Acepta documentos hidratados y los devueltos por insertMany (meta opcional). */
export function toMessageDTO(
  doc: Omit<MessageAttrs, 'meta'> & { _id: Types.ObjectId; meta?: MessageAttrs['meta'] },
): Message {
  return MessageSchema.parse({
    id: doc._id.toString(),
    conversationId: doc.conversationId.toString(),
    workspaceId: doc.workspaceId.toString(),
    companyId: doc.companyId?.toString() ?? null,
    userId: doc.userId.toString(),
    role: doc.role,
    content: doc.content,
    meta: doc.meta ?? null,
    createdAt: doc.createdAt.toISOString(),
  });
}
