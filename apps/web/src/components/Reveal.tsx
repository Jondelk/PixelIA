import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Aparece al entrar en pantalla y se revierte al subir: si el bloque vuelve a quedar por debajo
 * del borde inferior, se oculta para revelarse otra vez al bajar. Respeta prefers-reduced-motion
 * desde CSS (index.css). Sin IntersectionObserver el contenido se muestra directamente.
 */
export function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'hidden' | 'shown'>('shown');

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) setState('shown');
        // Solo se oculta cuando sale por abajo (el usuario subió); al pasar de largo queda visible.
        else if (entry.boundingClientRect.top > 0) setState('hidden');
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal={state} className={className}>
      {children}
    </div>
  );
}
