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
  dna: (
    <>
      <path d="M7 3c0 5 10 5 10 9s-10 4-10 9" />
      <path d="M17 3c0 5-10 5-10 9s10 4 10 9" />
      <path d="M8.5 6.5h7M8.5 17.5h7" />
    </>
  ),
  pixel: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" fillOpacity="0.25" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  chat: <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
