import { useMemo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FilteredBlock,
  TablePager,
  TableToolbar,
  usePagedFilter,
} from './components/TableControls';
import {
  money,
  num,
  pct,
  qty,
  shortDate,
  uniqueSorted,
  yn,
  type Ne02Response,
} from './types';

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
  fontSize: 12,
};

function Section({
  id,
  step,
  title,
  subtitle,
  children,
}: {
  id?: string;
  step: number;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="section panel">
      <header className="section-head">
        <span className="section-step">{step}</span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function Kpi({
  label,
  value,
  hint,
  tone = 'blue',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'blue' | 'green' | 'teal' | 'amber' | 'slate';
}) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {hint ? <span className="kpi-hint">{hint}</span> : null}
    </div>
  );
}

function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'green' | 'amber' | 'rose' | 'blue' | 'slate' | 'teal';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ResultsPanels({ data }: { data: Ne02Response }) {
  const resetKey = `${data.cachedAt}|${data.cardCode}|${data.itemCodes.join(',')}`;
  const financialSummary = data.financialStatus[0] ?? null;
  const brandSummary = data.brandPerformance[0] ?? null;

  const brandChart = useMemo(
    () =>
      [...data.brandPerformance]
        .map((r) => ({
          brand: r.Brand,
          current: num(r.SalesValue_CurrentYear),
          last: num(r.SalesValue_LastYear),
          prior: num(r.SalesValue_2YearsAgo),
          bo: num(r.BrandBackorderValue),
        }))
        .sort((a, b) => b.last - a.last)
        .slice(0, 8),
    [data.brandPerformance],
  );

  const brandHasBo = useMemo(
    () => uniqueSorted(data.brandPerformance.map((r) => (num(r.BrandBackorderValue) > 0 ? 'With backorder' : 'No backorder'))),
    [data.brandPerformance],
  );
  const brandTbl = usePagedFilter(data.brandPerformance, {
    resetKey,
    pageSize: 10,
    searchIn: (r) => `${r.Brand} ${r.CardCode} ${r.CardName}`,
    selectFilters: [{ id: 'bo', label: 'Backorder', options: brandHasBo }],
    getSelectValue: (r, id) =>
      id === 'bo' ? (num(r.BrandBackorderValue) > 0 ? 'With backorder' : 'No backorder') : '',
  });

  const financeRows = useMemo(
    () => data.financialStatus.filter((r) => r.OverdueInvoiceDocNum != null && String(r.OverdueInvoiceDocNum).trim() !== ''),
    [data.financialStatus],
  );
  const overdueBuckets = ['1–30d', '31–90d', '90d+'];
  const financeTbl = usePagedFilter(financeRows, {
    resetKey,
    pageSize: 10,
    searchIn: (r) =>
      `${r.OverdueInvoiceDocNum} ${r.InvoiceDate} ${r.InvoiceDueDate} ${r.CardCode} ${r.CardName}`,
    selectFilters: [{ id: 'aging', label: 'Aging', options: overdueBuckets }],
    getSelectValue: (r) => {
      const d = num(r.DaysOverdue);
      if (d > 90) return '90d+';
      if (d > 30) return '31–90d';
      return '1–30d';
    },
  });

  const movementOpts = useMemo(
    () => uniqueSorted(data.itemEvaluation.map((r) => String(r.MovementClass || 'Unclassified'))),
    [data.itemEvaluation],
  );
  const itemsTbl = usePagedFilter(data.itemEvaluation, {
    resetKey,
    pageSize: 8,
    searchIn: (r) =>
      `${r.ItemCode} ${r.ItemName} ${r.Brand} ${r.TopCustomerCode} ${r.TopCustomerName} ${r.TopCountry}`,
    selectFilters: [
      { id: 'movement', label: 'Movement', options: movementOpts },
      {
        id: 'specific',
        label: 'Specificity',
        options: ['Customer-specific', 'Country-specific', 'General'],
      },
    ],
    getSelectValue: (r, id) => {
      if (id === 'movement') return String(r.MovementClass || 'Unclassified');
      if (yn(r.CustomerSpecific)) return 'Customer-specific';
      if (yn(r.CountrySpecific)) return 'Country-specific';
      return 'General';
    },
  });

  const boWhs = useMemo(
    () => uniqueSorted(data.itemBackorder.map((r) => String(r.BackorderWhsCode || '—'))),
    [data.itemBackorder],
  );
  const boItems = useMemo(
    () => uniqueSorted(data.itemBackorder.map((r) => String(r.ItemCode))),
    [data.itemBackorder],
  );
  const boTbl = usePagedFilter(data.itemBackorder, {
    resetKey,
    pageSize: 10,
    searchIn: (r) =>
      `${r.ItemCode} ${r.ItemName} ${r.BackorderWhsCode} ${r.CardCode} ${r.CardName} ${r.BackorderDocNum}`,
    selectFilters: [
      { id: 'item', label: 'Item', options: boItems },
      { id: 'whs', label: 'Warehouse', options: boWhs },
    ],
    getSelectValue: (r, id) =>
      id === 'item' ? String(r.ItemCode) : id === 'whs' ? String(r.BackorderWhsCode || '—') : '',
  });

  const allocWhs = useMemo(
    () => uniqueSorted(data.allocatedStock.map((r) => String(r.WhsCode || '—'))),
    [data.allocatedStock],
  );
  const allocItems = useMemo(
    () => uniqueSorted(data.allocatedStock.map((r) => String(r.ItemCode))),
    [data.allocatedStock],
  );
  const allocTbl = usePagedFilter(data.allocatedStock, {
    resetKey,
    pageSize: 10,
    searchIn: (r) =>
      `${r.ItemCode} ${r.ItemName} ${r.WhsCode} ${r.WhsName} ${r.CardCode} ${r.CardName} ${r.SalesOrderDocNum}`,
    selectFilters: [
      { id: 'item', label: 'Item', options: allocItems },
      { id: 'whs', label: 'Warehouse', options: allocWhs },
      { id: 'age', label: 'Age', options: ['6–9 months', '9–12 months', '12+ months'] },
    ],
    getSelectValue: (r, id) => {
      if (id === 'item') return String(r.ItemCode);
      if (id === 'whs') return String(r.WhsCode || '—');
      const m = num(r.MonthsAllocated_Approx);
      if (m >= 12) return '12+ months';
      if (m >= 9) return '9–12 months';
      return '6–9 months';
    },
  });

  const quotationDetails = data.quotationDetails ?? [];
  const quotationHead = quotationDetails[0] ?? null;
  const quotationTotal = useMemo(
    () => quotationDetails.reduce((sum, r) => sum + num(r.LineTotal), 0),
    [quotationDetails],
  );
  const sqTbl = usePagedFilter(quotationDetails, {
    resetKey,
    pageSize: 10,
    searchIn: (r) => `${r.ItemCode} ${r.ItemDescription} ${r.CardCode} ${r.CardName}`,
  });

  const jumpLinks = [
    ...(quotationDetails.length ? [['#sec-quotation', '1 · Quotation'] as const] : []),
    ['#sec-brand', `${quotationDetails.length ? '2' : '1'} · Brand`] as const,
    ['#sec-finance', `${quotationDetails.length ? '3' : '2'} · Financial`] as const,
    ['#sec-items', `${quotationDetails.length ? '4' : '3'} · Items`] as const,
    ['#sec-backorder', `${quotationDetails.length ? '5' : '4'} · Backorder`] as const,
    ['#sec-allocated', `${quotationDetails.length ? '6' : '5'} · Allocated`] as const,
  ];
  const step = (n: number) => (quotationDetails.length ? n + 1 : n);

  return (
    <>
      <div className="meta-strip">
        <span>
          Customer <strong>{data.cardCode}</strong>
          {quotationHead?.CardName || brandSummary?.CardName || financialSummary?.CardName
            ? ` · ${quotationHead?.CardName || brandSummary?.CardName || financialSummary?.CardName}`
            : ''}
        </span>
        {data.quotationDocNum != null ? (
          <span>
            Quotation <strong>{data.quotationDocNum}</strong>
          </span>
        ) : null}
        <span>
          Items <strong>{data.itemCodes.length || '—'}</strong>
        </span>
        <span>
          Refreshed <strong>{new Date(data.cachedAt).toLocaleString()}</strong>
        </span>
      </div>

      <nav className="jump-nav" aria-label="Approval sections">
        {jumpLinks.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>

      {quotationDetails.length > 0 ? (
        <Section
          id="sec-quotation"
          step={1}
          title="Sales Quotation Details"
          subtitle="Line items from the sales quotation used for this NE02 approval pack."
        >
          <div className="kpi-row">
            <Kpi label="Quotation" value={String(quotationHead?.QuotationDocNum ?? data.quotationDocNum)} tone="blue" />
            <Kpi label="Date" value={shortDate(quotationHead?.QuotationDate)} tone="slate" />
            <Kpi label="Lines" value={String(quotationDetails.length)} tone="teal" />
            <Kpi label="Line total" value={money(quotationTotal, 2)} tone="green" />
          </div>
          <FilteredBlock>
            <TableToolbar
              query={sqTbl.query}
              onQuery={sqTbl.setQuery}
              searchPlaceholder="Search item / description…"
              selects={sqTbl.selects}
              onSelect={sqTbl.setSelect}
              shown={sqTbl.shown}
              total={sqTbl.total}
              hasActiveFilters={sqTbl.hasActiveFilters}
              onClear={sqTbl.clearFilters}
              pageSize={sqTbl.pageSize}
              onPageSize={sqTbl.setPageSize}
            />
            {sqTbl.shown === 0 ? (
              <Empty text="No quotation lines match the current search." />
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Description</th>
                        <th className="num">Qty</th>
                        <th className="num">Price</th>
                        <th className="num">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sqTbl.pageRows.map((r, i) => (
                        <tr key={`${r.ItemCode}-${i}`}>
                          <td>
                            <strong className="mono">{r.ItemCode}</strong>
                          </td>
                          <td>{r.ItemDescription || '—'}</td>
                          <td className="num">{qty(r.Quantity)}</td>
                          <td className="num">{money(r.Price, 2)}</td>
                          <td className="num">{money(r.LineTotal, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePager
                  page={sqTbl.page}
                  pageCount={sqTbl.pageCount}
                  onPage={sqTbl.setPage}
                  pageSize={sqTbl.pageSize}
                  shown={sqTbl.shown}
                />
              </>
            )}
          </FilteredBlock>
        </Section>
      ) : null}

      <Section
        id="sec-brand"
        step={step(1)}
        title="Brand Performance"
        subtitle="Yearly sales by brand for this customer, brand backorder, and customer backorder vs last-year sales."
      >
        {data.brandPerformance.length === 0 ? (
          <Empty text="No brand performance rows for this customer." />
        ) : (
          <>
            <div className="kpi-row">
              <Kpi label="Customer sales last year" value={money(brandSummary?.CustomerTotalSalesValue_LastYear)} tone="blue" />
              <Kpi label="Customer total backorder" value={money(brandSummary?.CustomerTotalBackorderValue)} tone="teal" />
              <Kpi label="Backorder vs last-year sales" value={pct(brandSummary?.BackorderPctOfLastYearSales)} tone="green" />
              <Kpi label="Brands" value={String(data.brandPerformance.length)} tone="slate" />
            </div>

            {brandChart.length > 0 ? (
              <div className="chart-wrap">
                <div className="chart-head">
                  <h3>Top brands · sales value</h3>
                  <div className="legend">
                    <span className="lg lg-prior">2 yrs ago</span>
                    <span className="lg lg-last">Last year</span>
                    <span className="lg lg-current">Current year</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={brandChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="brand" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => money(value)} />
                    <Bar dataKey="prior" name="2 yrs ago" fill="#c7d7f5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="last" name="Last year" fill="#7aa2e8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="current" name="Current year" fill="#4f86d9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            <FilteredBlock>
              <TableToolbar
                query={brandTbl.query}
                onQuery={brandTbl.setQuery}
                searchPlaceholder="Search brand…"
                filters={[{ id: 'bo', label: 'Backorder', options: brandHasBo }]}
                selects={brandTbl.selects}
                onSelect={brandTbl.setSelect}
                shown={brandTbl.shown}
                total={brandTbl.total}
                hasActiveFilters={brandTbl.hasActiveFilters}
                onClear={brandTbl.clearFilters}
                pageSize={brandTbl.pageSize}
                onPageSize={brandTbl.setPageSize}
              />
              {brandTbl.shown === 0 ? (
                <Empty text="No brands match the current filters." />
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Brand</th>
                          <th className="num">Sales CY</th>
                          <th className="num">Sales LY</th>
                          <th className="num">Sales 2Y</th>
                          <th className="num">Qty LY</th>
                          <th className="num">Brand BO qty</th>
                          <th className="num">Brand BO value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brandTbl.pageRows.map((r) => (
                          <tr key={r.Brand}>
                            <td>
                              <strong>{r.Brand}</strong>
                            </td>
                            <td className="num">{money(r.SalesValue_CurrentYear)}</td>
                            <td className="num">{money(r.SalesValue_LastYear)}</td>
                            <td className="num">{money(r.SalesValue_2YearsAgo)}</td>
                            <td className="num">{qty(r.SalesQty_LastYear)}</td>
                            <td className="num">{qty(r.BrandBackorderQty)}</td>
                            <td className="num">{money(r.BrandBackorderValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePager
                    page={brandTbl.page}
                    pageCount={brandTbl.pageCount}
                    onPage={brandTbl.setPage}
                    pageSize={brandTbl.pageSize}
                    shown={brandTbl.shown}
                  />
                </>
              )}
            </FilteredBlock>
          </>
        )}
      </Section>

      <Section
        id="sec-finance"
        step={step(2)}
        title="Customer Financial Status"
        subtitle="Payment terms, credit limit, current balance, and overdue invoices."
      >
        {!financialSummary ? (
          <Empty text="No financial status for this customer." />
        ) : (
          <>
            <div className="kpi-row">
              <Kpi
                label="Payment"
                value={`${financialSummary.PaymentType ?? '—'} · ${financialSummary.PaymentTermsName ?? '—'}`}
                tone="blue"
              />
              <Kpi label="Credit limit" value={money(financialSummary.CreditLimit)} tone="green" />
              <Kpi label="Current balance" value={money(financialSummary.CurrentBalance)} tone="teal" />
              <Kpi
                label="Total overdue"
                value={money(financialSummary.TotalOverdueAmount)}
                hint={`${financialSummary.OverdueInvoiceCount ?? 0} invoices · max ${financialSummary.MaxDaysOverdue ?? 0}d`}
                tone={num(financialSummary.TotalOverdueAmount) > 0 ? 'amber' : 'slate'}
              />
            </div>
            <div className="chip-row">
              <Badge tone={yn(financialSummary.OverCreditLimit) ? 'rose' : 'green'}>
                {yn(financialSummary.OverCreditLimit) ? 'Over credit limit' : 'Within credit limit'}
              </Badge>
              <Badge tone={(financialSummary.PaymentType || '').toLowerCase() === 'cash' ? 'teal' : 'blue'}>
                {financialSummary.PaymentType || 'Payment type n/a'}
              </Badge>
            </div>

            <FilteredBlock>
              <TableToolbar
                query={financeTbl.query}
                onQuery={financeTbl.setQuery}
                searchPlaceholder="Search invoice # or date…"
                filters={[{ id: 'aging', label: 'Aging', options: overdueBuckets }]}
                selects={financeTbl.selects}
                onSelect={financeTbl.setSelect}
                shown={financeTbl.shown}
                total={financeTbl.total}
                hasActiveFilters={financeTbl.hasActiveFilters}
                onClear={financeTbl.clearFilters}
                pageSize={financeTbl.pageSize}
                onPageSize={financeTbl.setPageSize}
              />
              {financeTbl.total === 0 ? (
                <Empty text="No overdue invoices for this customer." />
              ) : financeTbl.shown === 0 ? (
                <Empty text="No invoices match the current filters." />
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Invoice date</th>
                          <th>Due date</th>
                          <th className="num">Doc total</th>
                          <th className="num">Paid</th>
                          <th className="num">Open</th>
                          <th className="num">Days overdue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financeTbl.pageRows.map((r, i) => (
                          <tr key={`${r.OverdueInvoiceDocNum}-${i}`}>
                            <td>
                              <strong>{r.OverdueInvoiceDocNum ?? '—'}</strong>
                            </td>
                            <td>{shortDate(r.InvoiceDate)}</td>
                            <td>{shortDate(r.InvoiceDueDate)}</td>
                            <td className="num">{money(r.DocTotal)}</td>
                            <td className="num">{money(r.PaidToDate)}</td>
                            <td className="num">{money(r.OpenBalance)}</td>
                            <td className="num">
                              <Badge tone={num(r.DaysOverdue) > 90 ? 'rose' : num(r.DaysOverdue) > 30 ? 'amber' : 'slate'}>
                                {qty(r.DaysOverdue)}d
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePager
                    page={financeTbl.page}
                    pageCount={financeTbl.pageCount}
                    onPage={financeTbl.setPage}
                    pageSize={financeTbl.pageSize}
                    shown={financeTbl.shown}
                  />
                </>
              )}
            </FilteredBlock>
          </>
        )}
      </Section>

      <Section
        id="sec-items"
        step={step(3)}
        title="Items Evaluation (SQ)"
        subtitle="Fast / slow moving, customer or country specificity, and last-year sales support."
      >
        {data.itemCodes.length === 0 ? (
          <Empty text="Add SQ item codes above to evaluate items." />
        ) : data.itemEvaluation.length === 0 ? (
          <Empty text="No evaluation rows returned for the given items." />
        ) : (
          <FilteredBlock>
            <TableToolbar
              query={itemsTbl.query}
              onQuery={itemsTbl.setQuery}
              searchPlaceholder="Search item / brand / customer…"
              filters={[
                { id: 'movement', label: 'Movement', options: movementOpts },
                {
                  id: 'specific',
                  label: 'Specificity',
                  options: ['Customer-specific', 'Country-specific', 'General'],
                },
              ]}
              selects={itemsTbl.selects}
              onSelect={itemsTbl.setSelect}
              shown={itemsTbl.shown}
              total={itemsTbl.total}
              hasActiveFilters={itemsTbl.hasActiveFilters}
              onClear={itemsTbl.clearFilters}
              pageSize={itemsTbl.pageSize}
              onPageSize={itemsTbl.setPageSize}
            />
            {itemsTbl.shown === 0 ? (
              <Empty text="No items match the current filters." />
            ) : (
              <>
                <div className="card-grid">
                  {itemsTbl.pageRows.map((r) => {
                    const slow = String(r.MovementClass ?? '').toLowerCase().includes('slow');
                    return (
                      <article key={r.ItemCode} className="item-card">
                        <div className="item-card-top">
                          <div>
                            <p className="mono">{r.ItemCode}</p>
                            <h3>{r.ItemName || '—'}</h3>
                            <p className="muted">{r.Brand || 'No brand'}</p>
                          </div>
                          <Badge tone={slow ? 'amber' : 'green'}>{r.MovementClass || 'Unclassified'}</Badge>
                        </div>
                        <div className="item-stats">
                          <div>
                            <span>Sales LY</span>
                            <strong>{money(r.SalesValue_LastYear)}</strong>
                          </div>
                          <div>
                            <span>Qty LY</span>
                            <strong>{qty(r.SalesQty_LastYear)}</strong>
                          </div>
                          <div>
                            <span>Customers</span>
                            <strong>{qty(r.DistinctCustomers_LastYear)}</strong>
                          </div>
                          <div>
                            <span>Countries</span>
                            <strong>{qty(r.DistinctCountries_LastYear)}</strong>
                          </div>
                        </div>
                        <div className="chip-row">
                          <Badge tone={yn(r.CustomerSpecific) ? 'blue' : 'slate'}>
                            {yn(r.CustomerSpecific) ? 'Customer-specific' : 'Not customer-specific'}
                          </Badge>
                          <Badge tone={yn(r.CountrySpecific) ? 'teal' : 'slate'}>
                            {yn(r.CountrySpecific) ? `Country · ${r.TopCountry || '—'}` : 'Not country-specific'}
                          </Badge>
                        </div>
                        <p className="item-foot">
                          Top customer: <strong>{r.TopCustomerName || '—'}</strong>
                          {r.TopCustomerCode ? ` (${r.TopCustomerCode})` : ''}
                        </p>
                      </article>
                    );
                  })}
                </div>
                <TablePager
                  page={itemsTbl.page}
                  pageCount={itemsTbl.pageCount}
                  onPage={itemsTbl.setPage}
                  pageSize={itemsTbl.pageSize}
                  shown={itemsTbl.shown}
                />
              </>
            )}
          </FilteredBlock>
        )}
      </Section>

      <Section
        id="sec-backorder"
        step={step(4)}
        title="Backorder Status (New East)"
        subtitle="Free / available stock, committed quantities, and open backorder lines for SQ items."
      >
        {data.itemCodes.length === 0 ? (
          <Empty text="Add SQ item codes to load backorder status." />
        ) : data.itemBackorder.length === 0 ? (
          <Empty text="No open backorders for these items." />
        ) : (
          <>
            <div className="stock-summary">
              {[...new Map(data.itemBackorder.map((r) => [r.ItemCode, r])).values()].map((r) => (
                <div key={r.ItemCode} className="stock-pill">
                  <span className="mono">{r.ItemCode}</span>
                  <span>
                    On hand <strong>{qty(r.TotalOnHandQty)}</strong>
                  </span>
                  <span>
                    Committed <strong>{qty(r.TotalCommittedQty)}</strong>
                  </span>
                  <span>
                    Available <strong>{qty(r.TotalAvailableQty)}</strong>
                  </span>
                </div>
              ))}
            </div>
            <FilteredBlock>
              <TableToolbar
                query={boTbl.query}
                onQuery={boTbl.setQuery}
                searchPlaceholder="Search item / customer / doc…"
                filters={[
                  { id: 'item', label: 'Item', options: boItems },
                  { id: 'whs', label: 'Warehouse', options: boWhs },
                ]}
                selects={boTbl.selects}
                onSelect={boTbl.setSelect}
                shown={boTbl.shown}
                total={boTbl.total}
                hasActiveFilters={boTbl.hasActiveFilters}
                onClear={boTbl.clearFilters}
                pageSize={boTbl.pageSize}
                onPageSize={boTbl.setPageSize}
              />
              {boTbl.shown === 0 ? (
                <Empty text="No backorder lines match the current filters." />
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Whs</th>
                          <th>Customer</th>
                          <th>Doc</th>
                          <th>Order / Due</th>
                          <th className="num">BO qty</th>
                          <th className="num">Whs free</th>
                          <th className="num">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boTbl.pageRows.map((r, i) => (
                          <tr key={`${r.ItemCode}-${r.BackorderDocNum}-${i}`}>
                            <td>
                              <strong className="mono">{r.ItemCode}</strong>
                              <div className="cell-sub">{r.ItemName}</div>
                            </td>
                            <td>{r.BackorderWhsCode || '—'}</td>
                            <td>
                              <div>{r.CardName || '—'}</div>
                              <div className="cell-sub mono">{r.CardCode}</div>
                            </td>
                            <td>{r.BackorderDocNum ?? '—'}</td>
                            <td>
                              {shortDate(r.OrderDate)}
                              <div className="cell-sub">{shortDate(r.DueDate)}</div>
                            </td>
                            <td className="num">{qty(r.BackorderQty)}</td>
                            <td className="num">{qty(r.BackorderWhsAvailableQty)}</td>
                            <td className="num">{money(r.BackorderValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePager
                    page={boTbl.page}
                    pageCount={boTbl.pageCount}
                    onPage={boTbl.setPage}
                    pageSize={boTbl.pageSize}
                    shown={boTbl.shown}
                  />
                </>
              )}
            </FilteredBlock>
          </>
        )}
      </Section>

      <Section
        id="sec-allocated"
        step={step(5)}
        title="Allocated Stock Across Warehouses"
        subtitle="Aged allocated stock (&gt; 6 months) across all warehouses — not only NE01 / NE02."
      >
        {data.itemCodes.length === 0 ? (
          <Empty text="Add SQ item codes to check aged allocations." />
        ) : data.allocatedStock.length === 0 ? (
          <Empty text="No aged allocated stock (&gt; 6 months) for these items." />
        ) : (
          <>
            <div className="kpi-row">
              <Kpi label="Aged allocation lines" value={String(data.allocatedStock.length)} tone="amber" />
              <Kpi
                label="Warehouses"
                value={String(new Set(data.allocatedStock.map((r) => r.WhsCode)).size)}
                tone="blue"
              />
              <Kpi
                label="Total aged value (sample item)"
                value={money(data.allocatedStock[0]?.ItemTotalAgedAllocatedValue)}
                tone="teal"
              />
            </div>
            <FilteredBlock>
              <TableToolbar
                query={allocTbl.query}
                onQuery={allocTbl.setQuery}
                searchPlaceholder="Search item / warehouse / customer…"
                filters={[
                  { id: 'item', label: 'Item', options: allocItems },
                  { id: 'whs', label: 'Warehouse', options: allocWhs },
                  { id: 'age', label: 'Age', options: ['6–9 months', '9–12 months', '12+ months'] },
                ]}
                selects={allocTbl.selects}
                onSelect={allocTbl.setSelect}
                shown={allocTbl.shown}
                total={allocTbl.total}
                hasActiveFilters={allocTbl.hasActiveFilters}
                onClear={allocTbl.clearFilters}
                pageSize={allocTbl.pageSize}
                onPageSize={allocTbl.setPageSize}
              />
              {allocTbl.shown === 0 ? (
                <Empty text="No allocated lines match the current filters." />
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Warehouse</th>
                          <th>Customer</th>
                          <th>SO</th>
                          <th>Order / Due</th>
                          <th className="num">Qty</th>
                          <th className="num">Value</th>
                          <th className="num">Days</th>
                          <th className="num">Months</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocTbl.pageRows.map((r, i) => (
                          <tr key={`${r.ItemCode}-${r.SalesOrderDocNum}-${r.WhsCode}-${i}`}>
                            <td>
                              <strong className="mono">{r.ItemCode}</strong>
                              <div className="cell-sub">{r.ItemName}</div>
                            </td>
                            <td>
                              <strong>{r.WhsCode}</strong>
                              <div className="cell-sub">{r.WhsName}</div>
                            </td>
                            <td>
                              <div>{r.CardName || '—'}</div>
                              <div className="cell-sub mono">{r.CardCode}</div>
                            </td>
                            <td>{r.SalesOrderDocNum ?? '—'}</td>
                            <td>
                              {shortDate(r.OrderDate)}
                              <div className="cell-sub">{shortDate(r.DueDate)}</div>
                            </td>
                            <td className="num">{qty(r.AllocatedQty)}</td>
                            <td className="num">{money(r.AllocatedValue)}</td>
                            <td className="num">
                              <Badge tone={num(r.DaysAllocated) > 270 ? 'rose' : 'amber'}>
                                {qty(r.DaysAllocated)}d
                              </Badge>
                            </td>
                            <td className="num">{qty(r.MonthsAllocated_Approx)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePager
                    page={allocTbl.page}
                    pageCount={allocTbl.pageCount}
                    onPage={allocTbl.setPage}
                    pageSize={allocTbl.pageSize}
                    shown={allocTbl.shown}
                  />
                </>
              )}
            </FilteredBlock>
          </>
        )}
      </Section>
    </>
  );
}
