import type { BrandDna } from '@pixel/contracts';

type VisualLanguage = BrandDna['visualLanguage'];

export const PALETTE_ROLE_LABEL: Record<VisualLanguage['palette'][number]['role'], string> = {
  primary: 'Principal',
  secondary: 'Secundario',
  accent: 'Acento',
  neutral: 'Neutro',
  support: 'Apoyo',
};

export const TEMPERATURE_LABEL: Record<VisualLanguage['temperature'], string> = {
  warm: 'Cálida',
  cool: 'Fría',
  neutral: 'Neutra',
};

export const SHAPE_LANGUAGE_LABEL: Record<VisualLanguage['shapeLanguage'], string> = {
  organic: 'Orgánico',
  geometric: 'Geométrico',
  structural: 'Estructural',
  fluid: 'Fluido',
  soft: 'Suave',
  mixed: 'Mixto',
};

export const DIMENSIONS: {
  key: keyof BrandDna['personality']['dimensions'];
  low: string;
  high: string;
}[] = [
  { key: 'innovation', low: 'Tradicional', high: 'Innovadora' },
  { key: 'sophistication', low: 'Accesible', high: 'Sofisticada' },
  { key: 'warmth', low: 'Distante', high: 'Cercana' },
  { key: 'playfulness', low: 'Seria', high: 'Lúdica' },
  { key: 'energy', low: 'Serena', high: 'Enérgica' },
];
