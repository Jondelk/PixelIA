import type { Shape, Vec3 } from './sdf.js';
import {
  clamp,
  ellipsoid,
  mix,
  polyhedron,
  roundBox,
  roundCone,
  roundCylinder,
  smax,
  smin,
  smoothstep,
  smoothSubtract,
  smoothUnion,
  place,
  warp,
} from './sdf.js';
import { extrude, lipschitz, roundRect2D, valueNoise } from './shapes.js';
import type { CharacterSpec } from './spec.js';

/*
 * Cuerpos por sujeto. Cada constructor devuelve el cuerpo centrado en el origen (Y arriba,
 * frente +Z) y, si hace falta, varias piezas con materiales distintos (cápsula bicolor, tapas y
 * páginas de un libro…). La superficie `surface` es la que reciben el rostro y los accesorios.
 */

export interface Dims {
  /** Semiejes: ancho (X), alto (Y), fondo (Z). */
  a: number;
  hb: number;
  c: number;
  /** Escala de los rasgos y extremidades. */
  unit: number;
  /** Escala absoluta (1 = personaje de referencia). */
  s: number;
}

export type BodyMaterial = 'body' | 'body2' | 'body3' | 'pages';

/** Pintura por vértice: recibe el color base (lineal) y devuelve el final. */
export type Paint = (x: number, y: number, z: number, base: Vec3) => Vec3;

export interface BodyPiece {
  name: string;
  shape: Shape;
  material: BodyMaterial;
  paint?: Paint;
}

export interface BodyBuild {
  pieces: BodyPiece[];
  surface: Shape;
  /** Altura de los ojos como fracción del semialto. */
  faceY: number;
  boxy: boolean;
}

export interface BodyPalette {
  body: Vec3;
  shade: Vec3;
  secondary: Vec3;
  accent: Vec3;
}

const mixv = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function bodyDims(spec: CharacterSpec): Dims {
  const a = 0.62 * clamp(spec.body.width, 0.55, 1.5);
  const hb = 0.8 * clamp(spec.body.height, 0.55, 1.5);
  const c = 0.52 * clamp(spec.body.depth, 0.5, 1.5);
  const unit = Math.min(a, hb);
  return { a, hb, c, unit, s: unit / 0.6 };
}

/** Relieve fino según el detalle de superficie pedido (granulado, líneas de panel…). */
function surfaceRelief(spec: CharacterSpec, dims: Dims, shape: Shape): Shape {
  if (spec.body.surfaceDetail === 'grain') {
    const amp = 0.004 * dims.s;
    const f = 28 / dims.s;
    return lipschitz(
      {
        d: (x, y, z) => shape.d(x, y, z) + amp * valueNoise(x * f, y * f, z * f),
        min: shape.min,
        max: shape.max,
      },
      0.8,
    );
  }
  return shape;
}

// ---------------------------------------------------------------- blob

function blob(spec: CharacterSpec, d: Dims, subject: string, _palette: BodyPalette): BodyBuild {
  const { a, hb, c, unit } = d;
  const r = clamp(spec.body.roundness, 0, 1);
  const loaf = subject === 'bread_loaf';
  const hy = loaf ? hb * 0.82 : hb;
  const egg = warp(
    ellipsoid([0, 0, 0], [a, hy, c]),
    (x, y, z) => {
      const s = 1 + (loaf ? 0.04 : 0.1) * (-y / hy);
      return [x / s, y, z / s];
    },
    a * 0.12,
  );
  const box = roundBox([0, 0, 0], [a * 0.94, hy * 0.96, c * 0.94], unit * 0.38);
  const t = 0.4 + 0.6 * r;
  const floor = -hy * (loaf ? 0.62 : 0.9);
  let shape: Shape = lipschitz(
    {
      d: (x, y, z) => smax(mix(box.d(x, y, z), egg.d(x, y, z), t), floor - y, unit * 0.22),
      min: [-a * 1.15, -hy, -c * 1.15],
      max: [a * 1.15, hy, c * 1.15],
    },
    0.85,
  );
  let paint: Paint | undefined;
  if (loaf) {
    // Cortes del pan en la corteza superior, por detrás del rostro.
    const base = shape;
    const cut = (x: number, y: number, z: number) => {
      if (y < hy * 0.2 || z > c * 0.25) return 0;
      const u = x * 0.8 + z * 0.6;
      const k = Math.abs(((u / (a * 0.55) + 10.5) % 1) - 0.5) * a * 0.55;
      return 0.03 * d.s * Math.exp(-((k / (0.035 * d.s)) ** 2)) * smoothstep(hy * 0.2, hy * 0.5, y);
    };
    shape = lipschitz(
      { d: (x, y, z) => base.d(x, y, z) + cut(x, y, z), min: base.min, max: base.max },
      0.7,
    );
    paint = (_x, y, _z, b) =>
      mixv(b, [b[0] * 0.55, b[1] * 0.42, b[2] * 0.3], smoothstep(-0.1 * hy, hy, y) * 0.55);
  }
  shape = surfaceRelief(spec, d, shape);
  return {
    pieces: [{ name: 'Body', shape, material: 'body', paint }],
    surface: shape,
    faceY: 0.1,
    boxy: false,
  };
}

