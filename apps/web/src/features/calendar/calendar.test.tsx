import {
  CalendarConnectionSchema,
  PixelCommandSchema,
  type CalendarConnection,
  type PixelCommand,
} from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createdResources, confirmLabel, resourceLink } from '../pixel-command/commandLogic';
import { PixelCommandPanel } from '../pixel-command/PixelCommand';
import { CalendarConnectButton, CalendarConnectionView } from './CalendarConnection';
import {
  calendarReturnMessage,
  connectLabel,
  groupBlocksByDay,
  CALENDAR_PRIVACY,
} from './calendarLogic';
import { WeekPlanProposal } from './WeekPlanProposal';
import connectionSource from './CalendarConnection.tsx?raw';
import proposalSource from './WeekPlanProposal.tsx?raw';

/*
 * Prompt 19 en la web: la semana propuesta por día, «Guardar semana», el resultado verificado, el
 * botón para conectar y la tarjeta de conexión. Sin calendario completo y sin tokens en la web.
 */

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ID = '6ac93cc3a738fe62abe5b039';
const NOW = '2026-10-12T13:00:00.000Z';

const blocks = [
  {
    id: 'block_1',
    title: 'Estudiar cálculo',
    start: '2026-10-12T15:00:00.000Z',
    end: '2026-10-12T16:30:00.000Z',
    dayLabel: 'Lunes 12 de octubre',
    timeLabel: '10:00–11:30',
    estimated: true,
    reason: 'Antes de «Parcial de cálculo»',
  },
  {
    id: 'block_2',
    title: 'Estudiar cálculo',
    start: '2026-10-13T13:00:00.000Z',
    end: '2026-10-13T14:30:00.000Z',
    dayLabel: 'Martes 13 de octubre',
    timeLabel: '08:00–09:30',
    estimated: true,
    reason: null,
  },
  {
    id: 'block_3',
    title: 'Estudiar cálculo',
    start: '2026-10-15T13:00:00.000Z',
    end: '2026-10-15T14:30:00.000Z',
    dayLabel: 'Jueves 15 de octubre',
    timeLabel: '08:00–09:30',
    estimated: true,
    reason: null,
  },
];

const weekPlan = {
  timezone: 'America/Bogota',
  rangeStart: NOW,
  rangeEnd: '2026-10-19T05:00:00.000Z',
  availabilityCheckedAt: NOW,
  blocks,
  unscheduled: [],
  assumptions: ['He reservado bloques de 90 minutos porque no indicaste la duración.'],
  fixedCommitments: 2,
};

const action = (
  index: number,
  status: 'pending' | 'success' | 'failed',
  error: string | null = null,
) => ({
  id: `step_1.block_${index}`,
  stepId: 'step_1',
  kind: 'calendar_event',
  effect: 'create',
  title: `Guardar «Estudiar cálculo» · ${blocks[index - 1]!.dayLabel}`,
  label: `${blocks[index - 1]!.dayLabel}, ${blocks[index - 1]!.timeLabel}`,
  status,
  resource:
    status === 'success'
      ? { kind: 'calendar_event', id: `evt${index}`, label: 'Estudiar cálculo' }
      : null,
  error,
});

