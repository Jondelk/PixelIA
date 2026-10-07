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
          className="fixed inset-0 z-30 bg-overlay lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Header onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-12 lg:py-16">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
