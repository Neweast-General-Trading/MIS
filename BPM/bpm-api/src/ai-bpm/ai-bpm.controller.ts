import {
  Body,
  Controller,
  Get,
  Post,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { RequireSuperAdmin } from 'src/access-control/super-admin.decorator';

import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';

import { ProcessDocumentationService } from 'src/process-documentation/process-documentation.service';

import { AiBpmService } from './ai-bpm.service';
import { ApproveAiBpmDocumentDto } from './dto/approve-ai-bpm-document.dto';
import { GenerateAiBpmDto } from './dto/generate-ai-bpm.dto';

@Controller('ai-bpm')
@RequireSuperAdmin()
export class AiBpmController {
  constructor(
    private readonly aiBpmService: AiBpmService,
    private readonly documentationService: ProcessDocumentationService,
    private readonly jwtService: JwtService,
  ) {}

  private resolveRequestingUserEmail(req: Request): string {
    return resolveRequestUserEmail(req, this.jwtService);
  }

  @Get('templates')
  listTemplates() {
    return this.aiBpmService.listTemplates();
  }

  @Get('targets')
  listTargets(@Req() req: Request) {
    return this.aiBpmService.listTargets(this.resolveRequestingUserEmail(req));
  }

  @Post('generate')
  generate(@Req() req: Request, @Body() dto: GenerateAiBpmDto) {
    return this.aiBpmService.generate(dto, this.resolveRequestingUserEmail(req));
  }

  @Post('approve-document')
  approveDocument(@Req() req: Request, @Body() dto: ApproveAiBpmDocumentDto) {
    return this.documentationService.approveAutomationDocument({
      departmentId: dto.departmentId,
      processId: dto.processId,
      docxBase64: dto.docxBase64,
      docxFilename: dto.docxFilename,
      comments: dto.comments,
      userEmail: this.resolveRequestingUserEmail(req),
    });
  }
}
