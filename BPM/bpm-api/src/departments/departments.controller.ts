import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { createReadStream } from 'node:fs';
import { PERMISSIONS } from 'src/access-control/access-control.constants';
import { RequirePermission } from 'src/access-control/permissions.decorator';
import { resolveRequestUserEmail } from 'src/common/auth/request-user-email.util';
import { AddActivityCommentDto } from 'src/activities/dto/add-activity-comment.dto';
import { AddActivityRelationDto } from 'src/activities/dto/add-activity-relation.dto';
import { AddActivityPolicyLinkDto } from 'src/activities/dto/add-activity-policy-link.dto';
import { UpdateActivityCommentDto } from 'src/activities/dto/update-activity-comment.dto';
import { DepartmentsService } from './departments.service';
import { OrgDepartmentsService } from './org-departments.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { DefineProcessDto } from './dto/define-process.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { CreateProcessDto } from './dto/create-process.dto';
import { UpdateProcessDto } from './dto/update-process.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ImportBpmGridDto } from './dto/import-bpm-grid.dto';
import {
  BulkVendorVersionDto,
  UpsertActivityVendorVersionDto,
} from './dto/upsert-activity-vendor-version.dto';
type UploadedXlsxFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
};

type UploadedAttachmentFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  fieldname?: string;
};

@Controller('departments')
export class DepartmentsController {
  constructor(
    private readonly departmentsService: DepartmentsService,
    private readonly orgDepartmentsService: OrgDepartmentsService,
    private readonly jwtService: JwtService,
  ) {}

  private resolveRequestingUserEmail(
    req: Request,
    accessTokenFromQuery?: string,
  ): string {
    return resolveRequestUserEmail(req, this.jwtService, { accessTokenFromQuery });
  }

  @Get()
  @RequirePermission(PERMISSIONS.departments)
  findAll(
    @Req() req: Request,
    @Query('view') view?: string,
    @Query('companyCode') companyCode?: string,
  ) {
    const userEmail = this.resolveRequestingUserEmail(req);
    if (view?.trim().toLowerCase() === 'explorer') {
      return this.departmentsService.findExplorerTree(userEmail, companyCode);
    }
    return this.departmentsService.findAll(userEmail);
  }

  /** @deprecated use GET /departments?view=explorer */
  @Get('explorer-tree')
  @RequirePermission(PERMISSIONS.departments)
  findExplorerTree(
    @Req() req: Request,
    @Query('companyCode') companyCode?: string,
  ) {
    return this.departmentsService.findExplorerTree(
      this.resolveRequestingUserEmail(req),
      companyCode,
    );
  }

  /** Company dashboard KPIs + job-role / reports rollups. */
  @Get('dashboard-summary')
  @RequirePermission(PERMISSIONS.departments)
  dashboardSummary(
    @Req() req: Request,
    @Query('companyCode') companyCode?: string,
  ) {
    return this.departmentsService.getCompanyDashboardSummary(
      companyCode ?? '',
      this.resolveRequestingUserEmail(req),
    );
  }

  /** Minimal template list for process import UI (users with `processes` permission). */
  @Get('activity-templates-for-import')
  @RequirePermission(PERMISSIONS.processes)
  activityTemplatesForImport() {
    return this.departmentsService.listActivityTemplateSummaries();
  }

  @Get('administration/attachments')
  @RequirePermission(PERMISSIONS.usersPermissions)
  listUploadedAttachments(@Req() req: Request) {
    return this.departmentsService.listUploadedAttachments(
      this.resolveRequestingUserEmail(req),
    );
  }

