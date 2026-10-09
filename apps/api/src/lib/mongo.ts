import { isValidObjectId } from 'mongoose';

/** Error de índice único de MongoDB (E11000). Con `field`, solo si el índice incluye ese campo. */
export function isDuplicateKeyError(err: unknown, field?: string): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err) || err.code !== 11000) {
    return false;
  }
  if (!field) return true;
  const pattern = 'keyPattern' in err ? err.keyPattern : undefined;
  return typeof pattern === 'object' && pattern !== null && field in pattern;
}

/** Escapa un texto para usarlo literalmente dentro de una expresión regular de MongoDB. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** ObjectId hexadecimal de 24 caracteres (isValidObjectId de Mongoose acepta también 12 bytes arbitrarios). */
export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) && isValidObjectId(value);
}
