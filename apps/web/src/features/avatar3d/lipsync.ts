/*
 * Sincronía labial (lip-sync) a partir del texto, sin audio ni servicios externos.
 *
 * 1. `buildTimeline(text)` convierte lo que Pixel va a decir en una secuencia de visemas del
 *    español (la forma de la boca para cada sonido) con duraciones estimadas. El español se lee
 *    casi como se escribe, así que las reglas de grafema → fonema bastan: dígrafos (ch, ll, rr,
 *    qu, gu), h muda, c/g suaves, vocales tónicas (tildes) un poco más largas y abiertas, y pausas
 *    en comas y puntos.
 * 2. `mouthAt(timeline, t)` da la forma de la boca en el instante t con coarticulación: cada sonido
 *    se funde con el siguiente, como hace la boca real, en lugar de saltar.
 * 3. `SpeechClock` mantiene el cronograma alineado con la voz real: la voz del navegador avisa al
 *    empezar cada palabra (`boundary`) y el reloj se reancla ahí y ajusta su velocidad a la de esa
 *    voz. Si la voz no da esos avisos, el reloj sigue la estimación; sin voz, el mismo cronograma
 *    mueve la boca mientras el texto aparece en pantalla.
 *
 * Funciones puras (salvo el reloj, que recibe `now`): se prueban sin navegador.
 */

/** Forma de la boca: apertura (mandíbula), anchura (comisuras) y redondez (labios en «o/u»). */
export interface MouthShape {
  open: number;
  wide: number;
  round: number;
}

export const REST_MOUTH: MouthShape = { open: 0, wide: 0.5, round: 0 };

/** Visemas: misma familia que la convención Oculus / Ready Player Me (docs/AVATAR-ASSET-CONTRACT.md). */
export type Viseme =
  | 'sil'
  | 'aa'
  | 'E'
  | 'I'
  | 'O'
  | 'U'
  | 'PP'
  | 'FF'
  | 'SS'
  | 'DD'
  | 'kk'
  | 'CH'
  | 'RR'
  | 'nn';

export const VISEME_SHAPES: Record<Viseme, MouthShape> = {
  sil: REST_MOUTH,
  aa: { open: 0.95, wide: 0.55, round: 0 },
  E: { open: 0.6, wide: 0.85, round: 0 },
  I: { open: 0.36, wide: 1, round: 0 },
  O: { open: 0.72, wide: 0.22, round: 0.75 },
  U: { open: 0.38, wide: 0.08, round: 1 },
  PP: { open: 0, wide: 0.42, round: 0.05 },
  FF: { open: 0.12, wide: 0.62, round: 0 },
  SS: { open: 0.2, wide: 0.85, round: 0 },
  DD: { open: 0.3, wide: 0.55, round: 0 },
  kk: { open: 0.38, wide: 0.5, round: 0 },
  CH: { open: 0.26, wide: 0.3, round: 0.55 },
  RR: { open: 0.3, wide: 0.5, round: 0.1 },
  nn: { open: 0.22, wide: 0.55, round: 0 },
};

export interface TimedViseme {
  viseme: Viseme;
  /** Inicio y fin en ms (a velocidad 1). */
  start: number;
  end: number;
  /** Intensidad (vocal tónica > átona). */
  weight: number;
}

export interface TimedWord {
  /** Índice del primer carácter de la palabra en el texto original. */
  char: number;
  /** Índice del carácter siguiente al final de la palabra. */
  end: number;
  start: number;
}

export interface LipSyncTimeline {
  visemes: TimedViseme[];
  words: TimedWord[];
  /** Duración total en ms. */
  duration: number;
}

const VOWEL = 95;
const STRESSED_VOWEL = 120;
const CONSONANT = 62;
const CLOSURE = 74; // m, b, p: los labios se cierran un poco más
const WORD_GAP = 28;
const COMMA = 210;
const STOP = 380;

