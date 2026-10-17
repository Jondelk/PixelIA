import { AgendaResponseSchema, type AgendaItem, type AgendaView } from '@pixel/contracts';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { workspaceNav } from '../../app/navigation';
import { PixelComposer } from '../presence/PixelComposer';
import { dockVisibleAt } from '../presence/dockContext';
import { personalSuggestions } from '../presence/suggestions';
import { AgendaBody, AgendaTabs } from './AgendaPage';
import { AgendaTodayPreviewView } from './AgendaTodayPreview';
import {
  anchorFromParam,
  contextFor,
  draftForDay,
  draftForItem,
  horizonFromParam,
  itemAction,
  nextHorizon,
  viewFromParam,
} from './agendaLogic';
import proposalSource from './AgendaViews.tsx?raw';
import pageSource from './AgendaPage.tsx?raw';

/*
 * «Mi agenda» (Prompt 20) en la web: cuatro escalas con su propia forma, tipos distinguibles sin
 * depender del color, acciones que SIEMPRE pasan por Pixel (nunca «Mover» directo) y avisos de
 * conexión que no destruyen la agenda interna.
 */

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const BASE = '/workspace/w1';

const item = (overrides: Partial<AgendaItem>): AgendaItem => ({
  id: 'evt_00000000000000000001',
  kind: 'commitment',
  kindLabel: 'Compromiso',
  title: 'Reunión',
  start: '2026-10-14T20:00:00.000Z',
  end: '2026-10-14T21:00:00.000Z',
  date: '2026-10-14',
  endDate: '2026-10-14',
  dates: ['2026-10-14'],
  allDay: false,
  multiDay: false,
  timeLabel: '15:00–16:00',
  dayLabel: 'Miércoles 14 de octubre',
  status: 'upcoming',
  statusLabel: null,
  pixelManaged: false,
  movableByPixel: false,
  deadline: false,
  link: null,
  group: null,
  ...overrides,
});

const pixelBlock = item({
  id: 'evt_00000000000000000002',
  kind: 'pixel_block',
  kindLabel: 'Organizado por Pixel',
  title: 'Avanzar Pixel',
  timeLabel: '11:00–12:30',
  pixelManaged: true,
  movableByPixel: true,
});
const past = item({
  id: 'evt_00000000000000000003',
  title: 'Clase',
  timeLabel: '07:00–08:30',
  status: 'past',
});
const allDay = item({
  id: 'evt_00000000000000000004',
  title: 'Cumpleaños de Ana',
  start: null,
  end: null,
  allDay: true,
  timeLabel: 'Todo el día',
  status: 'now',
});
const pending = item({
  id: 'task_6ac93cc3a738fe62abe5b039',
  kind: 'pending',
  kindLabel: 'Por organizar',
  title: 'Entrega informe',
  start: null,
  end: null,
  timeLabel: null,
  status: 'due_today',
  statusLabel: 'Vence hoy',
  deadline: true,
  link: { type: 'task', id: '6ac93cc3a738fe62abe5b039' },
});

const day = (date: string, extra: Partial<AgendaView['days'][number]> = {}) => ({
  date,
  label: `Día ${date}`,
  shortLabel: `D ${date.slice(8)}`,
  dayNumber: Number(date.slice(8)),
  weekday: 1,
  isToday: false,
  isPast: false,
  inRange: true,
  ...extra,
});

function agenda(overrides: Partial<AgendaView> = {}): AgendaView {
  return AgendaResponseSchema.parse({
    agenda: {
      timezone: 'America/Bogota',
      view: 'today',
      anchor: '2026-10-14',
      today: '2026-10-14',
      range: { start: '2026-10-14T05:00:00.000Z', end: '2026-10-15T05:00:00.000Z' },
      title: 'Hoy · Miércoles 14 de octubre',
      navigation: { previous: '2026-10-13', next: '2026-10-15', today: '2026-10-14' },
      summary:
        'Hoy tienes 3 compromisos, 1 bloque organizado por Pixel y 1 pendiente por organizar.',
      counts: { commitments: 3, pixelBlocks: 1, pending: 1, deadlines: 0 },
      days: [day('2026-10-14', { isToday: true })],
      items: [allDay, past, pixelBlock, item({})],
      pendingItems: [pending],
      groups: [],
      connection: { status: 'connected', message: null },
      horizonDays: null,
      canExtend: false,
      generatedAt: '2026-10-14T14:00:00.000Z',
      ...overrides,
    },
  }).agenda;
}

