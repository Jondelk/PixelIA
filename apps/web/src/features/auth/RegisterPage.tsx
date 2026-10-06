import { PASSWORD_MIN_LENGTH, RegisterInputSchema } from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '../../lib/forms';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './authContext';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = RegisterInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await register(parsed.data);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrors(apiFieldErrors(err));
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h2 className="font-display text-2xl font-semibold tracking-tight">Crear cuenta</h2>
      <p className="mt-2 text-sm text-muted">Empieza a construir el Pixel de tu marca.</p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="Nombre"
          name="name"
          autoComplete="name"
          value={values.name}
          error={errors.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
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
          autoComplete="new-password"
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
          value={values.password}
          error={errors.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Crear cuenta
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-medium text-accent hover:text-accent-soft">
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
