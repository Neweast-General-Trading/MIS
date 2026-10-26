import { Controller, Get, Param, Req, StreamableFile } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { PERMISSIONS } from 'src/access-control/access-control.constants';
import { RequirePermission } from 'src/access-control/permissions.decorator';
import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';

import { ProcessPrintService } from './process-print.service';

@Controller('activity-print')
export class ProcessPrintController {
  constructor(
    private readonly service: ProcessPrintService,
    private readonly jwtService: JwtService,
  ) {}

  /** Printable PDF of every sub-process inside a process (data only – no AI). */
  @Get('process/:departmentId/:processId')
  @RequirePermission(PERMISSIONS.processes)
  async processPdf(
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Req() req: Request,
  ) {
    const email = resolveRequestUserEmail(req, this.jwtService) || null;
    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ||
      req.protocol;
    const host =
      (req.headers['x-forwarded-host'] as string | undefined) ||
      req.headers.host;
    const { buffer, filename } = await this.service.render(
      departmentId,
      processId,
      email,
      host ? `${proto}://${host}` : undefined,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}.pdf"`,
    });
  }

  /** Printable PDF of a whole process function: all processes and their sub-processes. */
  @Get('department/:departmentId')
  @RequirePermission(PERMISSIONS.processes)
  async departmentPdf(
    @Param('departmentId') departmentId: string,
    @Req() req: Request,
  ) {
    const email = resolveRequestUserEmail(req, this.jwtService) || null;
    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ||
      req.protocol;
    const host =
      (req.headers['x-forwarded-host'] as string | undefined) ||
      req.headers.host;
    const { buffer, filename } = await this.service.renderDepartment(
      departmentId,
      email,
      host ? `${proto}://${host}` : undefined,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}.pdf"`,
    });
  }
}