const body = (view: AgendaView) =>
  render(
    <AgendaBody
      agenda={view}
      workspaceId="w1"
      base={BASE}
      onAsk={() => {}}
      onNavigate={() => {}}
      onMore={() => {}}
    />,
  );

describe('Mi agenda · navegación y ruta', () => {
  it('Personal: «Mi agenda» justo debajo de Inicio; Enterprise no la tiene', () => {
    expect(workspaceNav('w1', 'personal')[0]!.items.map((entry) => entry.label)).toEqual([
      'Inicio',
      'Mi agenda',
    ]);
    const enterprise = workspaceNav('w1', 'enterprise', 'c1').flatMap((group) =>
      group.items.map((entry) => entry.label),
    );
    expect(enterprise).not.toContain('Mi agenda');
    const labels = workspaceNav('w1', 'personal').flatMap((group) =>
      group.items.map((entry) => entry.label),
    );
    expect(
      labels.filter((label) => /Calendario|Google Calendar|Week Planner|Mi semana/.test(label)),
    ).toEqual([]);
  });

  it('la vista va en la URL (recargable) y valida lo que llega', () => {
    expect(viewFromParam('month')).toBe('month');
    expect(viewFromParam('year')).toBe('today');
    expect(viewFromParam(null)).toBe('today');
    expect(anchorFromParam('2026-11-01')).toBe('2026-11-01');
    expect(anchorFromParam('../../etc')).toBeNull();
    expect(horizonFromParam('180')).toBe(180);
    expect(horizonFromParam('9999')).toBe(90);
    expect(nextHorizon(90)).toBe(180);
    expect(nextHorizon(300)).toBe(360);
  });

  it('pestañas accesibles: tablist, tab, aria-selected y una sola en el orden de tabulación', () => {
    const html = render(<AgendaTabs view="week" onSelect={() => {}} />);
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toMatch(/aria-selected="true"[^>]*>Semana|Semana/);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(text(html)).toMatch(/Hoy Semana Mes Próximos/);
  });

  it('el Dock no duplica la entrada en «Mi agenda» (tiene «Reorganizar con Pixel»)', () => {
    expect(dockVisibleAt('/workspace/w1/agenda')).toBe(false);
    expect(dockVisibleAt('/workspace/w1/tasks')).toBe(true);
  });
});

describe('Mi agenda · Hoy', () => {
  it('durante el día, con hora (los pasados atenuados) y por organizar al final', () => {
    const html = body(agenda());
    const visible = text(html);
    expect(visible.indexOf('Durante el día')).toBeLessThan(visible.indexOf('Con hora'));
    expect(visible.indexOf('Con hora')).toBeLessThan(visible.lastIndexOf('Por organizar'));
    expect(visible.indexOf('Reunión')).toBeLessThan(visible.indexOf('Entrega informe'));
    expect(visible).toContain('Todo el día');
    expect(visible).toContain('Cumpleaños de Ana');
    expect(visible).toContain('Organizado por Pixel');
    expect(visible).toContain('Vence hoy');
    expect(visible).toContain('Pedirle a Pixel que lo organice');
    expect(html).toMatch(
      /aria-label="Compromiso, Clase, 07:00–08:30[^"]*"[^>]*class="[^"]*opacity-60/,
    );
    // Nunca «Mover» directo, ni vocabulario técnico, ni el logo de Google.
    expect(visible).not.toMatch(/\bMover\b|google_event|pixel_managed|task_ref|provider/);
    expect(visible).toContain('Hoy tienes 3 compromisos');
  });

  it('acciones: el bloque de Pixel se reorganiza; un compromiso solo se habla; borradores sin ids', () => {
    expect(itemAction(pixelBlock)).toBe('Reorganizar');
    expect(itemAction(item({}))).toBe('Hablar con Pixel');
    expect(draftForItem(pixelBlock)).toBe('Mueve «Avanzar Pixel» del miércoles 14 de octubre al ');
    expect(draftForItem(item({}))).toBe('Sobre «Reunión» del miércoles 14 de octubre: ');
    expect(draftForItem(pending)).toBe('Quiero trabajar en «Entrega informe» una vez esta semana');
    expect(draftForDay(day('2026-10-21', { label: 'Miércoles 21 de octubre' }))).toBe(
      'Quiero reorganizar el miércoles 21 de octubre: ',
    );
    for (const draft of [draftForItem(pixelBlock), draftForItem(pending)])
      expect(draft).not.toMatch(/evt_|task_|[a-f0-9]{24}/);
  });

  it('el borrador llega al campo de Pixel (el usuario lo envía; nada se envía solo)', () => {
    const html = render(
      <PixelComposer
        placeholder="¿Qué quieres cambiar?"
        onSubmit={() => {}}
        initialText="Quiero reorganizar el miércoles 21: "
      />,
    );
    expect(html).toContain('Quiero reorganizar el miércoles 21: ');
  });
});

