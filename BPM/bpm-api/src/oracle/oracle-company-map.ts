/** Map Oracle Fusion legal employer name → BPM company code. */
export function mapOracleLegalEntityNameToBpmCode(name: string): string | null {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return null;

  if (normalized.includes('shipping agency')) return 'NESA';
  if (normalized.includes('llc_ksa') || normalized.includes('llc ksa')) return 'ISUZU';
  if (normalized.includes('fzco')) return 'FZCO';
  if (normalized.includes('llc')) return 'LLC';

  // Parent / generic entity — not a BPM operating company row.
  if (normalized === 'neweast general trading') return null;

  return null;
}

export function oracleLegalEntityNamesMatch(a: string, b: string): boolean {
  const left = a.trim().toLowerCase().replace(/\s+/g, ' ');
  const right = b.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
