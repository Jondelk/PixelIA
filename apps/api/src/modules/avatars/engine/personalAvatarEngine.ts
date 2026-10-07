import {
  ANIMATION_PERSONALITY_LABELS,
  AVATAR_TYPE_LABELS,
  type AnimationPersonality,
  type AvatarConcept,
  type AvatarType,
  type BrandArchetype,
  type PersonalDnaContent,
} from '@pixel/contracts';
import { ARCHETYPE_GUARDRAILS, ARCHETYPE_TRAITS } from './catalog.js';
import { colorFamily, describeColor, shade } from './colors.js';
import {
  BODY_WORD,
  FACE_WORD,
  FINISH_WORD,
  GESTURES,
  IDLE,
  IDLE_DESCRIPTION,
  normalize,
} from './rulesAvatarEngine.js';

/**
 * PersonalAvatarConceptEngine: PersonalDNA → concepto de avatar (sourceType = personal).
 *
 * No es "profesión → objeto": el tipo de personaje sale de combinar profesión, roles, habilidades,
 * intereses, personalidad, estilo creativo, contenido y forma de trabajar; los colores salen de su
 * paleta (o de su estilo si no eligió colores), y sus restricciones vetan tipos, rostros y
 * accesorios. Nunca usa BrandDNA. Cada decisión queda justificada con rutas del PersonalDNA.
 */
export const PERSONAL_AVATAR_ENGINE_VERSION = 'personal-avatar-rules-1';

export interface PersonalAvatarConceptInput {
  /** ADN personal: la única fuente del concepto (nunca el onboarding crudo ni datos de marca). */
  personalDna: PersonalDnaContent;
  /** 0 = el concepto que mejor encaja; valores mayores exploran alternativas válidas. */
  variation: number;
}

export interface PersonalAvatarConceptEngine {
  readonly kind: 'deterministic' | 'ai';
  readonly version: string;
  generate(input: PersonalAvatarConceptInput): Promise<AvatarConcept>;
}

type Dna = PersonalDnaContent;
type Decision = AvatarConcept['rationale']['decisions'][number];
type Finish = AvatarConcept['renderHints']['finish'];

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
const joinEs = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);

