import { useCallback, useEffect, useMemo, useState, useTransition, useDeferredValue } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ApiResponse } from './types';
import { DataTablePanel } from './components/DataTablePanel';
import { EmployeeCombobox } from './components/EmployeeCombobox';
import { FilterBusyOverlay } from './components/FilterBusyOverlay';
import { MobileBottomNav, type MobileTab } from './components/MobileBottomNav';
import { MonthlyPivotTablePanel, type PivotViewMode } from './components/MonthlyPivotTablePanel';
import { TableChartsModal, type TableChartKind } from './components/TableChartsModal';
import { TableInlineFilters } from './components/TableInlineFilters';
import {
  activeSummaryFilterOptions,
  appendPivotTotalsToExport,
  appendWeekPivotTotalsToExport,
  buildAveragesTableTotalsRow,
  buildGenericTableTotalsRow,
  emptyActiveSummaryTableFilters,
  emptyFilters,
  filterActiveTransactionsSummary,
  filterCancelTransactionsSummary,
  filterWeekTransactionsSummary,
  filterRows,
  filterRowsExcept,
  uniqueSorted,
  visibleSummaryMonths,
  type ActiveSummaryTableFilters,
  type ActiveTransactionsSummaryRow,
  type DashboardFilters,
  type EmployeeOption,
  type PivotDataMode,
} from './lib/dashboard';
import { useWlaAnalytics } from './hooks/useWlaAnalytics';
import { filterGenericTable, tableFilterOptions } from './lib/table-charts';
import { exportSheet, exportWorkbook } from './lib/excel';
import { readWlaCache, writeWlaCache } from './lib/wla-cache';

const PAGE_SIZE = 20;
const API =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD
    ? 'https://misapi.neweast.cloud/api/dashboard/lst5yrs'
    : '/api/dashboard/lst5yrs');
const EMPLOYEES_API =
  import.meta.env.VITE_API_BASE?.replace('/api/dashboard/lst5yrs', '/api/dashboard/employees') ??
  'https://misapi.neweast.cloud/api/dashboard/employees';

