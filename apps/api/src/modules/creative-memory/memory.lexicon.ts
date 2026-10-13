import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PLATFORM_LABELS,
  type ContentFormat,
  type ContentPlatform,
  type CreativeMemoryDimension,
  type CreativeMemoryKind,
  type CreativeMemoryPolarity,
} from '@pixel/contracts';
import { fold } from '../../ai/index.js';

/*
 * Léxico determinista de Creative Memory (docs/CREATIVE-MEMORY.md §4). Convierte lenguaje y
 * decisiones en CLAVES normalizadas `dimension:subject:polarity` sin llamar a la IA:
 * "evita las Stories", "no más historias" y quitar Stories de un plan son la misma clave
 * `format:story:avoid`. Lo que no está en el léxico se guarda como `other:<palabras>:…` solo si el
 * usuario lo pidió explícitamente.
 */

export interface MemorySubject {
  dimension: CreativeMemoryDimension;
  subject: string;
  /** Nombre visible ("Stories", "CTA de urgencia"). */
  label: string;
  /** Patrón sobre texto plegado (sin tildes, minúsculas). */
  pattern: string;
  format?: ContentFormat;
  platform?: ContentPlatform;
}

/** Nombre en plural para los enunciados ("Evitar Stories", "Prefiere carruseles"). */
const FORMAT_LABELS: Partial<Record<ContentFormat, string>> = {
  story: 'Stories',
  reel: 'Reels',
  carousel: 'carruseles',
  photo: 'fotos',
  short_video: 'videos cortos',
  long_video: 'videos largos',
  article: 'artículos',
  podcast: 'podcasts',
  newsletter: 'newsletters',
};

const FORMAT_PATTERNS: Partial<Record<ContentFormat, string>> = {
  // "Historia" suele ser narrativa (storytelling): solo cuentan las Stories explícitas.
  story: 'stor(?:y|ies)|historias de (?:instagram|ig)',
  reel: 'reels?',
  carousel: 'carrusel(?:es)?|carousels?',
  photo: 'fotos?|fotografias?',
  short_video: 'videos? cortos?|shorts',
  long_video: 'videos? largos?',
  article: 'articulos?',
  podcast: 'podcasts?',
  newsletter: 'newsletters?|boletin(?:es)?',
};

const PLATFORM_PATTERNS: Partial<Record<ContentPlatform, string>> = {
  instagram: 'instagram|insta',
  tiktok: 'tik ?tok',
  youtube: 'youtube',
  facebook: 'facebook',
  linkedin: 'linked ?in',
  x: 'twitter',
  blog: 'blog',
};

export const MEMORY_SUBJECTS: MemorySubject[] = [
  ...Object.entries(FORMAT_PATTERNS).map(([format, pattern]) => ({
    dimension: 'format' as const,
    subject: format,
    label: FORMAT_LABELS[format as ContentFormat] ?? CONTENT_FORMAT_LABELS[format as ContentFormat],
    pattern: pattern!,
    format: format as ContentFormat,
  })),
  ...Object.entries(PLATFORM_PATTERNS).map(([platform, pattern]) => ({
    dimension: 'platform' as const,
    subject: platform,
    label: CONTENT_PLATFORM_LABELS[platform as ContentPlatform],
    pattern: pattern!,
    platform: platform as ContentPlatform,
  })),
  {
    dimension: 'communication',
    subject: 'urgency',
    label: 'CTA de urgencia',
    pattern:
      'ctas? (?:de )?urgen\\w*|urgencias?|compra ya|ultimas unidades|no te lo pierdas|llamados? de urgencia',
  },
  {
    dimension: 'communication',
    subject: 'cta_soft',
    label: 'CTA suaves',
    pattern: 'ctas? suaves?|invitaciones? suaves?|llamados? suaves?',
  },
  {
    dimension: 'communication',
    subject: 'shouting',
    label: 'textos en mayúsculas',
    pattern: 'mayusculas|gritar|gritos',
  },
  {
    dimension: 'communication',
    subject: 'emojis',
    label: 'emojis',
    pattern: 'emojis?|emoticon\\w*',
  },
  { dimension: 'visual', subject: 'neon', label: 'neón', pattern: 'neon(?:es)?' },
  {
    dimension: 'visual',
    subject: 'dark_background',
    label: 'fondos oscuros',
    pattern: 'fondos? oscuros?|fondos? negros?',
  },
  {
    dimension: 'visual',
    subject: 'light_background',
    label: 'fondos claros',
    pattern: 'fondos? claros?|fondos? blancos?',
  },
  {
    dimension: 'visual',
    subject: 'warm_lighting',
    label: 'iluminación cálida',
    pattern: 'luz calida|luces calidas|iluminacion calida',
  },
  {
    dimension: 'content',
    subject: 'educational',
    label: 'contenido educativo',
    pattern: 'educativ\\w*|didactic\\w*',
  },
  {
    dimension: 'content',
    subject: 'talking_head',
    label: 'videos hablando a cámara',
    pattern: 'hablando a (?:la )?camara|a camara',
  },
  {
    dimension: 'content',
    subject: 'behind_scenes',
    label: 'contenido detrás de cámaras',
    pattern: 'detras de (?:camaras|escena)|behind the scenes',
  },
  {
    dimension: 'strategy',
    subject: 'promotions',
    label: 'promociones y descuentos',
    pattern: 'promociones?|descuentos?|ofertas?',
  },
  {
    dimension: 'workflow',
    subject: 'max_priorities',
    label: 'pocas prioridades al día',
    pattern:
      '(?:maximo|como mucho|no mas de|solo|maximo de)\\s+(?:\\d|uno|una|dos|tres|cuatro|cinco)\\s+prioridades',
  },
];

