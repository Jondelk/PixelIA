import type { AvatarConcept } from '@pixel/contracts';

/*
 * Traducción visual pura: AvatarProfile → especificación de escena.
 *
 * Aquí NO hay reglas de negocio (esas viven en el Avatar Concept Engine de la API): solo se
 * convierten decisiones ya tomadas (forma, proporciones, acabado, rostro…) en números que el
 * renderer 3D entiende. Los componentes Three.js solo leen esta especificación.
 */

export type AvatarProfileInput = Pick<
  AvatarConcept,
  | 'name'
  | 'bodyShape'
  | 'proportions'
  | 'faceStyle'
  | 'eyesStyle'
  | 'mouthStyle'
  | 'primaryColor'
  | 'secondaryColor'
  | 'accentColor'
  | 'accessories'
  | 'idleBehavior'
  | 'expressiveness'
  | 'renderHints'
>;

export type BodyKind = AvatarConcept['renderHints']['archetype'];
export type AccessoryKind = 'leaf' | 'cup' | 'orbit_ring' | 'helmet' | 'badge';

export interface AccessorySpec {
  kind: AccessoryKind;
  attach: 'head' | 'hand' | 'body' | 'chest';
  color: string;
  detailColor: string;
}

export interface MaterialSpec {
  color: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  flatShading: boolean;
}

export interface SceneSpec {
  body: {
    kind: BodyKind;
    /** Semiejes del cuerpo en unidades de escena. */
    halfWidth: number;
    halfHeight: number;
    halfDepth: number;
    roundness: number;
    groove: boolean;
    panelLines: boolean;
    material: MaterialSpec;
    detailColor: string;
  };
  face: {
    eyes: AvatarConcept['eyesStyle'];
    mouth: AvatarConcept['mouthStyle'];
    scale: number;
    eyeY: number;
    eyeSpacing: number;
    mouthY: number;
    featureColor: string;
    blush: boolean;
    blushColor: string;
    accentColor: string;
  };
  limbs: {
    arms: boolean;
    legs: boolean;
    color: string;
    armLength: number;
    legLength: number;
  };
  accessories: AccessorySpec[];
  motion: {
    idle: AvatarConcept['idleBehavior']['animation'];
    energy: number;
    /** 0–1 */
    expressiveness: number;
    stance: AvatarConcept['proportions']['stance'];
  };
  /** Altura del suelo (bajo los pies) para sombras. */
  groundY: number;
  accentColor: string;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Mezcla con blanco (amount > 0) o negro (amount < 0). */
export function shade(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mixed = hexToRgb(hex).map((c) => Math.round(c + (target - c) * t));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function luminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const FINISH: Record<
  AvatarConcept['renderHints']['finish'],
  Omit<MaterialSpec, 'color' | 'flatShading'>
> = {
  matte: { roughness: 0.78, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.6 },
  clay: { roughness: 0.92, metalness: 0, clearcoat: 0, clearcoatRoughness: 1 },
  satin: { roughness: 0.48, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.4 },
  glossy: { roughness: 0.22, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.15 },
  metallic: { roughness: 0.32, metalness: 0.75, clearcoat: 0.4, clearcoatRoughness: 0.25 },
  glass: { roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 },
};

/** Accesorios descritos en texto → piezas 3D disponibles. Máximo 3, sin repetir. */
export function accessorySpecs(profile: AvatarProfileInput): AccessorySpec[] {
  const accent = profile.accentColor.hex;
  const result: AccessorySpec[] = [];
  const add = (spec: AccessorySpec) => {
    if (!result.some((item) => item.kind === spec.kind) && result.length < 3) result.push(spec);
  };
  for (const text of profile.accessories) {
    const value = text.toLocaleLowerCase('es');
    if (/hoja|brote|cafeto/.test(value))
      add({ kind: 'leaf', attach: 'head', color: '#5E9A3F', detailColor: '#3E6B2A' });
    else if (/taza|tinto/.test(value))
      add({ kind: 'cup', attach: 'hand', color: '#F4EEE6', detailColor: profile.primaryColor.hex });
    else if (/anillo|orbital|órbita|partícula/.test(value))
      add({ kind: 'orbit_ring', attach: 'body', color: accent, detailColor: accent });
    else if (/casco/.test(value))
      add({ kind: 'helmet', attach: 'head', color: accent, detailColor: shade(accent, -0.25) });
    else add({ kind: 'badge', attach: 'chest', color: accent, detailColor: shade(accent, -0.3) });
  }
  return result;
}

/** z de la superficie frontal del cuerpo en (x, y), para apoyar el rostro. */
export function frontZ(body: SceneSpec['body'], x: number, y: number): number {
  const { halfWidth: w, halfHeight: h, halfDepth: d } = body;
  if (body.kind === 'block') return d;
  const inside = Math.max(0.05, 1 - (x / w) ** 2 - (y / h) ** 2);
  const factor = body.kind === 'crystal' ? 0.86 : 1;
  return d * Math.sqrt(inside) * factor;
}

export function profileToScene(profile: AvatarProfileInput): SceneSpec {
  const { proportions, renderHints } = profile;
  const kind = renderHints.archetype;

  const halfWidth = 0.95 * proportions.width;
  const halfHeight = 1.05 * proportions.height;
  const halfDepth = (kind === 'seed' ? 0.72 : kind === 'block' ? 0.7 : 0.85) * proportions.depth;
  const faceScale = proportions.faceScale;

  const floating = proportions.stance === 'floating';
  const legLength = floating ? 0 : 0.42;
  const primary = profile.primaryColor.hex;

  return {
    body: {
      kind,
      halfWidth,
      halfHeight,
      halfDepth,
      roundness: renderHints.roundness,
      groove: renderHints.surfaceDetail === 'center_groove',
      panelLines: renderHints.surfaceDetail === 'panel_lines',
      material: {
        color: primary,
        ...FINISH[renderHints.finish],
        flatShading: kind === 'crystal' || renderHints.surfaceDetail === 'facets',
      },
      detailColor: shade(primary, -0.45),
    },
    face: {
      eyes: profile.eyesStyle,
      mouth: profile.mouthStyle,
      scale: faceScale,
      eyeY: halfHeight * 0.2,
      eyeSpacing: halfWidth * 0.36 * faceScale,
      mouthY: -halfHeight * 0.08,
      featureColor: luminance(primary) > 0.45 ? '#15181F' : '#1A0F0A',
      blush: profile.faceStyle === 'friendly_minimal' || profile.faceStyle === 'expressive_cartoon',
      blushColor: shade(profile.accentColor.hex, 0.1),
      accentColor: profile.accentColor.hex,
    },
    limbs: {
      arms: true,
      legs: !floating,
      color: shade(primary, -0.35),
      armLength: 0.5 + halfHeight * 0.12,
      legLength,
    },
    accessories: accessorySpecs(profile),
    motion: {
      idle: profile.idleBehavior.animation,
      energy: profile.idleBehavior.energy,
      expressiveness: clamp(profile.expressiveness / 100),
      stance: proportions.stance,
    },
    groundY: -(halfHeight + legLength + (floating ? 0.35 : 0.08)),
    accentColor: profile.accentColor.hex,
  };
}
