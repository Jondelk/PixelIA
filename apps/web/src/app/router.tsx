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
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { PixelPage } from '../features/pixel/PixelPage';
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
      { path: '/companies', element: <CompaniesPage />, handle: handle('Empresas') },
      { path: '/companies/new', element: <NewCompanyPage />, handle: handle('Nueva empresa') },
      {
        path: '/company/:companyId',
        element: <CompanyLayout />,
        children: [
          { index: true, element: <CompanyOverviewPage />, handle: handle('Resumen', 'Empresa') },
          { path: 'brand', element: <BrandPage />, handle: handle('ADN de marca', 'Empresa') },
          { path: 'pixel', element: <PixelPage />, handle: handle('Pixel', 'Empresa') },
          { path: 'chat', element: <ChatPage />, handle: handle('Chat', 'Empresa') },
        ],
      },
      { path: '*', element: <NotFoundPage />, handle: handle('No encontrado') },
    ],
  },
]);
