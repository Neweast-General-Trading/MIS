import type { BpmProcess } from './storage';

/** All comment IDs currently present on the process snapshot. */
export function collectCommentIdsFromProcess(process: BpmProcess): Set<string> {
  const out = new Set<string>();
  for (const a of process.activities ?? []) {
    for (const c of a.comments ?? []) {
      const id = String(c.id ?? '').trim();
      if (id) out.add(id);
    }
  }
  return out;
}

export function mergeSeenCommentIds(seen: Set<string>, process: BpmProcess): void {
  for (const id of collectCommentIdsFromProcess(process)) {
    seen.add(id);
  }
}

/** IDs that appear on `process` but were not in `seen` yet (caller should merge afterward). */
export function diffNewCommentIds(seen: Set<string>, process: BpmProcess): Set<string> {
  const next = new Set<string>();
  for (const id of collectCommentIdsFromProcess(process)) {
    if (!seen.has(id)) next.add(id);
  }
  return next;
}
