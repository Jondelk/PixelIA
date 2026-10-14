import { describe, expect, it } from 'vitest';
import {
  accessoryFromText,
  CHARACTER_ACCESSORIES,
  mapAccessories,
  profileToCharacterSpec,
} from '../src/modules/avatars/model/characterSpec.js';
import { contrastRatio, luminance, mix } from '../src/modules/avatars/model/color.js';
import { cafeTinto, constructoraNorte, novaLabs } from './fixtures/onboarding.js';
import { avatarFor, brandDnaFor } from './support/dna.js';

const specFor = async (answers: typeof cafeTinto) =>
  profileToCharacterSpec(await avatarFor(brandDnaFor(answers)));

describe('AvatarProfile → CharacterSpec', () => {
  it('café: grano con los colores del concepto, piernas y utilería reconocible', async () => {
    const avatar = await avatarFor(brandDnaFor(cafeTinto));
    const spec = profileToCharacterSpec(avatar);

    expect(spec).toMatchObject({
      specVersion: 2,
      name: avatar.name,
      subject: 'coffee_bean',
      archetype: 'seed',
      body: { finish: 'matte', surfaceDetail: 'center_groove' },
    });
    expect(spec.colors.body).toBe(avatar.primaryColor.hex.toUpperCase());
    expect(spec.colors.accent).toBe(avatar.accentColor.hex.toUpperCase());
    expect(spec.limbs.legs).toBe(avatar.proportions.stance !== 'floating');
    for (const item of spec.accessories) expect(CHARACTER_ACCESSORIES).toContain(item.id);
  });

  it('tres marcas distintas producen sujetos, formas y colores distintos', async () => {
    const specs = await Promise.all([cafeTinto, novaLabs, constructoraNorte].map(specFor));
    expect(new Set(specs.map((spec) => spec.subject)).size).toBe(3);
    expect(new Set(specs.map((spec) => spec.archetype)).size).toBe(3);
    expect(new Set(specs.map((spec) => spec.colors.body)).size).toBe(3);
  });

  it('es determinista: mismo perfil → misma especificación', async () => {
    expect(await specFor(novaLabs)).toEqual(await specFor(novaLabs));
  });

  it('los rasgos del rostro contrastan con el cuerpo y el fondo de estudio también', async () => {
    for (const answers of [cafeTinto, novaLabs, constructoraNorte]) {
      const { colors } = await specFor(answers);
      expect(contrastRatio(colors.feature, colors.sclera)).toBeGreaterThan(7);
      expect(contrastRatio(colors.body, colors.backdrop)).toBeGreaterThan(1.5);
      expect(luminance(colors.feature)).toBeLessThan(0.05);
    }
  });

  it('un estilo geométrico o visor no lleva cejas ni rubor', async () => {
    const avatar = await avatarFor(brandDnaFor(novaLabs));
    const spec = profileToCharacterSpec({
      ...avatar,
      faceStyle: 'visor',
      eyesStyle: 'visor',
      expressiveness: 90,
    });
    expect(spec.face.brows).toBe(false);
    expect(spec.face.blush).toBe(false);
  });

  it('constructora: casco de obra legible aunque el acento de la marca sea casi negro', async () => {
    const spec = await specFor(constructoraNorte);
    const hardhat = spec.accessories.find((item) => item.id === 'hardhat');
    expect(hardhat).toBeDefined();
    expect(luminance(hardhat!.color)).toBeGreaterThan(0.5);
  });
});

describe('Utilería desde el texto libre del concepto', () => {
  it.each([
    ['Hoja de cafeto como detalle', 'leaves'],
    ['Pequeña taza de tinto', 'cup'],
    ['Casco de obra minimalista', 'hardhat'],
    ['Anillo orbital de luz', 'orbit_ring'],
    ['Lentes redondos', 'glasses'],
    ['Cruz sutil en el pecho', 'cross_badge'],
    ['Emblema geométrico', 'badge'],
    ['Pincel como antena', 'antenna'],
    ['Orejas redondeadas', 'ears'],
    ['Cinta métrica como bufanda', 'scarf'],
    ['Burbujas pequeñas', 'bubbles'],
    ['Plano enrollado', 'scroll'],
  ])('"%s" → %s', (text, id) => {
    expect(accessoryFromText(text)).toBe(id);
  });

  it('ignora ideas que no sabe modelar', () => {
    expect(accessoryFromText('Viga como detalle en el hombro')).toBeNull();
    expect(accessoryFromText('Guiño discreto a su origen: Huila')).toBeNull();
    expect(accessoryFromText('Marcapáginas como cinta')).toBeNull();
  });

  it('sin duplicados, máximo tres, y el sujeto aporta su utilería propia', async () => {
    const avatar = await avatarFor(brandDnaFor(cafeTinto));
    const ids = mapAccessories({
      ...avatar,
      baseObject: { id: 'sprout', label: 'semilla que germina' },
      accessories: ['Pequeño brote', 'Hoja', 'Lentes', 'Taza', 'Casco'],
    });
    expect(ids[0]).toBe('leaves');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
  });
});

describe('Color', () => {
  it('mix interpola en sRGB', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#6B3E26', '#6B3E26', 0.3)).toBe('#6B3E26');
  });
  it('contraste WCAG de negro sobre blanco es 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
});
