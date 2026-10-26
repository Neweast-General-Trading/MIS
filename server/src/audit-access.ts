import type { Request, Response, NextFunction } from 'express';
import { listAllAuditEvents, recordAudit, type AuditKind } from './audit-log.js';

export type MisModuleDef = {
  id: string;
  title: string;
  tag: string;
  description: string;
  accent: string;
  accentSoft: string;
};

/** All MIS modules shown as Audit Log cards. */
export const MIS_AUDIT_MODULES: MisModuleDef[] = [
  {
    id: 'work-load-analysis',
    title: 'Work Load Analysis',
    tag: 'MIS',
    description: 'Document activity and workload analytics across all companies and databases.',
    accent: '#C8102E',
    accentSoft: '#FEF2F2',
  },
  {
    id: 'attendance-discrepancy',
    title: 'Attendance Discrepancy',
    tag: 'MIS · HR',
    description: 'Payroll attendance discrepancies across UAE, Oman, KSA and Bahrain.',
    accent: '#0D9488',
    accentSoft: '#F0FDFA',
  },
  {
    id: 'hq-attendance',
    title: 'HQ Access & Attendance',
    tag: 'HQ · Access',
    description: 'Live HQ door punches, presence and device activity from HCP_Access.',
    accent: '#0F766E',
    accentSoft: '#F0FDFA',
  },
  {
    id: 'eorder-analysis',
    title: 'eOrder Analysis',
    tag: 'MIS · eOrder',
    description: 'Sales order summary, combined sales, and price comparison from SAP HANA.',
    accent: '#2563EB',
    accentSoft: '#EFF6FF',
  },
  {
    id: 'vehicle-sales-track',
    title: 'Vehicle Sales Track',
    tag: 'KSA · ISUZU',
    description: 'KSA vehicle stock, YTD sales, aging, prices and inbound ETA.',
    accent: '#E60012',
    accentSoft: '#FFF0F0',
  },
  {
    id: 'ksa-intercompany',
    title: 'Intercompany Tracking',
    tag: 'KSA · ISUZU / Parts',
    description: 'KSA intercompany pipeline from invoice to GRPO — ISUZU and Parts.',
    accent: '#2563EB',
    accentSoft: '#EFF6FF',
  },
  {
    id: 'ne02-approval',
    title: 'NE02 Approval Requirements',
    tag: 'Sales · NE02',
    description: 'Brand performance, financial status, SQ evaluation, backorders, aged stock.',
    accent: '#5B8DEF',
    accentSoft: '#EEF4FF',
  },
  {
    id: 'audit-log',
    title: 'Audit Log',
    tag: 'MIS · Control',
    description: 'Unified change ledger — Data (end user) vs Code (development).',
    accent: '#4AA8B8',
    accentSoft: '#EAF7FA',
  },
  {
    id: 'delivery-tracking',
    title: 'Delivery Tracking',
    tag: 'Warehouse · FZCO',
    description: 'Delivery notes, dispatch and POD tracking for FZCO.',
    accent: '#4B6B82',
    accentSoft: '#EEF3F6',
  },
  {
    id: 'collection-intelligence',
    title: 'Collection Intelligence',
    tag: 'Finance',
    description: 'AR aging, credit control, and collection risk insights.',
    accent: '#0F766E',
    accentSoft: '#F0FDFA',
  },
  {
    id: 'sales-spare-parts',
    title: 'KSA - SP',
    tag: 'Sales Insights',
    description: 'KSA spare parts sales performance, regions, and salesperson insights.',
    accent: '#1A1A1A',
    accentSoft: '#F5F5F5',
  },
  {
    id: 'sales-isuzu',
    title: 'KSA - ISUZU',
    tag: 'Sales Insights',
    description: 'ISUZU sales orders, yearly trends, and detailed order breakdowns.',
    accent: '#E60012',
    accentSoft: '#FFF0F0',
  },
];

type RouteMap = { prefix: string; module: string; summary: string };

const API_MODULE_ROUTES: RouteMap[] = [
  { prefix: '/api/ne02-approval', module: 'ne02-approval', summary: 'Queried NE02 approval pack' },
  { prefix: '/api/vehicle-sales-track', module: 'vehicle-sales-track', summary: 'Queried vehicle sales track' },
  { prefix: '/api/intercompany-ksa', module: 'ksa-intercompany', summary: 'Queried KSA intercompany data' },
  { prefix: '/api/dts', module: 'delivery-tracking', summary: 'Queried delivery tracking (DTS)' },
  { prefix: '/api/eorder', module: 'eorder-analysis', summary: 'Queried eOrder analysis' },
  { prefix: '/api/collection', module: 'collection-intelligence', summary: 'Queried collection intelligence' },
  { prefix: '/api/hq-attendance', module: 'hq-attendance', summary: 'Queried HQ access attendance' },
  { prefix: '/api/attendance', module: 'attendance-discrepancy', summary: 'Queried attendance discrepancy' },
  { prefix: '/api/dashboard/lst5yrs', module: 'work-load-analysis', summary: 'Queried Work Load Analysis data' },
  { prefix: '/api/dashboard/employees', module: 'work-load-analysis', summary: 'Queried WLA employees' },
  { prefix: '/api/dashboard/report-users', module: 'work-load-analysis', summary: 'Queried WLA report users' },
];

