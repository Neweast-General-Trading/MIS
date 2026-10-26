import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

/** End-user business data vs development/source changes. */
export type AuditKind = 'data' | 'code';

export type AuditAction = 'create' | 'update' | 'delete' | 'access' | 'deploy' | 'other';

export type AuditEvent = {
  id: string;
  at: string;
  kind: AuditKind;
  action: AuditAction;
  module: string;
  actor: string;
  actorEmail?: string;
  actorRole?: string;
  summary: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
  /** Why the module classified it as data or code. */
  classificationReason: string;
};

export type AuditInput = {
  action?: string;
  module?: string;
  actor?: string;
  actorEmail?: string;
  actorRole?: string;
  summary?: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
  /** Optional override — module still validates and may reclassify. */
  kind?: string;
};

const auditFile = path.join(process.cwd(), 'data', 'audit-log.jsonl');
const MAX_EVENTS = 20_000;

const CODE_HINTS = [
  'deploy',
  'git',
  'commit',
  'build',
  'release',
  'hotfix',
  'refactor',
  'nginx',
  'frontend',
  'backend',
  'source',
  'development',
  'dev ',
  'api route',
  'config',
  'package.json',
  'typescript',
  'vite',
  'pm2',
  'schema migration',
];

const DATA_HINTS = [
  'customer',
  'cardcode',
  'itemcode',
  'item code',
  'quotation',
  'invoice',
  'order',
  'warehouse',
  'stock',
  'backorder',
  'allocation',
  'master data',
  'end user',
  'enduser',
  'sales',
  'approval',
  'financial',
];

