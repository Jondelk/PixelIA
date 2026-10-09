import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';

/*
 * CreativeMemory: conocimiento creativo acumulado de un workspace (preferencias, decisiones,
 * rechazos). En esta etapa solo existe el contrato y el modelo: la creación explícita, el panel y su
 * uso en el chat llegan en la etapa de memoria (docs/BACKLOG.md).
 */

export const MemoryScopeSchema = z.enum(['enterprise', 'personal']);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const CreativeMemoryKindSchema = z.enum(['preference', 'decision', 'insight', 'rejection']);
export type CreativeMemoryKind = z.infer<typeof CreativeMemoryKindSchema>;

export const CreativeMemorySchema = z.object({
  id: ObjectIdSchema,
  workspaceId: ObjectIdSchema,
  memoryScope: MemoryScopeSchema,
  /** Enterprise: empresa del workspace (null en memorias personales). */
  companyId: ObjectIdSchema.nullable(),
  kind: CreativeMemoryKindSchema,
  content: z.string().min(1).max(1000),
  source: z.object({
    type: z.enum(['message', 'manual']),
    conversationId: ObjectIdSchema.nullable(),
    messageId: ObjectIdSchema.nullable(),
  }),
  createdByUserId: ObjectIdSchema,
  active: z.boolean(),
  createdAt: IsoDateSchema,
});
export type CreativeMemory = z.infer<typeof CreativeMemorySchema>;
