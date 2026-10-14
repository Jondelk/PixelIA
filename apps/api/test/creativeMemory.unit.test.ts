import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { composeDemoMemorySynthesis } from '../src/ai/index.js';
import type { CreativeDecisionEventDocument } from '../src/modules/creative-memory/creativeDecisionEvent.model.js';
import {
  derivedConfidence,
  patternSummary,
} from '../src/modules/creative-memory/memory.detector.js';
import {
  memoryRejection,
  oppositeKey,
  parseMemoryText,
  prioritiesValue,
} from '../src/modules/creative-memory/memory.lexicon.js';
import {
  placementDirectives,
  rankAndResolve,
} from '../src/modules/creative-memory/memory.resolver.js';
import {
  guardianCorrectionSignals,
  guardianOverrideSignals,
  placementChangeSignals,
  textEditSignals,
} from '../src/modules/creative-memory/memory.signals.js';
import { validateSynthesis } from '../src/modules/creative-memory/memory.synthesizer.js';
import { applyCampaignMemories } from '../src/modules/campaigns/campaignStrategy.engine.js';
import {
  memoryFormats,
  memoryPlatforms,
  NO_PLANNING_MEMORY,
  respectAvoidedFormats,
} from '../src/modules/content-plans/planningMemory.js';

describe('Léxico: instrucción → clave normalizada', () => {
  it('la misma preferencia con palabras distintas es la misma clave (sin duplicados)', () => {
    const keys = [
      'De ahora en adelante evita las Stories',
      'Nunca uses Stories',
      'No vuelvas a proponer Stories',
    ].map((text) => parseMemoryText(text)?.normalizedKey);
    expect(new Set(keys)).toEqual(new Set(['format:story:avoid']));
  });

  it('polaridad: evitar, preferir y excepción', () => {
    expect(parseMemoryText('De ahora en adelante evita CTA urgentes')).toMatchObject({
      normalizedKey: 'communication:urgency:avoid',
      statement: 'Evitar CTA de urgencia: preferir invitaciones suaves',
    });
    expect(parseMemoryText('Desde ahora sí quiero usar Stories habitualmente')?.normalizedKey).toBe(
      'format:story:prefer',
    );
    expect(parseMemoryText('Solo en la campaña Cosecha podemos usar neón')?.normalizedKey).toBe(
      'visual:neon:allow',
    );
    // "Prefiero CTA suaves" y "evita la urgencia" son la misma preferencia.
    expect(parseMemoryText('Prefiero CTA suaves')?.normalizedKey).toBe(
      'communication:urgency:avoid',
    );
    expect(oppositeKey('format:story:avoid')).toBe('format:story:prefer');
    expect(oppositeKey('visual:neon:allow')).toBeNull();
  });

  it('enunciados concretos; conserva el matiz de contenido y el valor de las prioridades', () => {
    expect(parseMemoryText('Recuerda que prefiero carruseles educativos')).toMatchObject({
      normalizedKey: 'format:carousel:prefer',
      statement: 'Prefiere carruseles cuando no se pide un formato concreto (contenido educativo)',
    });
    expect(prioritiesValue('Prefiero máximo 2 prioridades al día')).toBe(2);
    expect(parseMemoryText('Prefiero como mucho tres prioridades')).toMatchObject({
      normalizedKey: 'workflow:max_priorities:prefer',
      value: '3',
    });
    // Fuera del léxico: tema libre, solo porque el usuario lo pidió.
    expect(
      parseMemoryText('Recuerda que firmamos siempre como el equipo de la finca'),
    ).toMatchObject({
      dimension: 'other',
    });
  });

  it('nunca memoriza hechos, credenciales ni (Personal) datos sensibles', () => {
    expect(memoryRejection('Recuerda que somos el café #1 del Cauca', 'enterprise')).toBe(
      'factual',
    );
    expect(memoryRejection('Tenemos 20.000 clientes felices', 'enterprise')).toBe('factual');
    expect(memoryRejection('El producto cuesta $80.000', 'enterprise')).toBe('factual');
    expect(memoryRejection('Tenemos certificación orgánica', 'enterprise')).toBe('factual');
    expect(memoryRejection('Mi contraseña es pixel123', 'personal')).toBe('credentials');
    expect(memoryRejection('Guarda este API key: sk-123', 'enterprise')).toBe('credentials');
    expect(memoryRejection('Recuerda que tengo ansiedad cuando grabo', 'personal')).toBe(
      'sensitive',
    );
    expect(memoryRejection('Prefiero no hablar de religión', 'personal')).toBe('sensitive');
    expect(memoryRejection('De ahora en adelante evita las Stories', 'personal')).toBeNull();
    expect(memoryRejection('Prefiero máximo 3 prioridades', 'personal')).toBeNull();
  });
});

