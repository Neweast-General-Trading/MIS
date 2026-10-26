import type { IntercompanyRow, StageId } from '../types';
import { hasValue, rowProgress } from './analytics';

export type CycleSegment = {
  id: string;
  label: string;
  short: string;
  phase: 'invoicing' | 'transfer';
  stageId: StageId;
  avgDays: number;
  sampleCount: number;
  sharePct: number;
};

export type CycleTimeReport = {
  /** Invoice → GRPO average for fully completed pipeline docs only. */
  fullAvgDays: number | null;
  /** Same completed cohort size for all averages. */
  completedCount: number;
  invoicingAvgDays: number | null;
  transferAvgDays: number | null;
  /** Sub-steps on the same completed cohort; avgDays > 0 only. */
  segments: CycleSegment[];
};

type SegmentDef = {
  id: string;
  label: string;
  short: string;
  phase: 'invoicing' | 'transfer';
  stageId: StageId;
  start: (r: IntercompanyRow) => string | null | undefined;
  end: (r: IntercompanyRow) => string | null | undefined;
};

const MS_DAY = 86_400_000;

/** Prefer SAP field GRPODate; fall back to aliases. */
export function getGrpoDate(row: IntercompanyRow): string | null | undefined {
  return row.GRPODate ?? row.GRPODATE ?? row.BIGRPODATE ?? null;
}

/** Fully finished INV → … → GRPO with a GRPO date. */
function isFullCycleComplete(row: IntercompanyRow): boolean {
  if (!rowProgress(row).isComplete) return false;
  if (!parseDay(row['Invoice Date'])) return false;
  if (!parseDay(getGrpoDate(row))) return false;
  return true;
}

const SEGMENTS: SegmentDef[] = [
  {
    id: 'inv-po',
    label: 'Invoice → Purchase Order',
    short: 'INV → PO',
    phase: 'invoicing',
    stageId: 'po',
    start: (r) => r['Invoice Date'],
    end: (r) => r.PODocDate,
  },
  {
    id: 'po-sd',
    label: 'PO → Stock Delivery',
    short: 'PO → SD',
    phase: 'invoicing',
    stageId: 'sd',
    start: (r) => r.PODocDate,
    end: (r) => r.SDDocDate,
  },
  {
    id: 'sd-epl1',
    label: 'Stock Delivery → EPL 1',
    short: 'SD → EPL1',
    phase: 'invoicing',
    stageId: 'epl1',
    start: (r) => r.SDDocDate,
    end: (r) => r.EPL1Date,
  },
  {
    id: 'epl1-epl2',
    label: 'EPL 1 → EPL 2',
    short: 'EPL1 → EPL2',
    phase: 'transfer',
    stageId: 'epl2',
    start: (r) => r.EPL1Date,
    end: (r) => r.EPL2Date,
  },
  {
    id: 'epl2-grpo',
    label: 'EPL 2 → GRPO',
    short: 'EPL2 → GRPO',
    phase: 'transfer',
    stageId: 'grpo',
    start: (r) => r.EPL2Date,
    end: (r) => getGrpoDate(r),
  },
];

function parseDay(v: string | null | undefined): Date | null {
  const s = String(v ?? '').slice(0, 10);
  if (!s || s.length < 10) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(start: Date, end: Date): number | null {
  const days = (end.getTime() - start.getTime()) / MS_DAY;
  if (days < 0) return null;
  return days;
}

/**
 * Elapsed days for journey cards:
 * - Complete: Invoice Date → GRPO date
 * - Open: Invoice Date → today (asOf)
 */
export function journeyElapsedDays(
  row: IntercompanyRow,
  asOfIso?: string,
): { days: number | null; kind: 'complete' | 'open' } {
  const start = parseDay(row['Invoice Date']);
  if (!start) return { days: null, kind: 'open' };

  const complete = rowProgress(row).isComplete;
  if (complete) {
    const end = parseDay(getGrpoDate(row));
    if (!end) return { days: null, kind: 'complete' };
    const d = daysBetween(start, end);
    return { days: d === null ? null : Math.round(d), kind: 'complete' };
  }

  const asOf = parseDay((asOfIso ?? new Date().toISOString()).slice(0, 10)) ?? new Date();
  const today = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const d = daysBetween(start, today);
  return { days: d === null ? null : Math.round(d), kind: 'open' };
}

function completedDays(
  row: IntercompanyRow,
  start: (r: IntercompanyRow) => string | null | undefined,
  end: (r: IntercompanyRow) => string | null | undefined,
): number | null {
  const s = parseDay(start(row));
  const e = parseDay(end(row));
  if (!s || !e) return null;
  return daysBetween(s, e);
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

export function buildCycleTimeReport(rows: IntercompanyRow[], _asOfIso?: string): CycleTimeReport {
  /** One cohort only: pipeline complete INV → GRPO. */
  const done = rows.filter(isFullCycleComplete);
  const n = done.length;

  const full = done
    .map((r) => completedDays(r, (x) => x['Invoice Date'], (x) => getGrpoDate(x)))
    .filter((d): d is number => d !== null);

  const invoicing = done
    .map((r) => completedDays(r, (x) => x['Invoice Date'], (x) => x.EPL1Date))
    .filter((d): d is number => d !== null);

  const transfer = done
    .map((r) => completedDays(r, (x) => x.EPL1Date, (x) => getGrpoDate(x)))
    .filter((d): d is number => d !== null);

  const rawSegments = SEGMENTS.map((def) => {
    const durations = done
      .map((r) => completedDays(r, def.start, def.end))
      .filter((d): d is number => d !== null);
    return {
      def,
      avgDays: avg(durations),
      sampleCount: durations.length,
    };
  });

  /** Skip same-day / zero-day steps from the pie. */
  const withValues = rawSegments.filter((s) => s.avgDays !== null && s.avgDays > 0);
  const sumAvg = withValues.reduce((a, s) => a + (s.avgDays ?? 0), 0);

  const segments: CycleSegment[] = withValues.map((s) => ({
    id: s.def.id,
    label: s.def.label,
    short: s.def.short,
    phase: s.def.phase,
    stageId: s.def.stageId,
    avgDays: s.avgDays!,
    sampleCount: n,
    sharePct: sumAvg > 0 ? Math.round(((s.avgDays! / sumAvg) * 1000) / 10) : 0,
  }));

  return {
    fullAvgDays: avg(full),
    completedCount: n,
    invoicingAvgDays: avg(invoicing),
    transferAvgDays: avg(transfer),
    segments,
  };
}

export function filterRowsByInvoiceDate(
  rows: IntercompanyRow[],
  fromDate: string,
  toDate: string,
): IntercompanyRow[] {
  return rows.filter((r) => {
    const d = String(r['Invoice Date'] ?? '').slice(0, 10);
    if (!d) return false;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });
}

export function invoiceDateBounds(rows: IntercompanyRow[]): { min: string; max: string } | null {
  let min = '';
  let max = '';
  for (const r of rows) {
    const d = String(r['Invoice Date'] ?? '').slice(0, 10);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  return min && max ? { min, max } : null;
}
