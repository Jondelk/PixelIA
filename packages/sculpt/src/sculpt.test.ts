import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildCharacter } from './character.js';
import { readGlbJson, writeGlb } from './glb.js';
import { RENDER_VIEWS, sculptCharacter } from './index.js';
import { meshShape, openEdges, signedVolume } from './mesh.js';
import { encodePng } from './png.js';
import { capsule, ellipsoid, smoothUnion, sphere } from './sdf.js';
import type { CharacterSpec } from './spec.js';

function spec(overrides: Partial<CharacterSpec> = {}): CharacterSpec {
  return {
    specVersion: 2,
    name: 'Prueba',
    subject: 'coffee_bean',
    archetype: 'seed',
    body: {
      width: 0.9,
      height: 1.1,
      depth: 0.85,
      roundness: 0.8,
      finish: 'satin',
      surfaceDetail: 'center_groove',
    },
    colors: {
      body: '#6B3E26',
      bodyShade: '#53301E',
      secondary: '#E8D9C0',
      accent: '#C8102E',
      limb: '#5E3722',
      hand: '#E8D9C0',
      feature: '#120B08',
      sclera: '#FAFAF7',
      blush: '#D98A86',
      backdrop: '#EDE6DE',
      rim: '#D9465A',
    },
    face: {
      eyes: 'round',
      mouth: 'smile',
      style: 'friendly_minimal',
      scale: 1,
      brows: true,
      blush: true,
    },
    limbs: { arms: true, legs: true, thickness: 0.9 },
    stance: 'balanced',
    accessories: [],
    motion: { idle: 'bounce', energy: 0.5, expressiveness: 0.6 },
    ...overrides,
  };
}

/** Comprueba la estructura binaria de un .glb como lo haría un validador glTF. */
function validateGlb(glb: Uint8Array) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(glb.byteLength);
  const { json, binLength } = readGlbJson(glb);
  const views = json.bufferViews as {
    byteOffset: number;
    byteLength: number;
    byteStride?: number;
  }[];
  const accessors = json.accessors as {
    bufferView: number;
    componentType: number;
    count: number;
    type: string;
  }[];
  const size: Record<number, number> = { 5120: 1, 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
  const comps: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };
  for (const v of views) {
    expect(v.byteOffset % 4).toBe(0);
    expect(v.byteOffset + v.byteLength).toBeLessThanOrEqual(binLength);
    if (v.byteStride) expect(v.byteStride % 4).toBe(0);
  }
  for (const a of accessors) {
    const v = views[a.bufferView]!;
    const element = size[a.componentType]! * comps[a.type]!;
    const stride = v.byteStride ?? element;
    expect((a.count - 1) * stride + element).toBeLessThanOrEqual(v.byteLength);
  }
  const used = (json.extensionsUsed as string[] | undefined) ?? [];
  for (const required of (json.extensionsRequired as string[] | undefined) ?? [])
    expect(used).toContain(required);
  return json;
}

describe('Mallas', () => {
  it('una esfera sale cerrada, orientada hacia fuera y con el volumen correcto', () => {
    const mesh = meshShape(sphere([0, 0, 0], 0.5), { cell: 0.02 });
    expect(openEdges(mesh)).toBe(0);
    expect(signedVolume(mesh)).toBeCloseTo((4 / 3) * Math.PI * 0.125, 2);
  });

  it('las uniones suaves también son mallas cerradas', () => {
    const body = smoothUnion(
      0.08,
      ellipsoid([0, 0.8, 0], [0.55, 0.75, 0.45]),
      capsule([0.5, 0.8, 0], [0.8, 0.3, 0.1], 0.1),
    );
    const mesh = meshShape(body, { cell: 0.015 });
    expect(openEdges(mesh)).toBe(0);
    expect(signedVolume(mesh)).toBeGreaterThan(0);
  });
});

describe('Formatos', () => {
  it('PNG válido que se puede decodificar', () => {
    const w = 7;
    const h = 5;
    const rgba = new Uint8Array(w * h * 4).map((_, i) => (i * 37) % 256);
    const png = encodePng(rgba, w, h);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // Decodifica IDAT y deshace el filtro Paeth.
    const idatLength = new DataView(png.buffer).getUint32(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLength));
    const stride = w * 4;
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      expect(raw[y * (stride + 1)]).toBe(4);
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? out[y * stride + x - 4]! : 0;
        const b = y > 0 ? out[(y - 1) * stride + x]! : 0;
        const c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4]! : 0;
        const p = a + b - c;
        const pr =
          Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
            ? a
            : Math.abs(p - b) <= Math.abs(p - c)
              ? b
              : c;
        out[y * stride + x] = (raw[y * (stride + 1) + 1 + x]! + pr) & 255;
      }
    }
    expect([...out]).toEqual([...rgba]);
  });

  it('GLB con jerarquía, materiales y accesores bien alineados', () => {
    const mesh = meshShape(sphere([0, 0, 0], 0.3), { cell: 0.03 });
    const colors = new Uint8Array((mesh.positions.length / 3) * 4).fill(200);
    const glb = writeGlb({
      nodes: [
        { name: 'PixelRoot', translation: [0, 0, 0], children: [1] },
        {
          name: 'Body',
          translation: [0, 1, 0],
          children: [],
          mesh: { mesh, colors, material: 0, name: 'Body' },
        },
      ],
      roots: [0],
      materials: [
        { name: 'Body', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 0.4, clearcoat: 0.5 },
      ],
      generator: 'test',
    });
    const json = validateGlb(glb);
    expect(json.extensionsUsed).toEqual(
      expect.arrayContaining(['KHR_materials_clearcoat', 'KHR_mesh_quantization']),
    );
  });
});

