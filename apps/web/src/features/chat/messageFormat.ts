/*
 * Formato mínimo y seguro para las respuestas de Pixel: párrafos, **negrita** y viñetas "- ".
 * Se convierte a nodos React (nunca HTML crudo).
 */

export type Inline = { text: string; bold: boolean };
export type Block = { type: 'paragraph'; inlines: Inline[] } | { type: 'list'; items: Inline[][] };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), bold: false });
    parts.push({ text: match[1]!, bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}

export function parseMessage(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const previous = blocks.at(-1);
    if (bullet) {
      const item = parseInline(bullet[1]!);
      if (previous?.type === 'list') previous.items.push(item);
      else blocks.push({ type: 'list', items: [item] });
    } else if (line.trim()) {
      blocks.push({ type: 'paragraph', inlines: parseInline(line) });
    }
  }
  return blocks;
}
