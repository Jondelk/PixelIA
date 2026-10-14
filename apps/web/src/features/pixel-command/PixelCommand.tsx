import type { PixelCommand as PixelCommandDTO, PixelCommandSource } from '@pixel/contracts';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { PixelThinking } from '../content-planner/PixelThinking';
import { PixelComposer, type ComposerSuggestion } from '../presence/PixelComposer';
import { usePixelPresence } from '../presence/presenceContext';
import {
  commandPhase,
  confirmLabel,
  createdResources,
  presenceAfterCommand,
  spokenFor,
  resourceLink,
  THINKING_COPY,
  type CommandPhase,
} from './commandLogic';
import {
  adjustPixelCommand,
  cancelPixelCommand,
  confirmPixelCommand,
  overrideGuardianPreflight,
  sendPixelCommand,
} from './pixelCommandApi';
import { preflightBlocks, preflightOverridable } from '../guardian/guardianLogic';
import { ActionResults } from './ActionResults';
import { GuardianPreflight } from './GuardianPreflight';
import { PixelProposalCard } from './PixelProposalCard';

type ContextHint = {
  intent?: 'create_campaign' | 'plan_content';
  campaignId?: string;
  /** Pixel Dock: el recurso que el usuario está viendo (el backend lo valida). */
  resource?: { type: 'campaign' | 'content_plan' | 'project' | 'content_item'; id: string };
};

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
  suggestions,
  thinkingAvatar = 'focus',
}: {
  workspaceId: string;
  /** Base de rutas web del workspace (para enlazar lo creado). */
  base: string;
  title?: string;
  placeholder?: string;
  /** La pantalla desde la que se escribe (Campañas, Plan de contenido): orienta una frase ambigua. */
  contextHint?: ContextHint;
  onCompleted?: (command: PixelCommandDTO) => void;
  /** Inicios de frase (máximo 4) que rellenan el campo: nunca saltan a un formulario. */
  suggestions?: ComposerSuggestion[];
  /**
   * 'none' cuando la pantalla ya muestra al Pixel (Inicio, Dock): un solo runtime 3D por pantalla;
   * el estado lo comunica ese avatar y aquí queda una línea de estado honesta.
   */
  thinkingAvatar?: 'focus' | 'none';
}) {
  const presence = usePixelPresence();
  const [command, setCommand] = useState<PixelCommandDTO | null>(null);
  const [pending, setPending] = useState<'send' | 'adjust' | 'confirm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  async function run(kind: 'send' | 'adjust' | 'confirm', action: () => Promise<PixelCommandDTO>) {
    setPending(kind);
    setError(null);
    presence.think();
    try {
      const next = await action();
      setCommand(next);
      setAdjusting(false);
      reflectPresence(next);
      if (next.status === 'completed' || next.status === 'partial') onCompleted?.(next);
    } catch (err) {
      setError(errorMessage(err));
      presence.fail();
    } finally {
      setPending(null);
    }
  }

  /**
   * El resultado se refleja en la presencia: éxito al organizar, aviso si el Guardian detectó algo,
   * error si falló. En una sesión de voz, Pixel dice la versión corta (la UI muestra el detalle).
   * Hablar nunca confirma nada: «Organizar» sigue siendo un botón.
   */
  function reflectPresence(next: PixelCommandDTO) {
    presence.send(presenceAfterCommand(next));
    presence.say(spokenFor(next));
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
    presence.stopSpeaking();
    try {
      setCommand(await cancelPixelCommand(workspaceId, command.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const continueAnyway = () =>
    command && run('adjust', () => overrideGuardianPreflight(workspaceId, command.id));
  const reset = () => {
    presence.stopSpeaking();
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
      thinking={(copy) =>
        thinkingAvatar === 'none' ? (
          <ThinkingLine copy={copy} />
        ) : (
          <PixelThinking workspaceId={workspaceId} copy={copy} />
        )
      }
      suggestions={suggestions}
      voiceSession={presence.voiceSession}
      speaking={presence.state === 'speaking'}
      onStopSpeaking={presence.stopSpeaking}
      onExitVoice={presence.endVoiceSession}
      onSend={send}
      onAdjust={adjust}
      onStartAdjust={() => setAdjusting(true)}
      onConfirm={confirm}
      onCancel={cancel}
      onReset={reset}
      onGuardianOverride={continueAnyway}
    />
  );
}

type ThinkingCopy = { title: string; description: string };

/** Estado honesto sin avatar (la pantalla ya muestra al Pixel): sin progreso inventado. */
function ThinkingLine({ copy }: { copy: ThinkingCopy }) {
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-line bg-surface p-5">
      <p className="font-display text-base font-bold">{copy.title}</p>
      <p className="mt-1 text-sm text-muted">{copy.description}</p>
    </div>
  );
}

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
  onGuardianOverride,
  suggestions,
  voiceSession = false,
  speaking = false,
  onStopSpeaking,
  onExitVoice,
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
  /** "Continuar de todas formas" ante un BLOCK creativo del Guardian. */
  onGuardianOverride?: () => void;
  suggestions?: ComposerSuggestion[];
  voiceSession?: boolean;
  speaking?: boolean;
  onStopSpeaking?: () => void;
  onExitVoice?: () => void;
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
          <PixelComposer placeholder={placeholder} onSubmit={onSend} suggestions={suggestions} />
        </>
      )}

      {(speaking || voiceSession) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {speaking && onStopSpeaking && (
            <Button variant="secondary" onClick={onStopSpeaking}>
              <Icon name="stop" className="size-3.5" /> Dejar de hablar
            </Button>
          )}
          {voiceSession && onExitVoice && (
            <button
              type="button"
              onClick={onExitVoice}
              className="underline-offset-4 hover:text-fg hover:underline"
            >
              Seguir solo por texto
            </button>
          )}
        </div>
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
            <PixelComposer
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
                  <PixelComposer
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
                <div className="space-y-4">
                  {command.guardian && <GuardianPreflight guardian={command.guardian} />}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={onConfirm} disabled={preflightBlocks(command.guardian)}>
                      <Icon name="check" className="size-4" /> {confirmLabel(command.plan)}
                    </Button>
                    {command.guardian &&
                      preflightOverridable(command.guardian) &&
                      onGuardianOverride && (
                        <Button variant="secondary" onClick={onGuardianOverride}>
                          Continuar de todas formas
                        </Button>
                      )}
                    <Button variant="secondary" onClick={onStartAdjust}>
                      <Icon name="pencil" className="size-4" /> Ajustar
                    </Button>
                    <Button variant="ghost" onClick={onCancel}>
                      Cancelar
                    </Button>
                  </div>
                  {preflightBlocks(command.guardian) && (
                    <p className="text-xs text-muted">
                      Resuélvelo con «Ajustar» antes de organizar
                      {command.guardian && preflightOverridable(command.guardian)
                        ? ', o continúa de todas formas si es una decisión consciente'
                        : ''}
                      .
                    </p>
                  )}
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
            {command.plan && <ActionResults actions={command.plan.actions} />}
            {/* Solo enlaces a recursos verificados (lo que no se comprobó no se enlaza). */}
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

/** Compatibilidad: la entrada es el PixelComposer compartido (texto + voz). */
export const PixelRequestInput = PixelComposer;
