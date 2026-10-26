import type { ActivityEntity } from 'src/activities/entities/activity.entity';

/** Activity identifiers are pasted from source sheets; API must not auto-generate them. */
export const AUTO_FILLED_ACTIVITY_DETAIL_KEYS: readonly string[] = [];

function normalizeSegment(value: string): string {
  return value.trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Builds `activity_id` from Process Function (department) name, process name,
 * optional ancestor **Sub_Process** names (root → parent), and this row’s name.
 * **Sub_Process** ≡ **Activity** (same persisted row as `ActivityEntity`).
 */
export function buildActivityIdFromNames(
  processFunctionName: string,
  processName: string,
  ancestorSubProcessNames: string[],
  subProcessName: string,
): string {
  const parts = [
    normalizeSegment(processFunctionName) || '—',
    normalizeSegment(processName) || '—',
    ...ancestorSubProcessNames.map((n) => normalizeSegment(n) || '—'),
    normalizeSegment(subProcessName) || '—',
  ];
  const joined = parts.join(' / ');
  return joined.length > 500 ? `${joined.slice(0, 497)}...` : joined;
}

/** Names of ancestor Sub_Process / Activity rows from root down to immediate parent (excludes the new/current node). */
export function collectAncestorSubProcessNames(
  immediateParent: ActivityEntity | null,
  activitiesById: Map<string, ActivityEntity>,
): string[] {
  const chain: string[] = [];
  let current: ActivityEntity | null = immediateParent;
  while (current) {
    chain.push(current.activityName);
    const pid = current.parentActivityId;
    current = pid ? activitiesById.get(pid) ?? null : null;
  }
  chain.reverse();
  return chain;
}

export function applyAutofillActivityDetailFields(
  templateFieldKeys: Set<string>,
  details: Record<string, string | string[]>,
  opts: {
    siNo: number;
    departmentName: string;
    processName: string;
    activityName: string;
    ancestorSubProcessNames: string[];
  },
): Record<string, string | string[]> {
  void templateFieldKeys;
  void opts;
  return { ...details };
}
