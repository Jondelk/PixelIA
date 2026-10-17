import { emptyExtraction, type OnboardingExtraction } from '@pixel/contracts';
import { normalizeHex } from './sanitize.js';

/*
 * Lectura local, sin IA: reconoce documentos organizados por secciones con título
 * ("Misión:", "## Valores", "¿Quiénes somos?", "NUESTROS VALORES", "Misión institucional"…) y
 * toma TODO su contenido. Funciona con texto, Word, PowerPoint, Excel y PDF con texto.
 *
 * Cómo evita perder información:
 * - Une los renglones que el PDF o Word parten a mitad de frase y las palabras cortadas con guion.
 * - Una sección sigue hasta el siguiente título (aunque haya párrafos o saltos de página en medio),
 *   no hasta la primera línea en blanco.
 * - Varias secciones del mismo campo se suman ("Quiénes somos" + "Servicios" → descripción).
 * - Las listas respetan viñetas, una idea por renglón o elementos separados por comas.
 * - Lo que está bajo títulos que no corresponden a ningún campo se informa en las notas, para que
 *   el usuario sepa que existe; nunca se descarta en silencio.
 * No interpreta ni deduce: lo que falta lo completa el usuario.
 */

type Target =
  | { kind: 'text'; step: keyof OnboardingExtraction; field: string; short?: boolean }
  | { kind: 'list'; step: keyof OnboardingExtraction; field: string }
  | { kind: 'colors' };

const text = (step: keyof OnboardingExtraction, field: string, short = false): Target => ({
  kind: 'text',
  step,
  field,
  ...(short ? { short } : {}),
});
const list = (step: keyof OnboardingExtraction, field: string): Target => ({
  kind: 'list',
  step,
  field,
});

