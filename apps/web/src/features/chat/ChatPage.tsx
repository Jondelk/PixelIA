import type { AvatarProfile, Conversation, Message } from '@pixel/contracts';
import { MESSAGE_MAX_LENGTH } from '@pixel/contracts';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/Icon';
import { PixelMark } from '../../components/PixelMark';
import { Spinner } from '../../components/Spinner';
import { companyBasePath } from '../../app/navigation';
import { errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { AvatarStage } from '../avatar3d/AvatarStage';
import type { AvatarState } from '../avatar3d/pose';
import { useCompany } from '../companies/companyContext';
import { getAvatar } from '../pixel/avatarApi';
import { createConversation, getMessages, listConversations, sendMessage } from './chatApi';
import { MessageText } from './MessageText';
import { RevealingText } from './RevealingText';

const SUGGESTIONS = [
  'Necesito una campaña para redes.',
  'Queremos lanzar un nuevo producto.',
  'Dame ideas de contenido para esta semana.',
  '¿Cómo debería aparecer nuestro personaje en redes?',
];

const STATE_LABEL: Record<AvatarState, string> = {
  idle: 'Listo para crear contigo',
  listening: 'Escuchando…',
  thinking: 'Pensando…',
  speaking: 'Respondiendo…',
  happy: '¡Listo!',
};

interface ChatData {
  avatar: AvatarProfile | null;
  conversations: Conversation[];
  messages: Message[];
}

export function ChatPage() {
  const { company } = useCompany();
  const ready = Boolean(company.brandDnaVersion);
  const { state, reload } = useResource(`chat:${company.id}`, async (signal): Promise<ChatData> => {
    const [avatar, conversations] = await Promise.all([
      getAvatar(company.id, signal).then((res) => res.avatar),
      listConversations(company.id, signal),
    ]);
    const latest = conversations[0];
    const messages = latest ? (await getMessages(company.id, latest.id, signal)).messages : [];
    return { avatar, conversations, messages };
  });

  if (!ready) {
    return (
      <EmptyState
        icon="chat"
        title="Pixel aún no conoce esta marca"
        description="Para conversar con su director creativo, la empresa necesita su ADN de marca. Completa el onboarding."
        action={
          <Link
            to={`${companyBasePath(company.id)}/onboarding`}
            className={buttonClasses('primary')}
          >
            Ir al onboarding <Icon name="arrowRight" className="size-4" />
          </Link>
        }
      />
    );
  }
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-muted" role="status">
        <Spinner className="size-5 text-accent" /> Preparando la conversación…
      </div>
    );
  }
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={reload} />;

  return (
    <ChatStudio
      key={company.id}
      companyId={company.id}
      companyName={company.name}
      initial={state.data}
    />
  );
}

function ChatStudio({
  companyId,
  companyName,
  initial,
}: {
  companyId: string;
  companyName: string;
  initial: ChatData;
}) {
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
        active = await createConversation(companyId);
        setConversation(active);
      }
      const result = await sendMessage(companyId, active.id, content);
      setMessages((current) => [...current, result.userMessage, result.pixelMessage]);
      setSpeakingId(result.pixelMessage.id);
      setConversation(result.conversation);
      setConversations((current) => [
        result.conversation,
        ...current.filter((c) => c.id !== result.conversation.id),
      ]);
    } catch (err) {
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
      const result = await getMessages(companyId, id);
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
    <div className="-mx-4 -my-8 flex h-[calc(100dvh-4rem)] flex-col sm:-mx-6 lg:mx-0 lg:my-0 lg:grid lg:h-[calc(100dvh-10rem)] lg:grid-cols-[minmax(280px,360px)_1fr] lg:gap-5">
      {/* Avatar: zona compacta arriba en móvil, columna lateral en escritorio */}
      <aside className="relative flex shrink-0 items-center gap-4 border-b border-line bg-surface px-4 lg:flex-col lg:justify-center lg:rounded-3xl lg:border lg:px-0">
        <div
          className="bg-grid pointer-events-none absolute inset-0 hidden lg:block"
          aria-hidden="true"
        />
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
              <PixelMark className="size-14 opacity-80 lg:size-24" />
            </div>
          )}
        </div>
        <div className="relative min-w-0 lg:px-6 lg:pb-8 lg:text-center">
          <p className="font-display text-base font-semibold tracking-tight lg:text-lg">
            {avatar?.name ?? `Pixel de ${companyName}`}
          </p>
          <p
            className="mt-1 flex items-center gap-2 text-xs text-muted lg:justify-center"
            role="status"
            aria-live="polite"
          >
            <span
              className={`size-1.5 rounded-full ${avatarState === 'idle' ? 'bg-subtle' : 'animate-pulse bg-accent'}`}
              aria-hidden="true"
            />
            {STATE_LABEL[avatarState]}
          </p>
          {!avatar && (
            <Link
              to={`${companyBasePath(companyId)}/pixel`}
              className="mt-2 inline-block text-xs text-accent hover:text-accent-soft"
            >
              Crear su personaje 3D
            </Link>
          )}
        </div>
      </aside>

      {/* Chat */}
      <section className="flex min-h-0 flex-1 flex-col bg-surface/60 lg:rounded-3xl lg:border lg:border-line">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            {conversations.length > 0 ? (
              <select
                value={conversation?.id ?? ''}
                onChange={(event) => void openConversation(event.target.value)}
                disabled={switching || Boolean(pending)}
                aria-label="Conversación"
                className="w-full max-w-sm truncate rounded-lg border border-line bg-canvas/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {!conversation && <option value="">Nueva conversación</option>}
                {conversations.map((c) => (
                  <option key={c.id} value={c.id} className="bg-surface">
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
            <div className="mx-auto max-w-lg py-6 text-center">
              <p className="font-display text-xl font-semibold tracking-tight">
                ¿En qué trabajamos hoy?
              </p>
              <p className="mt-2 text-sm text-muted">
                Soy el director creativo de {companyName}. Cuéntame qué necesitas y lo pensamos con
                nuestro criterio.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void submit(suggestion)}
                    className="rounded-full border border-line-strong px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-fg"
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
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/15 px-4 py-2.5 text-sm text-fg">
                  {message.content}
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex gap-3">
                <PixelMark className="mt-0.5 size-7 shrink-0" />
                <div className="min-w-0 max-w-[90%] text-sm leading-relaxed text-fg/90">
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
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent/15 px-4 py-2.5 text-sm text-fg/70">
                  {pending}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted" role="status">
                <PixelMark className="size-7 shrink-0" />
                <span className="flex gap-1" aria-label="Pixel está pensando">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-bounce rounded-full bg-accent"
                      style={{ animationDelay: `${i * 120}ms` }}
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
          <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-canvas/60 p-2 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
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
