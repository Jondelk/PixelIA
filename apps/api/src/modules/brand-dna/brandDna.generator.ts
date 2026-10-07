import {
  BRAND_ARCHETYPES,
  BrandDnaContentSchema,
  ENERGY_LEVELS,
  FORMALITY_LEVELS,
  LANGUAGES,
  type BrandArchetype,
  type BrandDnaContent,
  type BrandOnboarding,
} from '@pixel/contracts';
import {
  LEXICON,
  SHAPE_SIGNALS,
  STYLE_SHAPE_SIGNALS,
  lexiconKey,
  type PersonalityAxis,
} from './brandDna.lexicon.js';

/**
 * Generador determinístico de BrandDNA (sin IA). Mismas respuestas → mismo ADN.
 * Cambia esta versión si cambian las reglas: forzará una versión nueva del ADN.
 */
export const BRAND_DNA_GENERATOR_VERSION = 'rules-1';

const ARCHETYPE_ORDER = Object.keys(BRAND_ARCHETYPES) as BrandArchetype[];
const TONE_FACTOR = 0.5;

const round = (value: number, decimals = 0) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

/** ["a", "b", "c"] → "a, b y c". */
export function joinEs(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

const quote = (items: readonly string[]) => joinEs(items.map((item) => `«${item}»`));

// ---------- Personalidad y arquetipos ----------

interface Signal {
  label: string;
  weight: number;
}

function personalityTraits(attributes: string[]) {
  const n = attributes.length;
  return attributes.map((label, index) => ({
    label,
    weight: round(1 - (index / Math.max(n, 1)) * 0.5, 2),
    recognized: lexiconKey(label) in LEXICON,
  }));
}

function archetypeRanking(signals: Signal[]): BrandDnaContent['archetypes'] {
  const scores = new Map<BrandArchetype, { raw: number; signals: string[] }>();
  for (const signal of signals) {
    const entry = LEXICON[lexiconKey(signal.label)];
    if (!entry) continue;
    for (const [archetype, affinity] of Object.entries(entry.archetypes) as [
      BrandArchetype,
      number,
    ][]) {
      const current = scores.get(archetype) ?? { raw: 0, signals: [] };
      current.raw += affinity * signal.weight;
      if (!current.signals.includes(signal.label)) current.signals.push(signal.label);
      scores.set(archetype, current);
    }
  }

  const ranked = [...scores.entries()]
    .sort(
      ([a, x], [b, y]) => y.raw - x.raw || ARCHETYPE_ORDER.indexOf(a) - ARCHETYPE_ORDER.indexOf(b),
    )
    .slice(0, 5);

  if (ranked.length === 0) {
    const fallback = { id: 'everyman' as const, score: 100, signals: [] };
    return { primary: fallback, secondary: null, ranking: [fallback] };
  }

  const max = ranked[0]![1].raw;
  const ranking = ranked.map(([id, value]) => ({
    id,
    score: round((value.raw / max) * 100),
    signals: value.signals,
  }));
  const secondary = ranking[1] && ranking[1].score >= 40 ? ranking[1] : null;
  return { primary: ranking[0]!, secondary, ranking };
}

function personalityDimensions(
  signals: Signal[],
  communication: BrandOnboarding['communication'],
): BrandDnaContent['personality']['dimensions'] {
  const axes: PersonalityAxis[] = ['innovation', 'sophistication', 'warmth', 'playfulness'];
  const totals = Object.fromEntries(axes.map((axis) => [axis, { sum: 0, weight: 0 }])) as Record<
    PersonalityAxis,
    { sum: number; weight: number }
  >;

  for (const signal of signals) {
    const entry = LEXICON[lexiconKey(signal.label)];
    for (const [axis, delta] of Object.entries(entry?.axes ?? {}) as [PersonalityAxis, number][]) {
      totals[axis].sum += delta * signal.weight;
      totals[axis].weight += signal.weight;
    }
  }
  // La formalidad empuja la sofisticación (nivel 3 = neutral).
  totals.sophistication.sum += ((communication.formality - 3) / 2) * 0.5;
  totals.sophistication.weight += 0.5;

  const score = (axis: PersonalityAxis) => {
    const { sum, weight } = totals[axis];
    return weight === 0 ? 50 : round(clamp(50 + (sum / weight) * 50));
  };

  return {
    innovation: score('innovation'),
    sophistication: score('sophistication'),
    warmth: score('warmth'),
    playfulness: score('playfulness'),
    energy: (communication.energy - 1) * 25,
  };
}

// ---------- Comunicación ----------

function communicationBlock(c: BrandOnboarding['communication']): BrandDnaContent['communication'] {
  const language = LANGUAGES[c.language];
  const doList = [
    `Habla con un tono ${joinEs(c.tone)}.`,
    c.formality <= 2
      ? 'Tutea y usa un lenguaje cotidiano.'
      : c.formality === 3
        ? 'Equilibra cercanía y profesionalismo.'
        : 'Usa un registro cuidado y profesional; evita la jerga.',
    c.energy <= 2
      ? 'Comunica con calma: frases pausadas y sin exageraciones.'
      : c.energy === 3
        ? 'Mantén un ritmo equilibrado.'
        : 'Escribe con energía: frases cortas y verbos activos.',
    `Escribe en ${language.toLowerCase()}.`,
  ];
  if (c.wordsToUse.length) doList.push(`Incorpora palabras como ${quote(c.wordsToUse)}.`);

  const dontList = c.wordsToAvoid.length
    ? [`Evita palabras o estilos como ${quote(c.wordsToAvoid)}.`]
    : [];
  if (c.formality >= 4) dontList.push('No uses emojis ni expresiones coloquiales.');
  if (c.formality <= 2) dontList.push('No suenes acartonada ni corporativa.');

  return {
    tone: c.tone,
    formality: { level: c.formality, label: FORMALITY_LEVELS[c.formality - 1]! },
    energy: { level: c.energy, label: ENERGY_LEVELS[c.energy - 1]! },
    language: { code: c.language, name: language },
    vocabulary: { preferred: c.wordsToUse, avoid: c.wordsToAvoid },
    guidelines: { do: doList, dont: dontList },
  };
}

// ---------- Lenguaje visual ----------

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hsl([r, g, b]: [number, number, number]) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue =
    max === rn
      ? ((gn - bn) / delta) % 6
      : max === gn
        ? (bn - rn) / delta + 2
        : (rn - gn) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, saturation, lightness };
}

