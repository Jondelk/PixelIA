import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { AuthPanel } from './AuthForms';
import { AuthLayout } from './AuthLayout';
import { visualKindForNext } from './visualKind';
import { authPagePath, nextAfterAuth } from './redirect';

/** Registro directo en /register (alternativa al modal de la portada). Conserva el destino pedido. */
export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from;
  const next = nextAfterAuth(params.get('next'), from);

  return (
    <AuthLayout kind={visualKindForNext(next)}>
      <AuthPanel
        mode="register"
        onSuccess={() => navigate(next, { replace: true })}
        renderSwitch={(label, className) => (
          <Link to={authPagePath('login', next)} className={className}>
            {label}
          </Link>
        )}
      />
    </AuthLayout>
  );
}
