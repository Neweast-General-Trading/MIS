export function parseMultiSelectValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  if (value === undefined || value === null) return [];
  const text = String(value).trim();
  if (!text) return [];
  return text
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function mergeSavedMultiOptions(
  options: readonly string[],
  selected: readonly string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...options, ...selected]) {
    const label = item.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(label);
  }
  return merged;
}

export function formatMultiSelectDisplay(value: unknown): string {
  const items = parseMultiSelectValue(value);
  return items.length ? items.join(', ') : '';
}
