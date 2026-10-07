import { Icon } from '../../components/Icon';

export interface ColorDraft {
  hex: string;
  name: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Paleta de la marca: selector de color + hexadecimal + nombre opcional. */
export function ColorListInput({
  colors,
  onChange,
  error,
  max = 8,
}: {
  colors: ColorDraft[];
  onChange: (colors: ColorDraft[]) => void;
  error?: string;
  max?: number;
}) {
  const update = (index: number, patch: Partial<ColorDraft>) =>
    onChange(colors.map((color, i) => (i === index ? { ...color, ...patch } : color)));

  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-muted">Colores</legend>
      <p className="mb-3 text-xs text-subtle">
        El primero se tomará como color principal. Los grises y blancos se reconocen como neutros.
      </p>
      <div className="space-y-2">
        {colors.map((color, index) => {
          const valid = HEX.test(color.hex);
          return (
            <div key={index} className="flex items-center gap-2">
              <label
                className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line-strong"
                style={{ background: valid ? color.hex : 'transparent' }}
              >
                <span className="sr-only">Elegir color {index + 1}</span>
                <input
                  type="color"
                  value={valid ? color.hex : '#000000'}
                  onChange={(event) => update(index, { hex: event.target.value.toUpperCase() })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <input
                value={color.hex}
                onChange={(event) => update(index, { hex: event.target.value.trim() })}
                aria-label={`Hexadecimal del color ${index + 1}`}
                placeholder="#6B3E26"
                className={`w-28 rounded-lg border bg-canvas px-3 py-2.5 text-sm uppercase tabular-nums focus:outline-none focus:ring-1 focus:ring-focus ${valid ? 'border-line-strong' : 'border-alert'}`}
              />
              <input
                value={color.name}
                onChange={(event) => update(index, { name: event.target.value })}
                aria-label={`Nombre del color ${index + 1}`}
                placeholder="Nombre (opcional)"
                className="min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-focus"
              />
              <button
                type="button"
                onClick={() => onChange(colors.filter((_, i) => i !== index))}
                className="rounded-lg p-2 text-subtle hover:bg-elevated hover:text-fg"
                aria-label={`Quitar color ${index + 1}`}
              >
                <Icon name="x" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={colors.length >= max}
        onClick={() => onChange([...colors, { hex: '#22D3EE', name: '' }])}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm text-muted hover:border-fg hover:text-fg disabled:opacity-40"
      >
        <Icon name="plus" className="size-4" /> Añadir color
      </button>
      {error && (
        <p className="mt-1.5 flex items-center gap-2 text-xs text-fg">
          <span className="size-1.5 shrink-0 bg-alert" aria-hidden="true" />
          {error}
        </p>
      )}
    </fieldset>
  );
}
