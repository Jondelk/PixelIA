/*
 * Campos de distancia con signo (SDF): la "arcilla" de Pixel Sculpt.
 *
 * Cada forma es una función f(x, y, z) → distancia a su superficie (negativa dentro) más su caja
 * envolvente. Las formas se combinan con uniones suaves (las piezas se funden como en una
 * escultura), restas, intersecciones y desplazamientos. Las cajas permiten descartar piezas lejanas
 * al evaluar uniones grandes y acotar la malla.
 *
 * Coordenadas glTF: Y arriba, el personaje mira hacia +Z, unidades en metros.
 */

export type Vec3 = [number, number, number];

export interface Shape {
  d: (x: number, y: number, z: number) => number;
  min: Vec3;
  max: Vec3;
}

// ---------------------------------------------------------------- utilidades

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function len3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function normalize(v: Vec3): Vec3 {
  const n = len3(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const box = (min: Vec3, max: Vec3) => ({ min, max });
const around = (c: Vec3, r: Vec3) => box(sub(c, r), add(c, r));

/** Distancia de un punto a una caja (0 si está dentro). */
export function boxDistance(x: number, y: number, z: number, min: Vec3, max: Vec3): number {
  const dx = Math.max(min[0] - x, 0, x - max[0]);
  const dy = Math.max(min[1] - y, 0, y - max[1]);
  const dz = Math.max(min[2] - z, 0, z - max[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Gradiente normalizado (normal de la superficie) por diferencias centrales. */
export function gradient(shape: Shape, x: number, y: number, z: number, eps = 1e-3): Vec3 {
  const f = shape.d;
  return normalize([
    f(x + eps, y, z) - f(x - eps, y, z),
    f(x, y + eps, z) - f(x, y - eps, z),
    f(x, y, z + eps) - f(x, y, z - eps),
  ]);
}

// ---------------------------------------------------------------- rotaciones

/** Matriz 3×3 (fila mayor) de rotación a partir de ángulos de Euler XYZ (radianes). */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export function rotationXYZ(rx: number, ry: number, rz: number): Mat3 {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(rx),
    Math.sin(rx),
    Math.cos(ry),
    Math.sin(ry),
    Math.cos(rz),
    Math.sin(rz),
  ];
  // R = Rz · Ry · Rx
  return [
    cz * cy,
    cz * sy * sx - sz * cx,
    cz * sy * cx + sz * sx,
    sz * cy,
    sz * sy * sx + cz * cx,
    sz * sy * cx - cz * sx,
    -sy,
    cy * sx,
    cy * cx,
  ];
}

/** Rotación que lleva el eje Y local a la dirección `dir` (para piezas alargadas). */
export function alignY(dir: Vec3): Mat3 {
  const y = normalize(dir);
  const ref: Vec3 = Math.abs(y[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const x = normalize(cross(ref, y));
  const z = cross(x, y);
  // Columnas = ejes locales en coordenadas del mundo.
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

export const applyMat = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/** Coloca una forma (modelada en el origen) en `at` con la rotación `rot`. */
export function place(shape: Shape, at: Vec3, rot?: Mat3): Shape {
  const [tx, ty, tz] = at;
  if (!rot) {
    return {
      d: (x, y, z) => shape.d(x - tx, y - ty, z - tz),
      min: add(shape.min, at),
      max: add(shape.max, at),
    };
  }
  const m = rot;
  // Caja: las 8 esquinas rotadas.
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const c: Vec3 = [
      i & 1 ? shape.max[0] : shape.min[0],
      i & 2 ? shape.max[1] : shape.min[1],
      i & 4 ? shape.max[2] : shape.min[2],
    ];
    const w = applyMat(m, c);
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, w[k]! + at[k]!);
      hi[k] = Math.max(hi[k]!, w[k]! + at[k]!);
    }
  }
  return {
    d: (x, y, z) => {
      const px = x - tx;
      const py = y - ty;
      const pz = z - tz;
      // Inversa de una rotación = transpuesta.
      return shape.d(
        m[0] * px + m[3] * py + m[6] * pz,
        m[1] * px + m[4] * py + m[7] * pz,
        m[2] * px + m[5] * py + m[8] * pz,
      );
    },
    min: lo,
    max: hi,
  };
}

// ---------------------------------------------------------------- primitivas

export function sphere(c: Vec3, r: number): Shape {
  const [cx, cy, cz] = c;
  return { d: (x, y, z) => len3(x - cx, y - cy, z - cz) - r, ...around(c, [r, r, r]) };
}

/** Elipsoide (aproximación de distancia de Íñigo Quílez, muy precisa cerca de la superficie). */
export function ellipsoid(c: Vec3, r: Vec3): Shape {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  return {
    d: (x, y, z) => {
      const px = (x - cx) / rx;
      const py = (y - cy) / ry;
      const pz = (z - cz) / rz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const k1 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
      return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
    },
    ...around(c, r),
  };
}

/** Caja con aristas redondeadas (semiejes `h`, radio `r`). */
export function roundBox(c: Vec3, h: Vec3, r: number): Shape {
  const [cx, cy, cz] = c;
  const [hx, hy, hz] = [h[0] - r, h[1] - r, h[2] - r];
  return {
    d: (x, y, z) => {
      const qx = Math.abs(x - cx) - hx;
      const qy = Math.abs(y - cy) - hy;
      const qz = Math.abs(z - cz) - hz;
      const outside = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
      return outside + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
    ...around(c, h),
  };
}

export function capsule(a: Vec3, b: Vec3, r: number): Shape {
  return roundCone(a, b, r, r);
}

/** Cono redondeado entre `a` (radio ra) y `b` (radio rb). Exacto (Quílez). */
export function roundCone(a: Vec3, b: Vec3, ra: number, rb: number): Shape {
  const ba = sub(b, a);
  const l2 = dot(ba, ba);
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const R = Math.max(ra, rb);
  return {
    d: (x, y, z) => {
      const pa: Vec3 = [x - a[0], y - a[1], z - a[2]];
      const yy = dot(pa, ba);
      const zz = yy - l2;
      const qx = pa[0] * l2 - ba[0] * yy;
      const qy = pa[1] * l2 - ba[1] * yy;
      const qz = pa[2] * l2 - ba[2] * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
    },
    min: [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R],
    max: [Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R],
  };
}

/** Toro en el plano XZ (eje Y): radio mayor R, radio del tubo r. */
export function torus(R: number, r: number): Shape {
  return {
    d: (x, y, z) => {
      const q = Math.sqrt(x * x + z * z) - R;
      return Math.sqrt(q * q + y * y) - r;
    },
    min: [-R - r, -r, -R - r],
    max: [R + r, r, R + r],
  };
}

/** Cilindro vertical (eje Y) de radio r y semialtura h, con bordes redondeados rb. */
export function roundCylinder(r: number, h: number, rb: number): Shape {
  return {
    d: (x, y, z) => {
      const dx = Math.sqrt(x * x + z * z) - r + rb;
      const dy = Math.abs(y) - h + rb;
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rb;
    },
    min: [-r, -h, -r],
    max: [r, h, r],
  };
}

/** Poliedro convexo: intersección de semiespacios (normal unitaria, distancia), con aristas suaves. */
export function polyhedron(planes: { n: Vec3; d: number }[], bevel: number, bound: Vec3): Shape {
  const k = bevel;
  return {
    d: (x, y, z) => {
      // Máximo suave (log-sum-exp): bisela las aristas en lugar de dejarlas como cuchillas.
      let m = -Infinity;
      const values = planes.map((p) => {
        const v = p.n[0] * x + p.n[1] * y + p.n[2] * z - p.d;
        if (v > m) m = v;
        return v;
      });
      if (k <= 0) return m;
      let s = 0;
      for (const v of values) s += Math.exp((v - m) / k);
      return m + k * Math.log(s) - k * Math.log(1.5);
    },
    min: [-bound[0], -bound[1], -bound[2]],
    max: bound,
  };
}

// ---------------------------------------------------------------- operaciones

/** Unión con descarte por cajas: solo se evalúan las piezas que pueden estar más cerca. */
export function union(...shapes: Shape[]): Shape {
  if (shapes.length === 1) return shapes[0]!;
  return {
    d: (x, y, z) => {
      let best = Infinity;
      for (const s of shapes) {
        if (boxDistance(x, y, z, s.min, s.max) >= best) continue;
        const v = s.d(x, y, z);
        if (v < best) best = v;
      }
      return best;
    },
    min: [0, 1, 2].map((i) => Math.min(...shapes.map((s) => s.min[i]!))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...shapes.map((s) => s.max[i]!))) as Vec3,
  };
}

/** Mínimo suave polinómico: las formas se funden en un radio `k`. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export function smoothUnion(k: number, ...shapes: Shape[]): Shape {
  const merged = union(...shapes);
  return {
    d: (x, y, z) => {
      let acc = Infinity;
      for (const s of shapes) {
        // Lejos de su caja (más allá del radio de fusión) una pieza no afecta.
        if (boxDistance(x, y, z, s.min, s.max) - k >= acc) continue;
        acc = smin(acc, s.d(x, y, z), k);
      }
      return acc;
    },
    min: sub(merged.min, [k, k, k]),
    max: add(merged.max, [k, k, k]),
  };
}

/** Resta suave: `cut` excava a `base`. */
export function smoothSubtract(base: Shape, cut: Shape, k: number): Shape {
  return {
    d: (x, y, z) => {
      const b = base.d(x, y, z);
      if (boxDistance(x, y, z, cut.min, cut.max) > k + Math.abs(b) + 1e-3 && b > 0) return b;
      return smax(b, -cut.d(x, y, z), k);
    },
    min: base.min,
    max: base.max,
  };
}

export function smoothIntersect(a: Shape, b: Shape, k: number): Shape {
  return {
    d: (x, y, z) => smax(a.d(x, y, z), b.d(x, y, z), k),
    min: [0, 1, 2].map((i) => Math.max(a.min[i]!, b.min[i]!)) as Vec3,
    max: [0, 1, 2].map((i) => Math.min(a.max[i]!, b.max[i]!)) as Vec3,
  };
}

/** Suma un relieve (positivo hunde, negativo levanta) de amplitud máxima `amp`. */
export function displace(
  shape: Shape,
  fn: (x: number, y: number, z: number) => number,
  amp: number,
): Shape {
  return {
    d: (x, y, z) => shape.d(x, y, z) + fn(x, y, z),
    min: sub(shape.min, [amp, amp, amp]),
    max: add(shape.max, [amp, amp, amp]),
  };
}

/** Deformación del espacio antes de evaluar (estrechar, curvar). `slack` amplía la caja. */
export function warp(
  shape: Shape,
  fn: (x: number, y: number, z: number) => Vec3,
  slack: number,
): Shape {
  return {
    d: (x, y, z) => {
      const [u, v, w] = fn(x, y, z);
      return shape.d(u, v, w);
    },
    min: sub(shape.min, [slack, slack, slack]),
    max: add(shape.max, [slack, slack, slack]),
  };
}

/** Capa delgada de grosor 2t alrededor de la superficie (cáscaras, calcomanías). */
export function shell(shape: Shape, t: number, offset = 0): Shape {
  return {
    d: (x, y, z) => Math.abs(shape.d(x, y, z) - offset) - t,
    min: sub(shape.min, [t + offset, t + offset, t + offset]),
    max: add(shape.max, [t + offset, t + offset, t + offset]),
  };
}

/** Recorta una forma a una caja (las caras del recorte son planas). */
export function clipBox(shape: Shape, min: Vec3, max: Vec3): Shape {
  const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const h: Vec3 = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
  return {
    d: (x, y, z) => {
      const qx = Math.abs(x - c[0]) - h[0];
      const qy = Math.abs(y - c[1]) - h[1];
      const qz = Math.abs(z - c[2]) - h[2];
      const bd =
        len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
      return Math.max(shape.d(x, y, z), bd);
    },
    min: [0, 1, 2].map((i) => Math.max(shape.min[i]!, min[i]!)) as Vec3,
    max: [0, 1, 2].map((i) => Math.min(shape.max[i]!, max[i]!)) as Vec3,
  };
}

// ---------------------------------------------------------------- 2D

/** Distancia 2D a un segmento con radio variable (trazos: cejas, sonrisas). */
export function stroke2D(points: [number, number][], radius: number | ((t: number) => number)) {
  const r = typeof radius === 'number' ? () => radius : radius;
  return (x: number, y: number): number => {
    let best = Infinity;
    const n = points.length - 1;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = points[i]!;
      const [bx, by] = points[i + 1]!;
      const dx = bx - ax;
      const dy = by - ay;
      const h = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const d = Math.hypot(x - ax - dx * h, y - ay - dy * h) - r((i + h) / n);
      if (d < best) best = d;
    }
    return best;
  };
}

/** Vesica (forma de hoja): dos arcos que se cortan; ancho total 2w, alto total 2h. */
export function vesica2D(w: number, h: number) {
  const d = (h * h - w * w) / (2 * w);
  return (x: number, y: number): number => {
    const px = Math.abs(x);
    const py = Math.abs(y);
    return (py - h) * d > px * h ? Math.hypot(px, py - h) : Math.hypot(px + d, py) - (d + w);
  };
}
