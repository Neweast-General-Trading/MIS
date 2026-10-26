/** Dashboard `Company` codes from DA_Lst5yrs_AllDBs → HANA branch schema ids from GETBRANCH */
export const COMPANY_CODE_TO_BRANCHES: Record<string, string[]> = {
  FZCO: ['BI_NEGT'],
  LLC: ['BI_NEGTLLC'],
  NESA: ['BI_NESA'],
  Oman: ['BI_NEGT_OMAN'],
  BHRN: ['BI_NEGT_BAHRAIN'],
  JAPAN: ['BI_NEGT_JPN'],
  KUWAIT: ['BI_NEGT_KW'],
  KSA: ['BI_NEGT_KSAISUZU', 'BI_NEGT_KSAPARTS', 'BI_NEGT_BAIC'],
};

export const BRANCH_TO_COMPANY_CODE: Record<string, string> = {};
for (const [code, branches] of Object.entries(COMPANY_CODE_TO_BRANCHES)) {
  for (const b of branches) BRANCH_TO_COMPANY_CODE[b] = code;
}

export function branchesForCompanyCode(companyCode: string): string[] | undefined {
  const key = companyCode.trim();
  if (!key) return undefined;
  return COMPANY_CODE_TO_BRANCHES[key];
}
