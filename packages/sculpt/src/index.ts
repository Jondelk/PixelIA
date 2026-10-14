import { buildCharacter, type Character, type CharacterPart } from './character.js';
import { hexToLinear } from './color.js';
import { writeGlb, type GlbMaterial, type GlbNode } from './glb.js';
import { meshShape, type Mesh } from './mesh.js';
import { encodePng } from './png.js';
import { renderScene, type RenderMesh, type RenderScene } from './render.js';
import type { Shape, Vec3 } from './sdf.js';
import type { CharacterSpec } from './spec.js';

export * from './spec.js';
export { buildCharacter } from './character.js';
export type { Character, CharacterPart, CharacterNode, PartMaterial } from './character.js';
export { encodePng } from './png.js';
export { readGlbJson } from './glb.js';

/** Versión del motor (queda registrada en cada modelo). */
export const SCULPT_VERSION = '1.0.0';

/** Vistas de estudio que se producen. */
export const RENDER_VIEWS = {
  hero: { azimuth: -28, elevation: 9, transparent: false },
  front: { azimuth: 0, elevation: 4, transparent: false },
  three_quarter: { azimuth: -42, elevation: 7, transparent: false },
  side: { azimuth: -90, elevation: 4, transparent: false },
  cutout: { azimuth: -22, elevation: 6, transparent: true },
} as const;
export type RenderView = keyof typeof RENDER_VIEWS;

export type SculptQuality = 'draft' | 'standard' | 'high';

export interface SculptOptions {
  /** Lado de los renders en píxeles (cuadrados). */
  size?: number;
  quality?: SculptQuality;
  /** Vistas a producir (por defecto todas). */
  views?: RenderView[];
  /** Avisa del avance (0–1) para mostrar progreso. */
  onProgress?: (stage: string, progress: number) => void;
}

export interface SculptResult {
  glb: Uint8Array;
  renders: Partial<Record<RenderView, Uint8Array>>;
  stats: {
    engine: string;
    triangles: number;
    vertices: number;
    parts: number;
    meshMs: number;
    renderMs: number;
  };
}

const CELL_SCALE: Record<SculptQuality, number> = { draft: 1.7, standard: 1, high: 0.8 };

interface BuiltPart {
  part: CharacterPart;
  mesh: Mesh;
  /** Albedo lineal por vértice. */
  albedo: Float32Array;
  ao: Float32Array;
}

/** Quita los triángulos cuyos tres vértices quedan dentro de `inside` (caras ocultas). */
function cullInside(mesh: Mesh, inside: Shape, margin: number): Mesh {
  const p = mesh.positions;
  const n = p.length / 3;
  const hidden = new Uint8Array(n);
  for (let v = 0; v < n; v++)
    hidden[v] = inside.d(p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!) < -margin ? 1 : 0;
  const ix = mesh.indices;
  const keep: number[] = [];
  for (let t = 0; t < ix.length; t += 3) {
    if (hidden[ix[t]!] && hidden[ix[t + 1]!] && hidden[ix[t + 2]!]) continue;
    keep.push(ix[t]!, ix[t + 1]!, ix[t + 2]!);
  }
  const remap = new Int32Array(n).fill(-1);
  const pos: number[] = [];
  const nor: number[] = [];
  const out = new Uint32Array(keep.length);
  keep.forEach((v, i) => {
    if (remap[v] === -1) {
      remap[v] = pos.length / 3;
      pos.push(p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!);
      nor.push(mesh.normals[v * 3]!, mesh.normals[v * 3 + 1]!, mesh.normals[v * 3 + 2]!);
    }
    out[i] = remap[v]!;
  });
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), indices: out };
}

/** Oclusión ambiental por vértice: muestras a lo largo de la normal contra la escena y el suelo. */
function bakeAo(mesh: Mesh, scene: Shape, groundY: number, s: number): Float32Array {
  const n = mesh.positions.length / 3;
  const ao = new Float32Array(n);
  const steps = [0.012, 0.03, 0.06, 0.1, 0.16].map((h) => h * s);
  const weights = [1, 0.8, 0.6, 0.45, 0.3];
  let norm = 0;
  for (let i = 0; i < steps.length; i++) norm += steps[i]! * weights[i]!;
  const p = mesh.positions;
  const nn = mesh.normals;
  for (let v = 0; v < n; v++) {
    const x = p[v * 3]!;
    const y = p[v * 3 + 1]!;
    const z = p[v * 3 + 2]!;
    const nx = nn[v * 3]!;
    const ny = nn[v * 3 + 1]!;
    const nz = nn[v * 3 + 2]!;
    let occ = 0;
    for (let i = 0; i < steps.length; i++) {
      const h = steps[i]!;
      const qx = x + nx * h;
      const qy = y + ny * h;
      const qz = z + nz * h;
      const d = Math.min(scene.d(qx, qy, qz), qy - groundY);
      occ += Math.max(0, h - d) * weights[i]!;
    }
    ao[v] = Math.max(0, Math.min(1, 1 - (occ / norm) * 1.35));
  }
  return ao;
}

