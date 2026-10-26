import { useEffect, useMemo, useState } from 'react';
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
import {
  activeSummaryFilterOptions,
  activeSummaryFiltersSummary,
  cloneActiveSummaryTableFilters,
  emptyActiveSummaryTableFilters,
  filterActiveTransactionsSummary,
  filterCancelTransactionsSummary,
  type ActiveSummaryTableFilters,
  type ActiveTransactionsSummaryRow,
} from '../lib/dashboard';
import {
  activeSummaryByCompanyChart,
  activeSummaryByDocTypeChart,
  activeSummaryByMonthChart,
  activeSummaryByYearChart,
  companyTableToChart,
  filterGenericTable,
  monthTableToChart,
  tableFilterOptions,
  yearTableToChart,
} from '../lib/table-charts';
import { TableInlineFilters } from './TableInlineFilters';

const CHART_COLORS = {
  primary: '#7C9EB2',
  secondary: '#94B49F',
  accent: '#B8A9C9',
  muted: '#C4A484',
  cancel: '#D4A5A5',
  cancelLine: '#B89090',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
  fontSize: 12,
};

export type TableChartKind = 'year' | 'company' | 'month' | 'active' | 'cancel' | 'docType' | 'average';

/** Calm, muted palette for chart modal */
const COLORS = [
  '#7C9EB2', '#94B49F', '#B8A9C9', '#C4A484', '#89A0A8',
  '#A8C5DA', '#9BB8A0', '#D4A5A5', '#AEB8C4', '#C9B8A8',
];

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  kind: TableChartKind;
  rows: Record<string, unknown>[] | ActiveTransactionsSummaryRow[];
  /** Full pivot rows for filter dropdown options (matches table cascading filters). */
  allActiveRows?: ActiveTransactionsSummaryRow[];
  /** Snapshot of table filters when charts were opened */
  tableGenericFilters?: Record<string, string>;
  tableActiveFilters?: ActiveSummaryTableFilters;
};

function cloneGenericFilters(filters: Record<string, string>): Record<string, string> {
  return { ...filters };
}

