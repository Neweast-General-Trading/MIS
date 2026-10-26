import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ApiResponse, Filters, IntercompanyRow, StageId } from './types';
import { PIPELINE_STAGES, emptyFilters } from './types';
import {
  buildDailyTrend,
  buildKpis,
  buildPipelineOutcome,
  buildProgressPie,
  buildStageFunnel,
  companyLabel,
  countStuckAtStage,
  DISPLAY_CURRENCY,
  filterRows,
  rowsReachedStage,
  fmtDate,
  fmtInvoiceValueSar,
  fmtMoney,
  fmtNum,
  hasValue,
  rowProgress,
  uniqueSorted,
} from './lib/analytics';
import { buildExportOptions, runExportOption, type ExportOptionId } from './lib/export';
import { buildCycleTimeReport, filterRowsByInvoiceDate, invoiceDateBounds, journeyElapsedDays } from './lib/cycle-time';
import { readLocalIcCache, writeLocalIcCache } from './lib/local-cache';
import { CycleTimePanel } from './components/CycleTimePanel';
import { PanelHead } from './components/PanelHead';
import { SectionInfo } from './components/SectionInfo';
import { StageFunnelCards } from './components/StageFunnelCards';
/* Legacy bars kept in ./components/StageFunnelBars — swap back if cards are not preferred */
import { colorsByRankDesc, BRAND } from './lib/chart-colors';
import { SECTION_HELP } from './lib/section-help';
import './index.css';

const API =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD
    ? 'https://misapi.neweast.cloud/api/intercompany-ksa'
    : '/api/intercompany-ksa');

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(15,23,42,0.1)',
  fontSize: 12,
};

const STUCK_STACK_STAGES: { id: StageId; short: string; label: string; tone: string }[] = [
  { id: 'epl2', short: 'EPL2', label: 'EPL 2', tone: 'indigo' },
  { id: 'container', short: 'CNT', label: 'Container', tone: 'teal' },
  { id: 'draftGrpo', short: 'DRF', label: 'Draft GRPO', tone: 'violet' },
  { id: 'grpoBoe', short: 'BOE', label: 'Bill of Entry', tone: 'orange' },
];

