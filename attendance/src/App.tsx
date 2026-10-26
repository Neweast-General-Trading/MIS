import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ApiResponse, AttDiscrepancyRow, PayrollDatabase } from './types';
import {
  buildByCategory,
  buildByDay,
  buildKpis,
  buildOtDistribution,
  buildVerificationPie,
  emptyFilters,
  filterRows,
  normalizeVerified,
  rowsToExport,
  uniqueSorted,
  type ReportFilters,
} from './lib/report';
import { exportSheet, exportWorkbook } from './lib/excel';

const PAGE_SIZE = 25;
const API =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD
    ? 'https://misapi.neweast.cloud/api/attendance/discrepancy'
    : '/api/attendance/discrepancy');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DEFAULT_DATABASES: PayrollDatabase[] = [
  { id: 'NEGTPAYROLL_UAE', label: 'UAE', country: 'United Arab Emirates' },
  { id: 'NEGTPAYROLL_OMAN', label: 'Oman', country: 'Oman' },
  { id: 'NEGTPAYROLL_KSA', label: 'KSA', country: 'Saudi Arabia' },
  { id: 'NEGTPAYROLL_BHR', label: 'Bahrain', country: 'Bahrain' },
];

const CHART_COLORS = ['#0D9488', '#14B8A6', '#2DD4BF', '#5EEAD4', '#99F6E4', '#3B82F6'];

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #ccfbf1',
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(13,148,136,0.12)',
  fontSize: 12,
};