function paintVertices(built: Character, part: CharacterPart, mesh: Mesh): Float32Array {
  const base = built.materials[part.material]?.color ?? [0.8, 0.8, 0.8];
  const n = mesh.positions.length / 3;
  const out = new Float32Array(n * 3);
  const p = mesh.positions;
  for (let v = 0; v < n; v++) {
    const c: Vec3 = part.paint ? part.paint(p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!, base) : base;
    out[v * 3] = c[0];
    out[v * 3 + 1] = c[1];
    out[v * 3 + 2] = c[2];
  }
  return out;
}

/** Esculpe el personaje: malla, .glb animable y renders de estudio. */
export function sculptCharacter(spec: CharacterSpec, options: SculptOptions = {}): SculptResult {
  const quality = options.quality ?? 'standard';
  const size = options.size ?? 768;
  const progress = options.onProgress ?? (() => {});
  const t0 = Date.now();

  const character = buildCharacter(spec);
  const s = character.meta.eyeRadius / 0.12;
  progress('modelando', 0.05);

  const built: BuiltPart[] = [];
  character.parts.forEach((part, i) => {
    const cell = part.cell * CELL_SCALE[quality];
    let mesh = meshShape(part.shape, { cell });
    if (part.cull) mesh = cullInside(mesh, part.cull, cell * 0.5);
    if (mesh.indices.length === 0) return;
    const albedo = paintVertices(character, part, mesh);
    const ao = part.ao
      ? bakeAo(mesh, character.occluder, character.meta.groundY, s)
      : new Float32Array(mesh.positions.length / 3).fill(1);
    built.push({ part, mesh, albedo, ao });
    progress('modelando', 0.05 + (0.5 * (i + 1)) / character.parts.length);
  });
  const meshMs = Date.now() - t0;

  const glb = toGlb(character, built, spec);
  progress('exportando', 0.6);

  // ------------------------------------------------------------ renders
  const t1 = Date.now();
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of built) {
    const p = b.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p[i + k]!;
        if (v < lo[k]!) lo[k] = v;
        if (v > hi[k]!) hi[k] = v;
      }
    }
  }
  lo[1] = Math.min(lo[1]!, 0);
  const center: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.max(hi[1] - lo[1], (hi[0] - lo[0]) * 1.05, (hi[2] - lo[2]) * 1.05) * 0.6;

  const meshes: RenderMesh[] = built.map((b) => {
    const m = character.materials[b.part.material]!;
    return {
      positions: b.mesh.positions,
      normals: b.mesh.normals,
      colors: b.albedo,
      ao: b.ao,
      indices: b.mesh.indices,
      material: {
        baseColor: [1, 1, 1],
        metallic: m.metallic,
        roughness: m.roughness,
        clearcoat: m.clearcoat,
        clearcoatRoughness: m.clearcoatRoughness,
        sheen: m.sheen,
        emissive: [
          m.emissive[0] * m.emissiveStrength,
          m.emissive[1] * m.emissiveStrength,
          m.emissive[2] * m.emissiveStrength,
        ],
        transmission: m.transmission,
      },
    };
  });
  const scene: RenderScene = {
    meshes,
    center,
    radius,
    backdrop: hexToLinear(spec.colors.backdrop),
    rim: hexToLinear(spec.colors.rim),
    sdf: character.occluder.d,
    groundY: character.meta.groundY,
    supersample: 2,
    shadowOffset: 0.012 * s,
  };
  const renders: Partial<Record<RenderView, Uint8Array>> = {};
  const views = options.views ?? (Object.keys(RENDER_VIEWS) as RenderView[]);
  views.forEach((view, i) => {
    const v = RENDER_VIEWS[view];
    const rgba = renderScene(scene, { width: size, height: size, ...v });
    renders[view] = encodePng(rgba, size, size);
    progress('renderizando', 0.6 + (0.4 * (i + 1)) / views.length);
  });

  let triangles = 0;
  let vertices = 0;
  for (const b of built) {
    triangles += b.mesh.indices.length / 3;
    vertices += b.mesh.positions.length / 3;
  }
  return {
    glb,
    renders,
    stats: {
      engine: `pixel-sculpt ${SCULPT_VERSION}`,
      triangles,
      vertices,
      parts: built.length,
      meshMs,
      renderMs: Date.now() - t1,
    },
  };
}

