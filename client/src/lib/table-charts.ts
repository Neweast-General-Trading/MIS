import {
  activeSummaryRowTotal,
  isFutureMonth,
  SUMMARY_MONTHS,
  visibleSummaryMonths,
  type ActiveSummaryTableFilters,
  type ActiveTransactionsSummaryRow,
} from './dashboard';

export type YearChartRow = {
  year: number;
  documents: number;
  cancelled: number;
  active: number;
  cancelRate: number;
};

export type CompanyChartRow = {
  name: string;
  documents: number;
  active: number;
  cancelled: number;
};

export type MonthChartRow = {
  label: string;
  year: number;
  month: string;
  documents: number;
  cancelled: number;
  active: number;
};

export function yearTableToChart(rows: Record<string, unknown>[]): YearChartRow[] {
  return rows.map((r) => ({
    year: r.Year as number,
    documents: r.Documents as number,
    cancelled: r.Cancelled as number,
    active: r.Active as number,
    cancelRate: parseFloat(String(r['Cancel %'] ?? 0)),
  }));
}

export function companyTableToChart(rows: Record<string, unknown>[]): CompanyChartRow[] {
  return rows.map((r) => ({
    name: r.Company as string,
    documents: r.Documents as number,
    active: r.Active as number,
    cancelled: r.Cancelled as number,
  }));
}

export function monthTableToChart(rows: Record<string, unknown>[]): MonthChartRow[] {
  return rows.map((r) => ({
    label: `${r.Year} ${r.Month}`,
    year: r.Year as number,
    month: r.Month as string,
    documents: r.Documents as number,
    cancelled: r.Cancelled as number,
    active: r.Active as number,
  }));
}

export function activeSummaryByMonthChart(
  rows: ActiveTransactionsSummaryRow[],
  tableFilters: ActiveSummaryTableFilters,
) {
  const months = visibleSummaryMonths(tableFilters.month);
  const totals = Object.fromEntries(months.map((m) => [m, 0])) as Record<string, number>;
  for (const r of rows) {
    for (const m of months) {
      const monthIdx = SUMMARY_MONTHS.indexOf(m);
      if (monthIdx >= 0 && !isFutureMonth(r.Year, monthIdx + 1)) {
        totals[m] += r[m];
      }
    }
  }
  return months.map((m) => ({ month: m, active: totals[m] }));
}

export function activeSummaryByDocTypeChart(
  rows: ActiveTransactionsSummaryRow[],
  tableFilters: ActiveSummaryTableFilters,
) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const cur = map.get(r['Document type']) ?? 0;
    map.set(r['Document type'], cur + activeSummaryRowTotal(r, tableFilters.month));
  }
  return [...map.entries()]
    .map(([name, active]) => ({ name, active }))
    .sort((a, b) => b.active - a.active)
    .slice(0, 12);
}

export function activeSummaryByCompanyChart(
  rows: ActiveTransactionsSummaryRow[],
  tableFilters: ActiveSummaryTableFilters,
) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const cur = map.get(r.Company) ?? 0;
    map.set(r.Company, cur + activeSummaryRowTotal(r, tableFilters.month));
  }
  return [...map.entries()]
    .map(([name, active]) => ({ name, active }))
    .sort((a, b) => b.active - a.active);
}

export function activeSummaryByYearChart(
  rows: ActiveTransactionsSummaryRow[],
  tableFilters: ActiveSummaryTableFilters,
) {
  const map = new Map<number, number>();
  for (const r of rows) {
    const cur = map.get(r.Year) ?? 0;
    map.set(r.Year, cur + activeSummaryRowTotal(r, tableFilters.month));
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, active]) => ({ year, active }));
}

export function filterGenericTable(
  rows: Record<string, unknown>[],
  filters: Record<string, string>,
): Record<string, unknown>[] {
  return rows.filter((r) => {
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      const col =
        key === 'year'
          ? 'Year'
          : key === 'month'
            ? 'Month'
            : key === 'company'
              ? 'Company'
              : key === 'docType'
                ? ('Doc Type' in r ? 'Doc Type' : 'Doc type' in r ? 'Doc type' : 'Document type')
                : key;
      if (String(r[col as keyof typeof r]) !== value) return false;
    }
    return true;
  });
}

export function tableFilterOptions(
  rows: Record<string, unknown>[],
  field: 'year' | 'month' | 'company' | 'docType',
  active: Record<string, string>,
): string[] {
  let pool = rows;
  if (field !== 'company' && active.company) {
    pool = pool.filter((r) => String(r.Company) === active.company);
  }
  if (field !== 'docType' && active.docType) {
    pool = pool.filter((r) => String(r['Doc Type'] ?? r['Document type']) === active.docType);
  }
  if (field !== 'year' && active.year) {
    pool = pool.filter((r) => String(r.Year) === active.year);
  }
  if (field !== 'month' && active.month) {
    pool = pool.filter((r) => String(r.Month) === active.month);
  }

  if (field === 'company') {
    return [...new Set(pool.map((r) => String(r.Company)))].sort();
  }
  if (field === 'docType') {
    return [...new Set(pool.map((r) => String(r['Doc Type'] ?? r['Doc type'] ?? r['Document type'])))].sort();
  }
  if (field === 'year') {
    return [...new Set(pool.map((r) => String(r.Year)))].sort((a, b) => Number(b) - Number(a));
  }
  if (field === 'month') {
    const names = new Set(pool.map((r) => String(r.Month)));
    return SUMMARY_MONTHS.filter((m) => names.has(m));
  }
  return [];
}

export { SUMMARY_MONTHS };
