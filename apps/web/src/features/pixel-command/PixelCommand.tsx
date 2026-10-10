import type { PixelCommand as PixelCommandDTO, PixelCommandSource } from '@pixel/contracts';
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { PixelThinking } from '../content-planner/PixelThinking';
import {
  commandPhase,
  createdResources,
  resourceLink,
  THINKING_COPY,
  type CommandPhase,
} from './commandLogic';
import {
  adjustPixelCommand,
  cancelPixelCommand,
  confirmPixelCommand,
  sendPixelCommand,
} from './pixelCommandApi';
import { PixelProposalCard } from './PixelProposalCard';

type ContextHint = { intent?: 'create_campaign' | 'plan_content'; campaignId?: string };

/**
 * La entrada principal de Pixel (zero-entry-first, docs/PIXEL-COMMAND.md): el usuario dice qué
 * necesita; Pixel entiende, usa lo que ya sabe, pregunta solo lo indispensable y propone. Nada se
 * crea hasta "Organizar". Los formularios siguen existiendo como opciones avanzadas.
 */
export function PixelCommand({
  workspaceId,
  base,
  title = '¿Qué necesitas hacer?',
  placeholder = 'Cuéntale a Pixel…',
  contextHint,
  onCompleted,
}: {
  workspaceId: string;
  /** Base de rutas web del workspace (para enlazar lo creado). */
  base: string;
  title?: string;
  placeholder?: string;
  /** La pantalla desde la que se escribe (Campañas, Plan de contenido): orienta una frase ambigua. */
  contextHint?: ContextHint;
  onCompleted?: (command: PixelCommandDTO) => void;
}) {
  const [command, setCommand] = useState<PixelCommandDTO | null>(null);
  const [pending, setPending] = useState<'send' | 'adjust' | 'confirm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  async function run(kind: 'send' | 'adjust' | 'confirm', action: () => Promise<PixelCommandDTO>) {
    setPending(kind);
    setError(null);
    try {
      const next = await action();
      setCommand(next);
      setAdjusting(false);
      if (next.status === 'completed' || next.status === 'partial') onCompleted?.(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  const send = (text: string, source: PixelCommandSource) =>
    run('send', () => sendPixelCommand(workspaceId, { request: text, source, contextHint }));
  const adjust = (text: string, source: PixelCommandSource) =>
    command && run('adjust', () => adjustPixelCommand(workspaceId, command.id, text, source));
  const confirm = () =>
    command?.plan &&
    run(
      'confirm',
      async () =>
        (await confirmPixelCommand(workspaceId, command.id, command.plan!.revision)).command,
    );
  const cancel = async () => {
    if (!command) return;
    setError(null);
    try {
      setCommand(await cancelPixelCommand(workspaceId, command.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const reset = () => {
    setCommand(null);
    setAdjusting(false);
    setError(null);
  };

  return (
    <PixelCommandPanel
      phase={commandPhase(command, pending)}
      command={command}
      title={title}
      placeholder={placeholder}
      base={base}
      error={error}
      adjusting={adjusting}
      thinking={(copy) => <PixelThinking workspaceId={workspaceId} copy={copy} />}
      onSend={send}
      onAdjust={adjust}
      onStartAdjust={() => setAdjusting(true)}
      onConfirm={confirm}
      onCancel={cancel}
      onReset={reset}
    />
  );
}

type ThinkingCopy = { title: string; description: string };

/** Vista sin estado (testeable): pinta cada fase de la conversación. */
export function PixelCommandPanel({
  phase,
  command,
  title,
  placeholder,
  base,
  error,
  adjusting,
  thinking,
  onSend,
  onAdjust,
  onStartAdjust,
  onConfirm,
  onCancel,
  onReset,
}: {
  phase: CommandPhase;
  command: PixelCommandDTO | null;
  title: string;
  placeholder: string;
  base: string;
  error: string | null;
  adjusting: boolean;
  thinking: (copy: ThinkingCopy) => ReactNode;
  onSend: (text: string, source: PixelCommandSource) => void;
  onAdjust: (text: string, source: PixelCommandSource) => void;
  onStartAdjust: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const showInput = phase === 'idle' || phase === 'cancelled';
  return (
    <section aria-label="Pixel" className="space-y-5">
      <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>

      {showInput && (
        <>
          {phase === 'cancelled' && command?.reply && (
            <p className="text-sm text-muted">{command.reply}</p>
          )}
          <PixelRequestInput placeholder={placeholder} onSubmit={onSend} />
        </>
      )}

      {!showInput && command && phase !== 'interpreting' && (
        <p className="text-sm text-subtle">
          <span className="text-muted">Tú:</span> {command.request}
        </p>
      )}

      {phase === 'interpreting' && thinking(THINKING_COPY.interpreting)}
      {phase === 'executing' && thinking(THINKING_COPY.executing)}

      {(phase === 'question' ||
        (phase === 'adjusting' && command?.status === 'needs_information')) &&
        command && (
          <div className="space-y-4 rounded-2xl border border-line-strong bg-surface p-6 sm:p-8">
            <p className="text-[15px] leading-relaxed text-fg">{command.question}</p>
            <PixelRequestInput
              placeholder="Responde a Pixel…"
              busy={phase === 'adjusting'}
              onSubmit={onAdjust}
              compact
            />
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        )}

      {(phase === 'proposal' || (phase === 'adjusting' && command?.status === 'proposed')) &&
        command?.plan && (
          <PixelProposalCard
            plan={command.plan}
            actions={
              adjusting || phase === 'adjusting' ? (
                <div className="space-y-3">
                  <PixelRequestInput
                    placeholder="¿Qué cambio? Por ejemplo: «solo Instagram, sin Stories»"
                    busy={phase === 'adjusting'}
                    onSubmit={onAdjust}
                    compact
                  />
                  <Button variant="ghost" onClick={onCancel}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={onConfirm}>
                    <Icon name="check" className="size-4" /> Organizar
                  </Button>
                  <Button variant="secondary" onClick={onStartAdjust}>
                    <Icon name="pencil" className="size-4" /> Ajustar
                  </Button>
                  <Button variant="ghost" onClick={onCancel}>
                    Cancelar
                  </Button>
                </div>
              )
            }
          />
        )}

      {(phase === 'answered' ||
        phase === 'completed' ||
        phase === 'partial' ||
        phase === 'failed') &&
        command && (
          <div
            role="status"
            className="space-y-5 rounded-2xl border border-line-strong bg-surface p-6 sm:p-8"
          >
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-fg">
              {command.reply}
            </p>
            {createdResources(command).length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Lo que Pixel creó">
                {createdResources(command).map((resource) => (
                  <li key={`${resource.kind}:${resource.id}`}>
                    <Link
                      to={resourceLink(base, resource)}
                      className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
                    >
                      <span className="truncate">{resource.label}</span>
                      <Icon name="arrowRight" className="size-3.5 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3">
              {(phase === 'partial' || phase === 'failed') && (
                <Button onClick={onConfirm}>Reintentar</Button>
              )}
              <Button variant="secondary" onClick={onReset}>
                Nueva solicitud
              </Button>
            </div>
          </div>
        )}

      {error && <Alert>{error}</Alert>}
    </section>
  );
}

/**
 * Campo de la solicitud. Entrega el texto con su origen (`source`): hoy `text`; una transcripción
 * de voz llegará por el mismo `onSubmit` con `source: 'voice'`, sin cambiar PixelCommand.
 */
export function PixelRequestInput({
  placeholder,
  onSubmit,
  busy = false,
  compact = false,
}: {
  placeholder: string;
  onSubmit: (text: string, source: PixelCommandSource) => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    onSubmit(value, 'text');
    setText('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 rounded-2xl border border-line-strong bg-elevated p-2 focus-within:border-focus"
    >
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={compact ? 1 : 2}
        maxLength={2000}
        className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-fg placeholder:text-subtle focus:outline-none"
      />
      <Button type="submit" loading={busy} disabled={!text.trim()} aria-label="Enviar a Pixel">
        <Icon name="arrowRight" className="size-4" />
      </Button>
    </form>
  );
}
