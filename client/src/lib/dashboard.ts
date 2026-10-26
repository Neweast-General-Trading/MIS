import type { Lst5yrsRow } from '../types';

export type EmployeeOption = {
  userId: string;
  name: string;
  email: string;
  companies: string[];
};

export type DashboardFilters = {
  employee: string;
  company: string;
  docType: string;
  year: string;
  month: string;
  week: string;
  search: string;
};

export const emptyFilters = (): DashboardFilters => ({
  employee: '',
  company: '',
  docType: '',
  year: '',
  month: '',
  week: '',
  search: '',
});

/** Limit rows to companies the selected employee can access */
export function scopeRowsByEmployee(
  rows: Lst5yrsRow[],
  employee: EmployeeOption | undefined,
): Lst5yrsRow[] {
  if (!employee) return rows;
  const allowed = new Set(employee.companies);
  if (!allowed.size) return [];
  return rows.filter((r) => allowed.has(r.Company));
}

/** Company, doc type, year, month, week, or search — not employee */
export function hasSubFilters(f: DashboardFilters): boolean {
  return !!(
    f.company ||
    f.docType ||
    f.year ||
    f.month ||
    f.week ||
    f.search.trim()
  );
}

export function filterRows(rows: Lst5yrsRow[], f: DashboardFilters): Lst5yrsRow[] {
  const q = f.search.trim().toLowerCase();
  if (!f.company && !f.docType && !f.year && !f.month && !f.week && !q) {
    return rows;
  }
  return rows.filter((r) => {
    if (f.company && r.Company !== f.company) return false;
    if (f.docType && r.DocType !== f.docType) return false;
    if (f.year && String(r['Year No']) !== f.year) return false;
    if (f.month && String(r['Month No']) !== f.month) return false;
    if (f.week && String(r['Week No']) !== f.week) return false;
    if (q) {
      const hay = `${r.Company} ${r.DocType}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Options for dropdowns — respects other filters except the field being listed */
export function filterRowsExcept(
  rows: Lst5yrsRow[],
  f: DashboardFilters,
  except: keyof DashboardFilters,
): Lst5yrsRow[] {
  const partial = { ...f };
  if (except === 'company') partial.company = '';
  if (except === 'docType') partial.docType = '';
  if (except === 'year') partial.year = '';
  if (except === 'month') partial.month = '';
  if (except === 'week') partial.week = '';
  if (except === 'search') partial.search = '';
  if (except === 'employee') partial.employee = '';
  if (
    !partial.company &&
    !partial.docType &&
    !partial.year &&
    !partial.month &&
    !partial.week &&
    !partial.search.trim()
  ) {
    return rows;
  }
  return filterRows(rows, partial);
}

export function uniqueSorted(
  rows: Lst5yrsRow[],
  pick: (r: Lst5yrsRow) => string | number,
  numericOrder: 'asc' | 'desc' = 'desc',
) {
  return [...new Set(rows.map(pick))].sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') {
      return numericOrder === 'desc' ? b - a : a - b;
    }
    return String(a).localeCompare(String(b));
  });
}

export type DocTypeCard = {
  name: string;
  documents: number;
  cancelled: number;
  active: number;
  cancelRate: number;
};

export function buildDocTypeCards(rows: Lst5yrsRow[]): DocTypeCard[] {
  const map = new Map<string, { documents: number; cancelled: number }>();
  for (const r of rows) {
    const cur = map.get(r.DocType) ?? { documents: 0, cancelled: 0 };
    cur.documents += r['Document Count'];
    cur.cancelled += r['Cancelled Document Count'];
    map.set(r.DocType, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      documents: v.documents,
      cancelled: v.cancelled,
      active: v.documents - v.cancelled,
      cancelRate: v.documents ? (v.cancelled / v.documents) * 100 : 0,
    }))
    .sort((a, b) => b.documents - a.documents);
}

export function rowsToDetailExport(rows: Lst5yrsRow[]) {
  return [...rows]
    .sort(
      (a, b) =>
        b['Year No'] - a['Year No'] ||
        b['Month No'] - a['Month No'] ||
        b['Week No'] - a['Week No'] ||
        a.Company.localeCompare(b.Company) ||
        a.DocType.localeCompare(b.DocType),
    )
    .map((r) => ({
    Company: r.Company,
    'Doc Type': r.DocType,
    Year: r['Year No'],
    Month: r['Month No'],
    Week: r['Week No'],
    Documents: r['Document Count'],
    Cancelled: r['Cancelled Document Count'],
  }));
}

export const SUMMARY_WEEKS = ['W1', 'W2', 'W3', 'W4', 'W5'] as const;

export const SUMMARY_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export type WeekTransactionsSummaryRow = {
  Company: string;
  'Document type': string;
  Year: number;
  Month: number;
  W1: number;
  W2: number;
  W3: number;
  W4: number;
  W5: number;
  Total: number;
};

export type ActiveTransactionsSummaryRow = {
  Company: string;
  'Document type': string;
  Year: number;
  Jan: number;
  Feb: number;
  Mar: number;
  Apr: number;
  May: number;
  Jun: number;
  Jul: number;
  Aug: number;
  Sep: number;
  Oct: number;
  Nov: number;
  Dec: number;
  Total: number;
};

export type PivotCellPair = { docs: number; lines: number };

export type ActiveTransactionsDualRow = {
  Company: string;
  'Document type': string;
  Year: number;
  Jan: PivotCellPair;
  Feb: PivotCellPair;
  Mar: PivotCellPair;
  Apr: PivotCellPair;
  May: PivotCellPair;
  Jun: PivotCellPair;
  Jul: PivotCellPair;
  Aug: PivotCellPair;
  Sep: PivotCellPair;
  Oct: PivotCellPair;
  Nov: PivotCellPair;
  Dec: PivotCellPair;
  Total: PivotCellPair;
};

export type WeekTransactionsDualRow = {
  Company: string;
  'Document type': string;
  Year: number;
  Month: number;
  W1: PivotCellPair;
  W2: PivotCellPair;
  W3: PivotCellPair;
  W4: PivotCellPair;
  W5: PivotCellPair;
  Total: PivotCellPair;
};

export type PivotDataMode = 'summary' | 'details';

export type ActiveSummaryTableFilters = {
  company: string;
  docType: string;
  year: string;
  month: string;
};

export const emptyActiveSummaryTableFilters = (): ActiveSummaryTableFilters => ({
  company: '',
  docType: '',
  year: '',
  month: '',
});

export function visibleSummaryMonths(monthFilter: string): (typeof SUMMARY_MONTHS)[number][] {
  if (!monthFilter) return [...SUMMARY_MONTHS];
  const idx = Number(monthFilter) - 1;
  if (idx >= 0 && idx < 12) return [SUMMARY_MONTHS[idx]];
  return [...SUMMARY_MONTHS];
}

export function isFutureMonth(year: number, monthNo: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year > currentYear) return true;
  if (year === currentYear && monthNo > currentMonth) return true;
  return false;
}

export function pivotMonthValue(
  year: number,
  monthNo: number,
  value: number,
): number | null {
  if (isFutureMonth(year, monthNo)) return null;
  if (value <= 0) return null;
  return value;
}

export function activeSummaryRowTotal(
  row: ActiveTransactionsSummaryRow,
  monthFilter: string,
): number {
  if (monthFilter) {
    const monthNo = Number(monthFilter);
    if (isFutureMonth(row.Year, monthNo)) return 0;
    const key = SUMMARY_MONTHS[monthNo - 1];
    return key ? row[key] : 0;
  }
  return SUMMARY_MONTHS.reduce((sum, m, i) => {
    if (isFutureMonth(row.Year, i + 1)) return sum;
    return sum + row[m];
  }, 0);
}

export function filterActiveTransactionsSummary(
  rows: ActiveTransactionsSummaryRow[],
  f: ActiveSummaryTableFilters,
): ActiveTransactionsSummaryRow[] {
  return rows.filter((r) => {
    if (f.company && r.Company !== f.company) return false;
    if (f.docType && r['Document type'] !== f.docType) return false;
    if (f.year && String(r.Year) !== f.year) return false;
    if (f.month) {
      const monthNo = Number(f.month);
      if (isFutureMonth(r.Year, monthNo)) return false;
      const key = SUMMARY_MONTHS[monthNo - 1];
      if (key && r[key] <= 0) return false;
    }
    return activeSummaryRowTotal(r, '') > 0;
  });
}

function monthlyPivotRowKey(
  r: Pick<ActiveTransactionsSummaryRow, 'Company' | 'Document type' | 'Year'>,
): string {
  return `${r.Company}|${r['Document type']}|${r.Year}`;
}

function weeklyPivotRowKey(
  r: Pick<WeekTransactionsSummaryRow, 'Company' | 'Document type' | 'Year' | 'Month'>,
): string {
  return `${r.Company}|${r['Document type']}|${r.Year}|${r.Month}`;
}

function pairFromMonthCells(
  doc: ActiveTransactionsSummaryRow | undefined,
  line: ActiveTransactionsSummaryRow | undefined,
  month: (typeof SUMMARY_MONTHS)[number],
): PivotCellPair {
  return { docs: doc?.[month] ?? 0, lines: line?.[month] ?? 0 };
}

function pairFromWeekCells(
  doc: WeekTransactionsSummaryRow | undefined,
  line: WeekTransactionsSummaryRow | undefined,
  week: (typeof SUMMARY_WEEKS)[number],
): PivotCellPair {
  return { docs: doc?.[week] ?? 0, lines: line?.[week] ?? 0 };
}

export function activeDualRowTotal(
  row: ActiveTransactionsDualRow,
  monthFilter: string,
): PivotCellPair {
  if (monthFilter) {
    const monthNo = Number(monthFilter);
    if (isFutureMonth(row.Year, monthNo)) return { docs: 0, lines: 0 };
    const key = SUMMARY_MONTHS[monthNo - 1];
    return key ? row[key] : { docs: 0, lines: 0 };
  }
  return SUMMARY_MONTHS.reduce(
    (acc, m, i) => {
      if (isFutureMonth(row.Year, i + 1)) return acc;
      return { docs: acc.docs + row[m].docs, lines: acc.lines + row[m].lines };
    },
    { docs: 0, lines: 0 },
  );
}

export function weekDualRowTotal(row: WeekTransactionsDualRow): PivotCellPair {
  return SUMMARY_WEEKS.reduce(
    (acc, w) => ({ docs: acc.docs + row[w].docs, lines: acc.lines + row[w].lines }),
    { docs: 0, lines: 0 },
  );
}

export function pivotDualMonthValue(
  year: number,
  monthIdx: number,
  pair: PivotCellPair,
): PivotCellPair | null {
  if (isFutureMonth(year, monthIdx + 1)) return null;
  if (pair.docs <= 0 && pair.lines <= 0) return null;
  return pair;
}

export function mergeMonthlyDualPivot(
  docRows: ActiveTransactionsSummaryRow[],
  lineRows: ActiveTransactionsSummaryRow[],
): ActiveTransactionsDualRow[] {
  const docMap = new Map(docRows.map((r) => [monthlyPivotRowKey(r), r]));
  const lineMap = new Map(lineRows.map((r) => [monthlyPivotRowKey(r), r]));
  const keys = new Set([...docMap.keys(), ...lineMap.keys()]);

  return [...keys]
    .map((key) => {
      const doc = docMap.get(key);
      const line = lineMap.get(key);
      const base = doc ?? line!;
      const months = Object.fromEntries(
        SUMMARY_MONTHS.map((m) => [m, pairFromMonthCells(doc, line, m)]),
      ) as Record<(typeof SUMMARY_MONTHS)[number], PivotCellPair>;
      return {
        Company: base.Company,
        'Document type': base['Document type'],
        Year: base.Year,
        ...months,
        Total: {
          docs: doc ? activeSummaryRowTotal(doc, '') : 0,
          lines: line ? activeSummaryRowTotal(line, '') : 0,
        },
      };
    })
    .filter((r) => r.Total.docs > 0 || r.Total.lines > 0)
    .sort((a, b) => {
      if (b.Year !== a.Year) return b.Year - a.Year;
      const byCompany = a.Company.localeCompare(b.Company);
      if (byCompany) return byCompany;
      return a['Document type'].localeCompare(b['Document type']);
    });
}

export function mergeWeeklyDualPivot(
  docRows: WeekTransactionsSummaryRow[],
  lineRows: WeekTransactionsSummaryRow[],
): WeekTransactionsDualRow[] {
  const docMap = new Map(docRows.map((r) => [weeklyPivotRowKey(r), r]));
  const lineMap = new Map(lineRows.map((r) => [weeklyPivotRowKey(r), r]));
  const keys = new Set([...docMap.keys(), ...lineMap.keys()]);

  return [...keys]
    .map((key) => {
      const doc = docMap.get(key);
      const line = lineMap.get(key);
      const base = doc ?? line!;
      const weeks = Object.fromEntries(
        SUMMARY_WEEKS.map((w) => [w, pairFromWeekCells(doc, line, w)]),
      ) as Record<(typeof SUMMARY_WEEKS)[number], PivotCellPair>;
      const total = SUMMARY_WEEKS.reduce(
        (acc, w) => ({
          docs: acc.docs + weeks[w].docs,
          lines: acc.lines + weeks[w].lines,
        }),
        { docs: 0, lines: 0 },
      );
      return {
        Company: base.Company,
        'Document type': base['Document type'],
        Year: base.Year,
        Month: base.Month,
        ...weeks,
        Total: total,
      };
    })
    .filter((r) => r.Total.docs > 0 || r.Total.lines > 0)
    .sort((a, b) => {
      if (b.Year !== a.Year) return b.Year - a.Year;
      if (b.Month !== a.Month) return b.Month - a.Month;
      const byCompany = a.Company.localeCompare(b.Company);
      if (byCompany) return byCompany;
      return a['Document type'].localeCompare(b['Document type']);
    });
}

export function filterActiveTransactionsDualSummary(
  rows: ActiveTransactionsDualRow[],
  f: ActiveSummaryTableFilters,
): ActiveTransactionsDualRow[] {
  return rows.filter((r) => {
    if (f.company && r.Company !== f.company) return false;
    if (f.docType && r['Document type'] !== f.docType) return false;
    if (f.year && String(r.Year) !== f.year) return false;
    if (f.month) {
      const monthNo = Number(f.month);
      if (isFutureMonth(r.Year, monthNo)) return false;
      const key = SUMMARY_MONTHS[monthNo - 1];
      if (key && r[key].docs <= 0 && r[key].lines <= 0) return false;
    }
    const total = activeDualRowTotal(r, '');
    return total.docs > 0 || total.lines > 0;
  });
}

export function filterWeekTransactionsDualSummary(
  rows: WeekTransactionsDualRow[],
  f: ActiveSummaryTableFilters,
): WeekTransactionsDualRow[] {
  return rows.filter((r) => {
    if (f.company && r.Company !== f.company) return false;
    if (f.docType && r['Document type'] !== f.docType) return false;
    if (f.year && String(r.Year) !== f.year) return false;
    if (f.month && String(r.Month) !== f.month) return false;
    if (f.month && isFutureMonth(r.Year, Number(f.month))) return false;
    const total = weekDualRowTotal(r);
    return total.docs > 0 || total.lines > 0;
  });
}

export function activeSummaryFilterOptions(
  rows: ActiveTransactionsSummaryRow[],
  f: ActiveSummaryTableFilters,
  field: keyof ActiveSummaryTableFilters,
): string[] {
  let pool = rows;
  if (field !== 'company' && f.company) pool = pool.filter((r) => r.Company === f.company);
  if (field !== 'docType' && f.docType) {
    pool = pool.filter((r) => r['Document type'] === f.docType);
  }
  if (field !== 'year' && f.year) pool = pool.filter((r) => String(r.Year) === f.year);
  if (field !== 'month' && f.month) {
    const key = SUMMARY_MONTHS[Number(f.month) - 1];
    if (key) pool = pool.filter((r) => r[key] > 0);
  }

  if (field === 'company') return [...new Set(pool.map((r) => r.Company))].sort();
  if (field === 'docType') return [...new Set(pool.map((r) => r['Document type']))].sort();
  if (field === 'year') {
    return [...new Set(pool.map((r) => String(r.Year)))].sort((a, b) => Number(b) - Number(a));
  }
  if (field === 'month') {
    return SUMMARY_MONTHS.map((_, i) => String(i + 1)).filter((m) => {
      const monthNo = Number(m);
      const key = SUMMARY_MONTHS[monthNo - 1];
      return pool.some((r) => !isFutureMonth(r.Year, monthNo) && r[key] > 0);
    });
  }
  return [];
}

export function cloneActiveSummaryTableFilters(
  f: ActiveSummaryTableFilters,
): ActiveSummaryTableFilters {
  return { company: f.company, docType: f.docType, year: f.year, month: f.month };
}

export function activeSummaryFiltersSummary(f: ActiveSummaryTableFilters): string {
  const parts: string[] = [];
  if (f.company) parts.push(f.company);
  if (f.docType) parts.push(f.docType);
  if (f.year) parts.push(f.year);
  if (f.month) parts.push(SUMMARY_MONTHS[Number(f.month) - 1] ?? f.month);
  return parts.length ? parts.join(' · ') : 'All';
}

export function buildActiveSummaryExport(
  rows: ActiveTransactionsSummaryRow[],
  tableFilters: ActiveSummaryTableFilters,
) {
  const months = visibleSummaryMonths(tableFilters.month);
  return rows.map((r) => {
    const out: Record<string, string | number> = {
      Company: r.Company,
      'Document type': r['Document type'],
      Year: r.Year,
    };
    for (const m of months) out[m] = r[m];
    out.Total = activeSummaryRowTotal(r, tableFilters.month);
    return out;
  });
}

/** Pivot documents by company, doc type, year, and month. */
export type PivotMetric = 'active' | 'cancelled';
export type PivotValueKind = 'documents' | 'lines';

export function rowLinesCount(r: Lst5yrsRow): number {
  const lines = r['Row Lines Count'];
  if (lines != null && Number.isFinite(Number(lines))) return Number(lines);
  return r['Document Count'];
}

function pivotCellValue(r: Lst5yrsRow, metric: PivotMetric, kind: PivotValueKind): number {
  if (kind === 'lines') {
    if (metric === 'cancelled' && r['Cancelled Document Count'] <= 0) return 0;
    return rowLinesCount(r);
  }
  if (metric === 'cancelled') return r['Cancelled Document Count'];
  return r['Document Count'] - r['Cancelled Document Count'];
}

function isValidPeriodRow(r: Lst5yrsRow): boolean {
  return (
    r['Year No'] != null &&
    r['Month No'] != null &&
    r['Week No'] != null &&
    Number.isFinite(r['Year No']) &&
    Number.isFinite(r['Month No']) &&
    Number.isFinite(r['Week No'])
  );
}

/** Map ISO/calendar week numbers within a year-month to W1..W5 slots. */
function weekSlotIndex(
  rows: Lst5yrsRow[],
  year: number,
  monthNo: number,
  weekNo: number,
): number | null {
  const weekNos = [
    ...new Set(
      rows
        .filter((r) => r['Year No'] === year && r['Month No'] === monthNo)
        .map((r) => r['Week No']),
    ),
  ].sort((a, b) => a - b);
  const idx = weekNos.indexOf(weekNo);
  if (idx < 0 || idx >= SUMMARY_WEEKS.length) return null;
  return idx;
}

export function buildMonthlyTransactionPivot(
  rows: Lst5yrsRow[],
  metric: PivotMetric = 'active',
  kind: PivotValueKind = 'documents',
): ActiveTransactionsSummaryRow[] {
  const map = new Map<string, { company: string; docType: string; year: number; months: number[] }>();

  for (const r of rows) {
    if (!isValidPeriodRow(r)) continue;
    const value = pivotCellValue(r, metric, kind);
    if (value <= 0) continue;
    const monthNo = r['Month No'];
    if (isFutureMonth(r['Year No'], monthNo)) continue;
    const key = `${r.Company}|${r.DocType}|${r['Year No']}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        company: r.Company,
        docType: r.DocType,
        year: r['Year No'],
        months: Array(12).fill(0),
      };
      map.set(key, entry);
    }
    const monthIdx = monthNo - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      entry.months[monthIdx] += value;
    }
  }

  return [...map.values()]
    .map((e) => {
      const months = Object.fromEntries(
        SUMMARY_MONTHS.map((label, i) => [label, e.months[i]]),
      ) as Record<(typeof SUMMARY_MONTHS)[number], number>;
      const total = SUMMARY_MONTHS.reduce((s, m, i) => {
        if (isFutureMonth(e.year, i + 1)) return s;
        return s + e.months[i];
      }, 0);
      return {
        Company: e.company,
        'Document type': e.docType,
        Year: e.year,
        ...months,
        Total: total,
      };
    })
    .filter((r) => activeSummaryRowTotal(r, '') > 0)
    .sort((a, b) => {
      if (b.Year !== a.Year) return b.Year - a.Year;
      const byCompany = a.Company.localeCompare(b.Company);
      if (byCompany) return byCompany;
      return a['Document type'].localeCompare(b['Document type']);
    });
}

