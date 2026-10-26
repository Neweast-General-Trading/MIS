import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { RequireAiAccess } from 'src/access-control/ai-access.decorator';
import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';

import { AiBpmService } from './ai-bpm.service';
import { ExportAiBpmWordDto } from './dto/export-ai-bpm-word.dto';

/** AI Word export for sub-process tables / process functions — Super Admin + approved users. */
@Controller('ai-bpm')
@RequireAiAccess()
export class AiBpmExportController {
  constructor(
    private readonly aiBpmService: AiBpmService,
    private readonly jwtService: JwtService,
  ) {}

  private resolveRequestingUserEmail(req: Request): string {
    return resolveRequestUserEmail(req, this.jwtService);
  }

  @Post('export-word/jobs')
  startExportWordJob(@Req() req: Request, @Body() dto: ExportAiBpmWordDto) {
    return this.aiBpmService.startWordExportJob(
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Get('export-word/jobs/:jobId')
  exportWordJobStatus(@Req() req: Request, @Param('jobId') jobId: string) {
    return this.aiBpmService.getWordExportJob(
      jobId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Get('export-word/jobs/:jobId/file')
  async exportWordJobFile(
    @Req() req: Request,
    @Param('jobId') jobId: string,
    @Query('kind') kind?: string,
  ) {
    const file = await this.aiBpmService.downloadWordExportJob(
      jobId,
      this.resolveRequestingUserEmail(req),
      kind,
    );
    return new StreamableFile(file.buffer, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    });
  }

  @Post('export-word/jobs/:jobId/sop')
  startSopJob(@Req() req: Request, @Param('jobId') jobId: string) {
    return this.aiBpmService.startWordFollowUp(
      jobId,
      this.resolveRequestingUserEmail(req),
      'sop',
    );
  }

  @Post('export-word/jobs/:jobId/summary')
  startSummaryJob(@Req() req: Request, @Param('jobId') jobId: string) {
    return this.aiBpmService.startWordFollowUp(
      jobId,
      this.resolveRequestingUserEmail(req),
      'summary',
    );
  }

  @Post('export-word/jobs/:jobId/jd')
  startJobDescriptionJob(@Req() req: Request, @Param('jobId') jobId: string) {
    return this.aiBpmService.startWordFollowUp(
      jobId,
      this.resolveRequestingUserEmail(req),
      'jd',
    );
  }

  @Post('export-word')
  exportWord(@Req() req: Request, @Body() dto: ExportAiBpmWordDto) {
    return this.aiBpmService.exportWordDocument(
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }
}
