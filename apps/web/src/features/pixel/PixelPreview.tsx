import type { AvatarConcept } from '@pixel/contracts';
import { useId } from 'react';
import { previewSpec, VIEW } from './previewSpec';

function Eyes({
  style,
  color,
  accent,
}: {
  style: AvatarConcept['eyesStyle'];
  color: string;
  accent: string;
}) {
  const left = 82;
  const right = 118;
  const y = 104;
  switch (style) {
    case 'visor':
      return (
        <g>
          <rect x={60} y={94} width={80} height={20} rx={10} fill="#0B0F19" opacity={0.85} />
          <rect x={72} y={101} width={18} height={6} rx={3} fill={accent} />
          <rect x={110} y={101} width={18} height={6} rx={3} fill={accent} />
        </g>
      );
    case 'crescent':
      return (
        <g fill="none" stroke={color} strokeWidth={4} strokeLinecap="round">
          <path d={`M${left - 7} ${y + 2} Q${left} ${y - 7} ${left + 7} ${y + 2}`} />
          <path d={`M${right - 7} ${y + 2} Q${right} ${y - 7} ${right + 7} ${y + 2}`} />
        </g>
      );
    case 'line':
      return (
        <g stroke={color} strokeWidth={4} strokeLinecap="round">
          <line x1={left - 7} y1={y} x2={left + 7} y2={y} />
          <line x1={right - 7} y1={y} x2={right + 7} y2={y} />
        </g>
      );
    case 'dot':
      return (
        <g fill={color}>
          <circle cx={left} cy={y} r={4} />
          <circle cx={right} cy={y} r={4} />
        </g>
      );
    case 'oval':
    case 'round': {
      const [rx, ry] = style === 'oval' ? [5.5, 8] : [7, 7];
      return (
        <g>
          {[left, right].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy={y} rx={rx} ry={ry} fill={color} />
              <circle
                cx={cx + 2}
                cy={y - 3}
                r={2}
                fill={color === '#141824' ? '#ffffff' : '#141824'}
                opacity={0.7}
              />
            </g>
          ))}
        </g>
      );
    }
  }
}

function Mouth({ style, color }: { style: AvatarConcept['mouthStyle']; color: string }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 3.5, strokeLinecap: 'round' as const };
  switch (style) {
    case 'soft_smile':
      return <path d="M92 128 Q100 134 108 128" {...stroke} />;
    case 'smile':
      return <path d="M88 126 Q100 138 112 126" {...stroke} />;
    case 'grin':
      return <path d="M84 125 Q100 140 116 125" {...stroke} />;
    case 'open_smile':
      return <path d="M88 125 Q100 144 112 125 Z" fill={color} />;
    case 'line':
      return <line x1={93} y1={130} x2={107} y2={130} {...stroke} />;
    case 'none':
      return null;
  }
}

/** Vista provisional del personaje: SVG animado a partir del AvatarProfile (no es el modelo 3D). */
export function PixelPreview({
  profile,
  className = '',
}: {
  profile: AvatarConcept;
  className?: string;
}) {
  const id = useId();
  const spec = previewSpec(profile);
  const { primaryColor, secondaryColor, accentColor, renderHints } = profile;

  return (
    <svg
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      className={className}
      role="img"
      aria-label={`Vista provisional de ${profile.name}: ${profile.concept}`}
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={primaryColor.hex} />
          <stop offset="100%" stopColor={secondaryColor.hex} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0%" stopColor={accentColor.hex} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accentColor.hex} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <path d={spec.body} />
        </clipPath>
      </defs>

      <circle cx={VIEW.cx} cy={VIEW.cy} r={96} fill={`url(#${id}-glow)`} />
      <ellipse cx={VIEW.cx} cy={204} rx={50} ry={7} fill="#000" opacity={0.35} />

      <g
        className={spec.idleClass}
        style={{ animationDuration: spec.duration, transformOrigin: '100px 190px' }}
      >
        <g transform={spec.transform}>
          <path d={spec.body} fill={`url(#${id}-body)`} />
          <g clipPath={`url(#${id}-clip)`}>
            {renderHints.surfaceDetail === 'center_groove' && (
              <path
                d="M104 50 C88 90 116 130 98 192"
                fill="none"
                stroke={secondaryColor.hex}
                strokeWidth={5}
                opacity={0.55}
                strokeLinecap="round"
              />
            )}
            {renderHints.surfaceDetail === 'facets' && (
              <g stroke="#fff" strokeOpacity={0.18} strokeWidth={1.5} fill="none">
                <path d="M100 40 L100 192 M44 74 L156 150 M156 74 L44 150" />
              </g>
            )}
            {renderHints.surfaceDetail === 'panel_lines' && (
              <g stroke="#000" strokeOpacity={0.18} strokeWidth={2}>
                <line x1={30} y1={150} x2={170} y2={150} />
                <line x1={30} y1={168} x2={170} y2={168} />
              </g>
            )}
            {renderHints.surfaceDetail === 'veins' && (
              <path
                d="M100 50 V188 M100 100 L70 80 M100 100 L130 80 M100 140 L66 118 M100 140 L134 118"
                stroke="#fff"
                strokeOpacity={0.2}
                strokeWidth={2}
                fill="none"
              />
            )}
            {renderHints.surfaceDetail === 'grain' && (
              <g fill="#000" opacity={0.08}>
                {[...Array(18)].map((_, i) => (
                  <circle key={i} cx={50 + ((i * 37) % 100)} cy={60 + ((i * 53) % 120)} r={1.6} />
                ))}
              </g>
            )}
            <ellipse
              cx={74}
              cy={74}
              rx={26}
              ry={16}
              fill="#fff"
              opacity={spec.highlightOpacity}
              transform="rotate(-25 74 74)"
            />
          </g>
        </g>

        <g transform={spec.faceTransform}>
          <Eyes style={profile.eyesStyle} color={spec.featureColor} accent={accentColor.hex} />
          {spec.blush && (
            <g fill={accentColor.hex} opacity={0.45}>
              <ellipse cx={70} cy={120} rx={7} ry={4} />
              <ellipse cx={130} cy={120} rx={7} ry={4} />
            </g>
          )}
          <Mouth style={profile.mouthStyle} color={spec.featureColor} />
        </g>

        {renderHints.archetype === 'crystal' ? (
          <ellipse
            cx={VIEW.cx}
            cy={120}
            rx={78}
            ry={16}
            fill="none"
            stroke={accentColor.hex}
            strokeWidth={2}
            opacity={0.7}
          />
        ) : (
          <circle
            cx={VIEW.cx + 34}
            cy={52}
            r={7}
            fill={accentColor.hex}
            stroke="#0B0F19"
            strokeOpacity={0.3}
          />
        )}
      </g>
    </svg>
  );
}
