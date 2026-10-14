/*
 * Boca del personaje como UNA sola pieza que cambia de forma (sin capas superpuestas).
 *
 * La boca se describe en 2D, en unidades del radio del ojo (re) y centrada en su sitio:
 * - un labio superior que sigue la sonrisa del estilo;
 * - un labio inferior que, cerrado, queda a un trazo de distancia (la boca es una línea) y,
 *   al abrirse, baja formando una «D»;
 * - lengua (y dientes en `grin`) dentro de esa abertura, que crecen con ella.
 *
 * Cada capa es una rejilla de topología fija (u a lo largo de la boca, v de un borde al otro), así
 * que «abrir» y «redondear» son desplazamientos de vértices: en el .glb son morph targets (`open`,
 * `round`) y en la web el avatar paramétrico usa las mismas funciones. Todo es lineal en `open` y
 * en `round` por separado, que es justo lo que interpolan los morph targets.
 *
 * Funciones puras y sin dependencias: este módulo también se importa desde la web
 * (`@pixel/sculpt/mouth`).
 */

export type MouthStyleName = 'soft_smile' | 'smile' | 'open_smile' | 'grin' | 'line' | 'none';

export interface MouthStyleParams {
  /** Semiancho de la boca. */
  halfWidth: number;
  /** Curvatura de la sonrisa (cuánto suben las comisuras). */
  sag: number;
  /** Grosor del trazo cerrado. */
  thickness: number;
  /** Apertura en reposo (las bocas «abiertas» del concepto). */
  restOpen: number;
  teeth: boolean;
}

const STYLES: Record<Exclude<MouthStyleName, 'none'>, MouthStyleParams> = {
  soft_smile: { halfWidth: 0.68, sag: 0.3, thickness: 0.15, restOpen: 0, teeth: false },
  smile: { halfWidth: 0.84, sag: 0.4, thickness: 0.18, restOpen: 0, teeth: false },
  line: { halfWidth: 0.6, sag: 0.08, thickness: 0.16, restOpen: 0, teeth: false },
  open_smile: { halfWidth: 0.74, sag: 0.34, thickness: 0.14, restOpen: 0.55, teeth: false },
  grin: { halfWidth: 0.96, sag: 0.36, thickness: 0.14, restOpen: 0.5, teeth: true },
};

export function mouthStyle(style: string): MouthStyleParams | null {
  return style in STYLES ? STYLES[style as keyof typeof STYLES] : null;
}

/** Caída máxima del labio inferior con la boca abierta del todo. */
const DROP = 0.92;
/** Cuánto estrechan la boca los labios redondeados (o, u). */
const ROUND_NARROW = 0.38;

export const MOUTH_U = 40;
export const MOUTH_V = 4;

export type MouthLayer = 'inner' | 'tongue' | 'teeth';

/** Perfil de la abertura a lo largo de la boca: 1 en el centro, 0 en las comisuras. */
const bell = (u: number) => Math.sqrt(Math.max(0, 1 - u * u));

function upper(p: MouthStyleParams, u: number, open: number, round: number): [number, number] {
  const x = u * p.halfWidth * (1 - ROUND_NARROW * round);
  // Al abrir, el labio superior sube un poco en el centro.
  const y = p.sag * u * u - p.sag * 0.55 + 0.07 * open * (1 - u * u);
  return [x, y];
}

function lowerY(p: MouthStyleParams, u: number, open: number, round: number): number {
  const top = upper(p, u, open, round)[1];
  // Trazo con extremos afinados (como un pincel) + caída en forma de D.
  const stroke = p.thickness * (0.3 + 0.7 * Math.pow(bell(u), 0.5));
  return top - stroke - open * DROP * Math.pow(bell(u), 1.15);
}

/**
 * Puntos 2D de una capa: (MOUTH_U + 1) × (MOUTH_V + 1), fila a fila (v = 0 borde superior).
 * Devuelve null si el estilo no tiene esa capa.
 */
export function mouthLayer(
  style: string,
  layer: MouthLayer,
  open: number,
  round: number,
): Float32Array | null {
  const p = mouthStyle(style);
  if (!p) return null;
  if (layer === 'teeth' && !p.teeth) return null;
  const out = new Float32Array((MOUTH_U + 1) * (MOUTH_V + 1) * 2);
  let k = 0;
  for (let j = 0; j <= MOUTH_V; j++) {
    const v = j / MOUTH_V;
    for (let i = 0; i <= MOUTH_U; i++) {
      const u0 = -1 + (2 * i) / MOUTH_U;
      let x: number;
      let top: number;
      let bottom: number;
      if (layer === 'inner') {
        [x, top] = upper(p, u0, open, round);
        bottom = lowerY(p, u0, open, round);
      } else if (layer === 'teeth') {
        // Franja bajo el labio superior, solo en la parte central.
        const u = u0 * 0.78;
        [x, top] = upper(p, u, open, round);
        const inner = top - p.thickness * 0.35;
        top = inner + 0.0;
        bottom = inner - open * 0.2 * Math.pow(bell(u0), 0.6);
      } else {
        // Lengua: un montículo sobre el labio inferior, más estrecho que la boca.
        const u = u0 * 0.56;
        x = upper(p, u, open, round)[0];
        // Separada del borde: con la boca casi cerrada no asoma.
        bottom = lowerY(p, u, open, round) + open * 0.08;
        top = bottom + open * 0.3 * Math.pow(bell(u0), 0.9);
      }
      out[k++] = x;
      out[k++] = top + (bottom - top) * v;
    }
  }
  return out;
}

/** Triángulos de la rejilla (mismo orden de vértices que `mouthLayer`). */
export function mouthIndices(): Uint32Array {
  const idx: number[] = [];
  const row = MOUTH_U + 1;
  for (let j = 0; j < MOUTH_V; j++) {
    for (let i = 0; i < MOUTH_U; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      // Vistos de frente (+Z): sentido antihorario (y hacia abajo al crecer v).
      idx.push(a, c, b, b, c, d);
    }
  }
  return Uint32Array.from(idx);
}

export const MOUTH_LAYERS: MouthLayer[] = ['inner', 'teeth', 'tongue'];
