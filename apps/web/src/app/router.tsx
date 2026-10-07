import { createBrowserRouter, Navigate } from 'react-router';
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
import { PixelPage } from '../features/pixel/PixelPage';
import { NewPixelPage } from '../features/workspaces/NewPixelPage';
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
  { path: '/', element: <Navigate to="/dashboard" replace /> },
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
        // Entrada única de cada Pixel. Enterprise con empresa redirige a /company/:companyId;
        // Personal vive aquí: Inicio, Mi ADN (personal/dna), Mi Pixel (pixel) y Chat (chat).
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
