import { Types, type Schema } from 'mongoose';

/** Operaciones de consulta que deben ir siempre filtradas por la clave de aislamiento. */
const QUERY_OPERATIONS = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'estimatedDocumentCount',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
] as const;

/**
 * Clave de aislamiento de un modelo:
 * - workspaceId: recursos del workspace (AvatarProfile, Conversation, Message, CreativeMemory).
 * - companyId: datos propios de una empresa enterprise (BrandDNA).
 */
export type TenantKey = 'workspaceId' | 'companyId';

export class TenantScopeError extends Error {
  constructor(modelName: string, operation: string, key: TenantKey) {
    super(
      `Consulta ${operation} sobre ${modelName} sin ${key} concreto: viola el aislamiento por ${key}`,
    );
    this.name = 'TenantScopeError';
  }
}

/**
 * Un único valor concreto: ObjectId, id en texto o `{ $eq: … }`. Operadores como `$exists`, `$ne`,
 * `$in` o `$regex` se rechazan porque podrían devolver documentos de otros tenants.
 */
function isTenantValue(value: unknown): boolean {
  if (value instanceof Types.ObjectId) return true;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'object' && value !== null) {
    if ((value as { _bsontype?: unknown })._bsontype === 'ObjectId') return true;
    const keys = Object.keys(value);
    return keys.length === 1 && keys[0] === '$eq' && isTenantValue((value as { $eq: unknown }).$eq);
  }
  return false;
}

function hasKey(filter: Record<string, unknown> | undefined, key: TenantKey): boolean {
  return isTenantValue(filter?.[key]);
}

/**
 * Aislamiento a nivel de base de datos (ver CLAUDE.md): cualquier consulta sobre el modelo sin un
 * valor concreto de la clave de aislamiento en el filtro lanza un error, incluso `findById`. Las
 * agregaciones deben empezar con un `$match` por esa clave y cada operación de `bulkWrite` debe
 * llevarla. Las altas (`create`, `insertMany`) la exigen por el `required` del schema. Las
 * migraciones que necesiten otra clave usan el driver nativo (`Model.collection`) explícitamente.
 */
export function tenantScoped(schema: Schema, options: { key: TenantKey }): void {
  const { key } = options;
  for (const operation of QUERY_OPERATIONS) {
    schema.pre(operation, function () {
      if (!hasKey(this.getFilter(), key)) {
        throw new TenantScopeError(this.model.modelName, operation, key);
      }
    });
  }

  schema.pre('aggregate', function () {
    const first = this.pipeline()[0] as { $match?: Record<string, unknown> } | undefined;
    if (!hasKey(first?.$match, key)) {
      throw new TenantScopeError(this.model().modelName, 'aggregate', key);
    }
  });

  schema.pre('bulkWrite', function (ops: unknown) {
    for (const op of Array.isArray(ops) ? ops : []) {
      const [kind, body] = Object.entries(op as Record<string, Record<string, unknown>>)[0] ?? [];
      const target =
        kind === 'insertOne'
          ? (body?.document as Record<string, unknown> | undefined)
          : (body?.filter as Record<string, unknown> | undefined);
      if (!hasKey(target, key)) {
        throw new TenantScopeError(this.modelName, `bulkWrite.${kind ?? '?'}`, key);
      }
    }
  });
}
