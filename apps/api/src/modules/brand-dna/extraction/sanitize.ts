import {
  emptyExtraction,
  LanguageCodeSchema,
  OnboardingExtractionSchema,
  type OnboardingExtraction,
} from '@pixel/contracts';

/*
 * Deja la extracción dentro de los límites del onboarding: textos recortados, listas sin
 * duplicados ni vacíos y con el máximo de cada campo, colores hexadecimales válidos y niveles 1–5.
 * Lo que no se puede arreglar se descarta (nunca se rellena con suposiciones).
 */

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text ? text.slice(0, max).trim() : null;
};

const cleanList = (values: unknown, maxItems: number, maxLength = 120): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const item = clean(value, maxLength)
      ?.replace(/^[-•*·\d.)\s]+/, '')
      .trim();
    if (!item) continue;
    const key = item.toLocaleLowerCase('es');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
};

/** "#abc", "abc123", "#AABBCC" → "#AABBCC"; otra cosa → null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1]!.length === 3 ? [...match[1]!].map((c) => c + c).join('') : match[1]!;
  return `#${hex.toUpperCase()}`;
}

const level = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(5, Math.max(1, Math.round(value)))
    : null;

export function sanitizeExtraction(raw: unknown): OnboardingExtraction {
  const parsed = OnboardingExtractionSchema.safeParse(raw);
  const x = parsed.success ? parsed.data : mergeLoose(raw);
  const colors: { hex: string; name: string | null }[] = [];
  for (const color of x.visual.colors) {
    const hex = normalizeHex(color.hex);
    if (hex && !colors.some((c) => c.hex === hex)) {
      colors.push({ hex, name: clean(color.name, 40) });
    }
    if (colors.length >= 8) break;
  }
  const language = LanguageCodeSchema.safeParse(x.communication.language);

  return {
    company: {
      name: clean(x.company.name, 120),
      industry: clean(x.company.industry, 80),
      description: clean(x.company.description, 2000),
      history: clean(x.company.history, 2000),
      origin: clean(x.company.origin, 200),
    },
    purpose: {
      mission: clean(x.purpose.mission, 2000),
      vision: clean(x.purpose.vision, 2000),
      purpose: clean(x.purpose.purpose, 2000),
      values: cleanList(x.purpose.values, 8),
    },
    audience: {
      targetAudience: clean(x.audience.targetAudience, 2000),
      needs: cleanList(x.audience.needs, 12),
      problems: cleanList(x.audience.problems, 12),
      characteristics: cleanList(x.audience.characteristics, 12),
    },
    personality: { attributes: cleanList(x.personality.attributes, 10) },
    communication: {
      tone: cleanList(x.communication.tone, 6),
      formality: level(x.communication.formality),
      energy: level(x.communication.energy),
      language: language.success ? language.data : null,
      wordsToUse: cleanList(x.communication.wordsToUse, 20),
      wordsToAvoid: cleanList(x.communication.wordsToAvoid, 20),
    },
    visual: {
      colors,
      styles: cleanList(x.visual.styles, 8),
      materials: cleanList(x.visual.materials, 10),
      shapes: cleanList(x.visual.shapes, 6),
      references: cleanList(x.visual.references, 10),
      recurringElements: cleanList(x.visual.recurringElements, 10),
      avoid: cleanList(x.visual.avoid, 10),
    },
    competition: {
      competitors: cleanList(x.competition.competitors, 10),
      differentiators: cleanList(x.competition.differentiators, 8),
    },
    creative: {
      likes: cleanList(x.creative.likes, 12),
      dislikes: cleanList(x.creative.dislikes, 12),
      visualReferences: cleanList(x.creative.visualReferences, 10),
      restrictions: cleanList(x.creative.restrictions, 12),
    },
    evidence: x.evidence
      .map((item) => ({
        field: clean(item.field, 60) ?? '',
        source: clean(item.source, 200) ?? '',
        quote: clean(item.quote, 240) ?? '',
      }))
      .filter((item) => item.field && item.quote)
      .slice(0, 60),
    notes: clean(x.notes, 1000),
  };
}

/** Si la forma no encaja del todo, toma lo que sí encaja bloque por bloque. */
function mergeLoose(raw: unknown): OnboardingExtraction {
  const base = emptyExtraction();
  if (!raw || typeof raw !== 'object') return base;
  const source = raw as Record<string, unknown>;
  const shape = OnboardingExtractionSchema.shape;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const block = shape[key].safeParse(source[key]);
    if (block.success) out[key] = block.data;
  }
  return out as OnboardingExtraction;
}

/** Cuántos campos trae la extracción (para el resumen). */
export function countFilled(extraction: OnboardingExtraction): number {
  let count = 0;
  const { evidence: _evidence, notes: _notes, ...steps } = extraction;
  for (const step of Object.values(steps)) {
    for (const value of Object.values(step as Record<string, unknown>)) {
      if (Array.isArray(value) ? value.length > 0 : value !== null && value !== '') count++;
    }
  }
  return count;
}
