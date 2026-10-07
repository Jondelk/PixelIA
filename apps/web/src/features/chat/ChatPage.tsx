import { Link } from 'react-router';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { companyBasePath } from '../../app/navigation';
import { companyApiBase } from '../../lib/apiPaths';
import { useResource } from '../../lib/useResource';
import { useCompany } from '../companies/companyContext';
import { loadChatData } from './chatData';
import { ChatStudio } from './ChatStudio';

/** Chat de una empresa (Enterprise). La UI es el ChatStudio compartido con el Pixel Personal. */
export function ChatPage() {
  const { company } = useCompany();
  const ready = Boolean(company.brandDnaVersion);
  const apiBase = companyApiBase(company.id);
  const { state, reload } = useResource(`chat:${company.id}`, (signal) =>
    loadChatData(apiBase, signal),
  );

  if (!ready) {
    return (
      <EmptyState
        title="Pixel aún no conoce esta marca"
        description="Para conversar con su director creativo, la empresa necesita su ADN de marca. Completa el onboarding."
        action={
          <Link
            to={`${companyBasePath(company.id)}/onboarding`}
            className={buttonClasses('primary')}
          >
            Ir al onboarding <Icon name="arrowRight" className="size-4" />
          </Link>
        }
      />
    );
  }
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-fg" /> Preparando la conversación…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={reload} />;

  return (
    <ChatStudio
      key={company.id}
      apiBase={apiBase}
      ownerName={company.name}
      kind="brand"
      pixelHref={`${companyBasePath(company.id)}/pixel`}
      initial={state.data}
    />
  );
}
