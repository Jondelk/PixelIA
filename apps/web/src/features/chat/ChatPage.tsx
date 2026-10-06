import { useParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function ChatPage() {
  const { companyId } = useParams();
  return (
    <>
      <PageHeader
        eyebrow={`Empresa · ${companyId}`}
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
