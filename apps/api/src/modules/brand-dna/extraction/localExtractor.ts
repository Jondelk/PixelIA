import { emptyExtraction, type OnboardingExtraction } from '@pixel/contracts';
import { normalizeHex } from './sanitize.js';

/*
 * Lectura local, sin IA: reconoce documentos organizados por secciones con título
 * ("Misión:", "## Valores", "¿Quiénes somos?", "NUESTROS VALORES"…) y toma su contenido.
 * Funciona con texto, Word, PowerPoint y PDF con texto. No interpreta ni deduce: lo que no está
 * bajo un título conocido lo completa el usuario.
 */

type Target =
  | { kind: 'text'; step: keyof OnboardingExtraction; field: string }
  | { kind: 'list'; step: keyof OnboardingExtraction; field: string }
  | { kind: 'colors' };

const text = (step: keyof OnboardingExtraction, field: string): Target => ({
  kind: 'text',
  step,
  field,
});
const list = (step: keyof OnboardingExtraction, field: string): Target => ({
  kind: 'list',
  step,
  field,
});

/** Títulos reconocidos (normalizados: minúsculas, sin tildes). El orden importa: el más largo primero. */
const HEADINGS: [string[], Target][] = [
  [
    ['palabras a evitar', 'evitar decir', 'palabras prohibidas'],
    list('communication', 'wordsToAvoid'),
  ],
  [['palabras que usamos', 'palabras clave', 'vocabulario'], list('communication', 'wordsToUse')],
  [['no nos gusta', 'lo que no nos gusta'], list('creative', 'dislikes')],
  [['nos gusta', 'lo que nos gusta'], list('creative', 'likes')],
  [
    [
      'publico objetivo',
      'cliente ideal',
      'audiencia',
      'publico',
      'clientes',
      'a quien va dirigido',
      'a quien nos dirigimos',
      'dirigido a',
      'mercado objetivo',
      'segmento',
    ],
    text('audience', 'targetAudience'),
  ],
  [['necesidades'], list('audience', 'needs')],
  [['problemas', 'dolores', 'puntos de dolor'], list('audience', 'problems')],
  [['caracteristicas del publico', 'caracteristicas'], list('audience', 'characteristics')],
  [['nombre de la marca', 'nombre', 'marca', 'empresa'], text('company', 'name')],
  [['sector', 'industria', 'categoria'], text('company', 'industry')],
  [
    [
      'quienes somos',
      'que hacemos',
      'sobre nosotros',
      'acerca de nosotros',
      'nosotros',
      'descripcion',
      'perfil',
      'perfil de la empresa',
      'servicios',
      'productos',
      'que ofrecemos',
    ],
    text('company', 'description'),
  ],
  [['historia', 'trayectoria', 'como empezamos', 'origenes'], text('company', 'history')],
  [['ubicacion', 'origen', 'sede', 'ciudad', 'donde estamos'], text('company', 'origin')],
  [['mision'], text('purpose', 'mission')],
  [['vision'], text('purpose', 'vision')],
  [['proposito'], text('purpose', 'purpose')],
  [
    ['valores', 'valores corporativos', 'principios', 'principios corporativos'],
    list('purpose', 'values'),
  ],
  [
    ['personalidad', 'personalidad de marca', 'atributos de marca', 'atributos'],
    list('personality', 'attributes'),
  ],
  [['tono de voz', 'tono', 'voz de marca'], list('communication', 'tone')],
  [
    ['paleta de colores', 'paleta', 'colores', 'colores corporativos', 'colores de marca'],
    { kind: 'colors' },
  ],
  [['estilo visual', 'estilo'], list('visual', 'styles')],
  [['materiales', 'texturas'], list('visual', 'materials')],
  [['formas'], list('visual', 'shapes')],
  [['elementos recurrentes', 'elementos graficos'], list('visual', 'recurringElements')],
  [['referencias visuales'], list('creative', 'visualReferences')],
  [['referencias'], list('visual', 'references')],
  [['competidores', 'competencia'], list('competition', 'competitors')],
  [
    [
      'diferenciadores',
      'diferencial',
      'propuesta de valor',
      'por que elegirnos',
      'por que nosotros',
      'ventajas',
      'ventajas competitivas',
    ],
    list('competition', 'differentiators'),
  ],
  [['restricciones', 'limites'], list('creative', 'restrictions')],
];

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "¿Quiénes somos?", "NUESTROS VALORES", "Nuestra misión" → "quienes somos", "valores", "mision". */
export function headingKey(value: string): string {
  return normalize(value)
    .replace(/[¿?¡!.]/g, '')
    .replace(/^(nuestra|nuestro|nuestras|nuestros|la|el|los|las|mi|su|sus)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Títulos que también son palabras comunes dentro de una lista ("Origen" como valor, "Marca"…):
 * sin dos puntos solo cuentan como título si están en MAYÚSCULAS o marcados con "#".
 */
const AMBIGUOUS = new Set([
  'origen',
  'marca',
  'empresa',
  'nombre',
  'perfil',
  'nosotros',
  'productos',
  'servicios',
  'clientes',
  'publico',
  'estilo',
  'formas',
  'tono',
  'sede',
  'ciudad',
  'segmento',
  'ventajas',
  'texturas',
  'atributos',
]);

/** Si la línea es un título conocido, su destino y el texto que siga en la misma línea. */
function matchHeading(line: string): { target: Target; rest: string } | null {
  // Una viñeta ("- Origen") es contenido de una lista, salvo que traiga "Título: texto".
  if (/^\s*([-•*·]|\d+[.)])\s+/.test(line) && !line.includes(':')) return null;
  const cleaned = line.replace(/^\s*(#{1,6}|\d+[.)]|[-•*])\s*/, '').replace(/\*\*/g, '');
  const colon = cleaned.indexOf(':');
  const head = headingKey(colon >= 0 ? cleaned.slice(0, colon) : cleaned);
  if (!head || head.length > 40) return null;
  // Sin dos puntos, solo cuenta como título si la línea es corta (p. ej. "MISIÓN").
  if (colon < 0 && cleaned.trim().split(/\s+/).length > 5) return null;
  const marked = /^\s*#/.test(line) || line === line.toLocaleUpperCase('es');
  if (colon < 0 && AMBIGUOUS.has(head) && !marked) return null;
  for (const [labels, target] of HEADINGS) {
    if (labels.includes(head)) {
      return { target, rest: colon >= 0 ? cleaned.slice(colon + 1).trim() : '' };
    }
  }
  return null;
}

function splitList(lines: string[]): string[] {
  const bullets = lines.filter((line) => /^\s*([-•*·]|\d+[.)])\s+/.test(line));
  const source = bullets.length
    ? bullets
    : lines.flatMap((line) => line.split(/[,;·|•\t]| y (?=\S)/));
  return source.map((item) => item.replace(/^\s*([-•*·]|\d+[.)])\s+/, '').trim()).filter(Boolean);
}

const HEX = /#?\b([0-9a-f]{6}|[0-9a-f]{3})\b/gi;

function colorsFrom(lines: string[]): { hex: string; name: string | null }[] {
  const out: { hex: string; name: string | null }[] = [];
  for (const line of lines) {
    let from = 0;
    for (const match of line.matchAll(HEX)) {
      // Sin "#", solo cuenta si mezcla letras y números ("2020" o "facade" no son colores).
      if (!match[0].startsWith('#') && !(/[a-f]/i.test(match[1]!) && /\d/.test(match[1]!))) {
        continue;
      }
      const hex = normalizeHex(match[0]);
      if (!hex) continue;
      // El nombre es el texto entre el color anterior (o el inicio) y este.
      const name = line
        .slice(from, match.index)
        .replace(/^[\s·|,;/–-]+/, '')
        .replace(/^\s*([-•*·]|\d+[.)])\s*/, '')
        .replace(/[\s:(·|,;/–-]+$/, '')
        .trim();
      from = (match.index ?? 0) + match[0].length;
      out.push({ hex, name: name && name.length <= 40 ? name : null });
    }
  }
  return out;
}

const STOPWORDS: Record<'es' | 'en' | 'pt', string[]> = {
  // Palabras frecuentes propias de cada idioma (se evitan las que comparten, como "que" o "para").
  es: [
    'el',
    'la',
    'los',
    'las',
    'del',
    'y',
    'es',
    'un',
    'una',
    'por',
    'con',
    'lo',
    'al',
    'su',
    'sus',
    'como',
    'nuestra',
    'nuestro',
    'tu',
    'mas',
    'muy',
    'cada',
  ],
  en: [
    'the',
    'and',
    'of',
    'to',
    'in',
    'our',
    'we',
    'with',
    'for',
    'is',
    'are',
    'your',
    'you',
    'that',
    'this',
  ],
  pt: [
    'os',
    'do',
    'da',
    'dos',
    'das',
    'em',
    'com',
    'uma',
    'nossa',
    'nosso',
    'voce',
    'nao',
    'sao',
    'ao',
    'pelo',
    'pela',
    'seu',
    'sua',
  ],
};

/** Idioma por palabras frecuentes; null si el texto es muy corto o no es concluyente. */
export function guessLanguage(text: string): 'es' | 'en' | 'pt' | null {
  const words = normalize(text).match(/[a-z]+/g) ?? [];
  if (words.length < 8) return null;
  const scores = (Object.keys(STOPWORDS) as (keyof typeof STOPWORDS)[]).map((code) => ({
    code,
    hits: words.filter((word) => STOPWORDS[code].includes(word)).length,
  }));
  scores.sort((a, b) => b.hits - a.hits);
  const [best, second] = scores;
  return best && best.hits >= 3 && best.hits > (second?.hits ?? 0) ? best.code : null;
}

export interface LocalDocument {
  name: string;
  text: string;
  /**
   * Colores ya medidos (rellenos del PDF, píxeles de una imagen), elegidos con pickBrandColors.
   * Se usan solo si los documentos no traen colores escritos (#RRGGBB).
   */
  designColors?: string[];
  /** Cómo se obtuvieron, para la evidencia ("Colores usados en el diseño del PDF"). */
  designColorsLabel?: string;
}

export const LOCAL_NOTES =
  'Lectura sin IA: Pixel tomó las secciones con título (Misión, Valores, ¿Quiénes somos?…) y los colores de tus documentos. Revisa y completa lo demás.';

export function extractLocally(documents: LocalDocument[]): OnboardingExtraction {
  const result = emptyExtraction();
  const steps = result as unknown as Record<string, Record<string, unknown>>;

  for (const doc of documents) {
    const lines = doc.text.split(/\r?\n/);
    // "Título: texto" ocupa esa línea (y las viñetas que le sigan); un título solo toma las
    // líneas siguientes hasta la primera línea en blanco. Así el texto corrido no se cuela.
    let current: { target: Target; lines: string[]; inline: boolean } | null = null;
    const sections: { target: Target; lines: string[] }[] = [];

    for (const line of lines) {
      // Justo después de un título solo ("NUESTROS VALORES"), la primera línea es contenido
      // aunque coincida con otro título, salvo que traiga "Título: texto".
      const afterBareHeading: boolean =
        current !== null && !current.inline && current.lines.length === 0;
      const heading: ReturnType<typeof matchHeading> =
        afterBareHeading && !line.includes(':') ? null : matchHeading(line);
      if (heading) {
        current = {
          target: heading.target,
          lines: heading.rest ? [heading.rest] : [],
          inline: Boolean(heading.rest),
        };
        sections.push(current);
        continue;
      }
      if (!current) continue;
      const trimmed = line.trim();
      const bullet = /^([-•*·]|\d+[.)])\s+/.test(trimmed);
      if (!trimmed) {
        if (current.lines.length) current = null;
      } else if (bullet || !current.inline) {
        current.lines.push(trimmed);
      } else {
        current = null;
      }
    }

    for (const { target, lines: body } of sections) {
      if (!body.length) continue;
      if (target.kind === 'colors') {
        result.visual.colors.push(...colorsFrom(body));
        result.evidence.push({
          field: 'visual.colors',
          source: doc.name,
          quote: body.join(' ').slice(0, 200),
        });
        continue;
      }
      const block = steps[target.step]!;
      if (target.kind === 'text') {
        if (block[target.field]) continue; // el primer documento que lo trae manda
        block[target.field] = body.join(' ');
      } else {
        block[target.field] = [...(block[target.field] as string[]), ...splitList(body)];
      }
      result.evidence.push({
        field: `${target.step}.${target.field}`,
        source: doc.name,
        quote: body.join(' ').slice(0, 200),
      });
    }

    // Colores escritos en cualquier parte, si no hubo sección de colores.
    if (!result.visual.colors.length) {
      result.visual.colors.push(...colorsFrom(lines).slice(0, 8));
    }
  }

  // Sin códigos escritos: los colores medidos en el diseño (PDF) o en las imágenes.
  if (!result.visual.colors.length) {
    for (const doc of documents) {
      const colors = doc.designColors ?? [];
      if (!colors.length) continue;
      result.visual.colors.push(...colors.map((hex) => ({ hex, name: null })));
      result.evidence.push({
        field: 'visual.colors',
        source: doc.name,
        quote: `${doc.designColorsLabel ?? 'Colores del documento'}: ${colors.join(', ')}`,
      });
    }
  }

  result.communication.language = guessLanguage(documents.map((doc) => doc.text).join(' '));
  result.notes = LOCAL_NOTES;
  return result;
}
