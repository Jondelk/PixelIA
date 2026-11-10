import type { BrandDna } from '@pixel/contracts';
import { z } from 'zod';

/*
 * Léxico de estilos del Brand Guardian. Cada familia agrupa palabras que empujan una propuesta hacia
 * un registro (frío/tecnológico, lujo, grandilocuencia, infantil, rústico, innovación, genérico).
 * Si una familia CHOCA con una marca no depende de la palabra, sino del ADN: "neón y hologramas"
 * choca con una marca cálida y artesanal, no con una tecnológica; "lujo aspiracional" choca con una
 * marca accesible y precisa. Lo usan el evaluador de dirección visual (determinista) y la evaluación
 * semántica demo / de respaldo.
 */

export type StyleFamily =
  'cold_tech' | 'luxury' | 'hype' | 'childish' | 'rustic' | 'innovation' | 'generic';

export const STYLE_FAMILIES: Record<StyleFamily, string[]> = {
  cold_tech: [
    'cyberpunk',
    'futurista',
    'futurismo',
    'holograma',
    'hologramas',
    'neon',
    'cromado',
    'chrome',
    'metalico',
    'metalicos',
    'frio',
    'fria',
    'robot',
    'robotico',
    'glitch',
    'sintetico',
  ],
  luxury: [
    'lujo',
    'lujoso',
    'lujosa',
    'exclusivo',
    'exclusiva',
    'glamour',
    'aspiracional',
    'elite',
    'vip',
    'opulento',
  ],
  hype: [
    'disruptivo',
    'disruptiva',
    'revolucionario',
    'revolucionaria',
    'epico',
    'epica',
    'brutal',
    'explosivo',
    'increible',
    'magico',
    'alucinante',
  ],
  childish: ['infantil', 'caricatura', 'kawaii', 'tierno', 'dibujos'],
  rustic: ['rustico', 'rustica', 'rusticas', 'vintage', 'campestre', 'barro', 'kraft'],
  innovation: [
    'innovador',
    'innovadora',
    'innovacion',
    'moderno',
    'moderna',
    'vanguardia',
    'disruptivo',
    'disruptiva',
  ],
  generic: [
    'innovador',
    'innovadora',
    'moderno',
    'moderna',
    'disruptivo',
    'disruptiva',
    'soluciones',
    'calidad',
    'vanguardia',
    'transformar',
    'futuro',
    'conectar',
    'experiencia',
  ],
};

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const wordList = (text: string) =>
  fold(text)
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);

/** Palabras de una familia presentes en el texto. */
export function familyHits(text: string, family: StyleFamily): string[] {
  const words = new Set(wordList(text));
  return [...new Set(STYLE_FAMILIES[family].filter((word) => words.has(word)))];
}

/** Perfil compacto del ADN que necesita el léxico (contexto controlado: no el ADN completo). */
export const GuardianBrandProfileSchema = z.object({
  archetype: z.string(),
  temperature: z.enum(['warm', 'cool', 'neutral']),
  shapeLanguage: z.string(),
  innovation: z.number(),
  sophistication: z.number(),
  playfulness: z.number(),
  energy: z.number(),
  warmth: z.number(),
  formality: z.number(),
  traits: z.array(z.string()),
});
export type GuardianBrandProfile = z.infer<typeof GuardianBrandProfileSchema>;

export function brandProfileOf(dna: BrandDna): GuardianBrandProfile {
  return {
    archetype: dna.archetypes.primary.id,
    temperature: dna.visualLanguage.temperature,
    shapeLanguage: dna.visualLanguage.shapeLanguage,
    innovation: dna.personality.dimensions.innovation,
    sophistication: dna.personality.dimensions.sophistication,
    playfulness: dna.personality.dimensions.playfulness,
    energy: dna.personality.dimensions.energy,
    warmth: dna.personality.dimensions.warmth,
    formality: dna.communication.formality.level,
    traits: dna.personality.traits.map((trait) => trait.label),
  };
}

