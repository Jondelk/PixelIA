import { describe, expect, it } from 'vitest';
import { extractBrief } from '../src/ai/brief.js';
import {
  buildPixelContext,
  detectFocus,
} from '../src/modules/conversations/pixelContext.builder.js';
import { cafeTinto, novaLabs } from './fixtures/onboarding.js';
import { avatarFor, brandDnaFor } from './support/dna.js';

const cafeDna = brandDnaFor(cafeTinto);
const novaDna = brandDnaFor(novaLabs);
const question = 'Necesito una campaña para redes.';

const build = (overrides: Partial<Parameters<typeof buildPixelContext>[0]> = {}) =>
  buildPixelContext({
    company: { name: 'Café Tinto' },
    brandDna: cafeDna,
    avatar: null,
    history: [],
    userMessage: question,
    ...overrides,
  });

describe('PixelContextBuilder', () => {
  it('incluye identidad, propósito, público, personalidad, tono, estilo, restricciones y preferencias', () => {
    const { system, brief } = build();
    expect(system).toContain('Eres Pixel, el director creativo de Café Tinto');
    expect(brief).toMatchObject({
      brand: 'Café Tinto',
      origin: 'Huila, Colombia',
      purpose: 'Honrar el trabajo de las familias cafeteras.',
      archetype: { id: 'caregiver' },
      tone: { traits: ['cálido', 'cercano'], formality: 2, language: 'Español' },
    });
    expect(brief.audience.problems).toContain('Café industrial sin sabor');
    expect(brief.personality).toContain('artesanal');
    expect(brief.visual.recurring).toContain('Montañas');
    expect(brief.restrictions).toEqual(
      expect.arrayContaining(['No mostrar café instantáneo', 'Neón']),
    );
    expect(brief.likes).toContain('Fotografía con luz natural');
    expect(brief.vocabulary.avoid).toContain('barato');
    expect(extractBrief(system)).toEqual(brief);
  });

  it('pide criterio creativo y prohíbe recitar el ADN', () => {
    const { system } = build();
    expect(system).toMatch(/Usa el ADN de la marca como criterio, no como contenido/);
    expect(system).toMatch(/Nunca describas la marca ni enumeres sus rasgos/);
    expect(system).toMatch(/No inventes datos de la empresa/);
    expect(system).toContain('Palancas creativas de Café Tinto');
  });

  it('convierte el ADN en palancas creativas, priorizadas según la petición', () => {
    const launch = build({ userMessage: 'Vamos a lanzar un café premium' }).brief.levers;
    expect(launch[0]).toMatchObject({ id: 'origin', title: 'Desde Huila, Colombia' });
    const social = build({ userMessage: 'Ideas de contenido para Instagram' }).brief.levers;
    expect(social[0]?.id).toBe('tension');
    expect(social.map((lever) => lever.id)).toEqual(
      expect.arrayContaining([
        'origin',
        'tension',
        'archetype',
        'differentiator:Trazabilidad lote a lote',
      ]),
    );
  });

  it('incluye el AvatarProfile solo cuando es relevante', async () => {
    const avatar = await avatarFor(cafeDna);
    const plain = build({ avatar });
    expect(plain.stats.includesAvatar).toBe(false);
    expect(plain.system).not.toContain(avatar.name);

    const visual = build({
      avatar,
      userMessage: '¿Cómo debería aparecer nuestro personaje en redes?',
    });
    expect(visual.stats.includesAvatar).toBe(true);
    expect(visual.system).toContain(avatar.name);
  });

  it('limita el historial por cantidad y por caracteres, empezando siempre por el usuario', () => {
    const history = Array.from({ length: 40 }, (_, i) => ({
      role: (i % 2 ? 'pixel' : 'user') as 'pixel' | 'user',
      content: `mensaje ${i} ${'x'.repeat(500)}`,
    }));
    const byCount = build({ history, limits: { historyMessages: 10 } });
    expect(byCount.stats.historyMessages).toBeLessThanOrEqual(10);
    expect(byCount.messages[0]?.role).toBe('user');
    expect(byCount.messages.at(-1)).toEqual({ role: 'user', content: question });

    const byChars = build({ history, limits: { historyMessages: 40, historyChars: 2_000 } });
    expect(byChars.stats.historyChars).toBeLessThanOrEqual(2_000);
    expect(byChars.stats.systemChars).toBeLessThan(10_000);
  });

  it('dos empresas producen contextos distintos y nunca se mezclan', () => {
    const cafe = build();
    const nova = buildPixelContext({
      company: { name: 'Nova Labs' },
      brandDna: novaDna,
      avatar: null,
      history: [],
      userMessage: question,
    });
    expect(cafe.system).not.toContain('Nova Labs');
    expect(nova.system).not.toContain('Café Tinto');
    expect(nova.system).not.toContain('Huila');
    expect(nova.brief.archetype.id).not.toBe(cafe.brief.archetype.id);
    expect(nova.brief.levers.map((l) => l.title)).not.toEqual(
      cafe.brief.levers.map((l) => l.title),
    );
  });
});

describe('detectFocus', () => {
  it('identifica el tema de la petición', () => {
    expect(detectFocus('Necesito una campaña para redes')).toEqual(['social', 'campaign']);
    expect(detectFocus('Ideas de nombre para el producto')).toEqual(['naming']);
    expect(detectFocus('Hola')).toEqual(['general']);
  });
});