describe('Mi agenda · Semana, Mes y Próximos', () => {
  const weekDays = [
    '2026-10-12',
    '2026-10-13',
    '2026-10-14',
    '2026-10-15',
    '2026-10-16',
    '2026-10-17',
    '2026-10-18',
  ].map((date) => day(date, { isToday: date === '2026-10-14', isPast: date < '2026-10-14' }));

  it('semana: 7 columnas en escritorio ancho y día por día en móvil/tablet', () => {
    const html = body(
      agenda({ view: 'week', title: 'Semana del 12 al 18 de octubre', days: weekDays }),
    );
    expect(html).toContain('aria-label="Días de la semana"');
    expect(html).toMatch(/class="hidden gap-2 xl:grid xl:grid-cols-7"/);
    expect(html).toContain('aria-label="Días de la semana, uno por uno"');
    expect(html).toMatch(/class="space-y-8 xl:hidden"/);
    expect(text(html)).toContain('Hablar con Pixel sobre este día');
    expect(text(html)).toContain('Sin compromisos.');
  });

  it('mes: cuadrícula accesible, como mucho 2 títulos y «+N más», puntos en móvil y detalle del día', () => {
    const october = Array.from({ length: 35 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 8, 28 + index)).toISOString().slice(0, 10);
      return day(date, {
        isToday: date === '2026-10-14',
        inRange: date >= '2026-10-01' && date <= '2026-10-31',
      });
    });
    const busy = ['A', 'B', 'C', 'D'].map((title, index) =>
      item({ id: `evt_0000000000000000010${index}`, title }),
    );
    const html = body(
      agenda({
        view: 'month',
        title: 'Octubre 2026',
        days: october,
        items: busy,
        pendingItems: [],
      }),
    );
    expect(html).toContain('role="grid"');
    expect(html.match(/role="gridcell"/g)).toHaveLength(35);
    expect(html).toMatch(
      /aria-pressed="true"[^>]*aria-label="Día 2026-10-14: 4 elementos"|aria-label="Día 2026-10-14: 4 elementos"[^>]*aria-pressed="true"/,
    );
    expect(text(html)).toContain('+2 más');
    expect(html).toContain('sm:hidden');
    // Detalle del día seleccionado (hoy) sin salir de la agenda, con su conversación.
    expect(html).toContain('aria-label="Detalle del Día 2026-10-14"');
    expect(text(html)).toContain('Hablar con Pixel sobre este día');
    // Los días de otros meses no se pueden seleccionar.
    expect(html).toMatch(/disabled=""[^>]*aria-label="Día 2026-09-28/);
  });

  it('próximos: grupos en orden, otro mes incluido y «Ver más»', () => {
    const upcoming = agenda({
      view: 'upcoming',
      title: 'Próximos 90 días',
      navigation: { previous: null, next: null, today: '2026-10-14' },
      days: [],
      groups: ['Esta semana', 'Noviembre', 'Más adelante'],
      items: [
        item({ title: 'Entrega proyecto', group: 'Esta semana' }),
        item({
          id: 'evt_00000000000000000020',
          title: 'Presentación Fondo Emprender',
          date: '2026-11-12',
          group: 'Noviembre',
          dayLabel: 'Jueves 12 de noviembre',
        }),
        item({
          id: 'evt_00000000000000000021',
          title: 'Evento programado',
          date: '2027-01-10',
          group: 'Más adelante',
          dayLabel: 'Domingo 10 de enero',
        }),
      ],
      pendingItems: [],
      horizonDays: 90,
      canExtend: true,
    });
    const visible = text(body(upcoming));
    expect(visible.indexOf('Esta semana')).toBeLessThan(visible.indexOf('Noviembre'));
    expect(visible.indexOf('Noviembre')).toBeLessThan(visible.indexOf('Más adelante'));
    expect(visible).toContain('Jueves 12 de noviembre');
    expect(visible).toContain('Ver más');
    expect(visible).not.toContain('Periodo anterior');
  });
});

