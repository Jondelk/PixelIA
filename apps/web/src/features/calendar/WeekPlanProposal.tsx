import type { WeekPlanView } from '@pixel/contracts';
import { groupBlocksByDay } from './calendarLogic';

/*
 * La semana propuesta (Prompt 19): compacta, agrupada por día, sin un calendario completo. Lo
 * estimado se marca; lo que no cupo se dice con su motivo. Nada está guardado todavía.
 */
export function WeekPlanProposal({ plan }: { plan: WeekPlanView }) {
  const days = groupBlocksByDay(plan);
  return (
    <div className="min-w-0 space-y-5">
      <ol aria-label="Bloques propuestos" className="space-y-4">
        {days.map((day) => (
          <li key={day.label} className="min-w-0">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
              {day.label}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {day.blocks.map((block) => (
                <li
                  key={block.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border border-line px-3 py-2 text-sm"
                >
                  <span className="font-medium tabular-nums text-fg">{block.timeLabel}</span>
                  <span className="min-w-0 break-words text-fg">{block.title}</span>
                  {block.estimated && (
                    <span className="text-xs text-subtle">duración estimada</span>
                  )}
                  {block.reason && (
                    <span className="basis-full text-xs text-muted">{block.reason}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {plan.unscheduled.length > 0 && (
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
            No cupo
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {plan.unscheduled.map((item, index) => (
              <li key={`${item.title}:${index}`} className="break-words">
                {item.title}: {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-subtle">
        Zona horaria: {plan.timezone}. Antes de guardar, Pixel vuelve a comprobar que cada hueco
        sigue libre.
      </p>
    </div>
  );
}
