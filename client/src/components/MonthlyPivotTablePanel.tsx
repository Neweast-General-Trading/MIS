import type { ReactNode } from 'react';
import {
  activeSummaryRowTotal,
  buildPivotTotalsRow,
  buildWeekPivotTotalsRow,
  pivotMonthValue,
  SUMMARY_MONTHS,
  SUMMARY_WEEKS,
  weekSummaryRowTotal,
  type ActiveTransactionsSummaryRow,
  type PivotDataMode,
  type WeekTransactionsSummaryRow,
} from '../lib/dashboard';
import { TABLE_PAGE_SIZE } from './DataTablePanel';

export type PivotViewMode = 'month' | 'week';

type Props = {
  title: string;
  viewMode: PivotViewMode;
  onViewModeChange: (mode: PivotViewMode) => void;
  monthRows: ActiveTransactionsSummaryRow[];
  weekRows: WeekTransactionsSummaryRow[];
  months: (typeof SUMMARY_MONTHS)[number][];
  monthFilter: string;
  page: number;
  onPageChange: (page: number) => void;
  onExport: () => void;
  onViewCharts: () => void;
  filters?: ReactNode;
  formatNum: (n: number) => string;
  onClearFilters?: () => void;
  clearFiltersLabel?: string;
  dataMode?: PivotDataMode;
  onDataModeChange?: (mode: PivotDataMode) => void;
  detailMonthRows?: ActiveTransactionsSummaryRow[];
  detailWeekRows?: WeekTransactionsSummaryRow[];
};

