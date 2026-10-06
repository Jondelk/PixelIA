import { isValidObjectId } from 'mongoose';

/** Error de índice único de MongoDB (E11000). */
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

/** ObjectId hexadecimal de 24 caracteres (isValidObjectId de Mongoose acepta también 12 bytes arbitrarios). */
export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) && isValidObjectId(value);
}
