import type { AgendaDay, AgendaItem, AgendaView } from '@pixel/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import {
  AGENDA_LEGEND,
  contextFor,
  AGENDA_MARKS,
  continuesFrom,
  dotsFor,
  draftForDay,
  draftForItem,
  itemAction,
  itemAriaLabel,
  itemsOn,
} from './agendaLogic';

/*
 * Las cuatro escalas de «Mi agenda» (Prompt 20). Cada una responde una pregunta distinta y tiene su
 * propia forma: Hoy (lista cronológica), Semana (columnas o día a día), Mes (cuadrícula de carga
 * con detalle del día) y Próximos (grupos). Nada se edita aquí: cada acción abre una conversación
 * con Pixel (propuesta → confirmación).
 */

export type AskPixel = (draft: string, resource?: { type: 'task'; id: string }) => void;

export function AgendaLegend() {
  return (
    <ul aria-label="Leyenda" className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
      {AGENDA_LEGEND.map((entry) => (
        <li key={entry.kind} className="flex items-center gap-1.5">
          <Mark kind={entry.kind} />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

function Mark({ kind }: { kind: AgendaItem['kind'] }) {
  return (
    <span aria-hidden="true" className={kind === 'pixel_block' ? 'text-fg' : 'text-subtle'}>
      {AGENDA_MARKS[kind]}
    </span>
  );
}

const Eyebrow = ({ children }: { children: string }) => (
  <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">{children}</h3>
);

/** Un elemento: hora, marca, título, tipo y su acción (siempre por Pixel). */
function ItemRow({
  item,
  base,
  onAsk,
  compact = false,
}: {
  item: AgendaItem;
  base: string;
  onAsk: AskPixel;
  compact?: boolean;
}) {
  const when = item.timeLabel ?? item.statusLabel ?? 'Fecha límite';
  const link = item.link
    ? item.link.type === 'project'
      ? `${base}/projects/${encodeURIComponent(item.link.id)}`
      : `${base}/tasks`
    : null;
  return (
    <li
      aria-label={itemAriaLabel(item)}
      className={[
        'rounded-lg border border-line px-3 py-2.5',
        item.status === 'past' ? 'opacity-60' : '',
        item.kind === 'pixel_block' ? 'border-line-strong' : '',
      ].join(' ')}
    >
      <div className={compact ? 'space-y-0.5' : 'flex flex-wrap items-baseline gap-x-3 gap-y-1'}>
        <span
          className={[
            'shrink-0 text-xs tabular-nums text-muted',
            compact ? 'block' : 'w-24 sm:w-28',
          ].join(' ')}
        >
          {when}
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <Mark kind={item.kind} />
          <span className="min-w-0 break-words hyphens-auto text-sm text-fg">{item.title}</span>
        </span>
      </div>
      <div
        className={[
          'mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs',
          compact ? '' : 'sm:pl-31',
        ].join(' ')}
      >
        <span className="text-subtle">
          {item.kindLabel}
          {item.statusLabel && item.timeLabel ? ` · ${item.statusLabel}` : ''}
        </span>
        {!compact && (
          <button
            type="button"
            onClick={() => onAsk(draftForItem(item), contextFor(item))}
            className="text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            {itemAction(item)}
          </button>
        )}
        {!compact && link && (
          <Link to={link} className="text-muted underline-offset-4 hover:text-fg hover:underline">
            {item.link?.type === 'project' ? 'Ver proyecto' : 'Ver tareas'}
          </Link>
        )}
      </div>
    </li>
  );
}

function ItemList({
  items,
  base,
  onAsk,
  label,
}: {
  items: AgendaItem[];
  base: string;
  onAsk: AskPixel;
  label: string;
}) {
  if (!items.length) return null;
  return (
    <ul aria-label={label} className="mt-3 space-y-2">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} base={base} onAsk={onAsk} />
      ))}
    </ul>
  );
}

/* ---------- Hoy ---------- */

export function TodayView({
  agenda,
  base,
  onAsk,
}: {
  agenda: AgendaView;
  base: string;
  onAsk: AskPixel;
}) {
  const allDay = agenda.items.filter((item) => item.allDay || item.deadline);
  const timed = agenda.items.filter((item) => !item.allDay && !item.deadline);
  return (
    <div className="space-y-8">
      {allDay.length > 0 && (
        <section aria-label="Durante el día">
          <Eyebrow>Durante el día</Eyebrow>
          <ItemList items={allDay} base={base} onAsk={onAsk} label="Todo el día" />
        </section>
      )}
      {timed.length > 0 && (
        <section aria-label="Con hora">
          <Eyebrow>Con hora</Eyebrow>
          <ItemList items={timed} base={base} onAsk={onAsk} label="Elementos con hora" />
        </section>
      )}
      {agenda.pendingItems.length > 0 && (
        <section aria-label="Por organizar">
          <Eyebrow>Por organizar</Eyebrow>
          <ItemList
            items={agenda.pendingItems}
            base={base}
            onAsk={onAsk}
            label="Pendientes sin horario"
          />
        </section>
      )}
    </div>
  );
}

/* ---------- Semana ---------- */

export function WeekView({
  agenda,
  base,
  onAsk,
}: {
  agenda: AgendaView;
  base: string;
  onAsk: AskPixel;
}) {
  return (
    <>
      {/* Escritorio ancho: 7 columnas compactas. */}
      <ol aria-label="Días de la semana" className="hidden gap-2 xl:grid xl:grid-cols-7">
        {agenda.days.map((day) => {
          const items = [
            ...itemsOn(day.date, agenda.items),
            ...itemsOn(day.date, agenda.pendingItems),
          ];
          return (
            <li
              key={day.date}
              aria-label={`${day.label}: ${items.length} ${items.length === 1 ? 'elemento' : 'elementos'}`}
              className={[
                'min-h-40 rounded-xl border p-2.5',
                day.isToday ? 'border-fg' : 'border-line',
                day.isPast ? 'opacity-60' : '',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-fg">{day.shortLabel}</span>
                {day.isToday && <span className="text-[11px] text-muted">Hoy</span>}
              </div>
              <ul className="mt-2 space-y-1.5">
                {items.map((item) => (
                  <ItemRow key={item.id} item={item} base={base} onAsk={onAsk} compact />
                ))}
              </ul>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => onAsk(draftForDay(day))}
                  className="mt-2 text-[11px] text-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  Reorganizar este día
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {/* Tablet y móvil: día por día, en vertical (nunca 7 columnas en 390 px). */}
      <ol aria-label="Días de la semana, uno por uno" className="space-y-8 xl:hidden">
        {agenda.days.map((day) => (
          <DaySection key={day.date} day={day} agenda={agenda} base={base} onAsk={onAsk} />
        ))}
      </ol>
    </>
  );
}

function DaySection({
  day,
  agenda,
  base,
  onAsk,
}: {
  day: AgendaDay;
  agenda: AgendaView;
  base: string;
  onAsk: AskPixel;
}) {
  const items = itemsOn(day.date, agenda.items);
  const pending = itemsOn(day.date, agenda.pendingItems);
  return (
    <li className={day.isPast ? 'opacity-70' : ''}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <h3 className="font-display text-base font-bold tracking-tight">
          {day.label}
          {day.isToday && (
            <span className="ml-2 font-sans text-xs font-normal text-muted">Hoy</span>
          )}
        </h3>
        {(items.length > 0 || pending.length > 0) && (
          <button
            type="button"
            onClick={() => onAsk(draftForDay(day))}
            className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Hablar con Pixel sobre este día
          </button>
        )}
      </div>
      {!items.length && !pending.length ? (
        <p className="mt-3 text-sm text-subtle">Sin compromisos.</p>
      ) : (
        <>
          <ItemList items={items} base={base} onAsk={onAsk} label={`Agenda del ${day.label}`} />
          <ItemList
            items={pending}
            base={base}
            onAsk={onAsk}
            label={`Por organizar el ${day.label}`}
          />
        </>
      )}
    </li>
  );
}

/* ---------- Mes ---------- */

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function MonthView({
  agenda,
  base,
  onAsk,
}: {
  agenda: AgendaView;
  base: string;
  onAsk: AskPixel;
}) {
  const all = [...agenda.items, ...agenda.pendingItems];
  const initial =
    agenda.days.find((day) => day.isToday && day.inRange)?.date ??
    agenda.days.find((day) => day.inRange && itemsOn(day.date, all).length)?.date ??
    null;
  const [selected, setSelected] = useState<string | null>(initial);
  const selectedDay = agenda.days.find((day) => day.date === selected) ?? null;

  return (
    <div className="space-y-6">
      <div role="grid" aria-label={agenda.title} className="rounded-2xl border border-line">
        <div role="row" className="grid grid-cols-7 border-b border-line">
          {WEEKDAYS.map((weekday) => (
            <span
              key={weekday}
              role="columnheader"
              className="px-2 py-2 text-center text-[11px] uppercase tracking-[0.14em] text-subtle"
            >
              {weekday}
            </span>
          ))}
        </div>
        {Array.from({ length: agenda.days.length / 7 }, (_, week) => (
          <div key={week} role="row" className="grid grid-cols-7">
            {agenda.days.slice(week * 7, week * 7 + 7).map((day) => {
              const items = itemsOn(day.date, all);
              const isSelected = day.date === selected;
              return (
                <div
                  key={day.date}
                  role="gridcell"
                  className="min-w-0 border-b border-r border-line last:border-r-0"
                >
                  <button
                    type="button"
                    disabled={!day.inRange}
                    aria-pressed={isSelected}
                    aria-label={`${day.label}: ${items.length ? `${items.length} ${items.length === 1 ? 'elemento' : 'elementos'}` : 'sin elementos'}`}
                    onClick={() => setSelected(day.date)}
                    className={[
                      'flex h-16 w-full flex-col items-start gap-1 p-1.5 text-left transition-colors sm:h-24 sm:p-2',
                      day.inRange ? 'hover:bg-elevated' : 'cursor-default opacity-30',
                      isSelected ? 'bg-elevated' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'grid size-6 place-items-center rounded-full text-xs tabular-nums',
                        day.isToday ? 'bg-fg font-semibold text-canvas' : 'text-fg',
                      ].join(' ')}
                    >
                      {day.dayNumber}
                    </span>
                    {/* Móvil: puntos; escritorio: hasta 2 títulos y «+N más». */}
                    <span className="flex gap-1 sm:hidden" aria-hidden="true">
                      {dotsFor(items).map((kind) => (
                        <span key={kind} className="text-[10px] leading-none text-muted">
                          {AGENDA_MARKS[kind]}
                        </span>
                      ))}
                    </span>
                    <span className="hidden w-full min-w-0 space-y-0.5 sm:block" aria-hidden="true">
                      {items.slice(0, 2).map((item) => (
                        <span key={item.id} className="block truncate text-[11px] text-muted">
                          {AGENDA_MARKS[item.kind]} {continuesFrom(item, day.date) ? '↳ ' : ''}
                          {item.title}
                        </span>
                      ))}
                      {items.length > 2 && (
                        <span className="block text-[11px] text-subtle">
                          +{items.length - 2} más
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selectedDay && (
        <section
          aria-label={`Detalle del ${selectedDay.label}`}
          className="rounded-2xl border border-line-strong bg-surface p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-display text-lg font-bold tracking-tight">{selectedDay.label}</h3>
            <button
              type="button"
              onClick={() => onAsk(draftForDay(selectedDay))}
              className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
            >
              Hablar con Pixel sobre este día
            </button>
          </div>
          {itemsOn(selectedDay.date, all).length ? (
            <>
              <ItemList
                items={itemsOn(selectedDay.date, agenda.items)}
                base={base}
                onAsk={onAsk}
                label="Agenda del día"
              />
              <ItemList
                items={itemsOn(selectedDay.date, agenda.pendingItems)}
                base={base}
                onAsk={onAsk}
                label="Por organizar ese día"
              />
            </>
          ) : (
            <p className="mt-3 text-sm text-subtle">Nada este día.</p>
          )}
        </section>
      )}
    </div>
  );
}

/* ---------- Próximos ---------- */

export function UpcomingView({
  agenda,
  onAsk,
  onMore,
}: {
  agenda: AgendaView;
  onAsk: AskPixel;
  onMore: () => void;
}) {
  const all = [...agenda.items, ...agenda.pendingItems].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return (
    <div className="space-y-10">
      {agenda.groups.map((group) => {
        const items = all.filter((item) => item.group === group);
        return (
          <section key={group} aria-label={group}>
            <h3 className="font-display text-base font-bold tracking-tight">{group}</h3>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
              {items.map((item) => (
                <li
                  key={item.id}
                  aria-label={itemAriaLabel(item)}
                  className={[
                    'flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3',
                    item.status === 'past' ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <span className="w-full text-xs uppercase tracking-[0.12em] text-subtle sm:w-40">
                    {item.dayLabel}
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <Mark kind={item.kind} />
                    <span className="min-w-0 break-words text-sm text-fg">{item.title}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {item.kindLabel}
                    {item.timeLabel
                      ? ` · ${item.timeLabel}`
                      : item.statusLabel
                        ? ` · ${item.statusLabel}`
                        : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAsk(draftForItem(item), contextFor(item))}
                    className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
                  >
                    {itemAction(item)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {agenda.canExtend && (
        <button
          type="button"
          onClick={onMore}
          className="inline-flex items-center gap-2 text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Ver más <Icon name="arrowRight" className="size-3.5" />
        </button>
      )}
    </div>
  );
}
