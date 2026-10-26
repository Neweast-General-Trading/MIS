import type { KpiDrilldownId } from '../types';
import type { ProcessedSalesRow, SalesmanAggregate } from '../types';
import { KPI_DRILLDOWN, sortDetailByMetric, sortSalesmanByMetric } from '../lib/kpi-drilldown';
import { formatMoney, formatPct } from '../lib/format';
import { conversionColor } from '../lib/chart-theme';
import { SalespersonTable } from './SalespersonTable';

const DETAIL_PAGE = 25;

type Props = {
  kpiId: KpiDrilldownId;
  salesmanRows: SalesmanAggregate[];
  detailRows: ProcessedSalesRow[];
  onBack: () => void;
  onExportCsv: () => void;
};

export function KpiDrilldownView({ kpiId, salesmanRows, detailRows, onBack, onExportCsv }: Props) {
  const config = KPI_DRILLDOWN[kpiId];
  const sortedSalesmen = sortSalesmanByMetric(salesmanRows, config.sortSalesmanBy);
  const sortedDetails = sortDetailByMetric(detailRows, config.sortDetailBy);

  return (
    <div className="drilldown-view">
      <header className="drilldown-head">
        <button type="button" className="btn btn-sm drilldown-back" onClick={onBack}>
          ← Back to overview
        </button>
        <div>
          <h2>{config.title}</h2>
          <p>{config.subtitle}</p>
        </div>
      </header>

      <SalespersonTable
        rows={sortedSalesmen}
        onExportCsv={onExportCsv}
        highlightColumn={config.highlightSalesmanColumn}
        title="By salesperson"
        subtitle={`Sorted by ${config.title.toLowerCase()}`}
      />

      <article className="detail-table-panel">
        <div className="panel-head">
          <div>
            <h2>Line detail</h2>
            <p>{sortedDetails.length.toLocaleString()} rows · sorted by {config.title.toLowerCase()}</p>
          </div>
        </div>
        <div className="table-scroll-body">
          <table className="data-table data-table-pro">
            <thead>
              <tr>
                <th>Salesperson</th>
                <th>Company</th>
                <th>Division</th>
                <th className={`num ${config.highlightDetailColumn === 'Customers' ? 'col-highlight' : ''}`}>Customers</th>
                <th className={`num ${config.highlightDetailColumn === 'Orders' ? 'col-highlight' : ''}`}>Orders</th>
                <th className={`num ${config.highlightDetailColumn === 'SOAmountNum' ? 'col-highlight' : ''}`}>SO Amount</th>
                <th className={`num ${config.highlightDetailColumn === 'Deliveries' ? 'col-highlight' : ''}`}>Deliveries</th>
                <th className={`num ${config.highlightDetailColumn === 'DNAmountNum' ? 'col-highlight' : ''}`}>DN Amount</th>
                <th className={`num ${config.highlightDetailColumn === 'Invoices' ? 'col-highlight' : ''}`}>Invoices</th>
                <th className={`num ${config.highlightDetailColumn === 'INVAmountNum' ? 'col-highlight' : ''}`}>Invoice Amt</th>
                <th className={`num ${config.highlightDetailColumn === 'ConversionRate' ? 'col-highlight' : ''}`}>Conv %</th>
              </tr>
            </thead>
            <tbody>
              {sortedDetails.slice(0, DETAIL_PAGE).map((row, idx) => (
                <tr key={`${row.SlpName}-${row.Company}-${idx}`}>
                  <td className="name-cell">{row.SlpName}</td>
                  <td><span className="cell-badge">{row.Company}</span></td>
                  <td>{row.Division}</td>
                  <td className="num">{row.Customers.toLocaleString()}</td>
                  <td className="num">{row.Orders.toLocaleString()}</td>
                  <td className="num amount-cell">{formatMoney(row.SOAmountNum)}</td>
                  <td className="num">{row.Deliveries.toLocaleString()}</td>
                  <td className="num">{formatMoney(row.DNAmountNum)}</td>
                  <td className="num">{row.Invoices.toLocaleString()}</td>
                  <td className="num amount-cell">{formatMoney(row.INVAmountNum)}</td>
                  <td className="num">
                    <span
                      className="conv-pill"
                      style={{
                        background: `${conversionColor(row.ConversionRate)}18`,
                        color: conversionColor(row.ConversionRate),
                      }}
                    >
                      {formatPct(row.ConversionRate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedDetails.length > DETAIL_PAGE && (
          <p className="meta drilldown-more">
            Showing top {DETAIL_PAGE} of {sortedDetails.length.toLocaleString()} lines. Export Excel for full data.
          </p>
        )}
      </article>
    </div>
  );
}