// ---------------------------------------------------------------- semilla

function seed(spec: CharacterSpec, d: Dims, subject: string, palette: BodyPalette): BodyBuild {
  const { a, hb, c, unit, s } = d;
  if (subject === 'cacao_pod') {
    const pod = warp(
      ellipsoid([0, 0, 0], [a, hb, c]),
      (x, y, z) => {
        const k = 1 - 0.28 * smoothstep(0.25, 1, y / hb) - 0.12 * smoothstep(0.4, 1, -y / hb);
        return [x / k, y, z / k];
      },
      a * 0.2,
    );
    const ridge = (x: number, y: number, z: number) => {
      const phi = Math.atan2(x, z);
      const fall = 1 - Math.min(1, (y / hb) ** 2);
      return -0.018 * s * (0.5 + 0.5 * Math.cos(phi * 10)) * fall;
    };
    const shape = lipschitz(
      { d: (x, y, z) => pod.d(x, y, z) + ridge(x, y, z), min: pod.min, max: pod.max },
      0.7,
    );
    const paint: Paint = (x, _y, z, b) => {
      const phi = Math.atan2(x, z);
      return mixv(b, palette.shade, (0.5 - 0.5 * Math.cos(phi * 10)) * 0.35);
    };
    return {
      pieces: [{ name: 'Body', shape, material: 'body', paint }],
      surface: shape,
      faceY: 0.1,
      boxy: false,
    };
  }

  const bean = subject === 'coffee_bean' || spec.body.surfaceDetail === 'center_groove';
  const egg = warp(
    ellipsoid([0, 0, 0], [a, hb, bean ? c * 0.94 : c]),
    (x, y, z) => {
      const k = 1 + 0.07 * (-y / hb);
      return [x / k, y, z / k];
    },
    a * 0.1,
  );
  let shape: Shape = egg;
  let paint: Paint | undefined;
  if (bean) {
    // Hendidura del grano: nace en la espalda, pasa por la coronilla y muere sobre la frente.
    const width = 0.05 * s;
    const depth = 0.07 * s;
    const groove = (x: number, y: number, z: number) => {
      let th = Math.atan2(y, z); // 0 frente, π/2 arriba, π atrás
      if (th < -Math.PI / 2) th += Math.PI * 2;
      const mask = smoothstep(0.75, 1.05, th) * (1 - smoothstep(3.7, 4.1, th));
      if (mask <= 0) return 0;
      const sway = 0.07 * a * Math.sin(th * 1.6);
      const k = (x - sway) / (width * (0.55 + 0.45 * mask));
      return depth * mask * Math.exp(-k * k);
    };
    shape = lipschitz(
      { d: (x, y, z) => egg.d(x, y, z) + groove(x, y, z), min: egg.min, max: egg.max },
      0.6,
    );
    paint = (x, y, z, b) => {
      let th = Math.atan2(y, z);
      if (th < -Math.PI / 2) th += Math.PI * 2;
      const mask = smoothstep(0.75, 1.05, th) * (1 - smoothstep(3.7, 4.1, th));
      const sway = 0.07 * a * Math.sin(th * 1.6);
      const g = Math.exp(-(((x - sway) / (width * 0.9)) ** 2)) * mask;
      return mixv(b, [b[0] * 0.35, b[1] * 0.3, b[2] * 0.28], g * 0.85);
    };
  }
  shape = surfaceRelief(spec, d, shape);
  void unit;
  return {
    pieces: [{ name: 'Body', shape, material: 'body', paint }],
    surface: shape,
    faceY: 0.08,
    boxy: false,
  };
}