const COMPANY_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatNum(n: number) {
  return n.toLocaleString();
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatAvg(n: number) {
  if (n >= 100) return n.toFixed(1);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

async function yieldToMain() {
  await new Promise<void>((resolve) => {
    const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (sched?.yield) {
      void sched.yield().then(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
  fontSize: 12,
};

function ExportBtn({ onClick, label = 'Excel' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-sm" onClick={onClick}>
      {label}
    </button>
  );
}

function rowsWithTotals(
  rows: Record<string, unknown>[],
  buildTotals: (rows: Record<string, unknown>[]) => Record<string, unknown> | null = buildGenericTableTotalsRow,
) {
  const totals = buildTotals(rows);
  return totals ? [...rows, totals] : rows;
}

function exportTableWithTotals(
  rows: Record<string, unknown>[],
  filename: string,
  buildTotals: (rows: Record<string, unknown>[]) => Record<string, unknown> | null = buildGenericTableTotalsRow,
) {
  exportSheet(rowsWithTotals(rows, buildTotals), filename);
}

export default function App() {
  const [fullData, setFullData] = useState<ApiResponse | null>(null);
  const [employeeData, setEmployeeData] = useState<ApiResponse | null>(null);
  const [loadingFull, setLoadingFull] = useState(true);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadSeconds, setLoadSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | undefined>();
  const [filters, setFilters] = useState<DashboardFilters>(emptyFilters());
  const [activeTableFilters, setActiveTableFilters] = useState<ActiveSummaryTableFilters>(
    emptyActiveSummaryTableFilters(),
  );
  const [activeDetailFilters, setActiveDetailFilters] = useState<ActiveSummaryTableFilters>(
    emptyActiveSummaryTableFilters(),
  );
  const [cancelTableFilters, setCancelTableFilters] = useState<ActiveSummaryTableFilters>(
    emptyActiveSummaryTableFilters(),
  );
  const [yearTableFilters, setYearTableFilters] = useState({ year: '' });
  const [companyTableFilters, setCompanyTableFilters] = useState({ company: '' });
  const [monthTableFilters, setMonthTableFilters] = useState({ year: '', month: '' });
  const [docTypeTableFilters, setDocTypeTableFilters] = useState({ docType: '' });
  const [averageTableFilters, setAverageTableFilters] = useState({ docType: '' });
  const [page, setPage] = useState(0);
  const [activeDetailPage, setActiveDetailPage] = useState(0);
  const [cancelTablePage, setCancelTablePage] = useState(0);
  const [yearTablePage, setYearTablePage] = useState(0);
  const [companyTablePage, setCompanyTablePage] = useState(0);
  const [monthTablePage, setMonthTablePage] = useState(0);
  const [docTypeTablePage, setDocTypeTablePage] = useState(0);
  const [averageTablePage, setAverageTablePage] = useState(0);
  const [activeSummaryView, setActiveSummaryView] = useState<PivotViewMode>('month');
  const [activeSummaryDataMode, setActiveSummaryDataMode] = useState<PivotDataMode>('summary');
  const [activeDetailView, setActiveDetailView] = useState<PivotViewMode>('month');
  const [activeDetailDataMode, setActiveDetailDataMode] = useState<PivotDataMode>('summary');
  const [cancelDetailView, setCancelDetailView] = useState<PivotViewMode>('month');
  const [cancelDetailDataMode, setCancelDetailDataMode] = useState<PivotDataMode>('summary');
  const [chartsModal, setChartsModal] = useState<{
    sessionId: number;
    kind: TableChartKind;
    title: string;
    rows: Record<string, unknown>[] | ActiveTransactionsSummaryRow[];
    allActiveRows?: ActiveTransactionsSummaryRow[];
    tableGenericFilters?: Record<string, string>;
    tableActiveFilters?: ActiveSummaryTableFilters;
  } | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [pendingEmployee, setPendingEmployee] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('home');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isFilterPending, startFilterTransition] = useTransition();

  const deferredFilters = useDeferredValue(filters);
  const isDeferredStale = deferredFilters !== filters;

  const setFilter = (key: keyof DashboardFilters, value: string) => {
    startFilterTransition(() => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(0);
    });
  };

  const setActiveTableFilter = (key: keyof ActiveSummaryTableFilters, value: string) => {
    setActiveTableFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  };

  const setActiveDetailFilter = (key: keyof ActiveSummaryTableFilters, value: string) => {
    setActiveDetailFilters((prev) => ({ ...prev, [key]: value }));
    setActiveDetailPage(0);
  };

  const setCancelTableFilter = (key: keyof ActiveSummaryTableFilters, value: string) => {
    setCancelTableFilters((prev) => ({ ...prev, [key]: value }));
    setCancelTablePage(0);
  };

  const clearActiveDetailFilters = () => {
    setActiveDetailFilters(emptyActiveSummaryTableFilters());
    setActiveDetailPage(0);
  };

  const clearCancelTableFilters = () => {
    setCancelTableFilters(emptyActiveSummaryTableFilters());
    setCancelTablePage(0);
  };

  const clearActiveTableFilters = () => {
    setActiveTableFilters(emptyActiveSummaryTableFilters());
    setPage(0);
  };

  const openCharts = (
    kind: TableChartKind,
    title: string,
    rows: Record<string, unknown>[] | ActiveTransactionsSummaryRow[],
    tableGenericFilters?: Record<string, string>,
    tableActiveFilters?: ActiveSummaryTableFilters,
    allActiveRows?: ActiveTransactionsSummaryRow[],
  ) => {
    setChartsModal({
      sessionId: Date.now(),
      kind,
      title,
      rows,
      allActiveRows,
      tableGenericFilters: tableGenericFilters ? { ...tableGenericFilters } : undefined,
      tableActiveFilters: tableActiveFilters
        ? {
            company: tableActiveFilters.company,
            docType: tableActiveFilters.docType,
            year: tableActiveFilters.year,
            month: tableActiveFilters.month,
          }
        : undefined,
    });
  };

  const setEmployee = (userId: string) => {
    setFilters({
      employee: userId,
      company: '',
      docType: '',
      year: '',
      month: '',
      week: '',
      search: '',
    });
    setPage(0);
    setPendingEmployee(userId);
  };

  const applyEmployeeSearch = () => {
    if (!pendingEmployee) {
      setEmployee('');
      setEmployeeData(null);
      return;
    }
    setEmployee(pendingEmployee);
    void loadEmployeeData(pendingEmployee, pendingEmployee === filters.employee);
  };

  const clearFilters = () => {
    startFilterTransition(() => {
      setFilters(emptyFilters());
      setPage(0);
    });
    setPendingEmployee('');
    setEmployeeData(null);
  };

  const loadFullData = useCallback(async (refresh = false) => {
    let showedCache = false;

    if (!refresh) {
      const cached = await readWlaCache('');
      if (cached?.rows?.length) {
        setFullData(cached);
        setLoadingFull(false);
        showedCache = true;
        setRefreshing(true);
      }
    }

    if (!showedCache) {
      setLoadingFull(true);
      setLoadSeconds(0);
    }
    setError(null);
    setHint(undefined);
    try {
      const url = new URL(API);
      if (refresh) url.searchParams.set('_', String(Date.now()));
      const res = await fetch(url.toString());
      const text = await res.text();
      await yieldToMain();
      const json = JSON.parse(text);
      if (!res.ok) {
        if (!showedCache) {
          setError(json.error ?? res.statusText);
          setHint(json.hint);
          setFullData(null);
        }
        return;
      }
      const payload = json as ApiResponse;
      setFullData(payload);
      void writeWlaCache('', payload);
    } catch (e) {
      if (!showedCache) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      }
    } finally {
      setLoadingFull(false);
      setRefreshing(false);
    }
  }, []);

  const loadEmployeeData = useCallback(async (employeeId: string, refresh = false) => {
    if (!employeeId) return;

    let showedCache = false;
    if (!refresh) {
      const cached = await readWlaCache(employeeId);
      if (cached?.rows?.length) {
        setEmployeeData(cached);
        showedCache = true;
      }
    }

    if (!showedCache) setEmployeeLoading(true);
    setError(null);
    setHint(undefined);
    try {
      const url = new URL(API);
      url.searchParams.set('employee', employeeId);
      if (refresh) url.searchParams.set('_', String(Date.now()));
      const res = await fetch(url.toString());
      const text = await res.text();
      await yieldToMain();
      const json = JSON.parse(text);
      if (!res.ok) {
        if (!showedCache) {
          setError(json.error ?? res.statusText);
          setHint(json.hint);
        }
        return;
      }
      const payload = json as ApiResponse;
      setEmployeeData(payload);
      void writeWlaCache(employeeId, payload);
    } catch (e) {
      if (!showedCache) {
        setError(e instanceof Error ? e.message : 'Failed to load employee data');
      }
    } finally {
      setEmployeeLoading(false);
    }
  }, []);

  const handleRefresh = () => {
    if (filters.employee) {
      void loadEmployeeData(filters.employee, true);
    } else {
      void loadFullData(true);
    }
  };

  useEffect(() => {
    if (!loadingFull || fullData) return;
    const t = window.setInterval(() => setLoadSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [loadingFull, fullData]);

  useEffect(() => {
    void loadFullData();
  }, [loadFullData]);

  useEffect(() => {
    fetch(EMPLOYEES_API)
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json.employees)) setEmployees(json.employees as EmployeeOption[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.body.classList.toggle('filters-open', mobileFiltersOpen);
    return () => document.body.classList.remove('filters-open');
  }, [mobileFiltersOpen]);

  useEffect(() => {
    setPendingEmployee(filters.employee);
  }, [filters.employee]);

  const metaSource =
    filters.employee && employeeData ? employeeData : fullData;
  const rows = useMemo(() => {
    if (filters.employee && employeeData?.rows?.length) return employeeData.rows;
    return fullData?.rows ?? [];
  }, [filters.employee, employeeData, fullData]);
  const selectedEmployee = useMemo(
    () => employees.find((e) => e.userId === filters.employee),
    [employees, filters.employee],
  );
  const filtered = useMemo(() => filterRows(rows, deferredFilters), [rows, deferredFilters]);

  const showEmployeeOverlay = employeeLoading && filters.employee && !employeeData;
  const { totals, analytics, isStale: isAnalyticsStale } = useWlaAnalytics(filtered, deferredFilters);
  const isBusy = isFilterPending || isDeferredStale || showEmployeeOverlay || isAnalyticsStale;

  const {
    docTypeCards,
    yearTable,
    companyTable,
    docTypeTable,
    docTypeAverages,
    docTypeAverageTable,
    monthTable,
    activeSummaryDocs,
    activeSummaryLines,
    activeSummaryWeeklyDocs,
    activeSummaryWeeklyLines,
    activeDetailPivot,
    activeDetailLines,
    activeDetailWeekly,
    activeDetailWeeklyLines,
    cancelDetailPivot,
    cancelDetailLines,
    cancelDetailWeekly,
    cancelDetailWeeklyLines,
  } = analytics;

  const activeFilterCount = useMemo(
    () =>
      [
        filters.employee,
        filters.company,
        filters.docType,
        filters.year,
        filters.month,
        filters.week,
        filters.search,
      ].filter(Boolean).length,
    [filters],
  );

  const companyOptions = useMemo(
    () => uniqueSorted(filterRowsExcept(rows, deferredFilters, 'company'), (r) => r.Company) as string[],
    [rows, deferredFilters],
  );
  const docTypeOptions = useMemo(
    () => uniqueSorted(filterRowsExcept(rows, deferredFilters, 'docType'), (r) => r.DocType) as string[],
    [rows, deferredFilters],
  );
  const yearOptions = useMemo(
    () => uniqueSorted(filterRowsExcept(rows, deferredFilters, 'year'), (r) => r['Year No']) as number[],
    [rows, deferredFilters],
  );
  const monthOptions = useMemo(
    () =>
      uniqueSorted(filterRowsExcept(rows, deferredFilters, 'month'), (r) => r['Month No'], 'asc') as number[],
    [rows, deferredFilters],
  );
  const weekOptions = useMemo(
    () => uniqueSorted(filterRowsExcept(rows, deferredFilters, 'week'), (r) => r['Week No']) as number[],
    [rows, deferredFilters],
  );

  const cancelRate = totals.docs ? (totals.cancelled / totals.docs) * 100 : 0;
  const maxDocTypeDocs = docTypeCards[0]?.documents ?? 1;

  const activeSummaryFiltered = useMemo(
    () => filterActiveTransactionsSummary(activeSummaryDocs, activeTableFilters),
    [activeSummaryDocs, activeTableFilters],
  );
  const activeSummaryLinesFiltered = useMemo(
    () => filterActiveTransactionsSummary(activeSummaryLines, activeTableFilters),
    [activeSummaryLines, activeTableFilters],
  );
  const activeSummaryWeeklyFiltered = useMemo(
    () => filterWeekTransactionsSummary(activeSummaryWeeklyDocs, activeTableFilters),
    [activeSummaryWeeklyDocs, activeTableFilters],
  );
  const activeSummaryWeeklyLinesFiltered = useMemo(
    () => filterWeekTransactionsSummary(activeSummaryWeeklyLines, activeTableFilters),
    [activeSummaryWeeklyLines, activeTableFilters],
  );
  const activeDetailFiltered = useMemo(
    () => filterActiveTransactionsSummary(activeDetailPivot, activeDetailFilters),
    [activeDetailPivot, activeDetailFilters],
  );
  const activeDetailLinesFiltered = useMemo(
    () => filterActiveTransactionsSummary(activeDetailLines, activeDetailFilters),
    [activeDetailLines, activeDetailFilters],
  );
  const activeDetailWeeklyFiltered = useMemo(
    () => filterWeekTransactionsSummary(activeDetailWeekly, activeDetailFilters),
    [activeDetailWeekly, activeDetailFilters],
  );
  const activeDetailWeeklyLinesFiltered = useMemo(
    () => filterWeekTransactionsSummary(activeDetailWeeklyLines, activeDetailFilters),
    [activeDetailWeeklyLines, activeDetailFilters],
  );
  const cancelDetailFiltered = useMemo(
    () => filterCancelTransactionsSummary(cancelDetailPivot, cancelTableFilters),
    [cancelDetailPivot, cancelTableFilters],
  );
  const cancelDetailLinesFiltered = useMemo(
    () => filterCancelTransactionsSummary(cancelDetailLines, cancelTableFilters),
    [cancelDetailLines, cancelTableFilters],
  );
  const cancelDetailWeeklyFiltered = useMemo(
    () => filterWeekTransactionsSummary(cancelDetailWeekly, cancelTableFilters),
    [cancelDetailWeekly, cancelTableFilters],
  );
  const cancelDetailWeeklyLinesFiltered = useMemo(
    () => filterWeekTransactionsSummary(cancelDetailWeeklyLines, cancelTableFilters),
    [cancelDetailWeeklyLines, cancelTableFilters],
  );

  const activeSummaryExport = useMemo(() => {
    const monthRows =
      activeSummaryDataMode === 'details' ? activeSummaryLinesFiltered : activeSummaryFiltered;
    const weekRows =
      activeSummaryDataMode === 'details'
        ? activeSummaryWeeklyLinesFiltered
        : activeSummaryWeeklyFiltered;
    return activeSummaryView === 'month'
      ? appendPivotTotalsToExport(
          monthRows,
          visibleSummaryMonths(activeTableFilters.month),
          activeTableFilters.month,
        )
      : appendWeekPivotTotalsToExport(weekRows);
  }, [
    activeSummaryDataMode,
    activeSummaryView,
    activeSummaryFiltered,
    activeSummaryLinesFiltered,
    activeSummaryWeeklyFiltered,
    activeSummaryWeeklyLinesFiltered,
    activeTableFilters.month,
  ]);
  const activeDetailExport = useMemo(() => {
    const monthRows =
      activeDetailDataMode === 'details' ? activeDetailLinesFiltered : activeDetailFiltered;
    const weekRows =
      activeDetailDataMode === 'details'
        ? activeDetailWeeklyLinesFiltered
        : activeDetailWeeklyFiltered;
    return activeDetailView === 'month'
      ? appendPivotTotalsToExport(
          monthRows,
          visibleSummaryMonths(activeDetailFilters.month),
          activeDetailFilters.month,
        )
      : appendWeekPivotTotalsToExport(weekRows);
  }, [
    activeDetailDataMode,
    activeDetailView,
    activeDetailFiltered,
    activeDetailLinesFiltered,
    activeDetailWeeklyFiltered,
    activeDetailWeeklyLinesFiltered,
    activeDetailFilters.month,
  ]);
  const cancelDetailExport = useMemo(() => {
    const monthRows =
      cancelDetailDataMode === 'details' ? cancelDetailLinesFiltered : cancelDetailFiltered;
    const weekRows =
      cancelDetailDataMode === 'details'
        ? cancelDetailWeeklyLinesFiltered
        : cancelDetailWeeklyFiltered;
    return cancelDetailView === 'month'
      ? appendPivotTotalsToExport(
          monthRows,
          visibleSummaryMonths(cancelTableFilters.month),
          cancelTableFilters.month,
        )
      : appendWeekPivotTotalsToExport(weekRows);
  }, [
    cancelDetailDataMode,
    cancelDetailView,
    cancelDetailFiltered,
    cancelDetailLinesFiltered,
    cancelDetailWeeklyFiltered,
    cancelDetailWeeklyLinesFiltered,
    cancelTableFilters.month,
  ]);
  const activeSummaryMonths = useMemo(
    () => visibleSummaryMonths(activeTableFilters.month),
    [activeTableFilters.month],
  );
  const activeSummaryCompanyOptions = useMemo(
    () => activeSummaryFilterOptions(activeSummaryDocs, activeTableFilters, 'company'),
    [activeSummaryDocs, activeTableFilters],
  );
  const activeSummaryDocTypeOptions = useMemo(
    () => activeSummaryFilterOptions(activeSummaryDocs, activeTableFilters, 'docType'),
    [activeSummaryDocs, activeTableFilters],
  );
  const activeSummaryYearOptions = useMemo(
    () => activeSummaryFilterOptions(activeSummaryDocs, activeTableFilters, 'year'),
    [activeSummaryDocs, activeTableFilters],
  );
  const activeSummaryMonthOptions = useMemo(
    () => activeSummaryFilterOptions(activeSummaryDocs, activeTableFilters, 'month'),
    [activeSummaryDocs, activeTableFilters],
  );
  const activeDetailMonths = useMemo(
    () => visibleSummaryMonths(activeDetailFilters.month),
    [activeDetailFilters.month],
  );
  const cancelDetailMonths = useMemo(
    () => visibleSummaryMonths(cancelTableFilters.month),
    [cancelTableFilters.month],
  );
  const activeDetailCompanyOptions = useMemo(
    () => activeSummaryFilterOptions(activeDetailPivot, activeDetailFilters, 'company'),
    [activeDetailPivot, activeDetailFilters],
  );
  const activeDetailDocTypeOptions = useMemo(
    () => activeSummaryFilterOptions(activeDetailPivot, activeDetailFilters, 'docType'),
    [activeDetailPivot, activeDetailFilters],
  );
  const activeDetailYearOptions = useMemo(
    () => activeSummaryFilterOptions(activeDetailPivot, activeDetailFilters, 'year'),
    [activeDetailPivot, activeDetailFilters],
  );
  const activeDetailMonthOptions = useMemo(
    () => activeSummaryFilterOptions(activeDetailPivot, activeDetailFilters, 'month'),
    [activeDetailPivot, activeDetailFilters],
  );
  const cancelCompanyOptions = useMemo(
    () => activeSummaryFilterOptions(cancelDetailPivot, cancelTableFilters, 'company'),
    [cancelDetailPivot, cancelTableFilters],
  );
  const cancelDocTypeOptions = useMemo(
    () => activeSummaryFilterOptions(cancelDetailPivot, cancelTableFilters, 'docType'),
    [cancelDetailPivot, cancelTableFilters],
  );
  const cancelYearOptions = useMemo(
    () => activeSummaryFilterOptions(cancelDetailPivot, cancelTableFilters, 'year'),
    [cancelDetailPivot, cancelTableFilters],
  );
  const cancelMonthOptions = useMemo(
    () => activeSummaryFilterOptions(cancelDetailPivot, cancelTableFilters, 'month'),
    [cancelDetailPivot, cancelTableFilters],
  );

  const yearTableFiltered = useMemo(
    () => filterGenericTable(yearTable as Record<string, unknown>[], yearTableFilters),
    [yearTable, yearTableFilters],
  );
  const companyTableFiltered = useMemo(
    () => filterGenericTable(companyTable as Record<string, unknown>[], companyTableFilters),
    [companyTable, companyTableFilters],
  );
  const monthTableFiltered = useMemo(
    () => filterGenericTable(monthTable as Record<string, unknown>[], monthTableFilters),
    [monthTable, monthTableFilters],
  );
  const docTypeTableFiltered = useMemo(
    () => filterGenericTable(docTypeTable as Record<string, unknown>[], docTypeTableFilters),
    [docTypeTable, docTypeTableFilters],
  );
  const averageTableFiltered = useMemo(
    () => filterGenericTable(docTypeAverageTable as Record<string, unknown>[], averageTableFilters),
    [docTypeAverageTable, averageTableFilters],
  );

  const byYear = useMemo(
    () =>
      yearTable.map((r) => ({
        year: r.Year,
        documents: r.Documents as number,
        cancelled: r.Cancelled as number,
        active: r.Active as number,
        cancelRate: parseFloat(String(r['Cancel %'])),
      })),
    [yearTable],
  );

  const byCompanyPie = useMemo(() => {
    const top = companyTable.slice(0, 8).map((r) => ({ name: r.Company as string, value: r.Documents as number }));
    const other = companyTable.slice(8).reduce((s, r) => s + (r.Documents as number), 0);
    if (other > 0) top.push({ name: 'Other', value: other });
    return top;
  }, [companyTable]);

  const byDocTypeChart = useMemo(() => docTypeCards.slice(0, 10), [docTypeCards]);

  const byMonth = useMemo(
    () =>
      monthTable.slice(0, 24).map((m) => ({
        label: `${m.Year} ${m.Month}`,
        documents: m.Documents as number,
        cancelled: m.Cancelled as number,
      })),
    [monthTable],
  );

  const exportAll = () => {
    exportWorkbook(
      [
        { name: 'By Year', data: rowsWithTotals(yearTableFiltered as Record<string, unknown>[]) },
        { name: 'By Company', data: rowsWithTotals(companyTableFiltered as Record<string, unknown>[]) },
        { name: 'By Doc Type', data: rowsWithTotals(docTypeTableFiltered as Record<string, unknown>[]) },
        { name: 'Averages', data: rowsWithTotals(averageTableFiltered as Record<string, unknown>[]) },
        { name: 'Active Summary', data: activeSummaryExport },
        { name: 'Active Details', data: activeDetailExport },
        { name: 'Cancel Details', data: cancelDetailExport },
        { name: 'By Month', data: rowsWithTotals(monthTableFiltered as Record<string, unknown>[]) },
      ],
      `MIS_AllDBs_${new Date().toISOString().slice(0, 10)}`,
    );
  };

  if (loadingFull && !fullData) {
    return (
      <div className="app app-loading">
        <div className="spinner" />
        <p>Loading from SAP HANA…</p>
        <p className="load-hint">
          First load can take 15–30 seconds while data is fetched from the database.
          {loadSeconds > 0 && <> ({loadSeconds}s)</>}
        </p>
      </div>
    );
  }

  return (
    <div className={`app app-shell${mobileFiltersOpen ? ' filters-open' : ''}`} data-mobile-tab={mobileTab}>
      <header className="top-bar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="NEWEAST" />
          <div>
            <h1>Work Load Analysis</h1>
            <span className="viewer-badge">
              {selectedEmployee ? (
                <>
                  Filtered by: {selectedEmployee.name}
                  {(metaSource?.employeeCompanies?.length ?? 0) > 0 && (
                    <> · {metaSource!.employeeCompanies!.join(', ')}</>
                  )}
                </>
              ) : (
                'All data (all employees / companies)'
              )}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-sm mobile-filter-trigger"
            onClick={() => setMobileFiltersOpen(true)}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          <button type="button" className="btn desktop-only" onClick={exportAll} disabled={!filtered.length}>
            Export all
          </button>
          <button type="button" className="btn btn-primary" onClick={handleRefresh} disabled={loadingFull || refreshing || employeeLoading}>
            {loadingFull || refreshing || employeeLoading ? '…' : 'Refresh'}
          </button>
        </div>
      </header>

      {refreshing && !isBusy && (
        <div className="refresh-banner" role="status">
          Updating data from SAP HANA…
        </div>
      )}

      {error && (
        <div className="alert-error">
          <strong>Error:</strong> {error}
          {hint && <p style={{ margin: '0.5rem 0 0' }}>{hint}</p>}
        </div>
      )}

      <button
        type="button"
        className="filters-backdrop"
        aria-label="Close filters"
        onClick={() => setMobileFiltersOpen(false)}
      />

      <div className={`panel filters-panel${mobileFiltersOpen ? ' open' : ''}`}>
        <div className="panel-head">
          <h3>Filters</h3>
          <div className="panel-head-actions">
            <button type="button" className="btn btn-sm" onClick={clearFilters}>
              Clear all
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary mobile-filters-apply"
              onClick={() => setMobileFiltersOpen(false)}
            >
              Apply
            </button>
          </div>
        </div>
        <div className="filters-toolbar">
          <div className="employee-filter-block">
            <span className="employee-filter-label">Employee scope</span>
            <EmployeeCombobox
              employees={employees}
              value={pendingEmployee}
              onChange={setPendingEmployee}
              onSearch={applyEmployeeSearch}
              searching={employeeLoading}
            />
          </div>
          <div className="filters-row">
          <label>
            Company
            <select
              value={filters.company}
              onChange={(e) => setFilter('company', e.target.value)}
            >
              <option value="">All companies</option>
              {companyOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Document type
            <select
              value={filters.docType}
              onChange={(e) => setFilter('docType', e.target.value)}
            >
              <option value="">All types</option>
              {docTypeOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            Year
            <select
              value={filters.year}
              onChange={(e) => setFilter('year', e.target.value)}
            >
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            Month
            <select
              value={filters.month}
              onChange={(e) => setFilter('month', e.target.value)}
            >
              <option value="">All months</option>
              {monthOptions.map((m) => (
                <option key={m} value={String(m)}>{MONTH_NAMES[m - 1] ?? m}</option>
              ))}
            </select>
          </label>
          <label>
            Week
            <select
              value={filters.week}
              onChange={(e) => setFilter('week', e.target.value)}
            >
              <option value="">All weeks</option>
              {weekOptions.map((w) => (
                <option key={w} value={String(w)}>Week {w}</option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input
              type="search"
              className="filter-input"
              placeholder="Company or doc type…"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
          </label>
          </div>
        </div>
        <p className="meta filters-hint">
          Without an employee: full company statistics. With an employee: only documents they created (UserSign).
        </p>
      </div>

      {fullData && (
        <div className={`dashboard-content${isBusy ? ' is-busy' : ''}`}>
          {isBusy && (
            <FilterBusyOverlay
              message={
                showEmployeeOverlay
                  ? 'Loading employee data…'
                  : refreshing
                    ? 'Syncing from SAP HANA…'
                    : 'Applying filters…'
              }
              submessage={
                showEmployeeOverlay
                  ? 'Full statistics remain visible below'
                  : refreshing
                    ? 'Updating in the background'
                    : 'Recalculating charts and tables'
              }
            />
          )}
          <div className="dashboard-content-inner">
        <>
          <div className="mobile-section mobile-tab-home" data-mobile-tab="home">
          <div className="kpi-grid">
            <div className="kpi-card blue">
              <label>Total documents</label>
              <strong>{formatNum(totals.docs)}</strong>
            </div>
            <div className="kpi-card green">
              <label>Active documents</label>
              <strong>{formatNum(totals.active)}</strong>
            </div>
            <div className="kpi-card amber">
              <label>Cancelled</label>
              <strong>{formatNum(totals.cancelled)}</strong>
            </div>
            <div className="kpi-card red">
              <label>Cancellation rate</label>
              <strong>{cancelRate.toFixed(2)}%</strong>
            </div>
          </div>
          </div>

          <div className="mobile-section mobile-tab-analysis" data-mobile-tab="analysis">
          <div className="panel">
            <div className="panel-head">
              <h3>Document types ({docTypeCards.length})</h3>
              <div className="panel-head-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-soft"
                  onClick={() =>
                    openCharts('docType', 'Document types — Charts', docTypeTable, { ...docTypeTableFilters })
                  }
                >
                  View as charts
                </button>
                <ExportBtn onClick={() => exportSheet(docTypeTable, 'MIS_By_DocType')} />
              </div>
            </div>
            <div className="doc-type-grid">
              {docTypeCards.map((card, i) => (
                <button
                  key={card.name}
                  type="button"
                  className={`doc-type-card ${filters.docType === card.name ? 'active' : ''}`}
                  onClick={() => setFilter('docType', filters.docType === card.name ? '' : card.name)}
                >
                  <div className="doc-type-card-top">
                    <span className="doc-type-rank">#{i + 1}</span>
                    <span className="doc-type-name" title={card.name}>{card.name}</span>
                  </div>
                  <strong>{formatNum(card.documents)}</strong>
                  <small>Cancelled: {formatNum(card.cancelled)} · {card.cancelRate.toFixed(1)}%</small>
                  <div className="doc-type-bar">
                    <div
                      className="doc-type-bar-fill"
                      style={{
                        width: `${(card.documents / maxDocTypeDocs) * 100}%`,
                        background: COMPANY_COLORS[i % COMPANY_COLORS.length],
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Average ({docTypeAverages.length})</h3>
              <div className="panel-head-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-soft"
                  onClick={() =>
                    openCharts('average', 'Averages — Charts', docTypeAverageTable, { ...averageTableFilters })
                  }
                >
                  View as charts
                </button>
                <ExportBtn onClick={() => exportSheet(docTypeAverageTable, 'MIS_Averages')} />
              </div>
            </div>
            <p className="meta average-note">
              Per document type — Total documents ÷ years / months / days used = averages below.
            </p>
            <div className="average-grid">
              {docTypeAverages.map((item, i) => (
                <div
                  key={item.name}
                  className={`average-card ${filters.docType === item.name ? 'active' : ''}`}
                >
                  <div className="average-card-head">
                    <span className="doc-type-rank">#{i + 1}</span>
                    <span className="average-doc-type" title={item.name}>{item.name}</span>
                    <button
                      type="button"
                      className="average-filter-btn"
                      onClick={() => setFilter('docType', filters.docType === item.name ? '' : item.name)}
                    >
                      {filters.docType === item.name ? 'Clear' : 'Filter'}
                    </button>
                  </div>
                  <div className="average-metrics">
                    <div className="average-metric">
                      <label>Yearly avg</label>
                      <strong>{formatAvg(item.yearlyAvg)}</strong>
                      <small>{item.yearCount} year{item.yearCount === 1 ? '' : 's'}</small>
                    </div>
                    <div className="average-metric">
                      <label>Monthly avg</label>
                      <strong>{formatAvg(item.monthlyAvg)}</strong>
                      <small>{item.monthCount} month{item.monthCount === 1 ? '' : 's'}</small>
                    </div>
                    <div className="average-metric">
                      <label>Daily avg</label>
                      <strong>{formatAvg(item.dailyAvg)}</strong>
                      <small>{formatNum(item.dayCount)} days</small>
                    </div>
                  </div>
                  <div className="average-total">
                    Total: {formatNum(item.total)} documents
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DataTablePanel
            title="Summary by document type"
            rowCount={docTypeTableFiltered.length}
            rows={docTypeTableFiltered}
            page={docTypeTablePage}
            onPageChange={setDocTypeTablePage}
            onExport={() => exportTableWithTotals(docTypeTableFiltered as Record<string, unknown>[], 'MIS_By_DocType_Table')}
            onViewCharts={() =>
              openCharts('docType', 'Document types — Charts', docTypeTable, { ...docTypeTableFilters })
            }
            onClearFilters={() => {
              setDocTypeTableFilters({ docType: '' });
              setDocTypeTablePage(0);
            }}
            filters={
              <TableInlineFilters
                filters={[
                  {
                    key: 'docType',
                    label: 'Document type',
                    value: docTypeTableFilters.docType,
                    options: tableFilterOptions(
                      docTypeTable as Record<string, unknown>[],
                      'docType',
                      docTypeTableFilters,
                    ),
                    onChange: (v) => {
                      setDocTypeTableFilters({ docType: v });
                      setDocTypeTablePage(0);
                    },
                  },
                ]}
              />
            }
          />

          <DataTablePanel
            title="Averages by document type"
            rowCount={averageTableFiltered.length}
            rows={averageTableFiltered}
            page={averageTablePage}
            onPageChange={setAverageTablePage}
            buildTotalsRow={buildAveragesTableTotalsRow}
            tableClassName="data-table-averages"
            tableNote={
              <p className="meta table-panel-note">
                <strong>How to read:</strong> Averages are Total documents divided by the number of years,
                months, or calendar days where this type has activity. &quot;Years / Months / Days used&quot;
                show the divisor for each row.
              </p>
            }
            onExport={() =>
              exportTableWithTotals(
                averageTableFiltered as Record<string, unknown>[],
                'MIS_Averages_Table',
                buildAveragesTableTotalsRow,
              )
            }
            onViewCharts={() =>
              openCharts('average', 'Averages — Charts', docTypeAverageTable, { ...averageTableFilters })
            }
            onClearFilters={() => {
              setAverageTableFilters({ docType: '' });
              setAverageTablePage(0);
            }}
            filters={
              <TableInlineFilters
                filters={[
                  {
                    key: 'docType',
                    label: 'Document type',
                    value: averageTableFilters.docType,
                    options: tableFilterOptions(
                      docTypeAverageTable as Record<string, unknown>[],
                      'docType',
                      averageTableFilters,
                    ),
                    onChange: (v) => {
                      setAverageTableFilters({ docType: v });
                      setAverageTablePage(0);
                    },
                  },
                ]}
              />
            }
          />
          </div>

          <div className="mobile-section mobile-tab-charts" data-mobile-tab="charts">
          <div className="charts-grid">
            <div className="panel chart-span-8">
              <div className="panel-head">
                <h3>Documents & cancellation by year</h3>
                <ExportBtn onClick={() => exportSheet(yearTable, 'MIS_By_Year')} />
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={byYear}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis yAxisId="left" tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="active" name="Active" stackId="a" fill="#3B82F6" />
                    <Bar yAxisId="left" dataKey="cancelled" name="Cancelled" stackId="a" fill="#FCA5A5" />
                    <Line yAxisId="right" type="monotone" dataKey="cancelRate" name="Cancel %" stroke="#DC2626" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel chart-span-4">
              <div className="panel-head">
                <h3>Share by company</h3>
                <ExportBtn onClick={() => exportSheet(companyTable, 'MIS_By_Company')} />
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={byCompanyPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={88} paddingAngle={2}>
                      {byCompanyPie.map((_, i) => (
                        <Cell key={i} fill={COMPANY_COLORS[i % COMPANY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNum(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel chart-span-6">
              <div className="panel-head">
                <h3>Top document types</h3>
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={byDocTypeChart} layout="vertical" margin={{ left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatCompact} />
                    <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="documents" radius={[0, 6, 6, 0]}>
                      {byDocTypeChart.map((_, i) => (
                        <Cell key={i} fill={COMPANY_COLORS[i % COMPANY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel chart-span-6">
              <div className="panel-head">
                <h3>Monthly volume</h3>
                <ExportBtn onClick={() => exportSheet(monthTable, 'MIS_By_Month')} />
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
                    <YAxis tickFormatter={formatCompact} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Area type="monotone" dataKey="documents" stroke="#3B82F6" fill="#93C5FD" fillOpacity={0.35} />
                    <Area type="monotone" dataKey="cancelled" stroke="#EF4444" fill="#FECACA" fillOpacity={0.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          </div>

          <div className="mobile-section mobile-tab-data" data-mobile-tab="data">
          <DataTablePanel
            title="Summary by year"
            rowCount={yearTableFiltered.length}
            rows={yearTableFiltered}
            page={yearTablePage}
            onPageChange={setYearTablePage}
            onExport={() => exportTableWithTotals(yearTableFiltered as Record<string, unknown>[], 'MIS_By_Year')}
            onViewCharts={() =>
              openCharts('year', 'Summary by year — Charts', yearTable, { ...yearTableFilters })
            }
            onClearFilters={() => {
              setYearTableFilters({ year: '' });
              setYearTablePage(0);
            }}
            filters={
              <TableInlineFilters
                filters={[
                  {
                    key: 'year',
                    label: 'Year',
                    value: yearTableFilters.year,
                    options: tableFilterOptions(yearTable as Record<string, unknown>[], 'year', yearTableFilters),
                    onChange: (v) => {
                      setYearTableFilters({ year: v });
                      setYearTablePage(0);
                    },
                  },
                ]}
              />
            }
          />

          <DataTablePanel
            title="Summary by company"
            rowCount={companyTableFiltered.length}
            rows={companyTableFiltered}
            page={companyTablePage}
            onPageChange={setCompanyTablePage}
            onExport={() => exportTableWithTotals(companyTableFiltered as Record<string, unknown>[], 'MIS_By_Company')}
            onViewCharts={() =>
              openCharts('company', 'Summary by company — Charts', companyTable, { ...companyTableFilters })
            }
            onClearFilters={() => {
              setCompanyTableFilters({ company: '' });
              setCompanyTablePage(0);
            }}
            filters={
              <TableInlineFilters
                filters={[
                  {
                    key: 'company',
                    label: 'Company',
                    value: companyTableFilters.company,
                    options: tableFilterOptions(
                      companyTable as Record<string, unknown>[],
                      'company',
                      companyTableFilters,
                    ),
                    onChange: (v) => {
                      setCompanyTableFilters({ company: v });
                      setCompanyTablePage(0);
                    },
                  },
                ]}
              />
            }
          />

          <DataTablePanel
            title="Summary by month"
            rowCount={monthTableFiltered.length}
            rows={monthTableFiltered}
            page={monthTablePage}
            onPageChange={setMonthTablePage}
            onExport={() => exportTableWithTotals(monthTableFiltered as Record<string, unknown>[], 'MIS_By_Month')}
            onViewCharts={() =>
              openCharts('month', 'Summary by month — Charts', monthTable, { ...monthTableFilters })
            }
            onClearFilters={() => {
              setMonthTableFilters({ year: '', month: '' });
              setMonthTablePage(0);
            }}
            filters={
              <TableInlineFilters
                filters={[
                  {
                    key: 'year',
                    label: 'Year',
                    value: monthTableFilters.year,
                    options: tableFilterOptions(monthTable as Record<string, unknown>[], 'year', monthTableFilters),
                    onChange: (v) => {
                      setMonthTableFilters((prev) => ({ ...prev, year: v }));
                      setMonthTablePage(0);
                    },
                  },
                  {
                    key: 'month',
                    label: 'Month',
                    value: monthTableFilters.month,
                    options: tableFilterOptions(monthTable as Record<string, unknown>[], 'month', monthTableFilters),
                    onChange: (v) => {
                      setMonthTableFilters((prev) => ({ ...prev, month: v }));
                      setMonthTablePage(0);
                    },
                  },
                ]}
              />
            }
          />

          <MonthlyPivotTablePanel
            title="Details Active Transactions Summary"
            viewMode={activeSummaryView}
            onViewModeChange={(mode) => {
              setActiveSummaryView(mode);
              setPage(0);
            }}
            dataMode={activeSummaryDataMode}
            onDataModeChange={(mode) => {
              setActiveSummaryDataMode(mode);
              setPage(0);
            }}
            monthRows={activeSummaryFiltered}
            weekRows={activeSummaryWeeklyFiltered}
            detailMonthRows={activeSummaryLinesFiltered}
            detailWeekRows={activeSummaryWeeklyLinesFiltered}
            months={activeSummaryMonths}
            monthFilter={activeTableFilters.month}
            page={page}
            onPageChange={setPage}
            onExport={() => exportSheet(activeSummaryExport, 'MIS_Active_Summary')}
            onViewCharts={() =>
              openCharts(
                'active',
                activeSummaryDataMode === 'details'
                  ? 'Active Transactions Summary (Lines) — Charts'
                  : 'Active Transactions Summary — Charts',
                activeSummaryDataMode === 'details' ? activeSummaryLines : activeSummaryDocs,
                undefined,
                { ...activeTableFilters },
                activeSummaryDataMode === 'details' ? activeSummaryLines : activeSummaryDocs,
              )
            }
            formatNum={formatNum}
            onClearFilters={clearActiveTableFilters}
            filters={
              <TableInlineFilters
                filters={[
                  {
                    key: 'company',
                    label: 'Company',
                    value: activeTableFilters.company,
                    options: activeSummaryCompanyOptions,
                    onChange: (v) => setActiveTableFilter('company', v),
                  },
                  {
                    key: 'docType',
                    label: 'Doc type',
                    value: activeTableFilters.docType,
                    options: activeSummaryDocTypeOptions,
                    onChange: (v) => setActiveTableFilter('docType', v),
                  },
                  {
                    key: 'year',
                    label: 'Year',
                    value: activeTableFilters.year,
                    options: activeSummaryYearOptions,
                    onChange: (v) => setActiveTableFilter('year', v),
                  },
                  {
                    key: 'month',
                    label: 'Month',
                    value: activeTableFilters.month,
                    options: activeSummaryMonthOptions,
                    onChange: (v) => setActiveTableFilter('month', v),
                    optionLabel: (v) => MONTH_NAMES[Number(v) - 1] ?? v,
                  },
                ]}
              />
            }
          />

          <MonthlyPivotTablePanel
            title="Details active Transactions"
            viewMode={activeDetailView}
            onViewModeChange={(mode) => {
              setActiveDetailView(mode);
              setActiveDetailPage(0);
            }}
            dataMode={activeDetailDataMode}
            onDataModeChange={(mode) => {
              setActiveDetailDataMode(mode);
              setActiveDetailPage(0);
            }}
            monthRows={activeDetailFiltered}
            weekRows={activeDetailWeeklyFiltered}
            detailMonthRows={activeDetailLinesFiltered}
            detailWeekRows={activeDetailWeeklyLinesFiltered}
            months={activeDetailMonths}
            monthFilter={activeDetailFilters.month}
            page={activeDetailPage}
            onPageChange={setActiveDetailPage}
            onExport={() => exportSheet(activeDetailExport, 'MIS_Active_Details')}
            onViewCharts={() =>
              openCharts(
                'active',
                activeDetailDataMode === 'details'
                  ? 'Details active Transactions (Lines) — Charts'
                  : 'Details active Transactions — Charts',
                activeDetailDataMode === 'details' ? activeDetailLines : activeDetailPivot,
                undefined,
                { ...activeDetailFilters },
                activeDetailDataMode === 'details' ? activeDetailLines : activeDetailPivot,
              )
            }
            formatNum={formatNum}
            onClearFilters={clearActiveDetailFilters}
            filters={
              <TableInlineFilters
                filters={[
                  {
                    key: 'company',
                    label: 'Company',
                    value: activeDetailFilters.company,
                    options: activeDetailCompanyOptions,
                    onChange: (v) => setActiveDetailFilter('company', v),
                  },
                  {
                    key: 'docType',
                    label: 'Doc type',
                    value: activeDetailFilters.docType,
                    options: activeDetailDocTypeOptions,
                    onChange: (v) => setActiveDetailFilter('docType', v),
                  },
                  {
                    key: 'year',
                    label: 'Year',
                    value: activeDetailFilters.year,
                    options: activeDetailYearOptions,
                    onChange: (v) => setActiveDetailFilter('year', v),
                  },
                  {
                    key: 'month',
                    label: 'Month',
                    value: activeDetailFilters.month,
                    options: activeDetailMonthOptions,
                    onChange: (v) => setActiveDetailFilter('month', v),
                    optionLabel: (v) => MONTH_NAMES[Number(v) - 1] ?? v,
                  },
                ]}
              />
            }
          />

          <MonthlyPivotTablePanel
            title="Details Cancel Transactions"
            viewMode={cancelDetailView}
            onViewModeChange={(mode) => {
              setCancelDetailView(mode);
              setCancelTablePage(0);
            }}
            dataMode={cancelDetailDataMode}
            onDataModeChange={(mode) => {
              setCancelDetailDataMode(mode);
              setCancelTablePage(0);
            }}
            monthRows={cancelDetailFiltered}
            weekRows={cancelDetailWeeklyFiltered}
            detailMonthRows={cancelDetailLinesFiltered}
            detailWeekRows={cancelDetailWeeklyLinesFiltered}
            months={cancelDetailMonths}
            monthFilter={cancelTableFilters.month}
            page={cancelTablePage}
            onPageChange={setCancelTablePage}
            onExport={() => exportSheet(cancelDetailExport, 'MIS_Cancel_Details')}
            onViewCharts={() =>
              openCharts(
                'cancel',
                cancelDetailDataMode === 'details'
                  ? 'Details Cancel Transactions (Lines) — Charts'
                  : 'Details Cancel Transactions — Charts',
                cancelDetailDataMode === 'details' ? cancelDetailLines : cancelDetailPivot,
                undefined,
                { ...cancelTableFilters },
                cancelDetailDataMode === 'details' ? cancelDetailLines : cancelDetailPivot,
              )
            }
            formatNum={formatNum}
            onClearFilters={clearCancelTableFilters}
            filters={
              <TableInlineFilters
                filters={[
                  {
                    key: 'company',
                    label: 'Company',
                    value: cancelTableFilters.company,
                    options: cancelCompanyOptions,
                    onChange: (v) => setCancelTableFilter('company', v),
                  },
                  {
                    key: 'docType',
                    label: 'Doc type',
                    value: cancelTableFilters.docType,
                    options: cancelDocTypeOptions,
                    onChange: (v) => setCancelTableFilter('docType', v),
                  },
                  {
                    key: 'year',
                    label: 'Year',
                    value: cancelTableFilters.year,
                    options: cancelYearOptions,
                    onChange: (v) => setCancelTableFilter('year', v),
                  },
                  {
                    key: 'month',
                    label: 'Month',
                    value: cancelTableFilters.month,
                    options: cancelMonthOptions,
                    onChange: (v) => setCancelTableFilter('month', v),
                    optionLabel: (v) => MONTH_NAMES[Number(v) - 1] ?? v,
                  },
                ]}
              />
            }
          />
          </div>

          {chartsModal && (
            <TableChartsModal
              key={chartsModal.sessionId}
              open
              onClose={() => setChartsModal(null)}
              title={chartsModal.title}
              kind={chartsModal.kind}
              rows={chartsModal.rows}
              allActiveRows={chartsModal.allActiveRows}
              tableGenericFilters={chartsModal.tableGenericFilters}
              tableActiveFilters={chartsModal.tableActiveFilters}
            />
          )}
        </>
          </div>
        </div>
      )}

      <MobileBottomNav
        activeTab={mobileTab}
        onTabChange={setMobileTab}
        onOpenFilters={() => setMobileFiltersOpen(true)}
        filterCount={activeFilterCount}
      />
    </div>
  );
}