describe('Personajes de marca', () => {
  it('cada sujeto del catálogo se construye con el rig completo', () => {
    const subjects: [string, CharacterSpec['archetype']][] = [
      ['coffee_bean', 'seed'],
      ['cacao_pod', 'seed'],
      ['sprout', 'seed'],
      ['bread_loaf', 'blob'],
      ['paw_creature', 'blob'],
      ['leaf', 'drop'],
      ['water_drop', 'drop'],
      ['health_capsule', 'capsule'],
      ['thread_spool', 'capsule'],
      ['book', 'block'],
      ['building_block', 'block'],
      ['shield', 'block'],
      ['monolith', 'block'],
      ['crystal_core', 'crystal'],
      ['prism', 'crystal'],
      ['desconocido', 'blob'],
    ];
    for (const [subject, archetype] of subjects) {
      const ch = buildCharacter(spec({ subject, archetype }));
      const nodes = ch.nodes.map((n) => n.name);
      expect(nodes, subject).toEqual(
        expect.arrayContaining([
          'PixelRoot',
          'Body',
          'Face',
          'Eye_L',
          'Eye_R',
          'Pupil_L',
          'Pupil_R',
          'Mouth',
          'Arm_L',
          'Arm_R',
          'Leg_L',
          'Leg_R',
        ]),
      );
      // El cuerpo existe y el rostro está sobre él (los ojos delante del centro).
      const eye = ch.nodes.find((n) => n.name === 'Eye_L')!;
      expect(eye.pivot[2], subject).toBeGreaterThan(0);
      expect(eye.pivot[0], subject).toBeGreaterThan(0);
      // Apoyado en el suelo.
      expect(ch.occluder.d(0, -0.01, 0), subject).toBeGreaterThan(0);
    }
  });

  it('toda la utilería se construye', () => {
    const ids = [
      'leaves',
      'cup',
      'hardhat',
      'glasses',
      'orbit_ring',
      'antenna',
      'ears',
      'scarf',
      'badge',
      'cross_badge',
      'bubbles',
      'scroll',
    ] as const;
    for (const id of ids) {
      const ch = buildCharacter(
        spec({ accessories: [{ id, color: '#3B82F6', detailColor: '#1E40AF' }] }),
      );
      expect(
        ch.parts.some((p) => p.name.startsWith('Acc_') || p.name.startsWith('Ear_')),
        id,
      ).toBe(true);
    }
  });

  it('flotante: sin piernas y suspendido sobre el suelo', () => {
    const ch = buildCharacter(
      spec({ stance: 'floating', limbs: { arms: true, legs: false, thickness: 1 } }),
    );
    expect(ch.meta.floating).toBe(true);
    expect(ch.nodes.some((n) => n.name === 'Leg_L')).toBe(false);
    expect(ch.occluder.d(0, 0.05, 0)).toBeGreaterThan(0.1);
  });

  it('esculpe de punta a punta: GLB válido y una imagen por vista, de forma determinista', () => {
    const options = {
      size: 48,
      quality: 'draft' as const,
      views: ['hero', 'cutout'] as ('hero' | 'cutout')[],
    };
    const a = sculptCharacter(
      spec({ accessories: [{ id: 'cup', color: '#FBF7F0', detailColor: '#2A160C' }] }),
      options,
    );
    const b = sculptCharacter(
      spec({ accessories: [{ id: 'cup', color: '#FBF7F0', detailColor: '#2A160C' }] }),
      options,
    );
    validateGlb(a.glb);
    expect(Object.keys(a.renders).sort()).toEqual(['cutout', 'hero']);
    expect(Buffer.from(a.glb).equals(Buffer.from(b.glb))).toBe(true);
    expect(a.stats.triangles).toBeGreaterThan(5000);
    expect(Object.keys(RENDER_VIEWS)).toEqual(['hero', 'front', 'three_quarter', 'side', 'cutout']);
  }, 60_000);
});
