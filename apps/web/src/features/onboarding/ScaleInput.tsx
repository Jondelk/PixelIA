import { useId } from 'react';

/** Escala de 1 a 5 con etiqueta para cada nivel. */
export function ScaleInput({
  label,
  value,
  onChange,
  levels,
  error,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  levels: readonly string[];
  error?: string;
}) {
  const id = useId();
  return (
    <div>
      <p id={id} className="mb-1.5 text-[13px] font-medium text-muted">
        {label}: <span className="text-fg">{levels[value - 1]}</span>
      </p>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-5 gap-1.5">
        {levels.map((levelLabel, index) => {
          const level = index + 1;
          const active = level <= value;
          return (
            <button
              key={levelLabel}
              type="button"
              role="radio"
              aria-checked={level === value}
              aria-label={levelLabel}
              title={levelLabel}
              onClick={() => onChange(level)}
              className={[
                'h-9 rounded-md border text-xs transition-colors',
                level === value
                  ? 'border-accent bg-accent/20 text-fg'
                  : active
                    ? 'border-accent/30 bg-accent/[0.08] text-muted'
                    : 'border-line-strong text-subtle hover:border-accent/40',
              ].join(' ')}
            >
              {level}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-subtle">
        <span>{levels[0]}</span>
        <span>{levels[levels.length - 1]}</span>
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
