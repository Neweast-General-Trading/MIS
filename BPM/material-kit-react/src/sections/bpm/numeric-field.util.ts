/** Parse user input into a non-negative decimal day count (or empty). */
export function parseNumericDaysInput(raw: string): string {
  const cleaned = raw.trim().replace(/,/g, '');
  if (!cleaned) return '';
  const match = cleaned.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return '';
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num < 0) return '';
  // Keep meaningful decimals without trailing zeros noise (0.50 → 0.5, 2.0 → 2)
  const normalized = String(Number(num.toFixed(4)));
  return normalized === 'NaN' ? '' : normalized;
}

/** Display stored duration as a bare number (unit belongs in the field label). */
export function formatNumericDaysDisplay(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  const text = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw);
  const parsed = parseNumericDaysInput(text);
  if (parsed) return parsed;
  // Strip trailing unit words so old "2 days" / "30 minutes" values show as numbers.
  const stripped = text.trim().replace(/\s*(days?|minutes?|mins?|hrs?|hours?)\s*$/i, '');
  return parseNumericDaysInput(stripped) || '';
}

/** Integer / decimal numeric-only input (non-negative). */
export function parseNumberFieldInput(raw: string, { integerOnly = false } = {}): string {
  const cleaned = raw.trim().replace(/,/g, '');
  if (!cleaned) return '';
  if (integerOnly) {
    const match = cleaned.match(/^(\d+)/);
    return match?.[1] ?? '';
  }
  const match = cleaned.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return '';
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num < 0) return '';
  return String(Number(num.toFixed(4)));
}
