import { CreativeMemorySchema, PixelCommandSchema, type CreativeMemory } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { enterpriseNav, enterpriseStaysInWorkspace, workspaceNav } from '../../app/navigation';
import { confirmLabel, resourceLink } from '../pixel-command/commandLogic';
import { PixelCommandPanel } from '../pixel-command/PixelCommand';
import { EvidenceList, MemoryView, type MemoryViewProps } from './MemoryPage';
import { conflictingActive, groupMemories, scopeText } from './memoryLogic';

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ID = '6ac93cc3a738fe62abe5b039';
const CAMPAIGN = '6ac93cc3a738fe62abe5b040';
const NOW = '2026-10-13T12:00:00.000Z';

function memoryFixture(overrides: Partial<CreativeMemory> = {}): CreativeMemory {
  return CreativeMemorySchema.parse({
    id: ID,
    workspaceId: ID,
    contextType: 'enterprise',
    kind: 'avoid',
    dimension: 'format',
    scope: { type: 'workspace', id: null, label: null },
    normalizedKey: 'format:story:avoid',
    statement: 'Evitar Stories salvo petición explícita',
    polarity: 'avoid',
    value: null,
    status: 'active',
    origin: 'explicit',
    confidence: 0.95,
    occurrenceCount: 1,
    evidenceCount: 0,
    evidenceSummary: null,
    confirmedByUser: true,
    confirmedAt: NOW,
    supersedesMemoryId: null,
    supersededByMemoryId: null,
    forgottenAt: null,
    dismissedAt: null,
    lastObservedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

const candidate = memoryFixture({
  id: '6ac93cc3a738fe62abe5b041',
  status: 'candidate',
  origin: 'decision_pattern',
  normalizedKey: 'format:story:prefer',
  statement: 'Prefiere Stories cuando no se pide un formato concreto',
  polarity: 'prefer',
  confirmedByUser: false,
  confirmedAt: null,
  evidenceCount: 3,
  evidenceSummary: 'En 3 decisiones sobre 2 planes diferentes elegiste Stories.',
});

function view(memories: CreativeMemory[], extra: Partial<MemoryViewProps> = {}) {
  return render(
    <MemoryView
      groups={groupMemories(memories)}
      owner="Café Tinto"
      personal={false}
      home="/company/c1"
      busyId={null}
      onConfirm={() => {}}
      onDismiss={() => {}}
      onForget={() => {}}
      onReplace={() => {}}
      why={() => null}
      {...extra}
    />,
  );
}

describe('Lo que Pixel ha aprendido', () => {
  it('estado vacío: invita a hablar con Pixel (no a rellenar un formulario)', () => {
    const plain = text(view([]));
    expect(plain).toContain('Pixel todavía no ha aprendido nada de Café Tinto');
    expect(plain).toContain('De ahora en adelante evita los CTA de urgencia');
    expect(plain).toContain('Hablar con Pixel');
    expect(view([])).not.toContain('<textarea');
  });

  it('memoria activa: qué es, a qué aplica, de dónde salió; Editar · Olvidar', () => {
    const plain = text(view([memoryFixture()]));
    for (const label of [
      'Lo que tiene en cuenta',
      'Evitar Stories salvo petición explícita',
      'Aplica a',
      'Café Tinto',
      'Origen',
      'Indicado explícitamente por ti',
      'Editar',
      'Olvidar',
      'Lo que pides en cada momento siempre manda',
    ]) {
      expect(plain).toContain(label);
    }
    // Sin nombres internos.
    expect(plain).not.toMatch(/format:story|confidence|0\.95|normalizedKey|active/);
  });

  it('candidata: el patrón, la pregunta y Recordar · No fue intencional · ¿Por qué?', () => {
    const plain = text(view([candidate]));
    for (const label of [
      'Pixel ha notado',
      'Pixel ha notado un patrón',
      'En 3 decisiones sobre 2 planes diferentes elegiste Stories.',
      '¿Quieres que recuerde: «Prefiere Stories cuando no se pide un formato concreto»?',
      'Recordar',
      'No fue intencional',
      '¿Por qué Pixel piensa esto?',
    ]) {
      expect(plain).toContain(label);
    }
  });

  it('conflicto: si la candidata contradice una activa, lo dice antes de decidir', () => {
    const active = memoryFixture();
    expect(conflictingActive(candidate, [active])?.id).toBe(active.id);
    expect(text(view([active, candidate]))).toContain(
      'Si lo confirmas, reemplaza a lo que tenía en cuenta: «Evitar Stories salvo petición explícita».',
    );
  });

  it('alcance: marca, campaña y Personal en lenguaje humano', () => {
    const exception = memoryFixture({
      kind: 'exception',
      polarity: 'allow',
      normalizedKey: 'visual:neon:allow',
      statement: 'Se permite neón como excepción',
      scope: { type: 'campaign', id: CAMPAIGN, label: 'Cosecha' },
    });
    expect(scopeText(memoryFixture(), 'Café Tinto', false)).toBe('Café Tinto');
    expect(scopeText(exception, 'Café Tinto', false)).toBe('Solo la campaña «Cosecha»');
    expect(scopeText(memoryFixture(), 'Jhon', true)).toBe('Todo tu Pixel');
    const plain = text(view([exception]));
    expect(plain).toContain('Excepción');
    expect(plain).toContain('Solo la campaña «Cosecha»');
  });

  it('historial: secundario y plegado, con lo reemplazado, descartado u olvidado', () => {
    const html = view([memoryFixture({ status: 'forgotten', forgottenAt: NOW }), candidate]);
    expect(html).toContain('<details');
    expect(text(html)).toContain('Historial (1)');
    expect(text(html)).toContain('Olvidada');
  });

  it('¿Por qué Pixel piensa esto?: evidencia humana, sin ids', () => {
    const plain = text(
      render(
        <EvidenceList
          evidence={[
            { description: 'Quitaste una pieza (Historia) de «Plan de junio»', occurredAt: NOW },
          ]}
        />,
      ),
    );
    expect(plain).toContain('Quitaste una pieza (Historia) de «Plan de junio»');
    expect(text(render(<EvidenceList evidence={[]} />))).toContain('Lo indicaste tú directamente');
  });

  it('Personal: misma pantalla, en segunda persona', () => {
    const plain = text(
      view([memoryFixture({ contextType: 'personal' })], { personal: true, owner: 'Jhon' }),
    );
    expect(plain).toContain('Todo tu Pixel');
    expect(text(view([], { personal: true }))).toContain(
      'Pixel todavía no ha aprendido nada de ti',
    );
  });
});

describe('Navegación: sin grupos nuevos', () => {
  it('Enterprise: dentro de Marca; Personal: junto a Mi Pixel; ruta workspace-first', () => {
    const marca = enterpriseNav('c1', 'w1').find((group) => group.label === 'Marca')!;
    expect(marca.items.map((item) => item.label)).toContain('Lo aprendido');
    expect(enterpriseNav('c1', 'w1').map((group) => group.label ?? 'Inicio')).toEqual([
      'Inicio',
      'Trabajo',
      'Marca',
    ]);
    const pixel = workspaceNav('w1', 'personal').find((group) => group.label === 'Pixel')!;
    expect(pixel.items.map((item) => item.to)).toContain('/workspace/w1/memory');
    expect(enterpriseStaysInWorkspace('/workspace/w1/memory')).toBe(true);
  });
});

describe('PixelCommand: recordar, olvidar y mostrar', () => {
  const plan = (type: 'remember_memory' | 'forget_memory') =>
    PixelCommandSchema.parse({
      id: ID,
      workspaceId: ID,
      status: 'proposed',
      intent: 'manage_memory',
      request: 'De ahora en adelante evita las Stories',
      source: 'text',
      turns: [],
      question: null,
      reply: 'Voy a recordar para Café Tinto: Evitar Stories salvo petición explícita.',
      guardian: null,
      plan: {
        intent: 'manage_memory',
        summary: 'Voy a recordar para Café Tinto: Evitar Stories salvo petición explícita.',
        understood: [
          'Qué: Evitar Stories salvo petición explícita',
          'Aplica a: Café Tinto en general',
        ],
        proposal: ['Lo tendré en cuenta en tus próximas campañas, planes y revisiones'],
        creates: ['Una memoria en «Lo que Pixel ha aprendido»'],
        steps: [
          { id: 'step_1', type, title: 'Recordar', status: 'pending', resources: [], error: null },
        ],
        requiresConfirmation: true,
        revision: 1,
      },
      interpretation: { mode: 'rules', confidence: 0.8 },
      createdAt: NOW,
      updatedAt: NOW,
    });

  const panel = (command: ReturnType<typeof plan>) =>
    text(
      render(
        <PixelCommandPanel
          phase={command.status === 'answered' ? 'answered' : 'proposal'}
          command={command}
          title="¿Qué necesitas hacer?"
          placeholder="Cuéntale a Pixel…"
          base="/workspace/w1"
          error={null}
          adjusting={false}
          thinking={(copy) => <p>{copy.title}</p>}
          onSend={() => {}}
          onAdjust={() => {}}
          onStartAdjust={() => {}}
          onConfirm={() => {}}
          onCancel={() => {}}
          onReset={() => {}}
        />,
      ),
    );

  it('recordar: una sola confirmación que dice "Recordar" (no "Organizar")', () => {
    const remember = plan('remember_memory');
    expect(confirmLabel(remember.plan!)).toBe('Recordar');
    const plain = panel(remember);
    expect(plain).toContain('Voy a recordar para Café Tinto');
    expect(plain).toContain('Recordar');
    expect(plain).not.toContain('Organizar');
  });

  it('olvidar: "Olvidar"; el recurso enlaza a la página de memoria', () => {
    expect(confirmLabel(plan('forget_memory').plan!)).toBe('Olvidar');
    expect(
      resourceLink('/workspace/w1', { kind: 'creative_memory', id: ID, label: 'Evitar Stories' }),
    ).toBe('/workspace/w1/memory');
  });

  it('mostrar: responde en el acto con lo aprendido (sin confirmar nada)', () => {
    const shown = PixelCommandSchema.parse({
      ...plan('remember_memory'),
      status: 'answered',
      plan: null,
      reply:
        'Esto es lo que tengo en cuenta de Café Tinto:\n• Evitar Stories salvo petición explícita',
    });
    const plain = panel(shown);
    expect(plain).toContain('Esto es lo que tengo en cuenta de Café Tinto');
    expect(plain).not.toContain('Recordar');
  });
});
