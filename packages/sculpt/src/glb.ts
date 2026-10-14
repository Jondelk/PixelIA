import type { Mesh } from './mesh.js';
import type { Vec3 } from './sdf.js';

/*
 * Escritor glTF 2.0 binario (.glb), sin dependencias.
 *
 * - Jerarquía de nodos con pivotes (la web los anima por nombre).
 * - Mallas con POSITION, NORMAL, COLOR_0 (pintura y oclusión horneadas, lineal) e índices uint32.
 * - Materiales PBR metal/rugosidad con extensiones estándar que three.js y Blender leen:
 *   KHR_materials_clearcoat (laca), KHR_materials_sheen (terciopelo),
 *   KHR_materials_emissive_strength (brillos de los ojos), KHR_materials_transmission (vidrio).
 */

export interface GlbMaterial {
  name: string;
  /** Color base lineal RGBA (se multiplica por COLOR_0). */
  baseColor: [number, number, number, number];
  metallic: number;
  roughness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: { color: Vec3; roughness: number };
  emissive?: Vec3;
  emissiveStrength?: number;
  transmission?: number;
  doubleSided?: boolean;
}

export interface GlbNode {
  name: string;
  /** Traslación relativa al padre. */
  translation: Vec3;
  children: number[];
  mesh?: { mesh: Mesh; colors: Uint8Array; material: number; name: string };
}

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_INT = 5125;
const UNSIGNED_SHORT = 5123;
const BYTE = 5120;

export function writeGlb(input: {
  nodes: GlbNode[];
  roots: number[];
  materials: GlbMaterial[];
  generator: string;
  extras?: Record<string, unknown>;
}): Uint8Array {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];

  let quantized = false;
  const addView = (data: Uint8Array, target: number, byteStride?: number) => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
    bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: data.byteLength,
      target,
      ...(byteStride ? { byteStride } : {}),
    });
    chunks.push(data);
    byteLength += data.byteLength;
    return bufferViews.length - 1;
  };
  const bytes = (a: Float32Array | Uint32Array | Uint8Array) =>
    new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

  const meshes: Record<string, unknown>[] = [];
  const nodes = input.nodes.map((node) => {
    const out: Record<string, unknown> = { name: node.name };
    if (node.translation.some((v) => v !== 0)) out.translation = node.translation;
    if (node.children.length) out.children = node.children;
    if (node.mesh) {
      const { mesh, colors } = node.mesh;
      const count = mesh.positions.length / 3;
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < mesh.positions.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const v = mesh.positions[i + k]!;
          if (v < lo[k]!) lo[k] = v;
          if (v > hi[k]!) hi[k] = v;
        }
      }
      const position = accessors.push({
        bufferView: addView(bytes(mesh.positions), ARRAY_BUFFER),
        componentType: FLOAT,
        count,
        type: 'VEC3',
        min: lo,
        max: hi,
      });
      // Normales cuantizadas a 8 bits (KHR_mesh_quantization): un tercio del tamaño, sin
      // diferencia visible.
      const packed = new Int8Array(count * 4);
      for (let v = 0; v < count; v++) {
        for (let k = 0; k < 3; k++) {
          packed[v * 4 + k] = Math.round(Math.max(-1, Math.min(1, mesh.normals[v * 3 + k]!)) * 127);
        }
      }
      const normal = accessors.push({
        bufferView: addView(new Uint8Array(packed.buffer), ARRAY_BUFFER, 4),
        componentType: BYTE,
        normalized: true,
        count,
        type: 'VEC3',
      });
      quantized = true;
      const color = accessors.push({
        bufferView: addView(colors, ARRAY_BUFFER),
        componentType: UNSIGNED_BYTE,
        normalized: true,
        count,
        type: 'VEC4',
      });
      const short = count <= 65535;
      const indices = accessors.push({
        bufferView: addView(
          short ? new Uint8Array(Uint16Array.from(mesh.indices).buffer) : bytes(mesh.indices),
          ELEMENT_ARRAY_BUFFER,
        ),
        componentType: short ? UNSIGNED_SHORT : UNSIGNED_INT,
        count: mesh.indices.length,
        type: 'SCALAR',
      });
      meshes.push({
        name: node.mesh.name,
        primitives: [
          {
            attributes: { POSITION: position - 1, NORMAL: normal - 1, COLOR_0: color - 1 },
            indices: indices - 1,
            material: node.mesh.material,
            mode: 4,
          },
        ],
      });
      out.mesh = meshes.length - 1;
    }
    return out;
  });

  const used = new Set<string>();
  const materials = input.materials.map((m) => {
    const extensions: Record<string, unknown> = {};
    if (m.clearcoat) {
      extensions.KHR_materials_clearcoat = {
        clearcoatFactor: m.clearcoat,
        clearcoatRoughnessFactor: m.clearcoatRoughness ?? 0.1,
      };
    }
    if (m.sheen) {
      extensions.KHR_materials_sheen = {
        sheenColorFactor: m.sheen.color,
        sheenRoughnessFactor: m.sheen.roughness,
      };
    }
    if (m.emissiveStrength && m.emissiveStrength !== 1) {
      extensions.KHR_materials_emissive_strength = { emissiveStrength: m.emissiveStrength };
    }
    if (m.transmission) {
      extensions.KHR_materials_transmission = { transmissionFactor: m.transmission };
    }
    for (const key of Object.keys(extensions)) used.add(key);
    return {
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.baseColor,
        metallicFactor: m.metallic,
        roughnessFactor: m.roughness,
      },
      ...(m.emissive ? { emissiveFactor: m.emissive } : {}),
      ...(m.doubleSided ? { doubleSided: true } : {}),
      ...(m.baseColor[3] < 1 ? { alphaMode: 'BLEND' } : {}),
      ...(Object.keys(extensions).length ? { extensions } : {}),
    };
  });

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: input.generator },
    scene: 0,
    scenes: [{ name: 'Pixel', nodes: input.roots }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: align4(byteLength) }],
  };
  if (quantized) {
    used.add('KHR_mesh_quantization');
    json.extensionsRequired = ['KHR_mesh_quantization'];
  }
  if (used.size) json.extensionsUsed = [...used];
  if (input.extras) json.extras = input.extras;

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array(align4(jsonBytes.length)).fill(0x20);
  jsonPadded.set(jsonBytes);
  const bin = new Uint8Array(align4(byteLength));
  let offset = 0;
  for (const chunk of chunks) {
    bin.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const total = 12 + 8 + jsonPadded.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonPadded, 20);
  const binStart = 20 + jsonPadded.length;
  view.setUint32(binStart, bin.length, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // "BIN\0"
  out.set(bin, binStart + 8);
  return out;
}

const align4 = (n: number) => (n + 3) & ~3;

/** Lee la cabecera y el JSON de un .glb (para pruebas y verificación). */
export function readGlbJson(glb: Uint8Array): { json: Record<string, unknown>; binLength: number } {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('No es un GLB');
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as Record<
    string,
    unknown
  >;
  const binLength = view.getUint32(20 + jsonLength, true);
  return { json, binLength };
}