export function buildWeeklyTransactionPivot(
  rows: Lst5yrsRow[],
  metric: PivotMetric = 'active',
  kind: PivotValueKind = 'documents',
): WeekTransactionsSummaryRow[] {
  const validRows = rows.filter(isValidPeriodRow);
  const map = new Map<
    string,
    { company: string; docType: string; year: number; month: number; weeks: number[] }
  >();

  for (const r of validRows) {
    const value = pivotCellValue(r, metric, kind);
    if (value <= 0) continue;
    const year = r['Year No'];
    const monthNo = r['Month No'];
    if (isFutureMonth(year, monthNo)) continue;
    const weekIdx = weekSlotIndex(validRows, year, monthNo, r['Week No']);
    if (weekIdx == null) continue;

    const key = `${r.Company}|${r.DocType}|${year}|${monthNo}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        company: r.Company,
        docType: r.DocType,
        year,
        month: monthNo,
        weeks: Array(SUMMARY_WEEKS.length).fill(0),
      };
      map.set(key, entry);
    }
    entry.weeks[weekIdx] += value;
  }

  return [...map.values()]
    .map((e) => {
      const weeks = Object.fromEntries(
        SUMMARY_WEEKS.map((label, i) => [label, e.weeks[i]]),
      ) as Record<(typeof SUMMARY_WEEKS)[number], number>;
      const total = e.weeks.reduce((s, v) => s + v, 0);
      return {
        Company: e.company,
        'Document type': e.docType,
        Year: e.year,
        Month: e.month,
        ...weeks,
        Total: total,
      };
    })
    .filter((r) => weekSummaryRowTotal(r) > 0)
    .sort((a, b) => {
      if (b.Year !== a.Year) return b.Year - a.Year;
      if (b.Month !== a.Month) return b.Month - a.Month;
      const byCompany = a.Company.localeCompare(b.Company);
      if (byCompany) return byCompany;
      return a['Document type'].localeCompare(b['Document type']);
    });
}

export function weekSummaryRowTotal(row: WeekTransactionsSummaryRow): number {
  return SUMMARY_WEEKS.reduce((sum, w) => sum + row[w], 0);
}

export function filterWeekTransactionsSummary(
  rows: WeekTransactionsSummaryRow[],
  f: ActiveSummaryTableFilters,
): WeekTransactionsSummaryRow[] {
  return rows.filter((r) => {
    if (f.company && r.Company !== f.company) return false;
    if (f.docType && r['Document type'] !== f.docType) return false;
    if (f.year && String(r.Year) !== f.year) return false;
    if (f.month && String(r.Month) !== f.month) return false;
    if (f.month && isFutureMonth(r.Year, Number(f.month))) return false;
    return weekSummaryRowTotal(r) > 0;
  });
}

export function weekSummaryFilterOptions(
  rows: WeekTransactionsSummaryRow[],
  f: ActiveSummaryTableFilters,
  field: keyof ActiveSummaryTableFilters,
): string[] {
  let pool = rows;
  if (field !== 'company' && f.company) pool = pool.filter((r) => r.Company === f.company);
  if (field !== 'docType' && f.docType) {
    pool = pool.filter((r) => r['Document type'] === f.docType);
  }
  if (field !== 'year' && f.year) pool = pool.filter((r) => String(r.Year) === f.year);
  if (field !== 'month' && f.month) pool = pool.filter((r) => String(r.Month) === f.month);

  if (field === 'company') return [...new Set(pool.map((r) => r.Company))].sort();
  if (field === 'docType') return [...new Set(pool.map((r) => r['Document type']))].sort();
  if (field === 'year') {
    return [...new Set(pool.map((r) => String(r.Year)))].sort((a, b) => Number(b) - Number(a));
  }
  if (field === 'month') {
    return [...new Set(pool.map((r) => String(r.Month)))].sort((a, b) => Number(a) - Number(b));
  }
  return [];
}

export function buildWeekPivotTotalsRow(rows: WeekTransactionsSummaryRow[]): WeekTransactionsSummaryRow {
  const weekTotals = Object.fromEntries(
    SUMMARY_WEEKS.map((w) => [w, rows.reduce((s, r) => s + r[w], 0)]),
  ) as Record<(typeof SUMMARY_WEEKS)[number], number>;
  const grand = rows.reduce((s, r) => s + weekSummaryRowTotal(r), 0);
  return {
    Company: 'Total',
    'Document type': '',
    Year: 0,
    Month: 0,
    ...weekTotals,
    Total: grand,
  };
}

export function appendWeekPivotTotalsToExport(rows: WeekTransactionsSummaryRow[]) {
  const totals = buildWeekPivotTotalsRow(rows);
  return [
    ...rows.map((r) => ({
      Company: r.Company,
      'Document type': r['Document type'],
      Year: r.Year,
      Month: r.Month,
      ...Object.fromEntries(SUMMARY_WEEKS.map((w) => [w, r[w]])),
      Total: weekSummaryRowTotal(r),
    })),
    {
      Company: 'Total',
      'Document type': '',
      Year: '',
      Month: '',
      ...Object.fromEntries(SUMMARY_WEEKS.map((w) => [w, totals[w]])),
      Total: totals.Total,
    },
  ];
}

/** Active transaction lines (row count from SP) by company, doc type, year, and month. */
export function buildActiveTransactionsSummary(rows: Lst5yrsRow[]): ActiveTransactionsSummaryRow[] {
  return buildMonthlyTransactionPivot(rows, 'active', 'lines');
}

/** Active transaction documents by company, doc type, year, and month. */
export function buildActiveTransactionsDetail(rows: Lst5yrsRow[]): ActiveTransactionsSummaryRow[] {
  return buildMonthlyTransactionPivot(rows, 'active', 'documents');
}

export function buildActiveTransactionsSummaryWeekly(rows: Lst5yrsRow[]): WeekTransactionsSummaryRow[] {
  return buildWeeklyTransactionPivot(rows, 'active', 'lines');
}

export function buildActiveTransactionsDetailWeekly(rows: Lst5yrsRow[]): WeekTransactionsSummaryRow[] {
  return buildWeeklyTransactionPivot(rows, 'active', 'documents');
}

export function buildCancelTransactionsPivot(rows: Lst5yrsRow[]): ActiveTransactionsSummaryRow[] {
  return buildMonthlyTransactionPivot(rows, 'cancelled', 'documents');
}

export function buildCancelTransactionsLines(rows: Lst5yrsRow[]): ActiveTransactionsSummaryRow[] {
  return buildMonthlyTransactionPivot(rows, 'cancelled', 'lines');
}

export function buildCancelTransactionsWeekly(rows: Lst5yrsRow[]): WeekTransactionsSummaryRow[] {
  return buildWeeklyTransactionPivot(rows, 'cancelled', 'documents');
}

export function buildCancelTransactionsLinesWeekly(rows: Lst5yrsRow[]): WeekTransactionsSummaryRow[] {
  return buildWeeklyTransactionPivot(rows, 'cancelled', 'lines');
}

export function buildPivotTotalsRow(
  rows: ActiveTransactionsSummaryRow[],
  months: readonly (typeof SUMMARY_MONTHS)[number][],
  monthFilter: string,
): ActiveTransactionsSummaryRow {
  const monthTotals = Object.fromEntries(
    SUMMARY_MONTHS.map((m, i) => [
      m,
      months.includes(m)
        ? rows.reduce((s, r) => {
            if (isFutureMonth(r.Year, i + 1)) return s;
            return s + r[m];
          }, 0)
        : 0,
    ]),
  ) as Record<(typeof SUMMARY_MONTHS)[number], number>;
  const grand = rows.reduce((s, r) => s + activeSummaryRowTotal(r, monthFilter), 0);
  return {
    Company: 'Total',
    'Document type': '',
    Year: 0,
    ...monthTotals,
    Total: grand,
  };
}

export function buildDualPivotTotalsRow(
  rows: ActiveTransactionsDualRow[],
  months: readonly (typeof SUMMARY_MONTHS)[number][],
  monthFilter: string,
): ActiveTransactionsDualRow {
  const monthTotals = Object.fromEntries(
    SUMMARY_MONTHS.map((m, i) => [
      m,
      months.includes(m)
        ? rows.reduce(
            (acc, r) => {
              if (isFutureMonth(r.Year, i + 1)) return acc;
              return { docs: acc.docs + r[m].docs, lines: acc.lines + r[m].lines };
            },
            { docs: 0, lines: 0 },
          )
        : { docs: 0, lines: 0 },
    ]),
  ) as Record<(typeof SUMMARY_MONTHS)[number], PivotCellPair>;
  const grand = rows.reduce(
    (acc, r) => {
      const t = activeDualRowTotal(r, monthFilter);
      return { docs: acc.docs + t.docs, lines: acc.lines + t.lines };
    },
    { docs: 0, lines: 0 },
  );
  return {
    Company: 'Total',
    'Document type': '',
    Year: 0,
    ...monthTotals,
    Total: grand,
  };
}

export function buildWeekDualPivotTotalsRow(rows: WeekTransactionsDualRow[]): WeekTransactionsDualRow {
  const weekTotals = Object.fromEntries(
    SUMMARY_WEEKS.map((w) => [
      w,
      rows.reduce(
        (acc, r) => ({ docs: acc.docs + r[w].docs, lines: acc.lines + r[w].lines }),
        { docs: 0, lines: 0 },
      ),
    ]),
  ) as Record<(typeof SUMMARY_WEEKS)[number], PivotCellPair>;
  const grand = rows.reduce(
    (acc, r) => {
      const t = weekDualRowTotal(r);
      return { docs: acc.docs + t.docs, lines: acc.lines + t.lines };
    },
    { docs: 0, lines: 0 },
  );
  return {
    Company: 'Total',
    'Document type': '',
    Year: 0,
    Month: 0,
    ...weekTotals,
    Total: grand,
  };
}

export function appendDualPivotTotalsToExport(
  rows: ActiveTransactionsDualRow[],
  months: readonly (typeof SUMMARY_MONTHS)[number][],
  monthFilter: string,
) {
  const totals = buildDualPivotTotalsRow(rows, months, monthFilter);
  return [
    ...rows.map((r) => {
      const total = activeDualRowTotal(r, monthFilter);
      return {
        Company: r.Company,
        'Document type': r['Document type'],
        Year: r.Year,
        ...Object.fromEntries(months.map((m) => [`${m} docs`, r[m].docs])),
        ...Object.fromEntries(months.map((m) => [`${m} lines`, r[m].lines])),
        'Total docs': total.docs,
        'Total lines': total.lines,
      };
    }),
    {
      Company: 'Total',
      'Document type': '',
      Year: '',
      ...Object.fromEntries(months.map((m) => [`${m} docs`, totals[m].docs])),
      ...Object.fromEntries(months.map((m) => [`${m} lines`, totals[m].lines])),
      'Total docs': totals.Total.docs,
      'Total lines': totals.Total.lines,
    },
  ];
}

export function appendWeekDualPivotTotalsToExport(rows: WeekTransactionsDualRow[]) {
  const totals = buildWeekDualPivotTotalsRow(rows);
  return [
    ...rows.map((r) => {
      const total = weekDualRowTotal(r);
      return {
        Company: r.Company,
        'Document type': r['Document type'],
        Year: r.Year,
        Month: r.Month,
        ...Object.fromEntries(SUMMARY_WEEKS.flatMap((w) => [[`${w} docs`, r[w].docs], [`${w} lines`, r[w].lines]])),
        'Total docs': total.docs,
        'Total lines': total.lines,
      };
    }),
    {
      Company: 'Total',
      'Document type': '',
      Year: '',
      Month: '',
      ...Object.fromEntries(SUMMARY_WEEKS.flatMap((w) => [[`${w} docs`, totals[w].docs], [`${w} lines`, totals[w].lines]])),
      'Total docs': totals.Total.docs,
      'Total lines': totals.Total.lines,
    },
  ];
}

export function filterCancelTransactionsSummary(
  rows: ActiveTransactionsSummaryRow[],
  f: ActiveSummaryTableFilters,
): ActiveTransactionsSummaryRow[] {
  return rows.filter((r) => {
    if (f.company && r.Company !== f.company) return false;
    if (f.docType && r['Document type'] !== f.docType) return false;
    if (f.year && String(r.Year) !== f.year) return false;
    if (f.month) {
      const monthNo = Number(f.month);
      if (isFutureMonth(r.Year, monthNo)) return false;
      const key = SUMMARY_MONTHS[monthNo - 1];
      if (key && r[key] <= 0) return false;
    }
    return activeSummaryRowTotal(r, '') > 0;
  });
}

const SUMMABLE_TOTAL_COLUMNS = new Set([
  'documents',
  'cancelled',
  'active',
  'total',
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]);

export function isSummableTotalColumn(col: string, sample: unknown): boolean {
  if (typeof sample !== 'number') return false;
  const lower = col.toLowerCase();
  if (lower.includes('%') || lower.includes('avg') || lower.includes('average')) return false;
  if (lower.includes('scope') || lower.includes('used')) return false;
  if (lower === 'year' || lower === 'month') return false;
  if (SUMMABLE_TOTAL_COLUMNS.has(lower)) return true;
  if (lower.includes('document')) return true;
  return false;
}

export function buildGenericTableTotalsRow(
  rows: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  const out: Record<string, unknown> = {};

  for (const col of cols) {
    if (col === cols[0]) {
      out[col] = 'Total';
      continue;
    }
    const sample = rows[0][col];
    if (isSummableTotalColumn(col, sample)) {
      out[col] = rows.reduce((s, r) => s + (Number(r[col]) || 0), 0);
      continue;
    }
    const lower = col.toLowerCase();
    if (lower.includes('cancel') && lower.includes('%')) {
      const docs = rows.reduce((s, r) => s + (Number(r.Documents) || 0), 0);
      const cancelled = rows.reduce((s, r) => s + (Number(r.Cancelled) || 0), 0);
      out[col] = docs ? ((cancelled / docs) * 100).toFixed(2) : '0';
      continue;
    }
    out[col] = '—';
  }
  return out;
}

export function buildAveragesTableTotalsRow(
  rows: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + (Number(r['Total documents']) || 0), 0);
  return {
    'Doc type': 'Total',
    'Total documents': total,
    'Average / year': '—',
    'Average / month': '—',
    'Average / day': '—',
    'Years used': '—',
    'Months used': '—',
    'Days used': '—',
  };
}

export function appendPivotTotalsToExport(
  rows: ActiveTransactionsSummaryRow[],
  months: readonly (typeof SUMMARY_MONTHS)[number][],
  monthFilter: string,
) {
  const totals = buildPivotTotalsRow(rows, months, monthFilter);
  return [
    ...rows.map((r) => ({
      Company: r.Company,
      'Document type': r['Document type'],
      Year: r.Year,
      ...Object.fromEntries(months.map((m) => [m, r[m]])),
      Total: activeSummaryRowTotal(r, monthFilter),
    })),
    {
      Company: 'Total',
      'Document type': '',
      Year: '',
      ...Object.fromEntries(months.map((m) => [m, totals[m]])),
      Total: totals.Total,
    },
  ];
}

export function buildYearTable(rows: Lst5yrsRow[]) {
  const map = new Map<number, { documents: number; cancelled: number }>();
  for (const r of rows) {
    const y = r['Year No'];
    const cur = map.get(y) ?? { documents: 0, cancelled: 0 };
    cur.documents += r['Document Count'];
    cur.cancelled += r['Cancelled Document Count'];
    map.set(y, cur);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, v]) => ({
      Year: year,
      Documents: v.documents,
      Cancelled: v.cancelled,
      Active: v.documents - v.cancelled,
      'Cancel %': v.documents ? ((v.cancelled / v.documents) * 100).toFixed(2) : '0',
    }));
}

export function buildCompanyTable(rows: Lst5yrsRow[]) {
  const map = new Map<string, { documents: number; cancelled: number }>();
  for (const r of rows) {
    const cur = map.get(r.Company) ?? { documents: 0, cancelled: 0 };
    cur.documents += r['Document Count'];
    cur.cancelled += r['Cancelled Document Count'];
    map.set(r.Company, cur);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].documents - a[1].documents)
    .map(([company, v]) => ({
      Company: company,
      Documents: v.documents,
      Cancelled: v.cancelled,
      Active: v.documents - v.cancelled,
      'Cancel %': v.documents ? ((v.cancelled / v.documents) * 100).toFixed(2) : '0',
    }));
}

export function buildDocTypeTable(rows: Lst5yrsRow[]) {
  return buildDocTypeCards(rows).map((d) => ({
    'Doc Type': d.name,
    Documents: d.documents,
    Cancelled: d.cancelled,
    Active: d.active,
    'Cancel %': d.cancelRate.toFixed(2),
  }));
}

export type DocTypeAverage = {
  name: string;
  total: number;
  yearCount: number;
  monthCount: number;
  dayCount: number;
  yearlyAvg: number;
  monthlyAvg: number;
  dailyAvg: number;
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function daysInYear(_year: number): number {
  return 300;
}

/** Denominators for averages — respects active dashboard filters and row coverage. */
function averageDenominators(
  rows: Lst5yrsRow[],
  filters: DashboardFilters,
): { years: number; months: number; days: number } {
  if (!rows.length) return { years: 0, months: 0, days: 0 };

  const year = filters.year ? Number(filters.year) : null;
  const month = filters.month ? Number(filters.month) : null;
  const week = filters.week ? Number(filters.week) : null;

  if (year != null && month != null && week != null) {
    return { years: 1, months: 1, days: 7 };
  }
  if (year != null && month != null) {
    return { years: 1, months: 1, days: daysInMonth(year, month) };
  }
  if (year != null) {
    return { years: 1, months: 12, days: daysInYear(year) };
  }

  const years = new Set<number>();
  const yearMonths = new Set<string>();
  for (const r of rows) {
    years.add(r['Year No']);
    yearMonths.add(`${r['Year No']}-${r['Month No']}`);
  }

  let days = 0;
  for (const ym of yearMonths) {
    const [y, m] = ym.split('-').map(Number);
    days += daysInMonth(y, m);
  }
  if (!days && years.size > 0) {
    days = years.size * daysInYear([...years][0]);
  }
  if (!days) {
    const weeks = new Set(rows.map((r) => `${r['Year No']}-W${r['Week No']}`));
    days = weeks.size * 7;
  }

  return {
    years: years.size,
    months: yearMonths.size,
    days,
  };
}

function averageDenominatorsForDocType(
  typeRows: Lst5yrsRow[],
  filters: DashboardFilters,
): { years: number; months: number; days: number } {
  return averageDenominators(typeRows, filters);
}

export function buildDocTypeAverages(
  rows: Lst5yrsRow[],
  filters: DashboardFilters,
): DocTypeAverage[] {
  const byType = new Map<string, { total: number; rows: Lst5yrsRow[] }>();
  for (const r of rows) {
    const cur = byType.get(r.DocType) ?? { total: 0, rows: [] };
    cur.total += r['Document Count'];
    cur.rows.push(r);
    byType.set(r.DocType, cur);
  }

  return [...byType.entries()]
    .map(([name, { total, rows: typeRows }]) => {
      const { years, months, days } = averageDenominatorsForDocType(typeRows, filters);
      return {
        name,
        total,
        yearCount: years,
        monthCount: months,
        dayCount: days,
        yearlyAvg: years ? total / years : 0,
        monthlyAvg: months ? total / months : 0,
        dailyAvg: days ? total / days : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function buildDocTypeAverageTable(averages: DocTypeAverage[]) {
  return averages.map((a) => ({
    'Doc type': a.name,
    'Total documents': a.total,
    'Average / year': Number(a.yearlyAvg.toFixed(2)),
    'Average / month': Number(a.monthlyAvg.toFixed(2)),
    'Average / day': Number(a.dailyAvg.toFixed(2)),
    'Years used': a.yearCount,
    'Months used': a.monthCount,
    'Days used': a.dayCount,
  }));
}

export function buildMonthTable(rows: Lst5yrsRow[]) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const map = new Map<string, { year: number; month: number; documents: number; cancelled: number }>();
  for (const r of rows) {
    const key = `${r['Year No']}-${r['Month No']}`;
    const cur = map.get(key) ?? {
      year: r['Year No'],
      month: r['Month No'],
      documents: 0,
      cancelled: 0,
    };
    cur.documents += r['Document Count'];
    cur.cancelled += r['Cancelled Document Count'];
    map.set(key, cur);
  }
  return [...map.values()]
    .filter((m) => !isFutureMonth(m.year, m.month))
    .filter((m) => m.documents > 0)
    .sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month))
    .map((m) => ({
      Year: m.year,
      Month: months[m.month - 1] ?? String(m.month),
      Documents: m.documents,
      Cancelled: m.cancelled,
      Active: m.documents - m.cancelled,
    }));
}
