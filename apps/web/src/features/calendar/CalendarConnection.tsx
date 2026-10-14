import type { CalendarConnection, CalendarConnectionStatus } from '@pixel/contracts';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { errorMessage } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { disconnectCalendar, getCalendarConnection, startCalendarConnect } from './calendarApi';
import {
  CALENDAR_PRIVACY,
  CALENDAR_STATUS_TEXT,
  calendarReturnMessage,
  connectLabel,
} from './calendarLogic';

/*
 * Google Calendar en la web (Prompt 19): una tarjeta de conexión en «Mi Pixel» (sin sección nueva
 * en la navegación) y el botón para conectar cuando Pixel lo pide en una respuesta.
 */

/** Botón «Conectar Google Calendar» (o «Volver a conectar»); nada si no hay OAuth que ofrecer. */
export function CalendarConnectButton({
  workspaceId,
  status,
  returnTo,
}: {
  workspaceId: string;
  status: CalendarConnectionStatus;
  returnTo: 'home' | 'pixel';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = connectLabel(status);
  if (!label) return null;
  return (
    <div className="space-y-2">
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await startCalendarConnect(workspaceId, returnTo);
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        <Icon name="planner" className="size-4" /> {label}
      </Button>
      <p className="max-w-xl text-xs leading-relaxed text-subtle">{CALENDAR_PRIVACY}</p>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

/** El resultado de volver de Google (`?calendar=connected` o el motivo del error). */
export function CalendarReturnNotice() {
  const [params, setParams] = useSearchParams();
  const message = calendarReturnMessage(params);
  if (!message) return null;
  const dismiss = () => {
    const next = new URLSearchParams(params);
    next.delete('calendar');
    next.delete('reason');
    setParams(next, { replace: true });
  };
  const body = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span>{message.text}</span>
      <button
        type="button"
        onClick={dismiss}
        className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        Cerrar
      </button>
    </div>
  );
  return message.tone === 'error' ? (
    <Alert>{body}</Alert>
  ) : (
    <div
      role="status"
      className="flex gap-3 rounded-lg border border-line-strong bg-surface px-3.5 py-3 text-sm text-fg"
    >
      <Icon name="check" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{body}</div>
    </div>
  );
}

/** Vista sin estado (testeable) de la conexión. */
export function CalendarConnectionView({
  connection,
  workspaceId,
  disconnecting,
  onDisconnect,
}: {
  connection: CalendarConnection;
  workspaceId: string;
  disconnecting: boolean;
  onDisconnect: () => void;
}) {
  return (
    <section
      aria-labelledby="calendar-connection-title"
      className="space-y-4 rounded-2xl border border-line bg-surface p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="calendar-connection-title"
          className="font-display text-lg font-bold tracking-tight"
        >
          Google Calendar
        </h2>
        <span className="text-xs text-subtle">
          {connection.connected ? 'Conectado' : 'Sin conectar'}
        </span>
      </div>
      <p className="max-w-xl text-sm leading-relaxed text-muted">
        {CALENDAR_STATUS_TEXT[connection.status]}
      </p>
      {connection.connected ? (
        <div className="space-y-4">
          {connection.scopes.length > 0 && (
            <ul aria-label="Lo que Pixel puede hacer" className="space-y-1.5 text-sm text-muted">
              {connection.scopes.map((scope) => (
                <li key={scope} className="flex gap-2">
                  <Icon name="check" className="mt-0.5 size-4 shrink-0 text-fg" />
                  <span>{scope}</span>
                </li>
              ))}
            </ul>
          )}
          {connection.timezone && (
            <p className="text-xs text-subtle">
              Zona horaria del calendario: {connection.timezone}
            </p>
          )}
          <p className="max-w-xl text-xs leading-relaxed text-subtle">{CALENDAR_PRIVACY}</p>
          <Button variant="secondary" loading={disconnecting} onClick={onDisconnect}>
            Desconectar
          </Button>
          <p className="max-w-xl text-xs text-subtle">
            Al desconectar, Pixel deja de acceder a tu calendario y borra sus credenciales. Los
            bloques que ya guardaste se quedan en tu Google Calendar.
          </p>
        </div>
      ) : (
        <CalendarConnectButton
          workspaceId={workspaceId}
          status={connection.status}
          returnTo="pixel"
        />
      )}
    </section>
  );
}

/** Tarjeta de «Mi Pixel» (Personal): estado real, conectar y desconectar. */
export function CalendarConnectionCard({ workspaceId }: { workspaceId: string }) {
  const { state, reload } = useResource(`calendar:${workspaceId}`, (signal) =>
    getCalendarConnection(workspaceId, signal),
  );
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <CalendarReturnNotice />
      {state.status === 'loading' && (
        <div className="flex items-center gap-3 text-sm text-muted" role="status">
          <Spinner className="size-4 text-fg" /> Comprobando Google Calendar…
        </div>
      )}
      {state.status === 'error' && <Alert>{errorMessage(state.error)}</Alert>}
      {state.status === 'success' && (
        <CalendarConnectionView
          connection={state.data}
          workspaceId={workspaceId}
          disconnecting={disconnecting}
          onDisconnect={async () => {
            setDisconnecting(true);
            setError(null);
            try {
              await disconnectCalendar(workspaceId);
              reload();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setDisconnecting(false);
            }
          }}
        />
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
