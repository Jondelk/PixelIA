import { buildBody, bodyDims, type BodyMaterial, type Paint } from './bodies.js';
import { hexToLinear, mixLinear } from './color.js';
import type { Shape, Vec3 } from './sdf.js';
import {
  add,
  alignY,
  clamp,
  ellipsoid,
  normalize,
  place,
  roundBox,
  roundCone,
  roundCylinder,
  rotationXYZ,
  scale,
  smax,
  smin,
  smoothstep,
  smoothSubtract,
  smoothUnion,
  sphere,
  stroke2D,
  torus,
  union,
} from './sdf.js';
import {
  bottomHit,
  circle2D,
  decal,
  domeLift,
  ellipse2D,
  frontHit,
  roundRect2D,
  sideHit,
  topHit,
  type Hit,
} from './shapes.js';
import type { CharacterSpec } from './spec.js';

/*
 * Construcción del personaje de marca: cuerpo del sujeto, rostro, extremidades y utilería, todo
 * como campos de distancia. El resultado es una descripción (nodos del rig, piezas con material
 * y pintura) que luego se convierte en mallas, .glb y renders.
 *
 * Convenciones glTF: Y arriba, el personaje mira a +Z, su izquierda ("L") está en +X.
 * Nodos del rig (los anima la web por nombre): PixelRoot, Body, Face, Eye_L/R, Pupil_L/R, Mouth,
 * Arm_L/R, Leg_L/R.
 */

export interface PartMaterial {
  name: string;
  /** Color lineal. */
  color: Vec3;
  metallic: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  emissive: Vec3;
  emissiveStrength: number;
  transmission: number;
}

export interface CharacterNode {
  name: string;
  parent: string | null;
  /** Pivote en coordenadas del mundo. */
  pivot: Vec3;
}

export interface CharacterPart {
  name: string;
  node: string;
  shape: Shape;
  material: string;
  /** Tamaño de celda de la malla (m). */
  cell: number;
  paint?: Paint;
  /** Recibe oclusión ambiental horneada. */
  ao: boolean;
  /** Se descartan los triángulos ocultos dentro de esta forma (cara inferior de calcomanías). */
  cull?: Shape;
}

export interface Character {
  nodes: CharacterNode[];
  parts: CharacterPart[];
  materials: Record<string, PartMaterial>;
  /** Escena completa (para oclusión y sombras de contacto). */
  occluder: Shape;
  meta: {
    groundY: number;
    bodyCenter: Vec3;
    floating: boolean;
    eyeRadius: number;
    height: number;
  };
}

// ---------------------------------------------------------------- materiales

const FINISHES = {
  matte: { roughness: 0.6, metallic: 0, clearcoat: 0, sheen: 0.25, transmission: 0 },
  satin: { roughness: 0.42, metallic: 0, clearcoat: 0.25, sheen: 0, transmission: 0 },
  glossy: { roughness: 0.28, metallic: 0, clearcoat: 0.85, sheen: 0, transmission: 0 },
  metallic: { roughness: 0.3, metallic: 0.85, clearcoat: 0.3, sheen: 0, transmission: 0 },
  clay: { roughness: 0.82, metallic: 0, clearcoat: 0, sheen: 0.6, transmission: 0 },
  glass: { roughness: 0.1, metallic: 0, clearcoat: 0.6, sheen: 0, transmission: 0.45 },
} as const;

type FinishName = keyof typeof FINISHES;

function mat(
  name: string,
  color: Vec3,
  finish: FinishName,
  extra: Partial<PartMaterial> = {},
): PartMaterial {
  const f = FINISHES[finish];
  return {
    name,
    color,
    metallic: f.metallic,
    roughness: f.roughness,
    clearcoat: f.clearcoat,
    clearcoatRoughness: 0.08,
    sheen: f.sheen,
    emissive: [0, 0, 0],
    emissiveStrength: 1,
    transmission: f.transmission,
    ...extra,
  };
}

// ---------------------------------------------------------------- personaje