// ---------------------------------------------------------------- gota y hoja

function drop(spec: CharacterSpec, d: Dims, subject: string, palette: BodyPalette): BodyBuild {
  const { a, hb, c, unit, s } = d;
  const leaf = subject === 'leaf';
  const R = Math.min(a, hb * 0.75);
  const yC = -hb + R;
  const rt = 0.05 * unit;
  const core = roundCone([0, yC, 0], [0, hb - rt, 0], R, rt);
  const zScale = c / a;
  const bend = (leaf ? 0.22 : 0.14) * unit;
  const shaped = warp(
    core,
    (x, y, z) => {
      const t = Math.max(0, y - yC) / (hb - yC);
      return [x, y, z / zScale + (bend * t * t) / zScale];
    },
    a,
  );
  let shape: Shape = lipschitz(
    { d: shaped.d, min: [-a, -hb, -a * zScale - bend], max: [a, hb, a * zScale] },
    Math.min(1, zScale) * 0.85,
  );
  let paint: Paint | undefined;
  if (leaf || spec.body.surfaceDetail === 'veins') {
    // Nervadura central por detrás y vetas laterales pintadas.
    const base = shape;
    const rib = (x: number, y: number, z: number) =>
      z < 0
        ? 0.03 *
          s *
          Math.exp(-((x / (0.035 * s)) ** 2)) *
          smoothstep(-hb, -hb * 0.6, y) *
          (1 - smoothstep(hb * 0.2, hb * 0.6, y))
        : 0;
    shape = lipschitz(
      { d: (x, y, z) => base.d(x, y, z) + rib(x, y, z), min: base.min, max: base.max },
      0.75,
    );
    paint = (x, y, z, b) => {
      const back = smoothstep(0.05, -0.15, z) + 0.35 * smoothstep(a * 0.55, a * 0.95, Math.abs(x));
      const u = y + Math.abs(x) * 0.9;
      const vein = Math.exp(-((((((u / (0.16 * s)) % 1) + 1) % 1) - 0.5) ** 2) / 0.006);
      const mid = Math.exp(-((x / (0.02 * s)) ** 2));
      const v = clamp(Math.max(vein * 0.8, mid), 0, 1) * clamp(back, 0, 1);
      return mixv(b, mixv(palette.body, palette.secondary, 0.35), v * 0.6);
    };
  }
  shape = surfaceRelief(spec, d, shape);
  return {
    pieces: [{ name: 'Body', shape, material: 'body', paint }],
    surface: shape,
    faceY: -0.02,
    boxy: false,
  };
}

// ---------------------------------------------------------------- cápsula y carrete

function capsule(_spec: CharacterSpec, d: Dims, subject: string, _palette: BodyPalette): BodyBuild {
  const { a, hb, c, s } = d;
  if (subject === 'thread_spool') {
    const fh = 0.1 * hb;
    const rThread = a * 0.84;
    const thread = lipschitz(
      {
        d: (x, y, z) => {
          const r = Math.hypot(x, (z * a) / c);
          const bulge = rThread * (1 + 0.04 * (1 - (y / hb) ** 2));
          const ridge = 0.0045 * s * Math.sin((y / (0.028 * s)) * Math.PI * 2);
          return Math.max(r - bulge + ridge, Math.abs(y) - (hb - fh * 1.5));
        },
        min: [-a, -hb, -c],
        max: [a, hb, c],
      },
      Math.min(1, c / a) * 0.75,
    );
    const flange = (sign: number) =>
      place(
        warp(roundCylinder(a, fh, fh * 0.45), (x, y, z) => [x, y, (z * a) / c], 0),
        [0, sign * (hb - fh), 0],
      );
    const top = lipschitz(flange(1), Math.min(1, c / a));
    const bottom = lipschitz(flange(-1), Math.min(1, c / a));
    const fix = (sh: Shape): Shape => ({
      d: sh.d,
      min: [-a, sh.min[1], -c],
      max: [a, sh.max[1], c],
    });
    return {
      pieces: [
        { name: 'Body', shape: thread, material: 'body' },
        { name: 'Body_Flange_Top', shape: fix(top), material: 'body2' },
        { name: 'Body_Flange_Bottom', shape: fix(bottom), material: 'body2' },
      ],
      surface: thread,
      faceY: 0.12,
      boxy: false,
    };
  }

  const r = Math.min(a, hb * 0.9);
  const pill = lipschitz(
    warp(
      roundCone([0, -hb + r, 0], [0, hb - r, 0], r, r),
      (x, y, z) => [(x * r) / a, y, (z * r) / c],
      0,
    ),
    Math.min(1, c / a, r / a) * 0.95,
  );
  const fixed: Shape = { d: pill.d, min: [-a, -hb, -c], max: [a, hb, c] };
  const seam = -0.2 * hb;
  const gap = 0.0035 * s;
  const k = 0.018 * s;
  const top: Shape = {
    d: (x, y, z) => smax(fixed.d(x, y, z), seam + gap - y, k),
    min: fixed.min,
    max: fixed.max,
  };
  const bottom: Shape = {
    d: (x, y, z) => smax(fixed.d(x, y, z), y - seam + gap, k),
    min: fixed.min,
    max: fixed.max,
  };
  return {
    pieces: [
      { name: 'Body', shape: top, material: 'body' },
      { name: 'Body_Lower', shape: bottom, material: 'body2' },
    ],
    surface: fixed,
    faceY: 0.16,
    boxy: false,
  };
}

