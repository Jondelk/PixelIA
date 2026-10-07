import { AvatarProfileModel } from './avatarProfile.model.js';

/**
 * Índices legacy de `avatar_profiles` (anteriores a Pixel Personal). No eran parciales: un avatar
 * personal no tiene companyId, MongoDB lo indexa como `null` y dos avatares personales con la
 * misma versión (de workspaces distintos) chocarían en `companyId_1_version_-1`.
 * Los sustituyen `brand_company_version` y `brand_company_dna_version` (parciales).
 */
export const LEGACY_AVATAR_INDEXES = ['companyId_1_version_-1', 'companyId_1_brandDnaVersion_1'];

/**
 * Deja los índices de AvatarProfile listos para avatares personales. Idempotente y sin tocar datos:
 * 1. crea los índices declarados (incluidos los parciales nuevos), así la unicidad Enterprise nunca
 *    queda sin respaldo;
 * 2. elimina los índices legacy no parciales si existen.
 * Lo ejecutan el arranque de la API (al conectar con MongoDB) y `npm run migrate:workspaces`.
 * Devuelve los índices eliminados.
 */
export async function upgradeAvatarProfileIndexes(): Promise<string[]> {
  await AvatarProfileModel.createIndexes();
  const existing = await AvatarProfileModel.collection.indexes().catch((err: unknown) => {
    // La colección aún no existe (base nueva): no hay nada que retirar.
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 26) return [];
    throw err;
  });
  const dropped: string[] = [];
  for (const name of LEGACY_AVATAR_INDEXES) {
    if (existing.some((index) => index.name === name)) {
      await AvatarProfileModel.collection.dropIndex(name);
      dropped.push(name);
    }
  }
  return dropped;
}
