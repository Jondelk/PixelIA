/**
 * Archivos oficiales de PIXELES (servidos desde apps/web/public). Son recortes de los originales de
 * /brand-assets: el logo nunca se redibuja ni se escribe con una fuente.
 * `onDark` / `onLight`: versión para tema oscuro (fondo Negro Cine) y claro (fondo blanco).
 */
export const brandAssets = {
  logo: {
    full: {
      onDark: '/brand/logo-principal.png',
      onLight: '/brand/logo-principal-sobre-blanco.png',
    },
    isotipo: { onDark: '/brand/logo-isotipo.png', onLight: '/brand/logo-isotipo-sobre-blanco.png' },
    wordmark: {
      onDark: '/brand/logo-wordmark.png',
      onLight: '/brand/logo-wordmark-sobre-blanco.png',
    },
    /** Sobre azul PIXELES el pie pasa a blanco (igual en ambos temas). */
    isotipoOnBrand: '/brand/logo-isotipo-sobre-azul.png',
  },
  pixi: {
    base: { onDark: '/pixi/pixi-base.png', onLight: '/pixi/pixi-base-sobre-blanco.png' },
    /** Evolución opcional (niveles 1–6). El cubo base ya es suficiente: no se muestra como meta. */
    evolution: [1, 2, 3, 4, 5, 6].map((level) => `/pixi/pixi-evo-${level}.png`),
  },
} as const;

/** Proporción ancho/alto de cada versión del logo (para reservar espacio y evitar saltos). */
export const LOGO_RATIO = { full: 2272 / 388, isotipo: 300 / 404, wordmark: 1896 / 288 } as const;
