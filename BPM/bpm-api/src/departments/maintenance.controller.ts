import { Body, Controller, ForbiddenException, Get, Post, Query, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { AccessControlService } from 'src/access-control/access-control.service';
import { UserLogReaderService } from 'src/maintenance/user-log-reader.service';

import { PurgeBpmOperationalDataDto } from './dto/purge-bpm-operational-data.dto';
import { DepartmentsService } from './departments.service';
import { MasterDataComparisonService } from 'src/companies/master-data-comparison.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly departmentsService: DepartmentsService,
    private readonly jwtService: JwtService,
    private readonly accessControlService: AccessControlService,
    private readonly userLogReaderService: UserLogReaderService,
    private readonly masterDataComparisonService: MasterDataComparisonService,
  ) {}

  /**
   * Deletes departments (Process Functions), processes, activities (sub-processes), and comments.
   * Optionally keeps `activity_templates` when `keepActivityTemplates` is true.
   * Only users with **full access** (JWT) may call this — no separate env flag.
   */
  @Post('purge-bpm-operational-data')
  async purgeBpmOperationalData(
    @Req() req: Request,
    @Body() dto: PurgeBpmOperationalDataDto,
  ) {
    await this.assertJwtFullAccess(req);

    const reseedNewEast = dto.reseedNewEast === true;
    const keepActivityTemplates = dto.keepActivityTemplates === true;
    return this.departmentsService.purgeAllBpmOperationalData({
      reseedNewEast,
      keepActivityTemplates,
    });
  }

  @Get('backup-history')
  async getBackupHistory(
    @Req() req: Request,
    @Query('limit') limitRaw?: string,
  ) {
    await this.assertJwtSuperAdmin(req);
    const limit = Math.min(Math.max(Number(limitRaw ?? 100) || 100, 1), 500);
    const historyPath = join(process.cwd(), '..', 'backups', 'backup-history.jsonl');
    const raw = await readFile(historyPath, 'utf-8').catch(() => '');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const rows = lines
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line) as {
            timestamp?: string;
            status?: string;
            message?: string;
            backupFile?: string | null;
            backupSizeBytes?: number | null;
          };
        } catch {
          return {
            timestamp: new Date().toISOString(),
            status: 'parse_error',
            message: line,
            backupFile: null,
            backupSizeBytes: null,
          };
        }
      });
    return { rows };
  }

  @Get('master-data-comparison')
  async getMasterDataComparison(@Req() req: Request) {
    await this.assertJwtSuperAdmin(req);
    return this.masterDataComparisonService.getCached();
  }

  @Post('master-data-comparison/sync')
  async syncMasterDataComparison(@Req() req: Request) {
    await this.assertJwtSuperAdmin(req);
    return this.masterDataComparisonService.syncFromSources();
  }

  @Get('user-log/analytics')
  async getUserLogAnalytics(@Req() req: Request) {
    await this.assertJwtSuperAdmin(req);
    return this.userLogReaderService.getAnalytics();
  }

  @Get('user-log')
  async getUserLog(
    @Req() req: Request,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('status') status?: string,
    @Query('user') user?: string,
    @Query('q') q?: string,
  ) {
    await this.assertJwtSuperAdmin(req);
    const pageSizeFallback =
      pageSizeRaw?.trim() ||
      limitRaw?.trim() ||
      '';
    const pageSize = Math.min(Math.max(Number(pageSizeFallback || 20) || 20, 1), 100);
    const page = Math.max(Number(pageRaw ?? 1) || 1, 1);

    return this.userLogReaderService.query({
      page,
      pageSize,
      status,
      user,
      q,
    });
  }

  private async assertJwtFullAccess(req: Request) {
    const raw = req.headers.authorization ?? req.headers.Authorization;
    if (typeof raw !== 'string' || !raw.startsWith('Bearer ')) {
      throw new ForbiddenException('Sign in with JWT (full-access account) to purge data.');
    }
    const token = raw.slice(7).trim();
    try {
      const payload = await this.jwtService.verifyAsync<{ email?: string }>(token);
      const email = payload?.email?.trim().toLowerCase();
      if (!email) {
        throw new ForbiddenException('Invalid session.');
      }
      const allowed = await this.accessControlService.userHasFullAccess(email);
      if (!allowed) {
        throw new ForbiddenException('Only full-access administrators can purge operational data.');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Invalid or expired session.');
    }
  }

  private async assertJwtSuperAdmin(req: Request) {
    const raw = req.headers.authorization ?? req.headers.Authorization;
    if (typeof raw !== 'string' || !raw.startsWith('Bearer ')) {
      throw new ForbiddenException('Sign in with JWT (Super Admin account) to view backup history.');
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
        throw new ForbiddenException('Only Super Admin can view backup history.');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Invalid or expired session.');
    }
  }
}
