/** Display + column matching for hierarchical sub-process codes in the grid (mirrors API `hierarchy-code-detail.util.ts` ideas). */

function nfKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s._-]+/g, '');
}

function nfLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Column shows `ActivityEntity.code` (003-001-001-001 style), regardless of detail key name in template. */
export function columnShowsHierarchySubProcessCode(key: string, label?: string): boolean {
  const nk = nfKey(key);
  const exactKeys = new Set([
    nfKey('activity_id'),
    nfKey('activityid'),
    nfKey('process_id'),
    nfKey('processid'),
    nfKey('sub_process_id'),
    nfKey('subprocess_id'),
    nfKey('subprocessid'),
    nfKey('processcode'),
    nfKey('subprocesscode'),
    nfKey('code_id'),
    nfKey('codeid'),
  ]);
  if (exactKeys.has(nk)) return true;

  if (label) {
    const nl = nfLabel(label);
    if (nl === 'process id' || nl === 'activity id' || nl === 'code id') return true;
    if (nl === 'sub-process id' || nl === 'sub process id') return true;
    if (nl.includes('process id')) {
      if (nl.includes('data') || nl.includes('information') || nl.includes('source')) return false;
      return true;
    }
  }

  return false;
}

function findLowestUnusedSequenceNumber(used: Set<number>, start = 1): number {
  let candidate = start;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

/**
 * Next process code — MUST match API `DepartmentsService.getNextProcessCode` /
 * `getNextChildProcessCode` (bpm-api).
 *
 * 4-level without parent: next parent branch `C1-P-001-000` (fills gaps in P).
 * 4-level with parent `C1-P-*-000`: next child `C1-P-C-000`.
 * 3-level: next `C1-M-000`.
 */
export function computeNextProcessCodeForDepartment(opts: {
  departmentCode: string;
  existingProcessCodes: string[];
  processCodeLevels: 3 | 4;
  parentProcessCode?: string;
}): string {
  const { departmentCode, existingProcessCodes, processCodeLevels, parentProcessCode } = opts;
  const [major] = departmentCode.split('-').map((v) => v.trim());
  if (!major) return '';

  if (processCodeLevels === 4 && parentProcessCode?.trim()) {
    const parentParts = parentProcessCode.trim().split('-');
    if (parentParts.length !== 4) return 'Invalid parent code';
    const [maj, parentSeg] = parentParts;
    const usedChildren = new Set<number>();
    for (const raw of existingProcessCodes) {
      const parts = raw.split('-');
      if (parts.length !== 4 || parts[0] !== maj || parts[1] !== parentSeg || parts[3] !== '000') {
        continue;
      }
      const n = Number.parseInt(parts[2] ?? '', 10);
      if (!Number.isNaN(n) && n > 0) usedChildren.add(n);
    }
    const nextChild = findLowestUnusedSequenceNumber(usedChildren);
    return `${maj}-${parentSeg}-${String(nextChild).padStart(3, '0')}-000`;
  }

  if (processCodeLevels === 4) {
    // Same rule as API: only rows ending …-001-000 count as occupied parent branches.
    const usedParents = new Set<number>();
    for (const raw of existingProcessCodes) {
      const parts = String(raw ?? '')
        .trim()
        .split('-');
      if (parts.length !== 4 || parts[0] !== major || parts[3] !== '000') continue;
      if (parts[2] !== '001') continue;
      const parent = Number.parseInt(parts[1] ?? '', 10);
      if (!Number.isNaN(parent) && parent > 0) usedParents.add(parent);
    }
    const nextParent = findLowestUnusedSequenceNumber(usedParents);
    return `${major}-${String(nextParent).padStart(3, '0')}-001-000`;
  }

  const usedMid = new Set<number>();
  for (const raw of existingProcessCodes) {
    const parts = raw.split('-');
    if (parts.length !== 3 || parts[0] !== major) continue;
    const n = Number.parseInt(parts[1] ?? '', 10);
    if (!Number.isNaN(n) && n > 0) usedMid.add(n);
  }
  const nextMid = findLowestUnusedSequenceNumber(usedMid);
  return `${major}-${String(nextMid).padStart(3, '0')}-000`;
}

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
    if (!Number.isNaN(n) && n > 0) used.add(n);
  }
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return `${p}-${String(candidate).padStart(3, '0')}`;
}

/**
 * Next direct child code under a parent: `{parentCode}-001`, `{parentCode}-002`, …
 * Uses the lowest unused suffix (fills gaps before extending the sequence).
 */
export function computeNextChildActivityCode(parentCode: string, siblingCodes: string[]): string {
  return nextSequentialHierarchyCode(parentCode, siblingCodes);
}

/** Process …-000 → root sub-process …-001, …-002 — lowest unused suffix (fills gaps). */
export function computeNextRootActivityCode(processCode: string, siblingCodes: string[]): string {
  const trimmed = processCode.trim();
  const parts = trimmed.split('-').filter((s) => s.length > 0);
  const base = parts.length <= 1 ? trimmed : parts.slice(0, -1).join('-');
  return nextSequentialHierarchyCode(base, siblingCodes);
}

/** Always show persisted hierarchical `activity.code` for ID columns (details may hold stale imports). */
export function formatHierarchySubProcessCodeCell(
  activity: { code: string; details?: Record<string, unknown> },
  columnKey: string,
  columnLabel?: string,
): string {
  if (!columnShowsHierarchySubProcessCode(columnKey, columnLabel)) {
    return '';
  }
  return activity.code?.trim() || '-';
}
