import type { AvatarConcept } from '@pixel/contracts';
import {
  CHARACTER_ACCESSORIES,
  CHARACTER_SPEC_VERSION,
  type CharacterAccessory,
  type CharacterSpec,
} from '@pixel/sculpt';
import { normalize } from '../engine/rulesAvatarEngine.js';
import { colorDistance, darken, lighten, luminance, mix } from './color.js';

/*
 * Traducción pura AvatarProfile → CharacterSpec (la especificación de Pixel Sculpt).
 *
 * El escultor (packages/sculpt) no conoce el BrandDNA ni reglas de negocio: solo construye lo que
 * dice esta especificación. Aquí se convierten las decisiones del concepto (sujeto, forma,
 * rostro, acabado, accesorios en texto libre…) en parámetros cerrados que el escultor sabe
 * producir. Mismo perfil → misma especificación → mismo modelo.
 */

export { CHARACTER_ACCESSORIES, CHARACTER_SPEC_VERSION };
export type { CharacterAccessory, CharacterSpec };

export type CharacterProfileInput = Pick<
  AvatarConcept,
  | 'name'
  | 'baseObject'
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
  | 'animationPersonality'
  | 'renderHints'
>;

/** Raíces (normalizadas) que identifican cada pieza de utilería en el texto del concepto. */
const ACCESSORY_KEYWORDS: [CharacterAccessory, string[]][] = [
  ['cross_badge', ['cruz']],
  ['cup', ['taza', 'tinto', 'pocillo']],
  ['hardhat', ['casco']],
  ['glasses', ['lentes', 'gafas', 'anteojos']],
  ['orbit_ring', ['anillo', 'orbita', 'orbital']],
  ['antenna', ['antena', 'pincel']],
  ['ears', ['oreja']],
  ['scarf', ['bufanda', 'lazo', 'cinta', 'collar', 'panuelo']],
  ['scroll', ['plano enrollado', 'pergamino']],
  ['badge', ['emblema', 'insignia', 'placa', 'boton', 'escudo']],
  ['bubbles', ['burbuja', 'rocio', 'particula', 'salpicadura', 'destello']],
  ['leaves', ['hoja', 'brote', 'espiga', 'planta', 'trigo']],
];

/** Utilería que define al sujeto aunque el concepto no la mencione. */
const SUBJECT_ACCESSORIES: Record<string, CharacterAccessory[]> = {
  sprout: ['leaves'],
  paw_creature: ['ears'],
};

const MAX_ACCESSORIES = 3;

/** Ideas que mencionan una palabra clave pero no son esa pieza (p. ej. "marcapáginas como cinta"). */
const IGNORED_ACCESSORIES = ['marcapagina'];

export function accessoryFromText(text: string): CharacterAccessory | null {
  const value = normalize(text);
  if (IGNORED_ACCESSORIES.some((term) => value.includes(term))) return null;
  for (const [id, keywords] of ACCESSORY_KEYWORDS) {
    if (keywords.some((keyword) => value.includes(keyword))) return id;
  }
  return null;
}

export function mapAccessories(profile: CharacterProfileInput): CharacterAccessory[] {
  const result: CharacterAccessory[] = [...(SUBJECT_ACCESSORIES[profile.baseObject.id] ?? [])];
  for (const text of profile.accessories) {
    const id = accessoryFromText(text);
    if (id && !result.includes(id)) result.push(id);
  }
  return result.slice(0, MAX_ACCESSORIES);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Color natural para utilería orgánica (hojas): verde de la marca si existe, si no uno natural. */
function leafGreen(colors: string[]): string {
  const green = colors.find((hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
    return g > r * 1.15 && g > b * 1.05;
  });
  return green ?? '#4F8A3C';
}

/** Elige un color para la utilería que se distinga del cuerpo. */
function propColor(id: CharacterAccessory, primary: string, secondary: string, accent: string) {
  if (id === 'leaves') return { color: leafGreen([accent, secondary]), detailColor: '#3B6B2C' };
  if (id === 'glasses') return { color: '#1C1C22', detailColor: '#FFFFFF' };
  if (id === 'cup') return { color: lighten(secondary, 0.82), detailColor: darken(primary, 0.55) };
  if (id === 'scroll') return { color: '#E8EEF8', detailColor: '#2D5DA8' };
  const visible = colorDistance(accent, primary) > 120 ? accent : secondary;
  // Un casco casi negro se lee como un sombrero: se usa el blanco de obra.
  if (id === 'hardhat' && luminance(visible) < 0.06) {
    return { color: '#F2F1EC', detailColor: '#C9C7BF' };
  }
  return { color: visible, detailColor: darken(visible, 0.35) };
}

export function profileToCharacterSpec(profile: CharacterProfileInput): CharacterSpec {
  const primary = profile.primaryColor.hex.toUpperCase();
  const secondary = profile.secondaryColor.hex.toUpperCase();
  const accent = profile.accentColor.hex.toUpperCase();
  const light = luminance(primary) > 0.55;

  const expressive = profile.expressiveness / 100;
  const geometric = ['minimal_geometric', 'visor'].includes(profile.faceStyle);

  // Manos y pies: secundario si se distingue del cuerpo; si no, un tono del primario.
  const hand = colorDistance(secondary, primary) > 90 ? secondary : darken(primary, 0.35);

  const accessories = mapAccessories(profile).map((id) => ({
    id,
    ...propColor(id, primary, secondary, accent),
  }));

  return {
    specVersion: CHARACTER_SPEC_VERSION,
    name: profile.name,
    subject: profile.baseObject.id,
    archetype: profile.renderHints.archetype,
    body: {
      width: profile.proportions.width,
      height: profile.proportions.height,
      depth: profile.proportions.depth,
      roundness: profile.renderHints.roundness,
      finish: profile.renderHints.finish,
      surfaceDetail: profile.renderHints.surfaceDetail,
    },
    colors: {
      body: primary,
      bodyShade: darken(primary, 0.22),
      secondary,
      accent,
      limb: darken(primary, light ? 0.18 : 0.12),
      hand,
      // Rasgos casi negros pero teñidos del cuerpo: más cálidos que un negro puro.
      feature: mix(darken(primary, 0.86), '#101014', 0.5),
      sclera: '#FAFAF7',
      blush: mix(lighten(primary, 0.35), '#FF7A8A', 0.55),
      // Fondo de estudio: tinte muy claro del primario (u oscuro si el cuerpo es claro).
      backdrop: light ? mix(primary, '#16161B', 0.86) : mix(primary, '#F3F1EC', 0.88),
      rim: lighten(accent, 0.25),
    },
    face: {
      eyes: profile.eyesStyle,
      mouth: profile.mouthStyle,
      style: profile.faceStyle,
      scale: clamp(0.8 + (profile.proportions.faceScale - 1) * 0.6 + expressive * 0.15, 0.75, 1.3),
      brows: !geometric && profile.eyesStyle !== 'visor' && profile.expressiveness >= 40,
      blush: !geometric && profile.faceStyle !== 'sculpted' && profile.expressiveness >= 50,
    },
    limbs: {
      arms: true,
      legs: profile.proportions.stance !== 'floating',
      thickness: clamp(0.85 + (profile.proportions.width - 1) * 0.4, 0.7, 1.2),
    },
    stance: profile.proportions.stance,
    accessories,
    motion: {
      idle: profile.idleBehavior.animation,
      energy: profile.idleBehavior.energy,
      expressiveness: expressive,
    },
  };
}
