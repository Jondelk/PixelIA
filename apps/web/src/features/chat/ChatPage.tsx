import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { useCompany } from '../companies/companyContext';

export function ChatPage() {
  const { company } = useCompany();
  return (
    <>
      <PageHeader
        eyebrow={company.name}
        title="Chat"
        description="Conversa con el Pixel de esta empresa. Responde con su voz, su criterio y su memoria creativa."
      />
      <EmptyState
        icon="chat"
        title="Aún no hay conversaciones"
        description="El chat se habilita cuando la marca tenga su ADN y su Pixel."
        stage="Etapa 8 · Chat con Pixel"
      />
    </>
  );
}