/** Títulos reconocidos (normalizados: minúsculas, sin tildes). El orden importa: el más largo primero. */
const HEADINGS: [string[], Target][] = [
  [
    [
      'palabras a evitar',
      'evitar decir',
      'palabras prohibidas',
      'lo que no decimos',
      'no decimos',
      'expresiones a evitar',
    ],
    list('communication', 'wordsToAvoid'),
  ],
  [
    [
      'palabras que usamos',
      'palabras clave',
      'vocabulario',
      'lo que decimos',
      'expresiones',
      'frases clave',
      'mensajes clave',
    ],
    list('communication', 'wordsToUse'),
  ],
  [['no nos gusta', 'lo que no nos gusta', 'no nos gustan'], list('creative', 'dislikes')],
  [
    ['nos gusta', 'lo que nos gusta', 'nos gustan', 'inspiracion', 'inspiraciones'],
    list('creative', 'likes'),
  ],
  [
    [
      'publico objetivo',
      'cliente ideal',
      'clientes ideales',
      'audiencia',
      'publico',
      'clientes',
      'a quien va dirigido',
      'a quien nos dirigimos',
      'a quienes nos dirigimos',
      'dirigido a',
      'mercado objetivo',
      'segmento',
      'segmentos',
      'target',
      'buyer persona',
      'consumidor',
      'consumidores',
      'usuarios',
      'nuestros clientes',
    ],
    text('audience', 'targetAudience'),
  ],
  [
    ['necesidades', 'insights', 'motivaciones', 'deseos', 'expectativas', 'que buscan'],
    list('audience', 'needs'),
  ],
  [
    ['problemas', 'dolores', 'puntos de dolor', 'frustraciones', 'retos', 'desafios', 'dolor'],
    list('audience', 'problems'),
  ],
  [
    [
      'caracteristicas del publico',
      'caracteristicas',
      'perfil del cliente',
      'perfil del consumidor',
      'demografia',
      'datos demograficos',
    ],
    list('audience', 'characteristics'),
  ],
  [
    ['nombre de la marca', 'nombre comercial', 'razon social', 'nombre', 'marca', 'empresa'],
    text('company', 'name', true),
  ],
  [
    ['sector', 'industria', 'categoria', 'actividad economica', 'rubro'],
    text('company', 'industry', true),
  ],
  [
    [
      'quienes somos',
      'que hacemos',
      'sobre nosotros',
      'acerca de nosotros',
      'acerca de',
      'nosotros',
      'descripcion',
      'perfil',
      'perfil de la empresa',
      'perfil corporativo',
      'resumen',
      'introduccion',
      'presentacion',
      'servicios',
      'productos',
      'productos y servicios',
      'portafolio',
      'que ofrecemos',
      'oferta',
      'modelo de negocio',
    ],
    text('company', 'description'),
  ],
  [
    [
      'historia',
      'trayectoria',
      'como empezamos',
      'como nacimos',
      'origenes',
      'antecedentes',
      'resena historica',
      'nuestra historia',
    ],
    text('company', 'history'),
  ],
  [
    ['ubicacion', 'origen', 'sede', 'sedes', 'ciudad', 'donde estamos', 'direccion'],
    text('company', 'origin', true),
  ],
  [['mision'], text('purpose', 'mission')],
  [['vision'], text('purpose', 'vision')],
  [
    [
      'proposito',
      'razon de ser',
      'esencia',
      'filosofia',
      'por que existimos',
      'para que existimos',
    ],
    text('purpose', 'purpose'),
  ],
  [
    [
      'valores',
      'valores corporativos',
      'principios',
      'principios corporativos',
      'pilares',
      'creencias',
    ],
    list('purpose', 'values'),
  ],
  [
    [
      'personalidad',
      'personalidad de marca',
      'atributos de marca',
      'atributos',
      'rasgos',
      'rasgos de personalidad',
      'arquetipo',
      'arquetipos',
      'como somos',
    ],
    list('personality', 'attributes'),
  ],
  [
    [
      'tono de voz',
      'tono',
      'voz de marca',
      'voz',
      'tono y voz',
      'voz y tono',
      'tono de comunicacion',
      'estilo de comunicacion',
      'como hablamos',
      'comunicacion',
    ],
    list('communication', 'tone'),
  ],
  [
    [
      'paleta de colores',
      'paleta',
      'colores',
      'color',
      'colores corporativos',
      'colores de marca',
      'colores primarios',
      'colores secundarios',
      'color principal',
      'color secundario',
      'paleta cromatica',
      'cromatica',
    ],
    { kind: 'colors' },
  ],
  [['estilo visual', 'estilo', 'estetica', 'lenguaje visual'], list('visual', 'styles')],
  [['materiales', 'texturas'], list('visual', 'materials')],
  [['formas', 'formas y figuras'], list('visual', 'shapes')],
  [
    [
      'elementos recurrentes',
      'elementos graficos',
      'elementos visuales',
      'iconografia',
      'recursos graficos',
    ],
    list('visual', 'recurringElements'),
  ],
  [
    ['que evitar', 'usos incorrectos', 'usos no permitidos', 'no usar', 'evitar'],
    list('visual', 'avoid'),
  ],
  [['referencias visuales', 'moodboard'], list('creative', 'visualReferences')],
  [['referencias', 'marcas de referencia', 'referentes'], list('visual', 'references')],
  [
    ['competidores', 'competencia', 'competidores directos', 'competidores indirectos'],
    list('competition', 'competitors'),
  ],
  [
    [
      'diferenciadores',
      'diferencial',
      'diferenciales',
      'diferenciacion',
      'que nos diferencia',
      'que nos hace diferentes',
      'propuesta de valor',
      'valor agregado',
      'por que elegirnos',
      'por que nosotros',
      'ventajas',
      'ventajas competitivas',
    ],
    list('competition', 'differentiators'),
  ],
  [['restricciones', 'limites', 'lineamientos', 'reglas'], list('creative', 'restrictions')],
];

