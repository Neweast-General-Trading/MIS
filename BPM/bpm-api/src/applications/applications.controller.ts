import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { PERMISSIONS } from 'src/access-control/access-control.constants';
import { RequirePermission } from 'src/access-control/permissions.decorator';
import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';

import { ApplicationsService } from './applications.service';
import { UpsertApplicationDto } from './dto/upsert-application.dto';

@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly jwtService: JwtService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.applicationMaster)
  findAll() {
    return this.applicationsService.findAll();
  }

  /** Lightweight list for the Application Master multi-select in sub-process forms (any signed-in user). */
  @Get('options')
  options() {
    return this.applicationsService.findOptions();
  }

  @Post()
  @RequirePermission(PERMISSIONS.applicationMaster)
  create(@Body() dto: UpsertApplicationDto, @Req() req: Request) {
    return this.applicationsService.create(dto, this.userEmail(req));
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.applicationMaster)
  update(@Param('id') id: string, @Body() dto: UpsertApplicationDto) {
    return this.applicationsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.applicationMaster)
  remove(@Param('id') id: string) {
    return this.applicationsService.remove(id);
  }

  private userEmail(req: Request): string | null {
    try {
      return resolveRequestUserEmail(req, this.jwtService) || null;
    } catch {
      return null;
    }
  }
}