/** "fotograf" coincide con el inicio de una palabra; "dj " (con espacio) → palabra completa. */
function matches(text: string, keyword: string): boolean {
  const whole = keyword.endsWith(' ');
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}${whole ? '\\b' : ''}`).test(text);
}

// ---------- 1. Señales del ADN ----------

interface Source {
  path: string;
  label: string;
  weight: number;
  text: string;
}

function sources(dna: Dna): Source[] {
  const src = (path: string, label: string, weight: number, values: (string | null)[]) => ({
    path,
    label,
    weight,
    text: normalize(values.filter(Boolean).join(' · ')),
  });
  const work = dna.workStyle;
  return [
    src('identity.professionalIdentity', 'tu profesión', 3, dna.identity.professionalIdentity),
    src('professionalProfile.roles', 'tus roles', 2, dna.professionalProfile.roles),
    src('professionalProfile.skills', 'tus habilidades', 1.5, dna.professionalProfile.skills),
    src('identity.interests', 'tus intereses', 1, dna.identity.interests),
    src('personality.traits', 'tu personalidad', 2, dna.personality.traits),
    src('creativeIdentity.styles', 'tu estilo visual', 2, dna.creativeIdentity.styles),
    src(
      'creativeIdentity.visualPreferences',
      'tus preferencias visuales',
      1,
      dna.creativeIdentity.visualPreferences,
    ),
    src('contentIdentity.themes', 'los temas de tu contenido', 1, dna.contentIdentity.themes),
    src(
      'contentIdentity.preferredFormats',
      'tus formatos',
      0.5,
      dna.contentIdentity.preferredFormats,
    ),
    src('contentIdentity.platforms', 'tus plataformas', 0.5, dna.contentIdentity.platforms),
    src('workStyle', 'tu forma de trabajar', 0.5, [
      ...work.preferredWorkTimes,
      ...work.planningStyle,
      ...work.executionStyle,
      ...work.focusStyle,
      ...work.productivityPreferences,
    ]),
  ];
}

type Axis = 'tech' | 'creative' | 'playful' | 'refined' | 'calm' | 'warm' | 'bold' | 'organic';

const AXIS_TERMS: Record<Axis, string[]> = {
  tech: [
    'tecnolog',
    'software',
    'program',
    'desarroll',
    'ingenier',
    'codigo',
    'digital',
    'futurist',
    'videojueg',
    'gamer',
    'gaming',
    'stream',
    'esport',
    'twitch',
    'web ',
    'app ',
    'automatiz',
    'ciberseg',
    'hardware',
    'inteligencia artificial',
  ],
  creative: [
    'creativ',
    'creador',
    'creadora',
    'disen',
    'ilustr',
    'arte ',
    'artist',
    'anim',
    'audiovisual',
    'cine',
    'video',
    'fotograf',
    'music',
    'escrit',
    'edicion',
    'experimental',
    'improvis',
    'direccion de arte',
  ],
  playful: [
    'divertid',
    'ludic',
    'colorid',
    'jueg',
    'videojueg',
    'humor',
    'espontane',
    'casual',
    'energetic',
    'energic',
    'meme',
    'reto',
  ],
  refined: [
    'minimalist',
    'elegant',
    'sofisticad',
    'editorial',
    'premium',
    'lujo',
    'lujos',
    'exclusiv',
    'cinematograf',
    'sobri',
    'espacio negativo',
  ],
  calm: [
    'seren',
    'tranquil',
    'calm',
    'silencio',
    'pausad',
    'reflexiv',
    'introvertid',
    'una cosa a la vez',
  ],
  warm: ['cercan', 'empatic', 'calid', 'amigabl', 'human', 'comunidad', 'amable', 'autentic'],
  bold: [
    'atrevid',
    'audaz',
    'direct',
    'urban',
    'disrupt',
    'rebeld',
    'energetic',
    'intens',
    'saturad',
  ],
  organic: ['organic', 'natural', 'artesanal', 'botanic', 'madera', 'sostenibl', 'tierra'],
};

/** Oficios de trato directo con personas: favorecen una figura humana estilizada. */
const HUMAN_FACING = [
  'consult',
  'mentor',
  'docent',
  'profesor',
  'abogad',
  'medic',
  'psicolog',
  'terapeut',
  'emprendedor',
  'emprendedora',
  'lider',
  'gerent',
  'comunicador',
  'comunicadora',
  'periodist',
  'speaker',
  'conferencist',
  'ventas',
  'marca personal',
  'coach',
];

interface Signals {
  axes: Record<Axis, number>;
  human: number;
  /** Fuentes que más pesan en cada eje (para justificar). */
  evidence: Record<Axis | 'human', Source[]>;
}

function signals(dna: Dna): Signals {
  const all = sources(dna);
  const axes = {
    tech: 0,
    creative: 0,
    playful: 0,
    refined: 0,
    calm: 0,
    warm: 0,
    bold: 0,
    organic: 0,
  };
  const evidence: Signals['evidence'] = {
    tech: [],
    creative: [],
    playful: [],
    refined: [],
    calm: [],
    warm: [],
    bold: [],
    organic: [],
    human: [],
  };
  for (const axis of Object.keys(AXIS_TERMS) as Axis[]) {
    for (const source of all) {
      if (AXIS_TERMS[axis].some((term) => matches(source.text, term))) {
        axes[axis] += source.weight;
        evidence[axis].push(source);
      }
    }
  }
  // La forma de comunicarse también es personalidad: energía alta = más audaz y lúdico; formalidad
  // alta = más contenido y refinado.
  const { energy, formality } = dna.communication;
  if (energy >= 4) {
    axes.bold += energy - 3;
    axes.playful += (energy - 3) * 0.5;
  }
  if (energy <= 2) axes.calm += 3 - energy;
  if (formality >= 4) axes.refined += formality - 3;

  let human = 0;
  for (const source of all.slice(0, 3)) {
    if (HUMAN_FACING.some((term) => matches(source.text, term))) {
      human += source.weight;
      evidence.human.push(source);
    }
  }
  return { axes, human, evidence };
}

// ---------- 2. Sujeto: qué tipo de personaje es ----------

interface ObjectDefinition {
  id: string;
  label: string;
  short: string;
  feminine: boolean;
  keywords: string[];
  /** Accesorio que lo hace reconocible (el renderer lo traduce a una pieza 3D). */
  accessory: string;
}

/** Objetos que pueden inspirar al personaje si aparecen con fuerza en el ADN. */
const OBJECTS: ObjectDefinition[] = [
  {
    id: 'camera',
    label: 'cámara',
    short: 'Obturador',
    feminine: true,
    keywords: ['fotograf', 'camara', 'retrat', 'videograf', 'filmmaker', 'cineast'],
    accessory: 'Lente de cámara al frente',
  },
  {
    id: 'headphones',
    label: 'auriculares de estudio',
    short: 'Eco',
    feminine: false,
    keywords: [
      'music',
      'podcast',
      'audio ',
      'audios',
      'sonid',
      'dj ',
      'stream',
      'twitch',
      'locu',
      'productor musical',
    ],
    accessory: 'Auriculares de estudio',
  },
  {
    id: 'reading_glasses',
    label: 'gafas de lectura',
    short: 'Folio',
    feminine: true,
    keywords: [
      'escrit',
      'autor',
      'autora',
      'lector',
      'lectura',
      'investig',
      'academ',
      'editor ',
      'editora',
    ],
    accessory: 'Gafas de lectura',
  },
  {
    id: 'sprout',
    label: 'brote',
    short: 'Brote',
    feminine: false,
    keywords: ['botanic', 'jardin', 'plantas', 'paisajis', 'agricult', 'huerta'],
    accessory: 'Hoja en la cabeza',
  },
];

const MIN_OBJECT_EVIDENCE = 3;

/** Dirección creativa/visual: se expresa con un accesorio (visor de encuadre), no con un tipo. */
const CREATIVE_DIRECTION = [
  'director creativo',
  'directora creativa',
  'direccion creativa',
  'direccion de arte',
  'director de arte',
  'directora de arte',
  'director de fotografia',
  'cineast',
  'filmmaker',
];

/** Epítetos para el nombre conceptual ("Obturador Sabio"); en masculino como el sustantivo. */
const EPITHETS: Record<BrandArchetype, [string, string]> = {
  creator: ['Creador', 'Inventor'],
  caregiver: ['Guardián', 'Anfitrión'],
  explorer: ['Explorador', 'Viajero'],
  sage: ['Sabio', 'Mentor'],
  hero: ['Valiente', 'Campeón'],
  magician: ['Visionario', 'Alquimista'],
  rebel: ['Rebelde', 'Disruptor'],
  lover: ['Esteta', 'Encantador'],
  jester: ['Chispa', 'Bromista'],
  everyman: ['Compañero', 'Cercano'],
  ruler: ['Maestro', 'Arquitecto'],
  innocent: ['Luminoso', 'Soñador'],
};

interface DetectedObject {
  object: ObjectDefinition;
  score: number;
  evidence: Source[];
}

function detectObject(dna: Dna): DetectedObject | null {
  const all = sources(dna);
  const found = OBJECTS.map((object) => {
    const evidence = all.filter((source) =>
      object.keywords.some((keyword) => matches(source.text, keyword)),
    );
    return { object, score: evidence.reduce((sum, source) => sum + source.weight, 0), evidence };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.object.id.localeCompare(b.object.id));
  return found[0] ?? null;
}

interface Candidate {
  type: AvatarType;
  score: number;
  /** Ejes (o el objeto) que lo justifican, para la razón creativa. */
  because: { path: string; label: string }[];
}

function forbiddenText(dna: Dna): string {
  return normalize([...dna.creativeIdentity.avoidVisuals, ...dna.restrictions].join(' · '));
}

/** Tipos que la persona descartó explícitamente en "estilos que debe evitar". */
const TYPE_VETO: Partial<Record<AvatarType, string[]>> = {
  stylized_human: ['humano', 'figura humana', 'realista', 'retrato de mi'],
  tech_character: ['tecnolog', 'futurist', 'robot', 'ciencia ficcion'],
  object_inspired: ['objeto', 'literal'],
  creative_companion: ['mascota', 'tierno'],
};

/** Las fuentes de más peso, sin repetir (para justificar con 2–3 rasgos distintos). */
function topSources(list: Source[], max = 3) {
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => b.weight - a.weight)
    .filter((source) => !seen.has(source.path) && Boolean(seen.add(source.path)))
    .slice(0, max)
    .map((source) => ({ path: source.path, label: source.label }));
}

function rankTypes(dna: Dna, s: Signals, object: DetectedObject | null): Candidate[] {
  const { axes } = s;
  const forbidden = forbiddenText(dna);
  const candidates: Candidate[] = [
    {
      type: 'tech_character',
      score: axes.tech + 0.2 * axes.bold,
      because: topSources(s.evidence.tech),
    },
    {
      type: 'creative_companion',
      score: 0.7 * axes.creative + axes.playful + 0.5 * axes.warm,
      because: topSources([...s.evidence.creative, ...s.evidence.playful]),
    },
    {
      type: 'stylized_human',
      score: s.human + 0.5 * axes.warm,
      because: topSources([...s.evidence.human, ...s.evidence.warm]),
    },
    {
      type: 'abstract_character',
      score: 0.6 * axes.refined + 0.6 * axes.calm + 0.3 * axes.organic,
      because: topSources([...s.evidence.refined, ...s.evidence.calm]),
    },
  ];
  if (object && object.score >= MIN_OBJECT_EVIDENCE) {
    candidates.push({
      type: 'object_inspired',
      score: object.score + 0.3 * (axes.refined + axes.creative),
      because: topSources(object.evidence),
    });
  }
  return candidates
    .filter((candidate) => candidate.score > 0 && candidate.because.length > 0)
    .filter(
      (candidate) => !(TYPE_VETO[candidate.type] ?? []).some((term) => matches(forbidden, term)),
    )
    .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
}

/** Variación 0 = mejor ajuste; las siguientes recorren las alternativas viables (≥ 60 %). */
function chooseType(
  ranked: Candidate[],
  variation: number,
): Candidate & { alternativeTo?: AvatarType } {
  const fallback: Candidate = {
    type: 'abstract_character',
    score: 0,
    because: [{ path: 'personality.traits', label: 'tu personalidad' }],
  };
  const best = ranked[0];
  if (!best || best.score < 1) return fallback;
  const viable = ranked.filter((candidate) => candidate.score >= best.score * 0.6);
  if (!viable.some((candidate) => candidate.type === 'abstract_character')) viable.push(fallback);
  const chosen = pick(viable, variation);
  return chosen.type === best.type ? chosen : { ...chosen, alternativeTo: best.type };
}

// ---------- 3. Forma ----------

interface Shape {
  subject: { id: string; label: string; short: string; feminine: boolean; phrase: string };
  bodyShape: AvatarConcept['bodyShape'];
  proportions: AvatarConcept['proportions'];
  render: Pick<AvatarConcept['renderHints'], 'archetype' | 'roundness' | 'surfaceDetail'>;
}

function shapeFor(type: AvatarType, s: Signals, dna: Dna, object: DetectedObject | null): Shape {
  const { axes } = s;
  const energetic = dna.communication.energy >= 4;
  const stance: AvatarConcept['proportions']['stance'] =
    axes.calm > axes.bold && !energetic ? 'grounded' : energetic ? 'floating' : 'balanced';
  const proportions = (width: number, height: number, depth: number, faceScale = 1) => ({
    width: round2(clamp(width, 0.5, 1.5)),
    height: round2(clamp(height, 0.5, 1.5)),
    depth: round2(clamp(depth, 0.5, 1.5)),
    faceScale: round2(clamp(faceScale - (dna.communication.formality >= 4 ? 0.1 : 0), 0.5, 1.5)),
    stance,
  });

  switch (type) {
    case 'stylized_human':
      return {
        subject: {
          id: 'stylized_figure',
          label: 'figura humana estilizada',
          short: 'Perfil',
          feminine: true,
          phrase: 'Una figura humana estilizada, sin rasgos realistas,',
        },
        bodyShape: 'capsule',
        proportions: {
          ...proportions(0.82, 1.22, 0.8),
          stance: stance === 'floating' ? 'balanced' : stance,
        },
        render: { archetype: 'capsule', roundness: 0.75, surfaceDetail: 'none' },
      };
    case 'tech_character':
      return {
        subject: {
          id: 'tech_core',
          label: 'núcleo tecnológico',
          short: 'Núcleo',
          feminine: false,
          phrase: 'Un núcleo tecnológico de líneas limpias',
        },
        bodyShape: 'blocky',
        proportions: proportions(1, 1.05, 0.85),
        render: { archetype: 'block', roundness: 0.3, surfaceDetail: 'panel_lines' },
      };
    case 'creative_companion': {
      const fluid = axes.calm >= axes.playful || axes.refined > axes.playful;
      return {
        subject: {
          id: 'creative_muse',
          label: 'compañero creativo',
          short: 'Ingenio',
          feminine: false,
          phrase: 'Un compañero creativo de formas suaves',
        },
        bodyShape: fluid ? 'teardrop' : 'rounded',
        proportions: proportions(1.05, 1, 0.95, axes.playful > 3 ? 1.12 : 1),
        render: { archetype: fluid ? 'drop' : 'blob', roundness: 0.9, surfaceDetail: 'none' },
      };
    }
    case 'object_inspired': {
      const item = object?.object ?? OBJECTS[0]!;
      const isCamera = item.id === 'camera';
      return {
        subject: {
          id: item.id,
          label: item.label,
          short: item.short,
          feminine: item.feminine,
          phrase: `${item.feminine ? 'Una' : 'Un'} ${item.label} reinterpretad${item.feminine ? 'a' : 'o'} con elegancia`,
        },
        bodyShape: isCamera ? 'blocky' : item.id === 'sprout' ? 'oval' : 'capsule',
        proportions: isCamera ? proportions(1.18, 0.86, 0.8) : proportions(0.9, 1.1, 0.85),
        render: {
          archetype: isCamera ? 'block' : item.id === 'sprout' ? 'seed' : 'capsule',
          roundness: isCamera ? 0.42 : 0.8,
          surfaceDetail: 'none',
        },
      };
    }
    default: {
      // abstract_character: facetado si domina lo preciso o tecnológico; fluido si domina la calma.
      const faceted = axes.tech + axes.bold > axes.calm + axes.organic;
      return {
        subject: {
          id: faceted ? 'faceted_form' : 'fluid_form',
          label: faceted ? 'forma facetada' : 'forma fluida',
          short: 'Trazo',
          feminine: true,
          phrase: faceted ? 'Una forma facetada y precisa' : 'Una forma fluida y serena',
        },
        bodyShape: faceted ? 'faceted' : 'teardrop',
        proportions: proportions(0.95, 1.08, 0.9),
        render: {
          archetype: faceted ? 'crystal' : 'drop',
          roundness: faceted ? 0.2 : 0.85,
          surfaceDetail: faceted ? 'facets' : 'none',
        },
      };
    }
  }
}

// ---------- 4. Rostro ----------

function face(type: AvatarType, s: Signals, dna: Dna) {
  const { axes } = s;
  const forbidden = forbiddenText(dna);
  const noCartoon = ['infantil', 'caricatur', 'tierno', 'cartoon'].some((term) =>
    matches(forbidden, term),
  );
  type Face = Pick<AvatarConcept, 'faceStyle' | 'eyesStyle' | 'mouthStyle'> & { reason: string };
  const result: Face =
    type === 'tech_character'
      ? {
          faceStyle: 'visor',
          eyesStyle: 'visor',
          mouthStyle: axes.warm > 2 ? 'soft_smile' : 'line',
          reason: 'un visor limpio expresa tu lado tecnológico sin caer en lo caricaturesco',
        }
      : axes.playful >= 4 && dna.communication.formality <= 2 && !noCartoon
        ? {
            faceStyle: 'friendly_minimal',
            eyesStyle: 'crescent',
            mouthStyle: 'grin',
            reason:
              'tu energía y tu humor piden un gesto vivo y cómplice, sin volverlo una caricatura infantil',
          }
        : axes.refined >= 3 && axes.refined >= axes.warm
          ? {
              faceStyle: 'sculpted',
              eyesStyle: 'oval',
              mouthStyle: axes.calm >= 2 ? 'soft_smile' : 'line',
              reason: 'tu estilo refinado pide rasgos esculpidos y contenidos',
            }
          : axes.warm >= 2
            ? {
                faceStyle: 'friendly_minimal',
                eyesStyle: 'round',
                mouthStyle: dna.communication.energy >= 4 ? 'smile' : 'soft_smile',
                reason: 'tu cercanía se transmite con ojos amables y una sonrisa sencilla',
              }
            : {
                faceStyle: 'minimal_geometric',
                eyesStyle: 'dot',
                mouthStyle: 'soft_smile',
                reason: 'un rostro sobrio deja que hablen tu trabajo y tu estilo',
              };
  return result;
}

// ---------- 5. Color y acabado ----------

/** Paletas de respaldo cuando la persona no eligió colores: salen de su estilo, no al azar. */
const STYLE_PALETTES: { terms: string[]; label: string; hexes: [string, string, string] }[] = [
  {
    terms: ['minimalist', 'editorial', 'elegant', 'sobri'],
    label: 'minimalista',
    hexes: ['#E9E6E0', '#2B2D33', '#B8A88A'],
  },
  {
    terms: ['tecnolog', 'futurist', 'digital'],
    label: 'tecnológico',
    hexes: ['#2F3A56', '#C9D3E6', '#5B8CFF'],
  },
  {
    terms: ['urban', 'experimental', 'colorid'],
    label: 'urbano',
    hexes: ['#2C2C34', '#F25C3B', '#F2C14E'],
  },
  {
    terms: ['organic', 'artesanal', 'natural'],
    label: 'orgánico',
    hexes: ['#A27B5C', '#E8DCC8', '#5E7D4F'],
  },
  {
    terms: ['cinematograf', 'oscur'],
    label: 'cinematográfico',
    hexes: ['#1F2229', '#8C8F99', '#D4A657'],
  },
];
const DEFAULT_PALETTE: [string, string, string] = ['#6E7685', '#D9DCE2', '#3E4A61'];

function mix(a: string, b: string): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const [ca, cb] = [channels(a), channels(b)];
  return `#${ca
    .map((c, i) =>
      Math.round((c + cb[i]!) / 2)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

function palette(dna: Dna) {
  const chosen = dna.creativeIdentity.colors;
  if (chosen.length > 0) {
    const [primary, secondary, accent] = chosen;
    const secondaryHex = secondary?.hex ?? shade(primary!.hex, 0.45);
    // Con dos colores, el acento es su punto medio (contrasta con ambos); con uno, un tono más oscuro.
    const accentHex =
      accent?.hex ?? (secondary ? mix(primary!.hex, secondary.hex) : shade(primary!.hex, -0.3));
    return {
      fromStyle: null,
      primaryColor: { hex: primary!.hex, name: describeColor(primary!.hex, primary!.name) },
      secondaryColor: {
        hex: secondaryHex,
        name: describeColor(secondaryHex, secondary?.name ?? null),
      },
      accentColor: { hex: accentHex, name: describeColor(accentHex, accent?.name ?? null) },
    };
  }
  // El primer estilo (o rasgo) que la persona eligió y tiene paleta asociada manda.
  const preset = [...dna.creativeIdentity.styles, ...dna.personality.traits]
    .map((value) => normalize(value))
    .map((value) => STYLE_PALETTES.find((item) => item.terms.some((term) => matches(value, term))))
    .find(Boolean);
  const [p, s2, a] = preset?.hexes ?? DEFAULT_PALETTE;
  return {
    fromStyle: preset?.label ?? null,
    primaryColor: { hex: p, name: describeColor(p, null) },
    secondaryColor: { hex: s2, name: describeColor(s2, null) },
    accentColor: { hex: a, name: describeColor(a, null) },
  };
}

function finish(type: AvatarType, s: Signals, dna: Dna): Finish {
  const { axes } = s;
  const text = normalize(
    [...dna.creativeIdentity.styles, ...dna.creativeIdentity.visualPreferences].join(' · '),
  );
  const forbidden = forbiddenText(dna);
  const has = (...terms: string[]) => terms.some((term) => matches(text, term));
  if (has('metal', 'industrial', 'acero')) return 'metallic';
  if (axes.organic > axes.tech && has('artesanal', 'barro', 'ceramic', 'arcilla')) return 'clay';
  if (type === 'tech_character' || has('futurist', 'tecnolog')) {
    return matches(forbidden, 'brill') ? 'satin' : 'glossy';
  }
  if (axes.refined >= 3 && axes.calm >= 2) return 'matte';
  if (axes.organic >= 2) return 'matte';
  return 'satin';
}

// ---------- 6. Accesorios ----------

function accessories(
  type: AvatarType,
  s: Signals,
  dna: Dna,
  object: DetectedObject | null,
  variation: number,
): string[] {
  const { axes } = s;
  const minimal = axes.refined >= 3 || dna.communication.formality >= 4;
  const count = minimal ? 1 : axes.playful >= 4 ? 3 : 2;
  const pool: string[] = [];
  if (object) pool.push(object.object.accessory);
  const identity = normalize(
    [
      ...dna.identity.professionalIdentity,
      ...dna.professionalProfile.roles,
      ...dna.professionalProfile.skills,
    ].join(' · '),
  );
  if (CREATIVE_DIRECTION.some((term) => matches(identity, term))) {
    pool.push('Visor de encuadre de director');
  }
  if (type === 'tech_character' || axes.tech >= 3) pool.push('Anillo orbital discreto');
  if (axes.creative >= 3 && !object) pool.push('Insignia con su color de acento');
  if (axes.warm >= 2 || axes.playful >= 3) pool.push('Insignia con su color de acento');

  const forbidden = forbiddenText(dna);
  const allowed = unique(pool).filter(
    (item) =>
      !normalize(item)
        .split(/\s+/)
        .some((word) => word.length > 4 && matches(forbidden, word)),
  );
  if (allowed.length === 0) return [];
  // El objeto que inspira al personaje siempre va primero; el resto rota al regenerar.
  const [first, ...rest] = allowed;
  if (!object || first !== object.object.accessory) {
    const start = variation % allowed.length;
    return [...allowed.slice(start), ...allowed.slice(0, start)].slice(0, count);
  }
  const start = rest.length ? variation % rest.length : 0;
  return [first, ...rest.slice(start), ...rest.slice(0, start)].slice(0, count);
}

// ---------- 7. Personalidad y movimiento ----------

const FALLBACK_ARCHETYPE: Record<AvatarType, BrandArchetype> = {
  tech_character: 'magician',
  creative_companion: 'creator',
  stylized_human: 'everyman',
  abstract_character: 'sage',
  object_inspired: 'creator',
  anthropomorphic_object: 'creator',
  creature: 'explorer',
  geometric_entity: 'sage',
  structural_character: 'ruler',
  organic_character: 'innocent',
};

function primaryArchetype(dna: Dna, type: AvatarType): BrandArchetype {
  return dna.personality.archetypes[0] ?? FALLBACK_ARCHETYPE[type];
}

function animationPersonality(type: AvatarType, s: Signals, dna: Dna): AnimationPersonality {
  const { axes } = s;
  const energy = dna.communication.energy;
  if (energy >= 4 && axes.bold >= axes.playful) return 'bold_energetic';
  if (energy >= 4 || axes.playful >= 4) return 'playful_bouncy';
  if (type === 'tech_character') return 'precise_efficient';
  if (axes.refined >= 3 && axes.calm >= 2) return 'elegant_smooth';
  if (axes.calm >= 2) return 'calm_grounded';
  if (axes.warm >= 2) return 'friendly_expressive';
  return primaryArchetype(dna, type) === 'sage' ? 'wise_measured' : 'calm_grounded';
}

function behavior(dna: Dna, s: Signals, motion: AnimationPersonality, variation: number) {
  const { energy, formality, tone } = dna.communication;
  const animation = IDLE[motion][variation % 2]!;
  const pace = energy <= 2 ? 'slow' : energy === 3 ? 'moderate' : 'lively';
  const paceWord = { slow: 'pausado', moderate: 'tranquilo y claro', lively: 'vivo y dinámico' }[
    pace
  ];
  const level = (energy - 1) / 4;
  return {
    idleBehavior: {
      animation,
      energy: round2(clamp(0.2 + level * 0.7, 0, 1)),
      description: IDLE_DESCRIPTION[animation],
    },
    speakingBehavior: {
      pace,
      gestures: GESTURES[motion],
      description: `Habla con un ritmo ${paceWord}${formality >= 4 ? ', con gestos contenidos' : formality <= 2 ? ', con gestos cercanos y naturales' : ''}${tone.length ? `, en tono ${joinEs(tone)}` : ''}.`,
    },
    expressiveness: Math.round(
      clamp(
        25 +
          level * 35 +
          Math.min(s.axes.playful, 5) * 5 +
          Math.min(s.axes.warm, 4) * 3 -
          (formality - 3) * 8,
        0,
        90,
      ),
    ),
  } satisfies Pick<AvatarConcept, 'idleBehavior' | 'speakingBehavior' | 'expressiveness'>;
}

function personalityTraits(dna: Dna, archetype: BrandArchetype): string[] {
  return unique([...dna.personality.traits.slice(0, 3), ...ARCHETYPE_TRAITS[archetype]]).slice(
    0,
    5,
  );
}

/** Los dos adjetivos de los ejes más fuertes del ADN. */
function conceptAdjectives(s: Signals): [string, string] {
  const { axes } = s;
  const candidates: [string, number, number][] = [
    ['sobrio', axes.refined, 3],
    ['preciso', axes.tech, 3],
    ['vibrante', axes.playful, 3],
    ['sereno', axes.calm, 2],
    ['cercano', axes.warm, 2],
    ['creativo', axes.creative, 3],
    ['audaz', axes.bold, 3],
    ['orgánico', axes.organic, 2],
  ];
  const adjectives = candidates
    .filter(([, score, min]) => score >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
  const [a, b] = unique([...adjectives, 'expresivo', 'auténtico']);
  return [a!, b!];
}

// ---------- 8. Razón creativa ----------

const TYPE_PHRASE: Record<AvatarType, string> = {
  stylized_human: 'una figura humana estilizada',
  creative_companion: 'un compañero creativo',
  abstract_character: 'un personaje abstracto',
  tech_character: 'un personaje tecnológico',
  object_inspired: 'un personaje inspirado en un objeto',
  anthropomorphic_object: 'un objeto antropomórfico',
  creature: 'una criatura',
  geometric_entity: 'una entidad geométrica',
  structural_character: 'un personaje estructural',
  organic_character: 'un personaje orgánico',
};

function typeReason(chosen: Candidate & { alternativeTo?: AvatarType }, shape: Shape): string {
  const labels = unique(chosen.because.map((item) => item.label));
  if (chosen.alternativeTo) {
    return `Como alternativa a ${TYPE_PHRASE[chosen.alternativeTo]}, Pixel explora ${TYPE_PHRASE[chosen.type]} (${shape.subject.label}), que también encaja con ${joinEs(labels)}.`;
  }
  if (chosen.type === 'object_inspired') {
    return `${capitalize(joinEs(labels))} apuntan a ${shape.subject.feminine ? 'la' : 'el'} ${shape.subject.label}; tu estilo decide cómo se interpreta, para que no sea un dibujo literal de tu oficio.`;
  }
  return `Pixel te ve como ${TYPE_PHRASE[chosen.type]}${TYPE_PHRASE[chosen.type].endsWith(shape.subject.label) ? '' : ` (${shape.subject.label})`}: es lo que mejor combina ${joinEs(labels)}.`;
}

// ---------- Motor ----------

function buildConcept(dna: Dna, variation: number): AvatarConcept {
  const s = signals(dna);
  const object = detectObject(dna);
  const chosen = chooseType(rankTypes(dna, s, object), variation);
  const type = chosen.type;
  const usedObject =
    type === 'object_inspired' || (object && object.score >= MIN_OBJECT_EVIDENCE) ? object : null;
  const shape = shapeFor(type, s, dna, object);
  const faceSpec = face(type, s, dna);
  const colors = palette(dna);
  const chosenFinish = finish(type, s, dna);
  const archetype = primaryArchetype(dna, type);
  const traits = personalityTraits(dna, archetype);
  const motion = animationPersonality(type, s, dna);
  const actions = behavior(dna, s, motion, variation);
  const [adjA, adjB] = conceptAdjectives(s);
  const epithet = pick(EPITHETS[archetype], variation);
  const dnaTraits = dna.personality.traits.slice(0, 3);
  const accessoryList = accessories(type, s, dna, usedObject, variation);
  const styles = dna.creativeIdentity.styles.slice(0, 3);

  const materialList = unique([
    FINISH_WORD[chosenFinish],
    ...styles,
    ...(s.axes.organic >= 2 ? ['texturas naturales'] : []),
    ...(s.axes.tech >= 3 ? ['superficies técnicas'] : []),
  ]).slice(0, 5);

  const concept =
    `${shape.subject.phrase}, convertid${shape.subject.feminine ? 'a' : 'o'} en personaje 3D ${adjA} y ${adjB}. ` +
    `Su silueta ${BODY_WORD[shape.bodyShape]} y su acabado ${FINISH_WORD[chosenFinish]} expresan tu personalidad${dnaTraits.length ? `: ${joinEs(dnaTraits)}` : ''}.`;

  const sourcesOf = (items: { path: string }[], fallback: string) => {
    const paths = unique(items.map((item) => item.path));
    return paths.length ? paths : [fallback];
  };
  const colorReason = colors.fromStyle
    ? `No elegiste colores, así que salen de tu estilo ${colors.fromStyle}: ${colors.primaryColor.name}, ${colors.secondaryColor.name} y ${colors.accentColor.name}.`
    : `El cuerpo usa tu color principal, ${colors.primaryColor.name}; el secundario y el acento salen de tu paleta.`;

  const decisions: Decision[] = [
    {
      attribute: 'avatarType',
      value: AVATAR_TYPE_LABELS[type],
      reason: typeReason(chosen, shape),
      sources: sourcesOf(chosen.because, 'personality.traits'),
    },
    {
      attribute: 'bodyShape',
      value: BODY_WORD[shape.bodyShape],
      reason: `La silueta ${BODY_WORD[shape.bodyShape]} con redondez ${Math.round(shape.render.roundness * 100)} % responde a tu personalidad (${joinEs(dnaTraits) || 'sin rasgos definidos'}) y a tu estilo (${joinEs(styles) || 'sin estilos definidos'}).`,
      sources: ['personality.traits', 'creativeIdentity.styles'],
    },
    {
      attribute: 'faceStyle',
      value: faceSpec.faceStyle,
      reason: `Rostro elegido porque ${faceSpec.reason}.`,
      sources: ['personality.traits', 'communication.formality', 'creativeIdentity.avoidVisuals'],
    },
    {
      attribute: 'colors',
      value: `${colors.primaryColor.hex} · ${colors.secondaryColor.hex} · ${colors.accentColor.hex}`,
      reason: colorReason,
      sources: colors.fromStyle ? ['creativeIdentity.styles'] : ['creativeIdentity.colors'],
    },
    {
      attribute: 'materials',
      value: materialList.join(', '),
      reason: `El acabado ${FINISH_WORD[chosenFinish]} sale de tu estilo visual y tus preferencias (${joinEs([...styles, ...dna.creativeIdentity.visualPreferences].slice(0, 4)) || 'tu forma de ver'}).`,
      sources: ['creativeIdentity.styles', 'creativeIdentity.visualPreferences'],
    },
    {
      attribute: 'animationPersonality',
      value: ANIMATION_PERSONALITY_LABELS[motion],
      reason: `Movimiento ${ANIMATION_PERSONALITY_LABELS[motion].toLocaleLowerCase('es')}: lo marcan tu energía al comunicar (${dna.communication.energy}/5) y tu forma de trabajar.`,
      sources: ['communication.energy', 'personality.traits', 'workStyle'],
    },
    {
      attribute: 'avoid',
      value: `${dna.creativeIdentity.avoidVisuals.length} restricciones`,
      reason: 'Respeta lo que pediste evitar y nunca parece una mascota infantil ni genérica.',
      sources: ['creativeIdentity.avoidVisuals', 'restrictions'],
    },
  ];
  if (accessoryList.length > 0) {
    const viewfinder = accessoryList.some((item) => item.startsWith('Visor de encuadre'));
    const reasons = [
      usedObject &&
        `${capitalize(usedObject.object.accessory.toLocaleLowerCase('es'))}: un guiño a ${joinEs(unique(usedObject.evidence.slice(0, 2).map((item) => item.label)))}, sin convertirlo en disfraz.`,
      viewfinder && 'El visor de encuadre señala tu papel de dirección creativa y visual.',
    ].filter((value): value is string => Boolean(value));
    decisions.push({
      attribute: 'accessories',
      value: accessoryList.join(', '),
      reason: reasons.length
        ? reasons.join(' ')
        : 'Accesorios mínimos que refuerzan tu personalidad sin recargar al personaje.',
      sources: unique([
        ...(usedObject ? sourcesOf(usedObject.evidence, 'identity.professionalIdentity') : []),
        ...(viewfinder ? ['identity.professionalIdentity', 'professionalProfile.roles'] : []),
        ...(reasons.length ? [] : ['personality.traits']),
      ]),
    });
  }

  const name = dna.identity.name;
  const summary =
    `${typeReason(chosen, shape)} ` +
    `Tu personalidad${dnaTraits.length ? ` (${joinEs(dnaTraits)})` : ''} se traduce en una silueta ${BODY_WORD[shape.bodyShape]}, un acabado ${FINISH_WORD[chosenFinish]} y un rostro ${FACE_WORD[faceSpec.faceStyle]}; ` +
    `tu energía al comunicar define cómo se mueve y habla. ` +
    `No es una mascota genérica: es la versión creativa de ${name}.`;

  const avoidList = unique([
    ...dna.creativeIdentity.avoidVisuals,
    'Estética infantil o de mascota genérica',
    ARCHETYPE_GUARDRAILS[archetype],
    ...(dna.communication.formality >= 4 ? ['Gestos exagerados'] : []),
  ]).slice(0, 8);

  return {
    name: `${shape.subject.short} ${epithet}`,
    avatarType: type,
    concept,
    baseObject: { id: shape.subject.id, label: shape.subject.label },
    bodyShape: shape.bodyShape,
    proportions: shape.proportions,
    faceStyle: faceSpec.faceStyle,
    eyesStyle: faceSpec.eyesStyle,
    mouthStyle: faceSpec.mouthStyle,
    primaryColor: colors.primaryColor,
    secondaryColor: colors.secondaryColor,
    accentColor: colors.accentColor,
    materials: materialList,
    accessories: accessoryList,
    personalityTraits: traits,
    animationPersonality: motion,
    ...actions,
    visualKeywords: unique([
      AVATAR_TYPE_LABELS[type].toLocaleLowerCase('es'),
      ...styles,
      FINISH_WORD[chosenFinish],
      colorFamily(colors.primaryColor.hex),
      traits[0] ?? '',
    ]).slice(0, 8),
    avoid: avoidList,
    rationale: { summary, decisions },
    renderHints: {
      archetype: shape.render.archetype,
      roundness: shape.render.roundness,
      finish: chosenFinish,
      surfaceDetail: shape.render.surfaceDetail,
    },
  };
}

export const personalAvatarEngine: PersonalAvatarConceptEngine = {
  kind: 'deterministic',
  version: PERSONAL_AVATAR_ENGINE_VERSION,
  async generate({ personalDna, variation }: PersonalAvatarConceptInput) {
    return buildConcept(personalDna, variation);
  },
};
