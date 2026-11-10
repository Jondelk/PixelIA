import type { Company } from '@pixel/contracts';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { Icon } from '../../components/Icon';
import { workspaceBasePath } from '../../app/navigation';
import { OperationsOverview } from '../operations/OperationsOverview';
import { enterpriseOperationsCopy } from '../operations/operationsCopy';

/**
 * "Trabajo de la marca" en el Inicio Enterprise: los mismos contadores y próximos elementos que el
 * Inicio Personal (OperationsOverview) más las campañas activas, sobre el workspace de la empresa.
 * Solo datos reales: sin recomendaciones de Pixel (no hay Daily Director Enterprise).
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
        showCampaigns
        empty={{
          title: `${company.name} está lista.`,
          text: 'Todavía no hay trabajo en marcha. Dime qué necesitas y lo organizo contigo.',
        }}
      />
    </section>
  );
}

export function BrandWorkHeading({ base }: { base: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">En marcha</p>
        <h2 id="brand-work-title" className="mt-2 font-display text-xl font-bold tracking-tight">
          Trabajo de la marca
        </h2>
      </div>
      {/* PixelCommand es la ruta principal para organizar trabajo; la creación manual sigue en
          Proyectos. */}
      <Link to={`${base}/projects`} className={buttonClasses('ghost')}>
        Ver todo <Icon name="arrowRight" className="size-4" />
      </Link>
    </div>
  );
}
