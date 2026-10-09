import { createBrowserRouter } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { PublicOnly, RequireAuth } from '../features/auth/RouteGuards';
import { BrandPage } from '../features/brand/BrandPage';
import { ChatPage } from '../features/chat/ChatPage';
import { CompaniesPage } from '../features/companies/CompaniesPage';
import { CompanyLayout } from '../features/companies/CompanyLayout';
import { CompanyOverviewPage } from '../features/companies/CompanyOverviewPage';
import { NewCompanyPage } from '../features/companies/NewCompanyPage';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { PersonalDnaPage } from '../features/personal/PersonalDnaPage';
import { PersonalOnboardingPage } from '../features/personal/PersonalOnboardingPage';
import { PersonalOnly } from '../features/personal/PersonalOnly';
import { ContentPlannerPage } from '../features/content-planner/ContentPlannerPage';
import { ContentPlanPage } from '../features/content-planner/ContentPlanPage';
import { ContentPage } from '../features/operations/ContentPage';
import { ProjectDetailPage } from '../features/operations/ProjectDetailPage';
import { ProjectsPage } from '../features/operations/ProjectsPage';
import { TasksPage } from '../features/operations/TasksPage';
import { PixelPage } from '../features/pixel/PixelPage';
import { FeatureOnly } from '../features/workspaces/FeatureOnly';
import { NewPixelPage } from '../features/workspaces/NewPixelPage';
import { PixelStartPage } from '../features/workspaces/PixelStartPage';
import { ExploreDetailPage } from '../features/public/ExploreDetailPage';
import { ExplorePage } from '../features/public/ExplorePage';
import { PublicLayout } from '../features/public/PublicLayout';
import { WelcomePage } from '../features/public/WelcomePage';
import { WorkspaceHomePage } from '../features/workspaces/WorkspaceHomePage';
import { WorkspaceLayout } from '../features/workspaces/WorkspaceLayout';
import { NotFoundPage } from '../features/system/NotFoundPage';
import { AppShell } from './AppShell';
import type { RouteHandle } from './navigation';

const handle = (title: string, section: RouteHandle['section'] = 'General'): RouteHandle => ({
  title,
  section,
});

export const router = createBrowserRouter([
  // Entrada pública: bienvenida (solo visitantes) y Explorar (cualquiera). El acceso se abre como
  // modal desde aquí; /login y /register siguen funcionando como alternativa directa.
  {
    element: <PublicLayout />,
    children: [
      {
        path: '/',
        element: (
          <PublicOnly>
            <WelcomePage />
          </PublicOnly>
        ),
      },
      { path: '/explore', element: <ExplorePage /> },
      { path: '/explore/personal', element: <ExploreDetailPage kind="personal" /> },
      { path: '/explore/enterprise', element: <ExploreDetailPage kind="enterprise" /> },
    ],
  },
  {
    path: '/login',
    element: (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    ),
  },
  {
    path: '/register',
    element: (
      <PublicOnly>
        <RegisterPage />
      </PublicOnly>
    ),
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: '/dashboard', element: <DashboardPage />, handle: handle('Tus Pixels') },
      { path: '/pixels/new', element: <NewPixelPage />, handle: handle('Nuevo Pixel') },
      {
        // Retoma la intención elegida en Explorar tras iniciar sesión o crear la cuenta.
        path: '/pixels/start',
        element: <PixelStartPage />,
        handle: handle('Tu Pixel'),
      },
      {
        // Entrada única de cada Pixel. Personal vive aquí entero. Enterprise con empresa vive aquí
        // solo en Operations (Proyectos, Tareas, Contenido); el resto redirige a /company/:companyId.
        path: '/workspace/:workspaceId',
        element: <WorkspaceLayout />,
        children: [
          { index: true, element: <WorkspaceHomePage />, handle: handle('Inicio', 'Pixel') },
          {
            path: 'chat',
            element: <WorkspaceHomePage section="chat" />,
            handle: handle('Chat', 'Pixel'),
          },
          {
            path: 'pixel',
            element: <WorkspaceHomePage section="pixel" />,
            handle: handle('Personaje', 'Pixel'),
          },
          // Solo Pixel Personal (en un workspace enterprise redirige a su inicio).
          {
            path: 'personal/onboarding',
            element: (
              <PersonalOnly>
                <PersonalOnboardingPage />
              </PersonalOnly>
            ),
            handle: handle('Onboarding personal', 'Pixel'),
          },
          {
            path: 'personal/dna',
            element: (
              <PersonalOnly>
                <PersonalDnaPage />
              </PersonalOnly>
            ),
            handle: handle('Mi ADN', 'Pixel'),
          },
          // Operations: compartidas por Personal y Enterprise (capacidades de contracts).
          {
            path: 'projects',
            element: (
              <FeatureOnly feature="projects">
                <ProjectsPage />
              </FeatureOnly>
            ),
            handle: handle('Proyectos', 'Trabajo'),
          },
          {
            path: 'projects/:projectId',
            element: (
              <FeatureOnly feature="projects">
                <ProjectDetailPage />
              </FeatureOnly>
            ),
            handle: handle('Proyecto', 'Trabajo'),
          },
          {
            path: 'tasks',
            element: (
              <FeatureOnly feature="tasks">
                <TasksPage />
              </FeatureOnly>
            ),
            handle: handle('Tareas', 'Trabajo'),
          },
          {
            path: 'content',
            element: (
              <FeatureOnly feature="content">
                <ContentPage />
              </FeatureOnly>
            ),
            handle: handle('Contenido', 'Trabajo'),
          },
          // Content Planner: generación con Pixel solo en Personal (capacidad contentPlanner).
          {
            path: 'content-planner',
            element: (
              <FeatureOnly feature="contentPlanner">
                <ContentPlannerPage />
              </FeatureOnly>
            ),
            handle: handle('Plan de contenido', 'Trabajo'),
          },
          {
            path: 'content-planner/:planId',
            element: (
              <FeatureOnly feature="contentPlanner">
                <ContentPlanPage />
              </FeatureOnly>
            ),
            handle: handle('Plan de contenido', 'Trabajo'),
          },
        ],
      },
      { path: '/companies', element: <CompaniesPage />, handle: handle('Empresas') },
      { path: '/companies/new', element: <NewCompanyPage />, handle: handle('Nueva empresa') },
      {
        path: '/company/:companyId',
        element: <CompanyLayout />,
        children: [
          { index: true, element: <CompanyOverviewPage />, handle: handle('Resumen', 'Empresa') },
          {
            path: 'onboarding',
            element: <OnboardingPage />,
            handle: handle('Onboarding de marca', 'Empresa'),
          },
          { path: 'brand', element: <BrandPage />, handle: handle('ADN de marca', 'Empresa') },
          {
            path: 'pixel',
            element: <PixelPage />,
            handle: handle('Personaje de la marca', 'Empresa'),
          },
          { path: 'chat', element: <ChatPage />, handle: handle('Chat', 'Empresa') },
        ],
      },
      { path: '*', element: <NotFoundPage />, handle: handle('No encontrado') },
    ],
  },
]);