const DEDUPE_MS = 90_000;
const recent = new Map<string, number>();

function prune(now: number) {
  if (recent.size < 500) return;
  for (const [k, at] of recent) {
    if (now - at > DEDUPE_MS) recent.delete(k);
  }
}

function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function matchRoute(path: string): RouteMap | null {
  for (const r of API_MODULE_ROUTES) {
    if (path === r.prefix || path.startsWith(`${r.prefix}/`)) return r;
  }
  return null;
}

export function buildModulesCatalog() {
  const events = listAllAuditEvents();
  const actors = new Set(events.map((e) => e.actor).filter(Boolean));

  const byModule = new Map<
    string,
    { events: number; ltc_data: string | null; ltc_code: string | null }
  >();

  for (const e of events) {
    const cur = byModule.get(e.module) ?? { events: 0, ltc_data: null, ltc_code: null };
    cur.events += 1;
    if (e.kind === 'data' && (!cur.ltc_data || e.at > cur.ltc_data)) cur.ltc_data = e.at;
    if (e.kind === 'code' && (!cur.ltc_code || e.at > cur.ltc_code)) cur.ltc_code = e.at;
    byModule.set(e.module, cur);
  }

  // also fold aliases (legacy ids)
  const alias: Record<string, string> = {
    'work-load': 'work-load-analysis',
    'audit-trail': 'audit-log',
  };
  for (const [from, to] of Object.entries(alias)) {
    const src = byModule.get(from);
    if (!src) continue;
    const dest = byModule.get(to) ?? { events: 0, ltc_data: null, ltc_code: null };
    dest.events += src.events;
    if (src.ltc_data && (!dest.ltc_data || src.ltc_data > dest.ltc_data)) dest.ltc_data = src.ltc_data;
    if (src.ltc_code && (!dest.ltc_code || src.ltc_code > dest.ltc_code)) dest.ltc_code = src.ltc_code;
    byModule.set(to, dest);
  }

  const items = MIS_AUDIT_MODULES.map((m) => {
    const s = byModule.get(m.id) ?? { events: 0, ltc_data: null, ltc_code: null };
    let ltc_kind: AuditKind | null = null;
    if (s.ltc_data && s.ltc_code) ltc_kind = s.ltc_data >= s.ltc_code ? 'data' : 'code';
    else if (s.ltc_data) ltc_kind = 'data';
    else if (s.ltc_code) ltc_kind = 'code';
    return {
      ...m,
      name: m.title,
      events: s.events,
      ltc_data: s.ltc_data,
      ltc_code: s.ltc_code,
      ltc: s.ltc_data && s.ltc_code
        ? s.ltc_data >= s.ltc_code
          ? s.ltc_data
          : s.ltc_code
        : s.ltc_data || s.ltc_code,
      ltc_kind,
      has_source: s.events > 0,
    };
  });

  return {
    lookback_days: null as number | null,
    total_events: events.length,
    actors: actors.size,
    items,
  };
}

/**
 * Auto-log throttled API access for every MIS module route.
 * Skips health, audit-log itself, and report-access (already logged there).
 */
export function auditAccessMiddleware(req: Request, _res: Response, next: NextFunction) {
  next();

  try {
    const path = req.path || '';
    if (!path.startsWith('/api/')) return;
    if (path === '/api/health' || path.startsWith('/api/audit-log')) return;
    if (path.startsWith('/api/dashboard/report-access')) return;

    const hit = matchRoute(path);
    if (!hit) return;

    const now = Date.now();
    prune(now);
    const ip = clientIp(req);
    const key = `${hit.module}|${ip}|${hit.prefix}|${req.method}`;
    const last = recent.get(key) ?? 0;
    if (now - last < DEDUPE_MS) return;
    recent.set(key, now);

    const actorHeader = req.headers['x-mis-actor'];
    const actorEmailHeader = req.headers['x-mis-actor-email'];
    const actor =
      (typeof actorHeader === 'string' && actorHeader.trim()) || `ip:${ip}`;
    const actorEmail =
      typeof actorEmailHeader === 'string' && actorEmailHeader.trim()
        ? actorEmailHeader.trim()
        : undefined;

    recordAudit({
      kind: 'data',
      action: 'access',
      module: hit.module,
      actor,
      actorRole: 'enduser',
      summary: hit.summary,
      targetType: 'api',
      targetId: `${req.method} ${path}`,
      meta: { query: req.query, ...(actorEmail ? { actorEmail } : {}) },
    });
  } catch {
    // never block API on audit failure
  }
}
