/**
 * Approval flow value, stored in `details` as `['Yes', 'Job role L1', 'Job role L2', ...]`
 * (or `['No']`). The order of the job roles is the approval order (Level 1 first).
 */
export type ApprovalFlow = { enabled: boolean; levels: string[] };

export function parseApprovalFlow(value: unknown): ApprovalFlow {
  const items = Array.isArray(value)
    ? value.map((v) => String(v ?? '').trim()).filter(Boolean)
    : String(value ?? '')
        .split(/[,;|\n]+/)
        .map((v) => v.trim())
        .filter(Boolean);
  const head = items[0]?.toLowerCase();
  const hasFlag = head === 'yes' || head === 'no';
  const levels = hasFlag ? items.slice(1) : items;
  const enabled = hasFlag ? head === 'yes' : levels.length > 0;
  return { enabled, levels: enabled ? levels : [] };
}

export function serializeApprovalFlow(enabled: boolean, levels: string[]): string[] {
  const clean = levels.map((l) => l.trim()).filter(Boolean);
  return enabled ? ['Yes', ...clean] : ['No'];
}

/** "Yes — Level 1: A → Level 2: B", "No", or '' when never filled in. */
export function formatApprovalFlow(value: unknown): string {
  const raw = Array.isArray(value) ? value.join('').trim() : String(value ?? '').trim();
  if (!raw) return '';
  const { enabled, levels } = parseApprovalFlow(value);
  if (!enabled) return 'No';
  return levels.length
    ? `Yes — ${levels.map((l, i) => `Level ${i + 1}: ${l}`).join(' → ')}`
    : 'Yes';
}

export function isApprovalFlowKey(key: string): boolean {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '') === 'approvalflow';
}
