import type { ReactNode } from 'react';
import { BrandLogo } from '../../components/BrandLogo';
import { Pixi } from '../../components/Pixi';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between border-r border-line p-14 lg:flex">
        <BrandLogo height={30} />
        <div className="max-w-lg">
          <Pixi size={168} className="-ml-4 mb-12" />
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.2em] text-subtle">
            Pixel · director creativo
          </p>
          <h1 className="font-display text-5xl font-bold leading-[1.08] tracking-tight">
            Cada marca merece su propio director creativo.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            Pixel estudia el ADN de tu marca y lo convierte en criterio, voz y un personaje que la
            representa.
          </p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">
          Tecnología creativa y entretenimiento
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-14 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-12 lg:hidden">
            <BrandLogo height={26} />
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
