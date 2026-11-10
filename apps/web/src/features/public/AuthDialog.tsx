import { useEffect, useId, useRef } from 'react';
import { BrandLogo } from '../../components/BrandLogo';
import { Icon } from '../../components/Icon';
import { AuthPanel } from '../auth/AuthForms';
import type { AuthMode } from '../auth/redirect';
import { AuthVisual } from '../auth/AuthVisual';
import { visualKindForNext } from '../auth/visualKind';

/**
 * Acceso como modal (iniciar sesión / crear cuenta) sobre la portada pública. Usa <dialog> nativo:
 * el resto de la página queda inerte y el foco no sale del modal. Escape, el botón de cerrar y un
 * clic fuera cierran. En móvil ocupa la pantalla y prioriza el formulario (sin columna visual).
 */
export function AuthDialog({
  mode,
  next,
  onClose,
  onSwitch,
  onSuccess,
}: {
  mode: AuthMode;
  next: string | null;
  onClose: () => void;
  onSwitch: (mode: AuthMode) => void;
  onSuccess: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // El <dialog> no bloquea el scroll de la página de fondo.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  // Foco en el primer campo al abrir y al cambiar entre iniciar sesión y crear cuenta.
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [mode]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: se cierra desde la URL para que el historial quede coherente.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-surface p-0 text-fg backdrop:bg-overlay md:m-auto md:h-fit md:max-h-[calc(100dvh-4rem)] md:max-w-4xl md:rounded-2xl md:border md:border-line md:shadow-overlay"
    >
      <div className="grid min-h-full md:min-h-[34rem] md:grid-cols-[0.95fr_1fr]">
        <AuthVisual kind={visualKindForNext(next)} className="hidden md:block" />
        <div className="relative px-5 pb-10 pt-6 sm:px-10 md:py-10">
          <div className="flex items-center justify-between">
            <BrandLogo height={28} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-2 rounded-lg p-2 text-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              <Icon name="x" className="size-5" />
            </button>
          </div>
          <div className="mx-auto mt-10 max-w-sm md:mt-12">
            <AuthPanel
              key={mode}
              mode={mode}
              titleId={titleId}
              onSuccess={onSuccess}
              firstFieldRef={firstFieldRef}
              renderSwitch={(label, className) => (
                <button
                  type="button"
                  className={className}
                  onClick={() => onSwitch(mode === 'login' ? 'register' : 'login')}
                >
                  {label}
                </button>
              )}
            />
          </div>
        </div>
      </div>
    </dialog>
  );
}
