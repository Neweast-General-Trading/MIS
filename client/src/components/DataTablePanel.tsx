import type { ReactNode } from 'react';
import { buildGenericTableTotalsRow } from '../lib/dashboard';

const PAGE_SIZE = 20;

function formatTableCell(value: unknown): string {
  if (value === '—' || value === '' || value == null) return '—';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

type Props = {
  title: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  onExport: () => void;
  page: number;
  onPageChange: (page: number) => void;
  filters?: ReactNode;
  onViewCharts: () => void;
  children?: ReactNode;
  emptyMessage?: string;
  showTotals?: boolean;
  buildTotalsRow?: (rows: Record<string, unknown>[]) => Record<string, unknown> | null;
  tableNote?: ReactNode;
  tableClassName?: string;
  onClearFilters?: () => void;
  clearFiltersLabel?: string;
};

export function DataTablePanel({
  title,
  rowCount,
  rows,
  onExport,
  page,
  onPageChange,
  filters,
  onViewCharts,
  children,
  emptyMessage = 'No rows for the current filters.',
  showTotals = true,
  buildTotalsRow = buildGenericTableTotalsRow,
  tableNote,
  tableClassName,
  onClearFilters,
  clearFiltersLabel = 'Clear table filters',
}: Props) {
  const totalPages = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));
  const pageRows = children ? [] : rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const cols = pageRows.length ? Object.keys(pageRows[0]) : rows.length ? Object.keys(rows[0]) : [];
  const totalsRow = showTotals && rows.length ? buildTotalsRow(rows) : null;

  const isNumericColumn = (col: string) => {
    if (pageRows.some((r) => typeof r[col] === 'number')) return true;
    if (totalsRow && typeof totalsRow[col] === 'number') return true;
    return false;
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
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
          {rowCount > 0 && (
            <span className="meta">
              Page {Math.min(page + 1, totalPages)} of {totalPages}
            </span>
          )}
        </div>
      </div>
      {filters}
      {tableNote}
      {children ?? (
        <div className="table-scroll-body table-scroll-sm">
          <table className={tableClassName ? `data-table ${tableClassName}` : 'data-table'}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className={isNumericColumn(c) ? 'data-table-num' : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className={isNumericColumn(c) ? 'data-table-num' : undefined}>
                      {formatTableCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totalsRow && (
              <tfoot>
                <tr className="table-totals-row">
                  {cols.map((c) => (
                    <td key={c} className={isNumericColumn(c) ? 'data-table-num' : undefined}>
                      {formatTableCell(totalsRow[c])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {rowCount === 0 ? (
        <p className="meta table-empty-msg">{emptyMessage}</p>
      ) : (
        !children && (
          <div className="pagination">
            <button type="button" className="btn" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
              Previous
            </button>
            <span className="meta">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rowCount)} of {rowCount}
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
        )
      )}
      {children && rowCount > 0 && null}
    </div>
  );
}

export { PAGE_SIZE as TABLE_PAGE_SIZE };
