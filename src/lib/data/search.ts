/** Strips characters that have meaning in PostgREST filter syntax. */
export function sanitizeSearch(q: string | undefined): string | undefined {
  const cleaned = q?.replace(/[,()*%\\:."']/g, " ").trim();
  return cleaned ? cleaned : undefined;
}
