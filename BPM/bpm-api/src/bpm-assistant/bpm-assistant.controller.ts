import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { PERMISSIONS } from 'src/access-control/access-control.constants';
import { RequirePermission } from 'src/access-control/permissions.decorator';
import { RequireSuperAdmin } from 'src/access-control/super-admin.decorator';

import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';
import { AskBpmAssistantDto } from './dto/ask-bpm-assistant.dto';
import { BpmAssistantService } from './bpm-assistant.service';

@Controller('bpm-assistant')
export class BpmAssistantController {
  constructor(
    private readonly bpmAssistantService: BpmAssistantService,
    private readonly jwtService: JwtService,
  ) {}

  private resolveRequestingUserEmail(req: Request): string {
    return resolveRequestUserEmail(req, this.jwtService);
  }

  @Post('ask')
  @RequirePermission(PERMISSIONS.departments)
  ask(@Req() req: Request, @Body() dto: AskBpmAssistantDto) {
    return this.bpmAssistantService.ask(this.resolveRequestingUserEmail(req), dto);
  }

  @Get('inquiries')
  @RequireSuperAdmin()
  listInquiries(
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
    @Query('user') user?: string,
    @Query('q') q?: string,
  ) {
    const page = Math.max(Number(pageRaw ?? 1) || 1, 1);
    const pageSize = Math.min(Math.max(Number(pageSizeRaw ?? 20) || 20, 1), 100);
    return this.bpmAssistantService.listInquiries({ page, pageSize, user, q });
  }
}