const BY_KEY = new Map(MEMORY_SUBJECTS.map((s) => [`${s.dimension}:${s.subject}`, s]));

export function subjectOf(dimension: string, subject: string): MemorySubject | null {
  return BY_KEY.get(`${dimension}:${subject}`) ?? null;
}

export const memoryKey = (
  dimension: CreativeMemoryDimension,
  subject: string,
  polarity: CreativeMemoryPolarity,
) => `${dimension}:${subject}:${polarity}`;

export function parseMemoryKey(key: string): {
  dimension: CreativeMemoryDimension;
  subject: string;
  polarity: CreativeMemoryPolarity;
} | null {
  const [dimension, subject, polarity] = key.split(':');
  if (!dimension || !subject || !polarity) return null;
  return {
    dimension: dimension as CreativeMemoryDimension,
    subject,
    polarity: polarity as CreativeMemoryPolarity,
  };
}

/** La clave contraria en el mismo tema (prefer ↔ avoid). `allow` es una excepción, no un contrario. */
export function oppositeKey(key: string): string | null {
  const parsed = parseMemoryKey(key);
  if (!parsed) return null;
  if (parsed.polarity === 'prefer') return memoryKey(parsed.dimension, parsed.subject, 'avoid');
  if (parsed.polarity === 'avoid') return memoryKey(parsed.dimension, parsed.subject, 'prefer');
  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
};

/** "máximo 3 prioridades" → 3. */
export function prioritiesValue(text: string): number | null {
  const match =
    /(?:maximo|como mucho|no mas de|solo|maximo de)\s+(\d|uno|una|dos|tres|cuatro|cinco)\s+prioridades/.exec(
      fold(text),
    );
  if (!match) return null;
  const raw = match[1]!;
  const value = /^\d$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? null);
  return value && value >= 1 && value <= 5 ? value : null;
}

/** Enunciado claro y accionable para una clave del léxico (nunca "le gusta lo elegante"). */
export function statementFor(
  subject: MemorySubject,
  polarity: CreativeMemoryPolarity,
  value: string | null = null,
): string {
  const { dimension, label } = subject;
  if (subject.subject === 'max_priorities') {
    return `Prefiere como máximo ${value ?? '3'} prioridades principales al día`;
  }
  if (polarity === 'allow') return `Se permite ${label} como excepción`;
  if (dimension === 'format') {
    return polarity === 'avoid'
      ? `Evitar ${label} salvo petición explícita`
      : `Prefiere ${label} cuando no se pide un formato concreto`;
  }
  if (dimension === 'platform') {
    return polarity === 'avoid'
      ? `Evitar publicar en ${label} salvo petición explícita`
      : `Prefiere publicar en ${label}`;
  }
  if (subject.subject === 'urgency') {
    return polarity === 'avoid'
      ? 'Evitar CTA de urgencia: preferir invitaciones suaves'
      : 'Acepta CTA de urgencia cuando la pieza lo pide';
  }
  return polarity === 'avoid' ? `Evitar ${label}` : `Prefiere ${label}`;
}

/** Tipo de memoria por dimensión y polaridad (enum pequeño, sin decenas de categorías). */
export function kindFor(
  dimension: CreativeMemoryDimension,
  polarity: CreativeMemoryPolarity,
): CreativeMemoryKind {
  if (polarity === 'allow') return 'exception';
  if (polarity === 'avoid' && (dimension === 'format' || dimension === 'platform')) return 'avoid';
  switch (dimension) {
    case 'communication':
      return 'communication_preference';
    case 'visual':
      return 'visual_preference';
    case 'workflow':
      return 'workflow_preference';
    case 'strategy':
    case 'campaign':
      return 'strategic_preference';
    default:
      return polarity === 'avoid' ? 'avoid' : 'preference';
  }
}

