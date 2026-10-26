import { Body, Controller, Post, Req, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';

import { PERMISSIONS } from 'src/access-control/access-control.constants';
import { RequirePermission } from 'src/access-control/permissions.decorator';

import { ActivityPrintDto } from './activity-print.dto';
import { ActivityPrintService } from './activity-print.service';

@Controller('activity-print')
export class ActivityPrintController {
  constructor(private readonly service: ActivityPrintService) {}

  @Post('pdf')
  @RequirePermission(PERMISSIONS.activities)
  async pdf(@Body() dto: ActivityPrintDto, @Req() req: Request) {
    const origin =
      typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const { buffer, filename } = await this.service.render(dto, origin);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="${filename}.pdf"`,
    });
  }
}
