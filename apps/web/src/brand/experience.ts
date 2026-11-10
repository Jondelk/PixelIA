/**
 * Recursos de la experiencia de entrada pública (bienvenida, Explorar y acceso). ÚNICO lugar donde
 * se referencian: para sustituir una imagen o activar el video final basta con cambiar este archivo.
 *
 * Archivos en apps/web/public/experience. Los `.webp` de 1672 px son los originales recibidos (no se
 * modifican); las variantes `-960` son copias reducidas para pantallas pequeñas.
 */

export type ExperienceKind = 'personal' | 'enterprise';

export interface ExperienceImage {
  /** Versión original (1672 × 941). */
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
  /**
   * Punto de recorte (`object-position`) que mantiene al personaje entero —cabeza y cuerpo— cuando
   * el contenedor no tiene la misma proporción que la imagen.
   */
  focus: string;
}

function image(name: string, alt: string, focus: string): ExperienceImage {
  const base = `/experience/${name}`;
  return {
    src: `${base}.webp`,
    srcSet: `${base}-960.webp 960w, ${base}.webp 1672w`,
    width: 1672,
    height: 941,
    alt,
    focus,
  };
}

export const experienceImages: Record<
  ExperienceKind,
  { evolution: ExperienceImage; final: ExperienceImage }
> = {
  personal: {
    evolution: image(
      'pixi-personal-evolution',
      'Pixi, el cubo amarillo de PIXELES, se transforma píxel a píxel en un joven con chaqueta negra que camina con su teléfono.',
      '88% 40%',
    ),
    final: image(
      'pixi-personal-final',
      'El personaje personal de Pixel: un joven sonriente con chaqueta negra y tableta, junto a una mesa con piezas.',
      '76% 50%',
    ),
  },
  enterprise: {
    evolution: image(
      'pixi-enterprise-evolution',
      'Pixi se transforma píxel a píxel en el personaje de una marca: un zorro con chaqueta negra y tableta que señala hacia adelante.',
      '80% 40%',
    ),
    final: image(
      'pixi-enterprise-final',
      'El personaje de una marca: un zorro con chaqueta negra y tableta que conecta piezas sobre una mesa.',
      '88% 50%',
    ),
  },
};

/**
 * Video de fondo de la bienvenida.
 *
 * PENDIENTE: el video recibido (`pixel-intro.mp4`) es un teaser de otro estudio (CROSSMIND Studio:
 * muestra su logo, "COMING SOON" y una URL de YouTube), así que se trató como referencia y NO se
 * incluye. No hay ningún MP4/WebM propio de PIXELES en el repositorio.
 *
 * Resolución:
 * 1. `VITE_PIXEL_INTRO_VIDEO` (solo para probar en LOCAL, p. ej. en `apps/web/.env.local`, que Git
 *    ignora): una ruta interna como `/experience/pixel-intro.local.mp4`. Ese archivo también está
 *    ignorado por Git: nunca es un asset de PIXELES.
 * 2. Si no, la ruta oficial y futura: `apps/web/public/experience/pixel-intro.mp4` (MP4 H.264).
 * 3. Si el archivo no existe o falla al cargar, la bienvenida muestra el poster (`BackgroundVideo`
 *    retira el video) y «Entrar a Pixel» sigue disponible.
 */
export const INTRO_VIDEO_PATH = '/experience/pixel-intro.mp4';

/**
 * Ruta del video: la variable local si es una ruta interna a un .mp4 o .webm; si no, la oficial.
 * Nunca una URL externa ni un protocolo (la variable no puede apuntar fuera de la app).
 */
export function resolveIntroVideoSrc(override: unknown): string {
  if (typeof override !== 'string') return INTRO_VIDEO_PATH;
  const value = override.trim();
  return /^\/(?!\/)[\w./-]+\.(?:mp4|webm)$/i.test(value) && !value.includes('..')
    ? value
    : INTRO_VIDEO_PATH;
}

const introSrc = resolveIntroVideoSrc(import.meta.env.VITE_PIXEL_INTRO_VIDEO);

export const introVideo: {
  src: string | null;
  type: string;
  alternatives: { src: string; type: string }[];
  poster: ExperienceImage;
} = {
  src: introSrc,
  type: introSrc.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4',
  alternatives: [],
  poster: experienceImages.personal.evolution,
};
