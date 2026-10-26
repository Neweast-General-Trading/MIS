import { companyBpmCode, type BpmCompany } from 'src/sections/bpm/api';

function resolveCompanyRow(companies: BpmCompany[], code: string | null | undefined) {
  const normalized = code?.trim();
  if (!normalized) return null;
  return (
    companies.find((item) => companyBpmCode(item) === normalized) ??
    companies.find((item) => item.code === normalized || item.hanaBranch === normalized) ??
    null
  );
}

/** BPM UI label — always the short company code (FZCO, NESA, …). */
export function companyDisplayLabel(
  companies: BpmCompany[],
  code: string | null | undefined,
): string {
  const normalized = code?.trim();
  if (!normalized) return '—';
  const row = resolveCompanyRow(companies, normalized);
  if (row) return companyBpmCode(row);
  return normalized.toUpperCase();
}

/** Full Oracle / legal name when needed outside BPM screens. */
export function companyFullName(
  companies: BpmCompany[],
  code: string | null | undefined,
): string {
  const normalized = code?.trim();
  if (!normalized) return '—';
  const row = resolveCompanyRow(companies, normalized);
  return (
    row?.oracleLegalEntityName?.trim() ||
    row?.fullName?.trim() ||
    companyDisplayLabel(companies, normalized)
  );
}

export function companyNameByCode(
  companies: BpmCompany[],
  code: string | null | undefined,
): string {
  return companyDisplayLabel(companies, code);
}
