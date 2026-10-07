import { errorMessage } from '../lib/api';
import { Button } from './Button';

/** Error al cargar datos, con opción de reintentar. */
export function ErrorState({
  error,
  onRetry,
  title = 'No pudimos cargar la información',
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-line-strong bg-surface px-6 py-12 text-center"
    >
      <span className="mx-auto mb-6 block size-2.5 bg-alert" aria-hidden="true" />
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-6" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </section>
  );
}
