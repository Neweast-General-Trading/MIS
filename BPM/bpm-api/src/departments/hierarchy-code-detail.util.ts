/**
 * Keeps hierarchical sub-process codes (`ActivityEntity.code`) aligned with template detail columns
 * whose keys/labels refer to “Process Id” / “Activity ID”, etc. Templates name these fields differently
 * (`process_id`, `activity_id`, …), so we stamp `activity.code` into matching keys after generation.
 */

export function normalizeHierarchyDetailFieldKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s._-]+/g, '');
}

export function templateFieldRepresentsHierarchySubProcessCode(field: {
  key: string;
  label: string;
}): boolean {
  const nk = normalizeHierarchyDetailFieldKey(field.key);
  const nl = field.label.trim().toLowerCase().replace(/\s+/g, ' ');

  const exactKeys = new Set([
    'activityid',
    'activity_id',
    'processid',
    'process_id',
    'subprocessid',
    'sub_process_id',
    'subprocesscode',
    'processcode',
    'codeid',
    'code_id',
  ]);
  if (exactKeys.has(nk)) return true;

  if (nl === 'process id' || nl === 'activity id' || nl === 'code id') return true;
  if (nl === 'sub-process id' || nl === 'sub process id') return true;

  if (nl.includes('process id')) {
    if (nl.includes('data') || nl.includes('information') || nl.includes('source')) return false;
    return true;
  }

  return false;
}

export function applyHierarchyCodeToMatchingDetailFields(
  fields: Array<{ key: string; label: string }>,
  details: Record<string, string | string[]>,
  hierarchyCode: string,
): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = { ...details };
  const code = hierarchyCode.trim();
  if (!code) return next;

  for (const f of fields) {
    if (!templateFieldRepresentsHierarchySubProcessCode(f)) continue;
    const prev = next[f.key];
    const prevStr =
      prev === undefined || prev === null
        ? ''
        : Array.isArray(prev)
          ? prev.join(', ')
          : String(prev).trim();
    if (!prevStr || prevStr === '-' || prevStr !== code) {
      next[f.key] = code;
    }
  }
  return next;
}

/**
 * Next sequential code under `prefix`: fills gaps first (`…-001` before `…-003` if `…-002` is missing).
 */
function nextSequentialHierarchyCode(prefix: string, siblingCodes: string[]): string {
  const p = prefix.trim();
  const fullPrefix = `${p}-`;
  const used = new Set<number>();
  for (const raw of siblingCodes) {
    const c = String(raw ?? '').trim();
    if (!c.startsWith(fullPrefix)) continue;
    const tail = c.slice(fullPrefix.length);
    const firstSeg = tail.split('-')[0] ?? '';
    const n = Number.parseInt(firstSeg, 10);
    if (!Number.isNaN(n) && n > 0) {
      used.add(n);
    }
  }
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return `${p}-${String(candidate).padStart(3, '0')}`;
}

/**
 * Next direct child code: `{parentCode}-001`, `{parentCode}-002`, …
 * Uses the lowest unused suffix (fills gaps before extending the sequence).
 */
export function computeNextChildActivityCode(parentCode: string, siblingCodes: string[]): string {
  return nextSequentialHierarchyCode(parentCode, siblingCodes);
}

/**
 * Process codes end with a leaf segment (e.g. …-000). Root sub-process codes drop that segment,
 * then append -001, -002: process `003-002-000` → `003-002-001`, `003-002-002`, …
 */
export function activityBasePrefixFromProcessCode(processCode: string): string {
  const trimmed = processCode.trim();
  const parts = trimmed.split('-').filter((s) => s.length > 0);
  if (parts.length <= 1) {
    return trimmed;
  }
  return parts.slice(0, -1).join('-');
}

/** Next root-level activity code under `processCode` — lowest unused suffix (fills gaps). */
export function computeNextRootActivityCode(processCode: string, siblingCodes: string[]): string {
  const base = activityBasePrefixFromProcessCode(processCode);
  return nextSequentialHierarchyCode(base, siblingCodes);
}

/**
 * Align a pasted Excel Activity ID with the process that was actually created.
 * Preview UI used to suggest a different process code than the API; Excel sheets
 * often keep that wrong prefix — remap leaf segments onto the real process stem.
 *
 * Returns null when the caller should auto-generate instead.
 */
