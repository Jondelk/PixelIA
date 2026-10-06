import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Forma única de todos los errores que devuelve la API. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
