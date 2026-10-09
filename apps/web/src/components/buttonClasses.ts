export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand font-semibold hover:bg-brand-hover',
  secondary: 'border border-line-strong text-fg font-medium hover:bg-elevated',
  ghost: 'text-muted hover:bg-elevated hover:text-fg',
};

export function buttonClasses(variant: ButtonVariant = 'primary', className = ''): string {
  return [
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    className,
  ].join(' ');
}
