import type { WorkspaceOverview } from '@pixel/contracts';
import { workspaceBasePath } from '../../app/navigation';

/**
 * Intención de un visitante que pulsa "Empezar con Pixel Personal/Enterprise" en la portada pública.
 * Viaja como ruta interna (`/pixels/start?intent=…`) a través del acceso y se resuelve con los Pixels
 * reales del usuario: nunca se crea un workspace por visitar una tarjeta, solo tras esa acción.
 */
export const PIXEL_INTENTS = ['personal', 'enterprise'] as const;
export type PixelIntent = (typeof PIXEL_INTENTS)[number];

export function isPixelIntent(value: unknown): value is PixelIntent {
  return typeof value === 'string' && (PIXEL_INTENTS as readonly string[]).includes(value);
}

export function pixelIntentPath(intent: PixelIntent): string {
  return `/pixels/start?intent=${intent}`;
}

export type IntentResolution =
  | { kind: 'navigate'; to: string }
  /** Aún no tiene Pixel Personal: se crea (misma lógica que "Nuevo Pixel"). */
  | { kind: 'create-personal' };

/**
 * A dónde lleva cada intención según los Pixels que ya tiene el usuario. No repite pasos: si ya
 * existe su Pixel Personal se abre (su Inicio retoma el onboarding pendiente); en Enterprise, con un
 * solo Pixel de empresa se abre ese, con varios se muestra el selector y sin ninguno se crea la empresa.
 */
export function resolvePixelIntent(
  intent: unknown,
  workspaces: readonly WorkspaceOverview[],
): IntentResolution {
  if (intent === 'personal') {
    const personal = workspaces.find((item) => item.workspace.type === 'personal');
    return personal
      ? { kind: 'navigate', to: workspaceBasePath(personal.workspace.id) }
      : { kind: 'create-personal' };
  }
  if (intent === 'enterprise') {
    const enterprise = workspaces.filter(
      (item) => item.workspace.type === 'enterprise' && item.workspace.status === 'active',
    );
    if (enterprise.length === 0) return { kind: 'navigate', to: '/companies/new' };
    if (enterprise.length === 1 && enterprise[0]) {
      return { kind: 'navigate', to: workspaceBasePath(enterprise[0].workspace.id) };
    }
  }
  return { kind: 'navigate', to: '/dashboard' };
}