function ensureDir() {
  const dir = path.dirname(auditFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normAction(raw: unknown): AuditAction {
  const a = String(raw ?? 'other').trim().toLowerCase();
  if (a === 'create' || a === 'add' || a === 'insert') return 'create';
  if (a === 'update' || a === 'edit' || a === 'modify' || a === 'patch') return 'update';
  if (a === 'delete' || a === 'remove') return 'delete';
  if (a === 'access' || a === 'view' || a === 'read') return 'access';
  if (a === 'deploy' || a === 'release') return 'deploy';
  return 'other';
}

/**
 * Classifies an operation as end-user DATA or development CODE.
 * Explicit kind wins only if valid; otherwise heuristics decide.
 */
export function classifyAuditKind(input: AuditInput): {
  kind: AuditKind;
  reason: string;
} {
  const explicit = String(input.kind ?? '')
    .trim()
    .toLowerCase();
  if (explicit === 'data' || explicit === 'code') {
    return {
      kind: explicit,
      reason: `Explicit kind="${explicit}" from caller.`,
    };
  }

  const action = normAction(input.action);
  if (action === 'deploy') {
    return { kind: 'code', reason: 'Action is deploy/release → development.' };
  }

  const blob = [
    input.action,
    input.module,
    input.targetType,
    input.targetId,
    input.summary,
    input.actorRole,
    JSON.stringify(input.meta ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const codeHit = CODE_HINTS.find((h) => blob.includes(h));
  if (codeHit) {
    return { kind: 'code', reason: `Matched development signal "${codeHit}".` };
  }

  const dataHit = DATA_HINTS.find((h) => blob.includes(h));
  if (dataHit) {
    return { kind: 'data', reason: `Matched end-user/data signal "${dataHit}".` };
  }

  if (input.actorRole && /dev|developer|engineer|it\b/i.test(input.actorRole)) {
    return { kind: 'code', reason: `Actor role looks like development (${input.actorRole}).` };
  }

  return {
    kind: 'data',
    reason: 'Default: treated as end-user data operation.',
  };
}

function readAll(): AuditEvent[] {
  ensureDir();
  if (!fs.existsSync(auditFile)) return [];
  const text = fs.readFileSync(auditFile, 'utf8');
  if (!text.trim()) return [];
  const out: AuditEvent[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as AuditEvent);
    } catch {
      // skip bad line
    }
  }
  return out;
}

function appendEvent(event: AuditEvent) {
  ensureDir();
  fs.appendFileSync(auditFile, `${JSON.stringify(event)}\n`, 'utf8');
}

export function recordAudit(input: AuditInput): AuditEvent {
  const action = normAction(input.action);
  const moduleName = String(input.module ?? 'mis').trim() || 'mis';
  const actor = String(input.actor ?? 'unknown').trim() || 'unknown';
  const summary = String(input.summary ?? '').trim() || `${action} on ${moduleName}`;
  const { kind, reason } = classifyAuditKind({ ...input, action, module: moduleName, summary });

  const event: AuditEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    kind,
    action,
    module: moduleName,
    actor,
    actorEmail: input.actorEmail ? String(input.actorEmail).trim() : undefined,
    actorRole: input.actorRole ? String(input.actorRole).trim() : undefined,
    summary,
    targetType: input.targetType ? String(input.targetType).trim() : undefined,
    targetId: input.targetId ? String(input.targetId).trim() : undefined,
    before: input.before,
    after: input.after,
    meta: input.meta,
    classificationReason: reason,
  };

  appendEvent(event);

  // ponytail: keep file bounded — rewrite when oversized
  const all = readAll();
  if (all.length > MAX_EVENTS) {
    const trimmed = all.slice(-MAX_EVENTS);
    fs.writeFileSync(auditFile, trimmed.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }

  return event;
}

export type AuditQuery = {
  kind?: string;
  action?: string;
  module?: string;
  actor?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export function queryAudit(query: AuditQuery = {}): {
  total: number;
  events: AuditEvent[];
  stats: { data: number; code: number; byAction: Record<string, number> };
} {
  let events = readAll().sort((a, b) => b.at.localeCompare(a.at));

  const kind = String(query.kind ?? '').trim().toLowerCase();
  if (kind === 'data' || kind === 'code') {
    events = events.filter((e) => e.kind === kind);
  }

  const action = String(query.action ?? '').trim().toLowerCase();
  if (action) events = events.filter((e) => e.action === action);

  const moduleName = String(query.module ?? '').trim().toLowerCase();
  if (moduleName) {
    const aliases: Record<string, string[]> = {
      'work-load-analysis': ['work-load-analysis', 'work-load'],
      'audit-log': ['audit-log', 'audit-trail'],
    };
    const ids = aliases[moduleName] ?? [moduleName];
    events = events.filter((e) => ids.includes(e.module.toLowerCase()));
  }

  const actor = String(query.actor ?? '').trim().toLowerCase();
  if (actor) {
    events = events.filter(
      (e) =>
        e.actor.toLowerCase().includes(actor) ||
        (e.actorEmail ?? '').toLowerCase().includes(actor) ||
        String(e.meta?.actorEmail ?? '')
          .toLowerCase()
          .includes(actor),
    );
  }

  const q = String(query.q ?? '').trim().toLowerCase();
  if (q) {
    events = events.filter((e) =>
      `${e.summary} ${e.module} ${e.actor} ${e.targetType ?? ''} ${e.targetId ?? ''} ${e.classificationReason}`
        .toLowerCase()
        .includes(q),
    );
  }

  if (query.from) events = events.filter((e) => e.at >= query.from!);
  if (query.to) events = events.filter((e) => e.at <= query.to!);

  const stats = {
    data: events.filter((e) => e.kind === 'data').length,
    code: events.filter((e) => e.kind === 'code').length,
    byAction: {} as Record<string, number>,
  };
  for (const e of events) {
    stats.byAction[e.action] = (stats.byAction[e.action] ?? 0) + 1;
  }

  const offset = Math.max(0, Number(query.offset ?? 0) || 0);
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 25) || 25));
  const total = events.length;
  return { total, events: events.slice(offset, offset + limit), stats };
}

export function getAuditById(id: string): AuditEvent | null {
  return readAll().find((e) => e.id === id) ?? null;
}

export function listAllAuditEvents(): AuditEvent[] {
  return readAll();
}

/** Classify only — no write. Useful for UI preview. */
export function previewClassification(input: AuditInput) {
  const action = normAction(input.action);
  const moduleName = String(input.module ?? 'mis').trim() || 'mis';
  const summary = String(input.summary ?? '').trim() || `${action} on ${moduleName}`;
  return classifyAuditKind({ ...input, action, module: moduleName, summary });
}
