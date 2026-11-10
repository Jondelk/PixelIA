import { PersonalOnboardingSchema, type PersonalDnaContent } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import type { AIProvider } from '../src/ai/index.js';
import { DemoProvider } from '../src/ai/providers/demo.provider.js';
import { createLogger } from '../src/lib/logger.js';
import {
  archetypesFromTraits,
  createPersonalDnaGenerator,
  generatePersonalDnaContent,
  type PersonalDnaEnrichment,
} from '../src/modules/personal/personalDna.generator.js';
import { photographer, streamer } from './fixtures/personal.js';

const logger = createLogger({ level: 'silent', format: 'json' });
const parse = (answers: typeof photographer) => PersonalOnboardingSchema.parse(answers);

/** Proveedor "real" falso: devuelve la salida estructurada que se le indique (o falla). */
function fakeAi(output: PersonalDnaEnrichment | Error): AIProvider & { calls: number } {
  const provider = {
    name: 'fake',
    model: 'fake-1',
    mode: 'ai' as const,
    calls: 0,
    generateText() {
      return Promise.reject(new Error('no usado'));
    },
    generateStructuredOutput<T>() {
      provider.calls += 1;
      if (output instanceof Error) return Promise.reject(output);
      return Promise.resolve({
        data: output as T,
        provider: 'fake',
        model: 'fake-1',
        mode: 'ai' as const,
        latencyMs: 1,
      });
    },
  };
  return provider;
}

describe('PersonalDnaGenerator: reglas determinísticas', () => {
  it('mismas respuestas → mismo ADN', () => {
    expect(generatePersonalDnaContent(parse(photographer))).toEqual(
      generatePersonalDnaContent(parse(photographer)),
    );
  });

  it('los arquetipos salen solo de los rasgos y diferencian personas', () => {
    expect(archetypesFromTraits(['minimalista', 'serena', 'editorial'])).toEqual([
      'sage',
      'innocent',
    ]);
    expect(archetypesFromTraits(['energético', 'divertido', 'colorido'])[0]).toBe('jester');
    // Rasgos que Pixel no reconoce: se conservan en el ADN, pero no se adivina un arquetipo.
    expect(archetypesFromTraits(['zeta', 'omega'])).toEqual([]);
  });

  it('nunca inventa: los campos sin respuesta quedan vacíos', () => {
    const answers = parse({
      ...photographer,
      identity: { ...photographer.identity, headline: '', bio: '', location: '' },
      audience: {
        primaryAudience: '',
        secondaryAudiences: [],
        needs: [],
        problems: [],
        desiredPerception: [],
      },
      creative: { styles: [], colors: [], references: [], visualPreferences: [], avoidVisuals: [] },
      support: { wantsHelpWith: ['contenido'], expectations: '' },
    });
    const dna = generatePersonalDnaContent(answers);
    expect(dna.identity.summary).toBeNull();
    expect(dna.audience).toEqual({
      primaryAudience: null,
      secondaryAudiences: [],
      needs: [],
      problems: [],
      desiredPerception: [],
    });
    expect(dna.creativeIdentity.styles).toEqual([]);
    expect(dna.supportNeeds.expectations).toBeNull();
    expect(dna.professionalProfile.strengths).toEqual([]);
  });

  it('con el proveedor demo no llama a la IA', async () => {
    const generator = createPersonalDnaGenerator({ ai: new DemoProvider(), logger });
    expect(generator.version).toBe('personal-rules-1');
    const result = await generator.generate(parse(streamer));
    expect(result.generator).toEqual({ kind: 'deterministic', version: 'personal-rules-1' });
  });
});

describe('PersonalDnaGenerator: enriquecimiento IA verificado', () => {
  const noSummary = parse({
    ...photographer,
    identity: { ...photographer.identity, headline: '', bio: '' },
  });

  it('acepta solo lo que se apoya por completo en las respuestas', async () => {
    const ai = fakeAi({
      summary:
        'Eres fotógrafa de retrato editorial y quieres vender sesiones premium con luz natural.',
      strengths: ['retrato editorial', 'luz natural', 'dominio absoluto de la luz'],
    });
    const generator = createPersonalDnaGenerator({ ai, logger });
    expect(generator.version).toBe('personal-rules-1+ai');
    expect(generator.usesAi).toBe(true);

    const { content, generator: meta } = await generator.generate(noSummary);
    expect(ai.calls).toBe(1);
    expect(meta.kind).toBe('ai');
    expect(content.identity.summary).toBe(
      'Eres fotógrafa de retrato editorial y quieres vender sesiones premium con luz natural.',
    );
    expect(content.professionalProfile.strengths).toEqual(['retrato editorial', 'luz natural']);
    // Los arquetipos nunca los decide la IA: salen de los rasgos.
    expect(content.personality.archetypes).toEqual(['sage', 'innocent']);
  });

  it('descarta datos inventados aunque mezclen palabras reales (logros, lugares, cifras)', async () => {
    const ai = fakeAi({
      summary: 'Fotógrafa de retrato premiada internacionalmente en Medellín.',
      strengths: [
        'Más de 500 clientes',
        'Retrato premiado',
        'Retrato editorial en Cannes',
        '20 años de retrato',
      ],
    });
    const { content, generator } = await createPersonalDnaGenerator({ ai, logger }).generate(
      noSummary,
    );
    expect(content.identity.summary).toBeNull();
    expect(content.professionalProfile.strengths).toEqual([]);
    expect(generator.kind).toBe('deterministic');
  });

  it('un resumen que no sale de las respuestas se descarta', async () => {
    const ai = fakeAi({
      summary: 'Campeona mundial de ajedrez y astronauta retirada.',
      strengths: [],
    });
    const { content, generator } = await createPersonalDnaGenerator({ ai, logger }).generate(
      noSummary,
    );
    expect(content.identity.summary).toBeNull();
    expect(generator.kind).toBe('deterministic');
  });

  it('con rasgos desconocidos los arquetipos quedan vacíos: la IA no los adivina', async () => {
    const custom = parse({ ...photographer, personality: { traits: ['nocturna', 'obsesiva'] } });
    const ai = fakeAi({
      summary: null,
      strengths: [],
      archetypes: ['creator'],
    } as unknown as PersonalDnaEnrichment);
    const { content } = await createPersonalDnaGenerator({ ai, logger }).generate(custom);
    expect(content.personality.traits).toEqual(['nocturna', 'obsesiva']);
    expect(content.personality.archetypes).toEqual([]);
  });

  it('si la IA falla o devuelve algo inválido, queda el ADN determinístico', async () => {
    const base: PersonalDnaContent = generatePersonalDnaContent(noSummary);
    for (const ai of [
      fakeAi(new Error('timeout')),
      fakeAi({ summary: null, strengths: [42] } as unknown as PersonalDnaEnrichment),
    ]) {
      const result = await createPersonalDnaGenerator({ ai, logger }).generate(noSummary);
      expect(result).toEqual({
        content: base,
        generator: { kind: 'deterministic', version: 'personal-rules-1+ai' },
      });
    }
  });
});
