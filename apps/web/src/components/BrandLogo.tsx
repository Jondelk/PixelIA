import { brandAssets, LOGO_RATIO } from '../brand/assets';

type LogoVariant = keyof typeof LOGO_RATIO;

/**
 * Logo de PIXELES a partir de los archivos oficiales, con la versión correcta para cada tema.
 * `height` en px. Mínimos del manual en pantalla: logotipo 160 px de ancho; isotipo 24 px.
 * `onDark`: siempre la versión para fondo oscuro (p. ej. sobre un video o una imagen oscura), sea
 * cual sea el tema de la interfaz.
 */
export function BrandLogo({
  variant = 'full',
  height,
  className = '',
  decorative = false,
  onDark = false,
}: {
  variant?: LogoVariant;
  height: number;
  className?: string;
  decorative?: boolean;
  onDark?: boolean;
}) {
  const src = brandAssets.logo[variant];
  const width = Math.round(height * LOGO_RATIO[variant]);
  const alt = decorative ? '' : 'PIXELES';
  if (onDark) {
    return (
      <span className={`inline-flex shrink-0 ${className}`} style={{ width, height }}>
        <img src={src.onDark} alt={alt} width={width} height={height} />
      </span>
    );
  }
  return (
    <span className={`inline-flex shrink-0 ${className}`} style={{ width, height }}>
      <img src={src.onDark} alt={alt} width={width} height={height} className="light:hidden" />
      <img
        src={src.onLight}
        alt={alt}
        width={width}
        height={height}
        className="hidden object-contain light:block"
      />
    </span>
  );
}
