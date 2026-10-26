import { Injectable } from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { AccessControlService } from 'src/access-control/access-control.service';

export type ParsedUserLogRow = {
  timestampUtc?: string;
  timestampUae?: string;
  outcome?: string;
  error?: string | null;
  statusCode?: number;
  durationMs?: number;
  method?: string;
  path?: string;
  actor?: string;
  ip?: string;
  userAgent?: string;
};

export type UserLogActorCatalogEntry = {
  actor: string;
  displayName: string | null;
  count: number;
  lastTimestampUtc: string | null;
};

const SYSTEM_ACTORS = new Set(['anonymous', 'invalid-token', '-']);

export type UserLogAnalytics = {
  meta: UserLogQueryResult['meta'];
  overview: {
    totalRequests: number;
    passCount: number;
    failCount: number;
    failRatePercent: number;
    uniqueActors: number;
    registeredUsers: number;
    activeLast7Days: number;
    activeLast30Days: number;
    inactiveRegisteredUsers: number;
    neverLoggedCount: number;
    avgDurationMs: number;
  };
  activityByDay: Array<{ date: string; pass: number; fail: number; total: number }>;
  topUsers: Array<{
    actor: string;
    displayName: string | null;
    count: number;
    failCount: number;
    lastSeenUtc: string;
  }>;
  inactiveUsers: Array<{
    actor: string;
    displayName: string | null;
    lastSeenUtc: string | null;
    daysSinceActivity: number | null;
  }>;
  topPaths: Array<{ path: string; label: string; count: number }>;
  topTopics: Array<{ topic: string; count: number }>;
  httpMethods: Array<{ method: string; count: number }>;
};

export type UserLogQueryResult = {
  rows: ParsedUserLogRow[];
  total: number;
  page: number;
  pageSize: number;
  groups: Array<{
    actor: string;
    displayName: string | null;
    count: number;
    lastTimestampUtc: string;
  }>;
  actorCatalog: UserLogActorCatalogEntry[];
  summary: { total: number; pass: number; fail: number };
  meta: {
    totalLinesInFile: number;
    linesScanned: number;
    truncated: boolean;
  };
};

const MAX_LOG_LINES = 250_000;
const CACHE_TTL_MS = 15_000;

@Injectable()
export class UserLogReaderService {
  private readonly logPath = join(process.cwd(), '..', 'User_LOG', 'User_LOG.jsonl');

  private cache: {
    expiresAt: number;
    mtimeMs: number;
    lines: string[];
    allParsed: ParsedUserLogRow[];
    meta: UserLogQueryResult['meta'];
  } | null = null;

  constructor(private readonly accessControlService: AccessControlService) {}