/** ¿Choca la familia con esta marca? Devuelve el motivo (rasgo del ADN) o null. */
export function familyClash(
  family: StyleFamily,
  profile: GuardianBrandProfile,
): { reason: string; prefixes: string[] } | null {
  const dims = profile;
  const traits = profile.traits.map(fold).join(' ');
  const archetype = profile.archetype;
  switch (family) {
    case 'cold_tech':
      return profile.temperature === 'warm' ||
        dims.innovation < 45 ||
        ['organic', 'soft'].includes(profile.shapeLanguage)
        ? {
            reason: 'su lenguaje visual es cálido y orgánico',
            prefixes: ['BRAND_TEMPERATURE', 'BRAND_MATERIAL', 'BRAND_STYLE'],
          }
        : null;
    case 'luxury':
      return dims.sophistication < 60 && !/sofistic|exclusiv|premium|luj|elegan/.test(traits)
        ? {
            reason: 'es una marca accesible, no aspiracional',
            prefixes: ['BRAND_DIMENSION', 'BRAND_TRAIT', 'BRAND_DIFFERENTIATOR'],
          }
        : null;
    case 'hype':
      return ['sage', 'ruler', 'caregiver', 'innocent', 'everyman', 'creator'].includes(
        archetype,
      ) ||
        profile.formality >= 4 ||
        dims.energy < 50
        ? {
            reason:
              archetype === 'sage' || archetype === 'creator' || archetype === 'ruler'
                ? 'comunica con precisión y evidencia, no con grandilocuencia'
                : 'comunica desde la cercanía y la calma, no desde la grandilocuencia',
            prefixes: ['BRAND_ARCHETYPE', 'BRAND_TONE', 'BRAND_TRAIT'],
          }
        : null;
    case 'childish':
      return dims.playfulness < 40
        ? {
            reason: 'su personalidad es seria, no lúdica',
            prefixes: ['BRAND_DIMENSION', 'BRAND_TRAIT'],
          }
        : null;
    case 'rustic':
      return dims.innovation > 65 && profile.temperature !== 'warm'
        ? {
            reason: 'su lenguaje visual es técnico y preciso',
            prefixes: ['BRAND_MATERIAL', 'BRAND_STYLE', 'BRAND_TRAIT'],
          }
        : null;
    case 'innovation':
      return dims.innovation < 40 || /tradicional/.test(traits)
        ? {
            reason: 'es una marca tradicional: su valor está en el oficio, no en la novedad',
            prefixes: ['BRAND_TRAIT', 'BRAND_DIMENSION', 'BRAND_DIFFERENTIATOR'],
          }
        : null;
    case 'generic':
      return null;
  }
}

/**
 * Señales propias de la marca (rasgos, valores, diferenciadores, origen, materiales, palabras que
 * usa), como prefijos de 5 letras para tolerar variaciones ("iterativa" ~ "iteraciones"). Sin el
 * nombre de la marca ni la categoría: todo lo de la categoría los comparte.
 */
export function brandSignalSources(dna: BrandDna): string[] {
  return [
    ...dna.personality.traits.map((trait) => trait.label),
    ...dna.purpose.values,
    ...dna.differentiators.statements,
    dna.identity.origin ?? '',
    dna.identity.essence,
    ...dna.visualLanguage.materials,
    ...dna.communication.vocabulary.preferred,
  ];
}

export function brandSignals(sources: string[], excludedText: string): Map<string, string> {
  const excluded = new Set(wordList(excludedText).map((w) => w.slice(0, 5)));
  const signals = new Map<string, string>();
  for (const source of sources) {
    for (const word of wordList(source)) {
      if (word.length < 5) continue;
      const key = word.slice(0, 5);
      if (!excluded.has(key) && !signals.has(key)) signals.set(key, source);
    }
  }
  return signals;
}

/** Palabras corrientes que no son señal de marca aunque compartan raíz ("semana" ≈ "semanal"). */
const COMMON_WORDS = new Set([
  'semana',
  'semanas',
  'proxima',
  'proximo',
  'nuevo',
  'nueva',
  'nuevos',
  'nuevas',
  'mismo',
  'misma',
  'marca',
  'producto',
  'productos',
  'campana',
  'contenido',
  'lanzar',
  'lanzamiento',
]);

/** Palabras del texto que son señales propias de la marca. */
export function signalsIn(text: string, signals: Map<string, string>): string[] {
  const found = new Set<string>();
  for (const word of wordList(text)) {
    if (word.length >= 5 && !COMMON_WORDS.has(word) && signals.has(word.slice(0, 5)))
      found.add(word);
  }
  return [...found];
}
