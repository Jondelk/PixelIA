import type { ExperienceKind } from '../../brand/experience';
import { isPixelIntent } from '../workspaces/pixelIntent';

/** Personaje que acompaña al acceso: el de la intención del usuario, o el personal por defecto. */
export function visualKindForNext(next: string | null | undefined): ExperienceKind {
  if (!next) return 'personal';
  try {
    const intent = new URL(next, 'https://pixel.invalid').searchParams.get('intent');
    return isPixelIntent(intent) ? intent : 'personal';
  } catch {
    return 'personal';
  }
}
