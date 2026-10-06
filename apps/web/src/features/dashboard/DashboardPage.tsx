import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Tu dirección creativa"
        description="Aquí verás tus empresas y el estado de cada Pixel."
      />
      <EmptyState
        icon="dashboard"
        title="Aún no hay actividad"
        description="Cuando crees tu primera empresa y Pixel analice su marca, su estado aparecerá aquí."
        stage="Disponible a partir de la Etapa 4"
      />
    </>
  );
}
