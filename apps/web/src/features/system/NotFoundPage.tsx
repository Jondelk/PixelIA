import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
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
      <Link to="/dashboard" className={buttonClasses('secondary')}>
        Ir al dashboard <Icon name="arrowRight" className="size-4" />
      </Link>
    </>
  );
}
