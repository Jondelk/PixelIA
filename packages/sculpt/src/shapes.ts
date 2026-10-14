import type { Shape, Vec3 } from './sdf.js';
import { clamp, len3, normalize, smax } from './sdf.js';

/*
 * Formas y herramientas de modelado de más alto nivel: lathe (revolución), extrusiones 2D,
 * semiespacios, calcomanías que siguen la superficie y trazado de rayos sobre un campo.
 */

const BIG = 1e3;

/** Multiplica la distancia por `k` (< 1) cuando una deformación exagera el campo. */
export function lipschitz(shape: Shape, k: number): Shape {
  return { d: (x, y, z) => shape.d(x, y, z) * k, min: shape.min, max: shape.max };
}

/** Semiespacio n·p ≤ offset (n unitario). */
export function halfSpace(n: Vec3, offset: number): Shape {
  const [a, b, c] = normalize(n);
  return {
    d: (x, y, z) => a * x + b * y + c * z - offset,
    min: [-BIG, -BIG, -BIG],
    max: [BIG, BIG, BIG],
  };
}

/** Sólido de revolución alrededor de Y: radio r(y) entre y0 e y1. `k` corrige la pendiente. */
export function revolve(
  radius: (y: number) => number,
  y0: number,
  y1: number,
  rMax: number,
  k = 0.75,
): Shape {
  return {
    d: (x, y, z) => {
      const yc = clamp(y, y0, y1);
      const side = (Math.sqrt(x * x + z * z) - Math.max(0, radius(yc))) * k;
      const caps = Math.max(y0 - y, y - y1);
      return Math.max(side, caps);
    },
    min: [-rMax, y0, -rMax],
    max: [rMax, y1, rMax],
  };
}

/** Extrusión en Z de un perfil 2D (plano XY), con semiprofundidad `h` y bordes redondeados `r`. */
export function extrude(
  profile: (x: number, y: number) => number,
  h: number,
  r: number,
  bounds: { min: [number, number]; max: [number, number] },
): Shape {
  return {
    d: (x, y, z) => {
      const dx = profile(x, y) + r;
      const dz = Math.abs(z) - h + r;
      return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) - r;
    },
    min: [bounds.min[0], bounds.min[1], -h],
    max: [bounds.max[0], bounds.max[1], h],
  };
}

// ---------------------------------------------------------------- 2D

export const circle2D = (cx: number, cy: number, r: number) => (x: number, y: number) =>
  Math.hypot(x - cx, y - cy) - r;

/** Elipse 2D (aproximación con gradiente, buena cerca del borde). */
export const ellipse2D =
  (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) => {
    const px = (x - cx) / rx;
    const py = (y - cy) / ry;
    const k0 = Math.hypot(px, py);
    const k1 = Math.hypot(px / rx, py / ry);
    return k1 < 1e-9 ? -Math.min(rx, ry) : (k0 * (k0 - 1)) / k1;
  };

export const roundRect2D =
  (cx: number, cy: number, hx: number, hy: number, r: number) => (x: number, y: number) => {
    const qx = Math.abs(x - cx) - hx + r;
    const qy = Math.abs(y - cy) - hy + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  };

// ---------------------------------------------------------------- trazado

export interface Hit {
  p: Vec3;
  n: Vec3;
}

export function normalAt(shape: Shape, x: number, y: number, z: number, eps = 1e-3): Vec3 {
  const f = shape.d;
  return normalize([
    f(x + eps, y, z) - f(x - eps, y, z),
    f(x, y + eps, z) - f(x, y - eps, z),
    f(x, y, z + eps) - f(x, y, z - eps),
  ]);
}