/** Etiquetas → destino, para buscar rápido. */
const LABELS = new Map<string, Target>();
for (const [labels, target] of HEADINGS) for (const label of labels) LABELS.set(label, target);
const LABELS_BY_LENGTH = [...LABELS.keys()].sort((a, b) => b.length - a.length);

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "¿Quiénes somos?", "NUESTROS VALORES", "Nuestra misión" → "quienes somos", "valores", "mision". */
export function headingKey(value: string): string {
  return normalize(value)
    .replace(/[¿?¡!.]/g, '')
    .replace(/^\s*\d+(\.\d+)*[.)-]?\s+/, '')
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
  'voz',
  'color',
  'sede',
  'sedes',
  'ciudad',
  'segmento',
  'segmentos',
  'ventajas',
  'texturas',
  'atributos',
  'rasgos',
  'resumen',
  'oferta',
  'usuarios',
  'reglas',
  'evitar',
  'esencia',
  'creencias',
  'comunicacion',
  'dolor',
  'retos',
  'deseos',
  'expresiones',
  'direccion',
  'presentacion',
  'introduccion',
  'consumidor',
  'consumidores',
  'portafolio',
]);

/** Secciones frecuentes en brochures y manuales que no son campos del onboarding. */
const OTHER_SECTIONS = new Set([
  'contacto',
  'contactanos',
  'datos de contacto',
  'informacion de contacto',
  'redes',
  'redes sociales',
  'siguenos',
  'slogan',
  'eslogan',
  'lema',
  'tagline',
  'claim',
  'equipo',
  'equipo de trabajo',
  'aliados',
  'socios',
  'testimonios',
  'certificaciones',
  'premios',
  'reconocimientos',
  'horarios',
  'horario',
  'logo',
  'logotipo',
  'isotipo',
  'tipografia',
  'tipografias',
  'fuentes',
  'aplicaciones',
  'papeleria',
  'indice',
  'contenido',
  'gracias',
  'agradecimientos',
  'legal',
  'precios',
  'tarifas',
  'cobertura',
  'galeria',
]);

const BULLET = /^\s*([-–•*·▪►✓✔○◦]|\d+[.)]|[a-z][.)])\s+/i;
const isBullet = (line: string) => BULLET.test(line);
const stripBullet = (line: string) => line.replace(BULLET, '').trim();
/** Separador de etiquetas que pdf.js produce con un hueco grande en el mismo renglón. */
const GAP = ' · ';

const letters = (line: string) => line.replace(/[^\p{L}]/gu, '');
const isUpper = (line: string) => {
  const l = letters(line);
  return l.length >= 3 && l === l.toLocaleUpperCase('es') && l !== l.toLocaleLowerCase('es');
};
const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

/** Destino de un título por su clave: exacto, o "Misión institucional", "Valores 2025"… */
function targetFor(head: string, marked: boolean): Target | null {
  const exact = LABELS.get(head);
  if (exact) return AMBIGUOUS.has(head) && !marked ? null : exact;
  if (wordCount(head) > 6) return null;
  for (const label of LABELS_BY_LENGTH) {
    if (AMBIGUOUS.has(label)) continue;
    if (head.startsWith(`${label} `) || head.startsWith(`${label}:`)) return LABELS.get(label)!;
  }
  return null;
}

interface HeadingMatch {
  target: Target | null;
  /** Título tal como aparece (para las notas cuando no tiene campo). */
  title: string;
  rest: string;
}

/**
 * Si la línea es un título, su destino (null si es un título que no corresponde a ningún campo,
 * p. ej. "CONTACTO" o "Slogan: …") y el texto que siga en la misma línea.
 * `inList`: dentro de una lista, "Calidad: hacemos…" o "HONESTIDAD" son elementos, no títulos.
 */