export function remapPastedActivityCodeToProcess(
  processCode: string,
  providedCode: string,
): string | null {
  const process = processCode.trim();
  const provided = providedCode.trim();
  if (!process || !provided) return null;
  if (provided === process) return null;

  const processStem = activityBasePrefixFromProcessCode(process);
  if (provided.startsWith(`${processStem}-`)) {
    return provided;
  }

  const providedParts = provided.split('-').filter((s) => s.length > 0);
  const stemParts = processStem.split('-').filter((s) => s.length > 0);
  if (providedParts.length <= stemParts.length) {
    return null;
  }
  const leaf = providedParts.slice(stemParts.length).join('-');
  if (!leaf || leaf === '000') return null;
  return `${processStem}-${leaf}`;
}

export function activityCodeStem(code: string): string {
  const parts = String(code ?? '')
    .trim()
    .split('-')
    .filter((s) => s.length > 0);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('-');
}

export function activityCodeLeafNumber(code: string): number | null {
  const parts = String(code ?? '')
    .trim()
    .split('-')
    .filter((s) => s.length > 0);
  if (!parts.length) return null;
  const n = Number.parseInt(parts[parts.length - 1] ?? '', 10);
  return Number.isNaN(n) ? null : n;
}

/** Direct members of stem: `{stem}-XXX` with no further segments. */
function isDirectStemMember(code: string, stem: string): boolean {
  const fullPrefix = `${stem}-`;
  const c = String(code ?? '').trim();
  if (!c.startsWith(fullPrefix)) return false;
  const rest = c.slice(fullPrefix.length);
  return rest.length > 0 && !rest.includes('-');
}

export type ActivityHierarchyRename = {
  activityId: string;
  oldCode: string;
  newCode: string;
};

/**
 * After deleting an activity, close gaps in Activity IDs that share the same stem
 * (all segments except the last). Example: under `003-001-004`, codes
 * `…-000,001,002,003,004,007` become `…-000,001,002,003,004,005`.
 * Leaf `000` stays as the section header; other leaves renumber from 001.
 */
export function planStemActivityCodeRenumber(input: {
  /** Code of the deleted activity (drives which stem to compact). */
  deletedCode: string;
  remaining: Array<{ id: string; code: string; sln: number }>;
}): ActivityHierarchyRename[] {
  const deletedCode = String(input.deletedCode ?? '').trim();
  const stem = activityCodeStem(deletedCode);
  if (!stem) return [];

  const direct = input.remaining.filter((row) => isDirectStemMember(row.code, stem));
  if (!direct.length) return [];

  const headers = direct.filter((row) => activityCodeLeafNumber(row.code) === 0);
  const steps = direct
    .filter((row) => {
      const leaf = activityCodeLeafNumber(row.code);
      return leaf !== null && leaf > 0;
    })
    .sort((a, b) => {
      const la = activityCodeLeafNumber(a.code) ?? 0;
      const lb = activityCodeLeafNumber(b.code) ?? 0;
      if (la !== lb) return la - lb;
      if (a.sln !== b.sln) return a.sln - b.sln;
      return a.code.localeCompare(b.code);
    });

  const siblingNewCode = new Map<string, { oldCode: string; newCode: string }>();

  // Keep a single …-000 header if present (do not compact it into 001).
  for (const header of headers) {
    const expected = `${stem}-000`;
    const oldCode = header.code.trim();
    if (oldCode !== expected) {
      siblingNewCode.set(header.id, { oldCode, newCode: expected });
    }
  }

  steps.forEach((row, index) => {
    const newCode = `${stem}-${String(index + 1).padStart(3, '0')}`;
    const oldCode = row.code.trim();
    if (oldCode !== newCode) {
      siblingNewCode.set(row.id, { oldCode, newCode });
    }
  });

  if (!siblingNewCode.size) return [];

  const renames: ActivityHierarchyRename[] = [];
  const claimed = new Set<string>();
  for (const [id, { oldCode, newCode }] of siblingNewCode) {
    renames.push({ activityId: id, oldCode, newCode });
    claimed.add(id);
  }

  // Deeper descendants that extended an old leaf code.
  for (const row of input.remaining) {
    if (claimed.has(row.id)) continue;
    const code = row.code.trim();
    for (const { oldCode, newCode } of siblingNewCode.values()) {
      const oldChildPrefix = `${oldCode}-`;
      if (code.startsWith(oldChildPrefix)) {
        renames.push({
          activityId: row.id,
          oldCode: code,
          newCode: `${newCode}-${code.slice(oldChildPrefix.length)}`,
        });
        claimed.add(row.id);
        break;
      }
    }
  }

  return renames;
}