  /** Download a ready-made .xlsx layout (Index + Process_Example + _README) for the given sub-process template. */
  @Get('bpm-import-template.xlsx')
  @RequirePermission(PERMISSIONS.processes)
  async downloadBpmImportTemplate(@Query('templateId') templateId?: string) {
    const id = templateId?.trim();
    if (!id) {
      throw new BadRequestException('Query parameter templateId is required.');
    }
    const buffer =
      await this.departmentsService.buildBpmImportTemplateWorkbook(id);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="bpm-import-template.xlsx"',
    });
  }

  @Get('org-departments')
  @RequirePermission(PERMISSIONS.departments)
  listOrgDepartments() {
    return this.orgDepartmentsService.findAll();
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.departments)
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.departmentsService.findOne(
      id,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Get(':id/processes')
  @RequirePermission(PERMISSIONS.processes)
  findDepartmentProcesses(@Req() req: Request, @Param('id') id: string) {
    return this.departmentsService
      .findOne(id, this.resolveRequestingUserEmail(req))
      .then((department) => department.processes);
  }

  @Get(':departmentId/processes/:processId')
  @RequirePermission(PERMISSIONS.processes)
  findProcess(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
  ) {
    return this.departmentsService.findProcess(
      departmentId,
      processId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post()
  @RequirePermission(PERMISSIONS.departments)
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.departments)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(
      id,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.departments)
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.departmentsService.remove(
      id,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post(':id/processes')
  @RequirePermission(PERMISSIONS.processes)
  createProcess(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CreateProcessDto,
  ) {
    return this.departmentsService.createProcess(
      id,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post(':id/import-bpm-grid')
  @RequirePermission(PERMISSIONS.processes)
  importBpmGrid(
    @Req() req: Request,
    @Param('id') departmentId: string,
    @Body() dto: ImportBpmGridDto,
  ) {
    return this.departmentsService.importBpmGridSheets(
      departmentId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post(':id/import-bpm-index-xlsx')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @RequirePermission(PERMISSIONS.processes)
  importBpmIndexXlsx(
    @Req() req: Request,
    @Param('id') departmentId: string,
    @UploadedFile() file: UploadedXlsxFile | undefined,
    @Body('companyCode') companyCode: string,
    @Body('activityTemplateId') activityTemplateId: string,
    @Body('processOwnersJson') processOwnersJson?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Upload an .xlsx file as form field "file".',
      );
    }
    const okMime =
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/octet-stream';
    const okExt = file.originalname?.toLowerCase().endsWith('.xlsx');
    if (!okMime && !okExt) {
      throw new BadRequestException('Only .xlsx workbooks are supported.');
    }

    let processOwners: string[] = [];
    if (processOwnersJson?.trim()) {
      try {
        const parsed = JSON.parse(processOwnersJson) as unknown;
        if (Array.isArray(parsed)) {
          processOwners = parsed.map((x) => String(x).trim()).filter(Boolean);
        }
      } catch {
        processOwners = processOwnersJson
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    return this.departmentsService.importProcessesFromIndexXlsx(
      departmentId,
      file.buffer,
      {
        companyCode: companyCode ?? '',
        activityTemplateId: activityTemplateId ?? '',
        processOwners,
      },
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post(':id/import-bpm-workbook-per-sheet-xlsx')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  @RequirePermission(PERMISSIONS.processes)
  importBpmWorkbookPerSheetXlsx(
    @Req() req: Request,
    @Param('id') departmentId: string,
    @UploadedFile() file: UploadedXlsxFile | undefined,
    @Body('companyCode') companyCode: string,
    @Body('activityTemplateId') activityTemplateId: string,
    @Body('processOwnersJson') processOwnersJson?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Upload an .xlsx file as form field "file".',
      );
    }
    const okMime =
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/octet-stream';
    const okExt = file.originalname?.toLowerCase().endsWith('.xlsx');
    if (!okMime && !okExt) {
      throw new BadRequestException('Only .xlsx workbooks are supported.');
    }

    let processOwners: string[] = [];
    if (processOwnersJson?.trim()) {
      try {
        const parsed = JSON.parse(processOwnersJson) as unknown;
        if (Array.isArray(parsed)) {
          processOwners = parsed.map((x) => String(x).trim()).filter(Boolean);
        }
      } catch {
        processOwners = processOwnersJson
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    return this.departmentsService.importWorkbookPerSheetWithActivities(
      departmentId,
      file.buffer,
      {
        companyCode: companyCode ?? '',
        activityTemplateId: activityTemplateId ?? '',
        processOwners,
      },
      this.resolveRequestingUserEmail(req),
    );
  }

  @Get(':departmentId/processes/:processId/activity-template')
  @RequirePermission(PERMISSIONS.activities, PERMISSIONS.vendorVersions)
  findProcessTemplate(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
  ) {
    return this.departmentsService.findProcessTemplate(
      departmentId,
      processId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Patch(':departmentId/processes/:processId')
  @RequirePermission(PERMISSIONS.processes, PERMISSIONS.activities)
  updateProcess(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Body() dto: UpdateProcessDto,
  ) {
    return this.departmentsService.updateProcess(
      departmentId,
      processId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Delete(':departmentId/processes/:processId')
  @RequirePermission(PERMISSIONS.processes)
  removeProcess(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
  ) {
    return this.departmentsService.removeProcess(
      departmentId,
      processId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Patch(':departmentId/processes/:processId/definition')
  @RequirePermission(PERMISSIONS.processes, PERMISSIONS.activities)
  defineProcess(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Body() dto: DefineProcessDto,
  ) {
    return this.departmentsService.defineProcess(
      departmentId,
      processId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post(':departmentId/processes/:processId/activities')
  @RequirePermission(PERMISSIONS.activities)
  createActivity(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.departmentsService.createActivity(
      departmentId,
      processId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Patch(':departmentId/processes/:processId/activities/:activityId')
  @RequirePermission(PERMISSIONS.activities)
  updateActivity(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.departmentsService.updateActivity(
      departmentId,
      processId,
      activityId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post(':departmentId/processes/:processId/activities/:activityId/relations')
  @RequirePermission(PERMISSIONS.activities)
  addActivityRelation(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @Body() dto: AddActivityRelationDto,
  ) {
    return this.departmentsService.addActivityRelation(
      departmentId,
      processId,
      activityId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post(':departmentId/processes/:processId/activities/:activityId/policy-links')
  @RequirePermission(PERMISSIONS.activities)
  addActivityPolicyLink(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @Body() dto: AddActivityPolicyLinkDto,
  ) {
    return this.departmentsService.addActivityPolicyLink(
      departmentId,
      processId,
      activityId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Delete(
    ':departmentId/processes/:processId/activities/:activityId/policy-links/:policyLinkId',
  )
  @RequirePermission(PERMISSIONS.activities)
  removeActivityPolicyLink(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @Param('policyLinkId') policyLinkId: string,
  ) {
    return this.departmentsService.removeActivityPolicyLink(
      departmentId,
      processId,
      activityId,
      policyLinkId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Delete(
    ':departmentId/processes/:processId/activities/:activityId/relations/:targetActivityId',
  )
  @RequirePermission(PERMISSIONS.activities)
  removeActivityRelation(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @Param('targetActivityId') targetActivityId: string,
  ) {
    return this.departmentsService.removeActivityRelation(
      departmentId,
      processId,
      activityId,
      targetActivityId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Patch(
    ':departmentId/processes/:processId/activities/:activityId/vendor-version',
  )
  @RequirePermission(PERMISSIONS.vendorVersions)
  upsertActivityVendorVersion(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpsertActivityVendorVersionDto,
  ) {
    return this.departmentsService.updateActivityVendorVersion(
      departmentId,
      processId,
      activityId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post(':departmentId/processes/:processId/vendor-version')
  @RequirePermission(PERMISSIONS.vendorVersions)
  uploadProcessVendorVersion(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Body() dto: BulkVendorVersionDto,
  ) {
    return this.departmentsService.uploadProcessVendorVersion(
      departmentId,
      processId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Delete(':departmentId/processes/:processId/activities/:activityId')
  @RequirePermission(PERMISSIONS.activities)
  removeActivity(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.departmentsService.removeActivity(
      departmentId,
      processId,
      activityId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Post(':departmentId/processes/:processId/activities/:activityId/comments')
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @RequirePermission(PERMISSIONS.activities)
  addActivityComment(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @UploadedFiles() files?: UploadedAttachmentFile[],
  ) {
    /** Multer puts fields on req.body; @Body() DTO validation is unreliable here → extract explicitly */
    const dto = this.parseMultipartCommentMessageDto(req);
    const normalizedFiles = (files ?? []).filter(
      (file) =>
        (file.fieldname === 'file' || file.fieldname === 'files') &&
        !!file.buffer?.length,
    );
    return this.departmentsService.addActivityComment(
      departmentId,
      processId,
      activityId,
      dto,
      normalizedFiles,
      this.resolveRequestingUserEmail(req),
    );
  }

  private parseMultipartCommentMessageDto(req: Request): AddActivityCommentDto {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const raw = body.message;
    const str =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw) && typeof raw[0] === 'string'
          ? raw[0]
          : '';
    const message = str.trim();
    if (!message) {
      throw new BadRequestException('Comment message is required.');
    }
    if (message.length > 4000) {
      throw new BadRequestException(
        'Comment message must be at most 4000 characters.',
      );
    }
    return { message };
  }

  @Patch(
    ':departmentId/processes/:processId/activities/:activityId/comments/:commentId',
  )
  @RequirePermission(PERMISSIONS.activities)
  updateActivityComment(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateActivityCommentDto,
  ) {
    return this.departmentsService.updateActivityComment(
      departmentId,
      processId,
      activityId,
      commentId,
      dto,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Delete(
    ':departmentId/processes/:processId/activities/:activityId/comments/:commentId',
  )
  @RequirePermission(PERMISSIONS.activities)
  deleteActivityComment(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.departmentsService.deleteActivityComment(
      departmentId,
      processId,
      activityId,
      commentId,
      this.resolveRequestingUserEmail(req),
    );
  }

  @Get(
    ':departmentId/processes/:processId/activities/:activityId/comments/:commentId/file',
  )
  @RequirePermission(PERMISSIONS.activities)
  async downloadActivityCommentAttachment(
    @Req() req: Request,
    @Param('departmentId') departmentId: string,
    @Param('processId') processId: string,
    @Param('activityId') activityId: string,
    @Param('commentId') commentId: string,
    @Query('accessToken') accessToken?: string,
  ) {
    const file = await this.departmentsService.getActivityCommentAttachment(
      departmentId,
      processId,
      activityId,
      commentId,
      this.resolveRequestingUserEmail(req, accessToken),
    );
    return new StreamableFile(createReadStream(file.filePath), {
      type: file.mimeType,
      disposition: `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
    });
  }
}