function matchHeading(line: string, inList: boolean): HeadingMatch | null {
  const raw = line.trim();
  if (!raw) return null;
  if (/^diapositiva \d+$/i.test(raw)) return { target: null, title: '', rest: '' };
  const markdown = /^#{1,6}\s/.test(raw);
  // Una viñeta ("- Origen") es contenido de una lista, salvo que traiga "Título: texto" conocido.
  const bullet = isBullet(raw) && !/^\d+[.)]\s+\S/.test(raw);
  const cleaned = raw
    .replace(/^#{1,6}\s*/, '')
    .replace(BULLET, '')
    .replace(/\*\*/g, '')
    .trim();

  // "Título: texto", "Título · texto" (PDF) o "Título" solo.
  let colon = cleaned.indexOf(':');
  let sepLength = 1;
  const gap = cleaned.indexOf(GAP);
  if (gap > 0 && (colon < 0 || gap < colon)) {
    colon = gap;
    sepLength = GAP.length;
  }
  const headText = colon >= 0 ? cleaned.slice(0, colon) : cleaned;
  const rest = colon >= 0 ? cleaned.slice(colon + sepLength).trim() : '';
  const head = headingKey(headText);
  if (!head || head.length > 50 || /https?$|www$/.test(head)) return null;

  const upper = isUpper(headText);
  // "Nuestros servicios", "Nuestra esencia": el posesivo delata un título.
  const possessive = /^(nuestr[oa]s?|mis?|sus?)\s/i.test(normalize(headText).trim());
  const marked = markdown || upper || possessive || (colon >= 0 && !rest);
  const target = targetFor(head, marked || colon >= 0);

  if (target) {
    if (bullet && colon < 0) return null;
    // Sin dos puntos, solo cuenta como título si la línea es corta (p. ej. "MISIÓN").
    if (colon < 0 && wordCount(cleaned) > 6) return null;
    if (colon < 0 && /[.,;]$/.test(cleaned)) return null;
    return { target, title: headText.trim(), rest };
  }

  // Títulos sin campo: cierran la sección anterior para que su contenido no se cuele.
  if (bullet) return null;
  if (OTHER_SECTIONS.has(head) && wordCount(cleaned) <= 6) {
    return { target: null, title: headText.trim(), rest };
  }
  const words = wordCount(headText);
  if (markdown && words <= 8) return { target: null, title: headText.trim(), rest };
  if (inList) return null;
  if (
    colon >= 0 &&
    sepLength === 1 &&
    words <= 4 &&
    /^\p{Lu}/u.test(headText.trim()) &&
    !/\d/.test(headText)
  ) {
    return { target: null, title: headText.trim(), rest };
  }
  if (colon < 0 && upper && words <= 7 && !/[.,;]$/.test(cleaned)) {
    return { target: null, title: headText.trim(), rest: '' };
  }
  return null;
}

/**
 * Normaliza el texto de un documento: une palabras cortadas con guion al final del renglón y los
 * renglones que el PDF o Word parten a mitad de frase.
 */
export function prepareLines(source: string): string[] {
  const lines = source
    .replace(/\r\n?/g, '\n')
    .replace(/(\p{L})[-­]\n(\p{Ll})/gu, '$1$2')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const trimmed = line.trim();
    if (
      prev &&
      trimmed &&
      prev.trim() &&
      !isBullet(trimmed) &&
      !/[.!?:;]$/.test(prev.trim()) &&
      !matchHeading(prev, false)?.target &&
      !matchHeading(trimmed, false) &&
      // Sigue la frase: empieza en minúscula, o el renglón anterior es largo (ancho de columna).
      (/^[\p{Ll}(]/u.test(trimmed) || (prev.trim().length >= 55 && !isUpper(trimmed)))
    ) {
      out[out.length - 1] = `${prev.trim()} ${trimmed}`;
      continue;
    }
    out.push(line);
  }
  return out;
}

