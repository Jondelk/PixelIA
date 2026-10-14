import { useId, type SelectHTMLAttributes } from 'react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** Selector con la misma apariencia que TextField. `onValueChange` recibe el valor tipado. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onValueChange,
  placeholder,
  error,
  hideLabel = false,
  className = '',
  ...props
}: {
  label: string;
  value: T | '';
  options: readonly SelectOption<T>[];
  onValueChange: (value: T | '') => void;
  /** Opción vacía (p. ej. "Sin proyecto"). */
  placeholder?: string;
  error?: string;
  hideLabel?: boolean;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  const id = useId();
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={hideLabel ? 'sr-only' : 'mb-1.5 block text-[13px] font-medium text-muted'}
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value as T | '')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={[
          'w-full rounded-lg border bg-canvas px-3.5 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-focus',
          error ? 'border-alert' : 'border-line-strong focus:border-focus',
        ].join(' ')}
        {...props}
      >
        {placeholder !== undefined && (
          <option value="" className="bg-surface">
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-surface">
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-2 text-xs text-fg">
          <span className="size-1.5 shrink-0 bg-alert" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