/** Avanza por el campo (sphere tracing) desde `origin` en `dir` hasta tocar la superficie. */
export function trace(shape: Shape, origin: Vec3, dir: Vec3, maxT = 20): Hit | null {
  const d = normalize(dir);
  let t = 0;
  for (let i = 0; i < 512 && t < maxT; i++) {
    const x = origin[0] + d[0] * t;
    const y = origin[1] + d[1] * t;
    const z = origin[2] + d[2] * t;
    const v = shape.d(x, y, z);
    if (v < 1e-4) {
      // Refina hacia atrás si se pasó.
      const back = v < 0 ? v : 0;
      const p: Vec3 = [x + d[0] * back, y + d[1] * back, z + d[2] * back];
      return { p, n: normalAt(shape, p[0], p[1], p[2]) };
    }
    t += Math.max(v * 0.7, 1e-4);
  }
  return null;
}

/** Punto de la cara frontal (+Z) a la altura (x, y). */
export const frontHit = (shape: Shape, x: number, y: number) =>
  trace(shape, [x, y, shape.max[2] + 1], [0, 0, -1]);
/** Punto del lateral (lado = ±1 en X) a la altura y. */
export const sideHit = (shape: Shape, side: number, y: number, z = 0) =>
  trace(
    shape,
    [side * (Math.abs(side > 0 ? shape.max[0] : shape.min[0]) + 1), y, z],
    [-side, 0, 0],
  );
/** Punto superior en (x, z). */
export const topHit = (shape: Shape, x = 0, z = 0) =>
  trace(shape, [x, shape.max[1] + 1, z], [0, -1, 0]);
/** Punto inferior en (x, z). */
export const bottomHit = (shape: Shape, x = 0, z = 0) =>
  trace(shape, [x, shape.min[1] - 1, z], [0, 1, 0]);

// ---------------------------------------------------------------- calcomanías

export interface DecalOptions {
  /** Perfil 2D en el plano XY (coordenadas del mundo). */
  profile: (x: number, y: number) => number;
  /** Punto de la superficie donde se apoya (acota la pieza). */
  at: Vec3;
  /** Semiancho y semialto del perfil alrededor de `at`. */
  half: [number, number];
  /** Altura sobre la superficie: constante o en función de (x, y) (abombado). */
  lift: number | ((x: number, y: number) => number);
  /** Cuánto se hunde por debajo de la superficie (oculta la unión). */
  sink: number;
  /** Profundidad (Z) que puede abarcar la superficie dentro de la calcomanía. */
  reach: number;
  /** Redondeo del canto. */
  bevel?: number;
}

/**
 * Calcomanía con volumen que sigue la superficie: rasgos pintados (ojos, boca, cejas) que se
 * curvan con el cuerpo y tienen un canto limpio, como la pintura en relieve de una figura de vinilo.
 */
export function decal(surface: Shape, o: DecalOptions): Shape {
  const lift =
    typeof o.lift === 'number' ? ((() => o.lift) as (x: number, y: number) => number) : o.lift;
  const bevel = o.bevel ?? 0;
  const [ax, ay, az] = o.at;
  return {
    d: (x, y, z) => {
      const s = surface.d(x, y, z);
      const layer = Math.max(s - lift(x, y), -s - o.sink);
      const zLimit = Math.max(az - o.reach - z, z - az - o.reach);
      return smax(smax(layer, o.profile(x, y), bevel), zLimit, bevel);
    },
    min: [ax - o.half[0], ay - o.half[1], az - o.reach],
    max: [ax + o.half[0], ay + o.half[1], az + o.reach],
  };
}

/** Elevación abombada: `base` en el borde y `base + dome` en el centro (radio r). */
export const domeLift =
  (cx: number, cy: number, rx: number, ry: number, base: number, dome: number) =>
  (x: number, y: number) => {
    const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    return base + dome * Math.max(0, 1 - q);
  };

// ---------------------------------------------------------------- ruido

function hash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Ruido de valor 3D suave en [−1, 1]. */
export function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  const r = l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
  return r * 2 - 1;
}

export const dist3 = (a: Vec3, b: Vec3) => len3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