export function buildCharacter(spec: CharacterSpec): Character {
  const dims = bodyDims(spec);
  const { a, hb, c, unit, s } = dims;
  const L = (hex: string) => hexToLinear(hex);
  const col = spec.colors;
  const palette = {
    body: L(col.body),
    shade: L(col.bodyShade),
    secondary: L(col.secondary),
    accent: L(col.accent),
  };
  const finish = (spec.body.finish in FINISHES ? spec.body.finish : 'satin') as FinishName;
  const limbFinish: FinishName = finish === 'glass' || finish === 'metallic' ? 'satin' : finish;

  const materials: Record<string, PartMaterial> = {
    body: mat('Body', palette.body, finish),
    body2: mat('BodySecondary', palette.secondary, finish === 'glass' ? 'glossy' : finish),
    body3: mat('BodyShade', palette.shade, 'satin'),
    pages: mat('Pages', L('#F3EEE2'), 'matte', { sheen: 0.2 }),
    limb: mat('Limb', L(col.limb), limbFinish),
    hand: mat('Hand', L(col.hand), 'satin'),
    shoe: mat('Shoe', L(col.hand), 'satin'),
    feature: mat('Feature', L(col.feature), 'glossy', {
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    sclera: mat('Sclera', L(col.sclera), 'glossy', {
      roughness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    highlight: mat('Highlight', [1, 1, 1], 'matte', {
      emissive: [1, 1, 1],
      emissiveStrength: 1.6,
      sheen: 0,
    }),
    mouth: mat('Mouth', mixLinear(L(col.feature), L('#6E1A26'), 0.5), 'satin', { roughness: 0.5 }),
    tongue: mat('Tongue', mixLinear(L(col.blush), L('#E2606C'), 0.6), 'satin'),
    teeth: mat('Teeth', L('#FBFAF6'), 'satin'),
    blush: mat('Blush', L(col.blush), 'matte'),
    brow: mat('Brow', L(col.feature), 'satin', { roughness: 0.55, clearcoat: 0 }),
    visor: mat('Visor', L('#0D0F15'), 'glossy', {
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    }),
    glow: mat('Glow', L(col.accent), 'satin', { emissive: L(col.accent), emissiveStrength: 2.2 }),
  };
  for (const acc of spec.accessories) {
    materials[`prop_${acc.id}`] = mat(`Prop_${acc.id}`, L(acc.color), 'satin');
    materials[`prop_${acc.id}_detail`] = mat(`Prop_${acc.id}_Detail`, L(acc.detailColor), 'satin');
  }
  materials.bubble = mat(
    'Bubble',
    L(spec.accessories.find((x) => x.id === 'bubbles')?.color ?? '#9BD7F0'),
    'glass',
    {
      transmission: 0.7,
      roughness: 0.05,
    },
  );

  const nodes: CharacterNode[] = [];
  const parts: CharacterPart[] = [];
  const node = (name: string, parent: string | null, pivot: Vec3) =>
    nodes.push({ name, parent, pivot });
  // Piezas apoyadas sobre el cuerpo (rasgos, bufanda, casco…): su cara interior nunca se ve y
  // se descarta para aligerar el modelo.
  const CULLED = /^(Visor|Eye_|Brow_|Mouth_|Nose|Acc_Scarf|Acc_Hardhat|Acc_Badge|Ear_Inner)/;
  const part = (p: Omit<CharacterPart, 'ao'> & { ao?: boolean }) =>
    parts.push({
      ao: true,
      ...p,
      // Piezas grandes no necesitan celdas finas: el número de triángulos crece con el área.
      cell: Math.max(p.cell, extent(p.shape) / 230),
      ...(CULLED.test(p.name) ? { cull: W } : {}),
    });

  const cells = {
    body: 0.0105 * s,
    limb: 0.0065 * s,
    prop: 0.0055 * s,
    decal: 0.003 * s,
    fine: 0.0022 * s,
  };

  // -------------------------------------------------------------- cuerpo (local, centrado)
  const body = buildBody(spec, dims, palette);
  const accIds = new Set(spec.accessories.map((x) => x.id));
  const scaleF = clamp(spec.face.scale, 0.7, 1.35);
  // Caras planas y anchas (bloques) piden rasgos algo mayores para leerse a distancia.
  const re = 0.215 * unit * scaleF * (body.boxy ? 1.22 : 1);
  const dx = re * 1.45;
  const eyeYLocal = body.faceY * hb;
  const mouthYLocal = eyeYLocal - re * (spec.face.eyes === 'visor' ? 1.9 : 1.62);

  // Piezas fundidas al cuerpo: orejas y hocico se esculpen en la misma arcilla.
  const fused: Shape[] = [];
  const inner: { shape: Shape; material: string; name: string }[] = [];
  if (accIds.has('ears')) {
    for (const side of [1, -1]) {
      const hit = topHit(body.surface, side * a * 0.52, -c * 0.05);
      if (!hit) continue;
      const rot = rotationXYZ(0, 0, -side * 0.32);
      const center = add(hit.p, [side * 0.02 * s, 0.13 * unit, 0]);
      fused.push(
        place(ellipsoid([0, 0, 0], [0.15 * unit, 0.19 * unit, 0.075 * unit]), center, rot),
      );
      inner.push({
        name: side > 0 ? 'Ear_Inner_L' : 'Ear_Inner_R',
        shape: place(
          ellipsoid([0, 0, 0], [0.085 * unit, 0.12 * unit, 0.04 * unit]),
          add(center, [0, -0.01 * unit, 0.05 * unit]),
          rot,
        ),
        material: 'ear_inner',
      });
    }
  }
  let muzzle: Vec3 | null = null;
  if (spec.subject === 'paw_creature') {
    const hit = frontHit(body.surface, 0, mouthYLocal + re * 0.25);
    if (hit) {
      muzzle = add(hit.p, [0, 0, -re * 0.42]);
      fused.push(ellipsoid(muzzle, [re * 1.25, re * 0.82, re * 0.72]));
    }
  }
  if (fused.length) {
    const k = 0.05 * s;
    body.surface = smoothUnion(k, body.surface, ...fused);
    const main = body.pieces[0]!;
    main.shape = smoothUnion(k, main.shape, ...fused);
  }
  if (inner.length)
    materials.ear_inner = mat(
      'EarInner',
      mixLinear(L(col.blush), palette.secondary, 0.25),
      'matte',
    );

  // -------------------------------------------------------------- altura sobre el suelo
  const stance = spec.stance;
  const legs = spec.limbs.legs && stance !== 'floating';
  const thick = clamp(spec.limbs.thickness, 0.6, 1.3);
  const ra = 0.13 * unit * thick;
  const rl = ra * 1.28;
  const rf = rl * 1.45;
  const bottomLocal = bottomHit(body.surface, 0, 0)?.p[1] ?? -hb;
  const visibleLeg = (stance === 'grounded' ? 0.08 : 0.16) * unit;
  const zc = legs ? rf * 1.3 + visibleLeg - bottomLocal : 0.3 + 0.32 * unit - bottomLocal;
  const lift: Vec3 = [0, zc, 0];
  const W = place(body.surface, lift);

  node('PixelRoot', null, [0, 0, 0]);
  node('Body', 'PixelRoot', [0, zc, 0]);

  // Pintura del cuerpo: degradado de aerógrafo hacia abajo y rubor en las mejillas.
  const eyeY = zc + eyeYLocal;
  const mouthY = zc + mouthYLocal;
  const blushOn = spec.face.blush && spec.face.eyes !== 'visor';
  const blushColor = L(col.blush);
  const bodyPaint =
    (local?: Paint): Paint =>
    (x, y, z, base) => {
      let b = local ? local(x, y - zc, z, base) : base;
      const g = smoothstep(zc - hb * 0.1, zc - hb * 1.05, y);
      b = mixLinear(b, mixLinear(b, palette.shade, 0.9), g * 0.55);
      // Luz de coronilla: un toque más claro arriba, como un vinilo pintado a mano.
      b = mixLinear(b, mixLinear(b, [1, 1, 1], 0.12), smoothstep(zc + hb * 0.3, zc + hb, y) * 0.6);
      if (blushOn && z > 0) {
        for (const side of [1, -1]) {
          const bx = side * (dx + re * 0.72);
          const by = eyeY - re * 1.15;
          const q = ((x - bx) / (re * 0.62)) ** 2 + ((y - by) / (re * 0.38)) ** 2;
          if (q < 4) b = mixLinear(b, blushColor, Math.exp(-q * 1.6) * 0.75);
        }
      }
      if (muzzle) {
        const m = add(muzzle, lift);
        const q = ((x - m[0]) / (re * 1.2)) ** 2 + ((y - m[1]) / (re * 0.8)) ** 2;
        if (z > m[2])
          b = mixLinear(
            b,
            mixLinear(palette.secondary, [1, 0.95, 0.88], 0.55),
            smoothstep(1.15, 0.85, q),
          );
      }
      return b;
    };

  for (const piece of body.pieces) {
    const world = place(piece.shape, lift);
    const local = piece.paint;
    part({
      name: piece.name,
      node: 'Body',
      shape: world,
      material: piece.material as BodyMaterial,
      cell: cells.body,
      paint:
        piece.material === 'body'
          ? bodyPaint(local)
          : local
            ? (x, y, z, b) => local(x, y - zc, z, b)
            : undefined,
    });
  }
  for (const piece of inner) {
    part({
      name: piece.name,
      node: 'Body',
      shape: place(piece.shape, lift),
      material: piece.material,
      cell: cells.prop,
    });
  }

  // -------------------------------------------------------------- rostro
  const faceHit = frontHit(W, 0, eyeY);
  const faceZ = faceHit?.p[2] ?? c;
  node('Face', 'PixelRoot', [0, eyeY, faceZ - c * 0.6]);
  const reach = 0.13 * unit;
  const sink = 0.004 * s;
  const L1 = 0.0035 * s; // altura de la capa base
  const step = 0.0028 * s; // separación entre capas

  const eyeHits: (Hit | null)[] = [1, -1].map((side) => frontHit(W, side * dx, eyeY));
  const eyeStyle = spec.face.eyes;

  if (eyeStyle === 'visor') {
    const hw = dx + re * 1.45;
    const hh = re * 0.95;
    const visorAt: Vec3 = [0, eyeY, faceZ];
    part({
      name: 'Visor',
      node: 'Face',
      material: 'visor',
      cell: cells.decal,
      shape: decal(W, {
        profile: roundRect2D(0, eyeY, hw, hh, hh * 0.85),
        at: visorAt,
        half: [hw + 0.01, hh + 0.01],
        lift: domeLift(0, eyeY, hw, hh, L1, 0.006 * s),
        sink,
        reach: reach + a * 0.3,
        bevel: 0.002 * s,
      }),
    });
    [1, -1].forEach((side, i) => {
      const name = side > 0 ? 'L' : 'R';
      const hit = eyeHits[i];
      const ex = side * dx;
      const at: Vec3 = hit?.p ?? [ex, eyeY, faceZ];
      node(`Eye_${name}`, 'Face', at);
      node(`Pupil_${name}`, `Eye_${name}`, at);
      part({
        name: `Eye_${name}_Glow`,
        node: `Pupil_${name}`,
        material: 'glow',
        cell: cells.fine,
        ao: false,
        shape: decal(W, {
          profile: roundRect2D(ex, eyeY, re * 0.62, re * 0.36, re * 0.34),
          at,
          half: [re * 0.7, re * 0.45],
          lift: domeLift(0, eyeY, hw, hh, L1 + step, 0.006 * s),
          sink: 0,
          reach: reach + a * 0.3,
          bevel: 0.0015 * s,
        }),
      });
    });
  } else {
    [1, -1].forEach((side, i) => {
      const name = side > 0 ? 'L' : 'R';
      const ex = side * dx;
      const hit = eyeHits[i];
      const at: Vec3 = hit?.p ?? [ex, eyeY, faceZ];
      node(`Eye_${name}`, 'Face', at);
      node(`Pupil_${name}`, `Eye_${name}`, at);
      const dome = domeLift(ex, eyeY, re * 1.1, re * 1.1, L1, 0.007 * s);
      const layer = (n: number) => (x: number, y: number) => dome(x, y) + step * n;
      const eyeDecal = (
        profile: (x: number, y: number) => number,
        half: [number, number],
        n: number,
        bevel = 0.0012 * s,
      ) => decal(W, { profile, at, half, lift: layer(n), sink, reach, bevel });
      const highlights = (cx: number, cy: number, r: number, n: number) => {
        part({
          name: `Eye_${name}_Highlight`,
          node: `Pupil_${name}`,
          material: 'highlight',
          cell: cells.fine,
          ao: false,
          shape: union(
            eyeDecal(circle2D(cx - r * 1.25, cy + r * 1.15, r), [re * 1.2, re * 1.2], n),
            eyeDecal(circle2D(cx + r * 1.2, cy - r * 1.3, r * 0.45), [re * 1.2, re * 1.2], n),
          ),
        });
      };

      if (eyeStyle === 'round') {
        part({
          name: `Eye_${name}_Sclera`,
          node: `Eye_${name}`,
          material: 'sclera',
          cell: cells.decal,
          shape: eyeDecal(circle2D(ex, eyeY, re), [re * 1.05, re * 1.05], 0),
        });
        const iy = eyeY - re * 0.05;
        part({
          name: `Eye_${name}_Iris`,
          node: `Pupil_${name}`,
          material: 'feature',
          cell: cells.decal,
          shape: eyeDecal(circle2D(ex, iy, re * 0.72), [re * 0.8, re * 0.8], 1),
        });
        highlights(ex, iy, re * 0.2, 2);
      } else if (eyeStyle === 'oval' || eyeStyle === 'dot') {
        const rx = eyeStyle === 'oval' ? re * 0.66 : re * 0.6;
        const ry = eyeStyle === 'oval' ? re * 0.92 : re * 0.66;
        part({
          name: `Eye_${name}_Iris`,
          node: `Eye_${name}`,
          material: 'feature',
          cell: cells.decal,
          shape: eyeDecal(ellipse2D(ex, eyeY, rx, ry), [rx * 1.1, ry * 1.1], 0),
        });
        highlights(ex, eyeY + ry * 0.05, rx * 0.3, 1);
      } else if (eyeStyle === 'crescent') {
        const pts: [number, number][] = [];
        for (let k = 0; k <= 12; k++) {
          const t = -1 + (2 * k) / 12;
          pts.push([ex + t * re * 0.78, eyeY + re * 0.32 * (1 - t * t) - re * 0.12]);
        }
        part({
          name: `Eye_${name}_Lid`,
          node: `Eye_${name}`,
          material: 'brow',
          cell: cells.decal,
          shape: eyeDecal(
            stroke2D(pts, (t) => re * (0.07 + 0.07 * Math.sin(Math.PI * t))),
            [re * 1.0, re * 0.7],
            0,
          ),
        });
      } else {
        const pts: [number, number][] = [
          [ex - re * 0.6, eyeY],
          [ex + re * 0.6, eyeY],
        ];
        part({
          name: `Eye_${name}_Line`,
          node: `Eye_${name}`,
          material: 'brow',
          cell: cells.decal,
          shape: eyeDecal(stroke2D(pts, re * 0.11), [re * 0.8, re * 0.3], 0),
        });
      }
    });
  }

  // Cejas
  if (spec.face.brows && eyeStyle !== 'visor') {
    const browY =
      eyeY +
      re *
        (eyeStyle === 'oval'
          ? 1.38
          : eyeStyle === 'round'
            ? 1.42
            : eyeStyle === 'crescent'
              ? 1.0
              : 1.1);
    [1, -1].forEach((side) => {
      const bx = side * dx;
      const pts: [number, number][] = [];
      for (let k = 0; k <= 10; k++) {
        const t = -1 + (2 * k) / 10;
        pts.push([bx + t * re * 0.55, browY + re * 0.12 * (1 - t * t) + side * t * re * 0.06]);
      }
      const hit = frontHit(W, bx, browY);
      if (!hit) return;
      part({
        name: side > 0 ? 'Brow_L' : 'Brow_R',
        node: 'Face',
        material: 'brow',
        cell: cells.decal,
        shape: decal(W, {
          profile: stroke2D(pts, (t) => re * (0.045 + 0.055 * Math.sin(Math.PI * t))),
          at: hit.p,
          half: [re * 0.75, re * 0.35],
          lift: L1 + 0.002 * s,
          sink,
          reach,
          bevel: 0.001 * s,
        }),
      });
    });
  }

  // Boca
  const mouthHit = frontHit(W, 0, mouthY);
  const mouthAt: Vec3 = mouthHit?.p ?? [0, mouthY, faceZ];
  node('Mouth', 'Face', mouthAt);
  const mw = re * 0.95;
  const mouthDecal = (
    profile: (x: number, y: number) => number,
    half: [number, number],
    n: number,
    bevel = 0.0012 * s,
  ) => decal(W, { profile, at: mouthAt, half, lift: L1 + step * n, sink, reach, bevel });
  const style = spec.face.mouth;
  if (style === 'soft_smile' || style === 'smile' || style === 'line') {
    const wide = style === 'smile' ? 0.9 : style === 'line' ? 0.8 : 0.72;
    const sag = style === 'line' ? re * 0.07 : style === 'smile' ? re * 0.42 : re * 0.3;
    const rad = style === 'smile' ? re * 0.1 : style === 'line' ? re * 0.1 : re * 0.085;
    const pts: [number, number][] = [];
    for (let k = 0; k <= 14; k++) {
      const t = -1 + (2 * k) / 14;
      pts.push([t * mw * wide, mouthY + sag * (t * t) - sag * 0.55]);
    }
    part({
      name: 'Mouth_Line',
      node: 'Mouth',
      material: 'brow',
      cell: cells.decal,
      shape: mouthDecal(
        stroke2D(pts, (t) => rad * (0.55 + 0.45 * Math.sin(Math.PI * t))),
        [mw * wide + rad, sag + rad * 2],
        0,
      ),
    });
  } else if (style === 'open_smile' || style === 'grin') {
    const rx = style === 'grin' ? mw * 1.05 : mw * 0.78;
    const ry = style === 'grin' ? re * 0.6 : re * 0.66;
    const top = mouthY + re * 0.18;
    const curve = (x: number) => top + (0.22 * re * (x * x)) / (rx * rx) - 0.06 * re;
    const mouthProfile = (x: number, y: number) =>
      smax(ellipse2D(0, top, rx, ry)(x, y), y - curve(x), re * 0.12);
    part({
      name: 'Mouth_Inner',
      node: 'Mouth',
      material: 'mouth',
      cell: cells.decal,
      shape: mouthDecal(mouthProfile, [rx * 1.05, ry * 1.1], 0),
    });
    if (style === 'grin') {
      part({
        name: 'Mouth_Teeth',
        node: 'Mouth',
        material: 'teeth',
        cell: cells.decal,
        shape: mouthDecal(
          (x, y) => smax(mouthProfile(x, y) + re * 0.05, curve(x) - re * 0.2 - y, re * 0.06),
          [rx, ry * 0.5],
          1,
        ),
      });
    }
    part({
      name: 'Mouth_Tongue',
      node: 'Mouth',
      material: 'tongue',
      cell: cells.decal,
      shape: mouthDecal(
        (x, y) =>
          smax(
            ellipse2D(0, top - ry * 0.85, rx * 0.55, ry * 0.42)(x, y),
            mouthProfile(x, y) + re * 0.04,
            re * 0.05,
          ),
        [rx * 0.6, ry * 1.1],
        1,
      ),
    });
  }

  // Nariz del hocico
  if (muzzle) {
    const m = add(muzzle, lift);
    const hit = frontHit(W, 0, m[1] + re * 0.42);
    if (hit) {
      part({
        name: 'Nose',
        node: 'Face',
        material: 'feature',
        cell: cells.prop,
        shape: ellipsoid(add(hit.p, [0, 0, -re * 0.05]), [re * 0.32, re * 0.22, re * 0.2]),
      });
    }
  }

  // -------------------------------------------------------------- brazos
  const hands: Record<'L' | 'R', Vec3> = { L: [a, zc, 0], R: [-a, zc, 0] };
  const rh = ra * 1.5;
  if (spec.limbs.arms) {
    // Hombros a la altura donde el cuerpo ya alcanza (casi) su anchura máxima: así los brazos
    // caen junto al cuerpo en lugar de abrirse en formas que se ensanchan hacia abajo.
    const widths: [number, number][] = [];
    for (let k = 0; k <= 16; k++) {
      const y = zc - 0.02 * hb - (k / 16) * 0.5 * hb;
      const h = sideHit(W, 1, y);
      widths.push([y, h ? h.p[0] : 0]);
    }
    const widest = Math.max(...widths.map(([, w]) => w));
    const shoulderY = widths.find(([, w]) => w >= widest * 0.97)?.[0] ?? zc - 0.1 * hb;
    for (const side of [1, -1]) {
      const name = side > 0 ? 'L' : 'R';
      const hit = sideHit(W, side, shoulderY);
      const sx = hit ? hit.p[0] : side * a;
      const S: Vec3 = [sx - side * ra * 0.55, shoulderY, 0];
      const La = 0.56 * unit * (0.85 + 0.15 * thick);
      const d1 = normalize([side * 0.38, -0.92, 0.06]);
      const d2 = normalize([side * 0.22, -0.95, 0.2]);
      let E = add(S, scale(d1, La * 0.5));
      let Wr = add(E, scale(d2, La * 0.5));
      let H = add(Wr, scale(d2, rh * 0.6));
      // Despega el brazo del cuerpo si la silueta se ensancha hacia abajo.
      for (let k = 0; k < 40 && W.d(E[0], E[1], E[2]) < ra * 1.08; k++)
        E = add(E, [side * 0.01 * s, 0, 0]);
      for (let k = 0; k < 40 && W.d(Wr[0], Wr[1], Wr[2]) < ra * 1.12; k++)
        Wr = add(Wr, [side * 0.01 * s, 0, 0]);
      for (let k = 0; k < 40 && W.d(H[0], H[1], H[2]) < rh * 1.08; k++) {
        H = add(H, [side * 0.01 * s, 0, 0]);
        Wr = add(Wr, [side * 0.006 * s, 0, 0]);
      }
      node(`Arm_${name}`, 'PixelRoot', S);
      part({
        name: `Arm_${name}_Mesh`,
        node: `Arm_${name}`,
        material: 'limb',
        cell: cells.limb,
        shape: smoothUnion(
          ra * 0.6,
          roundCone(S, E, ra, ra * 0.9),
          roundCone(E, Wr, ra * 0.9, ra * 0.82),
        ),
      });
      const mitten = smoothUnion(
        rh * 0.35,
        ellipsoid(H, [rh * 0.86, rh * 1.0, rh * 0.8]),
        sphere(add(H, [-side * rh * 0.42, rh * 0.18, rh * 0.52]), rh * 0.38),
      );
      // Puño: un anillo suave donde el brazo entra en la mano.
      const cuff = place(
        roundCylinder(ra * 1.12, ra * 0.28, ra * 0.25),
        add(Wr, scale(d2, -ra * 0.1)),
        alignY(d2),
      );
      part({
        name: `Hand_${name}`,
        node: `Arm_${name}`,
        material: 'hand',
        cell: cells.limb,
        shape: smoothUnion(rh * 0.15, mitten, cuff),
      });
      hands[name] = H;
    }
  }

  // -------------------------------------------------------------- piernas
  if (legs) {
    const hipX = Math.min(a * 0.36, Math.max(rl * 1.25, a * 0.3));
    for (const side of [1, -1]) {
      const name = side > 0 ? 'L' : 'R';
      const hb2 = bottomHit(W, side * hipX, 0);
      const yb = hb2 ? hb2.p[1] : zc - hb;
      const hip: Vec3 = [side * hipX, yb + rl * 1.1, 0];
      const ankle: Vec3 = [side * hipX * 1.04, rf * 0.92, rf * 0.04];
      node(`Leg_${name}`, 'PixelRoot', hip);
      part({
        name: `Leg_${name}_Mesh`,
        node: `Leg_${name}`,
        material: 'limb',
        cell: cells.limb,
        shape: roundCone(hip, ankle, rl, rl * 0.88),
      });
      const shoeC: Vec3 = [side * hipX * 1.06, rf * 0.68, rf * 0.36];
      const shoe = ellipsoid(shoeC, [rf * 0.98, rf * 0.72, rf * 1.36]);
      const sole = 0.0;
      part({
        name: `Shoe_${name}`,
        node: `Leg_${name}`,
        material: 'shoe',
        cell: cells.limb,
        shape: {
          d: (x, y, z) => smax(shoe.d(x, y, z), sole - y, rf * 0.18),
          min: shoe.min,
          max: shoe.max,
        },
        paint: (_x, y, _z, b) =>
          y < rf * 0.2
            ? mixLinear(
                b,
                [b[0] * 0.35, b[1] * 0.35, b[2] * 0.38],
                smoothstep(rf * 0.22, rf * 0.16, y),
              )
            : b,
      });
    }
  }

  // -------------------------------------------------------------- utilería
  const top = topHit(W, 0, 0);
  const topP: Vec3 = top?.p ?? [0, zc + hb, 0];
  for (const acc of spec.accessories) {
    const m = `prop_${acc.id}`;
    const det = `prop_${acc.id}_detail`;
    switch (acc.id) {
      case 'leaves': {
        const base = add(topP, [0, -0.02 * s, 0]);
        const tip = add(topP, [0.025 * s, 0.11 * unit, 0]);
        part({
          name: 'Acc_Stem',
          node: 'Body',
          material: det,
          cell: cells.prop,
          shape: roundCone(base, tip, 0.028 * unit, 0.02 * unit),
        });
        [1, -1].forEach((side, i) => {
          part({
            name: `Acc_Leaf_${i}`,
            node: 'Body',
            material: m,
            cell: cells.prop,
            shape: leafBlade(0.5 * unit, 0.25 * unit, 0.024 * s, tip, side),
            paint: leafVeins(tip, side, 0.5 * unit),
          });
        });
        break;
      }
      case 'hardhat': {
        // Casco: cúpula que además abraza la forma de la cabeza (en cabezas cuadradas cubre las
        // esquinas sin crecer de más), ala elíptica y nervio central.
        const probeY = topP[1] - 0.18 * hb;
        const sx = sideHit(W, 1, probeY);
        const fz = frontHit(W, 0, probeY);
        const hw = sx ? sx.p[0] : a * 0.8;
        const hd = fz ? fz.p[2] : c * 0.8;
        const r = Math.max(hw, hd) * 1.06;
        const height = r * (body.boxy ? 0.7 : 0.62);
        const baseY = topP[1] - (body.boxy ? 0.24 : 0.28) * r;
        const domeR: Vec3 = body.boxy ? [hw * 1.16, height, hd * 1.2] : [r, height, r * 0.96];
        const dome = ellipsoid([0, baseY, 0], domeR);
        const shellT = 0.035 * s;
        const domeCut: Shape = {
          d: (x, y, z) =>
            smax(smin(dome.d(x, y, z), W.d(x, y, z) - shellT, 0.06 * s), baseY - y, 0.01 * s),
          min: [-domeR[0] - shellT * 2, baseY, -domeR[2] - shellT * 2],
          max: [domeR[0] + shellT * 2, topP[1] + height, domeR[2] + shellT * 2],
        };
        const bx = domeR[0] * 1.2;
        const bz = domeR[2] * 1.26;
        const brimR = Math.max(bx, bz);
        const brimCyl = roundCylinder(brimR, 0.014 * s, 0.012 * s);
        const brimShape: Shape = {
          d: (x, y, z) =>
            brimCyl.d((x * brimR) / bx, y - baseY, ((z - domeR[2] * 0.08) * brimR) / bz) *
            (Math.min(bx, bz) / brimR),
          min: [-bx, baseY - 0.02, -bz],
          max: [bx, baseY + 0.02, bz + domeR[2] * 0.08],
        };
        const ridge: Shape = {
          d: (x, y, z) =>
            smax(
              smax(Math.abs(x) - 0.03 * s, domeCut.d(x, y, z) - 0.02 * s, 0.01 * s),
              baseY + 0.02 * s - y,
              0.01 * s,
            ),
          min: [-0.05, baseY, domeCut.min[2] - 0.03],
          max: [0.05, domeCut.max[1] + 0.03, domeCut.max[2] + 0.03],
        };
        part({
          name: 'Acc_Hardhat',
          node: 'Body',
          material: m,
          cell: cells.prop,
          shape: smoothUnion(0.012 * s, domeCut, brimShape, ridge),
        });
        break;
      }
      case 'glasses': {
        if (eyeStyle === 'visor') break;
        const rings: Shape[] = [];
        let zMax = faceZ;
        eyeHits.forEach((hit) => {
          if (hit) zMax = Math.max(zMax, hit.p[2]);
        });
        const gz = zMax + re * 0.3;
        for (const side of [1, -1]) {
          rings.push(
            place(
              torus(re * 1.25, re * 0.085),
              [side * dx, eyeY, gz],
              rotationXYZ(Math.PI / 2, 0, 0),
            ),
          );
        }
        const bridge = roundCone(
          [dx - re * 1.22, eyeY + re * 0.25, gz],
          [-dx + re * 1.22, eyeY + re * 0.25, gz],
          re * 0.075,
          re * 0.075,
        );
        const temples: Shape[] = [];
        for (const side of [1, -1]) {
          const from: Vec3 = [side * (dx + re * 1.25), eyeY + re * 0.1, gz];
          const hit = sideHit(W, side, eyeY + re * 0.1, gz - re * 0.9);
          const to: Vec3 = hit ? add(hit.p, [-side * 0.01 * s, 0, 0]) : [side * a, eyeY, 0];
          temples.push(roundCone(from, to, re * 0.07, re * 0.06));
        }
        part({
          name: 'Acc_Glasses',
          node: 'Face',
          material: m,
          cell: cells.decal * 1.4,
          shape: smoothUnion(re * 0.06, ...rings, bridge, ...temples),
        });
        break;
      }
      case 'orbit_ring': {
        const R = Math.max(a, c) * 1.42;
        const rot = rotationXYZ((14 * Math.PI) / 180, 0, (-10 * Math.PI) / 180);
        const center: Vec3 = [0, zc + 0.05 * hb, 0];
        const ring = place(torus(R, 0.022 * unit), center, rot);
        const beads = [0.6, 3.4].map((ang) => {
          const local: Vec3 = [R * Math.cos(ang), 0, R * Math.sin(ang)];
          const r = rot;
          const w: Vec3 = [
            r[0] * local[0] + r[1] * local[1] + r[2] * local[2],
            r[3] * local[0] + r[4] * local[1] + r[5] * local[2],
            r[6] * local[0] + r[7] * local[1] + r[8] * local[2],
          ];
          return sphere(add(center, w), 0.05 * unit);
        });
        part({
          name: 'Acc_Orbit',
          node: 'Body',
          material: 'glow',
          cell: cells.prop,
          shape: union(ring, ...beads),
          ao: false,
        });
        break;
      }
      case 'antenna': {
        const base = add(topP, [0, -0.03 * s, 0]);
        const mid = add(topP, [0.02 * s, 0.14 * unit, 0]);
        const end = add(topP, [0.06 * s, 0.27 * unit, 0]);
        part({
          name: 'Acc_Antenna',
          node: 'Body',
          material: det,
          cell: cells.prop,
          shape: smoothUnion(
            0.01 * s,
            roundCone(base, mid, 0.022 * unit, 0.016 * unit),
            roundCone(mid, end, 0.016 * unit, 0.014 * unit),
          ),
        });
        part({
          name: 'Acc_Antenna_Tip',
          node: 'Body',
          material: 'glow',
          cell: cells.prop,
          shape: sphere(end, 0.06 * unit),
          ao: false,
        });
        break;
      }
      case 'scarf': {
        // Pañoleta: banda ceñida al cuerpo bajo la boca y un triángulo que cae por delante,
        // ambos siguiendo la superficie, con un nudo al costado.
        const ys = Math.max(mouthY - re * 1.25, zc - 0.5 * hb);
        const th = 0.02 * s;
        const hw = 0.042 * s;
        const band: Shape = {
          d: (x, y, z) => {
            const dy = Math.abs(y - ys) - hw;
            const layer =
              Math.abs(W.d(x, y, z) - th * 0.6) -
              th * (1 - 0.35 * clamp((y - ys) / hw, -1, 1) ** 2);
            return smax(layer, dy, 0.025 * s);
          },
          min: [W.min[0] - 0.06, ys - hw - 0.03, W.min[2] - 0.06],
          max: [W.max[0] + 0.06, ys + hw + 0.03, W.max[2] + 0.06],
        };
        const flapH = 0.3 * unit;
        const flapW = 0.28 * unit;
        const fx = -a * 0.05;
        const flapHit = frontHit(W, fx, ys - flapH * 0.4);
        const pieces: Shape[] = [band];
        if (flapHit) {
          const tri = (x: number, y: number) => {
            // Triángulo con la punta hacia abajo y esquinas redondeadas.
            const u = x - fx;
            const v = y - (ys + hw * 0.2);
            const edge =
              Math.max(Math.abs(u) * (flapH / flapW) + v * 1.0 - 0, -v - flapH) /
              Math.hypot(1, flapH / flapW);
            return Math.max(edge, v) - 0.004 * s;
          };
          pieces.push(
            decal(W, {
              profile: (x, y) => smax(tri(x, y), -0.0001, 0),
              at: flapHit.p,
              half: [flapW + 0.02, flapH + 0.05],
              lift: th * 1.2,
              sink: 0.01 * s,
              reach: 0.25 * unit,
              bevel: 0.012 * s,
            }),
          );
        }
        const knotHit = frontHit(W, -a * 0.62, ys);
        if (knotHit)
          pieces.push(
            ellipsoid(add(knotHit.p, scale(knotHit.n, th * 1.4)), [0.045 * s, 0.05 * s, 0.035 * s]),
          );
        part({
          name: 'Acc_Scarf',
          node: 'Body',
          material: m,
          cell: cells.prop,
          shape: smoothUnion(0.012 * s, ...pieces),
        });
        break;
      }
      case 'badge':
      case 'cross_badge': {
        const y = Math.max(mouthY - re * 1.9, zc - 0.55 * hb);
        const hit = frontHit(W, a * 0.42, y);
        if (!hit) break;
        const rb = 0.1 * unit;
        const rot = alignY(hit.n);
        const disc = place(
          roundCylinder(rb, 0.014 * s, 0.01 * s),
          add(hit.p, scale(hit.n, 0.006 * s)),
          rot,
        );
        part({
          name: 'Acc_Badge',
          node: 'Body',
          material: m,
          cell: cells.decal * 1.3,
          shape: disc,
        });
        const front = add(hit.p, scale(hit.n, 0.02 * s));
        const emblem =
          acc.id === 'cross_badge'
            ? union(
                place(roundBox([0, 0, 0], [rb * 0.5, 0.008 * s, rb * 0.16], 0.005 * s), front, rot),
                place(roundBox([0, 0, 0], [rb * 0.16, 0.008 * s, rb * 0.5], 0.005 * s), front, rot),
              )
            : place(roundCylinder(rb * 0.55, 0.008 * s, 0.005 * s), front, rot);
        part({
          name: 'Acc_Badge_Emblem',
          node: 'Body',
          material: acc.id === 'cross_badge' ? 'teeth' : det,
          cell: cells.decal * 1.3,
          shape: emblem,
        });
        break;
      }
      case 'bubbles': {
        const spots: [number, number, number, number][] = [
          [1.3, 0.55, 0.2, 0.12],
          [-1.35, 0.25, 0.1, 0.085],
          [1.05, 1.0, -0.1, 0.065],
          [-1.1, 0.85, 0.25, 0.1],
        ];
        spots.forEach(([fx, fy, fz, r], i) => {
          part({
            name: `Acc_Bubble_${i}`,
            node: 'Body',
            material: 'bubble',
            cell: cells.prop,
            shape: sphere([fx * a, zc + fy * hb * 0.6, fz * c], r * unit * 1.6),
            ao: false,
          });
        });
        break;
      }
      case 'cup': {
        if (!spec.limbs.arms) break;
        const H = hands.R;
        const rc = rh * 0.92;
        const hc = rh * 1.1;
        const center = add(H, [rh * 0.35, -rh * 0.25, rh * 0.95]);
        const outer = place(roundCylinder(rc, hc, rc * 0.18), center);
        const cavity = place(roundCylinder(rc * 0.8, hc, rc * 0.12), add(center, [0, hc * 0.3, 0]));
        const handle = place(
          torus(hc * 0.45, rc * 0.13),
          add(center, [-rc * 1.02, 0, -rc * 0.1]),
          rotationXYZ(Math.PI / 2, 0, 0),
        );
        part({
          name: 'Acc_Cup',
          node: 'Arm_R',
          material: m,
          cell: cells.prop * 0.8,
          shape: smoothUnion(rc * 0.08, smoothSubtract(outer, cavity, rc * 0.05), handle),
        });
        part({
          name: 'Acc_Cup_Coffee',
          node: 'Arm_R',
          material: det,
          cell: cells.prop * 0.8,
          shape: place(
            roundCylinder(rc * 0.81, 0.006 * s, 0.004 * s),
            add(center, [0, hc * 0.55, 0]),
          ),
        });
        break;
      }
      case 'scroll': {
        if (!spec.limbs.arms) break;
        const H = hands.L;
        const p0 = add(H, [-0.03 * unit, -0.05 * unit, -0.18 * unit]);
        const p1 = add(H, [0.02 * unit, -0.06 * unit, 0.24 * unit]);
        part({
          name: 'Acc_Scroll',
          node: 'Arm_L',
          material: m,
          cell: cells.prop,
          shape: roundCone(p0, p1, 0.055 * unit, 0.055 * unit),
        });
        const mid = add(H, [0, -0.055 * unit, 0.03 * unit]);
        const dir = normalize([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
        part({
          name: 'Acc_Scroll_Band',
          node: 'Arm_L',
          material: det,
          cell: cells.prop,
          shape: place(roundCylinder(0.06 * unit, 0.018 * unit, 0.006 * s), mid, alignY(dir)),
        });
        break;
      }
      case 'ears':
        break;
    }
  }
  // -------------------------------------------------------------- escena
  const occluder = union(...parts.filter((p) => p.material !== 'bubble').map((p) => p.shape));
  const height = occluder.max[1];
  return {
    nodes,
    parts,
    materials,
    occluder,
    meta: { groundY: 0, bodyCenter: [0, zc, 0], floating: !legs, eyeRadius: re, height },
  };
}

const extent = (shape: Shape) =>
  Math.max(shape.max[0] - shape.min[0], shape.max[1] - shape.min[1], shape.max[2] - shape.min[2]);

// ---------------------------------------------------------------- hojas

function leafBlade(length: number, width: number, thick: number, at: Vec3, side: number): Shape {
  // Hoja modelada a lo largo de +X, curvada hacia arriba, y luego orientada.
  const blade: Shape = {
    d: (x, y, z) => {
      const t = clamp(x / length, 0, 1);
      const yy = y - 0.35 * length * t * t + 0.12 * length * t;
      const half = width * 0.5 * Math.sin(Math.PI * Math.pow(t, 0.8));
      const dz = Math.abs(z) - half;
      const vein = thick * (1 - 0.6 * Math.min(1, Math.abs(z) / Math.max(half, 1e-4)));
      const dy = Math.abs(yy + (z * z) / (width * 1.2)) - vein * 0.5;
      const dx = Math.max(-x, x - length);
      return Math.max(dz * 0.8, dy * 0.8, dx);
    },
    min: [0, -length * 0.2, -width * 0.6],
    max: [length, length * 0.4, width * 0.6],
  };
  const rot = rotationXYZ(side * 0.75, side > 0 ? -0.25 : Math.PI + 0.25, 0.55);
  return place(blade, at, rot);
}

function leafVeins(at: Vec3, side: number, length: number): Paint {
  void side;
  return (x, y, z, b) => {
    const d = Math.hypot(x - at[0], y - at[1], z - at[2]) / length;
    const fade = smoothstep(1, 0.2, d);
    return mixLinear(b, [b[0] * 0.75, b[1] * 0.85, b[2] * 0.7], 0.35 * fade);
  };
}
