import { useId, useState, type KeyboardEvent } from 'react';
import { Icon } from '../../components/Icon';

interface TagInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: readonly string[];
  placeholder?: string;
  hint?: string;
  error?: string;
  max?: number;
}

const same = (a: string, b: string) => a.toLocaleLowerCase('es') === b.toLocaleLowerCase('es');

/** Lista de valores cortos: elige sugerencias o escribe los tuyos (Enter o coma para añadir). */
export function TagInput({
  label,
  values,
  onChange,
  suggestions = [],
  placeholder = 'Escribe y pulsa Enter',
  hint,
  error,
  max = 12,
}: TagInputProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const full = values.length >= max;

  const add = (raw: string) => {
    const value = raw.trim().slice(0, 120);
    if (!value || full || values.some((item) => same(item, value))) return;
    onChange([...values, value]);
  };
  const remove = (value: string) => onChange(values.filter((item) => item !== value));
  const toggle = (value: string) => {
    const existing = values.find((item) => same(item, value));
    if (existing) remove(existing);
    else add(value);
  };

  const commitDraft = () => {
    draft.split(',').forEach((part) => add(part));
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Backspace' && !draft && values.length) {
      remove(values[values.length - 1]!);
    }
  };

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-muted">
        {label}
      </label>
      <div
        className={[
          'flex flex-wrap items-center gap-1.5 rounded-lg border bg-canvas p-1.5 transition-colors focus-within:ring-1 focus-within:ring-focus',
          error ? 'border-alert' : 'border-line-strong focus-within:border-focus',
        ].join(' ')}
      >
        {values.map((value, index) => (
          <span
            key={value}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-line-strong bg-elevated py-1 pl-2.5 pr-1 text-[13px] text-fg"
          >
            {index < 3 && values.length > 3 && (
              <span className="text-[10px] font-semibold text-subtle">{index + 1}</span>
            )}
            <span className="truncate">{value}</span>
            <button
              type="button"
              onClick={() => remove(value)}
              className="rounded p-0.5 text-subtle hover:bg-line hover:text-fg"
              aria-label={`Quitar ${value}`}
            >
              <Icon name="x" className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={full}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commitDraft}
          placeholder={full ? `Máximo ${max}` : placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="min-w-32 flex-1 bg-transparent px-2 py-1.5 text-sm text-fg placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label={`Sugerencias para ${label}`}>
          {suggestions.map((suggestion) => {
            const selected = values.some((item) => same(item, suggestion));
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => toggle(suggestion)}
                aria-pressed={selected}
                disabled={!selected && full}
                className={[
                  'rounded-md border px-3 py-1 text-xs transition-colors disabled:opacity-40',
                  selected
                    ? 'border-brand bg-brand text-on-brand'
                    : 'border-line-strong text-muted hover:border-fg hover:text-fg',
                ].join(' ')}
              >
                {selected ? '✓ ' : '+ '}
                {suggestion}
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-2 text-xs text-fg">
          <span className="size-1.5 shrink-0 bg-alert" aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
