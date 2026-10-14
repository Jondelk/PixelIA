import type { PixelPlanAction } from '@pixel/contracts';
import { Icon } from '../../components/Icon';

/*
 * Lo que REALMENTE pasó con cada acción (Prompt 18): ✓ verificada, ✕ falló, – no se hizo porque
 * falló aquello de lo que dependía. Nunca un «todo listo» que no esté respaldado por un resultado.
 * Lo comparten el Inicio y el Pixel Dock (el mismo PixelCommandPanel).
 */

const STATUS_TEXT: Record<PixelPlanAction['status'], string> = {
  success: 'Hecho',
  failed: 'No se pudo',
  skipped: 'No se hizo',
  pending: 'Pendiente',
};

const KIND_TEXT: Partial<Record<PixelPlanAction['kind'], string>> = {
  project: 'Proyecto',
  task: 'Tarea',
};

export function ActionResults({ actions }: { actions: PixelPlanAction[] }) {
  if (!actions.length || actions.every((action) => action.status === 'pending')) return null;
  const done = actions.filter((action) => action.status === 'success').length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {done} de {actions.length} {actions.length === 1 ? 'acción hecha' : 'acciones hechas'} y
        comprobadas.
      </p>
      <ul aria-label="Resultado de cada acción" className="space-y-1.5 text-sm">
        {actions.map((action) => (
          <li key={action.id} className="flex items-start gap-2.5">
            <span
              className={[
                'mt-0.5 grid size-4 shrink-0 place-items-center',
                action.status === 'success' ? 'text-fg' : 'text-subtle',
              ].join(' ')}
              aria-hidden="true"
            >
              {action.status === 'success' ? (
                <Icon name="check" className="size-4" />
              ) : action.status === 'failed' ? (
                <Icon name="x" className="size-3.5" />
              ) : (
                <span className="block h-px w-2.5 bg-current" />
              )}
            </span>
            <span className="min-w-0">
              <span className="sr-only">{STATUS_TEXT[action.status]}: </span>
              <span className={action.status === 'success' ? 'text-fg' : 'text-muted'}>
                {KIND_TEXT[action.kind] ? `${KIND_TEXT[action.kind]} · ` : ''}
                {action.label}
              </span>
              {action.error && <span className="block text-xs text-subtle">{action.error}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
