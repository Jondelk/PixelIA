import type { AvatarConcept } from '@pixel/contracts';

export const BODY_SHAPE_LABEL: Record<AvatarConcept['bodyShape'], string> = {
  rounded: 'Redondeado',
  oval: 'Ovalado',
  teardrop: 'Gota',
  faceted: 'Facetado',
  blocky: 'Bloque',
  capsule: 'Cápsula',
  organic_irregular: 'Orgánico irregular',
};

export const FACE_STYLE_LABEL: Record<AvatarConcept['faceStyle'], string> = {
  friendly_minimal: 'Amable y minimalista',
  expressive_cartoon: 'Expresivo',
  minimal_geometric: 'Geométrico sobrio',
  visor: 'Visor',
  sculpted: 'Esculpido',
};

export const EYES_LABEL: Record<AvatarConcept['eyesStyle'], string> = {
  round: 'redondos',
  oval: 'ovalados',
  dot: 'de punto',
  crescent: 'sonrientes',
  visor: 'de visor',
  line: 'de línea',
};

export const MOUTH_LABEL: Record<AvatarConcept['mouthStyle'], string> = {
  soft_smile: 'sonrisa suave',
  smile: 'sonrisa',
  open_smile: 'sonrisa abierta',
  grin: 'sonrisa amplia',
  line: 'línea neutra',
  none: 'sin boca',
};

export const PACE_LABEL: Record<AvatarConcept['speakingBehavior']['pace'], string> = {
  slow: 'Pausado',
  moderate: 'Moderado',
  lively: 'Vivo',
};

export const FINISH_LABEL: Record<AvatarConcept['renderHints']['finish'], string> = {
  matte: 'mate',
  satin: 'satinado',
  glossy: 'brillante',
  metallic: 'metálico',
  clay: 'arcilla',
  glass: 'vidrio',
};
