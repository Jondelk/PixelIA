import { useId, type InputHTMLAttributes, type Ref, type TextareaHTMLAttributes } from 'react';

const CONTROL =
  'w-full rounded-lg border bg-canvas px-3.5 py-2.5 text-sm text-fg placeholder:text-subtle transition-colors focus:outline-none focus:ring-1 focus:ring-focus';

function controlClasses(error?: string) {
  return `${CONTROL} ${error ? 'border-alert' : 'border-line-strong focus:border-focus'}`;
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
}

function FieldFrame({
  id,
  label,
  error,
  hint,
  children,
}: FieldProps & { id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
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

export function TextField({
  label,
  error,
  hint,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        className={controlClasses(error)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      />
    </FieldFrame>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        className={`${controlClasses(error)} min-h-28 resize-y`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      />
    </FieldFrame>
  );
}
