import { z } from 'zod';
import { IsoDateSchema, ObjectIdSchema } from './common.js';

/** Usuario tal como lo expone la API. Nunca incluye passwordHash. */
export const UserSchema = z.object({
  id: ObjectIdSchema,
  name: z.string(),
  email: z.email(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type User = z.infer<typeof UserSchema>;
