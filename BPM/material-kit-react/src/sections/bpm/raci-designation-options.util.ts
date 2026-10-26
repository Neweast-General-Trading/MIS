/** Merge SAP master options with a cell's saved value so existing data stays selectable. */
export function mergeRaciDesignationOptions(
  masterOptions: readonly string[],
  currentValue?: string | null,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  const add = (raw: string) => {
    const label = raw.trim();
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(label);
  };

  const current = currentValue?.trim() ?? '';
  if (current) add(current);

  for (const option of masterOptions) add(option);

  return merged.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
