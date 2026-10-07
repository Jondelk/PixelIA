import type { Conversation, Message } from '@pixel/contracts';
import { MESSAGE_MAX_LENGTH } from '@pixel/contracts';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { BrandLogo } from '../../components/BrandLogo';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Pixi } from '../../components/Pixi';
import { errorMessage, errorReason } from '../../lib/api';
import { AvatarStage } from '../avatar3d/AvatarStage';
import type { AvatarState } from '../avatar3d/pose';
import { createConversation, getMessages, sendMessage } from './chatApi';
import type { ChatData } from './chatData';
import { MessageText } from './MessageText';
import { RevealingText } from './RevealingText';

/*
 * Estudio de chat compartido por Enterprise y Personal (Pixel Core): mismas rutas de API bajo
 * `apiBase`, mismo avatar 3D y misma UI. Solo cambian los textos según `kind` (la marca habla en
 * «nosotros»; el Pixel Personal, en «tú»). El contexto lo pone la API según el workspace.
 */

export type ChatKind = 'brand' | 'personal';

const SUGGESTIONS: Record<ChatKind, string[]> = {
  brand: [
    'Necesito una campaña para redes.',
    'Queremos lanzar un nuevo producto.',
    'Dame ideas de contenido para esta semana.',
    '¿Cómo debería aparecer nuestro personaje en redes?',
  ],
  personal: [
    '¿Qué debería publicar esta semana?',
    'Ayúdame a ordenar las ideas de un proyecto.',
    'Tengo dos propuestas y no sé cuál elegir.',
    '¿Cómo muestro mejor mi trabajo?',
  ],
};

const STATE_LABEL: Record<AvatarState, string> = {
  idle: 'Listo para crear contigo',
  listening: 'Escuchando…',
  thinking: 'Pensando…',
  speaking: 'Respondiendo…',
  happy: '¡Listo!',
};

/** Motivos con los que la API dice que el Pixel aún no tiene contexto para conversar. */
const NOT_CONFIGURED = new Set([
  'personal_context_not_configured',
  'brand_dna_missing',
  'enterprise_company_missing',
]);

export interface ChatStudioProps {
  apiBase: string;
  /** Nombre de la marca o de la persona. */
  ownerName: string;
  kind: ChatKind;
  /** Dónde se crea el personaje si aún no existe. */
  pixelHref: string;
  initial: ChatData;
  /** La API respondió que falta el contexto (409): la página decide adónde llevar. */
  onNotConfigured?: () => void;
}

