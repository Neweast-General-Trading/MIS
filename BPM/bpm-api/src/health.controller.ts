import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { AccessControlService } from './access-control/access-control.service';
import { SystemHealthService } from './system-health/system-health.service';

/**
 * Root controller (no path prefix) so `GET /health` and `GET /maintenance/system-health`
 * are always registered with the app — the detailed route is not tied to the departments module.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly systemHealthService: SystemHealthService,
    private readonly jwtService: JwtService,
    private readonly accessControlService: AccessControlService,
  ) {}

  /** Minimal probe for load balancers — no secrets, no JWT. */
  @Get('health')
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Full snapshot — registered under two paths so proxies/caches that mishandle
   * `/maintenance/*` still have a stable alias (`/system-health`).
   */
  @Get(['system-health', 'maintenance/system-health'])
  async systemHealth(@Req() req: Request) {
    await this.assertJwtSuperAdmin(req);
    return this.systemHealthService.getSnapshot();
  }

  private async assertJwtSuperAdmin(req: Request) {
    const raw = req.headers.authorization ?? req.headers.Authorization;
    if (typeof raw !== 'string' || !raw.startsWith('Bearer ')) {
      throw new ForbiddenException('Sign in with JWT (Super Admin account) to view system health.');
    }
    const token = raw.slice(7).trim();
    try {
      const payload = await this.jwtService.verifyAsync<{ email?: string }>(token);
      const email = payload?.email?.trim().toLowerCase();
      if (!email) {
        throw new ForbiddenException('Invalid session.');
      }
      const allowed = await this.accessControlService.userIsSuperAdmin(email);
      if (!allowed) {
        throw new ForbiddenException('Only Super Admin can view system health.');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Invalid or expired session.');
    }
  }
}
