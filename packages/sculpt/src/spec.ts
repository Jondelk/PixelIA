/*
 * Especificación cerrada del personaje que el escultor sabe construir.
 *
 * La API traduce el concepto de avatar de la marca (sujeto, proporciones, rostro, colores,
 * utilería en texto libre…) a esta especificación; el escultor no conoce reglas de negocio.
 * Misma especificación → mismo modelo (todo es determinista).
 */

export const CHARACTER_SPEC_VERSION = 2;

export const CHARACTER_ACCESSORIES = [
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
export type CharacterAccessory = (typeof CHARACTER_ACCESSORIES)[number];

export type Archetype = 'seed' | 'crystal' | 'block' | 'blob' | 'drop' | 'capsule';
export type Finish = 'matte' | 'satin' | 'glossy' | 'metallic' | 'clay' | 'glass';
export type SurfaceDetail = 'none' | 'center_groove' | 'facets' | 'panel_lines' | 'grain' | 'veins';
export type EyeStyle = 'round' | 'oval' | 'dot' | 'crescent' | 'visor' | 'line';
export type MouthStyle = 'soft_smile' | 'smile' | 'open_smile' | 'grin' | 'line' | 'none';
export type FaceStyle =
  | 'friendly_minimal'
  | 'expressive_cartoon'
  | 'minimal_geometric'
  | 'visor'
  | 'sculpted';
export type Stance = 'grounded' | 'balanced' | 'floating';

export interface CharacterSpec {
  specVersion: number;
  name: string;
  /** Sujeto del catálogo (coffee_bean, building_block…): decide la silueta específica. */
  subject: string;
  /** Forma genérica de respaldo si el sujeto no tiene modelado propio. */
  archetype: Archetype;
  body: {
    /** Proporciones relativas (≈0.5–1.5). */
    width: number;
    height: number;
    depth: number;
    /** 0 = aristas marcadas, 1 = muy redondeado. */
    roundness: number;
    finish: Finish;
    surfaceDetail: SurfaceDetail;
  };
  /** Colores sRGB en hex (#RRGGBB). */
  colors: {
    body: string;
    bodyShade: string;
    secondary: string;
    accent: string;
    limb: string;
    hand: string;
    feature: string;
    sclera: string;
    blush: string;
    backdrop: string;
    rim: string;
  };
  face: {
    eyes: EyeStyle;
    mouth: MouthStyle;
    style: FaceStyle;
    /** Escala de los rasgos (≈0.75–1.3). */
    scale: number;
    brows: boolean;
    blush: boolean;
  };
  limbs: {
    arms: boolean;
    legs: boolean;
    /** Grosor relativo de brazos y piernas. */
    thickness: number;
  };
  stance: Stance;
  accessories: { id: CharacterAccessory; color: string; detailColor: string }[];
  motion: {
    idle: string;
    energy: number;
    expressiveness: number;
  };
}