/** Recorta a `max` caracteres sin partir palabras. */
function fit(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

const ITEM_MAX = 120;

/** Elementos de una lista: viñetas, una idea por renglón o separados por comas. */
export function splitList(body: string[]): string[] {
  const lines = body.map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const items: string[] = [];
  const hasBullets = lines.some(isBullet);
  if (hasBullets) {
    for (const line of lines) {
      if (isBullet(line) || !items.length) items.push(stripBullet(line));
      // Renglón sin viñeta tras una viñeta: continúa el elemento anterior.
      else items[items.length - 1] = `${items[items.length - 1]} ${line}`;
    }
  } else if (lines.length === 1) {
    const line = lines[0]!;
    if (/^[^:]{2,40}:\s+\S/.test(line)) {
      // "Calidad: hacemos todo con cuidado, rapidez y amor" → un solo elemento.
      items.push(line);
    } else if (line.length > 160 && /[.!?]\s+\p{Lu}/u.test(line)) {
      // Prosa larga: una oración por elemento.
      items.push(...line.split(/(?<=[.!?])\s+(?=\p{Lu})/u));
    } else {
      // "Honestidad, calidad y servicio" → tres elementos.
      items.push(...line.split(/\s*[,;|•\t]\s*|\s+·\s+|\s+(?:y|e|and)\s+(?=\S)/));
    }
  } else {
    // Una idea por renglón ("Calidad: …", "HONESTIDAD"); cada renglón admite "a · b".
    // Un título corto seguido de su explicación ("ORIGEN" / "Cada grano tiene nombre.") es un
    // solo elemento: "Origen: Cada grano tiene nombre."
    const isTitle = (line: string) =>
      wordCount(line) <= 4 && !/[.,;:!?]$/.test(line) && (isUpper(line) || line.length <= 30);
    const isExplanation = (line: string) =>
      !isUpper(line) && (wordCount(line) >= 4 || /[.!?]$/.test(line));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const next = lines[i + 1];
      if (next && isTitle(line) && isExplanation(next) && !isTitle(next)) {
        const title = isUpper(line) ? line.charAt(0) + line.slice(1).toLocaleLowerCase('es') : line;
        items.push(`${title}: ${next}`);
        i++;
        continue;
      }
      items.push(...line.split(/\s+·\s+|\t|\s*;\s*/));
    }
  }
  return items
    .map((item) =>
      stripBullet(item)
        .replace(/[.;,]+$/, '')
        .trim(),
    )
    .filter((item) => item.length > 1)
    .map((item) => fit(item, ITEM_MAX));
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

interface Section {
  target: Target | null;
  title: string;
  /** Renglones de contenido; '' marca un cambio de párrafo. */
  lines: string[];
  inline: boolean;
}

/** Párrafos de una sección: renglones unidos y separados por línea en blanco. */
function paragraphs(lines: string[]): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of [...lines, '']) {
    if (line.trim()) current.push(line.trim());
    else if (current.length) {
      out.push(current.join(isBullet(current[0]!) ? '\n' : ' '));
      current = [];
    }
  }
  return out;
}

const TEXT_MAX: Record<string, number> = { name: 120, industry: 80, origin: 200 };

