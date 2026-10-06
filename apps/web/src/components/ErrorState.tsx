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
      className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] px-6 py-10 text-center"
    >
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-6" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </section>
  );
}
