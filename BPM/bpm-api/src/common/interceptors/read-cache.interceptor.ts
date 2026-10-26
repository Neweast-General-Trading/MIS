import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { of, tap } from 'rxjs';

/**
 * Short-lived server cache for the heavy, read-only list endpoints
 * (company / process-function trees, dashboard rollups).
 *
 * - Keyed per caller (Authorization / x-user-email) + full URL, so scoped results never leak.
 * - Permission guards run BEFORE interceptors, so cached data is only served to allowed callers.
 * - Any successful write (POST / PUT / PATCH / DELETE) bumps a global version, which
 *   invalidates everything immediately; the TTL only covers edits made outside this API.
 */
const TTL_MS = 90_000;
const MAX_ENTRIES = 300;

/** Writes that do not change BPM data – they must not flush the cache. */
const NON_MUTATING_WRITE_PREFIXES = [
  '/activity-print',
  '/bpm-assistant',
  '/auth',
  '/ai-bpm',
];

const CACHEABLE: RegExp[] = [
  /^\/companies\/?$/,
  /^\/departments\/?$/,
  /^\/departments\/dashboard-summary\/?$/,
  /^\/departments\/explorer-tree\/?$/,
  /^\/departments\/[0-9a-f-]{36}\/?$/i,
  /^\/departments\/[0-9a-f-]{36}\/processes\/?$/i,
];

type Entry = { version: number; expiresAt: number; value: unknown };

let dataVersion = 0;
const store = new Map<string, Entry>();

/** Call after changing data outside of an HTTP write (jobs, scripts). */
export function invalidateReadCache(): void {
  dataVersion += 1;
  store.clear();
}

@Injectable()
export class ReadCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType<'http'>() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const path = (req.path ?? '').replace(/\/+$/, '') || '/';

    if (req.method !== 'GET') {
      if (
        req.method === 'HEAD' ||
        NON_MUTATING_WRITE_PREFIXES.some((p) => path.startsWith(p))
      ) {
        return next.handle();
      }
      return next
        .handle()
        .pipe(tap({ next: invalidateReadCache, error: invalidateReadCache }));
    }

    if (!CACHEABLE.some((re) => re.test(path))) return next.handle();

    const caller = String(
      req.headers.authorization ?? req.headers['x-user-email'] ?? '',
    );
    if (!caller) return next.handle();
    const key = `${caller}|${req.originalUrl}`;

    const hit = store.get(key);
    if (hit && hit.version === dataVersion && hit.expiresAt > Date.now()) {
      return of(hit.value);
    }

    const versionAtStart = dataVersion;
    return next.handle().pipe(
      tap((value) => {
        if (value === undefined || value === null) return;
        if (versionAtStart !== dataVersion) return; // a write happened meanwhile
        if (store.size >= MAX_ENTRIES) {
          const oldest = store.keys().next().value;
          if (oldest !== undefined) store.delete(oldest);
        }
        store.set(key, {
          version: dataVersion,
          expiresAt: Date.now() + TTL_MS,
          value,
        });
      }),
    );
  }
}
