export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-canvas font-semibold shadow-[0_0_24px_-6px_var(--color-accent)] hover:bg-accent-soft disabled:shadow-none',
  secondary: 'border border-line-strong bg-elevated text-fg hover:border-accent/50',
  ghost: 'text-muted hover:bg-white/[0.04] hover:text-fg',
};

export function buttonClasses(variant: ButtonVariant = 'primary', className = ''): string {
  return [
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant],
    className,
  ].join(' ');
}