// ---------------------------------------------------------------- glTF

function toGlb(character: Character, built: BuiltPart[], spec: CharacterSpec): Uint8Array {
  const materialKeys = Object.keys(character.materials);
  const materials: GlbMaterial[] = materialKeys.map((key) => {
    const m = character.materials[key]!;
    const emissive = m.emissive.some((v) => v > 0);
    return {
      name: m.name,
      baseColor: [1, 1, 1, m.transmission > 0.5 ? 0.55 : 1],
      metallic: m.metallic,
      roughness: m.roughness,
      ...(m.clearcoat > 0
        ? { clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness }
        : {}),
      ...(m.sheen > 0
        ? {
            sheen: { color: [m.sheen * 0.6, m.sheen * 0.6, m.sheen * 0.6] as Vec3, roughness: 0.6 },
          }
        : {}),
      ...(emissive ? { emissive: m.emissive, emissiveStrength: m.emissiveStrength } : {}),
      ...(m.transmission > 0 ? { transmission: m.transmission } : {}),
    };
  });

  const index = new Map<string, number>();
  const pivots = new Map<string, Vec3>();
  const nodes: GlbNode[] = [];
  for (const n of character.nodes) {
    index.set(n.name, nodes.length);
    pivots.set(n.name, n.pivot);
    const parentPivot: Vec3 = n.parent ? (pivots.get(n.parent) ?? [0, 0, 0]) : [0, 0, 0];
    nodes.push({
      name: n.name,
      translation: [
        n.pivot[0] - parentPivot[0],
        n.pivot[1] - parentPivot[1],
        n.pivot[2] - parentPivot[2],
      ],
      children: [],
    });
  }
  for (const n of character.nodes) {
    if (n.parent) nodes[index.get(n.parent)!]!.children.push(index.get(n.name)!);
  }

  for (const b of built) {
    const pivot = pivots.get(b.part.node) ?? [0, 0, 0];
    const p = b.mesh.positions;
    const local = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      local[i] = p[i]! - pivot[0];
      local[i + 1] = p[i + 1]! - pivot[1];
      local[i + 2] = p[i + 2]! - pivot[2];
    }
    const count = p.length / 3;
    const colors = new Uint8Array(count * 4);
    for (let v = 0; v < count; v++) {
      // La oclusión se hornea suavizada en el color: en tiempo real se ve el volumen sin
      // oscurecer de más bajo luz directa.
      const ao = 0.35 + 0.65 * b.ao[v]!;
      for (let k = 0; k < 3; k++) {
        const linear = Math.max(0, Math.min(1, b.albedo[v * 3 + k]! * ao));
        // COLOR_0 en 8 bits: se guarda en sRGB-lineal estándar de glTF (lineal).
        colors[v * 4 + k] = Math.round(linear * 255);
      }
      colors[v * 4 + 3] = 255;
    }
    const nodeIndex = nodes.length;
    nodes.push({
      name: b.part.name,
      translation: [0, 0, 0],
      children: [],
      mesh: {
        mesh: { positions: local, normals: b.mesh.normals, indices: b.mesh.indices },
        colors,
        material: Math.max(0, materialKeys.indexOf(b.part.material)),
        name: b.part.name,
      },
    });
    nodes[index.get(b.part.node) ?? 0]!.children.push(nodeIndex);
  }

  return writeGlb({
    nodes,
    roots: [index.get('PixelRoot') ?? 0],
    materials,
    generator: `Pixel Sculpt ${SCULPT_VERSION}`,
    extras: {
      pixel: {
        engine: 'pixel-sculpt',
        version: SCULPT_VERSION,
        name: spec.name,
        subject: spec.subject,
        floating: character.meta.floating,
        eyeRadius: character.meta.eyeRadius,
        motion: spec.motion,
      },
    },
  });
}