  async getAnalytics(): Promise<UserLogAnalytics> {
    const { allParsed, meta } = await this.loadParsedRows();
    const displayByEmail = await this.accessControlService.getUserEmailDisplayMap();
    const now = Date.now();
    const day7 = now - 7 * 24 * 60 * 60 * 1000;
    const day30 = now - 30 * 24 * 60 * 60 * 1000;

    let passCount = 0;
    let failCount = 0;
    let durationSum = 0;
    let durationCount = 0;

    const actorStats = new Map<
      string,
      { count: number; failCount: number; lastSeenUtc: string }
    >();
    const pathStats = new Map<string, number>();
    const topicStats = new Map<string, number>();
    const methodStats = new Map<string, number>();
    const dayStats = new Map<string, { pass: number; fail: number }>();

    for (const row of allParsed) {
      const outcome = String(row.outcome ?? '').toLowerCase();
      if (outcome === 'pass') passCount += 1;
      else if (outcome === 'fail') failCount += 1;

      const duration = Number(row.durationMs ?? 0);
      if (Number.isFinite(duration) && duration > 0) {
        durationSum += duration;
        durationCount += 1;
      }

      const actor = String(row.actor ?? '-').trim().toLowerCase();
      const ts = String(row.timestampUtc ?? '');
      const tsMs = ts ? Date.parse(ts) : NaN;

      if (!SYSTEM_ACTORS.has(actor)) {
        const a = actorStats.get(actor);
        if (!a) {
          actorStats.set(actor, {
            count: 1,
            failCount: outcome === 'fail' ? 1 : 0,
            lastSeenUtc: ts,
          });
        } else {
          a.count += 1;
          if (outcome === 'fail') a.failCount += 1;
          if (ts > a.lastSeenUtc) a.lastSeenUtc = ts;
        }
      }

      const pathKey = normalizeLogPath(String(row.path ?? ''));
      pathStats.set(pathKey, (pathStats.get(pathKey) ?? 0) + 1);
      const topic = classifyLogTopic(pathKey);
      topicStats.set(topic, (topicStats.get(topic) ?? 0) + 1);

      const method = String(row.method ?? '—').toUpperCase();
      methodStats.set(method, (methodStats.get(method) ?? 0) + 1);

      if (!Number.isNaN(tsMs)) {
        const day = ts.slice(0, 10);
        if (day.length === 10) {
          const bucket = dayStats.get(day) ?? { pass: 0, fail: 0 };
          if (outcome === 'fail') bucket.fail += 1;
          else bucket.pass += 1;
          dayStats.set(day, bucket);
        }
      }
    }

    const totalRequests = allParsed.length;
    const failRatePercent =
      totalRequests > 0 ? Math.round((failCount / totalRequests) * 1000) / 10 : 0;

    const activityByDay = buildRecentDaySeries(dayStats, 14);

    const topUsers = [...actorStats.entries()]
      .map(([actor, stats]) => ({
        actor,
        displayName: displayByEmail.get(actor) ?? null,
        count: stats.count,
        failCount: stats.failCount,
        lastSeenUtc: stats.lastSeenUtc,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const topPaths = [...pathStats.entries()]
      .map(([path, count]) => ({
        path,
        label: friendlyPathLabel(path),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const topTopics = [...topicStats.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const httpMethods = [...methodStats.entries()]
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count);

    let activeLast7Days = 0;
    let activeLast30Days = 0;
    for (const [actor, stats] of actorStats) {
      const ms = Date.parse(stats.lastSeenUtc);
      if (Number.isNaN(ms)) continue;
      if (ms >= day7) activeLast7Days += 1;
      if (ms >= day30) activeLast30Days += 1;
    }

    const inactiveUsers: UserLogAnalytics['inactiveUsers'] = [];
    let neverLoggedCount = 0;
    for (const email of displayByEmail.keys()) {
      if (SYSTEM_ACTORS.has(email)) continue;
      const stats = actorStats.get(email);
      if (!stats) {
        neverLoggedCount += 1;
        inactiveUsers.push({
          actor: email,
          displayName: displayByEmail.get(email) ?? null,
          lastSeenUtc: null,
          daysSinceActivity: null,
        });
        continue;
      }
      const ms = Date.parse(stats.lastSeenUtc);
      if (Number.isNaN(ms) || ms < day30) {
        const daysSinceActivity = Number.isNaN(ms)
          ? null
          : Math.floor((now - ms) / (24 * 60 * 60 * 1000));
        inactiveUsers.push({
          actor: email,
          displayName: displayByEmail.get(email) ?? null,
          lastSeenUtc: stats.lastSeenUtc,
          daysSinceActivity,
        });
      }
    }
    inactiveUsers.sort((a, b) => {
      if (!a.lastSeenUtc && !b.lastSeenUtc) return 0;
      if (!a.lastSeenUtc) return -1;
      if (!b.lastSeenUtc) return 1;
      return (a.daysSinceActivity ?? 9999) - (b.daysSinceActivity ?? 9999);
    });

    return {
      meta,
      overview: {
        totalRequests,
        passCount,
        failCount,
        failRatePercent,
        uniqueActors: actorStats.size,
        registeredUsers: displayByEmail.size,
        activeLast7Days,
        activeLast30Days,
        inactiveRegisteredUsers: inactiveUsers.length,
        neverLoggedCount,
        avgDurationMs: durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
      },
      activityByDay,
      topUsers,
      inactiveUsers: inactiveUsers.slice(0, 25),
      topPaths,
      topTopics,
      httpMethods,
    };
  }

  async query(input: {
    page: number;
    pageSize: number;
    status?: string;
    user?: string;
    q?: string;
  }): Promise<UserLogQueryResult> {
    const { allParsed, meta } = await this.loadParsedRows();
    const displayByEmail = await this.accessControlService.getUserEmailDisplayMap();

    const userNeedle = input.user?.trim().toLowerCase();
    const queryNeedle = input.q?.trim().toLowerCase();
    const statusNeedle = input.status?.trim().toLowerCase();

    const actorMatchesUserFilter = (actorRaw: string) => {
      if (!userNeedle) return true;
      const actor = actorRaw.trim().toLowerCase();
      const display = (displayByEmail.get(actor) ?? '').toLowerCase();
      return actor.includes(userNeedle) || display.includes(userNeedle);
    };

    const rowMatchesFilters = (row: ParsedUserLogRow) => {
      if (statusNeedle && String(row.outcome ?? '').toLowerCase() !== statusNeedle) return false;
      if (!actorMatchesUserFilter(String(row.actor ?? ''))) return false;
      if (queryNeedle) {
        const actor = String(row.actor ?? '').toLowerCase();
        const display = (displayByEmail.get(actor) ?? '').toLowerCase();
        const haystack =
          `${row.method ?? ''} ${row.path ?? ''} ${row.error ?? ''} ${actor} ${display}`.toLowerCase();
        if (!haystack.includes(queryNeedle)) return false;
      }
      return true;
    };

    const catalogMeta = new Map<string, { count: number; lastTimestampUtc: string }>();
    for (const row of allParsed) {
      const actorKey = String(row.actor ?? '-').trim().toLowerCase();
      const t = String(row.timestampUtc ?? '');
      const g = catalogMeta.get(actorKey);
      if (!g) {
        catalogMeta.set(actorKey, { count: 1, lastTimestampUtc: t });
      } else {
        g.count += 1;
        if (t > g.lastTimestampUtc) g.lastTimestampUtc = t;
      }
    }
    for (const email of displayByEmail.keys()) {
      if (!catalogMeta.has(email)) {
        catalogMeta.set(email, { count: 0, lastTimestampUtc: '' });
      }
    }

    const actorCatalog = [...catalogMeta.entries()]
      .map(([actor, entry]) => ({
        actor,
        displayName: displayByEmail.get(actor) ?? null,
        count: entry.count,
        lastTimestampUtc: entry.lastTimestampUtc || null,
      }))
      .sort((a, b) => {
        const labelA = (a.displayName ?? a.actor).toLowerCase();
        const labelB = (b.displayName ?? b.actor).toLowerCase();
        return labelA.localeCompare(labelB);
      });

    const allFiltered = allParsed.filter(rowMatchesFilters).reverse();

    const total = allFiltered.length;
    let pass = 0;
    let fail = 0;
    const groupMeta = new Map<string, { count: number; lastTimestampUtc: string }>();
    for (const row of allFiltered) {
      const o = String(row.outcome ?? '').toLowerCase();
      if (o === 'pass') pass += 1;
      else if (o === 'fail') fail += 1;
      const actorKey = String(row.actor ?? '-').trim().toLowerCase();
      const t = String(row.timestampUtc ?? '');
      const g = groupMeta.get(actorKey);
      if (!g) {
        groupMeta.set(actorKey, { count: 1, lastTimestampUtc: t });
      } else {
        g.count += 1;
        if (t > g.lastTimestampUtc) g.lastTimestampUtc = t;
      }
    }

    const groups = [...groupMeta.entries()]
      .map(([actor, entry]) => ({
        actor,
        displayName: displayByEmail.get(actor) ?? null,
        count: entry.count,
        lastTimestampUtc: entry.lastTimestampUtc,
      }))
      .sort((a, b) => (b.lastTimestampUtc ?? '').localeCompare(a.lastTimestampUtc ?? ''));

    const offset = (input.page - 1) * input.pageSize;
    const rows = allFiltered.slice(offset, offset + input.pageSize);

    return {
      rows,
      total,
      page: input.page,
      pageSize: input.pageSize,
      groups,
      actorCatalog,
      summary: { total, pass, fail },
      meta,
    };
  }

  private async loadParsedRows(): Promise<{
    allParsed: ParsedUserLogRow[];
    meta: UserLogQueryResult['meta'];
  }> {
    let fileStat: { mtimeMs: number };
    try {
      fileStat = await stat(this.logPath);
    } catch {
      return {
        allParsed: [],
        meta: { totalLinesInFile: 0, linesScanned: 0, truncated: false },
      };
    }

    const now = Date.now();
    if (
      this.cache &&
      this.cache.mtimeMs === fileStat.mtimeMs &&
      this.cache.expiresAt > now
    ) {
      return { allParsed: this.cache.allParsed, meta: this.cache.meta };
    }

    const raw = await readFile(this.logPath, 'utf-8').catch(() => '');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const truncated = lines.length > MAX_LOG_LINES;
    const scannedLines = truncated ? lines.slice(-MAX_LOG_LINES) : lines;

    const allParsed: ParsedUserLogRow[] = scannedLines.map((line) => {
      try {
        return JSON.parse(line) as ParsedUserLogRow;
      } catch {
        return {
          timestampUtc: new Date().toISOString(),
          timestampUae: null,
          outcome: 'parse_error',
          error: line,
          statusCode: 0,
          durationMs: 0,
          method: '-',
          path: '-',
          actor: '-',
          ip: '-',
          userAgent: '-',
        };
      }
    });

    const meta = {
      totalLinesInFile: lines.length,
      linesScanned: scannedLines.length,
      truncated,
    };

    this.cache = {
      expiresAt: now + CACHE_TTL_MS,
      mtimeMs: fileStat.mtimeMs,
      lines: scannedLines,
      allParsed,
      meta,
    };

    return { allParsed, meta };
  }
}

function normalizeLogPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '—';
  const noQuery = trimmed.split('?')[0] ?? trimmed;
  return noQuery.length > 120 ? `${noQuery.slice(0, 117)}…` : noQuery;
}

function friendlyPathLabel(path: string): string {
  if (path.length <= 48) return path;
  return `…${path.slice(-45)}`;
}

function classifyLogTopic(path: string): string {
  const p = path.toLowerCase();
  if (p.startsWith('/auth')) return 'Sign-in & session';
  if (p.startsWith('/access-control')) return 'Users & roles';
  if (p.startsWith('/departments')) return 'BPM data (departments / processes)';
  if (p.startsWith('/process-documentation')) return 'Process documentation';
  if (p.startsWith('/ai-bpm')) return 'Automation BPM';
  if (p.startsWith('/maintenance/user-log')) return 'User log';
  if (p.startsWith('/maintenance')) return 'Maintenance & admin';
  if (p.startsWith('/activity-templates')) return 'Sub-process templates';
  if (p.includes('health')) return 'Health checks';
  if (p.startsWith('/docx')) return 'Static files / DOCX';
  return 'Other API';
}

function buildRecentDaySeries(
  dayStats: Map<string, { pass: number; fail: number }>,
  days: number,
): UserLogAnalytics['activityByDay'] {
  const result: UserLogAnalytics['activityByDay'] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const bucket = dayStats.get(key) ?? { pass: 0, fail: 0 };
    result.push({
      date: key,
      pass: bucket.pass,
      fail: bucket.fail,
      total: bucket.pass + bucket.fail,
    });
  }
  return result;
}
