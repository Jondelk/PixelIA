import type { ReactNode } from 'react';
import { PixelMark } from '../../components/PixelMark';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh overflow-hidden bg-canvas lg:grid-cols-[1.1fr_1fr]">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -left-40 top-1/3 size-[520px] rounded-full bg-electric/15 blur-[120px]"
        aria-hidden="true"
      />

      <section className="relative hidden flex-col justify-between border-r border-line p-12 lg:flex">
        <div className="flex items-center gap-3">
          <PixelMark className="size-9" />
          <span className="font-display text-lg font-semibold tracking-tight">Pixel</span>
        </div>
        <div className="max-w-lg">
          <PixelMark className="mb-10 size-24 drop-shadow-[0_0_40px_rgba(34,211,238,0.35)]" />
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight">
            Cada marca merece su propio director creativo.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted">
            Pixel estudia el ADN de tu marca y lo convierte en criterio, voz y un personaje que la
            representa.
          </p>
        </div>
        <p className="font-mono text-[11px] text-subtle">MVP 0.1</p>
      </section>

      <section className="relative flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <PixelMark className="size-9" />
            <span className="font-display text-lg font-semibold tracking-tight">Pixel</span>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
