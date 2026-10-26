import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActiveFilterChips } from './components/ActiveFilterChips';
import { AiAssistantPanel } from './components/AiAssistantPanel';
import { FilterPanel } from './components/FilterPanel';
import { KpiDrilldownView } from './components/KpiDrilldownView';
import { KpiGrid } from './components/KpiGrid';
import { SalesCharts } from './components/SalesCharts';
import { SalespersonTable } from './components/SalespersonTable';
import { SectionTabs, type DashboardSection } from './components/SectionTabs';
import { TopBar } from './components/TopBar';
import { exportSalesSummaryWorkbook, exportSalesmanCsv } from './lib/export-excel';
import { defaultFromDate, defaultToDate } from './lib/format';
import { sortSalesmanByMetric } from './lib/kpi-drilldown';
import {
  aggregateByCompany,
  aggregateByDivision,
  aggregateBySalesman,
  buildAiSummary,
  buildKpis,
  filterOptions as buildFilterOptions,
  filterRows,
  processRows,
} from './lib/sales-summary';
import type { DashboardFilters, EorderSchema, KpiDrilldownId, SalesSummaryResponse } from './types';

const SUMMARY_API =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD
    ? 'https://misapi.neweast.cloud/api/eorder/sales-order-summary'
    : '/api/eorder/sales-order-summary');

const SCHEMAS_API =
  import.meta.env.VITE_API_BASE?.replace('/sales-order-summary', '/schemas') ??
  (import.meta.env.PROD
    ? 'https://misapi.neweast.cloud/api/eorder/schemas'
    : '/api/eorder/schemas');

const DEFAULT_FILTERS: DashboardFilters = {
  co: 'BI_NEGT',
  fromDate: defaultFromDate(),
  toDate: defaultToDate(),
  company: 'all',
  division: 'all',
  salesman: 'all',
  search: '',
};

function buildSummaryUrl(filters: DashboardFilters, bust = false) {
  const params = new URLSearchParams({
    co: filters.co,
    from: filters.fromDate,
    to: filters.toDate,
  });
  if (bust) params.set('_', String(Date.now()));
  return `${SUMMARY_API}?${params.toString()}`;
}

