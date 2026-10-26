import { useEffect, useMemo, useState } from 'react';
import type { SalesmanAggregate } from '../types';
import { conversionColor } from '../lib/chart-theme';
import { formatMoney, formatPct } from '../lib/format';

const PAGE_SIZE = 20;

type ColKey =
  | 'customers'
  | 'orders'
  | 'soAmount'
  | 'dnAmount'
  | 'invAmount'
  | 'deliveries'
  | 'invoices'
  | 'conversionRate';

type Props = {
  rows: SalesmanAggregate[];
  onExportCsv: () => void;
  highlightColumn?: ColKey;
  title?: string;
  subtitle?: string;
};

function colClass(key: ColKey, highlight?: ColKey) {
  return `num${highlight === key ? ' col-highlight' : ''}`;
}

export function SalespersonTable({
  rows,
  onExportCsv,
  highlightColumn,
  title = 'Salesperson performance',
  subtitle = 'Aggregated by salesperson · company · division',
}: Props) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [rows.length, highlightColumn]);

  const pageRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.customers += r.customers;
        acc.orders += r.orders;
        acc.deliveries += r.deliveries;
        acc.invoices += r.invoices;
        acc.soAmount += r.soAmount;
        acc.dnAmount += r.dnAmount;
        acc.invAmount += r.invAmount;
        acc.conversionSum += r.conversionRate;
        acc.count += 1;
        return acc;
      },
      {
        customers: 0,
        orders: 0,
        deliveries: 0,
        invoices: 0,
        soAmount: 0,
        dnAmount: 0,
        invAmount: 0,
        conversionSum: 0,
        count: 0,
      },
    );
  }, [rows]);

  const avgConversion = totals.count > 0 ? totals.conversionSum / totals.count : 0;
  const h = highlightColumn;

  return (
    <article className="detail-table-panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="btn btn-sm" onClick={onExportCsv} disabled={rows.length === 0}>
            Export CSV
          </button>
          {rows.length > 0 && (
            <span className="meta">
              Page {Math.min(page + 1, totalPages)} of {totalPages}
            </span>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="meta table-empty-msg">No rows for the current filters.</p>
      ) : (
        <>
          <div className="table-scroll-body">
            <table className="data-table data-table-pro">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Salesperson</th>
                  <th>Company</th>
                  <th>Division</th>
                  <th className={colClass('customers', h)}>Customers</th>
                  <th className={colClass('orders', h)}>Orders</th>
                  <th className={colClass('soAmount', h)}>SO Amount</th>
                  <th className={colClass('deliveries', h)}>Deliveries</th>
                  <th className={colClass('dnAmount', h)}>DN Amount</th>
                  <th className={colClass('invoices', h)}>Invoices</th>
                  <th className={colClass('invAmount', h)}>Invoice Amount</th>
                  <th className={colClass('conversionRate', h)}>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, idx) => {
                  const rank = page * PAGE_SIZE + idx + 1;
                  return (
                    <tr key={`${row.name}-${row.company}-${row.division}-${rank}`}>
                      <td className="rank-cell">{rank}</td>
                      <td className="name-cell">{row.name}</td>
                      <td><span className="cell-badge">{row.company}</span></td>
                      <td>{row.division}</td>
                      <td className={colClass('customers', h)}>{row.customers.toLocaleString()}</td>
                      <td className={colClass('orders', h)}>{row.orders.toLocaleString()}</td>
                      <td className={colClass('soAmount', h)}>{formatMoney(row.soAmount)}</td>
                      <td className={colClass('deliveries', h)}>{row.deliveries.toLocaleString()}</td>
                      <td className={colClass('dnAmount', h)}>{formatMoney(row.dnAmount)}</td>
                      <td className={colClass('invoices', h)}>{row.invoices.toLocaleString()}</td>
                      <td className={colClass('invAmount', h)}>{formatMoney(row.invAmount)}</td>
                      <td className={colClass('conversionRate', h)}>
                        <span
                          className="conv-pill"
                          style={{
                            background: `${conversionColor(row.conversionRate)}18`,
                            color: conversionColor(row.conversionRate),
                          }}
                        >
                          {formatPct(row.conversionRate)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td colSpan={4}>Total / Avg</td>
                  <td className="num">{totals.customers.toLocaleString()}</td>
                  <td className="num">{totals.orders.toLocaleString()}</td>
                  <td className="num">{formatMoney(totals.soAmount)}</td>
                  <td className="num">{totals.deliveries.toLocaleString()}</td>
                  <td className="num">{formatMoney(totals.dnAmount)}</td>
                  <td className="num">{totals.invoices.toLocaleString()}</td>
                  <td className="num">{formatMoney(totals.invAmount)}</td>
                  <td className="num">{formatPct(avgConversion)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="pagination">
            <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span className="meta">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </article>
  );
}
