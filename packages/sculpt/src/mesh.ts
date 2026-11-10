import type { Shape, Vec3 } from './sdf.js';

/*
 * De campo de distancia a malla de triángulos: Surface Nets disperso.
 *
 * - La rejilla se divide en bloques de B³ celdas. Con una muestra en el centro de cada bloque se
 *   sabe si la superficie puede pasar por él (la distancia acota dónde está); solo esos bloques
 *   se evalúan y guardan. Así la memoria y el coste crecen con el área, no con el volumen.
 * - Un vértice por celda que corta la superficie, en el promedio de los cruces de sus aristas, y
 *   luego proyectado sobre la superficie real (Newton) para que la silueta sea exacta.
 * - Normales del gradiente del campo: sombreado suave sin facetas.
 * - Malla cerrada y orientada hacia fuera.
 */

export interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface MeshOptions {
  /** Tamaño de celda (resolución) en metros. */
  cell: number;
  /** Iteraciones de proyección sobre la superficie. */
  project?: number;
}

const B = 8;
const B3 = B * B * B;

export function meshShape(shape: Shape, options: MeshOptions): Mesh {
  const h = options.cell;
  const f = shape.d;
  const pad = h * 2;
  const min: Vec3 = [shape.min[0] - pad, shape.min[1] - pad, shape.min[2] - pad];
  const nx = Math.max(2, Math.ceil((shape.max[0] + pad - min[0]) / h) + 1);
  const ny = Math.max(2, Math.ceil((shape.max[1] + pad - min[1]) / h) + 1);
  const nz = Math.max(2, Math.ceil((shape.max[2] + pad - min[2]) / h) + 1);
  const bx = Math.ceil(nx / B);
  const by = Math.ceil(ny / B);
  const bz = Math.ceil(nz / B);
  if (bx * by * bz > 30_000_000) throw new Error(`Rejilla demasiado grande (${nx}×${ny}×${nz})`);

  // 1) Clasificación de bloques: cerca de la superficie (se evalúan) o lejos (signo uniforme).
  const halfDiag = (B * h * Math.sqrt(3)) / 2;
  const margin = halfDiag * 1.2 + h * 2;
  const far = new Float32Array(bx * by * bz);
  const blocks = new Map<number, Float32Array>();
  const nearList: number[] = [];
  for (let k = 0; k < bz; k++) {
    for (let j = 0; j < by; j++) {
      for (let i = 0; i < bx; i++) {
        const b = i + bx * (j + by * k);
        const cx = min[0] + (i * B + B / 2) * h;
        const cy = min[1] + (j * B + B / 2) * h;
        const cz = min[2] + (k * B + B / 2) * h;
        const v = f(cx, cy, cz);
        if (Math.abs(v) < margin) {
          nearList.push(b);
        } else {
          far[b] = v < 0 ? -margin : margin;
        }
      }
    }
  }
  for (const b of nearList) {
    const i0 = (b % bx) * B;
    const j0 = (Math.floor(b / bx) % by) * B;
    const k0 = Math.floor(b / (bx * by)) * B;
    const data = new Float32Array(B3);
    for (let k = 0; k < B; k++) {
      const z = min[2] + (k0 + k) * h;
      for (let j = 0; j < B; j++) {
        const y = min[1] + (j0 + j) * h;
        for (let i = 0; i < B; i++) data[i + B * (j + B * k)] = f(min[0] + (i0 + i) * h, y, z);
      }
    }
    blocks.set(b, data);
  }

  const val = (i: number, j: number, k: number): number => {
    const bi = (i / B) | 0;
    const bj = (j / B) | 0;
    const bk = (k / B) | 0;
    if (bi >= bx || bj >= by || bk >= bz) return margin;
    const b = bi + bx * (bj + by * bk);
    const data = blocks.get(b);
    if (!data) return far[b]!;
    return data[i - bi * B + B * (j - bj * B + B * (k - bk * B))]!;
  };

  // 2) Un vértice por celda con cambio de signo (solo en bloques cercanos).
  const cellIndex = new Map<number, Int32Array>();
  const pos: number[] = [];
  const nor: number[] = [];
  const eps = h * 0.35;
  const project = options.project ?? 2;
  const EDGES = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ] as const;
  const corner = new Float64Array(8);

  for (const b of nearList) {
    const i0 = (b % bx) * B;
    const j0 = (Math.floor(b / bx) % by) * B;
    const k0 = Math.floor(b / (bx * by)) * B;
    const index = new Int32Array(B3).fill(-1);
    cellIndex.set(b, index);
    for (let kk = 0; kk < B; kk++) {
      const k = k0 + kk;
      if (k >= nz - 1) break;
      for (let jj = 0; jj < B; jj++) {
        const j = j0 + jj;
        if (j >= ny - 1) break;
        for (let ii = 0; ii < B; ii++) {
          const i = i0 + ii;
          if (i >= nx - 1) break;
          let mask = 0;
          for (let c = 0; c < 8; c++) {
            const v = val(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
            corner[c] = v;
            if (v < 0) mask |= 1 << c;
          }
          if (mask === 0 || mask === 255) continue;

          let sx = 0;
          let sy = 0;
          let sz = 0;
          let count = 0;
          for (const [ea, eb] of EDGES) {
            const va = corner[ea]!;
            const vb = corner[eb]!;
            if (va < 0 === vb < 0) continue;
            const t = va / (va - vb);
            sx += (ea & 1) + ((eb & 1) - (ea & 1)) * t;
            sy += ((ea >> 1) & 1) + (((eb >> 1) & 1) - ((ea >> 1) & 1)) * t;
            sz += ((ea >> 2) & 1) + (((eb >> 2) & 1) - ((ea >> 2) & 1)) * t;
            count++;
          }
          let x = min[0] + (i + sx / count) * h;
          let y = min[1] + (j + sy / count) * h;
          let z = min[2] + (k + sz / count) * h;

          let gx = 0;
          let gy = 0;
          let gz = 0;
          for (let it = 0; it <= project; it++) {
            gx = f(x + eps, y, z) - f(x - eps, y, z);
            gy = f(x, y + eps, z) - f(x, y - eps, z);
            gz = f(x, y, z + eps) - f(x, y, z - eps);
            const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
            gx /= gl;
            gy /= gl;
            gz /= gl;
            if (it === project) break;
            // Paso de Newton acotado a la celda: el vértice no escapa de su sitio.
            const d = Math.max(-h, Math.min(h, f(x, y, z)));
            x -= gx * d;
            y -= gy * d;
            z -= gz * d;
          }
          index[ii + B * (jj + B * kk)] = pos.length / 3;
          pos.push(x, y, z);
          nor.push(gx, gy, gz);
        }
      }
    }
  }

  const cell = (i: number, j: number, k: number): number => {
    if (i < 0 || j < 0 || k < 0) return -1;
    const bi = (i / B) | 0;
    const bj = (j / B) | 0;
    const bk = (k / B) | 0;
    const index = cellIndex.get(bi + bx * (bj + by * bk));
    if (!index) return -1;
    return index[i - bi * B + B * (j - bj * B + B * (k - bk * B))]!;
  };

  // 3) Un cuadrilátero por arista de la rejilla que cruza la superficie.
  const tris: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // Diagonal más corta: triángulos mejor formados.
    const d1 = dist2(pos, a, c);
    const d2 = dist2(pos, b, d);
    const [p, q, r, s] = flip ? [a, d, c, b] : [a, b, c, d];
    if (d1 <= d2) tris.push(p, q, r, p, r, s);
    else tris.push(p, q, s, q, r, s);
  };

  for (const b of nearList) {
    const i0 = (b % bx) * B;
    const j0 = (Math.floor(b / bx) % by) * B;
    const k0 = Math.floor(b / (bx * by)) * B;
    for (let kk = 0; kk < B; kk++) {
      const k = k0 + kk;
      if (k >= nz - 1) break;
      for (let jj = 0; jj < B; jj++) {
        const j = j0 + jj;
        if (j >= ny - 1) break;
        for (let ii = 0; ii < B; ii++) {
          const i = i0 + ii;
          if (i >= nx - 1) break;
          const v0 = val(i, j, k) < 0;
          if (j > 0 && k > 0 && v0 !== val(i + 1, j, k) < 0) {
            quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !v0);
          }
          if (i > 0 && k > 0 && v0 !== val(i, j + 1, k) < 0) {
            quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !v0);
          }
          if (i > 0 && j > 0 && v0 !== val(i, j, k + 1) < 0) {
            quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !v0);
          }
        }
      }
    }
  }

  return {
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nor),
    indices: Uint32Array.from(tris),
  };
}

function dist2(p: number[], a: number, b: number): number {
  const dx = p[a * 3]! - p[b * 3]!;
  const dy = p[a * 3 + 1]! - p[b * 3 + 1]!;
  const dz = p[a * 3 + 2]! - p[b * 3 + 2]!;
  return dx * dx + dy * dy + dz * dz;
}

/** Volumen con signo (positivo si las caras miran hacia fuera). */
export function signedVolume(mesh: Mesh): number {
  const p = mesh.positions;
  let v = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t]! * 3;
    const b = mesh.indices[t + 1]! * 3;
    const c = mesh.indices[t + 2]! * 3;
    v +=
      p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
      p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
      p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
  }
  return v / 6;
}

/** Aristas que no comparten exactamente dos triángulos (0 = malla cerrada). */
export function openEdges(mesh: Mesh): number {
  const count = new Map<string, number>();
  const ix = mesh.indices;
  for (let t = 0; t < ix.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = ix[t + e]!;
      const b = ix[t + ((e + 1) % 3)]!;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const c of count.values()) if (c !== 2) open++;
  return open;
}
