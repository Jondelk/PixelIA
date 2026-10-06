import { useId } from 'react';

/** Marca provisional de Pixel: una cuadrícula de 2×2 con un píxel encendido. */
export function PixelMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-lit`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-accent-soft)" />
          <stop offset="100%" stopColor="var(--color-accent)" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>
      <rect x="3" y="3" width="12" height="12" rx="3" fill="#121a2d" stroke="#22304b" />
      <rect x="3" y="17" width="12" height="12" rx="3" fill="#121a2d" stroke="#22304b" />
      <rect
        x="17"
        y="17"
        width="12"
        height="12"
        rx="3"
        fill="var(--color-electric)"
        fillOpacity="0.85"
      />
      <rect
        x="17"
        y="3"
        width="12"
        height="12"
        rx="3"
        fill={`url(#${id}-lit)`}
        filter={`url(#${id}-glow)`}
        opacity="0.7"
      />
      <rect x="17" y="3" width="12" height="12" rx="3" fill={`url(#${id}-lit)`} />
    </svg>
  );
}
