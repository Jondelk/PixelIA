import type { SVGProps } from 'react';

const paths = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
    </>
  ),
  companies: (
    <>
      <path d="M4 20.5V6.5a1 1 0 0 1 .7-1l7-2.2a1 1 0 0 1 1.3 1v16.2" />
      <path d="M13 9.5h6a1 1 0 0 1 1 1v10" />
      <path d="M2.5 20.5h19M7.5 8.5h2M7.5 12h2M7.5 15.5h2M16 13h1M16 16.5h1" />
    </>
  ),
  overview: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  /** ADN de marca: un cuadro con su píxel origen. */
  brand: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <rect x="10" y="10" width="4" height="4" fill="currentColor" stroke="none" />
    </>
  ),
  /** Personaje de la marca: un cubo. */
  character: (
    <>
      <path d="M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9L12 3.5Z" />
      <path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9" />
    </>
  ),
  chat: <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12Z" />,
  /** Proyectos: dos planos apilados. */
  projects: (
    <>
      <rect x="3.5" y="7.5" width="13" height="13" rx="1" />
      <path d="M7.5 3.5h12a1 1 0 0 1 1 1v12" />
    </>
  ),
  /** Tareas: un cuadro marcado. */
  tasks: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5.5" />
    </>
  ),
  /** Contenido: un encuadre con su línea de texto. */
  content: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
      <path d="M3.5 15.5h17M7.5 9.5h5" />
    </>
  ),
  /** Plan de contenido: una rejilla de días con un píxel marcado. */
  planner: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="1" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
      <rect x="13" y="13" width="4" height="4" fill="currentColor" stroke="none" />
    </>
  ),
  pencil: <path d="M4.5 19.5 5.5 15 15.5 5a2.1 2.1 0 0 1 3 3l-10 10-4 1.5ZM13.5 7l3 3" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 18l-6-6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  /** Crear / generar: un píxel que aparece en una esquina libre. */
  create: (
    <>
      <path d="M13.5 4.5h-8a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-8" />
      <rect x="16" y="3" width="5" height="5" fill="currentColor" stroke="none" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />,
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M9 16l-4-4 4-4M5 12h10" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