describe('Señales deterministas', () => {
  it('editar: lo quitado se evita, lo añadido se prefiere; sin léxico, edición genérica', () => {
    const keys = textEditSignals(
      '¡Compra YA tu CAFÉ!',
      'Descubre el origen de tu café',
      'high',
    ).map((s) => s.normalizedKey);
    expect(keys).toEqual(
      expect.arrayContaining(['communication:urgency:avoid', 'communication:shouting:avoid']),
    );
    expect(
      textEditSignals('Del origen a tu taza', '¿Sabes de dónde viene tu taza?', 'high'),
    ).toEqual([expect.objectContaining({ normalizedKey: 'communication:copy_edit:neutral' })]);
    expect(textEditSignals('Igual', 'igual', 'high')).toEqual([]);
    expect(
      placementChangeSignals(
        { format: 'story', platform: 'instagram' },
        { format: 'reel', platform: 'instagram' },
        'high',
      ).map((s) => s.normalizedKey),
    ).toEqual(['format:story:avoid', 'format:reel:prefer']);
  });

  it('lo factual nunca es una preferencia; corregir urgencia sí', () => {
    const factual = {
      code: 'ungrounded_market_claim',
      title: 'Afirma un liderazgo',
      message: 'Dice que es el #1',
      evidence: ['«el #1»'],
    };
    expect(guardianOverrideSignals(factual)).toEqual([]);
    expect(
      guardianOverrideSignals({
        code: 'visual_restriction',
        title: 'Usa algo que la marca evita: neón',
        message: 'El ADN pide evitar «Neón»',
        evidence: [],
      }).map((s) => [s.normalizedKey, s.strength]),
    ).toEqual([['visual:neon:prefer', 'medium']]);
    expect(guardianCorrectionSignals(['soften_urgency', 'remove_claim'])).toEqual([
      expect.objectContaining({ normalizedKey: 'communication:urgency:avoid', strength: 'high' }),
    ]);
  });

  it('confianza derivada: crece con la evidencia y nunca llega a certeza', () => {
    expect(derivedConfidence(3, 2, 0)).toBe(0.7);
    expect(derivedConfidence(10, 6, 8)).toBe(0.85);
  });
});

const row = (
  key: string,
  scope: { type: 'workspace' | 'campaign' | 'content_plan'; id?: string; label?: string },
  extra: Partial<{ confirmedByUser: boolean; confidence: number; content: string }> = {},
) => {
  const [dimension] = key.split(':');
  return {
    _id: new Types.ObjectId(),
    content: extra.content ?? key,
    normalizedKey: key,
    dimension: dimension as 'visual',
    polarity: key.split(':')[2] as 'avoid',
    value: null,
    kind: 'preference' as const,
    scope: {
      type: scope.type,
      id: scope.id ? new Types.ObjectId(scope.id) : null,
      label: scope.label ?? null,
    },
    confirmedByUser: extra.confirmedByUser ?? true,
    confidence: extra.confidence ?? 0.9,
    lastObservedAt: new Date(),
    updatedAt: new Date(),
  };
};

describe('CreativeMemoryResolver y ConflictResolver', () => {
  const campaignX = new Types.ObjectId().toString();

  it('la excepción de la campaña suspende la preferencia general SOLO allí', () => {
    const general = row('visual:neon:avoid', { type: 'workspace' });
    const exception = row('visual:neon:allow', { type: 'campaign', id: campaignX, label: 'X' });
    const inX = rankAndResolve([general, exception], ['visual']);
    expect(inX.memories.map((m) => m.normalizedKey)).toEqual(['visual:neon:allow']);
    expect(inX.suspended.map((m) => m.normalizedKey)).toEqual(['visual:neon:avoid']);
    const inY = rankAndResolve([general], ['visual']);
    expect(inY.memories.map((m) => m.normalizedKey)).toEqual(['visual:neon:avoid']);
  });

  it('especificidad, confirmadas y relevancia antes que la recencia; límites 8 + 8', () => {
    const rows = [
      row('format:story:avoid', { type: 'workspace' }, { confirmedByUser: false, confidence: 0.6 }),
      row('communication:urgency:avoid', { type: 'workspace' }),
      row('format:reel:prefer', { type: 'content_plan', id: campaignX, label: 'Plan' }),
    ];
    const resolved = rankAndResolve(rows, ['format', 'communication']);
    expect(resolved.memories.map((m) => m.normalizedKey)).toEqual([
      'format:reel:prefer',
      'communication:urgency:avoid',
      'format:story:avoid',
    ]);
    expect(resolved.memories.map((m) => m.ref)).toEqual(['MEMORY_1', 'MEMORY_2', 'MEMORY_3']);
    const many = Array.from({ length: 20 }, (_, i) =>
      row(`other:tema_${i}:prefer`, { type: 'workspace' }),
    );
    expect(rankAndResolve(many, []).memories).toHaveLength(8);
  });

  it('directivas de formato y plataforma para los motores', () => {
    const resolved = rankAndResolve(
      [
        row('format:story:avoid', { type: 'workspace' }),
        row('format:reel:prefer', { type: 'workspace' }),
      ],
      ['format'],
    );
    expect(placementDirectives(resolved)).toMatchObject({
      avoidFormats: ['story'],
      preferFormats: ['reel'],
    });
  });
});

