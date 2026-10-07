import { describe, expect, it } from 'vitest';
import { frontZ, profileToScene, type AvatarProfileInput } from './sceneSpec';

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

describe('profileToScene', () => {
  it('Coffee Pixel: grano con ranura, extremidades, hoja y taza', () => {
    const spec = profileToScene(coffeeProfile);
    expect(spec.body).toMatchObject({ kind: 'seed', groove: true });
    expect(spec.body.halfHeight).toBeGreaterThan(spec.body.halfWidth);
    expect(spec.body.material.color).toBe('#6B3E26');
    expect(spec.body.material.roughness).toBeGreaterThan(0.6);
    expect(spec.limbs).toMatchObject({ arms: true, legs: true });
    expect(spec.accessories.map((a) => [a.kind, a.attach])).toEqual([
      ['leaf', 'head'],
      ['cup', 'hand'],
    ]);
    expect(spec.face).toMatchObject({ eyes: 'round', mouth: 'soft_smile', blush: true });
    expect(spec.motion).toMatchObject({ idle: 'bounce', expressiveness: 0.66 });
  });

  it('el acabado y la forma cambian el material', () => {
    const glossy = profileToScene({
      ...coffeeProfile,
      renderHints: {
        archetype: 'crystal',
        roundness: 0.1,
        finish: 'glossy',
        surfaceDetail: 'facets',
      },
    });
    expect(glossy.body.material.flatShading).toBe(true);
    expect(glossy.body.material.roughness).toBeLessThan(0.3);
  });

  it('un personaje flotante no tiene piernas y su suelo queda más abajo', () => {
    const floating = profileToScene({
      ...coffeeProfile,
      proportions: { ...coffeeProfile.proportions, stance: 'floating' },
    });
    expect(floating.limbs.legs).toBe(false);
    expect(floating.limbs.legLength).toBe(0);
  });

  it('traduce accesorios de texto a piezas 3D sin repetir', () => {
    const spec = profileToScene({
      ...coffeeProfile,
      accessories: [
        'Anillo orbital de luz',
        'Casco de obra minimalista',
        'Detalle sutil de montañas',
        'Guiño a su origen',
      ],
    });
    expect(spec.accessories.map((a) => a.kind)).toEqual(['orbit_ring', 'helmet', 'badge']);
  });

  it('el rostro se apoya sobre la superficie frontal', () => {
    const spec = profileToScene(coffeeProfile);
    expect(frontZ(spec.body, 0, 0)).toBeCloseTo(spec.body.halfDepth);
    expect(frontZ(spec.body, 0.3, 0.3)).toBeLessThan(spec.body.halfDepth);
  });
});

describe('accesorios de avatares personales', () => {
  it('auriculares, gafas y lentes se traducen a piezas propias (no a un casco ni a una insignia)', () => {
    const spec = profileToScene({
      ...coffeeProfile,
      accessories: ['Auriculares de estudio', 'Gafas de lectura', 'Lente de cámara al frente'],
    });
    expect(spec.accessories.map((a) => [a.kind, a.attach])).toEqual([
      ['headphones', 'head'],
      ['glasses', 'face'],
      ['lens', 'chest'],
    ]);
    const hand = profileToScene({
      ...coffeeProfile,
      accessories: ['Visor de encuadre de director'],
    });
    expect(hand.accessories).toMatchObject([{ kind: 'lens', attach: 'hand' }]);
  });
});
