/** Case-insensitive substring match for any displayed table cell. */
export function matchesTableSearch(
  query: string,
  ...parts: Array<string | number | undefined | null>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((p) => String(p ?? '').toLowerCase().includes(q));
}
