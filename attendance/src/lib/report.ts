import type { AttDiscrepancyRow } from '../types';

export type ReportFilters = {
  employee: string;
  category: string;
  verified: string;
  otEligible: string;
  search: string;
};

export function emptyFilters(): ReportFilters {
  return { employee: '', category: '', verified: '', otEligible: '', search: '' };
}

export function filterRows(rows: AttDiscrepancyRow[], filters: ReportFilters): AttDiscrepancyRow[] {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.employee && r.HRM_EmpId !== filters.employee) return false;
    if (filters.category && r.Pr_EmpCategory !== filters.category) return false;
    if (filters.otEligible && r.Pr_OTEligible !== filters.otEligible) return false;
    if (filters.verified === 'yes' && normalizeVerified(r.Verified) !== 'YES') return false;
    if (filters.verified === 'no' && normalizeVerified(r.Verified) === 'YES') return false;
    if (filters.verified === 'pending' && r.Verified != null && r.Verified !== '') return false;
    if (
      q &&
      !r.HRM_EmpId.toLowerCase().includes(q) &&
      !r.Comments.toLowerCase().includes(q) &&
      !r.Pr_AttDate.includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export function normalizeVerified(value: string | null): string {
  if (!value) return 'PENDING';
  return value.trim().toUpperCase();
}

export function uniqueSorted<T>(rows: AttDiscrepancyRow[], pick: (r: AttDiscrepancyRow) => T): T[] {
  return [...new Set(rows.map(pick))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true }),
  );
}

export function buildKpis(rows: AttDiscrepancyRow[]) {
  let verified = 0;
  let pending = 0;
  let otEligible = 0;
  let totalOt = 0;
  let totalNor = 0;
  const employees = new Set<string>();

  for (const r of rows) {
    employees.add(r.HRM_EmpId);
    const v = normalizeVerified(r.Verified);
    if (v === 'YES') verified += 1;
    else pending += 1;
    if (r.Pr_OTEligible === 'Y') otEligible += 1;
    totalOt += r.Pr_AttOtHours + r.Pr_ExtraOtHours;
    totalNor += r.Pr_AttNorHours;
  }

  return {
    records: rows.length,
    employees: employees.size,
    verified,
    pending,
    otEligible,
    avgNorHours: rows.length ? totalNor / rows.length : 0,
    totalOtHours: totalOt,
  };
}

export function buildByCategory(rows: AttDiscrepancyRow[]) {
  const map = new Map<string, { category: string; count: number; verified: number }>();
  for (const r of rows) {
    const cat = r.Pr_EmpCategory || '—';
    const entry = map.get(cat) ?? { category: cat, count: 0, verified: 0 };
    entry.count += 1;
    if (normalizeVerified(r.Verified) === 'YES') entry.verified += 1;
    map.set(cat, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function buildByDay(rows: AttDiscrepancyRow[]) {
  const map = new Map<string, { date: string; records: number; pending: number }>();
  for (const r of rows) {
    const entry = map.get(r.Pr_AttDate) ?? { date: r.Pr_AttDate, records: 0, pending: 0 };
    entry.records += 1;
    if (normalizeVerified(r.Verified) !== 'YES') entry.pending += 1;
    map.set(r.Pr_AttDate, entry);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildVerificationPie(rows: AttDiscrepancyRow[]) {
  let yes = 0;
  let pending = 0;
  for (const r of rows) {
    if (normalizeVerified(r.Verified) === 'YES') yes += 1;
    else pending += 1;
  }
  return [
    { name: 'Verified', value: yes, color: '#10B981' },
    { name: 'Pending review', value: pending, color: '#F59E0B' },
  ].filter((d) => d.value > 0);
}

export function buildOtDistribution(rows: AttDiscrepancyRow[]) {
  const buckets = [
    { label: '0h', min: 0, max: 0 },
    { label: '0–2h', min: 0.01, max: 2 },
    { label: '2–4h', min: 2, max: 4 },
    { label: '4–8h', min: 4, max: 8 },
    { label: '8h+', min: 8, max: Infinity },
  ];
  return buckets.map((b) => ({
    bucket: b.label,
    count: rows.filter((r) => {
      const ot = r.Pr_AttOtHours + r.Pr_ExtraOtHours;
      return ot >= b.min && ot < b.max;
    }).length,
  }));
}

export function rowsToExport(rows: AttDiscrepancyRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    'Employee ID': r.HRM_EmpId,
    Date: r.Pr_AttDate,
    Year: r.Pr_Year,
    Month: r.Pr_Month,
    Category: r.Pr_EmpCategory,
    'Org Time In': r.Pr_AttOrgTimeIn,
    'Org Time Out': r.Pr_AttOrgTimeOut,
    'Org Work Hrs': r.Pr_AttOrgWorkHrs,
    'Att Time In': r.Pr_AttTimeIn,
    'Att Time Out': r.Pr_AttTimeout,
    'Normal Hrs': r.Pr_AttNorHours,
    'OT Hrs': r.Pr_AttOtHours,
    'Extra OT': r.Pr_ExtraOtHours,
    'OT Eligible': r.Pr_OTEligible,
    Verified: r.Verified ?? 'Pending',
    Comments: r.Comments,
  }));
}
