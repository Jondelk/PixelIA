import type { Vec3 } from './sdf.js';
import { cross, normalize } from './sdf.js';

/*
 * Renderizador de estudio por software (sin GPU ni dependencias).
 *
 * - Rasterizado diferido con supermuestreo (bordes suaves) e interpolación con corrección de
 *   perspectiva de normales, color y oclusión.
 * - Sombreado físico: difusa con envoltura suave, especular GGX con Fresnel, capa de laca
 *   (clearcoat), terciopelo (sheen), emisión, y reflejos de un estudio procedural (softboxes).
 * - Luz principal con mapa de sombras y filtrado PCF (sombras suaves), relleno frío y contraluz
 *   del color de acento.
 * - Suelo de estudio infinito del color de fondo, con sombra y oclusión de contacto calculadas
 *   desde el campo de distancia del personaje.
 * - Compresión suave de altas luces: los colores de marca se conservan tal cual.
 */

export interface RenderMaterial {
  /** Color base lineal (se multiplica por el color de vértice). */
  baseColor: Vec3;
  metallic: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  emissive: Vec3;
  /** 0–1: vidrio (más reflejo, menos difusa). */
  transmission: number;
}

export interface RenderMesh {
  positions: Float32Array;
  normals: Float32Array;
  /** Albedo lineal por vértice (RGB, 0–1). */
  colors: Float32Array;
  /** Oclusión ambiental por vértice (0–1). */
  ao: Float32Array;
  indices: Uint32Array;
  material: RenderMaterial;
}

export interface RenderView {
  width: number;
  height: number;
  /** Grados: 0 = de frente; negativo = desde la izquierda del espectador. */
  azimuth: number;
  elevation: number;
  fov?: number;
  /** Fondo sin suelo y con transparencia (para recortes). */
  transparent?: boolean;
}

export interface RenderScene {
  meshes: RenderMesh[];
  /** Centro y radio que deben encuadrarse. */
  center: Vec3;
  radius: number;
  /** Color de fondo/suelo (lineal). */
  backdrop: Vec3;
  /** Color de la contraluz (lineal). */
  rim: Vec3;
  /** Distancia al personaje, para la oclusión de contacto del suelo. */
  sdf?: (x: number, y: number, z: number) => number;
  groundY?: number;
  supersample?: number;
  /** Desplazamiento (m) a lo largo de la normal al consultar la sombra. */
  shadowOffset?: number;
  /** Exposición global (1 = estudio neutro). */
  exposure?: number;
}

// ---------------------------------------------------------------- utilidades

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Compresión de altas luces: identidad hasta 0.8, curva suave hasta 1. */
function shoulder(x: number): number {
  if (x <= 0.8) return x < 0 ? 0 : x;
  return 0.8 + 0.2 * (1 - Math.exp(-(x - 0.8) / 0.2));
}

