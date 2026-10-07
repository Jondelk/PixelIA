import { CreateCompanyInputSchema } from '@pixel/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextAreaField, TextField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { companyBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from '../../lib/forms';
import { createCompany, createWorkspaceCompany } from './companiesApi';

export function NewCompanyPage() {
  const navigate = useNavigate();
  // Con ?workspace=<id> la empresa completa un Pixel de empresa que se creó sin ella.
  const workspaceId = useSearchParams()[0].get('workspace') ?? undefined;
  const [values, setValues] = useState({ name: '', industry: '', description: '', logoUrl: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = CreateCompanyInputSchema.safeParse({
      ...values,
      logoUrl: values.logoUrl.trim() || undefined,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const company = workspaceId
        ? await createWorkspaceCompany(workspaceId, parsed.data)
        : await createCompany(parsed.data);
      navigate(companyBasePath(company.id));
    } catch (err) {
      setErrors(apiFieldErrors(err));
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        to="/pixels/new"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-fg"
      >
        <Icon name="arrowLeft" className="size-4" /> Nuevo Pixel
      </Link>
      <PageHeader
        eyebrow="Pixel Enterprise"
        title="Crea una empresa"
        description="Empieza con lo básico. Después, Pixel estudiará el ADN de la marca en el onboarding."
      />

      <form
        className="space-y-5 rounded-2xl border border-line bg-surface p-5 sm:p-8"
        onSubmit={onSubmit}
        noValidate
      >
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="Nombre de la empresa"
          name="name"
          placeholder="Café Tinto"
          value={values.name}
          error={errors.name}
          onChange={(event) => set('name')(event.target.value)}
        />
        <TextField
          label="Sector"
          name="industry"
          placeholder="Café de especialidad"
          value={values.industry}
          error={errors.industry}
          onChange={(event) => set('industry')(event.target.value)}
        />
        <TextAreaField
          label="Descripción (opcional)"
          name="description"
          placeholder="¿Qué hace la empresa y para quién?"
          value={values.description}
          error={errors.description}
          onChange={(event) => set('description')(event.target.value)}
        />
        <TextField
          label="URL del logo (opcional)"
          name="logoUrl"
          type="url"
          placeholder="https://…"
          value={values.logoUrl}
          error={errors.logoUrl}
          onChange={(event) => set('logoUrl')(event.target.value)}
        />
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Link
            to="/dashboard"
            className="inline-flex justify-center px-4 py-2.5 text-sm text-muted hover:text-fg"
          >
            Cancelar
          </Link>
          <Button type="submit" loading={submitting}>
            Crear empresa
          </Button>
        </div>
      </form>
    </div>
  );
}
