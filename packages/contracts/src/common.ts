import { z } from 'zod';

/** Identificador de MongoDB serializado como string hexadecimal de 24 caracteres. */
export const ObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'ObjectId inválido');
export type ObjectId = z.infer<typeof ObjectIdSchema>;

/** Fecha ISO 8601 tal como viaja en JSON. */
export const IsoDateSchema = z.iso.datetime();