function genericFiltersSummary(filters: Record<string, string>): string {
  const parts: string[] = [];
  if (filters.company) parts.push(filters.company);
  if (filters.docType) parts.push(filters.docType);
  if (filters.year) parts.push(filters.year);
  if (filters.month) {
    const n = Number(filters.month);
    parts.push(Number.isFinite(n) && n >= 1 && n <= 12 ? MONTH_NAMES[n - 1] : filters.month);
  }
  return parts.length ? parts.join(' · ') : 'All';
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatNum(n: number) {
  return n.toLocaleString();
}

export function TableChartsModal({
  open,
  onClose,
  title,
  kind,
  rows,
  allActiveRows,
  tableGenericFilters = {},
  tableActiveFilters = emptyActiveSummaryTableFilters(),
}: Props) {
  const [genericFilters, setGenericFilters] = useState(() => cloneGenericFilters(tableGenericFilters));
  const [activeFilters, setActiveFilters] = useState(() =>
    cloneActiveSummaryTableFilters(tableActiveFilters),
  );

  useEffect(() => {
    if (!open) return;
    setGenericFilters(cloneGenericFilters(tableGenericFilters));
    setActiveFilters(cloneActiveSummaryTableFilters(tableActiveFilters));
  }, [open, tableGenericFilters, tableActiveFilters]);

  const genericRows = rows as Record<string, unknown>[];
  const activeRows = rows as ActiveTransactionsSummaryRow[];
  const activeOptionRows = allActiveRows ?? activeRows;

  const filteredGeneric = useMemo(
    () => filterGenericTable(genericRows, genericFilters),
    [genericRows, genericFilters],
  );

  const filteredActive = useMemo(() => {
    if (kind === 'cancel') {
      return filterCancelTransactionsSummary(activeRows, activeFilters);
    }
    return filterActiveTransactionsSummary(activeRows, activeFilters);
  }, [activeRows, activeFilters, kind]);

  const currentFilterSummary =
    kind === 'active' || kind === 'cancel'
      ? activeSummaryFiltersSummary(activeFilters)
      : genericFiltersSummary(genericFilters);

  const setGeneric = (key: string, value: string) => {
    setGenericFilters((prev) => ({ ...prev, [key]: value }));
  };

  const setActive = (key: keyof ActiveSummaryTableFilters, value: string) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  };

  const activeChartFilterFields = [
    {
      key: 'company',
      label: 'Company',
      value: activeFilters.company,
      options: activeSummaryFilterOptions(activeOptionRows, activeFilters, 'company'),
      onChange: (v: string) => setActive('company', v),
    },
    {
      key: 'docType',
      label: 'Doc type',
      value: activeFilters.docType,
      options: activeSummaryFilterOptions(activeOptionRows, activeFilters, 'docType'),
      onChange: (v: string) => setActive('docType', v),
    },
    {
      key: 'year',
      label: 'Year',
      value: activeFilters.year,
      options: activeSummaryFilterOptions(activeOptionRows, activeFilters, 'year'),
      onChange: (v: string) => setActive('year', v),
    },
    {
      key: 'month',
      label: 'Month',
      value: activeFilters.month,
      options: activeSummaryFilterOptions(activeOptionRows, activeFilters, 'month'),
      onChange: (v: string) => setActive('month', v),
      optionLabel: (v: string) => MONTH_NAMES[Number(v) - 1] ?? v,
    },
  ];

  if (!open) return null;

  const visibleRowCount =
    kind === 'active' || kind === 'cancel' ? filteredActive.length : filteredGeneric.length;

  return (
    <div className="viewer-overlay" onClick={onClose} role="presentation">
      <div className="charts-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="charts-modal-head">
          <div>
            <h2>{title}</h2>
            <p className="meta charts-modal-subtitle">
              Filters: <strong>{currentFilterSummary}</strong>
              {' · '}
              {visibleRowCount.toLocaleString()} rows
            </p>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        {kind === 'year' && (
          <>
            <TableInlineFilters
              filters={[
                {
                  key: 'year',
                  label: 'Year',
                  value: genericFilters.year ?? '',
                  options: tableFilterOptions(genericRows, 'year', genericFilters),
                  onChange: (v) => setGeneric('year', v),
                },
              ]}
            />
            <YearCharts data={yearTableToChart(filteredGeneric)} key={JSON.stringify(genericFilters)} />
          </>
        )}

        {kind === 'company' && (
          <>
            <TableInlineFilters
              filters={[
                {
                  key: 'company',
                  label: 'Company',
                  value: genericFilters.company ?? '',
                  options: tableFilterOptions(genericRows, 'company', genericFilters),
                  onChange: (v) => setGeneric('company', v),
                },
              ]}
            />
            <CompanyCharts data={companyTableToChart(filteredGeneric)} key={JSON.stringify(genericFilters)} />
          </>
        )}

        {kind === 'month' && (
          <>
            <TableInlineFilters
              filters={[
                {
                  key: 'year',
                  label: 'Year',
                  value: genericFilters.year ?? '',
                  options: tableFilterOptions(genericRows, 'year', genericFilters),
                  onChange: (v) => setGeneric('year', v),
                },
                {
                  key: 'month',
                  label: 'Month',
                  value: genericFilters.month ?? '',
                  options: tableFilterOptions(genericRows, 'month', genericFilters),
                  onChange: (v) => setGeneric('month', v),
                },
              ]}
            />
            <MonthCharts data={monthTableToChart(filteredGeneric)} key={JSON.stringify(genericFilters)} />
          </>
        )}

        {kind === 'active' && (
          <>
            <TableInlineFilters filters={activeChartFilterFields} />
            <ActiveSummaryCharts
              rows={filteredActive}
              tableFilters={activeFilters}
              tone="active"
              key={JSON.stringify(activeFilters)}
            />
          </>
        )}

        {kind === 'cancel' && (
          <>
            <TableInlineFilters filters={activeChartFilterFields} />
            <ActiveSummaryCharts
              rows={filteredActive}
              tableFilters={activeFilters}
              tone="cancel"
              key={JSON.stringify(activeFilters)}
            />
          </>
        )}

        {kind === 'docType' && (
          <>
            <TableInlineFilters
              filters={[
                {
                  key: 'docType',
                  label: 'Doc type',
                  value: genericFilters.docType ?? '',
                  options: tableFilterOptions(genericRows, 'docType', genericFilters),
                  onChange: (v) => setGeneric('docType', v),
                },
              ]}
            />
            <DocTypeCharts data={filteredGeneric} key={JSON.stringify(genericFilters)} />
          </>
        )}

        {kind === 'average' && (
          <>
            <TableInlineFilters
              filters={[
                {
                  key: 'docType',
                  label: 'Doc type',
                  value: genericFilters.docType ?? '',
                  options: tableFilterOptions(genericRows, 'docType', genericFilters),
                  onChange: (v) => setGeneric('docType', v),
                },
              ]}
            />
            <AverageCharts data={filteredGeneric} key={JSON.stringify(genericFilters)} />
          </>
        )}
      </div>
    </div>
  );
}