describe('Planificación con memoria: la solicitud manda', () => {
  const memory = {
    ...NO_PLANNING_MEMORY,
    avoidFormats: ['story' as const],
    preferFormats: ['reel' as const],
    avoidPlatforms: ['tiktok' as const],
  };
  it('sin formatos pedidos, la memoria orienta; con formatos pedidos, no', () => {
    expect(memoryFormats(['carousel'], [], memory)).toMatchObject({
      preferred: ['reel', 'carousel'],
      avoided: ['story'],
    });
    expect(memoryFormats(['story'], ['story'], memory)).toMatchObject({
      preferred: ['story'],
      avoided: [],
    });
    expect(memoryPlatforms(undefined, ['instagram', 'tiktok'], memory).platforms).toEqual([
      'instagram',
    ]);
    expect(memoryPlatforms(['tiktok'], ['instagram', 'tiktok'], memory).platforms).toEqual([
      'tiktok',
    ]);
    expect(
      respectAvoidedFormats(
        [{ platform: 'instagram' as const, format: 'story' as const }],
        ['story'],
        ['reel'],
      ),
    ).toEqual([{ platform: 'instagram', format: 'reel' }]);
  });
});

describe('Campaña con memoria', () => {
  const proposal = {
    strategy: {
      callToAction: '¡Compra YA!',
      channels: ['Instagram', 'TikTok'],
      visualDirection: {
        mood: [],
        colors: [],
        materials: [],
        composition: [],
        photography: [],
        motion: [],
        avoid: [],
      },
    },
    deliverables: [
      {
        title: 'Reel',
        description: 'x',
        type: 'content',
        platform: 'Instagram',
        format: 'Reel',
        objective: null,
        rationale: 'x',
      },
      {
        title: 'Stories',
        description: 'x',
        type: 'content',
        platform: 'Instagram',
        format: 'Stories',
        objective: null,
        rationale: 'x',
      },
    ],
    discardedDeliverables: 0,
    discardedClaims: 0,
  } as unknown as Parameters<typeof applyCampaignMemories>[0];
  const payload = (
    memory: { ref: string; statement: string; key: string }[],
    objective = 'Presentar el 500 g',
  ) =>
    ({
      brief: { objective, description: null, constraints: [], mandatoryElements: [], channels: [] },
      creativeMemory: memory,
    }) as unknown as Parameters<typeof applyCampaignMemories>[1];

  it('sin memoria no cambia nada; con memoria, CTA suave y sin el formato evitado', () => {
    expect(applyCampaignMemories(proposal, payload([])).strategy.callToAction).toBe('¡Compra YA!');
    const applied = applyCampaignMemories(
      proposal,
      payload([
        {
          ref: 'MEMORY_1',
          statement: 'Evitar CTA de urgencia',
          key: 'communication:urgency:avoid',
        },
        { ref: 'MEMORY_2', statement: 'Evitar Stories', key: 'format:story:avoid' },
      ]),
    );
    expect(applied.strategy.callToAction).toBe('Descúbrelo');
    expect(applied.deliverables.map((d) => d.format)).toEqual(['Reel']);
    expect(applied.memoryKeys).toEqual(
      expect.arrayContaining(['communication:urgency:avoid', 'format:story:avoid']),
    );
  });

  it('si el brief pide las Stories, se mantienen (lo pedido manda)', () => {
    const applied = applyCampaignMemories(
      proposal,
      payload(
        [{ ref: 'MEMORY_1', statement: 'Evitar Stories', key: 'format:story:avoid' }],
        'Lanzar con Stories diarias',
      ),
    );
    expect(applied.deliverables).toHaveLength(2);
  });
});

/** Eventos mínimos para validar el sintetizador (sin base de datos). */
function events(
  texts: [string, string][],
  resources = 3,
): Map<string, CreativeDecisionEventDocument> {
  return new Map(
    texts.map(([before, after], index) => [
      `EVENT_${index + 1}`,
      {
        _id: new Types.ObjectId(),
        resourceId: new Types.ObjectId(),
        contentPlanId: null,
        sourceEventKey: `k${index % resources}`,
        description: 'Editaste una pieza',
        before: [{ field: 'Título', value: before }],
        after: [{ field: 'Título', value: after }],
      } as unknown as CreativeDecisionEventDocument,
    ]),
  );
}

