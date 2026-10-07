import { AvatarConceptSchema, BrandOnboardingSchema, type BrandDnaContent } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { generateBrandDna } from '../src/modules/brand-dna/brandDna.generator.js';
import { rulesAvatarEngine } from '../src/modules/avatars/engine/rulesAvatarEngine.js';
import { cafeTinto, constructoraNorte, novaLabs } from './fixtures/onboarding.js';

type Answers = typeof cafeTinto;
const dnaOf = (answers: Answers): BrandDnaContent =>
  generateBrandDna(BrandOnboardingSchema.parse(answers));
const conceptOf = (answers: Answers, variation = 0) =>
  rulesAvatarEngine.generate({ brandDna: dnaOf(answers), variation });

describe('Avatar Concept Engine (reglas)', () => {
  it('café artesanal colombiano → grano de café cálido, mate y amable', async () => {
    const avatar = AvatarConceptSchema.parse(await conceptOf(cafeTinto));

    expect(avatar.avatarType).toBe('anthropomorphic_object');
    expect(avatar.baseObject).toEqual({ id: 'coffee_bean', label: 'grano de café' });
    expect(avatar.bodyShape).toBe('oval');
    expect(avatar.concept).toMatch(
      /^Grano de café con raíces en Huila, Colombia, convertido en personaje 3D cálido/,
    );
    expect(avatar.primaryColor).toEqual({ hex: '#6B3E26', name: 'Tostado (marrón café)' });
    expect(avatar.materials).toEqual(expect.arrayContaining(['grano tostado', 'mate', 'orgánico']));
    expect(avatar.personalityTraits).toEqual(
      expect.arrayContaining(['amable', 'orgulloso de su origen']),
    );
    expect(avatar.animationPersonality).toBe('friendly_expressive');
    expect(avatar.faceStyle).toBe('friendly_minimal');
    expect(avatar.renderHints).toMatchObject({
      archetype: 'seed',
      finish: 'matte',
      surfaceDetail: 'center_groove',
    });
    expect(avatar.avoid).toEqual(expect.arrayContaining(['Neón', 'Estética corporativa fría']));
    expect(avatar.accessories.some((item) => /montañas|Huila|cafeto|tinto/i.test(item))).toBe(true);
  });

  it('justifica cada decisión con rutas del BrandDNA', async () => {
    const avatar = await conceptOf(cafeTinto);
    expect(avatar.rationale.summary).toContain('grano de café');
    expect(avatar.rationale.summary).toContain('Café Tinto');
    const baseObject = avatar.rationale.decisions.find((d) => d.attribute === 'baseObject')!;
    expect(baseObject.sources).toEqual(
      expect.arrayContaining([
        'identity.industry',
        'visualLanguage.recurringElements',
        'visualLanguage.shapeLanguage',
      ]),
    );
    const dna = dnaOf(cafeTinto) as unknown as Record<string, Record<string, unknown>>;
    for (const decision of avatar.rationale.decisions) {
      for (const source of decision.sources) {
        const [block, field] = source.split('.');
        expect(dna[block!]?.[field!], source).toBeDefined();
      }
    }
  });

  it('no es "sector → objeto": una restricción descarta el objeto obvio', async () => {
    const avatar = await conceptOf({
      ...cafeTinto,
      creative: { ...cafeTinto.creative, restrictions: ['No usar el grano como personaje'] },
    });
    expect(avatar.baseObject.id).not.toBe('coffee_bean');
    expect(avatar.avatarType).not.toBe('anthropomorphic_object');
  });

  it('no es "sector → objeto": el café puede venir de la historia y los elementos visuales', async () => {
    const avatar = await conceptOf({
      ...cafeTinto,
      company: {
        ...cafeTinto.company,
        name: 'Casa Montaña',
        industry: 'Hotel boutique',
        description: 'Hotel de montaña con experiencias rurales.',
      },
    });
    expect(avatar.baseObject.id).toBe('coffee_bean');
    expect(avatar.rationale.decisions[0]!.sources).not.toContain('identity.industry');
  });

  it('no es "sector → objeto": el mismo sector con otra personalidad cambia el personaje', async () => {
    const warm = await conceptOf(cafeTinto);
    const techCoffee = await conceptOf({
      ...cafeTinto,
      personality: novaLabs.personality,
      communication: novaLabs.communication,
      visual: novaLabs.visual,
    });
    expect(techCoffee.baseObject.id).toBe('coffee_bean');
    expect(techCoffee.animationPersonality).not.toBe(warm.animationPersonality);
    expect(techCoffee.renderHints.finish).not.toBe(warm.renderHints.finish);
    expect(techCoffee.primaryColor.hex).not.toBe(warm.primaryColor.hex);
    expect(techCoffee.personalityTraits).not.toEqual(warm.personalityTraits);
  });

  it('una startup tecnológica es una entidad geométrica', async () => {
    const avatar = await conceptOf(novaLabs);
    expect(avatar.avatarType).toBe('geometric_entity');
    expect(avatar.baseObject.id).toBe('crystal_core');
    expect(avatar.bodyShape).toBe('faceted');
    expect(avatar.renderHints.archetype).toBe('crystal');
    expect(['precise_efficient', 'wise_measured']).toContain(avatar.animationPersonality);
  });

  it('una constructora es un personaje estructural con los pies en la tierra', async () => {
    const avatar = await conceptOf(constructoraNorte);
    expect(avatar.avatarType).toBe('structural_character');
    expect(avatar.baseObject.id).toBe('building_block');
    expect(avatar.proportions.stance).toBe('grounded');
    expect(avatar.renderHints.archetype).toBe('block');
    expect(avatar.accessories.length).toBe(1);
  });

  it('sin señales concretas usa una forma abstracta derivada de la estética', async () => {
    const avatar = await conceptOf({
      ...novaLabs,
      company: {
        name: 'Zeta',
        industry: 'Consultoría',
        description: 'Acompañamos a equipos directivos en decisiones.',
        history: 'Fundada por dos socios tras años de trabajo conjunto.',
        origin: null,
      },
      visual: { ...novaLabs.visual, recurringElements: [] },
      competition: { competitors: [], differentiators: ['Método propio'] },
    });
    expect(avatar.baseObject.id).toBe('prism');
    expect(avatar.rationale.decisions[0]!.reason).toMatch(/Ningún objeto concreto domina/);
  });

  it('es determinístico y la regeneración explora alternativas', async () => {
    expect(await conceptOf(cafeTinto, 0)).toEqual(await conceptOf(cafeTinto, 0));
    const first = await conceptOf(cafeTinto, 0);
    const second = await conceptOf(cafeTinto, 1);
    expect(second).not.toEqual(first);
    expect(second.name).not.toBe(first.name);
    AvatarConceptSchema.parse(second);
  });
});

describe('nombres de color', () => {
  it('describe la familia y evita redundancias', async () => {
    const { describeColor } = await import('../src/modules/avatars/engine/colors.js');
    expect(describeColor('#6B3E26', 'Tostado', { marrón: 'café' })).toBe('Tostado (marrón café)');
    expect(describeColor('#F2A900', 'Amarillo seguridad')).toBe('Amarillo seguridad');
    expect(describeColor('#E8C07D', null)).toBe('crema');
    expect(describeColor('#2F6BFF', 'Eléctrico')).toBe('Eléctrico (azul)');
    expect(describeColor('#2B2B2B', null)).toBe('gris oscuro');
  });
});
