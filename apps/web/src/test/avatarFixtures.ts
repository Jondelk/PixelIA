import type { AvatarProfileInput } from '../features/avatar3d/sceneSpec';

/** Un personaje de marca (café) con la forma que consume el renderer; compartido por varios tests. */
export const coffeeProfile: AvatarProfileInput = {
  name: 'Grano Anfitrión',
  bodyShape: 'oval',
  proportions: { width: 0.95, height: 1.15, depth: 0.8, faceScale: 1, stance: 'balanced' },
  faceStyle: 'friendly_minimal',
  eyesStyle: 'round',
  mouthStyle: 'soft_smile',
  primaryColor: { hex: '#6B3E26', name: 'Tostado (marrón café)' },
  secondaryColor: { hex: '#A9714B', name: 'Caramelo' },
  accentColor: { hex: '#E8C07D', name: 'Crema' },
  accessories: ['Hoja de cafeto como detalle', 'Pequeña taza de tinto'],
  idleBehavior: { animation: 'bounce', energy: 0.38, description: '' },
  expressiveness: 66,
  renderHints: {
    archetype: 'seed',
    roundness: 0.95,
    finish: 'matte',
    surfaceDetail: 'center_groove',
  },
};
