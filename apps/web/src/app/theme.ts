import { useCallback, useState } from 'react';

export type Theme = 'dark' | 'light';

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Tema de la interfaz. La app siempre arranca en oscuro (index.html) y el cambio a claro dura
 * solo mientras la página está abierta: no se guarda en ningún almacenamiento.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    const canvas = getComputedStyle(document.documentElement).getPropertyValue('--pxl-canvas');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', canvas.trim());
    setTheme(next);
  }, []);
  return { theme, toggle };
}