const STRESSED: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };
const VOWELS: Record<string, Viseme> = { a: 'aa', e: 'E', i: 'I', o: 'O', u: 'U', y: 'I' };
const CONSONANTS: Record<string, Viseme> = {
  b: 'PP',
  p: 'PP',
  m: 'PP',
  v: 'PP',
  f: 'FF',
  s: 'SS',
  z: 'SS',
  x: 'kk',
  k: 'kk',
  q: 'kk',
  j: 'kk',
  g: 'kk',
  c: 'kk',
  t: 'DD',
  d: 'DD',
  l: 'DD',
  n: 'nn',
  ñ: 'CH',
  r: 'RR',
  w: 'U',
};

const LETTER = /[a-záéíóúüñ0-9]/i;

/** Lee un número como sílabas aproximadas (no hace falta la palabra exacta para mover la boca). */
const DIGIT_SOUNDS: Record<string, Viseme[]> = {
  '0': ['SS', 'E', 'RR', 'O'],
  '1': ['U', 'nn', 'O'],
  '2': ['DD', 'O', 'SS'],
  '3': ['DD', 'RR', 'E', 'SS'],
  '4': ['kk', 'U', 'aa', 'DD', 'RR', 'O'],
  '5': ['SS', 'I', 'nn', 'kk', 'O'],
  '6': ['SS', 'E', 'I', 'SS'],
  '7': ['SS', 'I', 'E', 'DD', 'E'],
  '8': ['O', 'CH', 'O'],
  '9': ['nn', 'U', 'E', 'PP', 'E'],
};

/** Fonemas (visemas) de una palabra en minúsculas. */
export function wordVisemes(word: string): { viseme: Viseme; stressed: boolean }[] {
  const out: { viseme: Viseme; stressed: boolean }[] = [];
  const w = word.toLowerCase();
  for (let i = 0; i < w.length; i++) {
    const c = w[i]!;
    const next = w[i + 1] ?? '';
    const after = w[i + 2] ?? '';
    if (/[0-9]/.test(c)) {
      for (const v of DIGIT_SOUNDS[c] ?? []) out.push({ viseme: v, stressed: false });
      continue;
    }
    if (c in STRESSED) {
      out.push({ viseme: VOWELS[STRESSED[c]!]!, stressed: true });
      continue;
    }
    if (c === 'ü') {
      out.push({ viseme: 'U', stressed: false });
      continue;
    }
    if (c === 'h') continue; // muda (la «ch» se trata en la c)
    if (c === 'c' && next === 'h') {
      out.push({ viseme: 'CH', stressed: false });
      i++;
      continue;
    }
    if (c === 'l' && next === 'l') {
      out.push({ viseme: 'CH', stressed: false });
      i++;
      continue;
    }
    if (c === 'r' && next === 'r') {
      out.push({ viseme: 'RR', stressed: false });
      i++;
      continue;
    }
    // «qu» y «gu» ante e/i: la u no suena.
    if ((c === 'q' || c === 'g') && next === 'u' && /[eéií]/.test(after)) {
      out.push({ viseme: 'kk', stressed: false });
      i++;
      continue;
    }
    // c y z suaves ante e/i se pronuncian como s (seseo).
    if (c === 'c' && /[eéií]/.test(next)) {
      out.push({ viseme: 'SS', stressed: false });
      continue;
    }
    // «y» sola o entre vocales suena como consonante (ll); al final, como i.
    if (c === 'y' && next && /[aeiouáéíóú]/.test(next)) {
      out.push({ viseme: 'CH', stressed: false });
      continue;
    }
    const vowel = VOWELS[c];
    if (vowel) {
      out.push({ viseme: vowel, stressed: false });
      continue;
    }
    const consonant = CONSONANTS[c];
    if (consonant) out.push({ viseme: consonant, stressed: false });
  }
  return out;
}