// ---------------------------------------------------------------- bloque, libro, escudo

function block(spec: CharacterSpec, d: Dims, subject: string, palette: BodyPalette): BodyBuild {
  const { a, hb, c, unit, s } = d;
  const rad = mix(0.06, 0.42, clamp(spec.body.roundness, 0, 1)) * unit;

  if (subject === 'book') {
    // Libro de pie mirando al frente: tapas delante y detrás, lomo a la derecha del personaje
    // (−X… visto desde el frente queda a la izquierda) y páginas a la vista arriba, abajo y en el canto.
    const ct = 0.04 * s;
    const coverR = 0.025 * s;
    const box = roundBox([0, 0, 0], [a, hb, c], coverR);
    const recess = 0.018 * s;
    const spineW = 0.06 * s;
    const cavity = roundBox([-0.5, 0, 0], [0.5 + a - spineW, hb + 1, c - ct], 0.004);
    const cover = smoothSubtract(box, cavity, 0.005 * s);
    const spineRound: Shape = {
      d: (x, y, z) =>
        smin(
          cover.d(x, y, z),
          Math.max(Math.hypot(x - a + c * 0.62, z * 0.92) - c * 0.64, Math.abs(y) - hb + coverR),
          0.02 * s,
        ),
      min: [-a, -hb, -c],
      max: [a + c * 0.1, hb, c],
    };
    const pages = roundBox(
      [-recess * 0.5 - spineW * 0.5, 0, 0],
      [a - recess * 0.5 - spineW * 0.5, hb - recess, c - ct - 0.002],
      0.008 * s,
    );
    const lines: Paint = (x, y, z, b) => {
      const edge = Math.max(-x / a, Math.abs(y) / hb);
      const stripe = 0.5 + 0.5 * Math.cos((z / (0.011 * s)) * Math.PI * 2);
      return mixv(
        b,
        [b[0] * 0.8, b[1] * 0.76, b[2] * 0.68],
        stripe * smoothstep(0.8, 0.95, edge) * 0.55,
      );
    };
    return {
      pieces: [
        { name: 'Body', shape: spineRound, material: 'body' },
        { name: 'Body_Pages', shape: pages, material: 'pages', paint: lines },
      ],
      surface: box,
      faceY: 0.14,
      boxy: true,
    };
  }

  if (subject === 'shield') {
    const yc = 0.25 * hb;
    const L = hb + yc;
    const R = (L * L + a * a) / (2 * a);
    const arch = (x: number, y: number) =>
      Math.max(Math.hypot(x - (R - a), y - yc) - R, Math.hypot(x + (R - a), y - yc) - R);
    const top = roundRect2D(0, (yc + hb) / 2, a, (hb - yc) / 2 + 0.02, 0.12 * unit);
    const profile = (x: number, y: number) => smin(arch(x, y), top(x, y), 0.02 * s);
    const flat = extrude(profile, c, 0.07 * unit, { min: [-a, -hb], max: [a, hb] });
    // Abombado: el centro sobresale como un escudo real.
    const shape = lipschitz(
      warp(flat, (x, y, z) => [x, y, z - c * 0.35 * (1 - (x / a) ** 2) * (z > 0 ? 1 : 0)], c * 0.4),
      0.8,
    );
    const rimW = 0.07 * s;
    const paint: Paint = (x, y, z, b) => {
      const edge = profile(x, y);
      return edge > -rimW && z > -c * 0.2
        ? mixv(b, palette.accent, smoothstep(-rimW, -rimW * 0.7, edge))
        : b;
    };
    return {
      pieces: [{ name: 'Body', shape, material: 'body', paint }],
      surface: shape,
      faceY: 0.2,
      boxy: true,
    };
  }

  let shape: Shape = roundBox([0, 0, 0], [a, hb, c], rad);
  if (subject === 'monolith') {
    shape = roundBox([0, 0, 0], [a * 0.82, hb * 1.05, c * 0.8], 0.06 * unit + rad * 0.3);
  }
  if (subject === 'building_block') {
    const studR = 0.17 * a;
    const studs: Shape[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        studs.push(
          place(roundCylinder(studR, 0.05 * hb, 0.012 * s), [
            sx * a * 0.48,
            hb + 0.03 * hb,
            sz * c * 0.48,
          ]),
        );
      }
    }
    shape = smoothUnion(0.015 * s, shape, ...studs);
  }
  if (spec.body.surfaceDetail === 'panel_lines' || subject === 'building_block') {
    const base = shape;
    const yLine = -0.55 * hb;
    shape = lipschitz(
      {
        d: (x, y, z) => base.d(x, y, z) + 0.012 * s * Math.exp(-(((y - yLine) / (0.01 * s)) ** 2)),
        min: base.min,
        max: base.max,
      },
      0.6,
    );
  }
  shape = surfaceRelief(spec, d, shape);
  return {
    pieces: [{ name: 'Body', shape, material: 'body' }],
    surface: shape,
    faceY: 0.15,
    boxy: true,
  };
}

