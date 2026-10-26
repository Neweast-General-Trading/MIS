/**
 * Maps HANA department names (Policy Creator) to BPM org-department master names.
 * Used when linking policies: HANA "Planning" → BPM "Planning and Procurement".
 */
export const HANA_DEPT_ORG_ALIASES: Record<string, string[]> = {
  planning: ['planning and procurement', 'planning procurement', 'planning & procurement'],
  'hr & administration': ['hr', 'human resources'],
  'internal audit, risk & compliance': ['internal audit', 'audit'],
  'business alliance': ['business & it', 'business and it'],
  administration: ['master data', 'hr'],
  'domestic sales  - uae': ['sales'],
  'international sales - baniyas': ['sales'],
  operations: ['operation'],
};

export function hanaDepartmentMatchesOrgName(
  hanaDepartmentName: string,
  orgDepartmentName: string | null | undefined,
): boolean {
  const target = normalizeToken(hanaDepartmentName);
  const org = normalizeToken(orgDepartmentName ?? '');
  if (!target || !org) return false;
  if (target === org || target.includes(org) || org.includes(target)) return true;

  const aliases = HANA_DEPT_ORG_ALIASES[target] ?? [];
  return aliases.some(
    (alias) => org === alias || org.includes(alias) || alias.includes(org),
  );
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}
