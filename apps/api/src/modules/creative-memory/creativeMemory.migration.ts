import { CreativeMemoryModel } from './creativeMemory.model.js';

/*
 * Migración del Prompt 16 (docs/CREATIVE-MEMORY.md §14): las memorias anteriores (solo modelo, sin
 * escritura en producción) no tienen `status`. Su texto libre (`content`, `kind` decision/insight…)
 * no se puede clasificar con seguridad en una clave normalizada, un alcance y una polaridad: NO se
 * inventa. Quedan como `legacy` (con `origin: legacy` y `active: false`), conservadas y fuera del
 * nuevo retrieval. Idempotente y reiniciable: solo toca documentos sin `status`; nunca borra.
 *
 * Usa el driver nativo a propósito (recorre todos los workspaces, como las otras migraciones) y
 * nunca cruza datos: no lee ni escribe nada más que el estado de cada documento.
 */

export interface CreativeMemoryMigrationResult {
  pending: number;
  migrated: number;
}

export async function migrateLegacyCreativeMemories({
  dryRun = false,
}: { dryRun?: boolean } = {}): Promise<CreativeMemoryMigrationResult> {
  const memories = CreativeMemoryModel.collection;
  const missing = { status: { $exists: false } };
  const pending = await memories.countDocuments(missing);
  if (dryRun || pending === 0) return { pending, migrated: 0 };
  const { modifiedCount } = await memories.updateMany(missing, {
    $set: { status: 'legacy', origin: 'legacy', active: false },
  });
  return { pending, migrated: modifiedCount };
}
