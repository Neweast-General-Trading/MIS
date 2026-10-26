import type { Filters, IntercompanyRow, StageId } from '../types';
import { PIPELINE_STAGES } from '../types';

export function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

export function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(String(v).slice(0, 10));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(v: string | null | undefined): string {
  const d = parseDate(v);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtNum(v: unknown): string {
  if (!hasValue(v)) return '—';
  return String(v);
}

export function toAmount(v: unknown): number {
  if (!hasValue(v)) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** KSA dashboard always presents amounts in Saudi Riyal. */
export const DISPLAY_CURRENCY = 'SAR';

/** AED → SAR via USD pegs (1 USD = 3.6725 AED, 1 USD = 3.75 SAR). */
export const AED_TO_SAR = 3.75 / 3.6725;

/** Convert invoice amount to SAR for display. */
export function toSarAmount(value: unknown, currency?: string | null): number {
  const n = toAmount(value);
  const cur = String(currency ?? '').trim().toUpperCase();
  if (!cur || cur === 'SAR') return n;
  if (cur === 'AED') return n * AED_TO_SAR;
  return n;
}

export function fmtMoney(v: unknown, currency: string = DISPLAY_CURRENCY): string {
  const n = toAmount(v);
  const cur = currency?.trim() || DISPLAY_CURRENCY;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur.length === 3 ? cur : DISPLAY_CURRENCY,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${cur} ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
}

export function fmtMoneyCompact(v: unknown, currency: string = DISPLAY_CURRENCY): string {
  const n = toAmount(v);
  const cur = currency?.trim() || DISPLAY_CURRENCY;
  if (Math.abs(n) >= 1_000_000) {
    return `${cur} ${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  }
  if (Math.abs(n) >= 100_000) {
    return `${cur} ${(n / 1_000).toFixed(0)}K`;
  }
  return fmtMoney(n, cur);
}

/** Format row invoice value already converted to SAR. */
export function fmtInvoiceValueSar(row: { InvoiceValue?: unknown; Currency?: string | null }): string {
  if (!hasValue(row.InvoiceValue)) return '—';
  return fmtMoney(toSarAmount(row.InvoiceValue, row.Currency), DISPLAY_CURRENCY);
}

export function companyLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  if (code.includes('ISUZU')) return 'ISUZU';
  if (code.includes('PARTS') || code.includes('SP')) return 'Parts';
  return code;
}

export function rowProgress(row: IntercompanyRow) {
  const done: StageId[] = [];
  let current: StageId | null = null;
  for (const stage of PIPELINE_STAGES) {
    const ok = hasValue(row[stage.field]);
    if (ok) done.push(stage.id);
    else if (!current) current = stage.id;
  }
  return {
    done,
    current,
    completedCount: done.length,
    total: PIPELINE_STAGES.length,
    pct: Math.round((done.length / PIPELINE_STAGES.length) * 100),
    isComplete: done.length === PIPELINE_STAGES.length,
  };
}

function dateKey(v: string | null | undefined): string {
  return String(v ?? '').slice(0, 10);
}

export function filterRows(rows: IntercompanyRow[], f: Filters): IntercompanyRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.company && r['Target Company'] !== f.company) return false;
    if (f.cardCode && r.CardCode !== f.cardCode) return false;
    if (f.status && (r.IntegrationStatus ?? '') !== f.status) return false;
    if (f.epl1Status && (r.EPL1Status ?? '') !== f.epl1Status) return false;
    if (f.epl2Status && (r.EPL2Status ?? '') !== f.epl2Status) return false;
    if (f.supplier && (r.POSupplier ?? '') !== f.supplier) return false;
    if (f.stage) {
      const p = rowProgress(r);
      if (f.stage === 'complete') {
        if (!p.isComplete) return false;
      } else if (f.stage === 'awaiting_grpo') {
        if (!isAwaitingGrpoRow(r)) return false;
      } else if (f.stage === 'through_epl1') {
        if (!hasValue(r.EPL1)) return false;
      } else if (f.stage === 'after_epl1') {
        if (
          !hasValue(r.EPL1) ||
          p.isComplete ||
          !p.current ||
          !POST_EPL1_STAGES.includes(p.current)
        ) {
          return false;
        }
      } else if (f.stage === 'in_transit') {
        if (p.isComplete) return false;
      } else if (f.stage === 'stuck_stack') {
        if (
          p.isComplete ||
          !p.current ||
          !SHIPMENT_STACK_STAGES.includes(p.current) ||
          !isAwaitingGrpoRow(r)
        ) {
          return false;
        }
      } else {
        if (p.current !== f.stage) return false;
      }
    }
    if (f.fromDate) {
      const inv = dateKey(r['Invoice Date']);
      if (!inv || inv < f.fromDate) return false;
    }
    if (f.toDate) {
      const inv = dateKey(r['Invoice Date']);
      if (!inv || inv > f.toDate) return false;
    }
    if (q) {
      const hay = [
        r.DocNum,
        r.InvoiceNumber,
        r.CardCode,
        r['Target Company'],
        r.POSupplier,
        r.PONUM,
        r.SDDocNum,
        r.EPL1,
        r.EPL2,
        r.CONTAINERNUM,
        r.GRPONUMBER,
        r.IntegrationStatus,
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ');
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function uniqueSorted(rows: IntercompanyRow[], pick: (r: IntercompanyRow) => string | null | undefined) {
  return [...new Set(rows.map((r) => pick(r)).filter((v): v is string => !!v && v.trim() !== ''))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export type StuckStageKpi = {
  stageId: StageId;
  short: string;
  label: string;
  count: number;
  /** Share of pending documents waiting at this stage. */
  pct: number;
};

/** Stages after EPL1 in the intercompany pipeline. */
export const POST_EPL1_STAGES: StageId[] = ['epl2', 'container', 'draftGrpo', 'grpoBoe', 'grpo'];

/** Late pipeline stages shown in the stuck KPI row (EPL2 → BOE). */
export const SHIPMENT_STACK_STAGES: StageId[] = ['epl2', 'container', 'draftGrpo', 'grpoBoe'];

export type Kpis = {
  total: number;
  isuzu: number;
  parts: number;
  /** Total sales SAR (ISUZU + SP). */
  totalSales: number;
  /** Sum of unique InvoiceValue for ISUZU (SAR). */
  totalInvIsuzu: number;
  /** Sum of unique InvoiceValue for Parts / SP (SAR). */
  totalInvSp: number;
  invCurrency: string;
  /** Unique invoice count. */
  totalInvoices: number;
  /** Unique invoices with full pipeline complete. */
  invoicesComplete: number;
  /** Unique invoices still in pipeline. */
  invoicesPending: number;
  /** Unique invoices with INV → EPL1 cleared on every document. */
  invoicesThroughEpl1: number;
  /** Unique open invoices waiting at EPL2 or later. */
  invoicesStuckAfterEpl1: number;
  /** Non-complete documents grouped by waiting stage. */
  stuckBreakdown: StuckStageKpi[];
  completed: number;
  inTransit: number;
  /** Documents waiting in the EPL2 → BOE shipment stack. */
  stuckInStack: number;
  awaitingGrpo: number;
  withEpl1: number;
  withContainer: number;
  /** Documents fully through all pipeline stages. */
  completionRate: number;
  /** Unique invoices fully complete. */
  invoiceCompletionRate: number;
  avgProgress: number;
};

function isIsuzuCompany(code: string | null | undefined): boolean {
  return (code ?? '').includes('ISUZU');
}

function isPartsCompany(code: string | null | undefined): boolean {
  const co = code ?? '';
  return co.includes('PARTS') || co.includes('SP');
}

/** EPL1 posted but final GRPO number not yet in SAP. */
export function isAwaitingGrpoRow(row: IntercompanyRow): boolean {
  return hasValue(row.EPL1) && !hasValue(row.GRPONUMBER);
}

export function buildKpis(rows: IntercompanyRow[]): Kpis {
  let isuzu = 0;
  let parts = 0;
  let totalInvIsuzu = 0;
  let totalInvSp = 0;
  let completed = 0;
  let awaitingGrpo = 0;
  let withEpl1 = 0;
  let withContainer = 0;
  let progressSum = 0;
  let stuckInStack = 0;
  const invCurrency = DISPLAY_CURRENCY;
  const seenValue = new Set<string>();
  const invTrack = new Map<
    string,
    { throughEpl1: boolean; complete: boolean; stuckAfterEpl1: boolean }
  >();
  const stuckMap = new Map<StageId, number>();

  for (const r of rows) {
    const co = r['Target Company'];
    if (isIsuzuCompany(co)) isuzu++;
    else if (isPartsCompany(co)) parts++;

    if (hasValue(r.InvoiceNumber) && hasValue(r.InvoiceValue)) {
      const invKey = `${co ?? ''}:${r.InvoiceNumber}`;
      if (!seenValue.has(invKey)) {
        seenValue.add(invKey);
        const amount = toSarAmount(r.InvoiceValue, r.Currency);
        if (isIsuzuCompany(co)) totalInvIsuzu += amount;
        else if (isPartsCompany(co)) totalInvSp += amount;
      }
    }

    if (hasValue(r.InvoiceNumber)) {
      const invKey = `${co ?? ''}:${r.InvoiceNumber}`;
      const p = rowProgress(r);
      let track = invTrack.get(invKey);
      if (!track) {
        track = { throughEpl1: true, complete: true, stuckAfterEpl1: false };
        invTrack.set(invKey, track);
      }
      if (!hasValue(r.EPL1)) track.throughEpl1 = false;
      if (!p.isComplete) track.complete = false;
      if (
        hasValue(r.EPL1) &&
        !p.isComplete &&
        p.current &&
        POST_EPL1_STAGES.includes(p.current)
      ) {
        track.stuckAfterEpl1 = true;
      }
    }

    const p = rowProgress(r);
    progressSum += p.pct;
    if (p.isComplete) completed++;
    if (isAwaitingGrpoRow(r)) awaitingGrpo++;
    if (hasValue(r.EPL1)) withEpl1++;
    if (hasValue(r.CONTAINERNUM)) withContainer++;
    if (!p.isComplete && p.current) {
      stuckMap.set(p.current, (stuckMap.get(p.current) ?? 0) + 1);
      if (isAwaitingGrpoRow(r) && SHIPMENT_STACK_STAGES.includes(p.current)) stuckInStack++;
    }
  }

  let invoicesComplete = 0;
  let invoicesPending = 0;
  let invoicesThroughEpl1 = 0;
  let invoicesStuckAfterEpl1 = 0;
  for (const track of invTrack.values()) {
    if (track.complete) invoicesComplete++;
    else invoicesPending++;
    if (track.throughEpl1) invoicesThroughEpl1++;
    if (track.throughEpl1 && !track.complete && track.stuckAfterEpl1) invoicesStuckAfterEpl1++;
  }

  const inTransit = rows.length - completed;
  const stuckBreakdown: StuckStageKpi[] = PIPELINE_STAGES.map((stage) => ({
    stageId: stage.id,
    short: stage.short,
    label: stage.label,
    count: stuckMap.get(stage.id) ?? 0,
    pct: inTransit ? Math.round(((stuckMap.get(stage.id) ?? 0) / inTransit) * 100) : 0,
  })).filter((s) => s.count > 0);

  return {
    total: rows.length,
    isuzu,
    parts,
    totalSales: totalInvIsuzu + totalInvSp,
    totalInvIsuzu,
    totalInvSp,
    invCurrency,
    totalInvoices: invTrack.size,
    invoicesComplete,
    invoicesPending,
    invoicesThroughEpl1,
    invoicesStuckAfterEpl1,
    stuckBreakdown,
    completed,
    inTransit,
    stuckInStack,
    awaitingGrpo,
    withEpl1,
    withContainer,
    completionRate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
    invoiceCompletionRate: invTrack.size
      ? Math.round((invoicesComplete / invTrack.size) * 100)
      : 0,
    avgProgress: rows.length ? Math.round(progressSum / rows.length) : 0,
  };
}

export function buildCompanyChart(rows: IntercompanyRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = companyLabel(r['Target Company']);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

export function buildStatusChart(rows: IntercompanyRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = r.IntegrationStatus || 'Unknown';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

export function buildStageFunnel(rows: IntercompanyRow[]) {
  return PIPELINE_STAGES.map((stage) => {
    const count = rows.filter((r) => hasValue(r[stage.field])).length;
    return {
      id: stage.id,
      name: stage.short,
      label: stage.label,
      count,
      pct: rows.length ? Math.round((count / rows.length) * 100) : 0,
    };
  });
}

export function rowsReachedStage(rows: IntercompanyRow[], stageId: StageId): IntercompanyRow[] {
  const stage = PIPELINE_STAGES.find((s) => s.id === stageId);
  if (!stage) return [];
  return rows.filter((r) => hasValue(r[stage.field]));
}

export function countStuckAtStage(rows: IntercompanyRow[], stageId: StageId): number {
  return rows.filter((r) => rowProgress(r).current === stageId).length;
}

export function buildDailyTrend(rows: IntercompanyRow[]) {
  type DayAgg = {
    date: string;
    total: number;
    isuzu: number;
    parts: number;
    isuzuValue: number;
    partsValue: number;
  };
  const map = new Map<string, DayAgg>();
  const seenValue = new Set<string>();

  for (const r of rows) {
    const d = dateKey(r['Invoice Date']);
    if (!d) continue;
    const cur = map.get(d) ?? {
      date: d,
      total: 0,
      isuzu: 0,
      parts: 0,
      isuzuValue: 0,
      partsValue: 0,
    };
    cur.total++;
    const co = r['Target Company'] ?? '';
    const isIsuzu = co.includes('ISUZU');
    const isParts = co.includes('PARTS') || co.includes('SP');
    if (isIsuzu) cur.isuzu++;
    else if (isParts) cur.parts++;

    if (hasValue(r.InvoiceNumber) && hasValue(r.InvoiceValue)) {
      const invKey = `${d}:${co}:${r.InvoiceNumber}`;
      if (!seenValue.has(invKey)) {
        seenValue.add(invKey);
        const amount = toSarAmount(r.InvoiceValue, r.Currency);
        if (isIsuzu) cur.isuzuValue += amount;
        else if (isParts) cur.partsValue += amount;
      }
    }
    map.set(d, cur);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildStuckAtChart(rows: IntercompanyRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const p = rowProgress(r);
    if (p.isComplete) {
      map.set('Complete', (map.get('Complete') ?? 0) + 1);
    } else if (p.current) {
      const label = PIPELINE_STAGES.find((s) => s.id === p.current)?.short ?? p.current;
      map.set(label, (map.get(label) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function buildSupplierChart(rows: IntercompanyRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = r.POSupplier || 'Unknown';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export type ValueCompanySlice = {
  name: 'ISUZU' | 'Parts';
  docs: number;
  value: number;
  pct: number;
};

/** Unique invoice SAR by company (ISUZU / Parts). */
export function buildValueByCompany(rows: IntercompanyRow[]): {
  totalValue: number;
  totalDocs: number;
  slices: ValueCompanySlice[];
} {
  let isuzuDocs = 0;
  let partsDocs = 0;
  let isuzuValue = 0;
  let partsValue = 0;
  const seen = new Set<string>();

  for (const r of rows) {
    const co = r['Target Company'] ?? '';
    const isIsuzu = co.includes('ISUZU');
    const isParts = co.includes('PARTS') || co.includes('SP');
    if (isIsuzu) isuzuDocs++;
    else if (isParts) partsDocs++;

    if (hasValue(r.InvoiceNumber) && hasValue(r.InvoiceValue)) {
      const invKey = `${co}:${r.InvoiceNumber}`;
      if (!seen.has(invKey)) {
        seen.add(invKey);
        const amount = toSarAmount(r.InvoiceValue, r.Currency);
        if (isIsuzu) isuzuValue += amount;
        else if (isParts) partsValue += amount;
      }
    }
  }

  const totalValue = isuzuValue + partsValue;
  const totalDocs = isuzuDocs + partsDocs;
  const slices: ValueCompanySlice[] = [];
  if (isuzuValue > 0 || isuzuDocs > 0) {
    slices.push({
      name: 'ISUZU',
      docs: isuzuDocs,
      value: isuzuValue,
      pct: totalValue ? Math.round((isuzuValue / totalValue) * 100) : 0,
    });
  }
  if (partsValue > 0 || partsDocs > 0) {
    slices.push({
      name: 'Parts',
      docs: partsDocs,
      value: partsValue,
      pct: totalValue ? Math.round((partsValue / totalValue) * 100) : 0,
    });
  }
  return { totalValue, totalDocs, slices };
}

export type OutcomeSlice = {
  id: 'complete' | 'open';
  name: string;
  docs: number;
  value: number;
  pct: number;
};

/** Complete vs open — docs + unique invoice SAR. */
export function buildPipelineOutcome(rows: IntercompanyRow[]): {
  totalValue: number;
  totalDocs: number;
  slices: OutcomeSlice[];
} {
  let completeDocs = 0;
  let openDocs = 0;
  let completeValue = 0;
  let openValue = 0;
  const seenComplete = new Set<string>();
  const seenOpen = new Set<string>();

  for (const r of rows) {
    const done = rowProgress(r).isComplete;
    if (done) completeDocs++;
    else openDocs++;

    if (hasValue(r.InvoiceNumber) && hasValue(r.InvoiceValue)) {
      const invKey = `${r['Target Company'] ?? ''}:${r.InvoiceNumber}`;
      const amount = toSarAmount(r.InvoiceValue, r.Currency);
      if (done) {
        if (!seenComplete.has(invKey)) {
          seenComplete.add(invKey);
          completeValue += amount;
        }
      } else if (!seenOpen.has(invKey)) {
        seenOpen.add(invKey);
        openValue += amount;
      }
    }
  }

  const totalValue = completeValue + openValue;
  const totalDocs = completeDocs + openDocs;
  const slices: OutcomeSlice[] = [];
  if (completeDocs > 0) {
    slices.push({
      id: 'complete',
      name: 'Complete',
      docs: completeDocs,
      value: completeValue,
      pct: totalValue ? Math.round((completeValue / totalValue) * 100) : 0,
    });
  }
  if (openDocs > 0) {
    slices.push({
      id: 'open',
      name: 'Open',
      docs: openDocs,
      value: openValue,
      pct: totalValue ? Math.round((openValue / totalValue) * 100) : 0,
    });
  }
  return { totalValue, totalDocs, slices };
}

export type ProgressSlice = {
  id: StageId | 'complete';
  short: string;
  label: string;
  docs: number;
  /** Same progress % as Document details for docs in this bucket. */
  progressPct: number;
  /** Share of filtered documents. */
  sharePct: number;
};

/**
 * Progress distribution — same logic as Document details Progress column
 * (stages done / total stages). Groups docs by current waiting stage or Complete.
 */
export function buildProgressPie(rows: IntercompanyRow[]): {
  totalDocs: number;
  avgProgress: number;
  completeDocs: number;
  openDocs: number;
  slices: ProgressSlice[];
} {
  const totalStages = PIPELINE_STAGES.length;
  const byKey = new Map<StageId | 'complete', number>();
  let progressSum = 0;

  for (const r of rows) {
    const p = rowProgress(r);
    progressSum += p.pct;
    const key: StageId | 'complete' = p.isComplete ? 'complete' : (p.current ?? 'invoice');
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }

  const totalDocs = rows.length;
  const completeDocs = byKey.get('complete') ?? 0;
  const openDocs = totalDocs - completeDocs;

  const slices: ProgressSlice[] = [];
  for (const stage of PIPELINE_STAGES) {
    const docs = byKey.get(stage.id) ?? 0;
    if (!docs) continue;
    const doneBefore = PIPELINE_STAGES.findIndex((s) => s.id === stage.id);
    slices.push({
      id: stage.id,
      short: stage.short,
      label: `Waiting · ${stage.label}`,
      docs,
      progressPct: Math.round((doneBefore / totalStages) * 100),
      sharePct: 0,
    });
  }
  if (completeDocs > 0) {
    slices.push({
      id: 'complete',
      short: 'OK',
      label: 'Complete',
      docs: completeDocs,
      progressPct: 100,
      sharePct: 0,
    });
  }
  for (const s of slices) {
    s.sharePct = totalDocs ? Math.round((s.docs / totalDocs) * 100) : 0;
  }

  return {
    totalDocs,
    avgProgress: totalDocs ? Math.round(progressSum / totalDocs) : 0,
    completeDocs,
    openDocs,
    slices,
  };
}
