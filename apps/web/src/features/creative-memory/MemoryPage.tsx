import type { CreativeMemory } from '@pixel/contracts';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { companyBasePath, workspaceBasePath } from '../../app/navigation';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { TextAreaField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Spinner } from '../../components/Spinner';
import { errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { useWorkspace } from '../workspaces/workspaceContext';
import {
  confirmMemory,
  dismissMemory,
  forgetMemory,
  getMemory,
  listMemories,
  replaceMemory,
} from './memoryApi';
import {
  conflictingActive,
  groupMemories,
  HISTORY_STATUS_TEXT,
  KIND_TITLE,
  originText,
  scopeText,
  type MemoryGroups,
} from './memoryLogic';

/**
 * /workspace/:workspaceId/memory — "Lo que Pixel ha aprendido" (Personal y Enterprise). No es un
 * formulario que haya que alimentar: lo principal es hablar con Pixel ("de ahora en adelante…").
 * Aquí se ve lo aprendido, se confirman o descartan los patrones, se edita y se olvida.
 */
export function MemoryPage() {
  const { overview } = useWorkspace();
  const workspaceId = overview.workspace.id;
  const personal = overview.workspace.type === 'personal';
  const owner = overview.company?.name ?? overview.workspace.name;
  const home = overview.company
    ? companyBasePath(overview.company.id)
    : workspaceBasePath(workspaceId);
  const { state, reload } = useResource(`creative-memories:${workspaceId}`, (signal) =>
    listMemories(workspaceId, 'all', signal),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (memoryId: string, action: () => Promise<unknown>) => {
    setBusyId(memoryId);
    setError(null);
    action()
      .then(reload, (err: unknown) => setError(errorMessage(err)))
      .finally(() => setBusyId(null));
  };

  return (
    <>
      <PageHeader
        eyebrow={personal ? 'Pixel' : 'Marca'}
        title="Lo que Pixel ha aprendido"
        description={`Las preferencias que Pixel tiene en cuenta al proponerte campañas, planes y revisiones${personal ? '' : ` para ${owner}`}. Pixel aprende de tus decisiones, pero nada se vuelve preferencia sin que lo confirmes.`}
      />
      {error && (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      )}
      {state.status === 'loading' && (
        <div className="flex items-center gap-3 text-sm text-muted">
          <Spinner className="size-4" /> Cargando lo que Pixel ha aprendido…
        </div>
      )}
      {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
      {state.status === 'success' && (
        <MemoryView
          groups={groupMemories(state.data)}
          owner={owner}
          personal={personal}
          home={home}
          busyId={busyId}
          onConfirm={(m) => run(m.id, () => confirmMemory(workspaceId, m.id))}
          onDismiss={(m) => run(m.id, () => dismissMemory(workspaceId, m.id))}
          onForget={(m) => run(m.id, () => forgetMemory(workspaceId, m.id))}
          onReplace={(m, text) => run(m.id, () => replaceMemory(workspaceId, m.id, text))}
          why={(m) => <WhyPixelThinks workspaceId={workspaceId} memoryId={m.id} />}
        />
      )}
    </>
  );
}

export interface MemoryViewProps {
  groups: MemoryGroups;
  owner: string;
  personal: boolean;
  home: string;
  busyId: string | null;
  onConfirm: (memory: CreativeMemory) => void;
  onDismiss: (memory: CreativeMemory) => void;
  onForget: (memory: CreativeMemory) => void;
  onReplace: (memory: CreativeMemory, text: string) => void;
  /** "¿Por qué Pixel piensa esto?" (se carga al abrirlo). */
  why: (memory: CreativeMemory) => ReactNode;
}

/** Vista pura (testeable sin red): activas, candidatas e historial. */
export function MemoryView(props: MemoryViewProps) {
  const { groups, owner, personal, home } = props;
  const nothing = !groups.active.length && !groups.candidates.length && !groups.history.length;
  if (nothing) {
    return (
      <EmptyState
        title={`Pixel todavía no ha aprendido nada de ${personal ? 'ti' : owner}`}
        description="Pixel aprende de tus decisiones y de lo que le pidas recordar. Dile, por ejemplo: «De ahora en adelante evita los CTA de urgencia»."
        action={
          <Link to={home} className={buttonClasses('secondary')}>
            Hablar con Pixel
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-10">
      {groups.candidates.length > 0 && (
        <section aria-labelledby="memory-candidates">
          <SectionTitle
            id="memory-candidates"
            title="Pixel ha notado"
            count={groups.candidates.length}
            signal
          />
          <div className="space-y-4">
            {groups.candidates.map((memory) => (
              <CandidateMemoryCard
                key={memory.id}
                memory={memory}
                conflict={conflictingActive(memory, groups.active)}
                {...props}
              />
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="memory-active">
        <SectionTitle
          id="memory-active"
          title="Lo que tiene en cuenta"
          count={groups.active.length}
        />
        {groups.active.length ? (
          <div className="space-y-4">
            {groups.active.map((memory) => (
              <ActiveMemoryCard key={memory.id} memory={memory} {...props} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Aún no hay preferencias confirmadas. Pídeselo a Pixel cuando quieras («de ahora en
            adelante…»).
          </p>
        )}
        <p className="mt-4 text-xs text-subtle">
          Lo que pides en cada momento siempre manda: una preferencia orienta, no encierra.
        </p>
      </section>
      {groups.history.length > 0 && (
        <details className="group rounded-2xl border border-line">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm text-muted hover:text-fg">
            Historial ({groups.history.length})
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {groups.history.map((memory) => (
              <li
                key={memory.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3"
              >
                <span className="text-sm text-muted line-through decoration-line-strong">
                  {memory.statement}
                </span>
                <span className="text-xs text-subtle">{HISTORY_STATUS_TEXT[memory.status]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SectionTitle({
  id,
  title,
  count,
  signal = false,
}: {
  id: string;
  title: string;
  count: number;
  /** El píxel señal (un solo acento por pantalla): las candidatas esperan una decisión. */
  signal?: boolean;
}) {
  return (
    <h2 id={id} className="mb-4 flex items-baseline gap-2 font-display text-base font-bold">
      {signal && <span className="inline-block size-2 self-center bg-signal" aria-hidden />}
      {title} <span className="font-sans text-sm font-normal text-subtle">{count}</span>
    </h2>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] text-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}

function ActiveMemoryCard({
  memory,
  owner,
  personal,
  busyId,
  onForget,
  onReplace,
  why,
}: MemoryViewProps & { memory: CreativeMemory }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'forget'>('view');
  const [text, setText] = useState(memory.statement);
  const busy = busyId === memory.id;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length >= 3) onReplace(memory, text.trim());
  };
  return (
    <article
      className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
      aria-label={memory.statement}
    >
      {KIND_TITLE[memory.kind] && (
        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-subtle">
          {KIND_TITLE[memory.kind]}
        </p>
      )}
      <h3 className="text-base font-semibold leading-snug">{memory.statement}</h3>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <Meta label="Aplica a">{scopeText(memory, owner, personal)}</Meta>
        <Meta label="Origen">{originText(memory)}</Meta>
      </dl>
      {mode === 'edit' && (
        <form onSubmit={submit} className="mt-5 space-y-3" aria-label="Editar preferencia">
          <TextAreaField
            label="Cómo debe recordarlo Pixel"
            value={text}
            maxLength={500}
            onChange={(event) => setText(event.target.value)}
            hint="Se guarda como una preferencia nueva; la anterior queda en el historial."
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy}>
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setMode('view')}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {mode === 'forget' && (
        <div className="mt-5 rounded-xl border border-line-strong p-4">
          <p className="text-sm">
            Voy a dejar de usar esta preferencia: <strong>{memory.statement}</strong>
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button onClick={() => onForget(memory)} loading={busy}>
              Olvidar
            </Button>
            <Button variant="ghost" onClick={() => setMode('view')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {mode === 'view' && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setMode('edit')}>
            <Icon name="pencil" className="size-4" /> Editar
          </Button>
          <Button variant="ghost" onClick={() => setMode('forget')}>
            Olvidar
          </Button>
        </div>
      )}
      {mode === 'view' && memory.evidenceCount > 0 && <WhyToggle>{why(memory)}</WhyToggle>}
    </article>
  );
}

function CandidateMemoryCard({
  memory,
  conflict,
  owner,
  personal,
  busyId,
  onConfirm,
  onDismiss,
  why,
}: MemoryViewProps & { memory: CreativeMemory; conflict: CreativeMemory | null }) {
  const busy = busyId === memory.id;
  return (
    <article
      className="rounded-2xl border border-line-strong bg-surface p-5 sm:p-6"
      aria-label={memory.statement}
    >
      <p className="text-xs uppercase tracking-[0.14em] text-subtle">Pixel ha notado un patrón</p>
      {memory.evidenceSummary && (
        <p className="mt-3 text-sm text-muted">{memory.evidenceSummary}</p>
      )}
      <h3 className="mt-3 text-base font-semibold leading-snug">
        ¿Quieres que recuerde: «{memory.statement}»?
      </h3>
      <p className="mt-2 text-sm text-muted">Aplicaría a: {scopeText(memory, owner, personal)}</p>
      {conflict && (
        <p className="mt-3 text-sm">
          Si lo confirmas, reemplaza a lo que tenía en cuenta: «{conflict.statement}».
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={() => onConfirm(memory)} loading={busy}>
          <Icon name="check" className="size-4" /> Recordar
        </Button>
        <Button variant="secondary" onClick={() => onDismiss(memory)} disabled={busy}>
          No fue intencional
        </Button>
      </div>
      <WhyToggle>{why(memory)}</WhyToggle>
    </article>
  );
}

function WhyToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border-t border-line pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        ¿Por qué Pixel piensa esto?
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Evidencia humana de una memoria (sin ids): "Quitaste una pieza (Historia) de «Plan de junio»". */
function WhyPixelThinks({ workspaceId, memoryId }: { workspaceId: string; memoryId: string }) {
  const { state } = useResource(`creative-memory:${workspaceId}:${memoryId}`, (signal) =>
    getMemory(workspaceId, memoryId, signal),
  );
  if (state.status === 'loading') return <Spinner className="size-4" />;
  if (state.status === 'error') return <Alert>{errorMessage(state.error)}</Alert>;
  return <EvidenceList evidence={state.data.evidence} />;
}

export function EvidenceList({
  evidence,
}: {
  evidence: { description: string; occurredAt: string }[];
}) {
  if (!evidence.length) {
    return <p className="text-sm text-muted">Lo indicaste tú directamente.</p>;
  }
  return (
    <ul className="space-y-1.5 text-sm text-muted">
      {evidence.map((entry, index) => (
        <li key={`${entry.occurredAt}-${index}`}>· {entry.description}</li>
      ))}
    </ul>
  );
}
