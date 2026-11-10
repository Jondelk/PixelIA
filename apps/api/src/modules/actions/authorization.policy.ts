import type { ActionAuthorization, ActionEffect, ActionTarget } from './action.types.js';

/*
 * ActionAuthorizationPolicy (Prompt 18): qué autorización exige una capacidad. Determinista: depende
 * solo de lo que la capacidad DECLARA (efecto, destino, si mueve dinero, si es un cambio
 * significativo). Ni la IA ni el cliente lo deciden, y el Brand Guardian tampoco: el Guardian juzga
 * la coherencia de marca; esta política, si Pixel puede ejecutar.
 *
 * | Efecto              | Interno                     | Externo               |
 * |---------------------|-----------------------------|-----------------------|
 * | read                | none                        | none (conexión ya autorizada) |
 * | create              | confirm («Organizar»)       | confirm               |
 * | update significativo| confirm                     | confirm               |
 * | update menor        | none                        | confirm               |
 * | delete              | confirm                     | elevated              |
 * | financiero (todo)   | unsupported                 | unsupported           |
 */

export interface AuthorizationSubject {
  effect: ActionEffect;
  target: ActionTarget;
  financial?: boolean;
  significant?: boolean;
}

export function authorizationFor(subject: AuthorizationSubject): ActionAuthorization {
  if (subject.financial) return 'unsupported';
  const { effect, target } = subject;
  if (effect === 'read') return 'none';
  if (target === 'external') return effect === 'delete' ? 'elevated' : 'confirm';
  if (effect === 'update' && !subject.significant) return 'none';
  return 'confirm';
}

/**
 * ¿Basta la confirmación única de PixelCommand para ejecutarla? `elevated` exigiría una
 * confirmación reforzada que V1 no ofrece; `unsupported` nunca se ejecuta.
 */
export function coveredByPlanConfirmation(authorization: ActionAuthorization): boolean {
  return authorization === 'none' || authorization === 'confirm';
}
