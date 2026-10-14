import type { ContentPlanContextType } from '@pixel/contracts';
import type { Types } from 'mongoose';
import { WorkspaceModel } from '../workspaces/workspace.model.js';
import { ContentPlanModel } from './contentPlan.model.js';

/*
 * Migración del Prompt 14: \`contextType\` en los ContentPlan anteriores (docs/ENTERPRISE-CONTENT.md).
 *
 * El contexto de un plan es SIEMPRE el tipo de su workspace, que es inmutable: por eso se puede
 * determinar con certeza. Un plan cuyo workspace ya no existe no se toca (se cuenta como huérfano).
 * Idempotente y reiniciable: solo escribe en planes sin \`contextType\` (una segunda ejecución no
 * hace nada) y nunca modifica el contenido generado.
 *
 * Usa el driver nativo (\`Model.collection\`) a propósito, como la migración Company → Workspace:
 * recorre los planes de todos los workspaces, algo que \`tenantScoped\` impide a propósito en el
 * código de producto. Nunca cruza datos: cada plan recibe el tipo de SU workspace.
 */

export interface ContentPlanMigrationResult {
  /** Planes sin contextType encontrados. */
  pending: number;
  /** Planes actualizados (0 en dry-run). */
  migrated: number;
  /** Planes cuyo workspace no existe: no se tocan. */
  orphaned: number;
  byType: Record<ContentPlanContextType, number>;
}

export async function migrateContentPlanContexts({
  dryRun = false,
}: { dryRun?: boolean } = {}): Promise<ContentPlanMigrationResult> {
  const plans = ContentPlanModel.collection;
  const missing = { contextType: { $exists: false } };
  const workspaceIds = (await plans.distinct('workspaceId', missing)) as Types.ObjectId[];
  const result: ContentPlanMigrationResult = {
    pending: await plans.countDocuments(missing),
    migrated: 0,
    orphaned: 0,
    byType: { personal: 0, enterprise: 0 },
  };
  if (workspaceIds.length === 0) return result;

  const workspaces = await WorkspaceModel.collection
    .find({ _id: { $in: workspaceIds } }, { projection: { type: 1 } })
    .toArray();
  const typeOf = new Map(
    workspaces.map((ws) => [ws._id.toString(), ws.type as ContentPlanContextType]),
  );

  for (const workspaceId of workspaceIds) {
    const type = typeOf.get(workspaceId.toString());
    const filter = { workspaceId, ...missing };
    if (!type) {
      result.orphaned += await plans.countDocuments(filter);
      continue;
    }
    if (dryRun) {
      result.byType[type] += await plans.countDocuments(filter);
      continue;
    }
    const { modifiedCount } = await plans.updateMany(filter, { $set: { contextType: type } });
    result.migrated += modifiedCount;
    result.byType[type] += modifiedCount;
  }
  return result;
}