function formatNum(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ExportBtn({ onClick, label = 'Excel' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-sm" onClick={onClick}>
      {label}
    </button>
  );
}

export default function App() {
  const now = new Date();
  const [databases, setDatabases] = useState<PayrollDatabase[]>(DEFAULT_DATABASES);
  const [database, setDatabase] = useState('NEGTPAYROLL_UAE');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters());
  const [page, setPage] = useState(0);

  const setFilter = (key: keyof ReportFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  };

  const clearFilters = () => {
    setFilters(emptyFilters());
    setPage(0);
  };

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(API);
        url.searchParams.set('database', database);
        url.searchParams.set('year', String(year));
        url.searchParams.set('month', String(month));
        if (refresh) url.searchParams.set('_', String(Date.now()));
        const res = await fetch(url.toString());
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? res.statusText);
          setData(null);
          return;
        }
        setData(json as ApiResponse);
        setPage(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    },
    [database, year, month],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/attendance/databases')
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json.databases) && json.databases.length) {
          setDatabases(json.databases as PayrollDatabase[]);
        }
      })
      .catch(() => {});
  }, []);

  const rows = data?.rows ?? [];
  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const kpis = useMemo(() => buildKpis(filtered), [filtered]);
  const byCategory = useMemo(() => buildByCategory(filtered), [filtered]);
  const byDay = useMemo(() => buildByDay(filtered), [filtered]);
  const verificationPie = useMemo(() => buildVerificationPie(filtered), [filtered]);
  const otDist = useMemo(() => buildOtDistribution(filtered), [filtered]);
  const exportRows = useMemo(() => rowsToExport(filtered), [filtered]);

  const employeeOptions = useMemo(
    () => uniqueSorted(rows, (r) => r.HRM_EmpId) as string[],
    [rows],
  );
  const categoryOptions = useMemo(
    () => uniqueSorted(rows, (r) => r.Pr_EmpCategory) as string[],
    [rows],
  );

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 8 }, (_, i) => y - i);
  }, [now]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const selectedDb = databases.find((d) => d.id === database);

  const exportAll = () => {
    exportWorkbook(
      [
        { name: 'Detail', data: exportRows },
        { name: 'By Category', data: byCategory as unknown as Record<string, unknown>[] },
        { name: 'By Day', data: byDay as unknown as Record<string, unknown>[] },
      ],
      `Att_Discrepancy_${selectedDb?.label ?? database}_${year}_${month}`,
    );
  };

  if (loading && !data) {
    return (
      <div className="app app-loading">
        <div className="spinner" />
        <p>Loading attendance data from SQL Server…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="NEWEAST" />
          <div>
            <h1>Attendance Discrepancy Report</h1>
            <span className="brand-sub">
              SP_AttDiscrepancy · {selectedDb?.country ?? 'Payroll'} · SQL Server
            </span>
          </div>
        </div>
        <div className="header-actions">
          <a href="/" className="btn btn-ghost" target="_blank" rel="noopener noreferrer">
            Group Analysis
          </a>
          <button type="button" className="btn" onClick={exportAll} disabled={!filtered.length}>
            Export all
          </button>
          <button type="button" className="btn btn-primary" onClick={() => load(true)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="db-tabs">
        {databases.map((db) => (
          <button
            key={db.id}
            type="button"
            className={`db-tab ${database === db.id ? 'active' : ''}`}
            onClick={() => setDatabase(db.id)}
          >
            <span className="db-tab-label">{db.label}</span>
            <span className="db-tab-country">{db.country}</span>
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="period-bar">
          <label>
            Year
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            Month
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </label>
          <span className="meta">
            {data?.cachedAt && `Cached ${new Date(data.cachedAt).toLocaleString()}`}
          </span>
        </div>
      </div>

      {data && !loading && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card teal">
              <label>Total records</label>
              <strong>{formatNum(kpis.records)}</strong>
              <small>{formatNum(kpis.employees)} unique employees</small>
            </div>
            <div className="kpi-card green">
              <label>Verified</label>
              <strong>{formatNum(kpis.verified)}</strong>
              <small>
                {kpis.records ? ((kpis.verified / kpis.records) * 100).toFixed(1) : 0}% of records
              </small>
            </div>
            <div className="kpi-card amber">
              <label>Pending review</label>
              <strong>{formatNum(kpis.pending)}</strong>
            </div>
            <div className="kpi-card blue">
              <label>OT eligible</label>
              <strong>{formatNum(kpis.otEligible)}</strong>
            </div>
            <div className="kpi-card violet">
              <label>Avg normal hours</label>
              <strong>{kpis.avgNorHours.toFixed(2)}h</strong>
            </div>
            <div className="kpi-card rose">
              <label>Total OT hours</label>
              <strong>{formatNum(kpis.totalOtHours)}h</strong>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Filters</h3>
              <button type="button" className="btn btn-sm" onClick={clearFilters}>
                Clear all
              </button>
            </div>
            <div className="filters filters-grid">
              <label>
                Employee ID
                <select value={filters.employee} onChange={(e) => setFilter('employee', e.target.value)}>
                  <option value="">All employees</option>
                  {employeeOptions.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
                  <option value="">All categories</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Verified
                <select value={filters.verified} onChange={(e) => setFilter('verified', e.target.value)}>
                  <option value="">All</option>
                  <option value="yes">Verified</option>
                  <option value="no">Not verified</option>
                  <option value="pending">Pending</option>
                </select>
              </label>
              <label>
                OT eligible
                <select value={filters.otEligible} onChange={(e) => setFilter('otEligible', e.target.value)}>
                  <option value="">All</option>
                  <option value="Y">Yes</option>
                  <option value="N">No</option>
                </select>
              </label>
              <label>
                Search
                <input
                  type="search"
                  className="filter-input"
                  placeholder="Employee, date, comments…"
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="charts-grid">
            <div className="panel chart-span-8">
              <div className="panel-head">
                <h3>Daily discrepancy volume</h3>
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={byDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line type="monotone" dataKey="records" name="Records" stroke="#0D9488" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="pending" name="Pending" stroke="#F59E0B" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel chart-span-4">
              <div className="panel-head">
                <h3>Verification status</h3>
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={verificationPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {verificationPie.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel chart-span-6">
              <div className="panel-head">
                <h3>By employee category</h3>
                <ExportBtn onClick={() => exportSheet(byCategory as unknown as Record<string, unknown>[], 'Att_By_Category')} />
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={byCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="count" name="Records" fill="#0D9488" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="verified" name="Verified" fill="#10B981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel chart-span-6">
              <div className="panel-head">
                <h3>OT hours distribution</h3>
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={otDist}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Employees" radius={[6, 6, 0, 0]}>
                      {otDist.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Detail — {formatNum(filtered.length)} rows</h3>
              <div className="panel-head-actions">
                <ExportBtn onClick={() => exportSheet(exportRows, 'Att_Detail')} label="Export Excel" />
                <span className="meta">Page {page + 1} of {totalPages}</span>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Cat.</th>
                    <th>Org In</th>
                    <th>Org Out</th>
                    <th>Att In</th>
                    <th>Att Out</th>
                    <th>Nor Hrs</th>
                    <th>OT Hrs</th>
                    <th>OT Elig.</th>
                    <th>Verified</th>
                    <th>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <DetailRow key={`${r.SLNo}-${r.HRM_EmpId}-${r.Pr_AttDate}`} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button type="button" className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span className="meta">
                {filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <button type="button" className="btn" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {loading && data && (
        <div className="panel" style={{ marginTop: '1rem', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '1rem auto' }} />
          <p className="meta">Updating data…</p>
        </div>
      )}
    </div>
  );
}

function DetailRow({ row }: { row: AttDiscrepancyRow }) {
  const verified = normalizeVerified(row.Verified);
  return (
    <tr>
      <td>{row.HRM_EmpId}</td>
      <td>{row.Pr_AttDate}</td>
      <td>{row.Pr_EmpCategory}</td>
      <td>{row.Pr_AttOrgTimeIn}</td>
      <td>{row.Pr_AttOrgTimeOut}</td>
      <td>{row.Pr_AttTimeIn}</td>
      <td>{row.Pr_AttTimeout}</td>
      <td>{row.Pr_AttNorHours.toFixed(2)}</td>
      <td>{(row.Pr_AttOtHours + row.Pr_ExtraOtHours).toFixed(2)}</td>
      <td>
        {row.Pr_OTEligible === 'Y' ? (
          <span className="badge badge-ot">Y</span>
        ) : (
          row.Pr_OTEligible
        )}
      </td>
      <td>
        {verified === 'YES' ? (
          <span className="badge badge-yes">Yes</span>
        ) : (
          <span className="badge badge-pending">Pending</span>
        )}
      </td>
      <td title={row.Comments}>{row.Comments || '—'}</td>
    </tr>
  );
}