describe('CreativeMemorySynthesizer: validación', () => {
  const edits = events([
    ['Del origen a tu taza', '¿Sabes de dónde viene tu taza?'],
    ['La finca en cada grano', '¿Conoces la finca de tu grano?'],
    ['Tostión semanal', '¿Por qué tostamos cada semana?'],
  ]);
  const valid = {
    shouldCreateCandidate: true,
    kind: 'communication_preference' as const,
    dimension: 'communication' as const,
    normalizedKey: 'communication:questions:prefer',
    statement: 'Suele abrir los textos con una pregunta a su audiencia',
    evidenceRefs: ['EVENT_1', 'EVENT_2', 'EVENT_3'],
    confidence: 0.7,
  };

  it('acepta un patrón sustentado por ≥ 3 eventos en ≥ 2 recursos', () => {
    expect(validateSynthesis(valid, edits, 'enterprise')).toMatchObject({
      key: 'communication:questions:prefer',
    });
  });

  it('referencias desconocidas (EVENT_999) se descartan; sin evidencia suficiente, nada', () => {
    expect(
      validateSynthesis(
        { ...valid, evidenceRefs: ['EVENT_1', 'EVENT_999', 'EVENT_2'] },
        edits,
        'enterprise',
      ),
    ).toBeNull();
  });

  it('una preferencia inventada (TikTok cuando solo quitaron Stories) se rechaza', () => {
    const stories = events([
      ['Stories del origen', 'Carrusel del origen'],
      ['Stories de la finca', 'Reel de la finca'],
      ['Stories de tostión', 'Foto de tostión'],
    ]);
    expect(
      validateSynthesis(
        {
          ...valid,
          dimension: 'platform',
          normalizedKey: 'platform:tiktok:prefer',
          statement: 'Prefiere publicar en TikTok antes que en Instagram',
        },
        stories,
        'enterprise',
      ),
    ).toBeNull();
  });

  it('Personal: nunca infiere datos sensibles; nunca hechos ni enunciados vagos', () => {
    expect(
      validateSynthesis(
        { ...valid, statement: 'Suele evitar grabarse porque tiene ansiedad' },
        edits,
        'personal',
      ),
    ).toBeNull();
    expect(
      validateSynthesis(
        { ...valid, statement: 'Somos el café #1 del Cauca en ventas' },
        edits,
        'enterprise',
      ),
    ).toBeNull();
    expect(
      validateSynthesis(
        { ...valid, statement: 'Le gusta lo elegante y lo bonito' },
        edits,
        'enterprise',
      ),
    ).toBeNull();
  });

  it('el demo distingue comunicación, formato, visual y forma de trabajar (sin fixture universal)', () => {
    const payload = (pairs: [string, string][]) => ({
      contextType: 'enterprise' as const,
      events: pairs.map(([before, after], i) => ({
        ref: `EVENT_${i + 1}`,
        description: 'x',
        before: [{ field: 't', value: before }],
        after: [{ field: 't', value: after }],
      })),
    });
    const key = (pairs: [string, string][]) =>
      composeDemoMemorySynthesis(payload(pairs)).normalizedKey;
    expect(
      key([
        ['¡Compra ya!', 'Descubre'],
        ['Compra ya hoy', 'Conoce'],
        ['Compralo ya', 'Mira'],
      ]),
    ).toBe('communication:urgency:avoid');
    expect(
      key([
        ['Stories 1', 'Reel 1'],
        ['Stories 2', 'Post 2'],
        ['Stories 3', 'Foto 3'],
      ]),
    ).toBe('format:story:avoid');
    expect(
      key([
        ['Luz de neón', 'Luz natural'],
        ['Neón rosa', 'Madera'],
        ['neón', 'barro'],
      ]),
    ).toBe('visual:neon:avoid');
    expect(
      key([
        ['a, b, c, d, e', 'a, b'],
        ['1, 2, 3, 4, 5, 6', '1, 2, 3'],
        ['x; y; z; w; v', 'x; y'],
      ]),
    ).toBe('workflow:short_lists:prefer');
    expect(
      composeDemoMemorySynthesis(
        payload([
          ['uno', 'dos'],
          ['tres', 'cuatro'],
          ['cinco', 'seis'],
        ]),
      ).shouldCreateCandidate,
    ).toBe(false);
  });
});

describe('Resumen humano de un patrón', () => {
  it('sin ids, con el recurso y el tema', () => {
    const list = [
      { resourceType: 'content_plan_item' },
      { resourceType: 'content_plan_item' },
      { resourceType: 'content_plan_item' },
    ] as unknown as CreativeDecisionEventDocument[];
    expect(patternSummary(list, 2, 'Story', 'avoid')).toBe(
      'En 3 decisiones sobre 2 planes diferentes quitaste o cambiaste Story.',
    );
  });
});