// ---------------------------------------------------------------- cristal

function crystal(spec: CharacterSpec, d: Dims, subject: string, _palette: BodyPalette): BodyBuild {
  const { a, hb, c, s } = d;
  const phi = (48 * Math.PI) / 180;
  const planes: { n: Vec3; d: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const th = (i * Math.PI) / 3;
    planes.push({ n: [Math.sin(th), 0, Math.cos(th)], d: a });
    planes.push({
      n: [Math.sin(th) * Math.cos(phi), Math.sin(phi), Math.cos(th) * Math.cos(phi)],
      d: Math.sin(phi) * hb,
    });
    planes.push({
      n: [Math.sin(th) * Math.cos(phi), -Math.sin(phi), Math.cos(th) * Math.cos(phi)],
      d: Math.sin(phi) * hb * 0.92,
    });
  }
  if (subject === 'prism') planes.push({ n: [0, 1, 0], d: hb * 0.78 });
  const gem = polyhedron(planes, 0.012 * s, [a * 1.2, hb, a * 1.2]);
  const zs = c / a;
  const shape = lipschitz(
    {
      d: (x, y, z) => gem.d(x, y, z / zs),
      min: [-a * 1.2, -hb, -a * 1.2 * zs],
      max: [a * 1.2, hb, a * 1.2 * zs],
    },
    Math.min(1, zs),
  );
  void spec;
  return {
    pieces: [{ name: 'Body', shape, material: 'body' }],
    surface: shape,
    faceY: 0.06,
    boxy: true,
  };
}

// ---------------------------------------------------------------- despacho

type Builder = (spec: CharacterSpec, d: Dims, subject: string, palette: BodyPalette) => BodyBuild;

const SUBJECTS: Record<string, Builder> = {
  coffee_bean: seed,
  cacao_pod: seed,
  sprout: seed,
  organic_seed: seed,
  bread_loaf: blob,
  paw_creature: blob,
  soft_blob: blob,
  leaf: drop,
  water_drop: drop,
  paint_drop: drop,
  fluid_drop: drop,
  health_capsule: capsule,
  thread_spool: capsule,
  book: block,
  building_block: block,
  shield: block,
  monolith: block,
  crystal_core: crystal,
  prism: crystal,
};

const ARCHETYPES: Record<string, Builder> = { seed, drop, blob, capsule, block, crystal };

export function buildBody(spec: CharacterSpec, dims: Dims, palette: BodyPalette): BodyBuild {
  const builder = SUBJECTS[spec.subject] ?? ARCHETYPES[spec.archetype] ?? blob;
  return builder(spec, dims, spec.subject, palette);
}