describe('Mi agenda · Google sin conectar, caído o por reconectar', () => {
  it('sin conectar: la agenda interna sigue y aparece «Conectar Google Calendar»', () => {
    const visible = text(
      body(
        agenda({
          items: [],
          connection: {
            status: 'requires_auth',
            message: 'Conecta Google Calendar para incluir tus compromisos reales.',
          },
        }),
      ),
    );
    expect(visible).toContain('Conecta Google Calendar para incluir tus compromisos reales.');
    expect(visible).toContain('Conectar Google Calendar');
    expect(visible).toContain('Entrega informe');
  });

  it('Google caído: aviso humano, sin botón de conectar, y lo interno visible', () => {
    const visible = text(
      body(
        agenda({
          connection: {
            status: 'unavailable',
            message:
              'No pude actualizar tus compromisos de Google en este momento. Tu agenda interna sigue disponible.',
          },
        }),
      ),
    );
    expect(visible).toContain('Tu agenda interna sigue disponible');
    expect(visible).not.toContain('Conectar Google Calendar');
    expect(visible).toContain('Entrega informe');
  });

  it('requiere reconectar: «Volver a conectar»', () => {
    const visible = text(
      body(
        agenda({
          connection: {
            status: 'requires_reauth',
            message: 'Necesito volver a conectar Google Calendar para actualizar tu agenda.',
          },
        }),
      ),
    );
    expect(visible).toContain('Volver a conectar');
  });

  it('vacía: «Todavía no hay mucho por mostrar.» con «Organizar mi semana»', () => {
    const visible = text(
      body(agenda({ items: [], pendingItems: [], summary: 'Todavía no hay mucho por mostrar.' })),
    );
    expect(visible).toContain('Todavía no hay mucho por mostrar.');
    expect(visible).toContain('Organizar mi semana');
  });
});

describe('Inicio: «Tu día» y sugerencias', () => {
  it('«Próximos hoy» con lo que queda del día y «Ver agenda completa» → Hoy', () => {
    const html = render(<AgendaTodayPreviewView agenda={agenda()} base={BASE} />);
    const visible = text(html);
    expect(visible).toContain('Próximos hoy');
    expect(visible).toContain('11:00 ◆ Avanzar Pixel');
    expect(visible).not.toContain('Clase');
    expect(visible).toContain('1 pendiente por organizar');
    expect(html).toContain('href="/workspace/w1/agenda?view=today"');
    expect(
      render(
        <AgendaTodayPreviewView agenda={agenda({ items: [], pendingItems: [] })} base={BASE} />,
      ),
    ).toBe('');
  });

  it('con Google Calendar conectado: «Ver mi agenda» (Semana); sin conexión: «Organizar mi semana»', () => {
    expect(personalSuggestions(BASE, true).map((s) => [s.label, s.to ?? null])).toContainEqual([
      'Ver mi agenda',
      '/workspace/w1/agenda?view=week',
    ]);
    expect(personalSuggestions(BASE, true).map((s) => s.label)).not.toContain(
      'Organizar mi semana',
    );
    expect(personalSuggestions(BASE, false).map((s) => s.label)).toContain('Organizar mi semana');
  });
});

describe('Identidad visual', () => {
  it('sin colores sueltos ni «Nuevo evento» ni arrastrar', () => {
    for (const source of [proposalSource, pageSource]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
      expect(source).not.toMatch(/Nuevo evento|draggable|onDrag/);
    }
  });
});

describe('Prompt 20 · tarea ↔ bloque de Pixel', () => {
  it('«Pedirle a Pixel que lo organice» lleva la tarea como contexto controlado; los eventos nunca', () => {
    expect(contextFor(pending)).toEqual({ type: 'task', id: '6ac93cc3a738fe62abe5b039' });
    expect(contextFor(pixelBlock)).toBeUndefined();
    expect(contextFor(item({}))).toBeUndefined();
  });

  it('un bloque de Pixel vinculado a una tarea enlaza con ella', () => {
    const linked = {
      ...pixelBlock,
      link: { type: 'task' as const, id: '6ac93cc3a738fe62abe5b039' },
    };
    const visible = text(body(agenda({ items: [linked], pendingItems: [] })));
    expect(visible).toContain('Organizado por Pixel');
    expect(visible).toContain('Ver tareas');
    expect(visible).not.toContain('Por organizar Pedirle');
  });
});
