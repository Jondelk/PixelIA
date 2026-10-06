import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  return (
    <div className="min-h-dvh bg-canvas">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />

      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Header onOpenNav={() => setNavOpen(true)} />
        <main className="relative flex-1">
          <div
            className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-96"
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
