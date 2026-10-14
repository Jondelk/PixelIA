import { z } from 'zod';

export const DatabaseStatusSchema = z.enum(['connected', 'connecting', 'disconnected']);
export type DatabaseStatus = z.infer<typeof DatabaseStatusSchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('pixel-api'),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  database: DatabaseStatusSchema,
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
