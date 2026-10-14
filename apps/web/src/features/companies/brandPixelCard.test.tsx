import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BrandPixelCard } from './BrandPixelCard';

const render = (node: ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const base = '/company/c1';

describe('Tu Pixel (tarjeta del Inicio de la marca)', () => {
  it('con personaje: «Tu Pixel», su nombre, «Listo» y una sola acción («Personalizar»)', () => {
    const html = render(
      <BrandPixelCard
        company={{ status: 'ready', brandDnaVersion: 1, avatarVersion: 1 }}
        base={base}
        characterName="Núcleo Sabio"
      />,
    );
    const visible = text(html);
    expect(visible).toContain('Tu Pixel');
    expect(visible).toContain('Núcleo Sabio');
    expect(visible).toContain('Listo');
    expect(visible).toContain('Personalizar');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(`href="${base}/pixel"`);
    // Nada sugiere que falte crearlo ni repite accesos de la navegación.
    for (const old of ['Lista para crear', 'Crear el personaje', 'ADN de marca', 'Chat']) {
      expect(visible).not.toContain(old);
    }
  });

  it('con personaje pero sin nombre todavía (cargando): estado y acción, sin texto inventado', () => {
    const visible = text(
      render(
        <BrandPixelCard
          company={{ status: 'ready', brandDnaVersion: 1, avatarVersion: 1 }}
          base={base}
          characterName={null}
        />,
      ),
    );
    expect(visible).toContain('Listo');
    expect(visible).toContain('Personalizar');
  });

  it('con ADN y sin personaje: el siguiente paso es crearlo', () => {
    const html = render(
      <BrandPixelCard
        company={{ status: 'onboarding', brandDnaVersion: 1, avatarVersion: null }}
        base={base}
        characterName={null}
      />,
    );
    expect(text(html)).toContain('Crear el personaje de tu marca');
    expect(text(html)).not.toContain('Personalizar');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it('sin ADN: lleva al onboarding', () => {
    const html = render(
      <BrandPixelCard
        company={{ status: 'draft', brandDnaVersion: null, avatarVersion: null }}
        base={base}
        characterName={null}
      />,
    );
    expect(text(html)).toContain('Enseñarle tu marca a Pixel');
    expect(html).toContain(`href="${base}/onboarding"`);
  });
});
