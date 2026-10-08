import {
  CONTENT_FORMAT_LABELS,
  CONTENT_PLAN_MAX_FREQUENCY,
  CONTENT_PLATFORM_LABELS,
  type ContentFormat,
  type ContentPlatform,
} from '@pixel/contracts';

/*
 * Reglas puras del Content Planner: mapeos del ADN (texto libre) a los enums de ContentItem,
 * frecuencia, fechas del periodo y la verificación de FUNDAMENTO de lo que propone el modelo.
 *
 * Fundamento: una idea creativa usa palabras nuevas, así que no se exige que todo esté en el ADN
 * (como sí hace el enriquecimiento del PersonalDNA). Lo que se rechaza son AFIRMACIONES sin base:
 * cifras y métricas que la persona no dio ("50.000 seguidores", "10 años de experiencia"), nombres
 * propios que no aparecen en su ADN ni en sus proyectos ("tu cliente Nike") y frases que dan por
 * sabido cómo se comporta su audiencia ("tu audiencia prefiere…").
 */

/* ---------- Normalización ---------- */

export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Raíz de una palabra (sin terminaciones de género/número). */
export function stem(word: string): string {
  return word.length > 5 ? word.replace(/(as|os|es|a|o|e|s)$/, '') : word;
}

const wordsOf = (value: string) =>
  normalize(value)
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);

/* ---------- Plataformas y formatos ---------- */

const PLATFORM_PATTERNS: [RegExp, ContentPlatform][] = [
  [/\b(instagram|insta|ig)\b/, 'instagram'],
  [/\btik ?tok\b/, 'tiktok'],
  [/\b(youtube|yt)\b/, 'youtube'],
  [/\bfacebook\b/, 'facebook'],
  [/\blinkedin\b/, 'linkedin'],
  [/^(x|twitter)$|\btwitter\b/, 'x'],
  [/\bblog\b/, 'blog'],
  [/\b(newsletter|boletin|email|correo)\b/, 'newsletter'],
];

/** Plataforma declarada en texto libre → enum (Twitch, Behance… → `other`). */
export function platformFromText(text: string): ContentPlatform {
  const value = normalize(text).trim();
  return PLATFORM_PATTERNS.find(([pattern]) => pattern.test(value))?.[1] ?? 'other';
}

const FORMAT_PATTERNS: [RegExp, ContentFormat][] = [
  [/\breels?\b/, 'reel'],
  [/\bcarrusel(es)?\b|\bcarousel/, 'carousel'],
  [/\bstor(y|ies)\b|\bhistorias\b/, 'story'],
  [/\bfoto(grafia|s)?\b|\bphoto/, 'photo'],
  [/\bposts?\b|\bpublicacion/, 'post'],
  [/\bvideo ?corto|\bshorts?\b|\bclips?\b/, 'short_video'],
  [/\bvideo ?largo|\bvideos? largos|\bdirectos?\b|\bstreams?\b/, 'long_video'],
  [/\barticulos?\b|\bblog/, 'article'],
  [/\bpodcasts?\b/, 'podcast'],
  [/\bnewsletters?\b|\bboletin/, 'newsletter'],
];

/** Formato preferido en texto libre → enum (null si no se reconoce: no cuenta como preferencia). */
export function formatFromText(text: string): ContentFormat | null {
  const value = normalize(text);
  return FORMAT_PATTERNS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

export function uniqueValues<T>(values: readonly (T | null)[]): T[] {
  return [...new Set(values.filter((value): value is T => value !== null))];
}

/* ---------- Frecuencia ---------- */

const NUMBER_WORDS: Record<string, number> = {
  una: 1,
  uno: 1,
  un: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  diez: 10,
};

/**
 * Piezas por semana a partir de la preferencia del ADN ("3 publicaciones por semana",
 * "dos a la semana", "diario", "1 al día", "8 al mes"). null si no se entiende.
 */
export function frequencyFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const value = normalize(text);
  const clamp = (n: number) => Math.min(CONTENT_PLAN_MAX_FREQUENCY, Math.max(1, Math.round(n)));
  if (/\b(diari[oa]s?|todos los dias|cada dia)\b/.test(value) && !/\d/.test(value)) return 7;
  const number = /(\d+)/.exec(value)?.[1];
  const word = Object.keys(NUMBER_WORDS).find((key) => new RegExp(`\\b${key}\\b`).test(value));
  const amount = number ? Number(number) : word ? NUMBER_WORDS[word]! : null;
  if (amount === null) return null;
  if (/\b(dia|diari)/.test(value)) return clamp(amount * 7);
  if (/\bmes\b|\bmensual/.test(value)) return clamp(amount / 4.3);
  if (/\bsemana|\bsemanal/.test(value)) return clamp(amount);
  return null;
}

/* ---------- Fechas del periodo ---------- */

/** Todos los días "YYYY-MM-DD" del periodo, ambos extremos incluidos. */
export function daysOf(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let time = start; time <= end; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/** Mediodía local de un día (convención de fechas de Operations), expresado en UTC. */
export function dayToInstant(day: string, tzOffset: number): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date, 12) + tzOffset * 60_000);
}

/** `count` días repartidos de forma uniforme en el periodo. */
export function spreadDays(days: readonly string[], count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) =>
      days[Math.min(days.length - 1, Math.floor(((index + 0.5) * days.length) / count))]!,
  );
}

/* ---------- Fundamento ---------- */

/** Vocabulario del contexto real: raíces de palabras y cifras que la persona sí dio. */
export interface Vocabulary {
  words: Set<string>;
  numbers: Set<string>;
}