/* ---------- Polaridad de una frase ---------- */

const AVOID =
  /\b(?:evita|evitar|evitemos|no uses|no usar|no usemos|nunca|sin|no quiero|no queremos|no me gusta|no nos gusta|no vuelvas a|no volvamos a|deja de|dejemos de|nada de|no mas|menos|prohib\w*|no incluyas|no pongas)\b/;
const ALLOW =
  /\b(?:podemos usar|podemos poner|se puede usar|se permite|se permiten|permite|permitir|puedes usar|esta permitido|vale usar)\b/;

/** Polaridad de un tema mencionado en `t` (texto plegado) en la posición `index`. */
function polarityAt(t: string, index: number): CreativeMemoryPolarity {
  const before = t.slice(Math.max(0, index - 48), index);
  // "sí quiero usar" anula una negación anterior más lejana.
  const clause = before.split(/[,.;:]|\by\b|\bpero\b/).pop() ?? before;
  if (ALLOW.test(clause)) return 'allow';
  if (AVOID.test(clause)) return 'avoid';
  return 'prefer';
}

export interface ParsedMemory {
  subject: MemorySubject | null;
  dimension: CreativeMemoryDimension;
  subjectKey: string;
  polarity: CreativeMemoryPolarity;
  normalizedKey: string;
  statement: string;
  value: string | null;
}

const STOP = new Set(
  'de del la las el los para con por una uno unos unas que y en a al lo le les se nos me mi mis tu tus su sus es son ser muy mas siempre nunca ahora adelante desde recuerda recuerdes prefiero preferimos quiero queremos usa usar usemos evita evitar marca pixel normalmente favor porfa este esta estos estas como cuando'.split(
    ' ',
  ),
);

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);

/** Quita los marcadores de persistencia: "De ahora en adelante evita X" → "Evita X". */
export function cleanMemoryText(text: string): string {
  return capitalize(
    text
      .trim()
      .replace(/^(?:pixel[,:]?\s+)/i, '')
      .replace(
        /^(?:recuerda que|recuerda|recuerdalo|recuérdalo|ten en cuenta que|de ahora en adelante|desde ahora|a partir de ahora|para esta marca|en general)[,:]?\s+/i,
        '',
      )
      .replace(/^(?:de ahora en adelante|desde ahora|a partir de ahora)[,:]?\s+/i, '')
      .replace(/[.!?¡¿]+$/, '')
      .trim(),
  ).slice(0, 300);
}

/**
 * Lo que dice una instrucción de memoria: el primer tema del léxico y su polaridad, o, si no hay
 * ninguno, un tema libre (`other:<palabras>`). Devuelve null si no queda nada aprovechable.
 */
export function parseMemoryText(text: string): ParsedMemory | null {
  const t = fold(text);
  let best: { subject: MemorySubject; index: number } | null = null;
  for (const subject of MEMORY_SUBJECTS) {
    const match = new RegExp(`\\b(?:${subject.pattern})\\b`).exec(t);
    if (match && (!best || match.index < best.index)) best = { subject, index: match.index };
  }
  if (best) {
    const polarity = polarityAt(t, best.index);
    const value =
      best.subject.subject === 'max_priorities' ? String(prioritiesValue(text) ?? 3) : null;
    // "Prefiero CTA suaves" y "evita CTA de urgencia" son la misma preferencia.
    if (best.subject.subject === 'cta_soft' && polarity === 'prefer') {
      const urgency = subjectOf('communication', 'urgency')!;
      return {
        subject: urgency,
        dimension: 'communication',
        subjectKey: 'urgency',
        polarity: 'avoid',
        normalizedKey: memoryKey('communication', 'urgency', 'avoid'),
        statement: statementFor(urgency, 'avoid'),
        value: null,
      };
    }
    const effective: CreativeMemoryPolarity =
      best.subject.subject === 'max_priorities' ? 'prefer' : polarity;
    // Un segundo matiz de contenido se conserva en el enunciado ("carruseles educativos").
    const nuance = MEMORY_SUBJECTS.find(
      (other) =>
        other.dimension === 'content' &&
        other !== best!.subject &&
        new RegExp(`\\b(?:${other.pattern})\\b`).test(t),
    );
    const base = statementFor(best.subject, effective, value);
    return {
      subject: best.subject,
      dimension: best.subject.dimension,
      subjectKey: best.subject.subject,
      polarity: effective,
      normalizedKey: memoryKey(best.subject.dimension, best.subject.subject, effective),
      statement: nuance ? `${base} (${nuance.label})` : base,
      value,
    };
  }
  const cleaned = cleanMemoryText(text);
  const words = (fold(cleaned).match(/[a-z0-9ñ]+/g) ?? []).filter(
    (word) => word.length >= 4 && !STOP.has(word),
  );
  if (words.length === 0 || cleaned.length < 6) return null;
  const subjectKey = words.slice(0, 3).join('_').slice(0, 40);
  const polarity: CreativeMemoryPolarity = AVOID.test(fold(cleaned)) ? 'avoid' : 'prefer';
  return {
    subject: null,
    dimension: 'other',
    subjectKey,
    polarity,
    normalizedKey: memoryKey('other', subjectKey, polarity),
    statement: cleaned,
    value: null,
  };
}

