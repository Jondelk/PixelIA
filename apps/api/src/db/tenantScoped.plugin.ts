import type { Schema } from 'mongoose';

/** Operaciones de consulta que deben ir siempre filtradas por companyId. */
const QUERY_OPERATIONS = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
] as const;

export class TenantScopeError extends Error {
  constructor(modelName: string, operation: string) {
    super(
      `Consulta ${operation} sobre ${modelName} sin companyId: viola el aislamiento por empresa`,
    );
    this.name = 'TenantScopeError';
  }
}

function hasCompanyId(filter: Record<string, unknown> | undefined): boolean {
  return filter?.companyId !== undefined && filter.companyId !== null;
}

/**
 * Aislamiento por empresa a nivel de base de datos (ver CLAUDE.md):
 * cualquier consulta sobre un modelo de empresa sin `companyId` en el filtro lanza un error,
 * incluso `findById`. Las agregaciones deben empezar con un `$match` por companyId.
 */
export function tenantScoped(schema: Schema): void {
  for (const operation of QUERY_OPERATIONS) {
    schema.pre(operation, function () {
      if (!hasCompanyId(this.getFilter())) {
        throw new TenantScopeError(this.model.modelName, operation);
      }
    });
  }

  schema.pre('aggregate', function () {
    const first = this.pipeline()[0] as { $match?: Record<string, unknown> } | undefined;
    if (!hasCompanyId(first?.$match)) {
      throw new TenantScopeError(this.model().modelName, 'aggregate');
    }
  });
}
