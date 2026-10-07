import { ConversationSchema, type Conversation } from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

export interface ConversationAttrs {
  companyId: Types.ObjectId;
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
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 120, default: 'Nueva conversación' },
    messageCount: { type: Number, required: true, default: 0, min: 0 },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

conversationSchema.index({ companyId: 1, userId: 1, updatedAt: -1 });
conversationSchema.plugin(tenantScoped);

export const ConversationModel = model<ConversationAttrs>('Conversation', conversationSchema);

export function toConversationDTO(doc: ConversationDocument): Conversation {
  return ConversationSchema.parse({
    id: doc._id.toString(),
    companyId: doc.companyId.toString(),
    userId: doc.userId.toString(),
    title: doc.title,
    messageCount: doc.messageCount,
    lastMessageAt: doc.lastMessageAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
}
