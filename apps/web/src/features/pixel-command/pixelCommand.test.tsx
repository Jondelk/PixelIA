import { PixelCommandSchema, type PixelCommand } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandPhase, createdResources, resourceLink, type CommandPhase } from './commandLogic';
import { PixelCommandPanel } from './PixelCommand';
import { sendPixelCommand } from './pixelCommandApi';

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ID = '6ac93cc3a738fe62abe5b039';
const BASE = '/workspace/w1';
const NOW = '2026-10-09T12:00:00.000Z';

function commandFixture(overrides: Partial<PixelCommand> = {}): PixelCommand {
  return PixelCommandSchema.parse({
    id: ID,
    workspaceId: ID,
    status: 'proposed',
    intent: 'create_campaign',
    request: 'Quiero lanzar TINTO 500 g la próxima semana en Instagram.',
    source: 'text',
    turns: [],
    question: null,
    reply: 'Entendí que quieres lanzar TINTO 500 g.',
    guardian: null,
    plan: {
      intent: 'create_campaign',
      summary: 'Entendí que quieres lanzar TINTO 500 g. Propongo una campaña alineada con el ADN.',
      understood: ['Qué: TINTO 500 g', 'Canales: Instagram'],
      proposal: ['Una campaña «Lanzamiento TINTO 500 g» con su estrategia'],
      creates: ['Una campaña con su estrategia y las piezas que necesita'],
      steps: [
        {
          id: 'step_1',
          type: 'generate_campaign',
          title: 'Crear la campaña',
          status: 'pending',
          resources: [],
          error: null,
        },
      ],
      requiresConfirmation: true,
      revision: 1,
    },
    interpretation: { mode: 'demo', confidence: 0.75 },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function panel(
  phase: CommandPhase,
  command: PixelCommand | null,
  extra: { error?: string; adjusting?: boolean } = {},
) {
  return render(
    <PixelCommandPanel
      phase={phase}
      command={command}
      title="¿Qué necesitas hacer?"
      placeholder="Cuéntale a Pixel…"
      base={BASE}
      error={extra.error ?? null}
      adjusting={extra.adjusting ?? false}
      thinking={(copy) => <p>{copy.title}</p>}
      onSend={() => {}}
      onAdjust={() => {}}
      onStartAdjust={() => {}}
      onConfirm={() => {}}
      onCancel={() => {}}
      onReset={() => {}}
    />,
  );
}

describe('PixelCommand: fases de la conversación', () => {
  it('entrada principal: "¿Qué necesitas hacer?" con un solo campo de texto', () => {
    const html = panel('idle', null);
    expect(text(html)).toContain('¿Qué necesitas hacer?');
    expect(html).toContain('placeholder="Cuéntale a Pixel…"');
    expect(html.match(/<textarea/g)).toHaveLength(1);
    expect(html).not.toContain('<select');
  });

  it('interpretando: Pixel piensa (sin progreso falso)', () => {
    expect(text(panel('interpreting', null))).toContain('Pixel está entendiendo lo que necesitas');
  });

  it('falta un dato: UNA pregunta y un campo para responder', () => {
    const html = panel(
      'question',
      commandFixture({
        status: 'needs_information',
        question: '¿Qué producto o servicio vamos a lanzar?',
        plan: null,
      }),
    );
    expect(text(html)).toContain('¿Qué producto o servicio vamos a lanzar?');
    expect(html).toContain('placeholder="Responde a Pixel…"');
    expect(html.match(/<textarea/g)).toHaveLength(1);
  });

  it('propuesta: lo que entendí, lo que propongo, qué voy a crear; Organizar · Ajustar · Cancelar', () => {
    const plain = text(panel('proposal', commandFixture()));
    for (const label of [
      'Lo que entendí',
      'Lo que propongo',
      'Qué voy a crear',
      'Qué: TINTO 500 g',
      'Organizar',
      'Ajustar',
      'Cancelar',
    ]) {
      expect(plain).toContain(label);
    }
    // Sin nombres internos.
    expect(plain).not.toMatch(/ContentPlan|CampaignStrategy|ContentPlanItem/);
  });

  it('ajustar: texto libre en lugar de un formulario', () => {
    const html = panel('proposal', commandFixture(), { adjusting: true });
    expect(html).toContain('¿Qué cambio?');
    expect(text(html)).not.toContain('Organizar');
  });

  it('ejecutando: Pixel organiza', () => {
    expect(text(panel('executing', commandFixture()))).toContain('Pixel está organizándolo');
  });

  it('completado: enlaces a lo creado y "Nueva solicitud"', () => {
    const done = commandFixture({
      status: 'completed',
      reply: 'Listo. Organicé «Lanzamiento TINTO 500 g».',
      plan: {
        ...commandFixture().plan!,
        steps: [
          {
            id: 'step_1',
            type: 'generate_campaign',
            title: 'Crear la campaña',
            status: 'done',
            resources: [{ kind: 'campaign', id: ID, label: 'Lanzamiento TINTO 500 g' }],
            error: null,
          },
        ],
      },
    });
    const html = panel('completed', done);
    expect(html).toContain(`href="${BASE}/campaigns/${ID}"`);
    expect(text(html)).toContain('Nueva solicitud');
    expect(text(html)).not.toContain('Reintentar');
  });

  it('fallo parcial o total: explica qué pasó y permite reintentar', () => {
    const failed = commandFixture({
      status: 'failed',
      reply: 'No pude completar «Crear la campaña»: la IA no está disponible. No se creó nada.',
    });
    const plain = text(panel('failed', failed));
    expect(plain).toContain('No se creó nada');
    expect(plain).toContain('Reintentar');
    expect(
      text(panel('partial', commandFixture({ status: 'partial', reply: 'Creé X, pero…' }))),
    ).toContain('Reintentar');
  });

  it('respuesta (consejo o estado): sin acciones que creen nada', () => {
    const answered = commandFixture({
      status: 'answered',
      intent: 'creative_advice',
      plan: null,
      reply: 'Publicaría el proceso de tueste.',
    });
    const plain = text(panel('answered', answered));
    expect(plain).toContain('Publicaría el proceso de tueste.');
    expect(plain).not.toContain('Organizar');
  });

  it('cancelado: vuelve a la entrada con el aviso', () => {
    const cancelled = commandFixture({ status: 'cancelled', reply: 'Cancelado. No se creó nada.' });
    const html = panel('cancelled', cancelled);
    expect(text(html)).toContain('Cancelado. No se creó nada.');
    expect(html).toContain('<textarea');
  });

  it('un error de la API se muestra sin perder la fase', () => {
    expect(text(panel('idle', null, { error: 'Pixel no puede responder ahora mismo' }))).toContain(
      'Pixel no puede responder ahora mismo',
    );
  });
});

/* ---------- Prompt 18: acciones concretas y su resultado verificado ---------- */

const PROJECT_ID = '6ac93cc3a738fe62abe5b040';
const action = (
  id: string,
  kind: 'project' | 'task',
  label: string,
  status: 'pending' | 'success' | 'failed' | 'skipped',
  error: string | null = null,
) => ({
  id,
  stepId: kind === 'project' ? 'step_1' : 'step_2',
  kind,
  effect: 'create' as const,
  title: kind === 'project' ? `Crear el proyecto «${label}»` : `Crear la tarea «${label}»`,
  label,
  status,
  resource: status === 'success' ? { kind, id: PROJECT_ID, label } : null,
  error,
});

function projectCommand(
  statuses: ('pending' | 'success' | 'failed' | 'skipped')[],
  overrides: Partial<PixelCommand> = {},
) {
  const [p, a, b, c] = statuses;
  return commandFixture({
    intent: 'organize_project',
    plan: {
      intent: 'organize_project',
      summary: 'Creo el proyecto «Preparar parcial» con 3 tareas.',
      understood: ['Proyecto nuevo: «Preparar parcial»'],
      proposal: ['Un proyecto activo', 'Sus tareas, por hacer'],
      creates: ['Un proyecto', '3 tareas dentro de él'],
      steps: [
        {
          id: 'step_1',
          type: 'create_project',
          title: 'Crear el proyecto «Preparar parcial»',
          status: p === 'success' ? 'done' : 'pending',
          resources:
            p === 'success' ? [{ kind: 'project', id: PROJECT_ID, label: 'Preparar parcial' }] : [],
          error: null,
        },
      ],
      actions: [
        action('step_1.project', 'project', 'Preparar parcial', p!),
        action('step_2.task_1', 'task', 'Repasar límites', a!),
        action(
          'step_2.task_2',
          'task',
          'Practicar derivadas',
          b!,
          b === 'failed' ? 'No se pudo completar' : null,
        ),
        action('step_2.task_3', 'task', 'Hacer un simulacro', c!),
      ],
      requiresConfirmation: true,
      revision: 1,
    },
    ...overrides,
  });
}

describe('Acciones: proponer, autorizar una vez y contar la verdad', () => {
  it('propuesta: «Qué voy a hacer» lista el proyecto y CADA tarea; una sola confirmación', () => {
    const html = panel('proposal', projectCommand(['pending', 'pending', 'pending', 'pending']));
    const visible = text(html);
    expect(visible).toContain('Qué voy a hacer');
    for (const title of [
      'Crear el proyecto «Preparar parcial»',
      'Crear la tarea «Repasar límites»',
      'Crear la tarea «Practicar derivadas»',
      'Crear la tarea «Hacer un simulacro»',
    ]) {
      expect(visible).toContain(title);
    }
    expect(visible).not.toContain('Qué voy a crear');
    expect(html.match(/>\s*(?:<svg[^]*?<\/svg>\s*)?Organizar\s*</g)).toHaveLength(1);
    // Nada técnico: ni herramientas, ni capacidades, ni ids.
    expect(visible).not.toMatch(/workspace\.|create_task|step_2\.task|6ac93cc3a738fe62abe5b040/);
  });

  it('completado: ✓ cada acción comprobada y el enlace al proyecto verificado', () => {
    const html = panel(
      'completed',
      projectCommand(['success', 'success', 'success', 'success'], {
        status: 'completed',
        reply: 'Listo. Creé el proyecto «Preparar parcial» y sus 3 tareas.',
      }),
    );
    expect(text(html)).toContain('4 de 4 acciones hechas y comprobadas.');
    expect(html).toContain('aria-label="Resultado de cada acción"');
    expect(text(html)).toContain('Hecho: Proyecto · Preparar parcial');
    expect(html).toContain(`href="${BASE}/projects/${PROJECT_ID}"`);
  });

  it('parcial: ✓ ✓ ✕ ✓ sin esconder el fallo ni decir «todo listo»; Reintentar', () => {
    const html = panel(
      'partial',
      projectCommand(['success', 'success', 'failed', 'success'], {
        status: 'partial',
        reply:
          'Creé el proyecto «Preparar parcial» y 2 de las 3 tareas. No pude crear «Practicar derivadas».',
      }),
    );
    const visible = text(html);
    expect(visible).toContain('3 de 4 acciones hechas y comprobadas.');
    expect(visible).toContain('No se pudo: Tarea · Practicar derivadas');
    expect(visible).toContain('No se pudo completar');
    expect(visible).not.toMatch(/Todo listo/);
    expect(visible).toContain('Reintentar');
  });

  it('dependencia fallida: las tareas aparecen como «No se hizo», sin enlaces', () => {
    const html = panel(
      'failed',
      projectCommand(['failed', 'skipped', 'skipped', 'skipped'], {
        status: 'failed',
        reply: 'No pude crear el proyecto «Preparar parcial», así que no creé sus 3 tareas.',
      }),
    );
    expect(text(html)).toContain('0 de 4 acciones hechas y comprobadas.');
    expect(text(html)).toContain('No se hizo: Tarea · Repasar límites');
    expect(html).not.toContain('/projects/');
  });

  it('una campaña (pasos sin herramientas) no muestra la lista de acciones', () => {
    const html = panel('completed', commandFixture({ status: 'completed', reply: 'Listo.' }));
    expect(html).not.toContain('Resultado de cada acción');
  });
});

describe('commandLogic', () => {
  it('la petición en curso manda sobre el estado del servidor', () => {
    expect(commandPhase(null, null)).toBe('idle');
    expect(commandPhase(null, 'send')).toBe('interpreting');
    expect(commandPhase(commandFixture(), 'confirm')).toBe('executing');
    expect(commandPhase(commandFixture({ status: 'needs_information', plan: null }), null)).toBe(
      'question',
    );
  });

  it('enlaces de lo creado; varias tareas se agrupan', () => {
    expect(resourceLink(BASE, { kind: 'content_plan', id: ID, label: 'x' })).toBe(
      `${BASE}/content-planner/${ID}`,
    );
    const command = commandFixture({
      plan: {
        ...commandFixture().plan!,
        steps: [
          {
            id: 'step_1',
            type: 'create_tasks',
            title: 'Crear 2 tareas',
            status: 'done',
            resources: [
              { kind: 'task', id: ID, label: 'Grabar' },
              { kind: 'task', id: ID, label: 'Editar' },
            ],
            error: null,
          },
        ],
      },
    });
    expect(createdResources(command)).toEqual([{ kind: 'task', id: ID, label: '2 tareas' }]);
  });
});

describe('pixelCommandApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envía el texto con su origen (texto hoy, voz mañana) y la zona horaria', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ command: commandFixture() }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await sendPixelCommand('w1', { request: 'Necesito lanzar TINTO', source: 'text' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/workspaces/w1/pixel/commands');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      request: 'Necesito lanzar TINTO',
      source: 'text',
      tzOffset: new Date().getTimezoneOffset(),
    });
  });
});
