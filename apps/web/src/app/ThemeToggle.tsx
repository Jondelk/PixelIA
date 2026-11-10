import { Icon } from '../components/Icon';
import { useTheme } from './theme';

/** Cambia entre oscuro y claro solo durante la sesión: al recargar, la app vuelve a oscuro. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg p-2 text-subtle transition-colors hover:bg-elevated hover:text-fg"
      aria-label={label}
      title={label}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="size-[18px]" />
    </button>
  );
}