export default function App() {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<SalesSummaryResponse | null>(null);
  const [schemas, setSchemas] = useState<EorderSchema[]>([{ id: 'BI_NEGT', label: 'NEGT (Default)' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [section, setSection] = useState<DashboardSection>('overview');
  const [drilldownKpi, setDrilldownKpi] = useState<KpiDrilldownId | null>(null);

  useEffect(() => {
    fetch(SCHEMAS_API)
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json.schemas)) setSchemas(json.schemas);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async (next: DashboardFilters, bust = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildSummaryUrl(next, bust));
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as SalesSummaryResponse);
      setSection('overview');
      setDrilldownKpi(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const processedAll = useMemo(() => (data ? processRows(data.rows) : []), [data]);
  const options = useMemo(() => buildFilterOptions(processedAll), [processedAll]);
  const filtered = useMemo(() => filterRows(processedAll, filters), [processedAll, filters]);
  const kpis = useMemo(() => buildKpis(filtered), [filtered]);
  const salesmanAgg = useMemo(() => aggregateBySalesman(filtered), [filtered]);
  const companyAgg = useMemo(() => aggregateByCompany(filtered), [filtered]);
  const divisionAgg = useMemo(() => aggregateByDivision(filtered), [filtered]);
  const aiSummary = useMemo(() => buildAiSummary(filtered, salesmanAgg), [filtered, salesmanAgg]);

  const totals = useMemo(() => {
    const totalSO = filtered.reduce((s, r) => s + r.SOAmountNum, 0);
    const totalDN = filtered.reduce((s, r) => s + r.DNAmountNum, 0);
    const totalINV = filtered.reduce((s, r) => s + r.INVAmountNum, 0);
    const conversionRate = totalSO > 0 ? (totalINV / totalSO) * 100 : 0;
    return { totalSO, totalDN, totalINV, conversionRate };
  }, [filtered]);

  const aiSampleRows = useMemo(
    () =>
      salesmanAgg.slice(0, 50).map((s) => ({
        salesperson: s.name,
        company: s.company,
        division: s.division,
        customers: s.customers,
        orders: s.orders,
        soAmount: s.soAmount,
        invAmount: s.invAmount,
        conversionRate: s.conversionRate,
      })),
    [salesmanAgg],
  );

  const subtitle = useMemo(() => {
    if (!data) return 'Sales Order Summary';
    const schema = schemas.find((s) => s.id === data.schema)?.label ?? data.schema;
    return `${schema} · ${data.fromDate} → ${data.toDate}`;
  }, [data, schemas]);

  const clearTableFilters = () => {
    setFilters((prev) => ({
      ...prev,
      company: 'all',
      division: 'all',
      salesman: 'all',
      search: '',
    }));
  };

  const removeFilter = (key: keyof DashboardFilters) => {
    if (key === 'search') setFilters((prev) => ({ ...prev, search: '' }));
    else if (key === 'company') setFilters((prev) => ({ ...prev, company: 'all' }));
    else if (key === 'division') setFilters((prev) => ({ ...prev, division: 'all' }));
    else if (key === 'salesman') setFilters((prev) => ({ ...prev, salesman: 'all' }));
  };

  const handleKpiClick = (id: KpiDrilldownId) => {
    setDrilldownKpi(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExport = () => {
    if (!data) return;
    exportSalesSummaryWorkbook(
      filtered,
      salesmanAgg,
      `sales-order-summary-${data.fromDate}-${data.toDate}.xlsx`,
    );
  };

  const hasActiveSlice =
    filters.company !== 'all' ||
    filters.division !== 'all' ||
    filters.salesman !== 'all' ||
    filters.search.trim();

  return (
    <div className={`eorder-app app ${aiOpen ? 'with-ai-panel' : ''}`}>
      <TopBar
        subtitle={subtitle}
        cachedAt={data?.cachedAt}
        loading={loading}
        onRefresh={() => load(filters, true)}
        onExport={handleExport}
        canExport={filtered.length > 0}
        onToggleAi={() => setAiOpen((v) => !v)}
        aiOpen={aiOpen}
      />

      {error && (
        <div className="alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <FilterPanel
        filters={filters}
        schemas={schemas}
        data={data}
        filterOptions={options}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onClear={clearTableFilters}
        onApplyDates={() => load(filters, true)}
        loading={loading}
      />

      {loading && !data && (
        <div className="app-loading">
          <div className="loader" />
          <p>Loading report data…</p>
        </div>
      )}

      {!loading && !data && !error && (
        <div className="hero-empty panel">
          <div className="hero-empty-icon">📊</div>
          <h2>Sales Order Summary</h2>
          <p>Select a period and load data to begin.</p>
          <button type="button" className="btn btn-primary" onClick={() => load(filters, true)}>
            Load current month
          </button>
        </div>
      )}

      {data && (
        <div className="report-body">
          {drilldownKpi ? (
            <>
              {hasActiveSlice && (
                <ActiveFilterChips
                  filters={filters}
                  filteredCount={filtered.length}
                  totalCount={processedAll.length}
                  onClear={clearTableFilters}
                  onRemove={removeFilter}
                />
              )}
              <KpiDrilldownView
                kpiId={drilldownKpi}
                salesmanRows={salesmanAgg}
                detailRows={filtered}
                onBack={() => setDrilldownKpi(null)}
                onExportCsv={() => exportSalesmanCsv(salesmanAgg)}
              />
            </>
          ) : (
            <>
              <SectionTabs active={section} onChange={setSection} />

              {hasActiveSlice && (
                <ActiveFilterChips
                  filters={filters}
                  filteredCount={filtered.length}
                  totalCount={processedAll.length}
                  onClear={clearTableFilters}
                  onRemove={removeFilter}
                />
              )}

              {section === 'overview' && (
                <div className="overview-layout">
                  <KpiGrid kpis={kpis} onKpiClick={handleKpiClick} />
                  <SalesCharts
                    variant="overview"
                    companyData={companyAgg}
                    divisionData={divisionAgg}
                    salesmanData={salesmanAgg}
                    totalSO={totals.totalSO}
                    totalDN={totals.totalDN}
                    totalINV={totals.totalINV}
                    conversionRate={totals.conversionRate}
                  />
                </div>
              )}

              {section === 'analytics' && (
                <SalesCharts
                  variant="full"
                  companyData={companyAgg}
                  divisionData={divisionAgg}
                  salesmanData={salesmanAgg}
                  totalSO={totals.totalSO}
                  totalDN={totals.totalDN}
                  totalINV={totals.totalINV}
                  conversionRate={totals.conversionRate}
                />
              )}

              {section === 'details' && (
                <SalespersonTable
                  rows={sortSalesmanByMetric(salesmanAgg, 'soAmount')}
                  onExportCsv={() => exportSalesmanCsv(salesmanAgg)}
                />
              )}
            </>
          )}
        </div>
      )}

      <AiAssistantPanel
        open={aiOpen}
        filters={filters}
        summary={aiSummary}
        sampleRows={aiSampleRows}
        onClose={() => setAiOpen(false)}
      />
    </div>
  );
}
