import {
  LoginInputSchema,
  PASSWORD_MIN_LENGTH,
  RegisterInputSchema,
  type LoginInput,
  type RegisterInput,
} from '@pixel/contracts';
import { useState, type FormEvent, type ReactNode, type Ref } from 'react';
import type { z } from 'zod';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '../../lib/forms';
import { useAuth } from './authContext';
import type { AuthMode } from './redirect';

/** Clases del enlace o botón que cambia entre "Iniciar sesión" y "Crear cuenta". */
export const AUTH_SWITCH_CLASSES =
  'font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg';

const COPY: Record<
  AuthMode,
  { title: string; description: string; question: string; other: string }
> = {
  login: {
    title: 'Iniciar sesión',
    description: 'Entra para seguir creando con Pixel.',
    question: '¿Aún no tienes cuenta?',
    other: 'Crear cuenta',
  },
  register: {
    title: 'Crear cuenta',
    description: 'Empieza con tu Pixel Personal o con el Pixel de tu empresa.',
    question: '¿Ya tienes cuenta?',
    other: 'Inicia sesión',
  },
};

/**
 * Contenido de acceso compartido por las páginas /login y /register y por el modal de la portada:
 * título, formulario real (mismas validaciones y errores) y el cambio al otro modo.
 * `renderSwitch` decide si el cambio es un enlace (páginas) o un botón (modal).
 */
export function AuthPanel({
  mode,
  titleId,
  onSuccess,
  renderSwitch,
  firstFieldRef,
}: {
  mode: AuthMode;
  titleId?: string;
  onSuccess: () => void;
  renderSwitch: (label: string, className: string) => ReactNode;
  firstFieldRef?: Ref<HTMLInputElement>;
}) {
  const copy = COPY[mode];
  return (
    <>
      <h2 id={titleId} className="font-display text-2xl font-bold tracking-tight">
        {copy.title}
      </h2>
      <p className="mt-2 text-sm text-muted">{copy.description}</p>
      {mode === 'login' ? (
        <LoginForm onSuccess={onSuccess} firstFieldRef={firstFieldRef} />
      ) : (
        <RegisterForm onSuccess={onSuccess} firstFieldRef={firstFieldRef} />
      )}
      <p className="mt-8 text-center text-sm text-muted">
        {copy.question} {renderSwitch(copy.other, AUTH_SWITCH_CLASSES)}
      </p>
    </>
  );
}

function useAuthSubmit<T>(
  schema: z.ZodType<T>,
  submit: (data: T) => Promise<unknown>,
  onSuccess: () => void,
) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handle(event: FormEvent<HTMLFormElement>, values: unknown) {
    event.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await submit(parsed.data);
      onSuccess();
    } catch (err) {
      setErrors(apiFieldErrors(err));
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return { errors, formError, submitting, handle };
}

function LoginForm({
  onSuccess,
  firstFieldRef,
}: {
  onSuccess: () => void;
  firstFieldRef?: Ref<HTMLInputElement>;
}) {
  const { login } = useAuth();
  const [values, setValues] = useState<LoginInput>({ email: '', password: '' });
  const { errors, formError, submitting, handle } = useAuthSubmit(
    LoginInputSchema,
    login,
    onSuccess,
  );

  return (
    <form className="mt-8 space-y-5" onSubmit={(event) => void handle(event, values)} noValidate>
      {formError && <Alert>{formError}</Alert>}
      <TextField
        ref={firstFieldRef}
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
  );
}

function RegisterForm({
  onSuccess,
  firstFieldRef,
}: {
  onSuccess: () => void;
  firstFieldRef?: Ref<HTMLInputElement>;
}) {
  const { register } = useAuth();
  const [values, setValues] = useState<RegisterInput>({ name: '', email: '', password: '' });
  const { errors, formError, submitting, handle } = useAuthSubmit(
    RegisterInputSchema,
    register,
    onSuccess,
  );

  return (
    <form className="mt-8 space-y-5" onSubmit={(event) => void handle(event, values)} noValidate>
      {formError && <Alert>{formError}</Alert>}
      <TextField
        ref={firstFieldRef}
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
  );
}
