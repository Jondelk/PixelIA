import { describe, expect, it } from 'vitest';
import { bodyPath, previewSpec } from './previewSpec';

const base = {
  renderHints: {
    archetype: 'seed',
    roundness: 0.9,
    finish: 'matte',
    surfaceDetail: 'center_groove',
  },
  proportions: { width: 0.9, height: 1.15, depth: 0.8, faceScale: 1, stance: 'balanced' },
  primaryColor: { hex: '#6B3E26', name: 'Tostado' },
  secondaryColor: { hex: '#A9714B', name: 'Caramelo' },
  accentColor: { hex: '#E8C07D', name: 'Crema' },
  idleBehavior: { animation: 'hover_spin', energy: 0.5, description: '' },
  eyesStyle: 'round',
  mouthStyle: 'soft_smile',
  faceStyle: 'friendly_minimal',
} as const;

describe('previewSpec', () => {
  it('aplica proporciones, animación y contraste de rasgos', () => {
    const spec = previewSpec(base);
    expect(spec.transform).toContain('scale(0.9 1.15)');
    expect(spec.idleClass).toBe('pixel-idle-hover-spin');
    expect(spec.duration).toBe('2.6s');
    expect(spec.featureColor).toBe('#F5F7FB');
    expect(spec.blush).toBe(true);
  });

  it('usa rasgos oscuros sobre cuerpos claros', () => {
    expect(
      previewSpec({ ...base, primaryColor: { hex: '#F2A900', name: 'Amarillo' } }).featureColor,
    ).toBe('#141824');
  });

  it('tiene una silueta para cada arquetipo de render', () => {
    for (const archetype of ['seed', 'crystal', 'block', 'blob', 'drop', 'capsule'] as const) {
      expect(bodyPath(archetype, 0.5)).toMatch(/^M.*Z$/);
    }
  });
});
