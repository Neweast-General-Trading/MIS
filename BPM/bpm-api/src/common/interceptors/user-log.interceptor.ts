import { appendFile, chmod, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { catchError, tap, throwError } from 'rxjs';

type UserLogRow = {
  timestampUtc: string;
  timestampUae: string;
  outcome: 'pass' | 'fail';
  error?: string | null;
  statusCode: number;
  durationMs: number;
  method: string;
  path: string;
  actor: string;
  ip: string;
  userAgent: string;
};

@Injectable()
export class UserLogInterceptor implements NestInterceptor {
  private readonly logDir = join(process.cwd(), '..', 'User_LOG');
  private readonly logPath = join(this.logDir, 'User_LOG.jsonl');
  private initialized = false;

  constructor(private readonly jwtService: JwtService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType<'http'>() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const reqPath = req.path ?? '';
    /** High-frequency probes — avoid flooding User_LOG.jsonl */
    if (
      reqPath === '/health' ||
      reqPath === '/system-health' ||
      reqPath.startsWith('/maintenance/system-health') ||
      /** Word-export progress polling (every few seconds while a job runs). */
      (req.method === 'GET' && reqPath.startsWith('/ai-bpm/export-word/jobs/'))
    ) {
      return next.handle();
    }
    const startedAt = Date.now();
    const actor = await this.resolveActor(req);
    let alreadyLogged = false;

    const write = (outcome: 'pass' | 'fail', error?: string | null) => {
      if (alreadyLogged) return;
      alreadyLogged = true;
      const now = new Date();
      const tsUtc = now.toISOString();
      const tsUae = `${new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dubai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now)} GMT+4`;

      const row: UserLogRow = {
        timestampUtc: tsUtc,
        timestampUae: tsUae,
        outcome,
        error: error ?? null,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        method: req.method,
        path: req.originalUrl || req.url,
        actor,
        ip: req.ip || '',
        userAgent: String(req.headers['user-agent'] ?? ''),
      };
      void this.writeRow(row);
    };

    return next.handle().pipe(
      tap(() => {
        write('pass', null);
      }),
      catchError((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Unknown error';
        write('fail', message);
        return throwError(() => err);
      }),
    );
  }

  private async resolveActor(req: Request): Promise<string> {
    const auth = req.headers.authorization ?? req.headers.Authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      try {
        const payload = await this.jwtService.verifyAsync<{ email?: string }>(
          token,
        );
        if (payload?.email?.trim()) {
          return payload.email.trim().toLowerCase();
        }
      } catch {
        return 'invalid-token';
      }
    }
    const legacy = req.headers['x-user-email'];
    if (typeof legacy === 'string' && legacy.trim()) {
      return legacy.trim().toLowerCase();
    }
    return 'anonymous';
  }

  private async ensureInit() {
    if (this.initialized) return;
    await mkdir(this.logDir, { recursive: true, mode: 0o700 });
    await chmod(this.logDir, 0o700).catch(() => undefined);
    await appendFile(this.logPath, '', { encoding: 'utf-8', mode: 0o600 });
    await chmod(this.logPath, 0o600).catch(() => undefined);
    this.initialized = true;
  }

  /** Keep the log from growing without bound: roll over at ~80 MB (one previous file is kept). */
  private lastSizeCheck = 0;

  private async rotateIfLarge() {
    const now = Date.now();
    if (now - this.lastSizeCheck < 60_000) return;
    this.lastSizeCheck = now;
    try {
      const { size } = await stat(this.logPath);
      if (size > 80 * 1024 * 1024) {
        await rename(this.logPath, join(this.logDir, 'User_LOG.prev.jsonl'));
        await appendFile(this.logPath, '', { encoding: 'utf-8', mode: 0o600 });
      }
    } catch {
      /* logging must never break a request */
    }
  }

  private async writeRow(row: UserLogRow) {
    await this.ensureInit();
    await this.rotateIfLarge();
    await appendFile(this.logPath, `${JSON.stringify(row)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
    });
  }
}