/* ---------- Filtros (nunca se convierten en memoria) ---------- */

export type MemoryRejection = 'credentials' | 'sensitive' | 'factual';

const CREDENTIALS =
  /\b(?:contrasen\w*|password\w*|passwd|api ?keys?|tokens?|secret\w*|secreto\w*|credencial\w*|clave de acceso|pin)\b/;

/** Personal: fuera del dominio creativo y profesional (salud, sexualidad, religión, política…). */
const SENSITIVE =
  /\b(?:salud|diagnostic\w*|enfermedad\w*|depresion|ansiedad|terapia|psiquiatr\w*|psicolog\w*|medicament\w*|tratamiento medico|embaraz\w*|orientacion sexual|vida sexual|sexualidad|gay|lesbiana|bisexual|religion\w*|religios\w*|iglesia|catolic\w*|cristian\w*|musulman\w*|judi\w*|ateo|politic\w*|partido politico|votar|voto|etnia|raza|racial|indigena|afrodescendiente|deudas?|salario|sueldo|ingresos|cuenta bancaria|tarjeta de credito|antecedentes|condena|carcel|delito|criminal)\b/;

/**
 * Una memoria es una preferencia, nunca un hecho: "somos el café #1", "tenemos 20.000 clientes",
 * "cuesta $80.000" o "tenemos certificación X" requieren una fuente factual real.
 */
const FACTUAL = [
  /#\s?\d/,
  /\bn(?:umero|ro\.?)\s*(?:1|uno)\b/,
  /\b(?:somos|seremos|es|son)\s+(?:el|la|los|las)\s+(?:mejor(?:es)?|primer[oa]?s?|unic[oa]s?|lider(?:es)?|numero)\b/,
  /\blider(?:es)?\s+(?:del|de|en)\b/,
  /\bmas vendid\w*|\bvendemos mas\b/,
  /\b\d[\d.,]*\s*(?:clientes|usuarios|seguidores|ventas|tiendas|unidades|anos|empleados|%)/,
  /\bcertificad\w*|\bcertificacion\w*|\bpremiad\w*|\bpremios?\b/,
  /\$\s?\d|\bprecio\w*\b|\bcuesta\b|\bcuestan\b|\bvale\s+\d/,
];

export function memoryRejection(
  text: string,
  contextType: 'personal' | 'enterprise',
): MemoryRejection | null {
  const t = fold(text);
  if (CREDENTIALS.test(t)) return 'credentials';
  if (contextType === 'personal' && SENSITIVE.test(t)) return 'sensitive';
  if (FACTUAL.some((pattern) => pattern.test(t))) return 'factual';
  return null;
}

export const MEMORY_REJECTION_MESSAGES: Record<MemoryRejection, string> = {
  credentials:
    'Eso parece una contraseña, un token o una credencial: no lo guardo en la memoria creativa. Guárdalo en un lugar seguro.',
  sensitive:
    'Eso es información personal sensible y queda fuera de lo que Pixel recuerda: solo guardo preferencias creativas y de trabajo.',
  factual:
    'Eso es un dato sobre la marca (una cifra, un precio, un liderazgo o una certificación), no una preferencia creativa: no lo guardo como memoria. Para usarlo hace falta una fuente real en el ADN de la marca.',
};

/** Patrones de un tema (para buscarlo en hallazgos del Guardian o en textos). */
export function mentionsSubject(text: string, subject: MemorySubject): boolean {
  return new RegExp(`\\b(?:${subject.pattern})\\b`).test(fold(text));
}

export function subjectsIn(text: string): MemorySubject[] {
  const t = fold(text);
  return MEMORY_SUBJECTS.filter((subject) => new RegExp(`\\b(?:${subject.pattern})\\b`).test(t));
}
