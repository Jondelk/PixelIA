import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { AuthPanel } from './AuthForms';
import { AuthLayout } from './AuthLayout';
import { visualKindForNext } from './visualKind';
import { authPagePath, nextAfterAuth } from './redirect';

/** Acceso directo a /login (alternativa al modal de la portada). Conserva el destino pedido. */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from;
  const next = nextAfterAuth(params.get('next'), from);

  return (
    <AuthLayout kind={visualKindForNext(next)}>
      <AuthPanel
        mode="login"
        onSuccess={() => navigate(next, { replace: true })}
        renderSwitch={(label, className) => (
          <Link to={authPagePath('register', next)} className={className}>
            {label}
          </Link>
        )}
      />
    </AuthLayout>
  );
}
