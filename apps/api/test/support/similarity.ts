/** Palabras significativas (≥ 4 letras, sin tildes ni mayúsculas). */
export function words(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4),
  );
}

/** Similitud de Jaccard entre vocabularios: 1 = mismas palabras, 0 = ninguna en común. */
export function jaccard(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  const intersection = [...x].filter((word) => y.has(word)).length;
  return intersection / (x.size + y.size - intersection || 1);
}