function YearCharts({ data }: { data: ReturnType<typeof yearTableToChart> }) {
  if (!data.length) return <p className="meta charts-empty">No data for selected filters.</p>;
  return (
    <div className="charts-modal-grid">
      <div className="charts-modal-card charts-modal-wide">
        <h4>Active & cancelled by year</h4>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tickFormatter={formatCompact} />
            <YAxis yAxisId="right" orientation="right" unit="%" />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar yAxisId="left" dataKey="active" name="Active" stackId="a" fill={CHART_COLORS.primary} />
            <Bar yAxisId="left" dataKey="cancelled" name="Cancelled" stackId="a" fill={CHART_COLORS.cancel} />
            <Line yAxisId="right" type="monotone" dataKey="cancelRate" name="Cancel %" stroke={CHART_COLORS.cancelLine} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="charts-modal-card">
        <h4>Total documents</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={formatCompact} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="documents" name="Documents" fill={CHART_COLORS.primary} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CompanyCharts({ data }: { data: ReturnType<typeof companyTableToChart> }) {
  if (!data.length) return <p className="meta charts-empty">No data for selected filters.</p>;
  const pie = data.slice(0, 8);
  const other = data.slice(8).reduce((s, r) => s + r.documents, 0);
  const pieData = other > 0 ? [...pie, { name: 'Other', documents: other, active: 0, cancelled: 0 }] : pie;
  return (
    <div className="charts-modal-grid">
      <div className="charts-modal-card">
        <h4>Share by company</h4>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={pieData} dataKey="documents" nameKey="name" innerRadius={50} outerRadius={88} paddingAngle={2}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNum(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="charts-modal-card charts-modal-wide">
        <h4>Documents by company</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tickFormatter={formatCompact} />
            <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="documents" fill="#3B82F6" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MonthCharts({ data }: { data: ReturnType<typeof monthTableToChart> }) {
  if (!data.length) return <p className="meta charts-empty">No data for selected filters.</p>;
  const chartData = data.slice(0, 24);
  return (
    <div className="charts-modal-grid">
      <div className="charts-modal-card charts-modal-full">
        <h4>Monthly volume</h4>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={56} />
            <YAxis tickFormatter={formatCompact} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="documents" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.25} />
            <Area type="monotone" dataKey="cancelled" stroke={CHART_COLORS.cancel} fill={CHART_COLORS.cancel} fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="charts-modal-card charts-modal-wide">
        <h4>Active by month</h4>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={56} />
            <YAxis tickFormatter={formatCompact} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="active" fill={CHART_COLORS.secondary} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ActiveSummaryCharts({
  rows,
  tableFilters,
  tone = 'active',
}: {
  rows: ActiveTransactionsSummaryRow[];
  tableFilters: ActiveSummaryTableFilters;
  tone?: 'active' | 'cancel';
}) {
  if (!rows.length) return <p className="meta charts-empty">No data for selected filters.</p>;

  const barColor = tone === 'cancel' ? CHART_COLORS.cancel : CHART_COLORS.primary;
  const altColor = tone === 'cancel' ? CHART_COLORS.muted : CHART_COLORS.secondary;
  const titlePrefix = tone === 'cancel' ? 'Cancelled' : 'Active';

  const byMonth = activeSummaryByMonthChart(rows, tableFilters);
  const byDocType = activeSummaryByDocTypeChart(rows, tableFilters);
  const byCompany = activeSummaryByCompanyChart(rows, tableFilters);
  const byYear = activeSummaryByYearChart(rows, tableFilters);

  return (
    <div className="charts-modal-grid charts-modal-grid-spaced">
      <div className="charts-modal-card charts-modal-full">
        <h4>{titlePrefix} transactions by month</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={byMonth} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tickFormatter={formatCompact} tick={{ fill: '#64748b' }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNum(v)} />
            <Bar dataKey="active" name={titlePrefix} fill={barColor} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="charts-modal-card">
        <h4>By document type</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byDocType} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
            <XAxis type="number" tickFormatter={formatCompact} tick={{ fill: '#64748b' }} />
            <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10, fill: '#64748b' }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="active" fill={altColor} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="charts-modal-card">
        <h4>By company</h4>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={byCompany} dataKey="active" nameKey="name" innerRadius={44} outerRadius={78} paddingAngle={2}>
              {byCompany.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatNum(v)} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="charts-modal-card">
        <h4>By year</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={byYear} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tickFormatter={formatCompact} tick={{ fill: '#64748b' }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="active" fill={CHART_COLORS.accent} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DocTypeCharts({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return <p className="meta charts-empty">No data for selected filters.</p>;
  const chartData = data.map((r) => ({
    name: String(r['Doc Type']),
    documents: r.Documents as number,
    active: r.Active as number,
    cancelled: r.Cancelled as number,
  }));
  return (
    <div className="charts-modal-grid">
      <div className="charts-modal-card charts-modal-wide">
        <h4>Documents by type</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tickFormatter={formatCompact} />
            <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="documents" fill="#3B82F6" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="charts-modal-card">
        <h4>Active vs cancelled</h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={48} />
            <YAxis tickFormatter={formatCompact} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar dataKey="active" name="Active" fill="#10B981" stackId="a" />
            <Bar dataKey="cancelled" name="Cancelled" fill="#FCA5A5" stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AverageCharts({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return <p className="meta charts-empty">No data for selected filters.</p>;
  const chartData = data.map((r) => ({
    name: String(r['Doc type'] ?? r['Doc Type']),
    yearly: r['Average / year'] as number,
    monthly: r['Average / month'] as number,
    daily: r['Average / day'] as number,
  }));
  return (
    <div className="charts-modal-grid">
      <div className="charts-modal-card charts-modal-full">
        <h4>Average workload by document type</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={48} />
            <YAxis tickFormatter={formatCompact} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar dataKey="yearly" name="Average / year" fill={CHART_COLORS.primary} />
            <Bar dataKey="monthly" name="Average / month" fill={CHART_COLORS.secondary} />
            <Bar dataKey="daily" name="Average / day" fill={CHART_COLORS.muted} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
