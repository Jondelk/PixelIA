import {
  ConversationSchema,
  WorkspaceTypeSchema,
  type Conversation,
  type WorkspaceType,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

export interface ConversationAttrs {
  /** Contexto principal (clave de aislamiento). */
  workspaceId: Types.ObjectId;
  /** Con qué contexto habla Pixel: el tipo del workspace. */
  contextType: WorkspaceType;
  /** Legacy/enterprise: empresa del workspace. Ausente en conversaciones personales. */
  companyId?: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationDocument = HydratedDocument<ConversationAttrs>;

const conversationSchema = new Schema<ConversationAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    contextType: { type: String, enum: WorkspaceTypeSchema.options, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120, default: 'Nueva conversación' },
    messageCount: { type: Number, required: true, default: 0, min: 0 },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

conversationSchema.index({ workspaceId: 1, userId: 1, updatedAt: -1 });
conversationSchema.plugin(tenantScoped, { key: 'workspaceId' });

export const ConversationModel = model<ConversationAttrs>('Conversation', conversationSchema);

export function toConversationDTO(doc: ConversationDocument): Conversation {
  return ConversationSchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    contextType: doc.contextType ?? 'enterprise',
    companyId: doc.companyId?.toString() ?? null,
    userId: doc.userId.toString(),
    title: doc.title,
    messageCount: doc.messageCount,
    lastMessageAt: doc.lastMessageAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
