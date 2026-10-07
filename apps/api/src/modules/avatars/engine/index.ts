import type { AvatarConceptEngine } from './AvatarConceptEngine.js';
import { rulesAvatarEngine } from './rulesAvatarEngine.js';

export type { AvatarConceptEngine, AvatarConceptInput } from './AvatarConceptEngine.js';

/**
 * Motor de conceptos de avatar activo. Hoy: reglas determinísticas.
 * Para usar IA: implementar AvatarConceptEngine en apps/api/src/ai/ y elegirlo aquí por
 * configuración (o envolver `rulesAvatarEngine` para enriquecer su resultado).
 */
export function createAvatarConceptEngine(): AvatarConceptEngine {
  return rulesAvatarEngine;
}
