import type { AvatarConcept } from '@pixel/contracts';

/*
 * Vista provisional 2D del personaje (SVG). Traduce el AvatarProfile a geometría simple.
 * El avatar 3D real (React Three Fiber) usará los mismos `renderHints` en la Etapa 7.
 */

export const VIEW = { width: 200, height: 220, cx: 100, cy: 118 } as const;

type Profile = Pick<
  AvatarConcept,
  | 'renderHints'
  | 'proportions'
  | 'primaryColor'
  | 'secondaryColor'
  | 'accentColor'
  | 'idleBehavior'
  | 'eyesStyle'
  | 'mouthStyle'
  | 'faceStyle'
>;

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

/** Silueta base (antes de escalar por proporciones), centrada en (100, 118). */
export function bodyPath(
  archetype: AvatarConcept['renderHints']['archetype'],
  roundness: number,
): string {
  const r = Math.round(10 + roundness * 40);
  switch (archetype) {
    case 'seed':
      return 'M100 46 C146 46 160 88 160 124 C160 162 134 190 100 190 C66 190 40 162 40 124 C40 88 54 46 100 46 Z';
    case 'drop':
      return 'M100 38 C118 70 158 98 158 136 C158 168 132 190 100 190 C68 190 42 168 42 136 C42 98 82 70 100 38 Z';
    case 'crystal':
      return 'M100 40 L156 74 L156 150 L100 192 L44 150 L44 74 Z';
    case 'capsule':
      return 'M70 46 H130 A32 32 0 0 1 162 78 V158 A32 32 0 0 1 130 190 H70 A32 32 0 0 1 38 158 V78 A32 32 0 0 1 70 46 Z';
    case 'block':
      return `M${42 + r / 2} 52 H${158 - r / 2} Q158 52 158 ${52 + r / 2} V${188 - r / 2} Q158 188 ${158 - r / 2} 188 H${42 + r / 2} Q42 188 42 ${188 - r / 2} V${52 + r / 2} Q42 52 ${42 + r / 2} 52 Z`;
    case 'blob':
      return 'M100 50 C150 50 168 92 166 132 C164 172 136 190 100 190 C64 190 36 172 34 132 C32 92 50 50 100 50 Z';
  }
}

export function previewSpec(profile: Profile) {
  const { width, height, faceScale } = profile.proportions;
  const duration = Math.round((3.8 - profile.idleBehavior.energy * 2.4) * 10) / 10;
  return {
    body: bodyPath(profile.renderHints.archetype, profile.renderHints.roundness),
    transform: `translate(${VIEW.cx} ${VIEW.cy}) scale(${width} ${height}) translate(${-VIEW.cx} ${-VIEW.cy})`,
    faceTransform: `translate(${VIEW.cx} 112) scale(${faceScale}) translate(${-VIEW.cx} -112)`,
    featureColor: luminance(profile.primaryColor.hex) > 0.4 ? '#141824' : '#F5F7FB',
    highlightOpacity: {
      glossy: 0.45,
      glass: 0.55,
      metallic: 0.4,
      satin: 0.25,
      clay: 0.12,
      matte: 0.1,
    }[profile.renderHints.finish],
    blush: profile.faceStyle === 'friendly_minimal' || profile.faceStyle === 'expressive_cartoon',
    idleClass: `pixel-idle-${profile.idleBehavior.animation.replace('_', '-')}`,
    duration: `${duration}s`,
  };
}
