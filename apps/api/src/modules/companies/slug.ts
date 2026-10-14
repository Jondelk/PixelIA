const MAX_SLUG_LENGTH = 60;

/** "Café Tinto & Co." → "cafe-tinto-co". `fallback` si el nombre no tiene letras ni números. */
export function slugify(value: string, fallback = 'empresa'): string {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/** Primer slug libre: base, base-2, base-3… */
export function nextAvailableSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
