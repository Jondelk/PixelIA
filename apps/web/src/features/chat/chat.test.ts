import { describe, expect, it } from 'vitest';
import { parseInline, parseMessage } from './messageFormat';
import { revealedLength, speakingDurationMs } from './speech';

describe('speakingDurationMs', () => {
  it('escala con el largo y tiene mínimo y máximo', () => {
    expect(speakingDurationMs('Hola')).toBe(1_800);
    expect(speakingDurationMs('x'.repeat(400))).toBe(5_600);
    expect(speakingDurationMs('x'.repeat(5_000))).toBe(9_000);
  });
});

describe('revealedLength', () => {
  it('revela por palabras y termina completo', () => {
    const text = 'Podemos construir el lanzamiento alrededor del origen';
    expect(revealedLength(text, 0, 1000)).toBe(text.indexOf(' '));
    expect(text.slice(0, revealedLength(text, 500, 1000)).endsWith(' ')).toBe(false);
    expect(revealedLength(text, 1000, 1000)).toBe(text.length);
  });
});

describe('parseMessage', () => {
  it('convierte negritas, párrafos y viñetas sin HTML', () => {
    const blocks = parseMessage(
      '**Idea central**\nTexto <b>sin</b> HTML\n\n- Uno\n- **Dos**\nCierre',
    );
    expect(blocks).toEqual([
      { type: 'paragraph', inlines: [{ text: 'Idea central', bold: true }] },
      { type: 'paragraph', inlines: [{ text: 'Texto <b>sin</b> HTML', bold: false }] },
      { type: 'list', items: [[{ text: 'Uno', bold: false }], [{ text: 'Dos', bold: true }]] },
      { type: 'paragraph', inlines: [{ text: 'Cierre', bold: false }] },
    ]);
  });

  it('tolera negritas sin cerrar', () => {
    expect(parseInline('a **b')).toEqual([{ text: 'a **b', bold: false }]);
  });
});
