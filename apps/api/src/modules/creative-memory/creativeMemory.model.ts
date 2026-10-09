import {
  CreativeMemoryKindSchema,
  CreativeMemorySchema,
  MemoryScopeSchema,
  type CreativeMemory,
  type CreativeMemoryKind,
  type MemoryScope,
} from '@pixel/contracts';
import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { tenantScoped } from '../../db/tenantScoped.plugin.js';

/*
 * CreativeMemory: memoria creativa de un workspace (Enterprise o Personal). En esta etapa solo
 * existe el modelo; la creación, el panel y su gestión llegan en la etapa de memoria. El
 * EnterpriseContextBuilder ya lee las memorias activas del workspace (hoy no hay ninguna).
 */
export interface CreativeMemoryAttrs {
  workspaceId: Types.ObjectId;
  memoryScope: MemoryScope;
  /** Enterprise: empresa del workspace. Ausente en memorias personales. */
  companyId?: Types.ObjectId;
  kind: CreativeMemoryKind;
  content: string;
  source: {
    type: 'message' | 'manual';
    conversationId: Types.ObjectId | null;
    messageId: Types.ObjectId | null;
  };
  createdByUserId: Types.ObjectId;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreativeMemoryDocument = HydratedDocument<CreativeMemoryAttrs>;

const creativeMemorySchema = new Schema<CreativeMemoryAttrs>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    memoryScope: { type: String, enum: MemoryScopeSchema.options, required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    kind: { type: String, enum: CreativeMemoryKindSchema.options, required: true },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
    source: {
      type: { type: String, enum: ['message', 'manual'], required: true },
      conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
      messageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

creativeMemorySchema.index({ workspaceId: 1, active: 1, createdAt: -1 });
creativeMemorySchema.plugin(tenantScoped, { key: 'workspaceId' });

export const CreativeMemoryModel = model<CreativeMemoryAttrs>(
  'CreativeMemory',
  creativeMemorySchema,
  'creative_memories',
);

export function toCreativeMemoryDTO(doc: CreativeMemoryDocument): CreativeMemory {
  return CreativeMemorySchema.parse({
    id: doc._id.toString(),
    workspaceId: doc.workspaceId.toString(),
    memoryScope: doc.memoryScope,
    companyId: doc.companyId?.toString() ?? null,
    kind: doc.kind,
    content: doc.content,
    source: {
      type: doc.source.type,
      conversationId: doc.source.conversationId?.toString() ?? null,
      messageId: doc.source.messageId?.toString() ?? null,
    },
    createdByUserId: doc.createdByUserId.toString(),
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
  });
}