/** Cronograma de visemas para `text` a la velocidad `rate` (1 = normal). */
export function buildTimeline(text: string, rate = 1): LipSyncTimeline {
  const speed = Math.min(3, Math.max(0.3, rate));
  const visemes: TimedViseme[] = [];
  const words: TimedWord[] = [];
  let t = 0;
  const push = (viseme: Viseme, duration: number, weight: number) => {
    const d = duration / speed;
    const last = visemes[visemes.length - 1];
    // Dos silencios seguidos se unen.
    if (viseme === 'sil' && last?.viseme === 'sil') last.end += d;
    else visemes.push({ viseme, start: t, end: t + d, weight });
    t += d;
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (LETTER.test(c)) {
      let j = i;
      while (
        j < text.length &&
        (LETTER.test(text[j]!) || (text[j] === "'" && LETTER.test(text[j + 1] ?? '')))
      )
        j++;
      const word = text.slice(i, j);
      words.push({ char: i, end: j, start: t });
      const phones = wordVisemes(word);
      // Sin tilde, en español la tónica suele ser la penúltima sílaba: la penúltima vocal.
      const vowelIdx = phones
        .map((p, k) => (['aa', 'E', 'I', 'O', 'U'].includes(p.viseme) ? k : -1))
        .filter((k) => k >= 0);
      const hasAccent = phones.some((p) => p.stressed);
      const stressAt = hasAccent ? -1 : (vowelIdx[vowelIdx.length - 2] ?? vowelIdx[0] ?? -1);
      phones.forEach((p, k) => {
        const isVowel = vowelIdx.includes(k);
        const stressed = p.stressed || k === stressAt;
        const duration = isVowel
          ? stressed
            ? STRESSED_VOWEL
            : VOWEL
          : p.viseme === 'PP'
            ? CLOSURE
            : CONSONANT;
        push(p.viseme, duration, isVowel ? (stressed ? 1 : 0.82) : 1);
      });
      push('sil', WORD_GAP, 1);
      i = j;
      continue;
    }
    if (/[.!?…;]/.test(c)) push('sil', STOP, 1);
    else if (/[,:\n—–()]/.test(c)) push('sil', COMMA, 1);
    i++;
  }
  // Cierre: la boca vuelve a reposo.
  if (visemes.length && visemes[visemes.length - 1]!.viseme !== 'sil') push('sil', 120, 1);
  return { visemes, words, duration: t };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

function shapeOf(v: TimedViseme): MouthShape {
  const s = VISEME_SHAPES[v.viseme];
  return { open: s.open * v.weight, wide: s.wide, round: s.round };
}

function mix(a: MouthShape, b: MouthShape, t: number): MouthShape {
  return {
    open: a.open + (b.open - a.open) * t,
    wide: a.wide + (b.wide - a.wide) * t,
    round: a.round + (b.round - a.round) * t,
  };
}

/** Índice del visema activo en t (búsqueda binaria). */
function indexAt(visemes: TimedViseme[], t: number): number {
  let lo = 0;
  let hi = visemes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (visemes[mid]!.start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Forma de la boca en t (ms). Coarticulación: el último 45 % de cada sonido ya se mueve hacia el
 * siguiente; las consonantes breves toman parte de la apertura de la vocal vecina.
 */
export function mouthAt(timeline: LipSyncTimeline, t: number): MouthShape {
  const { visemes } = timeline;
  if (!visemes.length || t <= 0 || t >= timeline.duration) return REST_MOUTH;
  const i = indexAt(visemes, t);
  const current = visemes[i]!;
  const next = visemes[i + 1];
  let shape = shapeOf(current);
  // Una consonante entre vocales no cierra del todo (salvo m/b/p, que sí juntan los labios).
  if (current.viseme !== 'PP' && current.viseme !== 'sil' && next && next.viseme !== 'sil') {
    const n = shapeOf(next);
    shape = { ...shape, open: Math.max(shape.open, n.open * 0.35) };
  }
  if (!next) return shape;
  const span = current.end - current.start;
  const blendFrom = current.start + span * 0.55;
  if (t <= blendFrom) return shape;
  const k = smooth(Math.min(1, (t - blendFrom) / (current.end - blendFrom)));
  return mix(shape, shapeOf(next), k * 0.85);
}

/** Cuántos caracteres del texto ya se dijeron en t (por palabras completas). */
export function charsSpokenAt(timeline: LipSyncTimeline, t: number, textLength: number): number {
  if (t >= timeline.duration) return textLength;
  let spoken = 0;
  for (const word of timeline.words) {
    if (word.start > t) break;
    spoken = word.end;
  }
  return spoken;
}

/** Palabra que contiene (o empieza en) `charIndex`, para anclar el reloj a la voz. */
export function wordAtChar(timeline: LipSyncTimeline, charIndex: number): number {
  const { words } = timeline;
  for (let k = words.length - 1; k >= 0; k--) if (words[k]!.char <= charIndex) return k;
  return 0;
}

/**
 * Reloj del habla. Avanza a la velocidad estimada y, si la voz informa los límites de palabra,
 * se reancla en cada uno y adopta la velocidad real de esa voz (cada voz del sistema habla a su
 * ritmo). Mientras espera el aviso de la palabra siguiente, la boca se queda en reposo en lugar de
 * adelantarse a la voz.
 */
export class SpeechClock {
  readonly timeline: LipSyncTimeline;
  private startedAt: number | null = null;
  private base = 0;
  private baseTime = 0;
  private speed = 1;
  private anchors = 0;
  private firstAnchor: { pos: number; time: number } | null = null;
  private limit = Infinity;
  private ended = false;

  constructor(timeline: LipSyncTimeline) {
    this.timeline = timeline;
  }

  get started(): boolean {
    return this.startedAt !== null;
  }

  get finished(): boolean {
    return this.ended;
  }

  /** El audio empezó (o, sin voz, el texto empieza a aparecer). */
  begin(now: number): void {
    if (this.startedAt !== null) return;
    this.startedAt = now;
    this.base = 0;
    this.baseTime = now;
  }

  /** La voz empezó a decir la palabra que comienza en `charIndex`. */
  boundary(charIndex: number, now: number): void {
    if (this.ended) return;
    this.begin(now);
    const k = wordAtChar(this.timeline, charIndex);
    const word = this.timeline.words[k];
    if (!word) return;
    if (this.firstAnchor && now > this.firstAnchor.time + 150) {
      const observed = (word.start - this.firstAnchor.pos) / (now - this.firstAnchor.time);
      if (observed > 0) {
        const clamped = Math.min(2.5, Math.max(0.4, observed));
        this.speed = this.speed * 0.4 + clamped * 0.6;
      }
    } else if (!this.firstAnchor) {
      this.firstAnchor = { pos: word.start, time: now };
    }
    this.base = word.start;
    this.baseTime = now;
    this.anchors++;
    const following = this.timeline.words[k + 1];
    // Sin el aviso de la palabra siguiente, no pasar de su comienzo (la voz aún no llegó).
    this.limit = following ? following.start - 1 : Infinity;
  }

  /** La voz terminó (o se canceló). */
  end(): void {
    this.ended = true;
  }

  /** Posición en el cronograma (ms) en el instante `now`. */
  position(now: number): number {
    if (this.ended) return this.timeline.duration;
    if (this.startedAt === null) return 0;
    const pos = this.base + (now - this.baseTime) * this.speed;
    return this.anchors > 0 ? Math.min(pos, this.limit) : pos;
  }

  mouth(now: number): MouthShape {
    if (this.startedAt === null || this.ended) return REST_MOUTH;
    return mouthAt(this.timeline, this.position(now));
  }

  spokenChars(now: number, textLength: number): number {
    if (this.ended) return textLength;
    return charsSpokenAt(this.timeline, this.position(now), textLength);
  }
}
