import type { Company } from '@pixel/contracts';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { workspaceBasePath } from '../../app/navigation';
import { OperationsOverview } from '../operations/OperationsOverview';
import { enterpriseOperationsCopy } from '../operations/operationsCopy';

/**
 * "Trabajo de la marca" en el Inicio Enterprise: los mismos contadores y próximos elementos que el
 * Inicio Personal (OperationsOverview), sobre el workspace de la empresa. Solo datos reales: sin
 * recomendaciones de Pixel (no hay Daily Director Enterprise).
 */
export function BrandWorkSection({ company }: { company: Company }) {
  const base = workspaceBasePath(company.workspaceId);
  return (
    <section className="mt-12" aria-labelledby="brand-work-title">
      <BrandWorkHeading base={base} />
      <OperationsOverview
        workspaceId={company.workspaceId}
        base={base}
        copy={enterpriseOperationsCopy(company.name).overview}
      />
    </section>
  );
}

export function BrandWorkHeading({ base }: { base: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">Trabajo</p>
        <h2 id="brand-work-title" className="mt-2 font-display text-xl font-bold tracking-tight">
          Trabajo de la marca
        </h2>
      </div>
      <Link to={`${base}/projects?new`} className={buttonClasses('secondary')}>
        <Icon name="plus" className="size-4" /> Nuevo proyecto
      </Link>
    </div>
  );
}
