import type { z } from 'zod';
import { ApiRequestError } from './api';

export type FieldErrors = Partial<Record<string, string>>;

/** Primer mensaje de error por campo de un ZodError. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Errores por campo devueltos por la API (si los hay). */
export function apiFieldErrors(err: unknown): FieldErrors {
  if (!(err instanceof ApiRequestError)) return {};
  const errors: FieldErrors = {};
  for (const issue of err.fieldIssues) {
    if (!errors[issue.path]) errors[issue.path] = issue.message;
  }
  return errors;
}
