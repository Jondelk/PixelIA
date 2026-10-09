import { AVATAR_STATE_LABELS, AVATAR_STATES, type AvatarState } from './pose';

/** Controlador temporal (solo en desarrollo) para activar estados de animación a mano. */
export function AvatarStateControls({
  value,
  onChange,
}: {
  value: AvatarState;
  onChange: (state: AvatarState) => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
        Dev · estado de animación
      </p>
      <div role="radiogroup" aria-label="Estado de animación" className="grid grid-cols-5 gap-1">
        {AVATAR_STATES.map((state) => (
          <button
            key={state}
            type="button"
            role="radio"
            aria-checked={state === value}
            onClick={() => onChange(state)}
            className={[
              'rounded-md px-1 py-1.5 text-[11px] transition-colors sm:text-xs',
              state === value
                ? 'bg-elevated font-medium text-fg'
                : 'text-muted hover:bg-elevated hover:text-fg',
            ].join(' ')}
          >
            {AVATAR_STATE_LABELS[state]}
          </button>
        ))}
      </div>
    </div>
  );
}
