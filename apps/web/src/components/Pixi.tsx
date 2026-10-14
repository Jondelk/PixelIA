import { brandAssets } from '../brand/assets';

/**
 * Pixi, el personaje de PIXELES (cubo amarillo base). Siempre completo, sin recolorear ni rotar,
 * con aire alrededor. Nunca sobre azul: se pierden sus pies azules.
 * Los renders oficiales traen fondo (negro o blanco); el modo de fusión lo integra con el panel
 * sin alterar el personaje.
 */
export function Pixi({ size, className = '' }: { size: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      <img
        src={brandAssets.pixi.base.onDark}
        alt="Pixi"
        width={size}
        height={size}
        className="mix-blend-lighten light:hidden"
      />
      <img
        src={brandAssets.pixi.base.onLight}
        alt="Pixi"
        width={size}
        height={size}
        className="hidden mix-blend-multiply light:block"
      />
    </span>
  );
}
