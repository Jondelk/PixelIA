import type { AvatarConcept, BrandDnaContent } from '@pixel/contracts';

export interface AvatarConceptInput {
  /** ADN de la empresa: la única fuente del concepto (nunca el onboarding crudo). */
  brandDna: BrandDnaContent;
  /**
   * 0 = el concepto que mejor encaja con el ADN. Valores mayores exploran alternativas
   * válidas ("Regenerar concepto"). Mismo ADN + misma variación → mismo concepto.
   */
  variation: number;
}

/**
 * Motor que transforma un BrandDNA en un concepto de avatar.
 *
 * Contrato estable para el resto del producto: hoy lo implementa un motor de reglas
 * (`rulesAvatarEngine`); un motor de IA puede reemplazarlo, o envolverlo para enriquecer su
 * resultado (p. ej. reescribir `concept` y `rationale` conservando las decisiones visuales).
 * El servicio valida siempre la salida con AvatarConceptSchema.
 */
export interface AvatarConceptEngine {
  readonly kind: 'deterministic' | 'ai';
  readonly version: string;
  generate(input: AvatarConceptInput): Promise<AvatarConcept>;
}
