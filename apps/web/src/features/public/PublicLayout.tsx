import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { nextAfterAuth, safeNextPath, type AuthMode } from '../auth/redirect';
import { AuthDialog } from './AuthDialog';
import {
  AUTH_PARAM,
  AuthDialogContext,
  NEXT_PARAM,
  parseAuthMode,
  type AuthDialogValue,
} from './authDialogContext';

/** Estado de navegación que marca que el modal se abrió con una entrada nueva en el historial. */
interface DialogHistoryState {
  authDialog?: boolean;
}

/**
 * Páginas públicas (bienvenida y Explorar). Aloja el modal de acceso, cuyo estado vive en la URL
 * (`?auth=login|register&next=…`): Atrás lo cierra, se puede enlazar y la intención sobrevive a una
 * recarga. Tras autenticarse se va a `next` (solo rutas internas) o a "Tus Pixels".
 */
export function PublicLayout() {
  const { state } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = parseAuthMode(params.get(AUTH_PARAM));
  const next = safeNextPath(params.get(NEXT_PARAM));
  const open = mode !== null && state.status === 'anonymous';
  const openerRef = useRef<HTMLElement | null>(null);
  const pushedEntry = Boolean((location.state as DialogHistoryState | null)?.authDialog);

  const dialogSearch = useCallback((dialogMode: AuthMode, dialogNext: string | null) => {
    const search = new URLSearchParams({ [AUTH_PARAM]: dialogMode });
    if (dialogNext) search.set(NEXT_PARAM, dialogNext);
    return `?${search.toString()}`;
  }, []);

  const openAuth = useCallback<AuthDialogValue['openAuth']>(
    (dialogMode, options) => {
      const active = document.activeElement;
      openerRef.current = options?.opener ?? (active instanceof HTMLElement ? active : null);
      navigate(
        {
          pathname: location.pathname,
          search: dialogSearch(dialogMode, safeNextPath(options?.next)),
        },
        { state: { authDialog: true } satisfies DialogHistoryState },
      );
    },
    [navigate, location.pathname, dialogSearch],
  );

  const close = useCallback(() => {
    if (pushedEntry) navigate(-1);
    else navigate({ pathname: location.pathname, search: '' }, { replace: true });
  }, [navigate, pushedEntry, location.pathname]);

  // Al cerrarse, el foco vuelve al botón que abrió el modal (si sigue en la página).
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
      openerRef.current = null;
    }
    wasOpen.current = open;
  }, [open]);

  const value = useMemo(() => ({ openAuth, isOpen: open }), [openAuth, open]);

  return (
    <AuthDialogContext.Provider value={value}>
      <Outlet />
      {open && mode && (
        <AuthDialog
          mode={mode}
          next={next}
          onClose={close}
          onSwitch={(nextMode) =>
            navigate(
              { pathname: location.pathname, search: dialogSearch(nextMode, next) },
              { replace: true, state: location.state },
            )
          }
          onSuccess={() => navigate(nextAfterAuth(next), { replace: true })}
        />
      )}
    </AuthDialogContext.Provider>
  );
}