export function ChatStudio({
  apiBase,
  ownerName,
  kind,
  pixelHref,
  initial,
  onNotConfigured,
}: ChatStudioProps) {
  const [conversations, setConversations] = useState(initial.conversations);
  const [conversation, setConversation] = useState<Conversation | null>(
    initial.conversations[0] ?? null,
  );
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [pending, setPending] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const avatarState: AvatarState = pending
    ? 'thinking'
    : speakingId
      ? 'speaking'
      : focused && draft.trim()
        ? 'listening'
        : 'idle';

  const scrollToEnd = () => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  };
  useEffect(scrollToEnd, [messages.length, pending]);

  async function submit(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    setError(null);
    setPending(content);
    setDraft('');
    try {
      let active = conversation;
      if (!active) {
        active = await createConversation(apiBase);
        setConversation(active);
      }
      const result = await sendMessage(apiBase, active.id, content);
      setMessages((current) => [...current, result.userMessage, result.pixelMessage]);
      setSpeakingId(result.pixelMessage.id);
      setConversation(result.conversation);
      setConversations((current) => [
        result.conversation,
        ...current.filter((c) => c.id !== result.conversation.id),
      ]);
    } catch (err) {
      const reason = errorReason(err);
      if (onNotConfigured && reason && NOT_CONFIGURED.has(reason)) {
        onNotConfigured();
        return;
      }
      setError(errorMessage(err));
      setDraft(content);
    } finally {
      setPending(null);
    }
  }

  async function openConversation(id: string) {
    if (id === conversation?.id) return;
    setSwitching(true);
    setError(null);
    try {
      const result = await getMessages(apiBase, id);
      setConversation(result.conversation);
      setMessages(result.messages);
      setSpeakingId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSwitching(false);
    }
  }

  function startNew() {
    setConversation(null);
    setMessages([]);
    setSpeakingId(null);
    setError(null);
    input.current?.focus();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit(draft);
    }
  }

  const avatar = initial.avatar;
  const isDemo = messages.some((m) => m.meta?.mode === 'demo');

  return (
    <div className="-mx-4 -my-10 flex h-[calc(100dvh-4rem)] flex-col sm:-mx-6 lg:mx-0 lg:my-0 lg:grid lg:h-[calc(100dvh-12rem)] lg:grid-cols-[minmax(280px,360px)_1fr] lg:gap-5">
      {/* Avatar: zona compacta arriba en móvil, columna lateral en escritorio */}
      <aside className="flex shrink-0 items-center gap-4 border-b border-line bg-surface px-4 lg:flex-col lg:justify-center lg:rounded-3xl lg:border lg:px-0">
        <div className="relative h-36 w-32 shrink-0 lg:h-[min(28rem,60vh)] lg:w-full">
          {avatar ? (
            <AvatarStage
              avatar={avatar}
              state={avatarState}
              interactive={false}
              className="!h-full"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Pixi size={96} />
            </div>
          )}
        </div>
        <div className="min-w-0 lg:px-6 lg:pb-8 lg:text-center">
          <p className="font-display text-base font-bold tracking-tight lg:text-lg">
            {avatar?.name ?? (kind === 'personal' ? 'Tu personaje' : `Personaje de ${ownerName}`)}
          </p>
          <p
            className="mt-1 flex items-center gap-2 text-xs text-muted lg:justify-center"
            role="status"
            aria-live="polite"
          >
            <span
              className={`size-1.5 ${avatarState === 'idle' ? 'bg-subtle' : 'animate-pulse bg-fg'}`}
              aria-hidden="true"
            />
            {STATE_LABEL[avatarState]}
          </p>
          {!avatar && (
            <Link
              to={pixelHref}
              className="mt-2 inline-block text-xs text-muted underline decoration-line-strong underline-offset-4 hover:text-fg"
            >
              {kind === 'personal' ? 'Crear tu personaje 3D' : 'Crear su personaje 3D'}
            </Link>
          )}
        </div>
      </aside>

      {/* Chat */}
      <section className="flex min-h-0 flex-1 flex-col bg-surface lg:rounded-3xl lg:border lg:border-line">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            {conversations.length > 0 ? (
              <select
                value={conversation?.id ?? ''}
                onChange={(event) => void openConversation(event.target.value)}
                disabled={switching || Boolean(pending)}
                aria-label="Conversación"
                className="w-full max-w-sm truncate rounded-lg border border-line bg-canvas px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-focus"
              >
                {!conversation && <option value="">Nueva conversación</option>}
                {conversations.map((c) => (
                  <option key={c.id} value={c.id} className="bg-canvas">
                    {c.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted">Nueva conversación</p>
            )}
          </div>
          <Button
            variant="ghost"
            onClick={startNew}
            disabled={Boolean(pending)}
            aria-label="Nueva conversación"
          >
            <Icon name="plus" className="size-4" /> <span className="hidden sm:inline">Nueva</span>
          </Button>
        </header>

        <div
          ref={scroller}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6"
          aria-live="polite"
        >
          {messages.length === 0 && !pending && (
            <div className="mx-auto max-w-lg py-10 text-center">
              <p className="font-display text-xl font-bold tracking-tight">
                ¿En qué trabajamos hoy?
              </p>
              <p className="mt-3 text-sm text-muted">
                {kind === 'personal'
                  ? 'Soy tu director creativo personal. Cuéntame en qué estás y lo pensamos con tu criterio.'
                  : `Soy el director creativo de ${ownerName}. Cuéntame qué necesitas y lo pensamos con nuestro criterio.`}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS[kind].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void submit(suggestion)}
                    className="rounded-md border border-line-strong px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-fg hover:text-fg"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-on-brand">
                  {message.content}
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex gap-3">
                <BrandLogo variant="isotipo" height={24} decorative className="mt-0.5" />
                <div className="min-w-0 max-w-[90%] text-sm leading-relaxed text-fg">
                  {message.id === speakingId ? (
                    <RevealingText
                      text={message.content}
                      onDone={() => setSpeakingId(null)}
                      onProgress={scrollToEnd}
                    />
                  ) : (
                    <MessageText text={message.content} />
                  )}
                </div>
              </div>
            ),
          )}

          {pending && (
            <>
              <div className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-on-brand opacity-70">
                  {pending}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted" role="status">
                <BrandLogo variant="isotipo" height={24} decorative />
                <span className="flex gap-1.5" aria-label="Pixel está pensando">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-pulse bg-fg"
                      style={{ animationDelay: `${i * 200}ms` }}
                    />
                  ))}
                </span>
              </div>
            </>
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t border-line p-3 sm:p-4">
          {error && (
            <div className="mb-3">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-canvas p-2 focus-within:border-focus">
            <textarea
              ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={1}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder={`Escribe a tu director creativo…`}
              aria-label="Mensaje para Pixel"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <Button
              type="submit"
              className="!px-3"
              disabled={!draft.trim()}
              loading={Boolean(pending)}
              aria-label="Enviar"
            >
              {!pending && <Icon name="arrowRight" className="size-4" />}
            </Button>
          </div>
          <p className="mt-2 flex justify-between px-1 text-[11px] text-subtle">
            <span>
              {isDemo
                ? 'Modo demo: respuestas generadas sin IA a partir del ADN.'
                : 'Enter para enviar · Shift + Enter para salto de línea'}
            </span>
            {draft.length > MESSAGE_MAX_LENGTH - 500 && (
              <span>
                {draft.length}/{MESSAGE_MAX_LENGTH}
              </span>
            )}
          </p>
        </form>
      </section>
    </div>
  );
}
