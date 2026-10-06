import { Link } from 'react-router';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader
        eyebrow="404"
        title="Esta página no existe"
        description="Revisa la dirección o vuelve al dashboard."
      />
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-elevated px-4 py-2 text-sm hover:border-accent/50"
      >
        Ir al dashboard <Icon name="arrowRight" className="size-4 text-accent" />
      </Link>
    </>
  );
}