export function extractLocally(documents: LocalDocument[]): OnboardingExtraction {
  const result = emptyExtraction();
  const steps = result as unknown as Record<string, Record<string, unknown>>;
  const unmapped: string[] = [];
  const loose: { source: string; text: string }[] = [];

  for (const doc of documents) {
    const lines = prepareLines(doc.text);
    const sections: Section[] = [];
    let current = null as Section | null;
    /** Texto fuera de cualquier sección (antes del primer título o tras una sección cerrada). */
    let orphan: string[] = [];
    const flushOrphan = () => {
      for (const paragraph of paragraphs(orphan)) loose.push({ source: doc.name, text: paragraph });
      orphan = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const target: Target | null = current?.target ?? null;
      const inList: boolean = target?.kind === 'list' || target?.kind === 'colors';
      const currentInline: boolean = current?.inline ?? false;

      if (!trimmed) {
        if (current?.inline) current = null;
        else if (current?.lines.length) current.lines.push('');
        else if (!current) orphan.push('');
        continue;
      }

      // Justo después de un título solo ("NUESTROS VALORES"), la primera línea es contenido
      // aunque parezca otro título, salvo que traiga "Título: texto" o "#".
      const afterBareHeading: boolean =
        current !== null &&
        !current.inline &&
        current.lines.length === 0 &&
        current.target !== null;
      let heading: HeadingMatch | null =
        afterBareHeading && !trimmed.includes(':') && !/^#/.test(trimmed)
          ? null
          : matchHeading(trimmed, inList && !currentInline);
      // Dentro de una lista, un renglón en MAYÚSCULAS tras un párrafo en blanco es otro título
      // si los elementos de la lista no estaban escritos así ("Origen…" y luego "CONTACTO").
      if (!heading && inList && current && !currentInline) {
        const items = current.lines.filter(Boolean);
        const lastBlank = current.lines[current.lines.length - 1] === '';
        if (
          lastBlank &&
          items.length > 0 &&
          isUpper(trimmed) &&
          wordCount(trimmed) <= 7 &&
          !isUpper(items[0]!)
        ) {
          heading = { target: null, title: trimmed, rest: '' };
        }
      }

      if (heading) {
        flushOrphan();
        if (!heading.title) {
          current = null; // "Diapositiva 3": cambio de diapositiva
          continue;
        }
        current = {
          target: heading.target,
          title: heading.title,
          lines: heading.rest ? [heading.rest] : [],
          inline: Boolean(heading.rest),
        };
        sections.push(current);
        continue;
      }

      if (!current) {
        orphan.push(trimmed);
        continue;
      }
      const bullet = isBullet(trimmed);
      const shortField = current.target?.kind === 'text' && current.target.short;
      if (shortField && current.lines.filter(Boolean).length >= 1) {
        // Nombre, sector, ciudad: un renglón. Lo que sigue no les pertenece.
        current = null;
        orphan.push(trimmed);
        continue;
      }
      if (current.inline) {
        // "Título: texto" sigue con sus viñetas y, si es un texto (misión…), con sus renglones.
        if (bullet || current.target?.kind === 'text' || current.target === null) {
          current.lines.push(trimmed);
        } else {
          current = null;
          orphan.push(trimmed);
        }
        continue;
      }
      current.lines.push(trimmed);
    }
    flushOrphan();

    for (const section of sections) {
      const body = section.lines;
      const content = body.filter(Boolean);
      if (!section.target) {
        if (content.length && section.title) unmapped.push(section.title);
        continue;
      }
      if (!content.length) continue;
      const quote = fit(content.join(' '), 200);
      const target = section.target;
      if (target.kind === 'colors') {
        result.visual.colors.push(...colorsFrom(content));
        result.evidence.push({ field: 'visual.colors', source: doc.name, quote });
        continue;
      }
      const block = steps[target.step]!;
      if (target.kind === 'text') {
        const max = TEXT_MAX[target.field] ?? 2000;
        const value = target.short ? fit(content[0]!, max) : paragraphs(body).join('\n\n');
        const previous = block[target.field] as string | null;
        if (target.short) {
          if (previous) continue; // el primero que lo trae manda
          block[target.field] = value;
        } else if (!previous) {
          block[target.field] = fit(value, max);
        } else if (!normalize(previous).includes(normalize(value).slice(0, 80))) {
          // Otra sección del mismo campo ("Quiénes somos" + "Servicios"): se suma.
          block[target.field] = fit(`${previous}\n\n${value}`, max);
        } else continue;
      } else {
        block[target.field] = [...(block[target.field] as string[]), ...splitList(content)];
      }
      result.evidence.push({ field: `${target.step}.${target.field}`, source: doc.name, quote });
    }

    // Colores escritos en cualquier parte, si no hubo sección de colores.
    if (!result.visual.colors.length) {
      result.visual.colors.push(...colorsFrom(lines).slice(0, 8));
    }
  }

  // Sin una sección de descripción: el primer párrafo sustancial sin título la propone (el
  // usuario la revisa; se cita de dónde salió).
  if (!result.company.description) {
    const intro = loose.find(
      (p) => p.text.length >= 60 && wordCount(p.text) >= 10 && !/^[^:]{2,40}:/.test(p.text),
    );
    if (intro) {
      result.company.description = fit(intro.text, 2000);
      result.evidence.push({
        field: 'company.description',
        source: intro.source,
        quote: fit(intro.text, 200),
      });
      loose.splice(loose.indexOf(intro), 1);
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
  const extra: string[] = [];
  const titles = [...new Set(unmapped)].slice(0, 8);
  if (titles.length) {
    extra.push(
      `Estas secciones no tienen un campo en el onboarding; revísalas por si algo debe ir en otro paso: ${titles.map((t) => `«${t}»`).join(', ')}.`,
    );
  }
  const unused = loose.filter((p) => wordCount(p.text) >= 6).length;
  if (unused) {
    extra.push(
      `Hay ${unused} ${unused === 1 ? 'párrafo' : 'párrafos'} sin título que Pixel no ubicó en ningún campo.`,
    );
  }
  result.notes = [LOCAL_NOTES, ...extra].join(' ');
  return result;
}