/** Luminancia relativa WCAG 2.x. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return round(0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b), 3);
}

type Temperature = 'warm' | 'cool' | 'neutral';

function isNeutral(hex: string): boolean {
  const { saturation, lightness } = hsl(hexToRgb(hex));
  // Grises, casi negros y blancos rotos (p. ej. #F5EFE6) funcionan como neutros.
  return saturation < 0.15 || lightness < 0.1 || lightness > 0.9;
}

function temperatureOf(hex: string): Temperature {
  if (isNeutral(hex)) return 'neutral';
  const { hue } = hsl(hexToRgb(hex));
  if (hue < 70 || hue >= 330) return 'warm';
  if (hue >= 150 && hue < 300) return 'cool';
  return 'neutral';
}

function palette(
  colors: BrandOnboarding['visual']['colors'],
): BrandDnaContent['visualLanguage']['palette'] {
  const chromaticRoles = ['primary', 'secondary', 'accent'] as const;
  const allNeutral = colors.every((color) => isNeutral(color.hex));
  let chromaticIndex = 0;

  return colors.map((color, index) => {
    const neutral = isNeutral(color.hex) && !(allNeutral && index === 0);
    const role = neutral ? 'neutral' : (chromaticRoles[chromaticIndex++] ?? 'support');
    return {
      hex: color.hex,
      name: color.name,
      role,
      temperature: temperatureOf(color.hex),
      luminance: luminance(hexToRgb(color.hex)),
    };
  });
}

function paletteTemperature(colors: BrandDnaContent['visualLanguage']['palette']): Temperature {
  let warm = 0;
  let cool = 0;
  for (const color of colors) {
    const weight = color.role === 'primary' ? 2 : 1;
    if (color.temperature === 'warm') warm += weight;
    if (color.temperature === 'cool') cool += weight;
  }
  if (warm === cool) return 'neutral';
  return warm > cool ? 'warm' : 'cool';
}

function shapeLanguage(
  visual: BrandOnboarding['visual'],
): BrandDnaContent['visualLanguage']['shapeLanguage'] {
  const votes = new Map<string, number>();
  const vote = (value: string | undefined, weight: number) => {
    if (value) votes.set(value, (votes.get(value) ?? 0) + weight);
  };
  for (const shape of visual.shapes) vote(SHAPE_SIGNALS[lexiconKey(shape)], 1);
  for (const style of visual.styles) vote(STYLE_SHAPE_SIGNALS[lexiconKey(style)], 0.5);

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (!first || (second && second[1] === first[1])) return 'mixed';
  return first[0] as BrandDnaContent['visualLanguage']['shapeLanguage'];
}

// ---------- Generador ----------

export function generateBrandDna(answers: BrandOnboarding): BrandDnaContent {
  const { company, purpose, audience, personality, communication, visual, competition, creative } =
    answers;

  const traits = personalityTraits(personality.attributes);
  const signals: Signal[] = [
    ...traits.map((trait) => ({ label: trait.label, weight: trait.weight })),
    ...communication.tone.map((label) => ({ label, weight: TONE_FACTOR })),
  ];

  const topTraits = personality.attributes.slice(0, 3);
  const essence =
    `${company.name} es una marca ${joinEs(topTraits)} de ${company.industry.toLocaleLowerCase('es')}` +
    (company.origin ? `, con origen en ${company.origin}` : '') +
    '.';

  const colors = palette(visual.colors);

  const dna: BrandDnaContent = {
    identity: {
      name: company.name,
      industry: company.industry,
      description: company.description,
      story: company.history,
      origin: company.origin,
      essence,
    },
    purpose: {
      mission: purpose.mission,
      vision: purpose.vision,
      purpose: purpose.purpose,
      values: purpose.values,
    },
    audience: {
      summary: audience.targetAudience,
      needs: audience.needs,
      problems: audience.problems,
      characteristics: audience.characteristics,
    },
    personality: {
      traits,
      dimensions: personalityDimensions(signals, communication),
    },
    archetypes: archetypeRanking(signals),
    communication: communicationBlock(communication),
    visualLanguage: {
      palette: colors,
      temperature: paletteTemperature(colors),
      styles: visual.styles,
      materials: visual.materials,
      shapes: visual.shapes,
      shapeLanguage: shapeLanguage(visual),
      references: visual.references,
      recurringElements: visual.recurringElements,
    },
    differentiators: {
      statements: competition.differentiators,
      competitors: competition.competitors,
    },
    creativePreferences: {
      likes: creative.likes,
      dislikes: creative.dislikes,
      visualReferences: creative.visualReferences,
    },
    restrictions: {
      creative: creative.restrictions,
      words: communication.wordsToAvoid,
      visual: visual.avoid,
    },
  };

  // Garantiza que el generador nunca produce un ADN fuera de contrato.
  return BrandDnaContentSchema.parse(dna);
}
