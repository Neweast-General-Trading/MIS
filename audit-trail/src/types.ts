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
  classificationReason: string;
};

export type AuditListResponse = {
  cachedAt: string;
  total: number;
  events: AuditEvent[];
  stats: { data: number; code: number; byAction: Record<string, number> };
  error?: string;
};

export type ModuleCardItem = {
  id: string;
  name: string;
  title?: string;
  tag: string;
  description: string;
  accent: string;
  accentSoft: string;
  events: number;
  ltc_data: string | null;
  ltc_code: string | null;
  ltc: string | null;
  ltc_kind: AuditKind | null;
  has_source: boolean;
};

export type ModulesCatalog = {
  total_events: number;
  actors: number;
  items: ModuleCardItem[];
};

export function shortWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Asia/Dubai',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function actorDisplay(ev: AuditEvent): { name: string; sub: string } {
  const emailFromMeta =
    typeof ev.meta?.actorEmail === 'string' ? ev.meta.actorEmail : undefined;
  const email = ev.actorEmail || emailFromMeta || '';
  const name = ev.actor?.trim() || '—';
  const sub =
    email && email.toLowerCase() !== name.toLowerCase()
      ? email
      : ev.actorRole
        ? ev.actorRole
        : '';
  return { name, sub };
}
