import {
  EXTRACTION_LIMITS,
  ONBOARDING_STEPS,
  type ExtractDocumentsResponse,
  type OnboardingStep,
} from '@pixel/contracts';
import { useId, useState, type DragEvent } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { extractFromDocuments } from '../brand/brandApi';
import { filledLabels, totalFilled, type FilledFields, type MissingField } from './extractionMerge';
import { STEP_META } from './steps';

export interface ImportSummary {
  response: ExtractDocumentsResponse;
  filled: FilledFields;
}

const ACCEPTED = EXTRACTION_LIMITS.accept.split(',');
const MAX_MB = Math.round(EXTRACTION_LIMITS.maxTotalBytes / 1024 / 1024);

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Valida la selección antes de enviarla; devuelve un mensaje si algo no cumple. */
export function validateFiles(files: { name: string; size: number }[]): string | null {
  if (files.length > EXTRACTION_LIMITS.maxFiles) {
    return `Puedes subir hasta ${EXTRACTION_LIMITS.maxFiles} documentos a la vez.`;
  }
  const unsupported = files.find(
    (file) => !ACCEPTED.some((ext) => file.name.toLowerCase().endsWith(ext)),
  );
  if (unsupported)
    return `${unsupported.name}: usa PDF, Word, PowerPoint, Excel, texto o imágenes.`;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > EXTRACTION_LIMITS.maxTotalBytes) {
    return `Los documentos suman ${formatSize(total)}; el máximo es ${MAX_MB} MB.`;
  }
  return null;
}

/**
 * Atajo del onboarding: el usuario sube documentos de su marca y Pixel llena lo que encuentre.
 * La fusión con el formulario la hace el wizard (onExtracted); aquí solo se elige, se envía y se
 * resume el resultado.
 */
export function DocumentImport({
  companyId,
  summary,
  missing,
  onExtracted,
  onGoToStep,
}: {
  companyId: string;
  summary: ImportSummary | null;
  missing: Record<OnboardingStep, MissingField[]>;
  onExtracted: (response: ExtractDocumentsResponse) => void;
  onGoToStep: (step: OnboardingStep) => void;
}) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file);
    }
    setFiles(next);
    setError(validateFiles(next));
  }

  function remove(index: number) {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    setError(validateFiles(next));
  }

  async function read() {
    const invalid = validateFiles(files);
    if (invalid || !files.length) {
      setError(invalid ?? 'Elige al menos un documento.');
      return;
    }
    setReading(true);
    setError(null);
    try {
      onExtracted(await extractFromDocuments(companyId, files));
      setFiles([]);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setReading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  const pendingSteps = ONBOARDING_STEPS.filter((step) => missing[step].length > 0);

  return (
    <section className="mb-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      {summary && !open ? (
        <ImportResult
          summary={summary}
          missing={missing}
          pendingSteps={pendingSteps}
          onGoToStep={onGoToStep}
          onMore={() => setOpen(true)}
        />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-elevated text-fg">
              <Icon name="file" className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold tracking-tight">
                ¿Tienes documentos de tu marca?
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                Sube tu brochure, presentación, manual, página web en PDF o tu logo. Pixel llena lo
                que encuentre y tú revisas y completas lo que falte.
              </p>
            </div>
          </div>
          {!open && (
            <Button variant="secondary" className="shrink-0" onClick={() => setOpen(true)}>
              <Icon name="upload" className="size-4" /> Subir documentos
            </Button>
          )}
        </div>
      )}

      {open && (
        <div className="mt-5 space-y-4">
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={[
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
              dragging ? 'border-fg bg-elevated' : 'border-line-strong hover:bg-elevated',
            ].join(' ')}
          >
            <Icon name="upload" className="size-6 text-muted" />
            <span className="text-sm font-medium text-fg">
              Arrastra los archivos aquí o haz clic para elegirlos
            </span>
            <span className="text-xs text-subtle">
              PDF, Word, PowerPoint, Excel, texto o imágenes · hasta {EXTRACTION_LIMITS.maxFiles}{' '}
              archivos y {MAX_MB} MB en total
            </span>
            <input
              id={inputId}
              type="file"
              multiple
              accept={EXTRACTION_LIMITS.accept}
              className="sr-only"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </label>

          {files.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <Icon name="file" className="size-4 shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-subtle">
                    {formatSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="rounded-md p-1 text-muted hover:bg-elevated hover:text-fg"
                    aria-label={`Quitar ${file.name}`}
                    disabled={reading}
                  >
                    <Icon name="x" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <Alert>{error}</Alert>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-subtle">
              Los documentos no se guardan: Pixel solo los lee para proponerte respuestas.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={reading}>
                Cancelar
              </Button>
              <Button
                onClick={() => void read()}
                loading={reading}
                disabled={!files.length || Boolean(error)}
              >
                {reading ? 'Pixel está leyendo…' : 'Leer documentos'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ImportResult({
  summary,
  missing,
  pendingSteps,
  onGoToStep,
  onMore,
}: {
  summary: ImportSummary;
  missing: Record<OnboardingStep, MissingField[]>;
  pendingSteps: OnboardingStep[];
  onGoToStep: (step: OnboardingStep) => void;
  onMore: () => void;
}) {
  const { response, filled } = summary;
  const count = totalFilled(filled);
  const stepsWithData = ONBOARDING_STEPS.filter((step) => filled[step].length > 0);
  const skipped = response.documents.filter((doc) => doc.status === 'skipped');

  return (
    <div role="status" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">
            Documentos leídos{response.mode === 'demo' ? ' · lectura sin IA' : ''}
          </p>
          <h2 className="mt-2 font-display text-lg font-bold tracking-tight">
            {count > 0
              ? `Pixel completó ${count} ${count === 1 ? 'campo' : 'campos'}. Revísalos antes de guardar.`
              : 'Pixel no encontró información nueva en esos documentos.'}
          </h2>
        </div>
        <Button variant="ghost" className="shrink-0" onClick={onMore}>
          <Icon name="upload" className="size-4" /> Subir más
        </Button>
      </div>

      {stepsWithData.length > 0 && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {stepsWithData.map((step) => (
            <li key={step}>
              <button
                type="button"
                onClick={() => onGoToStep(step)}
                className="flex w-full items-start gap-3 rounded-lg border border-line px-3.5 py-2.5 text-left text-sm hover:bg-elevated"
              >
                <Icon name="check" className="mt-0.5 size-4 shrink-0 text-fg" />
                <span className="min-w-0">
                  <span className="block font-medium text-fg">{STEP_META[step].title}</span>
                  <span className="block truncate text-xs text-muted">
                    {filledLabels(step, filled[step]).join(', ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingSteps.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">
            Te falta completar
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {pendingSteps.map((step) => (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => onGoToStep(step)}
                  className="rounded-md border border-line-strong px-3 py-1 text-[13px] text-fg hover:bg-elevated"
                  title={missing[step].map((m) => m.label).join(', ')}
                >
                  {STEP_META[step].title} · {missing[step].length}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(skipped.length > 0 || response.extraction.notes) && (
        <div className="mt-4 space-y-1.5 text-xs leading-relaxed text-muted">
          {skipped.map((doc) => (
            <p key={doc.name}>
              <span className="text-fg">{doc.name}</span>: {doc.reason}
            </p>
          ))}
          {response.extraction.notes && <p>{response.extraction.notes}</p>}
        </div>
      )}
    </div>
  );
}
