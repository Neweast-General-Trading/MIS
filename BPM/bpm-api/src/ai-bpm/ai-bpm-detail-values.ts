/**
 * Resolve BPM template-column values from activity.details without dropping data.
 * Markdown/Word tables cannot contain raw newlines or unescaped pipes.
 */

export type TemplateColumn = {
  key: string;
  label: string;
};

function cellRaw(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    // Approval flow: ['Yes', 'Role L1', 'Role L2'] / ['No']
    if (value[0] === 'No' && value.length === 1) return 'No';
    if (value[0] === 'Yes') {
      const levels = value
        .slice(1)
        .map((v) => String(v ?? '').trim())
        .filter(Boolean);
      return levels.length
        ? `Yes — ${levels.map((r, i) => `Level ${i + 1}: ${r}`).join(' → ')}`
        : 'Yes';
    }
    return value
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value).trim();
}

/** Flatten a value so it is safe inside a markdown table cell. */
export function formatTableCell(value: unknown): string {
  const text = cellRaw(value)
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' · ')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '/')
    .trim();
  return text || '—';
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/[\s._\-()/]+/g, '');
}

/**
 * Find the details value for a template column.
 * Exact key/label first, then case-insensitive, then folded unique match.
 */
export function resolveDetailValue(
  details: Record<string, unknown> | undefined,
  column: TemplateColumn,
): string {
  if (!details) return '';

  const direct =
    details[column.key] ??
    (column.label !== column.key ? details[column.label] : undefined);
  const directText = cellRaw(direct);
  if (directText) return directText;

  const wanted = [column.key, column.label]
    .filter(Boolean)
    .map((s) => s.trim().toLowerCase());
  for (const [key, value] of Object.entries(details)) {
    if (wanted.includes(key.trim().toLowerCase())) {
      const text = cellRaw(value);
      if (text) return text;
    }
  }

  const foldedWanted = new Set(
    [column.key, column.label].filter(Boolean).map(fold),
  );
  const fuzzy: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (!foldedWanted.has(fold(key))) continue;
    const text = cellRaw(value);
    if (text) fuzzy.push(text);
  }
  if (fuzzy.length === 1) return fuzzy[0];

  return directText;
}

export function alignDetailsToTemplateColumns(
  details: Record<string, string | string[]> | undefined,
  columns: TemplateColumn[],
): Record<string, string | string[]> {
  const source = { ...(details ?? {}) };
  const out: Record<string, string | string[]> = { ...source };

  for (const column of columns) {
    const resolved = resolveDetailValue(source, column);
    const existing = cellRaw(out[column.key]);
    if (!existing) {
      out[column.key] = resolved;
    }
    if (column.label !== column.key && !cellRaw(out[column.label])) {
      out[column.label] = resolved || (out[column.key] ?? '');
    }
  }
  return out;
}