function weekCommand(
  overrides: Partial<PixelCommand> = {},
  statuses: ('pending' | 'success' | 'failed')[] = ['pending', 'pending', 'pending'],
): PixelCommand {
  return PixelCommandSchema.parse({
    id: ID,
    workspaceId: ID,
    status: 'proposed',
    intent: 'plan_week',
    request: 'Organízame la semana: tengo parcial de cálculo el viernes…',
    source: 'text',
    turns: [],
    question: null,
    reply: null,
    guardian: null,
    weekPlan,
    plan: {
      intent: 'plan_week',
      summary:
        'Te propongo 3 bloques para «Estudiar cálculo». No guardo nada en Google Calendar hasta que lo apruebes.',
      understood: [
        'Revisé tu Google Calendar: 2 compromisos que no muevo.',
        ...weekPlan.assumptions,
      ],
      proposal: [],
      creates: ['3 bloques en Google Calendar'],
      steps: [
        {
          id: 'step_1',
          type: 'schedule_blocks',
          title: 'Guardar 3 bloques en Google Calendar',
          status: 'pending',
          resources: [],
          error: null,
        },
      ],
      actions: statuses.map((status, index) =>
        action(
          index + 1,
          status,
          status === 'failed' ? 'Ese horario ya no está libre: apareció otro compromiso' : null,
        ),
      ),
      requiresConfirmation: true,
      revision: 1,
    },
    interpretation: { mode: 'demo', confidence: 0.8 },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function panel(phase: Parameters<typeof PixelCommandPanel>[0]['phase'], command: PixelCommand) {
  return render(
    <PixelCommandPanel
      phase={phase}
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
      renderConnect={(status) => (
        <CalendarConnectButton workspaceId="w1" status={status} returnTo="home" />
      )}
    />,
  );
}

describe('La semana propuesta', () => {
  it('agrupada por día, con la duración estimada marcada y nada guardado todavía', () => {
    expect(groupBlocksByDay(weekPlan).map((day) => day.label)).toEqual([
      'Lunes 12 de octubre',
      'Martes 13 de octubre',
      'Jueves 15 de octubre',
    ]);
    const html = panel('proposal', weekCommand());
    const visible = text(html);
    expect(visible).toContain('Lunes 12 de octubre');
    expect(visible).toContain('10:00–11:30');
    expect(visible).toContain('duración estimada');
    expect(visible).toContain('He reservado bloques de 90 minutos');
    expect(visible).toContain('Guardar semana');
    expect(visible).toContain('Ajustar');
    expect(visible).not.toContain('Organizar');
    expect(html).toContain('aria-label="Bloques propuestos"');
    // Sin calendario completo ni datos de Google en la vista.
    expect(html).not.toMatch(/calendarId|primary|token/i);
  });

  it('lo que no cupo se dice con su motivo', () => {
    const html = render(
      <WeekPlanProposal
        plan={{
          ...weekPlan,
          blocks: blocks.slice(0, 2),
          unscheduled: [
            {
              title: 'Estudiar cálculo',
              reason: 'No encontré otro hueco libre de 90 minutos antes del viernes.',
            },
          ],
        }}
      />,
    );
    expect(text(html)).toContain('No cupo');
    expect(text(html)).toContain('No encontré otro hueco libre de 90 minutos antes del viernes.');
  });

  it('botones: «Guardar semana» y «Mover bloque»', () => {
    const plan = weekCommand().plan!;
    expect(confirmLabel(plan)).toBe('Guardar semana');
    expect(confirmLabel({ ...plan, steps: [{ ...plan.steps[0]!, type: 'move_block' }] })).toBe(
      'Mover bloque',
    );
  });
});

describe('Resultado verificado', () => {
  it('3 de 3 guardados y comprobados; sin enlaces a pantallas que no existen', () => {
    const done = weekCommand(
      { status: 'completed', reply: '3 de 3 bloques guardados y comprobados en Google Calendar.' },
      ['success', 'success', 'success'],
    );
    const visible = text(panel('completed', done));
    expect(visible).toContain('3 de 3 bloques guardados y comprobados en Google Calendar.');
    expect(visible).toContain('3 de 3 comprobados en Google Calendar.');
    expect(visible).toContain('Bloque · Lunes 12 de octubre, 10:00–11:30');
    expect(
      resourceLink('/workspace/w1', { kind: 'calendar_event', id: 'evt1', label: 'x' }),
    ).toBeNull();
    expect(
      createdResources({
        ...done,
        plan: {
          ...done.plan!,
          steps: [
            {
              ...done.plan!.steps[0]!,
              resources: [{ kind: 'calendar_event', id: 'evt1', label: 'x' }],
            },
          ],
        },
      }),
    ).toEqual([]);
  });

  it('parcial: «Guardé 2 de los 3 bloques. No pude guardar el del martes…» y Reintentar', () => {
    const partial = weekCommand(
      {
        status: 'partial',
        reply:
          'Guardé 2 de los 3 bloques. No pude guardar el del martes (ese horario ya no está libre: apareció otro compromiso). Puedes reintentarlo: lo que ya está guardado no se duplica.',
      },
      ['success', 'failed', 'success'],
    );
    const visible = text(panel('partial', partial));
    expect(visible).toContain('Guardé 2 de los 3 bloques. No pude guardar el del martes');
    expect(visible).toContain('2 de 3 comprobados en Google Calendar.');
    expect(visible).toContain('Ese horario ya no está libre');
    expect(visible).toContain('Reintentar');
  });
});

describe('Conectar Google Calendar', () => {
  const answered = (status: 'requires_auth' | 'requires_reauth' | 'unconfigured', reply: string) =>
    weekCommand({
      status: 'answered',
      plan: null,
      weekPlan: null,
      reply,
      connect: { provider: 'google_calendar', status },
    });

  it('sin conectar → la respuesta honesta y el botón, con el aviso de privacidad', () => {
    const visible = text(
      panel(
        'answered',
        answered(
          'requires_auth',
          'Para consultar tu disponibilidad necesito conectar tu Google Calendar.',
        ),
      ),
    );
    expect(visible).toContain(
      'Para consultar tu disponibilidad necesito conectar tu Google Calendar.',
    );
    expect(visible).toContain('Conectar Google Calendar');
    expect(visible).toContain(CALENDAR_PRIVACY);
  });

  it('reconectar y sin configurar', () => {
    expect(
      text(
        panel(
          'answered',
          answered('requires_reauth', 'Necesito volver a conectar tu Google Calendar.'),
        ),
      ),
    ).toContain('Volver a conectar');
    const bare = text(
      panel(
        'answered',
        answered(
          'unconfigured',
          'Google Calendar todavía no está configurado en esta instalación de Pixel.',
        ),
      ),
    );
    expect(bare).toContain('todavía no está configurado');
    expect(bare).not.toContain('Conectar Google Calendar');
    expect(connectLabel('connected')).toBeNull();
  });

  const connection = (overrides: Partial<CalendarConnection>): CalendarConnection =>
    CalendarConnectionSchema.parse({
      provider: 'google',
      status: 'requires_auth',
      connected: false,
      scopes: [],
      timezone: null,
      accountLabel: null,
      connectedAt: null,
      ...overrides,
    });

  it('la tarjeta: conectado (permisos, zona, desconectar sin borrar eventos) y sin conectar', () => {
    const connected = text(
      render(
        <CalendarConnectionView
          workspaceId="w1"
          disconnecting={false}
          onDisconnect={() => {}}
          connection={connection({
            status: 'connected',
            connected: true,
            scopes: [
              'Ver tu disponibilidad (ocupado o libre)',
              'Crear y mover los bloques que apruebes',
            ],
            timezone: 'America/Bogota',
          })}
        />,
      ),
    );
    expect(connected).toContain('Conectado');
    expect(connected).toContain('Crear y mover los bloques que apruebes');
    expect(connected).toContain('America/Bogota');
    expect(connected).toContain('Desconectar');
    expect(connected).toContain('Los bloques que ya guardaste se quedan en tu Google Calendar.');
    const disconnected = text(
      render(
        <CalendarConnectionView
          workspaceId="w1"
          disconnecting={false}
          onDisconnect={() => {}}
          connection={connection({})}
        />,
      ),
    );
    expect(disconnected).toContain('Sin conectar');
    expect(disconnected).toContain('Conectar Google Calendar');
  });

  it('al volver de Google: conectado o el motivo humano del error', () => {
    expect(calendarReturnMessage(new URLSearchParams('calendar=connected'))?.tone).toBe('success');
    expect(
      calendarReturnMessage(new URLSearchParams('calendar=error&reason=denied'))?.text,
    ).toMatch(/no diste permiso/);
    expect(
      calendarReturnMessage(new URLSearchParams('calendar=error&reason=state_expired'))?.text,
    ).toMatch(/caducó/);
    expect(calendarReturnMessage(new URLSearchParams('calendar=error&reason=<script>'))?.text).toBe(
      'No se pudo conectar Google Calendar. Vuelve a intentarlo.',
    );
    expect(calendarReturnMessage(new URLSearchParams(''))).toBeNull();
  });
});

describe('Identidad visual', () => {
  it('los componentes de calendario no usan colores sueltos', () => {
    for (const source of [connectionSource, proposalSource]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
    }
  });
});