export function buildVocabulary(values: unknown[]): Vocabulary {
  const words = new Set<string>();
  const numbers = new Set<string>();
  const collect = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const part of wordsOf(value)) {
        if (/^\d+$/.test(part)) numbers.add(String(Number(part)));
        else words.add(stem(part));
      }
      for (const match of value.matchAll(/\d[\d.,]*\d|\d/g)) {
        numbers.add(String(Number(match[0].replace(/[.,]/g, ''))));
      }
    } else if (typeof value === 'number') numbers.add(String(value));
    else if (Array.isArray(value)) value.forEach(collect);
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(collect);
  };
  values.forEach(collect);
  return { words, numbers };
}

/** Palabras con mayúscula que no son datos personales (plataformas, formatos, meses, producto). */
const ALLOWED_PROPER = new Set(
  [
    ...Object.values(CONTENT_PLATFORM_LABELS),
    ...Object.values(CONTENT_FORMAT_LABELS),
    'Reels',
    'Stories',
    'Story',
    'Shorts',
    'Twitch',
    'Behance',
    'Pinterest',
    'Twitter',
    'Pixel',
    'PIXELES',
    'IA',
    'ADN',
    'CTA',
    'Live',
    'Q&A',
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
    'lunes',
    'martes',
    'miercoles',
    'jueves',
    'viernes',
    'sabado',
    'domingo',
  ].map((word) => stem(normalize(word))),
);

/** Palabras que convierten una cifra en una afirmación (métrica, experiencia, resultado). */
const METRIC_AFTER_NUMBER =
  /^(%|k\b|mil\b|millones?|seguidor|suscriptor|follower|fans?\b|cliente|venta|visita|vista|view|reproduccion|like|lead|usuario|miembro|persona|ano|mes|proyecto|premio|campana|marca|alumn|estudiante|descarga|interacci|comentario|compartid)/;

/** Afirmaciones sobre el comportamiento de la audiencia que Pixel no puede saber. */
const AUDIENCE_ASSERTION =
  /\btus? (audiencia|comunidad|seguidores|publico|clientes|fans)( [a-z]+){0,2} (prefiere|prefieren|ama|aman|adora|adoran|responde|responden|reacciona|reaccionan|interactua|interactuan|consume|consumen|siempre|nunca)\b/;

/**
 * Afirmaciones no fundamentadas de un texto (vacío = se puede usar). Ver la cabecera del módulo.
 */
export function unfoundedClaims(text: string | null | undefined, vocabulary: Vocabulary): string[] {
  if (!text) return [];
  const claims: string[] = [];
  const plain = normalize(text);

  for (const match of plain.matchAll(/(\d[\d.,]*\d|\d)\s*(\S*)/g)) {
    const value = String(Number(match[1]!.replace(/[.,]/g, '')));
    if (vocabulary.numbers.has(value)) continue;
    const next = (match[2] ?? '').replace(/^[^a-z%ñ]+/, '');
    const big = value.length >= 3;
    if (big || match[1]!.includes('%') || METRIC_AFTER_NUMBER.test(next) || /^%/.test(next)) {
      claims.push(match[0].trim());
    }
  }

  // Nombres propios: palabra con mayúscula que NO empieza frase y no está en el contexto real.
  const tokens = text.split(/\s+/).filter(Boolean);
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    const sentenceStart = !previous || /[.!?:;…]["»)]?$/.test(previous) || /^[«"¿¡(—-]/.test(token);
    if (sentenceStart) return;
    const word = /^([A-ZÁÉÍÓÚÑ][\p{L}\d&'-]*)/u.exec(token)?.[1];
    if (!word) return;
    const key = stem(normalize(word).replace(/[^a-z0-9ñ&]/g, ''));
    if (!key || ALLOWED_PROPER.has(key) || vocabulary.words.has(key)) return;
    claims.push(word);
  });

  if (AUDIENCE_ASSERTION.test(plain)) claims.push(AUDIENCE_ASSERTION.exec(plain)![0]);
  return claims;
}

/** Quita las frases con afirmaciones no fundamentadas (para textos largos como la estrategia). */
export function groundedSentences(text: string, vocabulary: Vocabulary): string {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && unfoundedClaims(sentence, vocabulary).length === 0)
    .join(' ')
    .trim();
}

/* ---------- Repetición ---------- */

const STOPWORDS = new Set(
  [
    'como',
    'para',
    'sobre',
    'desde',
    'entre',
    'porque',
    'cuando',
    'esto',
    'este',
    'esta',
    'tu',
    'tus',
    'mi',
    'mis',
    'que',
    'con',
    'del',
    'los',
    'las',
    'una',
    'uno',
    'por',
    'sin',
  ].map(normalize),
);

function keyWords(text: string): Set<string> {
  return new Set(
    wordsOf(text)
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
      .map(stem),
  );
}

/** Jaccard entre las palabras clave de dos textos (0–1). */
export function similarity(a: string, b: string): number {
  const x = keyWords(a);
  const y = keyWords(b);
  if (x.size === 0 || y.size === 0) return 0;
  const shared = [...x].filter((word) => y.has(word)).length;
  return shared / (x.size + y.size - shared);
}

export const DUPLICATE_THRESHOLD = 0.6;

/** Duplicación evidente (mismo título o casi): no se busca originalidad absoluta. */
export function isNearDuplicate(text: string, others: readonly string[]): boolean {
  const key = normalize(text)
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
  return others.some(
    (other) =>
      normalize(other)
        .replace(/[^a-z0-9ñ]+/g, ' ')
        .trim() === key || similarity(text, other) >= DUPLICATE_THRESHOLD,
  );
}
