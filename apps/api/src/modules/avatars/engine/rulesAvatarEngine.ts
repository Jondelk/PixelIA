import {
  ANIMATION_PERSONALITY_LABELS,
  type AnimationPersonality,
  type AvatarConcept,
  type BrandArchetype,
  type BrandDnaContent,
  type IdleAnimation,
} from '@pixel/contracts';
import type { AvatarConceptEngine, AvatarConceptInput } from './AvatarConceptEngine.js';
import {
  ABSTRACT_SUBJECTS,
  ARCHETYPE_EPITHETS,
  ARCHETYPE_GUARDRAILS,
  ARCHETYPE_TRAITS,
  SUBJECTS,
  type SubjectDefinition,
} from './catalog.js';
import { describeColor, shade } from './colors.js';

/**
 * Motor de conceptos de avatar basado en reglas (sin IA).
 * Combina sector, historia, valores, público, estética, materiales, colores, personalidad,
 * arquetipo, preferencias y restricciones. Cada decisión queda justificada en `rationale`.
 */
export const RULES_ENGINE_VERSION = 'avatar-rules-1';

type Dna = BrandDnaContent;
type Decision = AvatarConcept['rationale']['decisions'][number];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;
const pick = <T>(items: readonly T[], variation: number): T => items[variation % items.length]!;
const unique = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLocaleLowerCase('es');
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
const article = (subject: SubjectDefinition, definite = true) =>
  definite ? (subject.feminine ? 'la' : 'el') : subject.feminine ? 'una' : 'un';
