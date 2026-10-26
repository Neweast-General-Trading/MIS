import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { RequireSuperAdmin } from 'src/access-control/super-admin.decorator';

import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';

import { ListDocumentationRecordsDto } from './dto/list-documentation-records.dto';
import { PatchDocumentationCommentsDto } from './dto/patch-documentation-comments.dto';
import { ProcessDocumentationService } from './process-documentation.service';

type UploadedDocFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@Controller('process-documentation')
@RequireSuperAdmin()
export class ProcessDocumentationController {
  constructor(
    private readonly documentationService: ProcessDocumentationService,
    private readonly jwtService: JwtService,
  ) {}

  private resolveRequestingUserEmail(req: Request): string {
    return resolveRequestUserEmail(req, this.jwtService);
  }

  @Get('targets')
  listTargets(@Req() req: Request) {
    return this.documentationService.listTargets(this.resolveRequestingUserEmail(req));
  }

  @Get('records')
  listRecords(@Req() req: Request, @Query() query: ListDocumentationRecordsDto) {
    return this.documentationService.listRecords(
      this.resolveRequestingUserEmail(req),
      query,
    );
  }

  @Get('records/grouped')
  listGroupedRecords(@Req() req: Request, @Query() query: ListDocumentationRecordsDto) {
    return this.documentationService.listGroupedRecords(
      this.resolveRequestingUserEmail(req),
      query,
    );
  }

  @Get('departments/:departmentId')
  listDepartment(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
  ) {
    return this.documentationService.listForDepartment(
      departmentId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Get('departments/:departmentId/processes/:processId')
  listProcess(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
  ) {
    return this.documentationService.listForProcess(
      departmentId,
      processId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post('departments/:departmentId')
  @UseInterceptors(FileInterceptor('file'))
  uploadDepartment(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @UploadedFile() file?: UploadedDocFile,
  ) {
    return this.documentationService.uploadToDepartment(
      departmentId,
      {
        buffer: file?.buffer ?? Buffer.alloc(0),
        originalname: file?.originalname,
        mimetype: file?.mimetype,
      },
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post('departments/:departmentId/processes/:processId')
  @UseInterceptors(FileInterceptor('file'))
  uploadProcess(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @UploadedFile() file?: UploadedDocFile,
  ) {
    return this.documentationService.uploadToProcess(
      departmentId,
      processId,
      {
        buffer: file?.buffer ?? Buffer.alloc(0),
        originalname: file?.originalname,
        mimetype: file?.mimetype,
      },
      this.resolveRequestingUserEmail(req),
    );
  }

  @Get('files/:fileId/download')
  download(@Req() req: Request, @Param('fileId') fileId: string) {
    return this.documentationService.download(
      fileId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Patch('files/:fileId/comments')
  patchComments(
    @Req() req: Request,
    @Param('fileId') fileId: string,
    @Body() body: PatchDocumentationCommentsDto,
  ) {
    return this.documentationService.updateComments(
      fileId,
      body.comments,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Delete('files/:fileId')
  remove(@Req() req: Request, @Param('fileId') fileId: string) {
    return this.documentationService.remove(fileId, this.resolveRequestingUserEmail(req));
  }
}
