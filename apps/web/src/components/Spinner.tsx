import { Pixi } from './Pixi';

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FullScreenLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas text-muted" role="status">
      <div className="flex flex-col items-center gap-6 text-sm">
        <Pixi size={96} />
        <span className="flex items-center gap-3">
          <Spinner className="size-4 text-fg" />
          {label}
        </span>
      </div>
    </div>
  );
}