const joinEs = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "cafe" → coincide con el inicio de una palabra; "te " (con espacio) → palabra completa. */
function matches(text: string, keyword: string): boolean {
  const whole = keyword.endsWith(' ');
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}${whole ? '\\b' : ''}`).test(text);
}

// ---------- 1. Sujeto: qué es el personaje ----------

interface TextSource {
  path: string;
  label: string;
  weight: number;
  text: string;
}

function textSources(dna: Dna): TextSource[] {
  const src = (path: string, label: string, weight: number, values: (string | null)[]) => ({
    path,
    label,
    weight,
    text: normalize(values.filter(Boolean).join(' · ')),
  });
  return [
    src('identity.industry', 'el sector', 4, [dna.identity.industry]),
    src('identity.description', 'lo que ofrece', 2, [dna.identity.description]),
    src(
      'visualLanguage.recurringElements',
      'sus elementos visuales recurrentes',
      2.5,
      dna.visualLanguage.recurringElements,
    ),
    src('identity.story', 'su historia', 1.5, [dna.identity.story]),
    src('differentiators.statements', 'sus diferenciadores', 1, dna.differentiators.statements),
    src('visualLanguage.materials', 'sus materiales', 1, dna.visualLanguage.materials),
    src('purpose.values', 'sus valores', 0.5, [...dna.purpose.values, dna.purpose.purpose]),
    src('audience.summary', 'su público', 0.5, [dna.audience.summary, ...dna.audience.needs]),
    src(
      'creativePreferences.likes',
      'sus preferencias creativas',
      0.5,
      dna.creativePreferences.likes,
    ),
  ];
}

interface ScoredSubject {
  subject: SubjectDefinition;
  /** Mejor sujeto cuando este es una alternativa explorada al regenerar. */
  alternativeTo?: SubjectDefinition;
  score: number;
  /** Fuentes de texto que lo mencionan. */
  evidence: TextSource[];
  /** Afinidades estéticas y de personalidad que lo refuerzan. */
  affinities: { path: string; reason: string }[];
}

function isVetoed(subject: SubjectDefinition, dna: Dna): boolean {
  const forbidden = normalize(
    [
      ...dna.restrictions.visual,
      ...dna.restrictions.creative,
      ...dna.creativePreferences.dislikes,
    ].join(' · '),
  );
  return subject.vetoTerms.some((term) => matches(forbidden, term));
}

function affinities(subject: SubjectDefinition, dna: Dna): ScoredSubject['affinities'] {
  const result: ScoredSubject['affinities'] = [];
  const { shapeLanguage, temperature } = dna.visualLanguage;
  if (subject.shapeAffinity.includes(shapeLanguage)) {
    result.push({
      path: 'visualLanguage.shapeLanguage',
      reason: `su lenguaje de formas ${SHAPE_WORD[shapeLanguage]}`,
    });
  }
  if (subject.archetypeAffinity.includes(dna.archetypes.primary.id)) {
    result.push({
      path: 'archetypes.primary',
      reason: `su arquetipo ${ARCHETYPE_WORD[dna.archetypes.primary.id]}`,
    });
  } else if (
    dna.archetypes.secondary &&
    subject.archetypeAffinity.includes(dna.archetypes.secondary.id)
  ) {
    result.push({
      path: 'archetypes.secondary',
      reason: `sus matices de ${ARCHETYPE_WORD[dna.archetypes.secondary.id]}`,
    });
  }
  if (subject.temperature && subject.temperature === temperature) {
    result.push({
      path: 'visualLanguage.temperature',
      reason: `su paleta ${temperature === 'warm' ? 'cálida' : 'fría'}`,
    });
  }
  return result;
}

const AFFINITY_WEIGHT: Record<string, number> = {
  'visualLanguage.shapeLanguage': 1.5,
  'archetypes.primary': 1,
  'archetypes.secondary': 0.5,
  'visualLanguage.temperature': 0.5,
};

/** Sujetos candidatos ordenados. Un sujeto concreto necesita evidencia textual en el ADN. */
export function rankSubjects(dna: Dna): ScoredSubject[] {
  const sources = textSources(dna);
  const scored: ScoredSubject[] = [];
  for (const subject of SUBJECTS) {
    if (isVetoed(subject, dna)) continue;
    const evidence = sources.filter((source) =>
      subject.keywords.some((kw) => matches(source.text, kw)),
    );
    if (evidence.length === 0) continue;
    const affinity = affinities(subject, dna);
    const score =
      evidence.reduce((sum, source) => sum + source.weight, 0) +
      affinity.reduce((sum, a) => sum + (AFFINITY_WEIGHT[a.path] ?? 0), 0);
    scored.push({ subject, score, evidence, affinities: affinity });
  }
  return scored.sort((a, b) => b.score - a.score || a.subject.id.localeCompare(b.subject.id));
}

const MIN_CONCRETE_SCORE = 3;

/**
 * Elige el sujeto. Variación 0 = mejor ajuste. Las variaciones siguientes recorren las
 * alternativas viables (≥ 60 % del mejor) y la forma abstracta derivada de la estética.
 */
function chooseSubject(dna: Dna, variation: number): ScoredSubject {
  const ranked = rankSubjects(dna);
  const best = ranked[0];
  const abstractSubject: ScoredSubject = {
    subject: ABSTRACT_SUBJECTS[dna.visualLanguage.shapeLanguage],
    score: 0,
    evidence: [],
    affinities: [
      {
        path: 'visualLanguage.shapeLanguage',
        reason: `su lenguaje de formas ${SHAPE_WORD[dna.visualLanguage.shapeLanguage]}`,
      },
    ],
  };
  if (!best || best.score < MIN_CONCRETE_SCORE) return abstractSubject;
  const viable = ranked.filter(
    (candidate) => candidate.score >= best.score * 0.6 && candidate.score >= MIN_CONCRETE_SCORE,
  );
  const chosen = pick([...viable, abstractSubject], variation);
  return chosen.subject === best.subject ? chosen : { ...chosen, alternativeTo: best.subject };
}

// ---------- Vocabulario ----------

const SHAPE_WORD: Record<Dna['visualLanguage']['shapeLanguage'], string> = {
  organic: 'orgánico',
  geometric: 'geométrico',
  structural: 'estructural',
  fluid: 'fluido',
  soft: 'suave',
  mixed: 'mixto',
};

const ARCHETYPE_WORD: Record<BrandArchetype, string> = {
  creator: 'creador',
  caregiver: 'cuidador',
  explorer: 'explorador',
  sage: 'sabio',
  hero: 'heroico',
  magician: 'mago',
  rebel: 'rebelde',
  lover: 'amante de la belleza',
  jester: 'bufón',
  everyman: 'cercano',
  ruler: 'gobernante',
  innocent: 'inocente',
};

export const BODY_WORD: Record<AvatarConcept['bodyShape'], string> = {
  rounded: 'redondeada',
  oval: 'ovalada',
  teardrop: 'de gota',
  faceted: 'facetada',
  blocky: 'de bloque',
  capsule: 'de cápsula',
  organic_irregular: 'orgánica e irregular',
};

export const FINISH_WORD: Record<AvatarConcept['renderHints']['finish'], string> = {
  matte: 'mate',
  satin: 'satinado',
  glossy: 'brillante',
  metallic: 'metálico',
  clay: 'de arcilla',
  glass: 'de vidrio',
};

// ---------- 2. Cuerpo ----------

function body(dna: Dna, subject: SubjectDefinition) {
  const d = dna.personality.dimensions;
  const shapeLanguage = dna.visualLanguage.shapeLanguage;
  const { depth } = subject.proportions;
  let { width, height } = subject.proportions;
  let faceScale = 1;

  if (d.sophistication > 65) {
    height += 0.08;
    width -= 0.05;
  }
  if (d.warmth > 65) width += 0.05;
  if (d.playfulness > 60) faceScale += 0.15;
  if (dna.communication.formality.level >= 4) faceScale -= 0.1;

  const stance: AvatarConcept['proportions']['stance'] =
    shapeLanguage === 'structural' || dna.archetypes.primary.id === 'ruler'
      ? 'grounded'
      : shapeLanguage === 'fluid' || d.energy >= 75
        ? 'floating'
        : 'balanced';

  let roundness = subject.render.roundness;
  if (shapeLanguage === 'geometric' || shapeLanguage === 'structural') roundness -= 0.15;
  if (shapeLanguage === 'organic' || shapeLanguage === 'soft') roundness += 0.05;
  if (d.warmth > 65) roundness += 0.05;

  const bodyShape =
    subject.bodyShape === 'oval' && shapeLanguage === 'soft' ? 'rounded' : subject.bodyShape;

  return {
    bodyShape,
    proportions: {
      width: round2(clamp(width, 0.5, 1.5)),
      height: round2(clamp(height, 0.5, 1.5)),
      depth: round2(clamp(depth, 0.5, 1.5)),
      faceScale: round2(clamp(faceScale, 0.5, 1.5)),
      stance,
    },
    roundness: round2(clamp(roundness, 0, 1)),
  };
}

// ---------- 3. Rostro ----------

function face(dna: Dna) {
  const d = dna.personality.dimensions;
  const archetype = dna.archetypes.primary.id;
  type Face = Pick<AvatarConcept, 'faceStyle' | 'eyesStyle' | 'mouthStyle'> & { reason: string };

  const result: Face =
    (archetype === 'sage' || archetype === 'magician') && d.innovation >= 65 && d.warmth < 55
      ? {
          faceStyle: 'visor',
          eyesStyle: 'visor',
          mouthStyle: 'line',
          reason:
            'una marca innovadora y precisa se expresa mejor con un visor limpio que con rasgos caricaturescos',
        }
      : d.playfulness > 60 || archetype === 'jester'
        ? {
            faceStyle: 'expressive_cartoon',
            eyesStyle: 'round',
            mouthStyle: 'open_smile',
            reason: 'su lado lúdico pide gestos amplios y expresivos',
          }
        : d.warmth > 60
          ? {
              faceStyle: 'friendly_minimal',
              eyesStyle: d.playfulness > 50 ? 'crescent' : 'round',
              mouthStyle: d.energy > 55 ? 'smile' : 'soft_smile',
              reason: 'su cercanía se transmite con ojos amables y una sonrisa suave, sin exagerar',
            }
          : archetype === 'ruler' || dna.visualLanguage.shapeLanguage === 'structural'
            ? {
                faceStyle: 'minimal_geometric',
                eyesStyle: 'dot',
                mouthStyle: 'line',
                reason: 'su solidez se expresa con un rostro sobrio y geométrico',
              }
            : d.sophistication > 65
              ? {
                  faceStyle: 'sculpted',
                  eyesStyle: 'oval',
                  mouthStyle: 'soft_smile',
                  reason: 'su sofisticación pide rasgos esculpidos y contenidos',
                }
              : {
                  faceStyle: 'friendly_minimal',
                  eyesStyle: 'oval',
                  mouthStyle: 'soft_smile',
                  reason: 'un rostro sencillo y amable mantiene el foco en la marca',
                };
  return result;
}

// ---------- 4. Color ----------

function colors(dna: Dna, subject: SubjectDefinition) {
  const palette = dna.visualLanguage.palette;
  const byRole = (role: string) => palette.find((color) => color.role === role);
  const primary = byRole('primary') ?? palette[0]!;
  const secondary = byRole('secondary') ?? byRole('neutral') ?? null;
  const accent = byRole('accent') ?? byRole('support') ?? null;

  const named = (hex: string, name: string | null) => ({
    hex,
    name: describeColor(hex, name, subject.colorQualifiers),
  });
  const secondaryHex = secondary?.hex ?? shade(primary.hex, 0.45);
  const accentHex =
    accent?.hex ??
    (secondary && secondary !== primary ? shade(secondary.hex, -0.25) : shade(primary.hex, -0.35));

  return {
    primaryColor: named(primary.hex, primary.name),
    secondaryColor: named(secondaryHex, secondary?.name ?? null),
    accentColor: named(accentHex, accent?.name ?? null),
  };
}

// ---------- 5. Materiales y accesorios ----------

function finish(dna: Dna, subject: SubjectDefinition): AvatarConcept['renderHints']['finish'] {
  const text = normalize(
    [...dna.visualLanguage.materials, ...dna.visualLanguage.styles].join(' · '),
  );
  const has = (...terms: string[]) => terms.some((term) => matches(text, term));
  // El orden importa: arcilla solo si es uno de los dos materiales principales.
  const mainMaterials = normalize(dna.visualLanguage.materials.slice(0, 2).join(' · '));
  if (['barro', 'ceramic', 'arcilla'].some((term) => matches(mainMaterials, term))) return 'clay';
  if (
    has(
      'artesanal',
      'natural',
      'organic',
      'madera',
      'papel',
      'kraft',
      'tela',
      'concreto',
      'industrial',
      'brutalist',
    )
  )
    return 'matte';
  if (has('vidrio', 'cristal') && subject.render.archetype === 'crystal') return 'glass';
  if (has('metal', 'acero', 'aluminio')) return 'metallic';
  if (has('futurist', 'tecnolog', 'lujos') || dna.personality.dimensions.sophistication > 70)
    return 'glossy';
  return 'satin';
}

function materials(
  dna: Dna,
  subject: SubjectDefinition,
  chosenFinish: AvatarConcept['renderHints']['finish'],
) {
  return unique([
    subject.material,
    FINISH_WORD[chosenFinish],
    ...(dna.visualLanguage.shapeLanguage !== 'mixed'
      ? [SHAPE_WORD[dna.visualLanguage.shapeLanguage]]
      : []),
    ...dna.visualLanguage.materials,
  ]).slice(0, 6);
}

function avoidTerms(dna: Dna): string[] {
  return [...dna.restrictions.visual, ...dna.creativePreferences.dislikes].map(normalize);
}

function accessories(dna: Dna, subject: SubjectDefinition, variation: number): string[] {
  const d = dna.personality.dimensions;
  const minimal =
    dna.visualLanguage.styles.some((style) => normalize(style).startsWith('minimalist')) ||
    d.sophistication > 70 ||
    dna.communication.formality.level >= 4;
  const count = minimal ? 1 : d.playfulness > 60 ? 3 : 2;

  const subjectKeywords = subject.keywords;
  const recurring = dna.visualLanguage.recurringElements
    .filter((element) => !subjectKeywords.some((kw) => matches(normalize(element), kw)))
    .map((element) => `Detalle sutil de ${element.toLocaleLowerCase('es')}`);
  const origin = dna.identity.origin ? [`Guiño discreto a su origen: ${dna.identity.origin}`] : [];

  const pool = unique([...subject.accessoryIdeas, ...recurring, ...origin]);
  const forbidden = avoidTerms(dna);
  const allowed = pool.filter(
    (item) => !forbidden.some((term) => term.length > 3 && normalize(item).includes(term)),
  );
  if (allowed.length === 0) return [];
  const start = variation % allowed.length;
  return [...allowed.slice(start), ...allowed.slice(0, start)].slice(0, count);
}

// ---------- 6. Personalidad y comportamiento ----------

function personalityTraits(dna: Dna): string[] {
  const d = dna.personality.dimensions;
  const traits = [...ARCHETYPE_TRAITS[dna.archetypes.primary.id]];
  if (dna.archetypes.secondary) traits.push(ARCHETYPE_TRAITS[dna.archetypes.secondary.id][0]!);
  if (d.warmth > 70) traits.unshift('amable');
  if (dna.identity.origin) traits.push('orgulloso de su origen');
  if (d.energy >= 75 && !traits.includes('sereno')) traits.push('enérgico');
  if (d.playfulness < 30) traits.push('reservado');
  return unique(traits).slice(0, 5);
}

function animationPersonality(dna: Dna): AnimationPersonality {
  const d = dna.personality.dimensions;
  const archetype = dna.archetypes.primary.id;
  if (d.energy >= 75 && (archetype === 'hero' || archetype === 'rebel')) return 'bold_energetic';
  if (d.playfulness >= 65 || archetype === 'jester') return 'playful_bouncy';
  if (archetype === 'ruler' && dna.visualLanguage.shapeLanguage === 'structural')
    return 'calm_grounded';
  if (d.sophistication >= 70 && d.energy <= 50) return 'elegant_smooth';
  if ((archetype === 'sage' || archetype === 'magician') && d.innovation >= 65)
    return 'precise_efficient';
  if (archetype === 'sage' && d.energy <= 50) return 'wise_measured';
  if (d.warmth >= 60) return 'friendly_expressive';
  if (
    archetype === 'ruler' ||
    dna.visualLanguage.shapeLanguage === 'structural' ||
    d.energy <= 25
  ) {
    return 'calm_grounded';
  }
  return d.warmth >= 50 ? 'friendly_expressive' : 'calm_grounded';
}

export const IDLE: Record<AnimationPersonality, [IdleAnimation, IdleAnimation]> = {
  friendly_expressive: ['bounce', 'sway'],
  calm_grounded: ['breathe', 'sway'],
  precise_efficient: ['hover_spin', 'float'],
  playful_bouncy: ['bounce', 'pulse'],
  elegant_smooth: ['float', 'sway'],
  bold_energetic: ['pulse', 'bounce'],
  wise_measured: ['float', 'breathe'],
};

export const IDLE_DESCRIPTION: Record<IdleAnimation, string> = {
  bounce: 'Pequeños rebotes suaves, como quien espera con gusto la siguiente conversación.',
  sway: 'Se balancea con calma de lado a lado.',
  breathe: 'Respira lento: se expande y contrae levemente, firme en su sitio.',
  float: 'Flota con suavidad, subiendo y bajando unos milímetros.',
  hover_spin: 'Flota y gira despacio sobre su eje, preciso y atento.',
  pulse: 'Late con energía contenida, listo para actuar.',
};

export const GESTURES: Record<AnimationPersonality, string[]> = {
  friendly_expressive: [
    'inclina la cabeza al escuchar',
    'sonríe al empezar cada respuesta',
    'pequeños rebotes al enfatizar',
  ],
  calm_grounded: ['asiente despacio', 'pausas antes de las ideas importantes'],
  precise_efficient: ['gira levemente al cambiar de tema', 'destellos breves al dar datos'],
  playful_bouncy: ['salta al tener una idea', 'guiños', 'gestos amplios'],
  elegant_smooth: ['movimientos lentos y fluidos', 'mirada sostenida'],
  bold_energetic: ['se adelanta al enfatizar', 'gestos rápidos y decididos'],
  wise_measured: ['ojos entrecerrados al reflexionar', 'asiente con calma'],
};

function behavior(dna: Dna, personality: AnimationPersonality, variation: number) {
  const d = dna.personality.dimensions;
  const formality = dna.communication.formality.level;
  const animation = IDLE[personality][variation % 2]!;
  const pace = d.energy <= 35 ? 'slow' : d.energy <= 65 ? 'moderate' : 'lively';
  const paceWord = { slow: 'pausado', moderate: 'tranquilo y claro', lively: 'vivo y dinámico' }[
    pace
  ];
  return {
    idleBehavior: {
      animation,
      energy: round2(clamp(0.2 + (d.energy / 100) * 0.7, 0, 1)),
      description: IDLE_DESCRIPTION[animation],
    },
    speakingBehavior: {
      pace,
      gestures: GESTURES[personality],
      description: `Habla con un ritmo ${paceWord}${formality >= 4 ? ', con gestos contenidos' : formality <= 2 ? ', con gestos cercanos y naturales' : ''}, en tono ${joinEs(dna.communication.tone)}.`,
    },
    expressiveness: Math.round(
      clamp(0.35 * d.playfulness + 0.35 * d.warmth + 0.3 * d.energy - (formality - 3) * 8, 0, 100),
    ),
  } satisfies Pick<AvatarConcept, 'idleBehavior' | 'speakingBehavior' | 'expressiveness'>;
}

// ---------- 7. Palabras clave y límites ----------

function conceptAdjectives(dna: Dna): string[] {
  const d = dna.personality.dimensions;
  const solid =
    dna.archetypes.primary.id === 'ruler' || dna.visualLanguage.shapeLanguage === 'structural';
  const adjectives = [
    solid && 'sólido',
    d.warmth > 60 && 'cálido',
    d.playfulness > 60 && 'juguetón',
    !solid && d.sophistication > 65 && 'elegante',
    d.innovation > 65 && 'futurista',
    d.innovation < 35 && 'entrañable',
    d.energy > 65 && 'enérgico',
    d.energy < 35 && 'sereno',
  ].filter((value): value is string => Boolean(value));
  return unique([...adjectives, 'expresivo', 'cercano']).slice(0, 2);
}

function visualKeywords(
  dna: Dna,
  chosenFinish: AvatarConcept['renderHints']['finish'],
  traits: string[],
) {
  const temperature = { warm: 'cálido', cool: 'frío', neutral: 'neutro' }[
    dna.visualLanguage.temperature
  ];
  return unique([
    ...(dna.visualLanguage.shapeLanguage !== 'mixed'
      ? [SHAPE_WORD[dna.visualLanguage.shapeLanguage]]
      : []),
    temperature,
    ...dna.visualLanguage.styles.slice(0, 3),
    FINISH_WORD[chosenFinish],
    traits[0] ?? '',
  ]).slice(0, 8);
}

function avoid(dna: Dna): string[] {
  const derived = [ARCHETYPE_GUARDRAILS[dna.archetypes.primary.id]];
  if (dna.communication.formality.level >= 4) derived.push('Gestos exagerados o infantiles');
  return unique([
    ...dna.restrictions.visual,
    ...dna.creativePreferences.dislikes,
    ...derived,
  ]).slice(0, 8);
}

// ---------- 8. Razón creativa ----------

function subjectReason(chosen: ScoredSubject, dna: Dna): string {
  const { subject } = chosen;
  const shapeReason = joinEs(chosen.affinities.map((a) => a.reason));
  if (chosen.alternativeTo) {
    const best = chosen.alternativeTo;
    const why = chosen.evidence.length
      ? `que también aparece en ${joinEs(chosen.evidence.slice(0, 2).map((source) => source.label))}`
      : `derivada de ${shapeReason}`;
    return `Como alternativa ${best.feminine ? 'a la' : 'al'} ${best.label}, Pixel explora ${article(subject, false)} ${subject.label}, ${why}.`;
  }
  if (chosen.evidence.length === 0) {
    return `Ningún objeto concreto domina el ADN de ${dna.identity.name}, así que Pixel toma la forma de ${article(subject, false)} ${subject.label}, derivada de ${shapeReason}.`;
  }
  const evidence = chosen.evidence.slice(0, 3).map((source) => source.label);
  const reinforced = chosen.affinities.length ? `; lo refuerzan ${shapeReason}` : '';
  return `${capitalize(article(subject))} ${subject.label} aparece en ${joinEs(evidence)}${reinforced}.`;
}

export const FACE_WORD: Record<AvatarConcept['faceStyle'], string> = {
  friendly_minimal: 'amable y sencillo',
  expressive_cartoon: 'muy expresivo',
  minimal_geometric: 'sobrio y geométrico',
  visor: 'de visor',
  sculpted: 'esculpido y contenido',
};

// ---------- Motor ----------

function buildConcept(dna: Dna, variation: number): AvatarConcept {
  const chosen = chooseSubject(dna, variation);
  const { subject } = chosen;
  const shape = body(dna, subject);
  const faceSpec = face(dna);
  const palette = colors(dna, subject);
  const chosenFinish = finish(dna, subject);
  const traits = personalityTraits(dna);
  const motion = animationPersonality(dna);
  const actions = behavior(dna, motion, variation);
  const [adjA, adjB] = conceptAdjectives(dna);
  const epithet = pick(ARCHETYPE_EPITHETS[dna.archetypes.primary.id], variation);
  const dnaTraits = dna.personality.traits.slice(0, 3).map((trait) => trait.label);
  const materialList = materials(dna, subject, chosenFinish);

  const origin =
    dna.identity.origin && subject.avatarType === 'anthropomorphic_object'
      ? ` con raíces en ${dna.identity.origin},`
      : '';
  const concept =
    `${subject.phrase}${origin} ${subject.feminine ? 'convertida' : 'convertido'} en personaje 3D ${adjA} y ${adjB}. ` +
    `Su silueta ${BODY_WORD[shape.bodyShape]} y su acabado ${FINISH_WORD[chosenFinish]} expresan una marca ${joinEs(dnaTraits)}.`;

  const subjectSources = [
    ...chosen.evidence.map((source) => source.path),
    ...chosen.affinities.map((a) => a.path),
  ];
  const decisions: Decision[] = [
    {
      attribute: 'baseObject',
      value: subject.label,
      reason: subjectReason(chosen, dna),
      sources: subjectSources.length ? subjectSources : ['visualLanguage.shapeLanguage'],
    },
    {
      attribute: 'bodyShape',
      value: BODY_WORD[shape.bodyShape],
      reason: `La silueta ${BODY_WORD[shape.bodyShape]} con redondez ${Math.round(shape.roundness * 100)} % responde a su lenguaje de formas ${SHAPE_WORD[dna.visualLanguage.shapeLanguage]} y a una personalidad ${joinEs(dnaTraits)}.`,
      sources: ['visualLanguage.shapeLanguage', 'personality.traits', 'personality.dimensions'],
    },
    {
      attribute: 'faceStyle',
      value: faceSpec.faceStyle,
      reason: `Rostro elegido porque ${faceSpec.reason}.`,
      sources: ['personality.dimensions', 'archetypes.primary'],
    },
    {
      attribute: 'colors',
      value: `${palette.primaryColor.hex} · ${palette.secondaryColor.hex} · ${palette.accentColor.hex}`,
      reason: `El cuerpo usa el color principal de la marca (${palette.primaryColor.name}); el secundario y el acento salen de su paleta ${dna.visualLanguage.temperature === 'warm' ? 'cálida' : dna.visualLanguage.temperature === 'cool' ? 'fría' : 'neutra'}.`,
      sources: ['visualLanguage.palette', 'visualLanguage.temperature'],
    },
    {
      attribute: 'materials',
      value: materialList.join(', '),
      reason: `El acabado ${FINISH_WORD[chosenFinish]} viene de sus materiales y estilo (${joinEs([...dna.visualLanguage.materials, ...dna.visualLanguage.styles].slice(0, 4)) || 'su estilo'}).`,
      sources: ['visualLanguage.materials', 'visualLanguage.styles'],
    },
    {
      attribute: 'animationPersonality',
      value: ANIMATION_PERSONALITY_LABELS[motion],
      reason: `Se mueve de forma ${ANIMATION_PERSONALITY_LABELS[motion].toLocaleLowerCase('es')} por su arquetipo ${ARCHETYPE_WORD[dna.archetypes.primary.id]} y su energía comunicativa ${dna.communication.energy.label.toLocaleLowerCase('es')}.`,
      sources: ['archetypes.primary', 'communication.energy', 'personality.dimensions'],
    },
    {
      attribute: 'avoid',
      value: `${dna.restrictions.visual.length + dna.creativePreferences.dislikes.length} restricciones`,
      reason: 'Respeta lo que la marca pidió evitar y lo que contradice su arquetipo.',
      sources: ['restrictions.visual', 'creativePreferences.dislikes', 'archetypes.primary'],
    },
  ];

  const summary =
    `${subjectReason(chosen, dna)} ` +
    `La personalidad ${joinEs(dnaTraits)} se traduce en una silueta ${BODY_WORD[shape.bodyShape]}, materiales como ${joinEs(materialList.slice(0, 3))} y un rostro ${FACE_WORD[faceSpec.faceStyle]}; ` +
    `su arquetipo ${ARCHETYPE_WORD[dna.archetypes.primary.id]} define cómo se mueve y habla. ` +
    `Así, el personaje no es una mascota genérica: es ${dna.identity.name} hecha personaje.`;

  return {
    name: `${subject.short} ${epithet}`,
    avatarType: subject.avatarType,
    concept,
    baseObject: { id: subject.id, label: subject.label },
    bodyShape: shape.bodyShape,
    proportions: shape.proportions,
    faceStyle: faceSpec.faceStyle,
    eyesStyle: faceSpec.eyesStyle,
    mouthStyle: faceSpec.mouthStyle,
    ...palette,
    materials: materialList,
    accessories: accessories(dna, subject, variation),
    personalityTraits: traits,
    animationPersonality: motion,
    ...actions,
    visualKeywords: visualKeywords(dna, chosenFinish, traits),
    avoid: avoid(dna),
    rationale: { summary, decisions },
    renderHints: {
      archetype: subject.render.archetype,
      roundness: shape.roundness,
      finish: chosenFinish,
      surfaceDetail: subject.render.surfaceDetail,
    },
  };
}

export const rulesAvatarEngine: AvatarConceptEngine = {
  kind: 'deterministic',
  version: RULES_ENGINE_VERSION,
  async generate({ brandDna, variation }: AvatarConceptInput) {
    return buildConcept(brandDna, variation);
  },
};