export function MonthlyPivotTablePanel({
  title,
  viewMode,
  onViewModeChange,
  monthRows,
  weekRows,
  months,
  monthFilter,
  page,
  onPageChange,
  onExport,
  onViewCharts,
  filters,
  formatNum,
  onClearFilters,
  clearFiltersLabel = 'Clear table filters',
  dataMode = 'summary',
  onDataModeChange,
  detailMonthRows = [],
  detailWeekRows = [],
}: Props) {
  const useDetails = dataMode === 'details' && onDataModeChange != null;
  const displayMonthRows = useDetails ? detailMonthRows : monthRows;
  const displayWeekRows = useDetails ? detailWeekRows : weekRows;
  const rows = viewMode === 'month' ? displayMonthRows : displayWeekRows;

  const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  const pageRows = rows.slice(page * TABLE_PAGE_SIZE, (page + 1) * TABLE_PAGE_SIZE);

  const monthTotalsRow =
    viewMode === 'month' && displayMonthRows.length
      ? buildPivotTotalsRow(displayMonthRows, months, monthFilter)
      : null;
  const weekTotalsRow =
    viewMode === 'week' && displayWeekRows.length ? buildWeekPivotTotalsRow(displayWeekRows) : null;

  const formatPivotMonth = (year: number, monthIdx: number, value: number) => {
    const v = pivotMonthValue(year, monthIdx + 1, value);
    return v == null ? '—' : formatNum(v);
  };

  const formatTotalsMonth = (value: number) => (value > 0 ? formatNum(value) : '—');

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-head-title-wrap">
          <h3>{title}</h3>
          <div className="pivot-head-tabs">
            {onDataModeChange && (
              <div className="pivot-view-tabs">
                <button
                  type="button"
                  className={`pivot-view-tab${dataMode === 'summary' ? ' active' : ''}`}
                  onClick={() => onDataModeChange('summary')}
                >
                  Summary
                </button>
                <button
                  type="button"
                  className={`pivot-view-tab${dataMode === 'details' ? ' active' : ''}`}
                  onClick={() => onDataModeChange('details')}
                >
                  Details
                </button>
              </div>
            )}
            <div className="pivot-view-tabs">
              <button
                type="button"
                className={`pivot-view-tab${viewMode === 'month' ? ' active' : ''}`}
                onClick={() => onViewModeChange('month')}
              >
                Month
              </button>
              <button
                type="button"
                className={`pivot-view-tab${viewMode === 'week' ? ' active' : ''}`}
                onClick={() => onViewModeChange('week')}
              >
                Week
              </button>
            </div>
          </div>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="btn btn-sm btn-soft" onClick={onViewCharts}>
            View as charts
          </button>
          <button type="button" className="btn btn-sm" onClick={onExport}>
            Excel
          </button>
          {onClearFilters && (
            <button type="button" className="btn btn-sm" onClick={onClearFilters}>
              {clearFiltersLabel}
            </button>
          )}
          {rows.length > 0 && (
            <span className="meta">
              Page {Math.min(page + 1, totalPages)} of {totalPages}
            </span>
          )}
        </div>
      </div>
      {filters}
      <div className="table-scroll-body table-scroll-pivot">
        {viewMode === 'month' ? (
          <table className="pivot-table">
            <thead>
              <tr>
                <th className="pivot-sticky">Company</th>
                <th className="pivot-sticky pivot-sticky-2">Doc type</th>
                <th className="pivot-sticky pivot-sticky-3">Year</th>
                {months.map((m) => (
                  <th key={m} className="pivot-month">
                    {m}
                  </th>
                ))}
                <th className="pivot-total">Total</th>
              </tr>
            </thead>
            <tbody>
              {(pageRows as ActiveTransactionsSummaryRow[]).map((r) => (
                <tr key={`${r.Company}-${r['Document type']}-${r.Year}`}>
                  <td className="pivot-sticky">{r.Company}</td>
                  <td className="pivot-sticky pivot-sticky-2">{r['Document type']}</td>
                  <td className="pivot-sticky pivot-sticky-3">{r.Year}</td>
                  {months.map((m, i) => (
                    <td key={m} className="pivot-num">
                      {formatPivotMonth(r.Year, i, r[m])}
                    </td>
                  ))}
                  <td className="pivot-num pivot-total">
                    {(() => {
                      const total = activeSummaryRowTotal(r, monthFilter);
                      return total > 0 ? formatNum(total) : '—';
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
            {monthTotalsRow && (
              <tfoot>
                <tr className="table-totals-row">
                  <td className="pivot-sticky">Total</td>
                  <td className="pivot-sticky pivot-sticky-2">—</td>
                  <td className="pivot-sticky pivot-sticky-3">—</td>
                  {months.map((m) => (
                    <td key={m} className="pivot-num">
                      {formatTotalsMonth(monthTotalsRow[m])}
                    </td>
                  ))}
                  <td className="pivot-num pivot-total">
                    {monthTotalsRow.Total > 0 ? formatNum(monthTotalsRow.Total) : '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="pivot-table pivot-table-week">
            <thead>
              <tr>
                <th className="pivot-sticky">Company</th>
                <th className="pivot-sticky pivot-sticky-2">Doc type</th>
                <th className="pivot-sticky pivot-sticky-3">Year</th>
                <th className="pivot-sticky pivot-sticky-4">Month</th>
                {SUMMARY_WEEKS.map((w) => (
                  <th key={w} className="pivot-month">
                    {w}
                  </th>
                ))}
                <th className="pivot-total">Total</th>
              </tr>
            </thead>
            <tbody>
              {(pageRows as WeekTransactionsSummaryRow[]).map((r) => (
                <tr key={`${r.Company}-${r['Document type']}-${r.Year}-${r.Month}`}>
                  <td className="pivot-sticky">{r.Company}</td>
                  <td className="pivot-sticky pivot-sticky-2">{r['Document type']}</td>
                  <td className="pivot-sticky pivot-sticky-3">{r.Year}</td>
                  <td className="pivot-sticky pivot-sticky-4">{r.Month}</td>
                  {SUMMARY_WEEKS.map((w) => (
                    <td key={w} className="pivot-num">
                      {r[w] > 0 ? formatNum(r[w]) : '—'}
                    </td>
                  ))}
                  <td className="pivot-num pivot-total">
                    {weekSummaryRowTotal(r) > 0 ? formatNum(weekSummaryRowTotal(r)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {weekTotalsRow && (
              <tfoot>
                <tr className="table-totals-row">
                  <td className="pivot-sticky">Total</td>
                  <td className="pivot-sticky pivot-sticky-2">—</td>
                  <td className="pivot-sticky pivot-sticky-3">—</td>
                  <td className="pivot-sticky pivot-sticky-4">—</td>
                  {SUMMARY_WEEKS.map((w) => (
                    <td key={w} className="pivot-num">
                      {formatTotalsMonth(weekTotalsRow[w])}
                    </td>
                  ))}
                  <td className="pivot-num pivot-total">
                    {weekTotalsRow.Total > 0 ? formatNum(weekTotalsRow.Total) : '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="meta table-empty-msg">No rows for the current filters.</p>
      ) : (
        <div className="pagination">
          <button type="button" className="btn" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
            Previous
          </button>
          <span className="meta">
            {page * TABLE_PAGE_SIZE + 1}–{Math.min((page + 1) * TABLE_PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <button
            type="button"
            className="btn"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
