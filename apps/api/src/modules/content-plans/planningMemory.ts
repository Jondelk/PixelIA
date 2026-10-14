import type { ContentFormat, ContentPlatform } from '@pixel/contracts';
import {
  memoryLines,
  placementDirectives,
  resolveCreativeMemories,
} from '../creative-memory/memory.resolver.js';
import type { WorkspaceDocument } from '../workspaces/workspace.model.js';

/*
 * Creative Memory en el Content Planner (Personal y Enterprise, Prompt 16). La memoria es una
 * preferencia POR DEFECTO: lo que la solicitud pide explícitamente (formatos, plataformas) siempre
 * manda ("esta vez quiero 5 Stories" → hay Stories, y la memoria sigue activa). Determinista: se
 * aplica igual con un proveedor real o con el demo.
 */

export interface PlanningMemory {
  /** Resumen compacto para la IA (MEMORY_n), sin ids, fechas ni puntuaciones. */
  lines: { ref: string; statement: string }[];
  avoidFormats: ContentFormat[];
  preferFormats: ContentFormat[];
  avoidPlatforms: ContentPlatform[];
  preferPlatforms: ContentPlatform[];
}

export const NO_PLANNING_MEMORY: PlanningMemory = {
  lines: [],
  avoidFormats: [],
  preferFormats: [],
  avoidPlatforms: [],
  preferPlatforms: [],
};

/** Memorias relevantes para planificar: formatos, plataformas, contenido y comunicación. */
export async function planningMemoryFor(
  workspace: WorkspaceDocument,
  campaignId: string | null,
): Promise<PlanningMemory> {
  const resolved = await resolveCreativeMemories(workspace, {
    dimensions: ['format', 'platform', 'content', 'communication'],
    campaignId,
  });
  if (!resolved.memories.length) return NO_PLANNING_MEMORY;
  const directives = placementDirectives(resolved);
  return {
    lines: memoryLines(resolved),
    avoidFormats: directives.avoidFormats,
    preferFormats: directives.preferFormats,
    avoidPlatforms: directives.avoidPlatforms,
    preferPlatforms: directives.preferPlatforms,
  };
}

export interface MemoryFormats {
  /** Preferidos: los de la memoria primero, sin los que evita. */
  preferred: ContentFormat[];
  /** Formatos a evitar mientras la solicitud no los pida. */
  avoided: ContentFormat[];
  /** Formatos que la memoria prefiere (para ordenar en el demo). */
  memoryPreferred: ContentFormat[];
  keys: string[];
}

export function memoryFormats(
  preferred: ContentFormat[],
  required: ContentFormat[],
  memory: PlanningMemory,
): MemoryFormats {
  if (required.length) return { preferred, avoided: [], memoryPreferred: [], keys: [] };
  const avoided = [...new Set(memory.avoidFormats)];
  const memoryPreferred = memory.preferFormats.filter((format) => !avoided.includes(format));
  return {
    preferred: [...new Set([...memoryPreferred, ...preferred])].filter((f) => !avoided.includes(f)),
    avoided,
    memoryPreferred,
    keys: [
      ...avoided.map((format) => `format:${format}:avoid`),
      ...memoryPreferred.map((format) => `format:${format}:prefer`),
    ],
  };
}

/**
 * Plataformas: las pedidas mandan. Si no se pidieron, las de siempre sin las que la memoria evita
 * (nunca dejándolas vacías); y si no hay ninguna, las que la memoria prefiere.
 */
export function memoryPlatforms(
  requested: ContentPlatform[] | undefined,
  fallback: ContentPlatform[],
  memory: PlanningMemory,
): { platforms: ContentPlatform[]; keys: string[] } {
  if (requested?.length) return { platforms: requested, keys: [] };
  const kept = fallback.filter((platform) => !memory.avoidPlatforms.includes(platform));
  if (kept.length && kept.length < fallback.length) {
    return {
      platforms: kept,
      keys: fallback
        .filter((platform) => memory.avoidPlatforms.includes(platform))
        .map((platform) => `platform:${platform}:avoid`),
    };
  }
  if (!fallback.length && memory.preferPlatforms.length) {
    return {
      platforms: [...new Set(memory.preferPlatforms)],
      keys: memory.preferPlatforms.map((platform) => `platform:${platform}:prefer`),
    };
  }
  return { platforms: fallback, keys: [] };
}

const PLATFORM_FORMATS: Record<ContentPlatform, ContentFormat[]> = {
  instagram: ['reel', 'carousel', 'photo', 'story'],
  tiktok: ['short_video'],
  youtube: ['long_video', 'short_video'],
  facebook: ['post', 'reel', 'photo'],
  linkedin: ['post', 'article', 'carousel'],
  x: ['post'],
  blog: ['article'],
  newsletter: ['newsletter'],
  other: ['post'],
};

/**
 * Después de validar: una pieza en un formato que la memoria evita (y que la solicitud no pidió) pasa
 * al formato preferido que esa plataforma admita. Si la plataforma no admite otro, se deja.
 */
export function respectAvoidedFormats<
  T extends { platform: ContentPlatform; format: ContentFormat },
>(items: T[], avoided: ContentFormat[], preferred: ContentFormat[]): T[] {
  if (!avoided.length) return items;
  return items.map((item) => {
    if (!avoided.includes(item.format)) return item;
    const options = PLATFORM_FORMATS[item.platform].filter((format) => !avoided.includes(format));
    const next = options.find((format) => preferred.includes(format)) ?? options[0];
    return next ? { ...item, format: next } : item;
  });
}