function toSrgb(x: number): number {
  const v = shoulder(x);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// GGX / Smith / Schlick
function ggx(nh: number, a: number): number {
  const a2 = a * a;
  const d = nh * nh * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
}
function smith(nv: number, nl: number, a: number): number {
  const k = (a + 1) * (a + 1) * 0.125;
  return (nv / (nv * (1 - k) + k)) * (nl / (nl * (1 - k) + k));
}
const schlick = (f0: number, vh: number) => f0 + (1 - f0) * Math.pow(1 - vh, 5);

interface Light {
  dir: Vec3;
  color: Vec3;
  /** Envoltura de la difusa (luz más suave y amable). */
  wrap: number;
  shadow: boolean;
}

/** Estudio procedural: degradado y tres softboxes; `blur` (0–1) suaviza según la rugosidad. */
function environment(d: Vec3, backdrop: Vec3, blur: number): Vec3 {
  const [x, y, z] = d;
  const up = clamp01(y * 0.5 + 0.5);
  const base: Vec3 = [
    backdrop[0] * 0.55 + 0.35 * up,
    backdrop[1] * 0.55 + 0.36 * up,
    backdrop[2] * 0.55 + 0.38 * up,
  ];
  const sharp = 1 - blur * 0.85;
  const box = (cx: number, cy: number, cz: number, size: number, power: number) => {
    const dd = x * cx + y * cy + z * cz;
    const edge = Math.cos(size + blur * 0.6);
    return dd > edge ? power * Math.pow((dd - edge) / (1 - edge), 0.6 + 1.4 * (1 - sharp)) : 0;
  };
  const key = box(-0.55, 0.7, 0.45, 0.32, 3.2);
  const top = box(0, 1, 0, 0.5, 1.6);
  const side = box(0.8, 0.25, 0.55, 0.28, 1.4);
  return [
    base[0] + key + top + side * 0.9,
    base[1] + key + top + side * 0.95,
    base[2] + key * 0.97 + top + side,
  ];
}

// ---------------------------------------------------------------- render

export function renderScene(scene: RenderScene, view: RenderView): Uint8Array {
  const ss = scene.supersample ?? 2;
  const W = view.width * ss;
  const H = view.height * ss;
  const fov = ((view.fov ?? 30) * Math.PI) / 180;
  const groundY = scene.groundY ?? 0;
  const exposure = scene.exposure ?? 1;

  // Cámara
  const az = (view.azimuth * Math.PI) / 180;
  const el = (view.elevation * Math.PI) / 180;
  const dist = (scene.radius / Math.sin(fov / 2)) * 1.04;
  const center = scene.center;
  const eye: Vec3 = [
    center[0] + Math.sin(az) * Math.cos(el) * dist,
    center[1] + Math.sin(el) * dist,
    center[2] + Math.cos(az) * Math.cos(el) * dist,
  ];
  const fwd = normalize([center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]]);
  const right = normalize(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const focal = H / 2 / Math.tan(fov / 2);
  const aspect = W / H;
  const focalX = focal;
  void aspect;

  // Luces (dirección hacia la luz)
  const lights: Light[] = [
    { dir: normalize([-0.55, 0.72, 0.5]), color: [1.75, 1.68, 1.58], wrap: 0.2, shadow: true },
    { dir: normalize([0.75, 0.28, 0.55]), color: [0.34, 0.38, 0.46], wrap: 0.5, shadow: false },
    {
      dir: normalize([0.25, 0.5, -0.9]),
      color: [scene.rim[0] * 1.1, scene.rim[1] * 1.1, scene.rim[2] * 1.1],
      wrap: 0,
      shadow: false,
    },
  ];
  const key = lights[0]!;

  // ------------------------------------------------------------ mapa de sombras (luz principal)
  const SM = 2048;
  const lz = key.dir;
  const lx = normalize(cross([0, 1, 0], lz));
  const ly = cross(lz, lx);
  const extent = scene.radius * 2.6;
  const smDepth = new Float32Array(SM * SM).fill(Infinity);
  const toLight = (x: number, y: number, z: number): Vec3 => {
    const px = x - center[0];
    const py = y - center[1];
    const pz = z - center[2];
    return [
      ((px * lx[0] + py * lx[1] + pz * lx[2]) / extent + 0.5) * SM,
      (-(px * ly[0] + py * ly[1] + pz * ly[2]) / extent + 0.5) * SM,
      -(px * lz[0] + py * lz[1] + pz * lz[2]),
    ];
  };
  for (const mesh of scene.meshes) {
    const p = mesh.positions;
    const ix = mesh.indices;
    const proj = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      const [sx, sy, sz] = toLight(p[i]!, p[i + 1]!, p[i + 2]!);
      proj[i] = sx;
      proj[i + 1] = sy;
      proj[i + 2] = sz;
    }
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t]! * 3;
      const b = ix[t + 1]! * 3;
      const c = ix[t + 2]! * 3;
      rasterDepth(
        smDepth,
        SM,
        SM,
        proj[a]!,
        proj[a + 1]!,
        proj[a + 2]!,
        proj[b]!,
        proj[b + 1]!,
        proj[b + 2]!,
        proj[c]!,
        proj[c + 1]!,
        proj[c + 2]!,
      );
    }
  }
  const texel = extent / SM;
  const shadowAt = (x: number, y: number, z: number, nDotL: number, radius: number): number => {
    const [sx, sy, sz] = toLight(x, y, z);
    const bias = texel * (1.5 + 2.5 * (1 - nDotL)) * (radius > 1 ? 2.5 : 1);
    let lit = 0;
    let n = 0;
    // PCF con paso amplio: penumbra suave de softbox. Patrón rotado para evitar bandas.
    const stride = radius > 1 ? 2.2 : 1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const u = Math.floor(sx + (dx + dy * 0.37) * stride);
        const v = Math.floor(sy + (dy - dx * 0.37) * stride);
        n++;
        if (u < 0 || v < 0 || u >= SM || v >= SM) {
          lit++;
          continue;
        }
        if (sz - bias <= smDepth[v * SM + u]!) lit++;
      }
    }
    return lit / n;
  };

  // ------------------------------------------------------------ G-buffer
  const N = W * H;
  const depth = new Float32Array(N).fill(Infinity);
  const nbuf = new Float32Array(N * 3);
  const cbuf = new Float32Array(N * 3);
  const aobuf = new Float32Array(N);
  const mat = new Int16Array(N).fill(-1);

  scene.meshes.forEach((mesh, m) => {
    const p = mesh.positions;
    const count = p.length / 3;
    const sx = new Float32Array(count);
    const sy = new Float32Array(count);
    const iz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const dx = p[i * 3]! - eye[0];
      const dy = p[i * 3 + 1]! - eye[1];
      const dz = p[i * 3 + 2]! - eye[2];
      const cz = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
      const cx = dx * right[0] + dy * right[1] + dz * right[2];
      const cy = dx * up[0] + dy * up[1] + dz * up[2];
      sx[i] = W / 2 + (cx / cz) * focalX;
      sy[i] = H / 2 - (cy / cz) * focal;
      iz[i] = 1 / cz;
    }
    const ix = mesh.indices;
    const nn = mesh.normals;
    const col = mesh.colors;
    const ao = mesh.ao;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t]!;
      const b = ix[t + 1]!;
      const c = ix[t + 2]!;
      // Cara trasera (en el mundo): no se dibuja.
      const ax = p[a * 3]!;
      const ay = p[a * 3 + 1]!;
      const azz = p[a * 3 + 2]!;
      const e1x = p[b * 3]! - ax;
      const e1y = p[b * 3 + 1]! - ay;
      const e1z = p[b * 3 + 2]! - azz;
      const e2x = p[c * 3]! - ax;
      const e2y = p[c * 3 + 1]! - ay;
      const e2z = p[c * 3 + 2]! - azz;
      const fx = e1y * e2z - e1z * e2y;
      const fy = e1z * e2x - e1x * e2z;
      const fz = e1x * e2y - e1y * e2x;
      if (fx * (eye[0] - ax) + fy * (eye[1] - ay) + fz * (eye[2] - azz) <= 0) continue;

      const x0 = sx[a]!;
      const y0 = sy[a]!;
      const x1 = sx[b]!;
      const y1 = sy[b]!;
      const x2 = sx[c]!;
      const y2 = sy[c]!;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-12) continue;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maxX || minY > maxY) continue;
      const inv = 1 / area;
      const za = iz[a]!;
      const zb = iz[b]!;
      const zc = iz[c]!;
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          let w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
          let w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
          let w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const izp = w0 * za + w1 * zb + w2 * zc;
          const z = 1 / izp;
          const k = y * W + x;
          if (z >= depth[k]!) continue;
          depth[k] = z;
          // Corrección de perspectiva.
          w0 = w0 * za * z;
          w1 = w1 * zb * z;
          w2 = w2 * zc * z;
          const k3 = k * 3;
          for (let ch = 0; ch < 3; ch++) {
            nbuf[k3 + ch] = w0 * nn[a * 3 + ch]! + w1 * nn[b * 3 + ch]! + w2 * nn[c * 3 + ch]!;
            cbuf[k3 + ch] = w0 * col[a * 3 + ch]! + w1 * col[b * 3 + ch]! + w2 * col[c * 3 + ch]!;
          }
          aobuf[k] = w0 * ao[a]! + w1 * ao[b]! + w2 * ao[c]!;
          mat[k] = m;
        }
      }
    }
  });

  // ------------------------------------------------------------ sombreado
  const out = new Float32Array(N * 4);
  const back = scene.backdrop;
  const sky: Vec3 = [0.92, 0.95, 1.0];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      // Rayo de cámara
      const u = (x + 0.5 - W / 2) / focalX;
      const v = -(y + 0.5 - H / 2) / focal;
      const rx = fwd[0] + right[0] * u + up[0] * v;
      const ry = fwd[1] + right[1] * u + up[1] * v;
      const rz = fwd[2] + right[2] * u + up[2] * v;
      const m = mat[k]!;

      if (m < 0) {
        if (view.transparent) {
          out[k * 4 + 3] = 0;
          continue;
        }
        // Fondo y suelo de estudio: el color de fondo, oscurecido solo por sombra y contacto.
        let shade = 1;
        if (ry < 0) {
          const t = (groundY - eye[1]) / ry;
          const gx = eye[0] + rx * t;
          const gz = eye[2] + rz * t;
          const dc = Math.hypot(gx - center[0], gz - center[2]);
          if (dc < scene.radius * 3.2) {
            const s = shadowAt(gx, groundY, gz, key.dir[1], 3);
            let occ = 0;
            if (scene.sdf && dc < scene.radius * 1.8) {
              let w = 1;
              for (let i = 1; i <= 4; i++) {
                const hgt = 0.06 * i * i;
                occ += (w * Math.max(0, hgt - scene.sdf(gx, groundY + hgt, gz))) / hgt;
                w *= 0.6;
              }
              occ = clamp01(occ * 0.42);
            }
            const fade = 1 - clamp01((dc - scene.radius * 1.6) / (scene.radius * 1.6));
            const shadowed = 1 - (1 - s) * 0.42 * fade;
            shade = shadowed * (1 - occ * 0.75);
          }
        }
        // Viñeta suave de estudio (centro más luminoso).
        const vx = (x / W - 0.5) * 2;
        const vy = (y / H - 0.42) * 2;
        const vig = 1 - 0.1 * clamp01(vx * vx * 0.6 + vy * vy * 0.8);
        out[k * 4] = toSrgb(back[0] * shade * vig);
        out[k * 4 + 1] = toSrgb(back[1] * shade * vig);
        out[k * 4 + 2] = toSrgb(back[2] * shade * vig);
        out[k * 4 + 3] = 1;
        continue;
      }

      const material = scene.meshes[m]!.material;
      const z = depth[k]!;
      const px = eye[0] + rx * z;
      const py = eye[1] + ry * z;
      const pz = eye[2] + rz * z;
      const k3 = k * 3;
      let nx = nbuf[k3]!;
      let ny = nbuf[k3 + 1]!;
      let nz = nbuf[k3 + 2]!;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const rl = Math.hypot(rx, ry, rz);
      const vxv = -rx / rl;
      const vyv = -ry / rl;
      const vzv = -rz / rl;
      let nv = nx * vxv + ny * vyv + nz * vzv;
      if (nv < 0) {
        // Normal interpolada de espaldas a la cámara en siluetas: se corrige.
        nx += vxv * -nv;
        ny += vyv * -nv;
        nz += vzv * -nv;
        const l2 = Math.hypot(nx, ny, nz) || 1;
        nx /= l2;
        ny /= l2;
        nz /= l2;
        nv = 1e-3;
      }
      const ao = aobuf[k]!;
      const albedo: Vec3 = [
        cbuf[k3]! * material.baseColor[0],
        cbuf[k3 + 1]! * material.baseColor[1],
        cbuf[k3 + 2]! * material.baseColor[2],
      ];
      const metal = material.metallic;
      const rough = Math.max(0.04, material.roughness);
      const a = rough * rough;
      const f0: Vec3 = [
        0.04 * (1 - metal) + albedo[0] * metal,
        0.04 * (1 - metal) + albedo[1] * metal,
        0.04 * (1 - metal) + albedo[2] * metal,
      ];
      const diffuseWeight = (1 - metal) * (1 - material.transmission * 0.85);
      let r = 0;
      let g = 0;
      let b = 0;

      // Luz ambiente de cielo y rebote del suelo, con oclusión.
      const hemi = ny * 0.5 + 0.5;
      const amb: Vec3 = [
        (sky[0] * hemi + back[0] * (1 - hemi) * 0.8) * 0.42,
        (sky[1] * hemi + back[1] * (1 - hemi) * 0.8) * 0.42,
        (sky[2] * hemi + back[2] * (1 - hemi) * 0.8) * 0.42,
      ];
      r += albedo[0] * amb[0] * diffuseWeight * ao;
      g += albedo[1] * amb[1] * diffuseWeight * ao;
      b += albedo[2] * amb[2] * diffuseWeight * ao;

      for (const light of lights) {
        const [lxd, lyd, lzd] = light.dir;
        const ndl = nx * lxd + ny * lyd + nz * lzd;
        const wrapped = (ndl + light.wrap) / (1 + light.wrap);
        if (wrapped <= 0) continue;
        let vis = 1;
        if (light.shadow) {
          // Desplazamiento por la normal: evita el acné de sombra en mallas facetadas.
          const o = scene.shadowOffset ?? 0.012;
          vis =
            ndl > -0.1 ? shadowAt(px + nx * o, py + ny * o, pz + nz * o, Math.max(ndl, 0), 3) : 0;
          // Sombra propia más clara: la luz de estudio rebota y nunca deja negro puro.
          vis = 0.36 + 0.64 * vis;
        }
        // La oclusión también apaga un poco la luz directa (pliegues, axilas).
        vis *= 0.55 + 0.45 * ao;
        const diff = wrapped * vis * diffuseWeight;
        r += albedo[0] * light.color[0] * diff;
        g += albedo[1] * light.color[1] * diff;
        b += albedo[2] * light.color[2] * diff;
        if (ndl > 0) {
          const hx = lxd + vxv;
          const hy = lyd + vyv;
          const hz = lzd + vzv;
          const hl = Math.hypot(hx, hy, hz) || 1;
          const nh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl);
          const vh = Math.max(0, (vxv * hx + vyv * hy + vzv * hz) / hl);
          const spec = ((ggx(nh, a) * smith(nv, ndl, a)) / (4 * nv * ndl + 1e-4)) * ndl * vis;
          const fr = schlick(f0[0], vh);
          const fg = schlick(f0[1], vh);
          const fb = schlick(f0[2], vh);
          r += light.color[0] * spec * fr;
          g += light.color[1] * spec * fg;
          b += light.color[2] * spec * fb;
          if (material.clearcoat > 0) {
            const ca = Math.max(0.03, material.clearcoatRoughness) ** 2;
            const cs = ((ggx(nh, ca) * smith(nv, ndl, ca)) / (4 * nv * ndl + 1e-4)) * ndl * vis;
            const cf = schlick(0.04, vh) * material.clearcoat;
            r += light.color[0] * cs * cf;
            g += light.color[1] * cs * cf;
            b += light.color[2] * cs * cf;
          }
        }
      }

      // Reflejo del estudio (especular de entorno).
      const dvn = vxv * nx + vyv * ny + vzv * nz;
      const refl: Vec3 = [2 * dvn * nx - vxv, 2 * dvn * ny - vyv, 2 * dvn * nz - vzv];
      const env = environment(refl, back, rough);
      const fres = Math.pow(1 - nv, 5);
      const envOcc = 0.35 + 0.65 * ao;
      const envW = (1 - rough) * (1 - rough);
      for (let ch = 0; ch < 3; ch++) {
        const fe = f0[ch]! + (Math.max(1 - rough, f0[ch]!) - f0[ch]!) * fres;
        const add = env[ch]! * fe * envW * envOcc;
        if (ch === 0) r += add;
        else if (ch === 1) g += add;
        else b += add;
      }
      if (material.clearcoat > 0) {
        const envC = environment(refl, back, material.clearcoatRoughness);
        const fc = (0.04 + 0.96 * fres) * material.clearcoat * envOcc;
        r += envC[0] * fc;
        g += envC[1] * fc;
        b += envC[2] * fc;
      }
      // Terciopelo: brillo suave en los bordes (telas, arcilla, superficies mate).
      if (material.sheen > 0) {
        const s = Math.pow(1 - nv, 3) * material.sheen * 0.5 * ao;
        r += (albedo[0] * 0.6 + 0.4 * sky[0]) * s;
        g += (albedo[1] * 0.6 + 0.4 * sky[1]) * s;
        b += (albedo[2] * 0.6 + 0.4 * sky[2]) * s;
      }
      r += material.emissive[0];
      g += material.emissive[1];
      b += material.emissive[2];

      out[k * 4] = toSrgb(r * exposure);
      out[k * 4 + 1] = toSrgb(g * exposure);
      out[k * 4 + 2] = toSrgb(b * exposure);
      out[k * 4 + 3] = 1;
    }
  }

  // ------------------------------------------------------------ reducción (antialiasing)
  const w = view.width;
  const h = view.height;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const k = ((y * ss + sy) * W + (x * ss + sx)) * 4;
          const al = out[k + 3]!;
          r += out[k]! * al;
          g += out[k + 1]! * al;
          b += out[k + 2]! * al;
          alpha += al;
        }
      }
      const o = (y * w + x) * 4;
      if (alpha > 0) {
        rgba[o] = Math.round(clamp01(r / alpha) * 255);
        rgba[o + 1] = Math.round(clamp01(g / alpha) * 255);
        rgba[o + 2] = Math.round(clamp01(b / alpha) * 255);
      }
      rgba[o + 3] = Math.round((alpha / (ss * ss)) * 255);
    }
  }
  return rgba;
}

/** Rasteriza solo profundidad (mapa de sombras). */
function rasterDepth(
  buf: Float32Array,
  W: number,
  H: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
) {
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-9) return;
  const inv = 1 / area;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
      const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * z0 + w1 * z1 + w2 * z2;
      const k = y * W + x;
      if (z < buf[k]!) buf[k] = z;
    }
  }
}
