/** HANA branch (GETBRANCH) → BPM `companies.code` / `departments.companyCode`. */
export const HANA_BRANCH_TO_BPM_CODE: Record<string, string> = {
  BI_NEGT: 'FZCO',
  BI_NEGTLLC: 'LLC',
  BI_NESA: 'NESA',
  BI_NEGT_AUTOLLC: 'FZCO',
  BI_NEGT_KSAISUZU: 'ISUZU',
  BI_NEGT_KSAPARTS: 'ISUZU',
  BI_NEGT_BAIC: 'FZCO',
  BI_NEGT_OMAN: 'FZCO',
  BI_NEGT_JPN: 'FZCO',
  BI_NEGT_JAPAN: 'FZCO',
  BI_NEGT_BAHRAIN: 'FZCO',
  BI_NEGT_KW: 'FZCO',
};

/** Same master list as Policy Creator when GETBRANCH returns no rows for the user. */
export const HANA_MASTER_COMPANIES: Array<{ branch: string; name: string }> = [
  { branch: 'BI_NEGT', name: 'New East General Trading FZCO' },
  { branch: 'BI_NEGTLLC', name: 'New East General Trading LLC' },
  { branch: 'BI_NESA', name: 'New East Shipping Agency' },
  { branch: 'BI_NEGT_OMAN', name: 'New East General Trading - OMAN' },
  { branch: 'BI_NEGT_KW', name: 'New East General Trading - KUWAIT' },
  { branch: 'BI_NEGT_JPN', name: 'New East General Trading - Japan' },
  { branch: 'BI_NEGT_BAHRAIN', name: 'New East General Trading - Bahrain' },
  { branch: 'BI_NEGT_BAIC', name: 'Juma Mohammed Ahli for Trucks Co [BAIC]' },
  { branch: 'BI_NEGT_AUTOLLC', name: 'JUMA AHLI MOTORS FZCO (NEAUTOLLC)' },
  { branch: 'BI_NEGT_KSAISUZU', name: 'New East - KSA ISUZU' },
  { branch: 'BI_NEGT_KSAPARTS', name: 'New East - KSA PARTS' },
];

export function mapHanaBranchToBpmCode(hanaBranch: string): string {
  const branch = hanaBranch?.trim().toUpperCase();
  if (!branch) return '';
  if (HANA_BRANCH_TO_BPM_CODE[branch]) {
    return HANA_BRANCH_TO_BPM_CODE[branch];
  }
  return branch.replace(/^BI_/, '').slice(0, 16) || branch.slice(0, 16);
}

export function masterCompanyByBranch(branch: string) {
  const key = branch?.trim().toUpperCase();
  return HANA_MASTER_COMPANIES.find((item) => item.branch.toUpperCase() === key) ?? null;
}

/** Default HANA schema used to load departments for a BPM company code in Policy-aligned flows. */
export const BPM_CODE_PRIMARY_HANA_BRANCH: Record<string, string> = {
  FZCO: 'BI_NEGT',
  LLC: 'BI_NEGTLLC',
  NESA: 'BI_NESA',
  ISUZU: 'BI_NEGT_KSAISUZU',
};

/**
 * Resolve the SAP HANA schema/branch used for departments.
 * Order: preferred → exact BPM code → base prefix (FZCO-V1 → FZCO).
 */
export function resolvePrimaryHanaBranchForBpmCode(
  bpmCode: string,
  preferredBranch?: string | null,
): string {
  const preferred = preferredBranch?.trim();
  if (preferred) return preferred;
  const code = bpmCode?.trim().toUpperCase();
  if (!code) return '';
  if (BPM_CODE_PRIMARY_HANA_BRANCH[code]) {
    return BPM_CODE_PRIMARY_HANA_BRANCH[code];
  }
  // Variants like FZCO-V1 / FZCO_TEST inherit the base company HANA branch.
  const prefixes = Object.keys(BPM_CODE_PRIMARY_HANA_BRANCH).sort(
    (a, b) => b.length - a.length,
  );
  for (const prefix of prefixes) {
    if (code.startsWith(`${prefix}-`) || code.startsWith(`${prefix}_`)) {
      return BPM_CODE_PRIMARY_HANA_BRANCH[prefix];
    }
  }
  return '';
}

/**
 * True when a BPM company may use departments from this HANA branch.
 * Exact match (FZCO + BI_NEGT) or variant (FZCO-V1 + BI_NEGT → mapped FZCO).
 */
export function isBpmCodeCompatibleWithHanaBranch(
  bpmCode: string,
  hanaBranch: string,
): boolean {
  const code = bpmCode?.trim().toUpperCase();
  const mapped = mapHanaBranchToBpmCode(hanaBranch);
  if (!code || !mapped) return false;
  if (mapped === code) return true;
  return code.startsWith(`${mapped}-`) || code.startsWith(`${mapped}_`);
}

/** FZCO and FZCO-V1 are the same company; FZCO and NESA are not. */
export function sameBpmCompany(left?: string | null, right?: string | null): boolean {
  const a = left?.trim().toUpperCase() ?? '';
  const b = right?.trim().toUpperCase() ?? '';
  if (!a || !b) return false;
  if (a === b) return true;
  const leftBranch = resolvePrimaryHanaBranchForBpmCode(a);
  const rightBranch = resolvePrimaryHanaBranchForBpmCode(b);
  return Boolean(leftBranch) && leftBranch === rightBranch;
}