type Tab = 'overview' | 'pipeline' | 'details';

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(() => readLocalIcCache());
  const [loading, setLoading] = useState(() => !readLocalIcCache());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [draft, setDraft] = useState<Filters>(emptyFilters());
  const [tab, setTab] = useState<Tab>('overview');
  const [selected, setSelected] = useState<IntercompanyRow | null>(null);
  const [stagePopup, setStagePopup] = useState<StageId | null>(null);
  const [page, setPage] = useState(0);
  const [journeyQuery, setJourneyQuery] = useState('');
  const [journeyStage, setJourneyStage] = useState<'' | StageId | 'complete'>('');
  const [journeyCompany, setJourneyCompany] = useState('');
  const [journeyPage, setJourneyPage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [trendFrom, setTrendFrom] = useState('');
  const [trendTo, setTrendTo] = useState('');
  const [trendCompany, setTrendCompany] = useState<'all' | 'isuzu' | 'sp'>('all');
  const [isPending, startTransition] = useTransition();
  const PAGE_SIZE = 15;
  const JOURNEY_PAGE_SIZE = 20;

  const load = useCallback(async (refresh = false) => {
    const hasLocal = Boolean(readLocalIcCache());
    if (refresh) setRefreshing(true);
    else if (!hasLocal) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const url = new URL(API, window.location.origin);
      if (refresh) url.searchParams.set('_', String(Date.now()));
      const res = await fetch(url.toString());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      const next = json as ApiResponse;
      setData(next);
      writeLocalIcCache(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load';
      setData((curr) => {
        if (!curr) setError(msg);
        return curr;
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.rows ?? [];
  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const kpis = useMemo(() => buildKpis(filtered), [filtered]);
  const stuckStack = useMemo(
    () =>
      STUCK_STACK_STAGES.map((s) => ({
        ...s,
        count: countStuckAtStage(filtered, s.id),
      })),
    [filtered],
  );
  const funnel = useMemo(() => buildStageFunnel(filtered), [filtered]);
  const pipelineOutcome = useMemo(() => buildPipelineOutcome(filtered), [filtered]);
  const progressPie = useMemo(() => buildProgressPie(filtered), [filtered]);
  const progressColors = useMemo(
    () => colorsByRankDesc(progressPie.slices.map((s) => s.sharePct || s.docs)),
    [progressPie.slices],
  );
  const outcomeColors = useMemo(
    () => colorsByRankDesc(pipelineOutcome.slices.map((s) => s.pct || s.value)),
    [pipelineOutcome.slices],
  );
  const invBounds = useMemo(() => invoiceDateBounds(rows), [rows]);
  useEffect(() => {
    if (!invBounds || trendFrom) return;
    setTrendFrom(invBounds.min);
    setTrendTo(invBounds.max);
  }, [invBounds, trendFrom]);
  const trendRows = useMemo(() => {
    let base = filterRowsByInvoiceDate(filtered, trendFrom, trendTo);
    if (trendCompany === 'isuzu') {
      base = base.filter((r) => (r['Target Company'] ?? '').includes('ISUZU'));
    } else if (trendCompany === 'sp') {
      base = base.filter((r) => {
        const co = r['Target Company'] ?? '';
        return co.includes('PARTS') || co.includes('SP');
      });
    }
    return base;
  }, [filtered, trendFrom, trendTo, trendCompany]);
  const trend = useMemo(() => buildDailyTrend(trendRows), [trendRows]);
  const cycleReport = useMemo(
    () => buildCycleTimeReport(filtered, data?.cachedAt ?? new Date().toISOString()),
    [filtered, data?.cachedAt],
  );

  const companies = useMemo(() => uniqueSorted(rows, (r) => r['Target Company']), [rows]);
  const cards = useMemo(() => uniqueSorted(rows, (r) => r.CardCode), [rows]);
  const statuses = useMemo(() => uniqueSorted(rows, (r) => r.IntegrationStatus), [rows]);
  const epl1Statuses = useMemo(() => uniqueSorted(rows, (r) => r.EPL1Status), [rows]);
  const epl2Statuses = useMemo(() => uniqueSorted(rows, (r) => r.EPL2Status), [rows]);
  const supplierOpts = useMemo(() => uniqueSorted(rows, (r) => r.POSupplier), [rows]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const applyFilters = () => {
    startTransition(() => {
      setFilters({ ...draft });
      setPage(0);
    });
  };

  const setQuick = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setDraft(next);
    startTransition(() => {
      setFilters(next);
      setPage(0);
    });
  };

  const clearAll = () => {
    const empty = emptyFilters();
    setDraft(empty);
    startTransition(() => {
      setFilters(empty);
      setPage(0);
    });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const stagePopupMeta = useMemo(
    () => (stagePopup ? PIPELINE_STAGES.find((s) => s.id === stagePopup) ?? null : null),
    [stagePopup],
  );
  const stagePopupRows = useMemo(
    () => (stagePopup ? rowsReachedStage(filtered, stagePopup) : []),
    [filtered, stagePopup],
  );
  const stagePopupStuck = useMemo(
    () => (stagePopup ? countStuckAtStage(filtered, stagePopup) : 0),
    [filtered, stagePopup],
  );

  const journeyFiltered = useMemo(() => {
    const q = journeyQuery.trim().toLowerCase();
    return filtered.filter((r) => {
      if (journeyCompany && r['Target Company'] !== journeyCompany) return false;
      if (journeyStage === 'complete') {
        if (!rowProgress(r).isComplete) return false;
      } else if (journeyStage) {
        if (rowProgress(r).current !== journeyStage) return false;
      }
      if (!q) return true;
      const hay = [
        r.InvoiceNumber,
        r.DocNum,
        r.DocEntry,
        r.CardCode,
        r.POSupplier,
        r['Target Company'],
        companyLabel(r['Target Company']),
        r.PONUM,
        r.SDDocNum,
        r['DEC.DOCNUM'],
        r.EPL1,
        r.CONTAINERNUM,
        r.GRPONUMBER,
        r.IntegrationStatus,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [filtered, journeyQuery, journeyStage, journeyCompany]);

  const journeyPageCount = Math.max(1, Math.ceil(journeyFiltered.length / JOURNEY_PAGE_SIZE));
  const journeyPageRows = journeyFiltered.slice(
    journeyPage * JOURNEY_PAGE_SIZE,
    journeyPage * JOURNEY_PAGE_SIZE + JOURNEY_PAGE_SIZE,
  );

  useEffect(() => {
    setJourneyPage(0);
  }, [filters, journeyQuery, journeyStage, journeyCompany]);

  useEffect(() => {
    if (!stagePopup && !selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selected) setSelected(null);
      else setStagePopup(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stagePopup, selected]);

  const openDetail = (row: IntercompanyRow) => {
    setSelected(row);
  };

  const detailFields = (row: IntercompanyRow): [string, string][] => [
    ['Company', companyLabel(row['Target Company'])],
    ['Card code', row.CardCode],
    ['Target', row.Target ?? '—'],
    ['Integration', row.IntegrationStatus ?? '—'],
    ['Invoice date', fmtDate(row['Invoice Date'])],
    ['Invoice value', fmtInvoiceValueSar(row)],
    ['Currency', DISPLAY_CURRENCY],
    ['Delivered qty', fmtNum(row.DeliveredQty)],
    ['Delivery date', fmtDate(row['Del.Date'])],
    ['Supplier', row.POSupplier ?? '—'],
    ['PO', fmtNum(row.PONUM)],
    ['PO date', fmtDate(row.PODocDate)],
    ['Stock delivery', fmtNum(row.SDDocNum)],
    ['SD date', fmtDate(row.SDDocDate)],
    ['Declaration', fmtNum(row['DEC.DOCNUM'])],
    ['EPL1', `${fmtNum(row.EPL1)} (${row.EPL1Status ?? '—'})`],
    ['EPL1 date', fmtDate(row.EPL1Date)],
    ['EPL2', `${fmtNum(row.EPL2)} (${row.EPL2Status ?? '—'})`],
    ['EPL2 date', fmtDate(row.EPL2Date)],
    ['Container', fmtNum(row.CONTAINERNUM)],
    ['Draft GRPO', fmtNum(row.DraftGRPO)],
    ['GRPO BOE', fmtNum(row.GRPOBOEDOCNUM)],
    ['GRPO', fmtNum(row.GRPONUMBER)],
    ['GRPO date', fmtDate(row.GRPODate ?? row.GRPODATE ?? row.BIGRPODATE)],
  ];

  useEffect(() => {
    if (!exportOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.export-menu')) return;
      setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [exportOpen]);

  const exportOptions = useMemo(
    () => buildExportOptions(rows, filtered),
    [rows, filtered],
  );

  const handleExport = (id: ExportOptionId) => {
    runExportOption(id, rows, filtered);
    setExportOpen(false);
  };

  if (loading && !data) {
    return (
      <div className="app app-loading">
        <div className="loader-ring" />
        <p>Loading intercompany pipeline…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="NEWEAST" />
          <div>
            <p className="eyebrow">KSA · Intercompany</p>
            <h1>Intercompany Tracking</h1>
          </div>
        </div>
        <div className="header-actions">
          <div className="export-menu">
            <button
              type="button"
              className="btn"
              aria-expanded={exportOpen}
              aria-haspopup="menu"
              disabled={!rows.length}
              onClick={() => setExportOpen((o) => !o)}
            >
              Excel Export ▾
            </button>
            {exportOpen && (
              <div className="export-dropdown" role="menu">
                <p className="export-dropdown-title">Download Excel</p>
                {exportOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitem"
                    className="export-option"
                    disabled={opt.disabled}
                    onClick={() => handleExport(opt.id)}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? '…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {(refreshing || isPending) && (
        <div className="busy-banner" role="status">
          <span className="busy-dot" />
          {refreshing ? 'Syncing from SAP HANA…' : 'Applying filters…'}
        </div>
      )}

      <section className="panel filters-panel">
        <PanelHead
          title={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}`}
          info={SECTION_HELP.filters}
          actions={
            <>
              <button type="button" className="btn btn-sm" onClick={clearAll}>Clear</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={applyFilters}>Apply</button>
            </>
          }
        />
        <div className="filters-grid">
          <label>
            <span className="filter-label">
              Company
            </span>
            <select value={draft.company} onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))}>
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>{companyLabel(c)} ({c})</option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">
              Card code
            </span>
            <select value={draft.cardCode} onChange={(e) => setDraft((d) => ({ ...d, cardCode: e.target.value }))}>
              <option value="">All cards</option>
              {cards.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">
              Integration status
              <SectionInfo text={SECTION_HELP.filterIntegrationStatus} title="Integration status filter" />
            </span>
            <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">
              Pipeline stage
              <SectionInfo text={SECTION_HELP.filterPipelineStage} title="Pipeline stage filter" />
            </span>
            <select value={draft.stage} onChange={(e) => setDraft((d) => ({ ...d, stage: e.target.value }))}>
              <option value="">Any stage</option>
              <option value="through_epl1">Invoicing (Phase 1)</option>
              <option value="after_epl1">Transfer & GRPO (Phase 2)</option>
              <option value="in_transit">In transit (all open)</option>
              <option value="stuck_stack">In transit (EPL2→BOE)</option>
              <option value="awaiting_grpo">Awaiting GRPO</option>
              <option value="complete">Fully complete</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.id} value={s.id}>Stuck at {s.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">
              Supplier
            </span>
            <select value={draft.supplier} onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value }))}>
              <option value="">All suppliers</option>
              {supplierOpts.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">
              EPL1 status
              <SectionInfo text={SECTION_HELP.filterEpl1} title="EPL1 status" />
            </span>
            <select value={draft.epl1Status} onChange={(e) => setDraft((d) => ({ ...d, epl1Status: e.target.value }))}>
              <option value="">All</option>
              {epl1Statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">
              EPL2 status
              <SectionInfo text={SECTION_HELP.filterEpl2} title="EPL2 status" />
            </span>
            <select value={draft.epl2Status} onChange={(e) => setDraft((d) => ({ ...d, epl2Status: e.target.value }))}>
              <option value="">All</option>
              {epl2Statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">From invoice date</span>
            <input type="date" value={draft.fromDate} onChange={(e) => setDraft((d) => ({ ...d, fromDate: e.target.value }))} />
          </label>
          <label>
            <span className="filter-label">To invoice date</span>
            <input type="date" value={draft.toDate} onChange={(e) => setDraft((d) => ({ ...d, toDate: e.target.value }))} />
          </label>
          <label className="span-2">
            <span className="filter-label">Search</span>
            <input
              type="search"
              placeholder="Invoice, PO, EPL, container, card…"
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </label>
        </div>
        {data?.cachedAt && (
          <p className="meta">Cached {new Date(data.cachedAt).toLocaleString()} · {filtered.length} of {rows.length} documents</p>
        )}
      </section>

      <div className="kpi-section">
        <div className="kpi-section-head">
          <h2>
            Key metrics
            <SectionInfo text={SECTION_HELP.kpis} title="Key metrics" />
          </h2>
        </div>
      <div className="kpi-strip">
        <div className="kpi-rows">
          <div className="kpi-grid">
            <button
              type="button"
              className={`kpi slate${filters.company === '' && !filters.stage ? ' active' : ''}`}
              onClick={() => setQuick({ company: '', stage: '' })}
            >
              <label># of Inv</label>
              <strong>{kpis.totalInvoices}</strong>
              <span className="kpi-foot">{kpis.total} documents</span>
            </button>
            <button
              type="button"
              className={`kpi blue${filters.company === '' && !filters.stage ? ' active' : ''}`}
              onClick={() => setQuick({ company: '', stage: '' })}
            >
              <label>Total INV</label>
              <strong className="kpi-money">{fmtMoney(kpis.totalSales, kpis.invCurrency)}</strong>
            </button>
            <button
              type="button"
              className={`kpi violet${filters.company.includes('ISUZU') ? ' active' : ''}`}
              onClick={() => setQuick({ company: companies.find((c) => c.includes('ISUZU')) ?? '' })}
            >
              <label>Isuzu INVs</label>
              <strong className="kpi-money">{fmtMoney(kpis.totalInvIsuzu, kpis.invCurrency)}</strong>
              {kpis.totalSales > 0 && (
                <span className="kpi-foot">{Math.round((kpis.totalInvIsuzu / kpis.totalSales) * 100)}%</span>
              )}
            </button>
            <button
              type="button"
              className={`kpi amber${filters.company.includes('PARTS') || filters.company.includes('SP') ? ' active' : ''}`}
              onClick={() => setQuick({ company: companies.find((c) => c.includes('PARTS') || c.includes('SP')) ?? '' })}
            >
              <label>Spare Parts INVs</label>
              <strong className="kpi-money">{fmtMoney(kpis.totalInvSp, kpis.invCurrency)}</strong>
              {kpis.totalSales > 0 && (
                <span className="kpi-foot">{Math.round((kpis.totalInvSp / kpis.totalSales) * 100)}%</span>
              )}
            </button>
          </div>

          <div className="kpi-grid">
            <button
              type="button"
              className={`kpi green${filters.stage === 'complete' ? ' active' : ''}`}
              onClick={() => setQuick({ stage: 'complete' })}
            >
              <label>Complete</label>
              <strong>{kpis.completed}</strong>
            </button>
            <button
              type="button"
              className={`kpi rose${filters.stage === 'in_transit' ? ' active' : ''}`}
              onClick={() => setQuick({ stage: 'in_transit' })}
            >
              <label>Pending</label>
              <strong>{kpis.invoicesPending}</strong>
            </button>
            <button
              type="button"
              className={`kpi violet${filters.stage === 'through_epl1' ? ' active' : ''}`}
              onClick={() => setQuick({ stage: 'through_epl1' })}
            >
              <label>Invoicing</label>
              <strong>{kpis.invoicesThroughEpl1}</strong>
              <span className="kpi-foot">(Invoice → EPL 1) done</span>
            </button>
            <button
              type="button"
              className={`kpi cyan${filters.stage === 'after_epl1' ? ' active' : ''}`}
              onClick={() => setQuick({ stage: 'after_epl1' })}
            >
              <label>Transfer & GRPO</label>
              <strong>{kpis.invoicesStuckAfterEpl1}</strong>
              <span className="kpi-foot">(EPL 2 → GRPO) open</span>
            </button>
          </div>

          <div className="kpi-stuck-block">
            <div className="kpi-stuck-head">
              <span className="kpi-stuck-title">Where documents are stuck</span>
            </div>
            <div className="kpi-grid">
              {stuckStack.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`kpi ${s.tone}${filters.stage === s.id ? ' active' : ''}${s.count === 0 ? ' kpi-zero' : ''}`}
                  title={s.label}
                  onClick={() => setQuick({ stage: s.id })}
                >
                  <label>{s.short}</label>
                  <strong>{s.count}</strong>
                  <span className="kpi-foot">({s.label})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>

      <nav className="tabs">
        {([
          ['overview', 'Overview'],
          ['pipeline', 'Pipeline'],
          ['details', 'Details'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="charts-grid">
          <div className="overview-split span-12">
            <section className="panel chart-card">
              <PanelHead title="Invoice volume by day" info={SECTION_HELP.overviewTrend} />
              <div className="trend-date-bar">
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={trendFrom}
                    min={invBounds?.min}
                    max={invBounds?.max}
                    onChange={(e) => setTrendFrom(e.target.value)}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={trendTo}
                    min={invBounds?.min}
                    max={invBounds?.max}
                    onChange={(e) => setTrendTo(e.target.value)}
                  />
                </label>
                <label>
                  <span>Company</span>
                  <select
                    value={trendCompany}
                    onChange={(e) => setTrendCompany(e.target.value as 'all' | 'isuzu' | 'sp')}
                  >
                    <option value="all">All</option>
                    <option value="isuzu">ISUZU</option>
                    <option value="sp">Spare Parts</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    if (invBounds) {
                      setTrendFrom(invBounds.min);
                      setTrendTo(invBounds.max);
                    }
                    setTrendCompany('all');
                  }}
                >
                  Reset
                </button>
              </div>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="gIsuzu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gParts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(v) => String(v).slice(5)}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip
                      content={({ active, label, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as {
                          isuzu?: number;
                          parts?: number;
                          isuzuValue?: number;
                          partsValue?: number;
                        } | undefined;
                        if (!row) return null;
                        return (
                          <div className="trend-tooltip">
                            <div className="trend-tooltip-date">{String(label)}</div>
                            {(trendCompany === 'all' || trendCompany === 'isuzu') &&
                              (row.isuzu ?? 0) > 0 && (
                                <div className="trend-tooltip-row isuzu">
                                  <span>ISUZU</span>
                                  <strong>
                                    {row.isuzu} | {fmtMoney(row.isuzuValue ?? 0)}
                                  </strong>
                                </div>
                              )}
                            {(trendCompany === 'all' || trendCompany === 'sp') &&
                              (row.parts ?? 0) > 0 && (
                                <div className="trend-tooltip-row parts">
                                  <span>SP</span>
                                  <strong>
                                    {row.parts} | {fmtMoney(row.partsValue ?? 0)}
                                  </strong>
                                </div>
                              )}
                          </div>
                        );
                      }}
                    />
                    {(trendCompany === 'all' || trendCompany === 'isuzu') && (
                      <Area
                        type="monotone"
                        dataKey="isuzu"
                        name="ISUZU"
                        stroke="#60A5FA"
                        fill="url(#gIsuzu)"
                        strokeWidth={2}
                      />
                    )}
                    {(trendCompany === 'all' || trendCompany === 'sp') && (
                      <Area
                        type="monotone"
                        dataKey="parts"
                        name="Spare Parts"
                        stroke="#10B981"
                        fill="url(#gParts)"
                        strokeWidth={2}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <CycleTimePanel
              report={cycleReport}
              info={SECTION_HELP.overviewCycleTime}
              onStageClick={(id) => setStagePopup(id)}
            />
          </div>

          <div className="overview-split span-12">
            <section className="panel chart-card">
              <PanelHead title="Pipeline outcome" info={SECTION_HELP.overviewOutcome} />
              <div className="insight-body">
                <div className="cycle-donut-wrap">
                  {pipelineOutcome.slices.length ? (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={pipelineOutcome.slices}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={68}
                            outerRadius={96}
                            paddingAngle={3}
                            stroke="#fff"
                            strokeWidth={2}
                            onClick={(d) => {
                              const id = (d as { id?: string }).id;
                              if (id === 'complete') setQuick({ stage: 'complete' });
                              else if (id === 'open') setQuick({ stage: 'in_transit' });
                            }}
                          >
                            {pipelineOutcome.slices.map((s, i) => (
                              <Cell
                                key={s.id}
                                fill={outcomeColors[i] ?? BRAND.blue}
                                cursor="pointer"
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="cycle-donut-center">
                        <strong className="insight-center-money">{fmtMoney(pipelineOutcome.totalValue)}</strong>
                        <span>total SAR</span>
                        <em>{pipelineOutcome.totalDocs} docs</em>
                      </div>
                    </>
                  ) : (
                    <p className="cycle-pie-empty muted">No documents in the current filter.</p>
                  )}
                </div>
                <ul className="outcome-list">
                  {pipelineOutcome.slices.map((s, i) => {
                    const color = outcomeColors[i] ?? BRAND.blue;
                    const tone = s.id === 'complete' ? 'ok' : 'open';
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={`outcome-row outcome-row-${tone}`}
                          onClick={() =>
                            setQuick({ stage: s.id === 'complete' ? 'complete' : 'in_transit' })
                          }
                        >
                          <div className="outcome-row-top">
                            <span className="outcome-row-label">
                              <span className="outcome-dot" style={{ background: color }} />
                              <span>
                                <strong>{s.name}</strong>
                                <em>{s.docs} docs</em>
                              </span>
                            </span>
                            <span className="outcome-row-pct" style={{ color }}>{s.pct}%</span>
                          </div>
                          <div className="outcome-row-bar" aria-hidden="true">
                            <span style={{ width: `${s.pct}%`, background: color }} />
                          </div>
                          <div className="outcome-row-money">{fmtMoney(s.value)}</div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            <section className="panel chart-card">
              <PanelHead title="Pipeline progress" info={SECTION_HELP.overviewProgress} />
              <div className="insight-body">
                <div className="cycle-donut-wrap">
                  {progressPie.slices.length ? (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={progressPie.slices}
                            dataKey="docs"
                            nameKey="short"
                            cx="50%"
                            cy="50%"
                            innerRadius={68}
                            outerRadius={96}
                            paddingAngle={2}
                            stroke="#fff"
                            strokeWidth={2}
                            onClick={(d) => {
                              const id = (d as { id?: string }).id;
                              if (!id) return;
                              setQuick({ stage: id === 'complete' ? 'complete' : (id as StageId) });
                            }}
                          >
                            {progressPie.slices.map((s, i) => (
                              <Cell
                                key={s.id}
                                fill={progressColors[i] ?? BRAND.blue}
                                cursor="pointer"
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="cycle-donut-center">
                        <strong>{progressPie.avgProgress}%</strong>
                        <span>avg progress</span>
                        <em>
                          {progressPie.completeDocs} done · {progressPie.openDocs} open
                        </em>
                      </div>
                    </>
                  ) : (
                    <p className="cycle-pie-empty muted">No documents in the current filter.</p>
                  )}
                </div>
                <ul className="cycle-stage-list">
                  {progressPie.slices.map((s, i) => {
                    const color = progressColors[i] ?? BRAND.blue;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="cycle-stage-row"
                          onClick={() =>
                            setQuick({ stage: s.id === 'complete' ? 'complete' : s.id })
                          }
                          title={`Filter: ${s.label}`}
                        >
                          <span className="cycle-stage-dot" style={{ background: color }} />
                          <span className="cycle-stage-text">
                            <span className="cycle-stage-name">{s.short}</span>
                            <span className="cycle-stage-phase">
                              {s.id === 'complete' ? 'Complete' : s.label.replace('Waiting · ', '')}
                            </span>
                          </span>
                          <span className="cycle-stage-bar" aria-hidden="true">
                            <span
                              className="cycle-stage-bar-fill"
                              style={{ width: `${s.sharePct}%`, background: color }}
                            />
                          </span>
                          <span className="cycle-stage-days">{s.docs}</span>
                          <span className="cycle-stage-pct">{s.sharePct}%</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          </div>

        </div>
      )}

      {tab === 'pipeline' && (
        <div className="pipeline-view">
          <section className="panel">
            <PanelHead title="Stage completion funnel" info={SECTION_HELP.pipelineFunnel} />
            <StageFunnelCards
              stages={funnel}
              onStageClick={(id) => setStagePopup(id as StageId)}
              activeId={stagePopup}
            />
          </section>

          <section className="panel journey-panel">
            <PanelHead
              title="Document journey board"
              info={SECTION_HELP.pipelineJourney}
              actions={
                <span className="journey-count-pill">
                  {journeyFiltered.length} document{journeyFiltered.length === 1 ? '' : 's'}
                </span>
              }
            />
            <div className="journey-toolbar">
              <div className="journey-search-wrap">
                <input
                  type="search"
                  className="journey-search"
                  placeholder="Search invoice, doc, card, supplier…"
                  value={journeyQuery}
                  onChange={(e) => setJourneyQuery(e.target.value)}
                  aria-label="Search journey documents"
                />
              </div>
              <div className="journey-filters">
                <label className="journey-filter">
                  <span>Company</span>
                  <select
                    value={journeyCompany}
                    onChange={(e) => setJourneyCompany(e.target.value)}
                    aria-label="Filter by company"
                  >
                    <option value="">All companies</option>
                    {companies.map((c) => (
                      <option key={c} value={c}>
                        {companyLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="journey-filter">
                  <span>Stage</span>
                  <select
                    value={journeyStage}
                    onChange={(e) =>
                      setJourneyStage(e.target.value as '' | StageId | 'complete')
                    }
                    aria-label="Filter by pipeline stage"
                  >
                    <option value="">All stages</option>
                    <option value="complete">Complete</option>
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.short}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {journeyPageRows.length === 0 ? (
              <p className="muted journey-empty">No documents match this search.</p>
            ) : (
              <div className="journey-list">
                {journeyPageRows.map((r) => {
                  const p = rowProgress(r);
                  const elapsed = journeyElapsedDays(r, data?.cachedAt);
                  return (
                    <button
                      key={r.DocEntry}
                      type="button"
                      className="journey-card"
                      onClick={() => openDetail(r)}
                    >
                      <span
                        className={`journey-days-badge${elapsed.kind === 'complete' ? ' done' : ''}`}
                        title={
                          elapsed.kind === 'complete'
                            ? 'Invoice date → GRPO date'
                            : 'Invoice date → today'
                        }
                      >
                        <strong>{elapsed.days === null ? '—' : elapsed.days}</strong>
                        <em>Days</em>
                      </span>
                      <div className="journey-top">
                        <div>
                          <strong>INV {fmtNum(r.InvoiceNumber)}</strong>
                          <span className="muted"> · Doc {r.DocNum}</span>
                          <span className={`pill journey-co ${companyLabel(r['Target Company']).toLowerCase()}`}>
                            {companyLabel(r['Target Company'])}
                          </span>
                        </div>
                      </div>
                      <div className="stage-track">
                        {PIPELINE_STAGES.map((s) => {
                          const done = p.done.includes(s.id);
                          const current = p.current === s.id;
                          return (
                            <span
                              key={s.id}
                              className={`stage-dot${done ? ' done' : ''}${current ? ' current' : ''}`}
                              title={s.label}
                            >
                              {s.short}
                            </span>
                          );
                        })}
                      </div>
                      <div className="journey-foot">
                        <span>{fmtDate(r['Invoice Date'])}</span>
                        <span>
                          {p.pct}% ·{' '}
                          {p.current
                            ? `At ${PIPELINE_STAGES.find((s) => s.id === p.current)?.label}`
                            : 'Complete'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="pager">
              <button
                type="button"
                className="btn btn-sm"
                disabled={journeyPage === 0}
                onClick={() => setJourneyPage((p) => p - 1)}
              >
                Prev
              </button>
              <span>
                Page {Math.min(journeyPage + 1, journeyPageCount)} / {journeyPageCount}
                <span className="muted"> · {JOURNEY_PAGE_SIZE} per page</span>
              </span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={journeyPage >= journeyPageCount - 1}
                onClick={() => setJourneyPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === 'details' && (
        <section className="panel details-panel">
          <PanelHead title="Document details" info={SECTION_HELP.detailsTable} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Company</th>
                  <th>Card</th>
                  <th>Status</th>
                  <th>PO</th>
                  <th>SD</th>
                  <th>EPL1</th>
                  <th>Container</th>
                  <th>GRPO</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const p = rowProgress(r);
                  return (
                    <tr key={r.DocEntry} className={selected?.DocEntry === r.DocEntry ? 'selected' : ''} onClick={() => openDetail(r)}>
                      <td className="mono">{fmtNum(r.InvoiceNumber)}</td>
                      <td>{fmtDate(r['Invoice Date'])}</td>
                      <td><span className={`pill ${companyLabel(r['Target Company']).toLowerCase()}`}>{companyLabel(r['Target Company'])}</span></td>
                      <td className="mono">{r.CardCode}</td>
                      <td>{r.IntegrationStatus ?? '—'}</td>
                      <td className="mono">{fmtNum(r.PONUM)}</td>
                      <td className="mono">{fmtNum(r.SDDocNum)}</td>
                      <td className="mono">{fmtNum(r.EPL1)}</td>
                      <td className="mono">{fmtNum(r.CONTAINERNUM)}</td>
                      <td className="mono">{fmtNum(r.GRPONUMBER)}</td>
                      <td>
                        <div className="prog">
                          <div className="prog-bar"><span style={{ width: `${p.pct}%` }} /></div>
                          <em>{p.pct}%</em>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {page + 1} / {pageCount}</span>
            <button type="button" className="btn btn-sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </section>
      )}

      {stagePopup && stagePopupMeta && (
        <div
          className="stage-modal-backdrop"
          role="presentation"
          onClick={() => setStagePopup(null)}
        >
          <div
            className="stage-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stage-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="stage-modal-head">
              <div>
                <h3 id="stage-modal-title">
                  {stagePopupMeta.label} ({stagePopupMeta.short})
                </h3>
                <p className="muted">
                  {stagePopupRows.length} document{stagePopupRows.length === 1 ? '' : 's'} reached this stage
                  {stagePopupStuck > 0 ? ` · ${stagePopupStuck} waiting here` : ''}
                  {' · '}
                  current filters applied
                </p>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setStagePopup(null)}>
                Close
              </button>
            </div>
            {stagePopupRows.length === 0 ? (
              <p className="stage-modal-empty muted">No documents reached this stage for the current filters.</p>
            ) : (
              <div className="stage-modal-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Doc</th>
                      <th>Company</th>
                      <th>Supplier</th>
                      <th>Invoice date</th>
                      <th>{stagePopupMeta.short}</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagePopupRows.map((r) => {
                      const waiting = rowProgress(r).current === stagePopup;
                      return (
                        <tr
                          key={r.DocEntry}
                          className={waiting ? 'row-waiting' : ''}
                          onClick={() => {
                            openDetail(r);
                            setStagePopup(null);
                          }}
                        >
                          <td>{fmtNum(r.InvoiceNumber)}</td>
                          <td>{r.DocNum}</td>
                          <td>{companyLabel(r['Target Company'])}</td>
                          <td>{r.POSupplier ?? '—'}</td>
                          <td>{fmtDate(r['Invoice Date'])}</td>
                          <td>{fmtNum(r[stagePopupMeta.field])}</td>
                          <td>
                            {waiting ? (
                              <span className="pill amber">Waiting</span>
                            ) : (
                              <span className="pill green">Done</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {selected && (
        <div
          className="stage-modal-backdrop"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <div
            className="stage-modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="stage-modal-head">
              <div>
                <h3 id="detail-modal-title">Invoice {fmtNum(selected.InvoiceNumber)}</h3>
                <p className="muted">
                  Doc {selected.DocNum} · Entry {selected.DocEntry} ·{' '}
                  {companyLabel(selected['Target Company'])} · {rowProgress(selected).pct}% complete
                </p>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <div className="detail-modal-body">
              <div className="drawer-grid">
                {detailFields(selected).map(([k, v]) => (
                  <div key={k} className="drawer-item">
                    <label>{k}</label>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <div className="stage-track large">
                {PIPELINE_STAGES.map((s) => {
                  const p = rowProgress(selected);
                  const done = p.done.includes(s.id);
                  const current = p.current === s.id;
                  return (
                    <span
                      key={s.id}
                      className={`stage-dot${done ? ' done' : ''}${current ? ' current' : ''}`}
                    >
                      <b>{s.short}</b>
                      <small>{hasValue(selected[s.field]) ? fmtNum(selected[s.field]) : 'pending'}</small>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
