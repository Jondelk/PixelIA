import { LoginInputSchema } from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '../../lib/forms';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './authContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = LoginInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data);
      navigate(from, { replace: true });
    } catch (err) {
      setErrors(apiFieldErrors(err));
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h2 className="font-display text-2xl font-semibold tracking-tight">Iniciar sesión</h2>
      <p className="mt-2 text-sm text-muted">Entra para hablar con los Pixels de tus marcas.</p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={values.email}
          error={errors.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
        />
        <TextField
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          value={values.password}
          error={errors.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Entrar
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        ¿Aún no tienes cuenta?{' '}
        <Link to="/register" className="font-medium text-accent hover:text-accent-soft">
          Crear cuenta
        </Link>
      </p>
    </AuthLayout>
  );
}
