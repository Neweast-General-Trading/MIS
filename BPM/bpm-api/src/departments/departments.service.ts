import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { ActivityTemplatesService } from 'src/activity-templates/activity-templates.service';
import { AccessUserEntity } from 'src/access-control/entities/user.entity';
import { AccessControlService } from 'src/access-control/access-control.service';
import {
  findAccessUserByEmail,
  normalizeEmail,
} from 'src/common/auth/access-user-email.util';
import { OrgDepartmentsService } from './org-departments.service';
import { Department } from './entities/department.entity';
import {
  ActivityTemplateEntity,
  type ActivityTemplateField,
} from 'src/activity-templates/entities/activity-template.entity';
import { ActivityCommentAttachmentEntity } from 'src/activities/entities/activity-comment-attachment.entity';
import { ActivityCommentEntity } from 'src/activities/entities/activity-comment.entity';
import { ActivityEntity } from 'src/activities/entities/activity.entity';
import { ActivityRelationEntity } from 'src/activities/entities/activity-relation.entity';
import { ActivityPolicyLinkEntity } from 'src/activities/entities/activity-policy-link.entity';
import { AddActivityRelationDto } from 'src/activities/dto/add-activity-relation.dto';
import { AddActivityPolicyLinkDto } from 'src/activities/dto/add-activity-policy-link.dto';
import { ApplicationEntity } from 'src/applications/entities/application.entity';
import {
  canonicalFixedOption,
  parseApprovalFlow,
  matchFixedTemplateField,
} from 'src/common/activity-template-field-types';
import { ProcessEntity } from 'src/processes/entities/process.entity';
import { CompaniesService } from 'src/companies/companies.service';
import type { CompanyCode } from 'src/processes/company-codes';
import {
  isBpmCodeCompatibleWithHanaBranch,
  mapHanaBranchToBpmCode,
  resolvePrimaryHanaBranchForBpmCode,
} from 'src/hana/company-branch-map';
import { HanaService } from 'src/hana/hana.service';
import { AddActivityCommentDto } from 'src/activities/dto/add-activity-comment.dto';
import { UpdateActivityCommentDto } from 'src/activities/dto/update-activity-comment.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { CreateProcessDto } from './dto/create-process.dto';
import { DefineProcessDto } from './dto/define-process.dto';
import { UpdateProcessDto } from './dto/update-process.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ImportBpmGridDto } from './dto/import-bpm-grid.dto';
import {
  BulkVendorVersionDto,
  UpsertActivityVendorVersionDto,
} from './dto/upsert-activity-vendor-version.dto';
import {
  applyAutofillActivityDetailFields,
  collectAncestorSubProcessNames,
} from './activity-details-autofill.util';
import {
  applyHierarchyCodeToMatchingDetailFields,
  computeNextChildActivityCode,
  computeNextRootActivityCode,
  planStemActivityCodeRenumber,
  remapPastedActivityCodeToProcess,
} from './hierarchy-code-detail.util';
import {
  dataRowsFromGridRecords,
  iterDataRows,
  parsePerSheetLayout,
  shouldSkipSheetForPerSheetImport,
} from './workbook-per-sheet-import.util';
import { buildBpmImportTemplateWorkbookBuffer } from './bpm-import-template.builder';
import {
  buildRelatedSubProcessMap,
  toRelatedSubProcessSummary,
  type RelatedSubProcessSummary,
} from './activity-relations.util';
import {
  buildRelatedPolicyMap,
  defaultPolicyCreatorUrl,
  type RelatedPolicySummary,
} from './activity-policy-links.util';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(ProcessEntity)
    private readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(ActivityRelationEntity)
    private readonly activityRelationRepository: Repository<ActivityRelationEntity>,
    @InjectRepository(ActivityPolicyLinkEntity)
    private readonly activityPolicyLinkRepository: Repository<ActivityPolicyLinkEntity>,
    @InjectRepository(ActivityCommentEntity)
    private readonly activityCommentRepository: Repository<ActivityCommentEntity>,
    @InjectRepository(ActivityCommentAttachmentEntity)
    private readonly activityCommentAttachmentRepository: Repository<ActivityCommentAttachmentEntity>,
    @InjectRepository(ActivityTemplateEntity)
    private readonly activityTemplateRepository: Repository<ActivityTemplateEntity>,
    @InjectRepository(AccessUserEntity)
    private readonly accessUserRepository: Repository<AccessUserEntity>,
    private readonly accessControlService: AccessControlService,
    private readonly activityTemplatesService: ActivityTemplatesService,
    private readonly companiesService: CompaniesService,
    private readonly orgDepartmentsService: OrgDepartmentsService,
    private readonly hanaService: HanaService,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
  ) {}

  /**
   * Fixed-value template fields (Scope, Orchestration Type, Process Type, Frequency → dropdowns;
   * Support, System/Application Impacted → Application Master). Values already stored are kept
   * as-is; only values that are being changed are validated.
   * `lenient` (grid / Excel import) blanks / drops invalid values instead of rejecting the request.
   */
  private async enforceFixedDetailValues(
    fields: ActivityTemplateField[],
    next: Record<string, string | string[]>,
    prev: Record<string, unknown> | null,
    lenient = false,
  ): Promise<Record<string, string | string[]>> {
    const fixed = fields
      .map((f) => ({ f, def: matchFixedTemplateField(f) }))
      .filter((x) => x.def && next[x.f.key] !== undefined);
    if (!fixed.length) return next;

    const out = { ...next };
    let appNames: Map<string, string> | null = null;
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

    for (const { f, def } of fixed) {
      const value = out[f.key];
      if (prev && same(value, prev[f.key])) continue;

      if (def!.kind === 'dropdown') {
        const raw = Array.isArray(value) ? value.join(', ') : String(value ?? '');
        const canonical = canonicalFixedOption(def!.options, raw.trim());
        if (canonical === null) {
          if (lenient) out[f.key] = '';
          else
            throw new BadRequestException(
              `"${f.label}" must be one of: ${def!.options.join(', ')}.`,
            );
        } else {
          out[f.key] = canonical;
        }
        continue;
      }

      // app_master
      appNames ??= new Map(
        (await this.applicationRepository.find({ select: { name: true } })).map(
          (a) => [a.name.trim().toLowerCase(), a.name.trim()] as const,
        ),
      );
      const known = appNames;
      const toItems = (v: unknown): string[] =>
        (Array.isArray(v) ? v : [v])
          .flatMap((x) => {
            const t = String(x ?? '').trim();
            return t && known.has(t.toLowerCase()) ? [t] : t.split(/[,;|\n]/);
          })
          .map((x) => x.trim())
          .filter(Boolean);
      const items = toItems(value);
      // Legacy values already stored on this record are kept; only NEW unknown ones are rejected.
      const legacy = new Set(toItems(prev?.[f.key]).map((x) => x.toLowerCase()));
      const invalid = items.filter(
        (v) => !known.has(v.toLowerCase()) && !legacy.has(v.toLowerCase()),
      );
      if (invalid.length && !lenient) {
        throw new BadRequestException(
          `"${f.label}": ${invalid.join(', ')} ${invalid.length > 1 ? 'are' : 'is'} not in Application Master.`,
        );
      }
      out[f.key] = items
        .filter((v) => known.has(v.toLowerCase()) || legacy.has(v.toLowerCase()))
        .map((v) => known.get(v.toLowerCase()) ?? v);
    }
    return out;
  }


  /** Prefer SLN (import/file order), then hierarchy code. */
  private compareActivityDisplayOrder(
    a: { code?: string | null; sln?: number | null },
    b: { code?: string | null; sln?: number | null },
  ): number {
    const slnDiff = (a.sln ?? 0) - (b.sln ?? 0);
    if (slnDiff !== 0) return slnDiff;
    const pa = String(a.code ?? '')
      .split('-')
      .map((s) => Number.parseInt(s, 10));
    const pb = String(b.code ?? '')
      .split('-')
      .map((s) => Number.parseInt(s, 10));
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
      const va = Number.isFinite(pa[i]) ? (pa[i] as number) : 0;
      const vb = Number.isFinite(pb[i]) ? (pb[i] as number) : 0;
      if (va !== vb) return va - vb;
    }
    return 0;
  }

  private serializeDepartment(dept: Department) {
    const hanaDepartmentName = dept.hanaDepartmentName?.trim() || null;
    const processes = (dept.processes ?? []).map((proc) => ({
      ...proc,
      activities: [...(proc.activities ?? [])].sort((a, b) =>
        this.compareActivityDisplayOrder(a, b),
      ),
    }));
    return {
      ...dept,
      processes,
      orgDepartmentId: dept.orgDepartmentId ?? dept.orgDepartment?.id ?? null,
      orgDepartmentName: hanaDepartmentName ?? dept.orgDepartment?.name ?? null,
      hanaBranch: dept.hanaBranch ?? null,
      hanaDeptCode: dept.hanaDeptCode ?? null,
      hanaDepartmentName,
    };
  }

  private async assertValidHanaDepartment(
    hanaBranch: string,
    hanaDeptCode: number,
    hanaDepartmentName: string,
  ): Promise<void> {
    const branch = hanaBranch.trim();
    const expectedBpm = mapHanaBranchToBpmCode(branch);
    if (!expectedBpm) {
      throw new BadRequestException('Invalid HANA company branch.');
    }

    let rows: Array<{ DEPTCODE: number; DEPARTMENT: string }> = [];
    try {
      rows = await this.hanaService.fetchDepartments(branch);
    } catch {
      throw new BadRequestException(
        'Could not load departments from SAP HANA for this company.',
      );
    }

    const match = rows.find((row) => row.DEPTCODE === hanaDeptCode);
    if (!match) {
      throw new BadRequestException(
        'Department is not valid for the selected company (HANA master list).',
      );
    }

    const hanaName = match.DEPARTMENT?.trim() ?? '';
    const submitted = hanaDepartmentName.trim();
    if (
      hanaName &&
      submitted &&
      hanaName.toLowerCase() !== submitted.toLowerCase()
    ) {
      throw new BadRequestException(
        'Department name does not match SAP HANA for this company.',
      );
    }
  }

  private resolveHanaBranchForCompany(
    companyCode: string,
    hanaBranch?: string | null,
  ): string {
    const branch =
      hanaBranch?.trim() ||
      resolvePrimaryHanaBranchForBpmCode(companyCode.trim().toUpperCase());
    if (!branch) {
      throw new BadRequestException(
        'Could not resolve SAP HANA company branch for this BPM company code.',
      );
    }
    return branch;
  }

  /**
   * Removes all templates, departments, processes, activities, and comments (operational BPM data).
   * Access control users/roles are kept. Optionally recreates default New East process-function folders only.
   */
  async listActivityTemplateSummaries() {
    return this.activityTemplateRepository.find({
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });
  }

  /**
   * Reads the **Index** sheet (or first sheet), finds rows with a Process ID column, and creates one BPM process per row
   * using the department’s next process codes. Expects the same column layout as the NEGT Operations workbook.
   */
  async importProcessesFromIndexXlsx(
    departmentId: string,
    fileBuffer: Buffer,
    options: {
      companyCode: string;
      activityTemplateId: string;
      processOwners: string[];
    },
    requestingUserEmail?: string | null,
  ) {
    if (requestingUserEmail) {
      await this.accessControlService.assertUserCanAccessDepartment(
        requestingUserEmail,
        departmentId,
      );
    } else {
      await this.loadDepartmentTree(departmentId);
    }

    const companyCode = options.companyCode.trim().toUpperCase();
    this.companiesService.assertValidCompanyCode(companyCode);

    const template = await this.activityTemplateRepository.findOne({
      where: { id: options.activityTemplateId.trim() },
    });
    if (!template) {
      throw new NotFoundException('Sub-process template not found.');
    }

    const rows = this.parseIndexSheetRows(fileBuffer);
    if (!rows.length) {
      throw new BadRequestException(
        'No importable rows found. Use a workbook with a sheet named "Index" (or use the first sheet) and a column header containing "Process ID".',
      );
    }

    const items: Array<{
      excelProcessId: string;
      processCode: string;
      processName: string;
    }> = [];
    const errors: string[] = [];

    for (const row of rows) {
      const processName = row.name.trim() || row.processId || 'Unnamed';
      const descParts = [
        row.level0 && `Level 0: ${row.level0}`,
        row.level1 && `Level 1: ${row.level1}`,
        row.level2 && `Level 2: ${row.level2}`,
        row.objective && `Objective: ${row.objective}`,
        `Excel Process ID: ${row.processId}`,
        row.description && `Description: ${row.description}`,
      ].filter(Boolean);
      const processDescription = descParts.join('\n');

      try {
        const created = await this.createProcess(
          departmentId,
          {
            processName,
            companyCode: companyCode,
            activityTemplateId: options.activityTemplateId.trim(),
            processOwners: options.processOwners,
            description: '',
            processDescription,
          },
          requestingUserEmail,
        );
        items.push({
          excelProcessId: row.processId,
          processCode: created.code,
          processName: created.processName,
        });
      } catch (err) {
        errors.push(`${row.processId}: ${(err as Error).message}`);
      }
    }

    return {
      created: items.length,
      skipped: 0,
      items,
      errors,
    };
  }

  /** Binary .xlsx matching the selected sub-process template (copy/paste then import). */
  async buildBpmImportTemplateWorkbook(templateId: string): Promise<Buffer> {
    const template = await this.activityTemplateRepository.findOne({
      where: { id: templateId.trim() },
    });
    if (!template) {
      throw new NotFoundException('Sub-process template not found.');
    }
    try {
      return buildBpmImportTemplateWorkbookBuffer(template);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  private async persistProcessAndActivitiesFromRows(
    departmentId: string,
    args: {
      parentProcessId?: string;
      processCode?: string;
      processName: string;
      processDescription: string | undefined;
      dataRows: Array<{
        details: Record<string, string>;
        activityName: string;
      }>;
      templateId: string;
      companyCode: CompanyCode;
      owners: string[];
      fields: ActivityTemplateField[];
      requestingUserEmail?: string | null;
    },
  ): Promise<ProcessEntity> {
    const fieldDiscussion = Object.fromEntries(
      args.fields.map((f) => [f.key, !!f.openToDiscussion]),
    );
    const department = await this.loadDepartmentTree(departmentId);
    const processCodeLevels = this.normalizeProcessCodeLevels(
      department.processCodeLevels,
    );
    const parentProcessId = args.parentProcessId?.trim();
    const explicitCode = args.processCode?.trim();
    let processCode: string;
    // Parent selection is used only in 4-level mode to keep the same parent branch.
    if (parentProcessId && processCodeLevels !== 4) {
      throw new BadRequestException(
        'Parent process is available only when this process function uses 4-level codes.',
      );
    }
    if (parentProcessId) {
      const parent = department.processes.find((p) => p.id === parentProcessId);
      if (!parent) {
        throw new NotFoundException(
          `Parent process not found in this process function: ${parentProcessId}`,
        );
      }
      processCode = this.getNextChildProcessCode(
        parent.code,
        department.processes,
      );
    } else if (explicitCode) {
      processCode = this.validateAndNormalizeImportedProcessCode(
        explicitCode,
        department.code,
        processCodeLevels,
      );
    } else {
      processCode = this.getNextProcessCode(
        department.code,
        department.processes,
        processCodeLevels,
      );
    }
    const duplicate = await this.processRepository.findOne({
      where: { code: processCode, departmentId: department.id },
      select: { id: true },
    });
    if (processCode.length > 63) {
      throw new BadRequestException(
        `Process Code "${processCode}" is too long (max 63 chars).`,
      );
    }
    if (args.processName.length > 255) {
      throw new BadRequestException(
        `Process Name is too long (max 255 chars).`,
      );
    }
    if (duplicate) {
      throw new ConflictException(
        `Process code already exists in this process function: ${processCode}`,
      );
    }

    const base = this.processRepository.create({
      departmentId: department.id,
      processName: args.processName,
      code: processCode,
      name: `${processCode}_${args.processName}`,
      companyCode: args.companyCode,
    });
    const savedBase = await this.processRepository.save(base);
    const proc = await this.defineProcess(
      departmentId,
      savedBase.id,
      {
        activityTemplateId: args.templateId,
        description: '',
        processOwners: args.owners,
        processDescription: args.processDescription,
      },
      args.requestingUserEmail,
    );

    for (const row of args.dataRows) {
      await this.createActivity(
        departmentId,
        proc.id,
        {
          activityName: row.activityName,
          details: row.details,
          fieldDiscussion,
          activityDescription:
            row.details.activity_description?.trim() || undefined,
          owners: args.owners.length ? args.owners : [],
          status: 'Draft',
        },
        args.requestingUserEmail,
        { lenientFixedFields: true },
      );
    }
    return proc;
  }

  /**
   * Paste/grid import: same outcome as per-sheet Excel import, from JSON (no file upload).
   */
  async importBpmGridSheets(
    departmentId: string,
    dto: ImportBpmGridDto,
    requestingUserEmail?: string | null,
  ): Promise<{
    sheets: Array<{
      sheet: string;
      ok: boolean;
      processCode?: string;
      processId?: string;
      processName?: string;
      activitiesCreated: number;
      message?: string;
      error?: string;
    }>;
    totals: {
      sheetsSkippedIndex: number;
      sheetsAttempted: number;
      processesCreated: number;
      activitiesCreated: number;
    };
  }> {
    if (requestingUserEmail) {
      await this.accessControlService.assertUserCanAccessDepartment(
        requestingUserEmail,
        departmentId,
      );
    } else {
      await this.loadDepartmentTree(departmentId);
    }
    const companyCode = dto.companyCode.trim().toUpperCase();
    this.companiesService.assertValidCompanyCode(companyCode);

    const template = await this.activityTemplateRepository.findOne({
      where: { id: dto.activityTemplateId.trim() },
    });
    if (!template) {
      throw new NotFoundException('Sub-process template not found.');
    }

    const fields = template.fields;
    const owners = dto.processOwners ?? [];
    const templateId = dto.activityTemplateId.trim();

    const sheetsOut: Array<{
      sheet: string;
      ok: boolean;
      processCode?: string;
      processId?: string;
      processName?: string;
      activitiesCreated: number;
      message?: string;
      error?: string;
    }> = [];

    let sheetsAttempted = 0;
    let processesCreated = 0;
    let activitiesCreated = 0;

    for (const sheet of dto.sheets) {
      const sheetLabel = sheet.sheetName.trim();
      const parentProcessId = sheet.parentProcessId?.trim() || undefined;
      const processCode = sheet.processCode?.trim() || undefined;
      const processName = sheet.processName?.trim() || sheetLabel;
      const processDescription = sheet.processDescription?.trim() || undefined;
      const rawRows = Array.isArray(sheet.rows) ? sheet.rows : [];
      const dataRows = dataRowsFromGridRecords(rawRows, fields);
      sheetsAttempted += 1;
      try {
        const proc = await this.persistProcessAndActivitiesFromRows(
          departmentId,
          {
            parentProcessId,
            processCode,
            processName,
            processDescription,
            dataRows,
            templateId,
            companyCode: companyCode,
            owners,
            fields,
            requestingUserEmail,
          },
        );
        processesCreated += 1;
        const count = dataRows.length;
        activitiesCreated += count;
        sheetsOut.push({
          sheet: sheetLabel,
          ok: true,
          processCode: proc.code,
          processId: proc.id,
          processName: proc.processName,
          activitiesCreated: count,
          ...(count === 0
            ? {
                message:
                  'Process saved with no activity rows (fill Activity Name in the grid, or add activities in the app).',
              }
            : {}),
        });
      } catch (err) {
        const raw = (err as Error).message;
        const friendly = this.toImportSheetError(raw);
        sheetsOut.push({
          sheet: sheetLabel,
          ok: false,
          activitiesCreated: 0,
          error: friendly,
        });
      }
    }

    if (processesCreated === 0) {
      const details = sheetsOut
        .filter((s) => !s.ok)
        .map((s) => `${s.sheet}: ${s.error ?? 'failed'}`)
        .join(' | ');
      throw new BadRequestException(
        details
          ? `No processes were saved. ${details}`
          : 'No processes were saved. Fix validation errors on the tabs shown below, then submit again.',
      );
    }

    return {
      sheets: sheetsOut,
      totals: {
        sheetsSkippedIndex: 0,
        sheetsAttempted,
        processesCreated,
        activitiesCreated,
      },
    };
  }

  /**
   * **Per-sheet import:** each worksheet (except `Index`) = one Process (summary in rows above the table)
   * + Sub-process rows under a header row that matches the selected template column titles.
   */
  async importWorkbookPerSheetWithActivities(
    departmentId: string,
    fileBuffer: Buffer,
    options: {
      companyCode: string;
      activityTemplateId: string;
      processOwners: string[];
    },
    requestingUserEmail?: string | null,
  ): Promise<{
    sheets: Array<{
      sheet: string;
      ok: boolean;
      processCode?: string;
      processId?: string;
      processName?: string;
      activitiesCreated: number;
      message?: string;
      error?: string;
    }>;
    totals: {
      sheetsSkippedIndex: number;
      sheetsAttempted: number;
      processesCreated: number;
      activitiesCreated: number;
    };
  }> {
    const companyCode = options.companyCode.trim().toUpperCase();
    this.companiesService.assertValidCompanyCode(companyCode);

    const template = await this.activityTemplateRepository.findOne({
      where: { id: options.activityTemplateId.trim() },
    });
    if (!template) {
      throw new NotFoundException('Sub-process template not found.');
    }

    if (requestingUserEmail) {
      await this.accessControlService.assertUserCanAccessDepartment(
        requestingUserEmail,
        departmentId,
      );
    } else {
      await this.loadDepartmentTree(departmentId);
    }

    const fields = template.fields;
    const workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      cellDates: false,
    });
    const owners = options.processOwners ?? [];
    const templateId = options.activityTemplateId.trim();

    const sheets: Array<{
      sheet: string;
      ok: boolean;
      processCode?: string;
      processId?: string;
      processName?: string;
      activitiesCreated: number;
      message?: string;
      error?: string;
    }> = [];

    let sheetsSkippedIndex = 0;
    let sheetsAttempted = 0;
    let processesCreated = 0;
    let activitiesCreated = 0;

    for (const sheetName of workbook.SheetNames) {
      if (shouldSkipSheetForPerSheetImport(sheetName)) {
        sheetsSkippedIndex += 1;
        const n = sheetName.trim().toLowerCase();
        const message =
          n === 'index'
            ? 'Skipped: sheet "Index" is for import mode A (row list). Use other sheets for mode B.'
            : n === 'summary'
              ? 'Skipped: sheet "Summary" is an overview, not a process.'
              : 'Skipped: sheet name starts with "_" (instructions / readme layout).';
        sheets.push({
          sheet: sheetName,
          ok: false,
          activitiesCreated: 0,
          message,
        });
        continue;
      }

      const ws = workbook.Sheets[sheetName];
      if (!ws) {
        continue;
      }

      const matrix = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(
        ws,
        {
          header: 1,
          defval: '',
        },
      );

      const parsed = parsePerSheetLayout(matrix, sheetName, fields);
      if ('error' in parsed) {
        sheets.push({
          sheet: sheetName,
          ok: false,
          activitiesCreated: 0,
          error: parsed.error,
        });
        continue;
      }

      sheetsAttempted += 1;
      const { summary, headerRowIndex, headerDepth, colToKey } = parsed;
      const dataRows = iterDataRows(
        matrix,
        headerRowIndex,
        colToKey,
        fields,
        headerDepth,
      );

      try {
        let processCode = summary.processCode?.trim();
        if (!processCode) {
          const firstId = dataRows
            .map((r) =>
              String(
                r.details['Process Id'] ??
                  r.details.process_id ??
                  r.details['Activity ID'] ??
                  r.details.activity_id ??
                  '',
              ).trim(),
            )
            .find((id) => /^\d{3}(-\d{3}){2,3}$/.test(id));
          if (firstId && /^\d{3}-\d{3}-\d{3}-\d{3}$/.test(firstId)) {
            processCode = `${firstId.split('-').slice(0, 3).join('-')}-000`;
          } else if (firstId && /^\d{3}-\d{3}-\d{3}$/.test(firstId)) {
            processCode = `${firstId.split('-').slice(0, 2).join('-')}-000`;
          }
        }
        // Align Excel major segment to this process function (e.g. Excel 003-* → PF 002).
        const deptRow = await this.departmentRepository.findOne({
          where: { id: departmentId },
          select: { code: true },
        });
        const deptCode = deptRow?.code?.trim() || '';
        const deptMajor = deptCode.split('-')[0]?.trim();
        if (processCode && deptMajor && /^\d{3}/.test(processCode)) {
          processCode = `${deptMajor}${processCode.slice(3)}`;
        }
        // Skip PF overview sheets whose Id equals the process-function code.
        if (processCode && deptCode && processCode === deptCode) {
          sheets.push({
            sheet: sheetName,
            ok: false,
            activitiesCreated: 0,
            error: `Skipped: Id ${processCode} is the process-function code, not a process.`,
          });
          continue;
        }

        const mappedRows = dataRows.map((r) => ({
          details: r.details,
          activityName: r.activityName,
        }));

        let proc: ProcessEntity | null = null;
        let createdNew = false;
        if (processCode) {
          proc = await this.processRepository.findOne({
            where: { departmentId, code: processCode },
          });
        }
        if (proc) {
          // Same Excel process id on multiple sheets → append activities.
          for (const row of mappedRows) {
            await this.createActivity(
              departmentId,
              proc.id,
              {
                activityName: row.activityName,
                details: row.details,
                fieldDiscussion: Object.fromEntries(
                  fields.map((f) => [f.key, !!f.openToDiscussion]),
                ),
                activityDescription:
                  row.details.activity_description?.trim() ||
                  row.details.Description?.trim() ||
                  undefined,
                owners: owners.length ? owners : [],
                status: 'Draft',
              },
              requestingUserEmail,
              { lenientFixedFields: true },
            );
          }
        } else {
          proc = await this.persistProcessAndActivitiesFromRows(departmentId, {
            processCode,
            processName: summary.processName,
            processDescription: summary.processDescription || undefined,
            dataRows: mappedRows,
            templateId,
            companyCode: companyCode,
            owners,
            fields,
            requestingUserEmail,
          });
          createdNew = true;
          processesCreated += 1;
        }
        const count = dataRows.length;
        activitiesCreated += count;

        sheets.push({
          sheet: sheetName,
          ok: true,
          processCode: proc.code,
          processId: proc.id,
          processName: proc.processName,
          activitiesCreated: count,
          ...(createdNew
            ? count === 0
              ? {
                  message:
                    'Process created with no activity rows yet (paste rows under the header, then re-import or add in the app).',
                }
              : {}
            : {
                message: `Appended to existing process ${proc.code}.`,
              }),
        });
      } catch (err) {
        sheets.push({
          sheet: sheetName,
          ok: false,
          activitiesCreated: 0,
          error: (err as Error).message,
        });
      }
    }

    if (processesCreated === 0) {
      const hints = sheets
        .filter((s) => !s.message?.toLowerCase().includes('skipped'))
        .slice(0, 8)
        .map((s) => `${s.sheet}: ${s.error ?? s.message ?? 'failed'}`)
        .join(' | ');
      throw new BadRequestException(
        hints
          ? `No processes were created from any sheet. ${hints}`
          : 'No processes were created. Add sheets (other than "Index") with a template header row and activity rows.',
      );
    }

    return {
      sheets,
      totals: {
        sheetsSkippedIndex,
        sheetsAttempted,
        processesCreated,
        activitiesCreated,
      },
    };
  }

  async purgeAllBpmOperationalData(options: {
    reseedNewEast: boolean;
    keepActivityTemplates?: boolean;
  }) {
    const table = (entity: Parameters<DataSource['getMetadata']>[0]) =>
      `"${this.dataSource.getMetadata(entity).tableName}"`;

    const keepTemplates = options.keepActivityTemplates === true;
    const tables = [
      table(ActivityCommentEntity),
      table(ActivityEntity),
      table(ProcessEntity),
      table(Department),
      ...(keepTemplates ? [] : [table(ActivityTemplateEntity)]),
    ].join(', ');

    // Raw TRUNCATE is more reliable than chained DELETEs (FKs, self-references on activities).
    await this.dataSource.query(
      `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
    );

    if (options.reseedNewEast) {
      await this.accessControlService.reseedNewEastOrganization();
    } else {
      await this.accessUserRepository
        .createQueryBuilder()
        .update()
        .set({ departmentIds: [] })
        .execute();
    }

    if (!keepTemplates) {
      await this.activityTemplatesService.ensureDefaultRaciTemplate();
    }

    return {
      purged: true,
      reseededNewEast: options.reseedNewEast,
      keptActivityTemplates: keepTemplates,
    };
  }

  async findAll(userEmail?: string | null) {
    const rows = await this.departmentRepository.find({
      relations: { processes: { activities: true }, orgDepartment: true },
      order: {
        code: 'ASC',
        processes: { code: 'ASC' },
      },
    });
    const scoped = await this.accessControlService.scopeDepartmentsForUser(
      rows,
      userEmail ?? null,
    );
    return scoped.map((dept) => this.serializeDepartment(dept));
  }

  /**
   * Company-scoped dashboard rollup: PF / process / sub-process counts plus
   * impacted job roles, policies, TAT (days), and report links from activity details.
   */
  async getCompanyDashboardSummary(
    companyCode: string,
    userEmail?: string | null,
  ) {
    const wanted = companyCode?.trim().toUpperCase() ?? '';
    if (!wanted) {
      throw new BadRequestException('companyCode is required.');
    }

    const scoped = await this.findAll(userEmail);
    const departments = scoped.filter((dept) => {
      const deptCc = (dept.companyCode ?? '').trim().toUpperCase();
      if (deptCc === wanted) return true;
      return (dept.processes ?? []).some(
        (proc) => (proc.companyCode ?? '').trim().toUpperCase() === wanted,
      );
    });

    type RoleDeptAgg = {
      activityIds: Set<string>;
      tatValues: number[];
      raci: Record<RaciLetter, Set<string>>;
      exceptionIds: Set<string>;
      processes: Map<
        string,
        {
          code: string;
          name: string;
          activityIds: Set<string>;
          approvalIds: Set<string>;
          exceptionIds: Set<string>;
        }
      >;
    };
    type RoleAgg = {
      name: string;
      activityIds: Set<string>;
      departmentIds: Set<string>;
      tatValues: number[];
      fteValues: number[];
      approvalIds: Set<string>;
      exceptionIds: Set<string>;
      /** Where the role appears, per process function. */
      byDepartment: Map<string, RoleDeptAgg>;
    };
    type PfAgg = {
      roleKeys: Set<string>;
      policyKeys: Set<string>;
      tatValues: number[];
    };
    const roleMap = new Map<string, RoleAgg>();
    const policyKeys = new Set<string>();
    type PolicyWhere = {
      processes: Map<string, { code: string; name: string }>;
      activityIds: Set<string>;
    };
    const policyAgg = new Map<
      string,
      {
        name: string;
        policyId: string | null;
        byDepartment: Map<string, PolicyWhere>;
      }
    >();
    const addPolicy = (
      key: string,
      name: string,
      deptId: string,
      proc: { id: string; code: string; name: string } | null,
      activityId: string | null,
      policyId: string | null = null,
    ) => {
      let row = policyAgg.get(key);
      if (!row) {
        row = { name, policyId, byDepartment: new Map() };
        policyAgg.set(key, row);
      }
      let where = row.byDepartment.get(deptId);
      if (policyId && !row.policyId) row.policyId = policyId;
      if (!where) {
        where = { processes: new Map(), activityIds: new Set() };
        row.byDepartment.set(deptId, where);
      }
      if (proc)
        where.processes.set(proc.id, { code: proc.code, name: proc.name });
      if (activityId) where.activityIds.add(activityId);
    };
    const processRows: Array<{
      id: string;
      code: string;
      name: string;
      departmentId: string;
      subProcessCount: number;
      roleCount: number;
      tatDaysAvg: number | null;
      tatDaysSampleSize: number;
    }> = [];
    const tatAll: number[] = [];
    const pfAggByDept = new Map<string, PfAgg>();
    const reports: Array<{
      activityId: string;
      activityCode: string;
      activityName: string;
      processId: string;
      processCode: string;
      processName: string;
      departmentId: string;
      departmentCode: string;
      departmentName: string;
      reportText: string;
    }> = [];

    let processCount = 0;
    let activityCount = 0;
    const approvalActivityIds = new Set<string>();
    const exceptionActivityIds = new Set<string>();

    const ensurePfAgg = (deptId: string): PfAgg => {
      let agg = pfAggByDept.get(deptId);
      if (!agg) {
        agg = { roleKeys: new Set(), policyKeys: new Set(), tatValues: [] };
        pfAggByDept.set(deptId, agg);
      }
      return agg;
    };

    const processFunctions = departments.map((dept) => {
      const procs = (dept.processes ?? []).filter((proc) => {
        const procCc = (proc.companyCode ?? '').trim().toUpperCase();
        const deptCc = (dept.companyCode ?? '').trim().toUpperCase();
        return procCc === wanted || (!procCc && deptCc === wanted);
      });
      processCount += procs.length;
      let deptActs = 0;
      const pfAgg = ensurePfAgg(dept.id);
      for (const proc of procs) {
        const procRoleKeys = new Set<string>();
        const procTat: number[] = [];
        for (const act of proc.activities ?? []) {
          activityCount += 1;
          deptActs += 1;
          const details = (act.details ?? {}) as Record<string, unknown>;
          const tat = parseDashboardTatDays(details);
          if (tat != null) {
            tatAll.push(tat);
            pfAgg.tatValues.push(tat);
            procTat.push(tat);
          }
          const fte = parseDashboardFte(details);
          const roles = extractDashboardJobRoles(details);
          const hasException = hasDashboardException(details);
          if (hasException) exceptionActivityIds.add(act.id);
          if (roles.some((r) => r.raci.has('P'))) approvalActivityIds.add(act.id);
          for (const { name: role, key, raci } of roles) {
            let agg = roleMap.get(key);
            if (!agg) {
              agg = {
                name: role,
                activityIds: new Set(),
                departmentIds: new Set(),
                tatValues: [],
                fteValues: [],
                approvalIds: new Set(),
                exceptionIds: new Set(),
                byDepartment: new Map(),
              };
              roleMap.set(key, agg);
            }
            agg.activityIds.add(act.id);
            if (raci.has('P')) agg.approvalIds.add(act.id);
            if (hasException) agg.exceptionIds.add(act.id);
            agg.departmentIds.add(dept.id);
            pfAgg.roleKeys.add(key);
            procRoleKeys.add(key);
            if (tat != null) agg.tatValues.push(tat);
            if (fte != null) agg.fteValues.push(fte);

            let where = agg.byDepartment.get(dept.id);
            if (!where) {
              where = {
                activityIds: new Set(),
                tatValues: [],
                raci: {
                  R: new Set(),
                  A: new Set(),
                  C: new Set(),
                  I: new Set(),
                  V: new Set(),
                  P: new Set(),
                },
                exceptionIds: new Set(),
                processes: new Map(),
              };
              agg.byDepartment.set(dept.id, where);
            }
            where.activityIds.add(act.id);
            if (tat != null) where.tatValues.push(tat);
            for (const letter of raci) where.raci[letter].add(act.id);
            if (hasException) where.exceptionIds.add(act.id);
            let inProcess = where.processes.get(proc.id);
            if (!inProcess) {
              inProcess = {
                code: proc.code,
                name: proc.processName || proc.name,
                activityIds: new Set(),
                approvalIds: new Set(),
                exceptionIds: new Set(),
              };
              where.processes.set(proc.id, inProcess);
            }
            inProcess.activityIds.add(act.id);
            if (raci.has('P')) inProcess.approvalIds.add(act.id);
            if (hasException) inProcess.exceptionIds.add(act.id);
          }
          for (const pol of extractDashboardPolicyRefs(details)) {
            const pk = pol.toLowerCase();
            policyKeys.add(pk);
            pfAgg.policyKeys.add(pk);
            addPolicy(
              pk,
              pol,
              dept.id,
              {
                id: proc.id,
                code: proc.code,
                name: proc.processName || proc.name,
              },
              act.id,
            );
          }
          const reportText = firstDetailString(details, [
            'Reports',
            'reports',
            'Output Documents / Deliverables',
            'Dashboard',
            'dashboard',
          ]);
          if (reportText) {
            reports.push({
              activityId: act.id,
              activityCode: act.code,
              activityName: act.activityName,
              processId: proc.id,
              processCode: proc.code,
              processName: proc.processName || proc.name,
              departmentId: dept.id,
              departmentCode: dept.code,
              departmentName: dept.name,
              reportText: reportText.slice(0, 280),
            });
          }
        }
        processRows.push({
          id: proc.id,
          code: proc.code,
          name: proc.processName || proc.name,
          departmentId: dept.id,
          subProcessCount: (proc.activities ?? []).length,
          roleCount: procRoleKeys.size,
          tatDaysAvg: avgOrNull(procTat),
          tatDaysSampleSize: procTat.length,
        });
      }
      return {
        id: dept.id,
        code: dept.code,
        name: dept.name,
        processCount: procs.length,
        subProcessCount: deptActs,
        impactedJobRoles: pfAgg.roleKeys.size,
        policies: pfAgg.policyKeys.size,
        tatDaysAvg: avgOrNull(pfAgg.tatValues),
        tatDaysSampleSize: pfAgg.tatValues.length,
      };
    });

    // Distinct linked policies from DB (covers links even if serialize omits some).
    const linkRows: Array<{
      policyCreatorPolicyId: string;
      policyName: string;
      departmentId: string;
      processId: string;
      processCode: string;
      processName: string;
      activityId: string;
    }> = await this.dataSource.query(
      `select distinct l."policyCreatorPolicyId" as "policyCreatorPolicyId",
              l."policyName" as "policyName",
              d.id as "departmentId",
              p.id as "processId",
              p.code as "processCode",
              p."processName" as "processName",
              a.id as "activityId"
         from activity_policy_links l
         join activities a on a.id = l."activityId"
         join processes p on p.id = a."processId"
         join departments d on d.id = p."departmentId"
         where upper(trim(d."companyCode")) = $1`,
      [wanted],
    );
    for (const row of linkRows) {
      const id = String(row.policyCreatorPolicyId ?? '').trim();
      const key = id
        ? `id:${id}`
        : row.policyName
          ? `name:${String(row.policyName).toLowerCase()}`
          : '';
      if (!key) continue;
      policyKeys.add(key);
      const deptId = String(row.departmentId ?? '').trim();
      if (deptId) {
        ensurePfAgg(deptId).policyKeys.add(key);
        addPolicy(
          key,
          String(row.policyName ?? id).trim() || id,
          deptId,
          row.processId
            ? {
                id: String(row.processId),
                code: String(row.processCode ?? ''),
                name: String(row.processName ?? ''),
              }
            : null,
          row.activityId ? String(row.activityId) : null,
          id || null,
        );
      }
    }

    // Refresh per-PF policy counts after DB link merge.
    for (const row of processFunctions) {
      const agg = pfAggByDept.get(row.id);
      row.policies = agg?.policyKeys.size ?? row.policies;
    }

    const jobRoles = [...roleMap.values()]
      .map((r) => ({
        name: r.name,
        taskCount: r.activityIds.size,
        approvalCount: r.approvalIds.size,
        exceptionCount: r.exceptionIds.size,
        departmentIds: [...r.departmentIds],
        departments: [...r.byDepartment.entries()]
          .map(([departmentId, where]) => ({
            departmentId,
            taskCount: where.activityIds.size,
            processCount: where.processes.size,
            exceptionCount: where.exceptionIds.size,
            tatDaysAvg: avgOrNull(where.tatValues),
            raci: {
              R: where.raci.R.size,
              A: where.raci.A.size,
              C: where.raci.C.size,
              I: where.raci.I.size,
              V: where.raci.V.size,
              P: where.raci.P.size,
            },
            processes: [...where.processes.entries()]
              .map(([id, item]) => ({
                id,
                code: item.code,
                name: item.name,
                taskCount: item.activityIds.size,
                approvalCount: item.approvalIds.size,
                exceptionCount: item.exceptionIds.size,
              }))
              .sort(
                (a, b) =>
                  b.taskCount - a.taskCount || a.code.localeCompare(b.code),
              ),
          }))
          .sort((a, b) => b.taskCount - a.taskCount),
        tatDaysAvg: avgOrNull(r.tatValues),
        employees: r.fteValues.length
          ? Math.round(r.fteValues.reduce((a, b) => a + b, 0) * 10) / 10
          : null,
      }))
      .sort(
        (a, b) => b.taskCount - a.taskCount || a.name.localeCompare(b.name),
      );

    return {
      companyCode: wanted,
      processFunctions: processFunctions.length,
      processes: processCount,
      subProcesses: activityCount,
      impactedJobRoles: jobRoles.length,
      approvalSubProcesses: approvalActivityIds.size,
      exceptionSubProcesses: exceptionActivityIds.size,
      policies: policyKeys.size,
      tatDaysAvg: avgOrNull(tatAll),
      tatDaysSampleSize: tatAll.length,
      processFunctionRows: processFunctions.sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
      jobRoles,
      processRows: processRows.sort((a, b) => a.code.localeCompare(b.code)),
      policyRows: [...policyAgg.values()]
        .map((row) => {
          const departments = [...row.byDepartment.entries()]
            .map(([departmentId, where]) => ({
              departmentId,
              subProcessCount: where.activityIds.size,
              processes: [...where.processes.entries()]
                .map(([id, item]) => ({ id, code: item.code, name: item.name }))
                .sort((a, b) => a.code.localeCompare(b.code)),
            }))
            .sort(
              (a, b) =>
                b.processes.length - a.processes.length ||
                b.subProcessCount - a.subProcessCount,
            );
          return {
            name: row.name,
            policyId: row.policyId,
            departments,
            processCount: departments.reduce(
              (sum, d) => sum + d.processes.length,
              0,
            ),
            subProcessCount: departments.reduce(
              (sum, d) => sum + d.subProcessCount,
              0,
            ),
          };
        })
        .sort(
          (a, b) =>
            b.processCount - a.processCount || a.name.localeCompare(b.name),
        ),
      reports: reports.slice(0, 200),
      reportsTotal: reports.length,
    };
  }

  /** Lightweight tree for sidebar explorer — omits heavy activity fields. */
  async findExplorerTree(
    userEmail?: string | null,
    companyCode?: string | null,
  ) {
    const wanted = companyCode?.trim().toUpperCase() ?? '';
    const rows = await this.findAll(userEmail);
    return rows
      .filter((dept) => {
        if (!wanted) return true;
        const deptCc = (dept.companyCode ?? '').trim().toUpperCase();
        if (deptCc === wanted) return true;
        return (dept.processes ?? []).some(
          (proc) => (proc.companyCode ?? '').trim().toUpperCase() === wanted,
        );
      })
      .map((dept) => ({
        id: dept.id,
        name: dept.name,
        code: dept.code,
        companyCode: dept.companyCode,
        orgDepartmentId: dept.orgDepartmentId ?? dept.orgDepartment?.id ?? null,
        orgDepartmentName: dept.orgDepartment?.name ?? null,
        processCodeLevels: dept.processCodeLevels,
        processFunctionOwners: dept.processFunctionOwners,
        createdAt: dept.createdAt,
        processes: (dept.processes ?? [])
          .filter((proc) => {
            if (!wanted) return true;
            const procCc = (proc.companyCode ?? '').trim().toUpperCase();
            const deptCc = (dept.companyCode ?? '').trim().toUpperCase();
            return procCc === wanted || (!procCc && deptCc === wanted);
          })
          .map((proc) => ({
            id: proc.id,
            code: proc.code,
            name: proc.name,
            processName: proc.processName,
            companyCode: proc.companyCode,
            createdAt: proc.createdAt,
            activities: [...(proc.activities ?? [])]
              .sort((a, b) => this.compareActivityDisplayOrder(a, b))
              .map((act) => ({
                id: act.id,
                processId: act.processId,
                parentActivityId: act.parentActivityId ?? null,
                sln: act.sln,
                code: act.code,
                activityName: act.activityName,
                activityDescription: act.activityDescription ?? null,
                createdAt: act.createdAt,
              })),
          })),
      }))
      .filter((dept) => !wanted || (dept.processes?.length ?? 0) > 0);
  }

  /** Full department tree (no access scoping) — for internal mutations. */
  private async loadDepartmentTree(id: string): Promise<Department> {
    const department = await this.departmentRepository.findOne({
      where: { id },
      relations: { processes: { activities: true }, orgDepartment: true },
      order: { processes: { code: 'ASC' } },
    });

    if (!department) {
      throw new NotFoundException('Department not found.');
    }

    return department;
  }

  async findOne(id: string, userEmail?: string | null) {
    const department = await this.loadDepartmentTree(id);
    if (userEmail) {
      const scoped = await this.accessControlService.scopeDepartmentsForUser(
        [department],
        userEmail,
      );
      if (!scoped.length) {
        throw new NotFoundException('Department not found.');
      }
      return this.serializeDepartment(scoped[0]);
    }
    return this.serializeDepartment(department);
  }

  async create(input: CreateDepartmentDto) {
    const code = input.code.trim();
    const name = input.name.trim();
    const companyCode = input.companyCode.trim().toUpperCase();
    const processCodeLevels = this.normalizeProcessCodeLevels(
      input.processCodeLevels,
    );
    this.companiesService.assertValidCompanyCode(companyCode);
    await this.ensureDepartmentCodeUnique(code, companyCode);

    const hanaBranch = this.resolveHanaBranchForCompany(
      companyCode,
      input.hanaBranch,
    );
    await this.assertValidHanaDepartment(
      hanaBranch,
      input.hanaDeptCode,
      input.hanaDepartmentName,
    );
    if (!isBpmCodeCompatibleWithHanaBranch(companyCode, hanaBranch)) {
      throw new BadRequestException(
        'Selected department company does not match the process function company code.',
      );
    }

    if (input.orgDepartmentId) {
      await this.orgDepartmentsService.assertValidOrgDepartmentId(
        input.orgDepartmentId,
      );
    }

    const department = this.departmentRepository.create({
      code,
      name,
      companyCode: companyCode,
      hanaBranch,
      hanaDeptCode: input.hanaDeptCode,
      hanaDepartmentName: input.hanaDepartmentName.trim(),
      orgDepartmentId: input.orgDepartmentId ?? null,
      processCodeLevels,
      processFunctionOwners: input.processFunctionOwners?.length
        ? [...input.processFunctionOwners]
        : [],
    });
    const saved = await this.departmentRepository.save(department);
    return this.serializeDepartment(
      (await this.departmentRepository.findOne({
        where: { id: saved.id },
        relations: { processes: { activities: true }, orgDepartment: true },
      })) ?? saved,
    );
  }

  /**
   * Sets `processOwners` on every process in the department and `owners` on every activity under those processes.
   */
  private async propagateProcessFunctionOwnersToSubtree(
    departmentId: string,
    owners: string[],
  ): Promise<void> {
    const ownerList = [...(owners ?? [])];
    const processes = await this.processRepository.find({
      where: { departmentId },
      relations: { activities: true },
    });
    for (const proc of processes) {
      proc.processOwners = [...ownerList];
      await this.processRepository.save(proc);
      if (proc.activities?.length) {
        for (const act of proc.activities) {
          act.owners = [...ownerList];
        }
        await this.activityRepository.save(proc.activities);
      }
    }
  }

  private async propagateCompanyCodeToProcesses(
    departmentId: string,
    companyCode: CompanyCode,
  ): Promise<void> {
    await this.processRepository.update({ departmentId }, { companyCode });
  }

  async update(
    id: string,
    input: UpdateDepartmentDto,
    requestingUserEmail?: string | null,
  ) {
    if (requestingUserEmail) {
      await this.accessControlService.assertUserCanAccessDepartment(
        requestingUserEmail,
        id,
      );
    }
    const department = await this.loadDepartmentTree(id);
    const code = input.code.trim();
    const name = input.name.trim();

    /**
     * Resolve the target company first so the uniqueness check is scoped to
     * the company the folder will live under after this update (changed or not).
     */
    let targetCompany: CompanyCode = department.companyCode;
    const previousCompany = department.companyCode;
    if (input.companyCode !== undefined) {
      const nextCompany = input.companyCode.trim().toUpperCase();
      this.companiesService.assertValidCompanyCode(nextCompany);
      targetCompany = nextCompany;
      department.companyCode = targetCompany;
    }

    await this.ensureDepartmentCodeUnique(code, targetCompany, id);

    department.code = code;
    department.name = name;

    if (input.processCodeLevels !== undefined) {
      department.processCodeLevels = this.normalizeProcessCodeLevels(
        input.processCodeLevels,
      );
    }

    if (input.orgDepartmentId !== undefined) {
      if (input.orgDepartmentId) {
        await this.orgDepartmentsService.assertValidOrgDepartmentId(
          input.orgDepartmentId,
        );
      }
      department.orgDepartmentId = input.orgDepartmentId || null;
    }

    const hanaFieldsProvided =
      input.hanaBranch !== undefined ||
      input.hanaDeptCode !== undefined ||
      input.hanaDepartmentName !== undefined;

    if (hanaFieldsProvided) {
      const hanaBranch = this.resolveHanaBranchForCompany(
        targetCompany,
        input.hanaBranch ?? department.hanaBranch,
      );
      const hanaDeptCode = input.hanaDeptCode ?? department.hanaDeptCode;
      const hanaDepartmentName =
        input.hanaDepartmentName?.trim() ?? department.hanaDepartmentName ?? '';

      if (!hanaDeptCode || !hanaDepartmentName) {
        throw new BadRequestException(
          'Department (SAP HANA) is required for this process function.',
        );
      }

      await this.assertValidHanaDepartment(
        hanaBranch,
        hanaDeptCode,
        hanaDepartmentName,
      );
      if (!isBpmCodeCompatibleWithHanaBranch(targetCompany, hanaBranch)) {
        throw new BadRequestException(
          'Selected department company does not match the process function company code.',
        );
      }

      department.hanaBranch = hanaBranch;
      department.hanaDeptCode = hanaDeptCode;
      department.hanaDepartmentName = hanaDepartmentName;
    } else if (
      input.companyCode !== undefined &&
      targetCompany !== previousCompany
    ) {
      const hanaBranch = this.resolveHanaBranchForCompany(
        targetCompany,
        department.hanaBranch,
      );
      department.hanaBranch = hanaBranch;
    }

    const shouldPropagateOwners = input.processFunctionOwners !== undefined;
    if (shouldPropagateOwners) {
      department.processFunctionOwners = [
        ...(input.processFunctionOwners ?? []),
      ];
    }

    const saved = await this.departmentRepository.save(department);
    if (shouldPropagateOwners) {
      await this.propagateProcessFunctionOwnersToSubtree(
        id,
        saved.processFunctionOwners ?? [],
      );
    }
    if (input.companyCode !== undefined && targetCompany !== previousCompany) {
      await this.propagateCompanyCodeToProcesses(id, targetCompany);
    }
    const processIds = await this.processRepository.find({
      where: { departmentId: id },
      select: { id: true },
    });
    for (const row of processIds) {
      await this.refreshAutofilledActivityDetailsInProcess(id, row.id);
    }
    return this.findOne(id, requestingUserEmail ?? null);
  }

  async remove(id: string, requestingUserEmail?: string | null) {
    if (requestingUserEmail) {
      await this.accessControlService.assertUserCanAccessDepartment(
        requestingUserEmail,
        id,
      );
    }
    const department = await this.departmentRepository.findOne({
      where: { id },
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found.');
    }

    await this.dataSource.transaction(async (manager) => {
      const processIds = await manager.find(ProcessEntity, {
        where: { departmentId: id },
        select: { id: true },
      });
      const processIdList = processIds.map((p) => p.id);
      if (processIdList.length) {
        const activityIds = await manager.find(ActivityEntity, {
          where: { processId: In(processIdList) },
          select: { id: true },
        });
        const activityIdList = activityIds.map((a) => a.id);
        if (activityIdList.length) {
          await manager.delete(ActivityCommentEntity, {
            activityId: In(activityIdList),
          });
          await manager.delete(ActivityEntity, { id: In(activityIdList) });
        }
        await manager.delete(ProcessEntity, { id: In(processIdList) });
      }
      await manager.delete(Department, { id });
    });

    return { deleted: true as const };
  }

  async createProcess(
    departmentId: string,
    input: CreateProcessDto,
    requestingUserEmail?: string | null,
  ) {
    if (requestingUserEmail) {
      await this.accessControlService.assertUserCanAccessDepartment(
        requestingUserEmail,
        departmentId,
      );
    }
    const department = await this.loadDepartmentTree(departmentId);

    const processName = input.processName.trim();
    if (!processName) {
      throw new BadRequestException('Process name is required.');
    }

    const nextCode = this.getNextProcessCode(
      department.code,
      department.processes,
      this.normalizeProcessCodeLevels(department.processCodeLevels),
    );

    const companyCode = (
      input.companyCode?.trim() || department.companyCode
    ).toUpperCase();
    this.companiesService.assertValidCompanyCode(companyCode);
    if (companyCode !== department.companyCode) {
      throw new BadRequestException(
        'Process company must match the process function company.',
      );
    }

    const process = this.processRepository.create({
      departmentId: department.id,
      processName,
      code: nextCode,
      name: `${nextCode}_${processName}`,
      companyCode: companyCode,
    });

    const saved = await this.processRepository.save(process);

    if (input.activityTemplateId?.trim()) {
      const fromInput = input.processOwners ?? [];
      const fromFolder = department.processFunctionOwners ?? [];
      const ownersForDefine =
        fromInput.length > 0 ? [...fromInput] : [...fromFolder];
      await this.defineProcess(
        departmentId,
        saved.id,
        {
          activityTemplateId: input.activityTemplateId.trim(),
          description: input.description?.trim() ?? '',
          processOwners: ownersForDefine,
          processDescription: input.processDescription?.trim() ?? '',
        },
        requestingUserEmail,
      );
    }

    return this.findProcess(departmentId, saved.id, requestingUserEmail);
  }

  async findProcess(
    departmentId: string,
    processId: string,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    await this.attachRelatedSubProcesses(process);
    await this.attachRelatedPolicies(process);
    return this.toClientProcessPayload(process);
  }

  private async attachRelatedPolicies(process: ProcessEntity): Promise<void> {
    const activities = process.activities ?? [];
    if (!activities.length) {
      return;
    }
    const activityIds = activities.map((item) => item.id);
    const activityIdSet = new Set(activityIds);

    const links = await this.activityPolicyLinkRepository.find({
      where: { activityId: In(activityIds) },
      order: { linkedAt: 'DESC' },
    });

    const byActivity = buildRelatedPolicyMap(links, activityIdSet);
    for (const activity of activities) {
      (
        activity as ActivityEntity & {
          relatedPolicies?: RelatedPolicySummary[];
        }
      ).relatedPolicies = byActivity.get(activity.id) ?? [];
    }
  }

  private async attachRelatedSubProcesses(
    process: ProcessEntity,
  ): Promise<void> {
    const activities = process.activities ?? [];
    if (!activities.length) {
      return;
    }
    const activityIds = activities.map((item) => item.id);
    const activityIdSet = new Set(activityIds);

    const relations = await this.activityRelationRepository
      .createQueryBuilder('rel')
      .where('rel.sourceActivityId IN (:...activityIds)', { activityIds })
      .orWhere('rel.targetActivityId IN (:...activityIds)', { activityIds })
      .getMany();
    if (!relations.length) {
      for (const activity of activities) {
        (
          activity as ActivityEntity & {
            relatedSubProcesses?: RelatedSubProcessSummary[];
          }
        ).relatedSubProcesses = [];
      }
      return;
    }

    const linkedIds = new Set<string>();
    for (const rel of relations) {
      linkedIds.add(rel.sourceActivityId);
      linkedIds.add(rel.targetActivityId);
    }

    const linkedRows = await this.activityRepository.find({
      where: { id: In([...linkedIds]) },
      relations: { process: { department: true } },
    });

    const summariesById = new Map<string, RelatedSubProcessSummary>();
    for (const row of linkedRows) {
      const summary = toRelatedSubProcessSummary(row);
      if (summary) {
        summariesById.set(row.id, summary);
      }
    }

    const byActivity = buildRelatedSubProcessMap(
      relations,
      activityIdSet,
      summariesById,
    );

    for (const activity of activities) {
      (
        activity as ActivityEntity & {
          relatedSubProcesses?: RelatedSubProcessSummary[];
        }
      ).relatedSubProcesses = byActivity.get(activity.id) ?? [];
    }
  }

  async addActivityRelation(
    departmentId: string,
    processId: string,
    activityId: string,
    input: AddActivityRelationDto,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const source = process.activities.find((item) => item.id === activityId);
    if (!source) {
      throw new NotFoundException('Sub-process not found in this process.');
    }

    const targetProcess = await this.loadProcessEntity(
      input.targetDepartmentId,
      input.targetProcessId,
      requestingUserEmail,
    );
    const target = targetProcess.activities.find(
      (item) => item.id === input.targetActivityId,
    );
    if (!target) {
      throw new NotFoundException(
        'Related sub-process not found in the selected process.',
      );
    }

    if (source.id === target.id) {
      throw new BadRequestException('A sub-process cannot link to itself.');
    }

    // Exact company entity (FZCO ≠ FZCO-V1) — not HANA-branch family match.
    const sourceCompany = (process.companyCode ?? '').trim().toUpperCase();
    const targetCompany = (targetProcess.companyCode ?? '')
      .trim()
      .toUpperCase();
    if (!sourceCompany || !targetCompany || sourceCompany !== targetCompany) {
      throw new BadRequestException(
        'Sub-processes can only be linked within the same company entity.',
      );
    }

    const existing = await this.activityRelationRepository.findOne({
      where: [
        { sourceActivityId: source.id, targetActivityId: target.id },
        { sourceActivityId: target.id, targetActivityId: source.id },
      ],
    });
    if (!existing) {
      await this.activityRelationRepository.save({
        sourceActivityId: source.id,
        targetActivityId: target.id,
      });
    }

    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  async addActivityPolicyLink(
    departmentId: string,
    processId: string,
    activityId: string,
    input: AddActivityPolicyLinkDto,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const activity = process.activities.find((item) => item.id === activityId);
    if (!activity) {
      throw new NotFoundException('Sub-process not found in this process.');
    }

    const policyCreatorPolicyId = input.policyCreatorPolicyId.trim();
    const policyName = input.policyName.trim();
    if (!policyName) {
      throw new BadRequestException('Policy name is required.');
    }

    const existing = await this.activityPolicyLinkRepository.findOne({
      where: { activityId: activity.id, policyCreatorPolicyId },
    });

    const payload: Partial<ActivityPolicyLinkEntity> = {
      activityId: activity.id,
      policyCreatorPolicyId,
      policyName,
      policyVersion: input.policyVersion ?? null,
      companyCode: input.companyCode?.trim() || null,
      companyName: input.companyName?.trim() || null,
      departmentName: input.departmentName?.trim() || null,
      processCode: input.processCode?.trim() || process.code || null,
      processName: input.processName?.trim() || process.processName || null,
      activityCode: input.activityCode?.trim() || activity.code || null,
      policyCreatorUrl:
        input.policyCreatorUrl?.trim() ||
        defaultPolicyCreatorUrl(policyCreatorPolicyId),
      linkedBy: requestingUserEmail?.trim() || null,
    };

    if (existing) {
      await this.activityPolicyLinkRepository.save({
        ...existing,
        ...payload,
      });
    } else {
      await this.activityPolicyLinkRepository.save(payload);
    }

    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  async removeActivityPolicyLink(
    departmentId: string,
    processId: string,
    activityId: string,
    policyLinkId: string,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const activity = process.activities.find((item) => item.id === activityId);
    if (!activity) {
      throw new NotFoundException('Sub-process not found in this process.');
    }

    const link = await this.activityPolicyLinkRepository.findOne({
      where: { id: policyLinkId, activityId: activity.id },
    });
    if (!link) {
      throw new NotFoundException('Policy link not found on this sub-process.');
    }

    await this.activityPolicyLinkRepository.delete({ id: link.id });
    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  async removeActivityRelation(
    departmentId: string,
    processId: string,
    activityId: string,
    targetActivityId: string,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const source = process.activities.find((item) => item.id === activityId);
    if (!source) {
      throw new NotFoundException('Sub-process not found in this process.');
    }

    await this.activityRelationRepository
      .createQueryBuilder()
      .delete()
      .where(
        '(sourceActivityId = :source AND targetActivityId = :target) OR (sourceActivityId = :target AND targetActivityId = :source)',
        { source: source.id, target: targetActivityId },
      )
      .execute();

    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  /** Raw TypeORM graph — may contain circular parent refs; use only inside this service before save/update. */
  private async loadProcessEntity(
    departmentId: string,
    processId: string,
    requestingUserEmail?: string | null,
  ): Promise<ProcessEntity> {
    const process = await this.processRepository.findOne({
      where: { id: processId, departmentId },
      relations: { activities: { comments: { attachments: true } } },
      order: { activities: { createdAt: 'ASC' } },
    });

    if (!process) {
      throw new NotFoundException('Process not found in this department.');
    }

    if (requestingUserEmail) {
      await this.accessControlService.assertUserCanAccessProcess(
        requestingUserEmail,
        departmentId,
        processId,
      );
    }

    return process;
  }

  /**
   * Strip inverse relations and break any remaining cycles so Express JSON serialization never throws.
   */
  private toClientProcessPayload(processEntity: ProcessEntity): ProcessEntity {
    const seen = new WeakSet<object>();
    const scrub = (value: unknown): unknown => {
      if (value === null || typeof value !== 'object') {
        return value;
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
        return undefined;
      }
      if (seen.has(value)) {
        return undefined;
      }
      seen.add(value);
      if (Array.isArray(value)) {
        return value.map((item) => scrub(item)).filter((x) => x !== undefined);
      }
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(record)) {
        if (
          key === 'process' ||
          key === 'department' ||
          key === 'parent' ||
          key === 'children' ||
          key === 'activity' ||
          key === 'comment'
        ) {
          continue;
        }
        const next = scrub(val);
        if (next !== undefined) {
          out[key] = next;
        }
      }
      return out;
    };
    return scrub(processEntity) as ProcessEntity;
  }

  async findProcessTemplate(
    departmentId: string,
    processId: string,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.findProcess(
      departmentId,
      processId,
      requestingUserEmail,
    );
    if (!process.activityTemplateId) {
      throw new NotFoundException('Process template is not defined.');
    }

    const template = await this.activityTemplateRepository.findOne({
      where: { id: process.activityTemplateId },
    });

    if (!template) {
      throw new NotFoundException('Sub-process template not found.');
    }

    return template;
  }

  async createActivity(
    departmentId: string,
    processId: string,
    input: CreateActivityDto,
    requestingUserEmail?: string | null,
    importOptions?: { lenientFixedFields?: boolean },
  ) {
    const process = await this.findProcess(
      departmentId,
      processId,
      requestingUserEmail,
    );

    if (!process.activityTemplateId) {
      throw new BadRequestException(
        'Please define process template before adding sub-processes.',
      );
    }

    const template = await this.activityTemplateRepository.findOne({
      where: { id: process.activityTemplateId },
    });
    if (!template) {
      throw new NotFoundException('Sub-process template not found.');
    }

    if (input.details) {
      input = {
        ...input,
        details: await this.enforceFixedDetailValues(
          template.fields,
          input.details as Record<string, string | string[]>,
          null,
          importOptions?.lenientFixedFields === true,
        ),
      };
    }

    /**
     * Activity name is optional: many templates don't expose an embedded `activity_name` field.
     * Fall back to the first non-empty detail value, then to a deterministic placeholder so
     * downstream code (UI badges, exports) always has something to render.
     */
    const explicitName = String(input.activityName ?? '').trim();
    let activityName = explicitName;

    const parentId = input.parentActivityId?.trim();
    const parentActivity = parentId
      ? (process.activities.find((item) => item.id === parentId) ?? null)
      : null;
    if (parentId && !parentActivity) {
      throw new NotFoundException(
        'Parent sub-process not found in this process.',
      );
    }

    const currentMaxSln = process.activities.reduce(
      (max, item) => Math.max(max, item.sln),
      0,
    );
    const nextSln = currentMaxSln + 1;

    const detailsEntries = Object.entries(input.details ?? {});
    const readDetailValueByAliases = (aliases: string[]): string => {
      for (const [k, v] of detailsEntries) {
        const normalized = k
          .trim()
          .toLowerCase()
          .replace(/[\s._-]+/g, '');
        if (aliases.includes(normalized)) {
          return String(v ?? '').trim();
        }
      }
      return '';
    };
    const providedCodeRaw =
      readDetailValueByAliases(['activityid', 'activity_id', 'activity id']) ||
      readDetailValueByAliases([
        'processid',
        'process_id',
        'process id',
        'processid',
      ]) ||
      readDetailValueByAliases(['sino', 'si_no', 'si.no', 'si no']) ||
      '';
    const normalizedProvidedCode = String(providedCodeRaw).trim();
    let activityCode: string;
    /** Sub Sub-process rows always extend the parent code; ignore pasted/template IDs so numbering stays deterministic. */
    if (parentActivity) {
      const siblings = process.activities.filter(
        (item) => item.parentActivityId === parentActivity.id,
      );
      activityCode = computeNextChildActivityCode(
        parentActivity.code,
        siblings.map((s) => s.code),
      );
    } else if (normalizedProvidedCode) {
      const remapped = remapPastedActivityCodeToProcess(
        process.code,
        normalizedProvidedCode,
      );
      activityCode =
        remapped ||
        computeNextRootActivityCode(
          process.code,
          process.activities
            .filter((item) => !item.parentActivityId)
            .map((s) => s.code),
        );
    } else {
      const rootSiblings = process.activities.filter(
        (item) => !item.parentActivityId,
      );
      activityCode = computeNextRootActivityCode(
        process.code,
        rootSiblings.map((s) => s.code),
      );
    }

    /**
     * Root sub-process from grid import: Excel often repeats the parent process code (-…-000) or IDs from the parent branch.
     * Those collide within this process or match the process row code — regenerate instead of failing the sheet.
     */
    const rootSiblingCodes = process.activities
      .filter((item) => !item.parentActivityId)
      .map((s) => s.code);

    if (!parentActivity) {
      const duplicateActivityCode = await this.activityRepository.findOne({
        where: { code: activityCode, processId: process.id },
        select: { id: true },
      });
      const processRowWithSameCode = await this.processRepository.findOne({
        where: { code: activityCode, departmentId },
        select: { id: true },
      });
      const stealsAnotherProcessCode =
        processRowWithSameCode !== null &&
        processRowWithSameCode.id !== process.id;
      const equalsCurrentProcessCode =
        !!process.code?.trim() && activityCode.trim() === process.code.trim();

      if (
        duplicateActivityCode ||
        stealsAnotherProcessCode ||
        equalsCurrentProcessCode
      ) {
        activityCode = computeNextRootActivityCode(
          process.code,
          rootSiblingCodes,
        );
      }
    }

    const existingActivity = await this.activityRepository.findOne({
      where: { code: activityCode, processId: process.id },
      select: { id: true },
    });
    if (existingActivity) {
      throw new ConflictException(
        `Sub-process code already exists in this process: ${activityCode}`,
      );
    }

    const departmentRow = await this.departmentRepository.findOne({
      where: { id: departmentId },
      select: { name: true },
    });
    if (!departmentRow) {
      throw new NotFoundException('Department not found.');
    }

    const templateFieldKeys = new Set(template.fields.map((f) => f.key));
    const activitiesById = new Map(process.activities.map((a) => [a.id, a]));
    const ancestorSubProcessNames = collectAncestorSubProcessNames(
      parentActivity,
      activitiesById,
    );

    /**
     * Templates that don't expose an embedded `activity_name` field still need a row label.
     * Pick the first non-empty string detail value, otherwise fall back to the activity code so
     * UI rows, exports, and breadcrumbs render something meaningful.
     */
    if (!activityName) {
      const firstDetailValue = Object.values(input.details ?? {})
        .map((value) =>
          Array.isArray(value) ? value.join(', ') : String(value ?? ''),
        )
        .map((value) => value.trim())
        .find((value) => value.length > 0);
      activityName = firstDetailValue || activityCode;
    }

    const mergedDetails = applyHierarchyCodeToMatchingDetailFields(
      template.fields,
      applyAutofillActivityDetailFields(
        templateFieldKeys,
        { ...(input.details ?? {}) },
        {
          siNo: nextSln,
          departmentName: departmentRow.name,
          processName: process.processName,
          activityName,
          ancestorSubProcessNames,
        },
      ),
      activityCode,
    );

    const activity = this.activityRepository.create({
      processId: process.id,
      parentActivityId: parentActivity?.id ?? null,
      sln: nextSln,
      code: activityCode,
      templateId: process.activityTemplateId,
      templateName: process.activityTemplateName,
      activityName,
      details: mergedDetails,
      fieldDiscussion: input.fieldDiscussion ?? {},
      activityDescription: input.activityDescription?.trim() || null,
      owners:
        input.owners !== undefined && input.owners.length > 0
          ? input.owners
          : [...(process.processOwners ?? [])],
      status: input.status || 'Draft',
      discussionEnabled: input.discussionEnabled ?? false,
    });

    return this.activityRepository.save(activity);
  }

  async updateActivity(
    departmentId: string,
    processId: string,
    activityId: string,
    input: UpdateActivityDto,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const activity = process.activities.find((item) => item.id === activityId);
    if (!activity) {
      throw new NotFoundException('Sub-process not found in this process.');
    }

    if (input.activityName !== undefined) {
      const nextName = input.activityName.trim();
      if (!nextName) {
        throw new BadRequestException('Sub-process name is required.');
      }
      activity.activityName = nextName;
    }

    if (input.activityDescription !== undefined) {
      activity.activityDescription = input.activityDescription.trim() || null;
    }

    if (input.status !== undefined) {
      activity.status = input.status.trim() || 'Draft';
    }

    if (input.owners !== undefined) {
      activity.owners = input.owners;
    }

    const templateForAutofill = process.activityTemplateId
      ? await this.activityTemplateRepository.findOne({
          where: { id: process.activityTemplateId },
        })
      : null;
    const autofillKeys = new Set(
      templateForAutofill?.fields.map((f) => f.key) ?? [],
    );
    const mergedDetails =
      input.details !== undefined
        ? { ...activity.details, ...input.details }
        : { ...activity.details };
    if (input.details !== undefined && templateForAutofill?.fields?.length) {
      Object.assign(
        mergedDetails,
        await this.enforceFixedDetailValues(
          templateForAutofill.fields,
          mergedDetails as Record<string, string | string[]>,
          activity.details as Record<string, unknown>,
        ),
      );
    }

    let nextDetails: Record<string, string | string[]> = { ...mergedDetails };
    if (autofillKeys.has('si_no') || autofillKeys.has('activity_id')) {
      const departmentRow = await this.departmentRepository.findOne({
        where: { id: departmentId },
        select: { name: true },
      });
      const activitiesById = new Map(process.activities.map((a) => [a.id, a]));
      const parentEntity =
        activity.parentActivityId != null
          ? (activitiesById.get(activity.parentActivityId) ?? null)
          : null;
      const ancestorSubProcessNames = collectAncestorSubProcessNames(
        parentEntity,
        activitiesById,
      );
      nextDetails = applyAutofillActivityDetailFields(
        autofillKeys,
        nextDetails,
        {
          siNo: activity.sln,
          departmentName: departmentRow?.name ?? '',
          processName: process.processName,
          activityName: activity.activityName,
          ancestorSubProcessNames,
        },
      );
    }
    if (templateForAutofill?.fields?.length) {
      nextDetails = applyHierarchyCodeToMatchingDetailFields(
        templateForAutofill.fields,
        nextDetails,
        activity.code,
      );
    }
    activity.details = nextDetails;

    if (input.fieldDiscussion !== undefined) {
      activity.fieldDiscussion = input.fieldDiscussion;
    }

    if (input.discussionEnabled !== undefined) {
      activity.discussionEnabled = input.discussionEnabled;
    }

    await this.activityRepository.save(activity);
    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  /**
   * Returns the lowercased email used as the vendor key + the friendly default name
   * derived from the user record. Validates that the caller is a real, enabled user.
   */
  private async resolveVendorIdentity(
    requestingUserEmail: string | null | undefined,
    fallbackVendorName?: string,
  ): Promise<{ vendorKey: string; defaultVendorName: string }> {
    const email = normalizeEmail(requestingUserEmail);
    if (!email) {
      throw new ForbiddenException('Sign in to upload a vendor version.');
    }
    const user = await findAccessUserByEmail(this.accessUserRepository, email, {
      relations: { role: true },
    });
    if (!user || user.enabled === false || user.role?.enabled === false) {
      throw new ForbiddenException('Vendor account is disabled.');
    }
    const fallback =
      fallbackVendorName?.trim() || user.displayName?.trim() || email;
    return { vendorKey: email, defaultVendorName: fallback };
  }

  /**
   * Coalesces a partial details patch onto the existing vendor overlay.
   * - undefined values keep the previous overlay entry intact.
   * - null clears a single key from the overlay.
   * - empty string/array clears the overlay value for that key (vendor explicitly emptied it).
   */
  private mergeVendorDetails(
    previous: Record<string, string | string[]> | undefined,
    patch: Record<string, string | string[] | null> | undefined,
  ): Record<string, string | string[]> {
    const next: Record<string, string | string[]> = { ...(previous ?? {}) };
    if (!patch) {
      return next;
    }
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete next[key];
        continue;
      }
      if (value === undefined) {
        continue;
      }
      next[key] = value;
    }
    return next;
  }

  /** Inline edit on one Sub-process for the caller's vendor overlay. */
  async updateActivityVendorVersion(
    departmentId: string,
    processId: string,
    activityId: string,
    input: UpsertActivityVendorVersionDto,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const activity = process.activities.find((item) => item.id === activityId);
    if (!activity) {
      throw new NotFoundException('Sub-process not found in this process.');
    }

    const { vendorKey, defaultVendorName } = await this.resolveVendorIdentity(
      requestingUserEmail,
      input.vendorName,
    );

    const previousOverlay = activity.vendorVersions?.[vendorKey];
    const mergedDetails = this.mergeVendorDetails(
      previousOverlay?.details,
      input.details,
    );

    const nextOverlay = {
      vendorName:
        input.vendorName?.trim() ||
        previousOverlay?.vendorName ||
        defaultVendorName,
      submittedBy: vendorKey,
      updatedAt: new Date().toISOString(),
      activityName:
        input.activityName !== undefined
          ? input.activityName.trim() || null
          : (previousOverlay?.activityName ?? null),
      activityDescription:
        input.activityDescription !== undefined
          ? input.activityDescription.trim() || null
          : (previousOverlay?.activityDescription ?? null),
      details: mergedDetails,
    };

    activity.vendorVersions = {
      ...(activity.vendorVersions ?? {}),
      [vendorKey]: nextOverlay,
    };

    await this.activityRepository.save(activity);
    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  /**
   * Bulk upload of the caller's vendor overlay for one process.
   * Rows are matched by `activityCode` against existing Sub-processes.
   * Sub-processes that aren't listed keep their previous overlay for this vendor.
   */
  async uploadProcessVendorVersion(
    departmentId: string,
    processId: string,
    input: BulkVendorVersionDto,
    requestingUserEmail?: string | null,
  ) {
    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      throw new BadRequestException(
        'Provide at least one row keyed by activityCode.',
      );
    }
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const { vendorKey, defaultVendorName } = await this.resolveVendorIdentity(
      requestingUserEmail,
      input.vendorName,
    );

    const activitiesByCode = new Map<string, ActivityEntity>();
    for (const activity of process.activities) {
      activitiesByCode.set(String(activity.code), activity);
    }

    const unknownCodes: string[] = [];
    const touched: ActivityEntity[] = [];

    for (const row of input.rows) {
      const code = String(row.activityCode ?? '').trim();
      if (!code) {
        continue;
      }
      const activity = activitiesByCode.get(code);
      if (!activity) {
        unknownCodes.push(code);
        continue;
      }
      const prev = activity.vendorVersions?.[vendorKey];
      const overlay = {
        vendorName:
          input.vendorName?.trim() || prev?.vendorName || defaultVendorName,
        submittedBy: vendorKey,
        updatedAt: new Date().toISOString(),
        activityName:
          row.activityName !== undefined
            ? row.activityName.trim() || null
            : (prev?.activityName ?? null),
        activityDescription:
          row.activityDescription !== undefined
            ? row.activityDescription.trim() || null
            : (prev?.activityDescription ?? null),
        details: this.mergeVendorDetails(prev?.details, row.details),
      };
      activity.vendorVersions = {
        ...(activity.vendorVersions ?? {}),
        [vendorKey]: overlay,
      };
      touched.push(activity);
    }

    if (touched.length === 0) {
      throw new BadRequestException(
        unknownCodes.length
          ? `None of the supplied activity codes match this process. Unknown codes: ${unknownCodes.slice(0, 5).join(', ')}`
          : 'No rows applied to this process.',
      );
    }

    await this.activityRepository.save(touched);
    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  async removeActivity(
    departmentId: string,
    processId: string,
    activityId: string,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const target = process.activities.find((item) => item.id === activityId);
    if (!target) {
      throw new NotFoundException('Sub-process not found in this process.');
    }

    const deletedCode = target.code;

    const toDeleteIds = new Set<string>();
    const collect = (parentId: string) => {
      toDeleteIds.add(parentId);
      for (const row of process.activities) {
        if (row.parentActivityId === parentId) {
          collect(row.id);
        }
      }
    };
    collect(target.id);
    // Also remove deeper codes that extend this Activity ID (4-level sheets often
    // leave parentActivityId null while encoding hierarchy in the code itself).
    const codePrefix = `${deletedCode.trim()}-`;
    for (const row of process.activities) {
      if (row.code?.trim().startsWith(codePrefix)) {
        toDeleteIds.add(row.id);
      }
    }
    const ids = Array.from(toDeleteIds);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ActivityCommentEntity, { activityId: In(ids) });
      await manager.delete(ActivityEntity, { id: In(ids) });

      const remaining = await manager.find(ActivityEntity, {
        where: { processId: process.id },
      });
      const renames = planStemActivityCodeRenumber({
        deletedCode,
        remaining: remaining.map((row) => ({
          id: row.id,
          code: row.code,
          sln: row.sln,
        })),
      });
      if (!renames.length) {
        return;
      }

      const byId = new Map(remaining.map((row) => [row.id, row]));
      const template = process.activityTemplateId
        ? await manager.findOne(ActivityTemplateEntity, {
            where: { id: process.activityTemplateId },
          })
        : null;
      const templateFields = template?.fields ?? [];

      // Unique (processId, code): move to temps first, then final codes.
      for (const rename of renames) {
        const row = byId.get(rename.activityId);
        if (!row) continue;
        row.code = `~tmp-${row.id.replace(/-/g, '').slice(0, 20)}`;
      }
      await manager.save(
        ActivityEntity,
        [...byId.values()].filter((row) =>
          renames.some((r) => r.activityId === row.id),
        ),
      );

      for (const rename of renames) {
        const row = byId.get(rename.activityId);
        if (!row) continue;
        row.code = rename.newCode;
        if (templateFields.length) {
          row.details = applyHierarchyCodeToMatchingDetailFields(
            templateFields,
            { ...(row.details ?? {}) },
            rename.newCode,
          );
          const vendorVersions = { ...(row.vendorVersions ?? {}) };
          for (const [vendorKey, overlay] of Object.entries(vendorVersions)) {
            if (!overlay?.details) continue;
            vendorVersions[vendorKey] = {
              ...overlay,
              details: applyHierarchyCodeToMatchingDetailFields(
                templateFields,
                { ...overlay.details },
                rename.newCode,
              ),
            };
          }
          row.vendorVersions = vendorVersions;
        }
      }
      await manager.save(
        ActivityEntity,
        [...byId.values()].filter((row) =>
          renames.some((r) => r.activityId === row.id),
        ),
      );

      for (const rename of renames) {
        await manager.update(
          ActivityPolicyLinkEntity,
          { activityId: rename.activityId },
          { activityCode: rename.newCode },
        );
      }
    });
    return { deleted: true as const };
  }

  private async resolveCommentAuthorLabel(
    requestingUserEmail?: string | null,
  ): Promise<string> {
    const normalizedUser = requestingUserEmail?.trim().toLowerCase();
    if (!normalizedUser) {
      throw new BadRequestException('Missing authenticated user for comment.');
    }
    /**
     * Use the query builder so we never trigger eager `role` loading. With `findOne` + `select`,
     * TypeORM emits `SELECT DISTINCT distinctAlias.AccessUserEntity_id` even when `id` is not selected,
     * which fails on Postgres (`column distinctAlias.AccessUserEntity_id does not exist`).
     */
    const row = await this.accessUserRepository
      .createQueryBuilder('user')
      .select('user.displayName', 'displayName')
      .where('user.email = :email', { email: normalizedUser })
      .getRawOne<{ displayName: string | null }>();
    const display = row?.displayName?.trim() ?? '';
    return display || normalizedUser;
  }

  async addActivityComment(
    departmentId: string,
    processId: string,
    activityId: string,
    input: AddActivityCommentDto,
    attachments: Array<{
      buffer: Buffer;
      originalname?: string;
      mimetype?: string;
    }>,
    requestingUserEmail?: string | null,
  ) {
    const loadedProcess = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const activity = loadedProcess.activities.find(
      (item) => item.id === activityId,
    );

    if (!activity) {
      throw new NotFoundException('Sub-process not found in this process.');
    }

    const authorLabel =
      await this.resolveCommentAuthorLabel(requestingUserEmail);

    const messageText =
      typeof input.message === 'string' ? input.message.trim() : '';
    if (!messageText) {
      throw new BadRequestException('Comment message is required.');
    }

    const comment = this.activityCommentRepository.create({
      activityId: activity.id,
      author: authorLabel,
      message: messageText,
      attachmentOriginalName: null,
      attachmentMimeType: null,
      attachmentStoredPath: null,
    });

    const validAttachments = (attachments ?? []).filter(
      (item) => !!item?.buffer?.length,
    );
    let firstSavedAttachment: {
      storedPath: string;
      originalName: string;
      storedFileName: string;
      mimeType: string | null;
    } | null = null;
    if (validAttachments.length) {
      const first = validAttachments[0];
      const savedFirst = await this.saveCommentAttachment(
        first.buffer,
        activity.code,
        first.originalname,
      );
      firstSavedAttachment = {
        ...savedFirst,
        mimeType: first.mimetype?.trim() || null,
      };
      comment.attachmentOriginalName = savedFirst.originalName;
      comment.attachmentMimeType = firstSavedAttachment.mimeType;
      comment.attachmentStoredPath = savedFirst.storedPath;
    }

    const savedComment = await this.activityCommentRepository.save(comment);
    if (validAttachments.length) {
      const rows: ActivityCommentAttachmentEntity[] = [];
      for (let index = 0; index < validAttachments.length; index += 1) {
        const item = validAttachments[index];
        const saved =
          index === 0 && firstSavedAttachment
            ? firstSavedAttachment
            : await this.saveCommentAttachment(
                item.buffer,
                activity.code,
                item.originalname,
              );
        rows.push(
          this.activityCommentAttachmentRepository.create({
            commentId: savedComment.id,
            originalName: saved.originalName,
            mimeType:
              index === 0 && firstSavedAttachment
                ? firstSavedAttachment.mimeType
                : item.mimetype?.trim() || null,
            storedPath: saved.storedPath,
            storedFileName: saved.storedFileName,
            subProcessCode: activity.code,
          }),
        );
      }
      await this.activityCommentAttachmentRepository.save(rows);
    }
    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  async updateActivityComment(
    departmentId: string,
    processId: string,
    activityId: string,
    commentId: string,
    input: UpdateActivityCommentDto,
    requestingUserEmail?: string | null,
  ) {
    await this.loadProcessEntity(departmentId, processId, requestingUserEmail);
    const comment = await this.activityCommentRepository.findOne({
      where: { id: commentId, activityId },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }
    const authorLabel =
      await this.resolveCommentAuthorLabel(requestingUserEmail);
    if (
      comment.author.trim().toLowerCase() !== authorLabel.trim().toLowerCase()
    ) {
      throw new ForbiddenException('You can only edit your own comments.');
    }
    comment.message = input.message.trim();
    await this.activityCommentRepository.save(comment);
    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  async deleteActivityComment(
    departmentId: string,
    processId: string,
    activityId: string,
    commentId: string,
    requestingUserEmail?: string | null,
  ) {
    await this.loadProcessEntity(departmentId, processId, requestingUserEmail);
    const comment = await this.activityCommentRepository.findOne({
      where: { id: commentId, activityId },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }
    const authorLabel =
      await this.resolveCommentAuthorLabel(requestingUserEmail);
    if (
      comment.author.trim().toLowerCase() !== authorLabel.trim().toLowerCase()
    ) {
      throw new ForbiddenException('You can only delete your own comments.');
    }
    await this.activityCommentRepository.remove(comment);
    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  async getActivityCommentAttachment(
    departmentId: string,
    processId: string,
    activityId: string,
    commentId: string,
    requestingUserEmail?: string | null,
  ): Promise<{
    filePath: string;
    fileName: string;
    mimeType: string;
  }> {
    await this.loadProcessEntity(departmentId, processId, requestingUserEmail);
    const comment = await this.activityCommentRepository.findOne({
      where: { id: commentId, activityId },
      select: {
        id: true,
        attachmentOriginalName: true,
        attachmentMimeType: true,
        attachmentStoredPath: true,
      },
    });
    if (!comment || !comment.attachmentStoredPath) {
      throw new NotFoundException('Comment attachment not found.');
    }
    const absolute = comment.attachmentStoredPath.startsWith('/docx/BPM-Files/')
      ? path.resolve(
          process.cwd(),
          comment.attachmentStoredPath.replace(/^\/+/, ''),
        )
      : path.resolve(comment.attachmentStoredPath);
    try {
      await fs.access(absolute);
    } catch {
      throw new NotFoundException('Attachment file is missing.');
    }
    return {
      filePath: absolute,
      fileName: comment.attachmentOriginalName || 'comment-attachment',
      mimeType: comment.attachmentMimeType || 'application/octet-stream',
    };
  }

  async listUploadedAttachments(requestingUserEmail?: string | null) {
    if (!requestingUserEmail) {
      throw new BadRequestException('Missing authenticated user.');
    }
    const user = await findAccessUserByEmail(
      this.accessUserRepository,
      requestingUserEmail,
    );
    if (!user?.fullAccess) {
      throw new NotFoundException(
        'Attachments list is available for administrators only.',
      );
    }
    const loadRows = () =>
      this.activityCommentAttachmentRepository.find({
        relations: { comment: { activity: { process: { department: true } } } },
        order: { createdAt: 'DESC' },
        take: 2000,
      });

    let rows = await loadRows();

    // Backfill legacy single-attachment columns from activity_comments into the new attachments table.
    // This makes the new Administration → Attachments page immediately useful after deployment.
    if (!rows.length) {
      const legacyComments = await this.activityCommentRepository
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.activity', 'a')
        .where('c."attachmentStoredPath" IS NOT NULL')
        .andWhere('c."attachmentStoredPath" <> \'\'')
        .select([
          'c.id',
          'c.author',
          'c.attachmentOriginalName',
          'c.attachmentMimeType',
          'c.attachmentStoredPath',
          'c.createdAt',
          'a.id',
          'a.code',
        ])
        .orderBy('c."createdAt"', 'DESC')
        .limit(4000)
        .getMany();

      if (legacyComments.length) {
        const toInsert: ActivityCommentAttachmentEntity[] = [];
        for (const comment of legacyComments) {
          const storedPath = String(comment.attachmentStoredPath ?? '').trim();
          if (!storedPath) continue;
          const storedFileName =
            storedPath.replace(/\\/g, '/').split('/').pop()?.trim() ||
            'attachment';
          const subProcessCode = comment.activity?.code || 'unknown';
          toInsert.push(
            this.activityCommentAttachmentRepository.create({
              commentId: comment.id,
              originalName: comment.attachmentOriginalName || storedFileName,
              mimeType: comment.attachmentMimeType || null,
              storedPath,
              storedFileName,
              subProcessCode,
            }),
          );
        }
        if (toInsert.length) {
          await this.activityCommentAttachmentRepository.save(toInsert);
        }
        rows = await loadRows();
      }
    }

    return rows.map((row) => ({
      id: row.id,
      subProcessCode: row.subProcessCode,
      folderName: row.subProcessCode,
      originalName: row.originalName,
      storedFileName: row.storedFileName,
      storedPath: row.storedPath,
      downloadUrl: row.storedPath.startsWith('/docx/BPM-Files/')
        ? row.storedPath
        : null,
      uploadedBy: row.comment?.author ?? '-',
      createdAt: row.createdAt,
      processCode: row.comment?.activity?.process?.code ?? '-',
      processName: row.comment?.activity?.process?.processName ?? '-',
      departmentCode: row.comment?.activity?.process?.department?.code ?? '-',
    }));
  }

  private async saveCommentAttachment(
    fileBuffer: Buffer,
    activityCode: string,
    originalName?: string,
  ): Promise<{
    storedPath: string;
    originalName: string;
    storedFileName: string;
  }> {
    const safeActivityCode = (activityCode || 'activity')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120);
    const safeName = (originalName || 'attachment.bin')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120);
    const storedName = `${safeActivityCode}-${Date.now()}-${randomUUID()}-${safeName}`;
    const candidateDirs = [
      path.resolve(
        process.cwd(),
        'docx',
        'BPM-Files',
        'comment-attachments',
        safeActivityCode,
      ),
      path.resolve(tmpdir(), 'bpm-comment-attachments'),
    ];
    const publicRoot = path.resolve(process.cwd(), 'docx', 'BPM-Files');
    for (const dir of candidateDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        const storedPath = path.join(dir, storedName);
        await fs.writeFile(storedPath, fileBuffer);
        const relativePublic = path
          .relative(publicRoot, storedPath)
          .replace(/\\/g, '/');
        const pathForDb =
          !relativePublic.startsWith('..') && !path.isAbsolute(relativePublic)
            ? `/docx/BPM-Files/${relativePublic}`
            : storedPath;
        return {
          storedPath: pathForDb,
          originalName: originalName?.trim() || safeName,
          storedFileName: storedName,
        };
      } catch {
        // try next candidate directory
      }
    }
    throw new BadRequestException(
      'Could not store attachment file on server. Check write permissions.',
    );
  }

  async updateProcess(
    departmentId: string,
    processId: string,
    input: UpdateProcessDto,
    requestingUserEmail?: string | null,
  ) {
    const department = await this.loadDepartmentTree(departmentId);

    const process = await this.processRepository.findOne({
      where: { id: processId, departmentId },
    });

    if (!process) {
      throw new NotFoundException('Process not found in this department.');
    }
    if (requestingUserEmail) {
      await this.accessControlService.assertUserCanAccessProcess(
        requestingUserEmail,
        departmentId,
        processId,
      );
    }

    const [major, , tail] = department.code.split('-');
    const code2 = input.code2.trim();
    const processName = input.processName.trim();
    const updatedCode = `${major}-${code2}-${tail}`;

    const existing = await this.processRepository.findOne({
      where: { code: updatedCode, departmentId },
    });
    if (existing && existing.id !== process.id) {
      throw new ConflictException(
        'Process code already exists in this process function.',
      );
    }

    process.code = updatedCode;
    process.processName = processName;
    process.name = `${updatedCode}_${processName}`;

    const savedProcess = await this.processRepository.save(process);
    await this.refreshAutofilledActivityDetailsInProcess(
      departmentId,
      processId,
    );
    return savedProcess;
  }

  async removeProcess(
    departmentId: string,
    processId: string,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.processRepository.findOne({
      where: { id: processId, departmentId },
    });
    if (!process) {
      throw new NotFoundException('Process not found in this department.');
    }
    if (requestingUserEmail) {
      await this.accessControlService.assertUserCanAccessProcess(
        requestingUserEmail,
        departmentId,
        processId,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const activities = await manager.find(ActivityEntity, {
        where: { processId },
        select: { id: true },
      });
      const activityIds = activities.map((a) => a.id);
      if (activityIds.length) {
        await manager.delete(ActivityCommentEntity, {
          activityId: In(activityIds),
        });
        await manager.delete(ActivityEntity, { id: In(activityIds) });
      }
      await manager.delete(ProcessEntity, { id: processId, departmentId });
    });
    return { deleted: true as const };
  }

  async defineProcess(
    departmentId: string,
    processId: string,
    input: DefineProcessDto,
    requestingUserEmail?: string | null,
  ) {
    const process = await this.loadProcessEntity(
      departmentId,
      processId,
      requestingUserEmail,
    );
    const template = await this.activityTemplateRepository.findOne({
      where: { id: input.activityTemplateId },
    });
    if (!template) {
      throw new NotFoundException('Sub-process template not found.');
    }

    process.activityTemplateId = template.id;
    process.activityTemplateName = template.name;
    process.projectName = input.projectName?.trim()
      ? input.projectName.trim()
      : null;
    process.description = input.description?.trim() || null;
    process.processOwners = input.processOwners;
    process.processDescription = input.processDescription?.trim() || null;

    const nextProcessName = input.processName?.trim();
    const nameChanged =
      !!nextProcessName &&
      nextProcessName !== (process.processName ?? '').trim();
    if (nextProcessName) {
      process.processName = nextProcessName;
      const code = String(process.code ?? '').trim();
      process.name = code ? `${code}_${nextProcessName}` : nextProcessName;
    }

    await this.processRepository.save(process);

    if (nameChanged) {
      await this.refreshAutofilledActivityDetailsInProcess(
        departmentId,
        processId,
      );
    }

    const ownerList = [...(input.processOwners ?? [])];
    if (process.activities?.length) {
      for (const activity of process.activities) {
        activity.owners = [...ownerList];
      }
      await this.activityRepository.save(process.activities);
    }

    return this.findProcess(departmentId, processId, requestingUserEmail);
  }

  /**
   * Re-applies `si_no` and `activity_id` in `details` when department/process names change.
   */
  private async refreshAutofilledActivityDetailsInProcess(
    departmentId: string,
    processId: string,
  ): Promise<void> {
    const process = await this.loadProcessEntity(departmentId, processId);
    if (!process.activityTemplateId) {
      return;
    }
    const template = await this.activityTemplateRepository.findOne({
      where: { id: process.activityTemplateId },
    });
    if (!template) {
      return;
    }
    const autofillKeys = new Set(template.fields.map((f) => f.key));
    const needsLegacyAutofill =
      autofillKeys.has('si_no') || autofillKeys.has('activity_id');

    const departmentRow = await this.departmentRepository.findOne({
      where: { id: departmentId },
      select: { name: true },
    });
    const departmentName = departmentRow?.name ?? '';
    const activitiesById = new Map(process.activities.map((a) => [a.id, a]));
    const toSave: ActivityEntity[] = [];

    for (const activity of process.activities) {
      const parentEntity =
        activity.parentActivityId != null
          ? (activitiesById.get(activity.parentActivityId) ?? null)
          : null;
      const ancestorSubProcessNames = collectAncestorSubProcessNames(
        parentEntity,
        activitiesById,
      );
      let nextDetails: Record<string, string | string[]> = {
        ...activity.details,
      };
      if (needsLegacyAutofill) {
        nextDetails = applyAutofillActivityDetailFields(
          autofillKeys,
          nextDetails,
          {
            siNo: activity.sln,
            departmentName,
            processName: process.processName,
            activityName: activity.activityName,
            ancestorSubProcessNames,
          },
        );
      }
      nextDetails = applyHierarchyCodeToMatchingDetailFields(
        template.fields,
        nextDetails,
        activity.code,
      );
      const prevRaw = JSON.stringify(activity.details ?? {});
      const nextRaw = JSON.stringify(nextDetails);
      if (prevRaw !== nextRaw) {
        activity.details = nextDetails;
        toSave.push(activity);
      }
    }

    if (toSave.length) {
      await this.activityRepository.save(toSave);
    }
  }

  private parseIndexSheetRows(fileBuffer: Buffer): Array<{
    processId: string;
    name: string;
    level0: string;
    level1: string;
    level2: string;
    objective: string;
    description: string;
  }> {
    const workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      cellDates: false,
    });
    const sheetName = workbook.SheetNames.includes('Index')
      ? 'Index'
      : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return [];
    }

    const matrix = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(
      sheet,
      {
        header: 1,
        defval: '',
      },
    );

    if (!matrix.length) {
      return [];
    }

    const header = matrix[0].map((c) => String(c ?? '').trim());
    const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
    const pidIdx = header.findIndex((h) => {
      const n = norm(h);
      return (
        n.includes('process id') ||
        n === 'processid' ||
        (n.includes('process') && n.includes('id'))
      );
    });
    const l3Idx = header.findIndex((h) => norm(h).includes('level 3'));
    const l0Idx = header.findIndex((h) => norm(h).includes('level 0'));
    const l1Idx = header.findIndex((h) => norm(h).includes('level 1'));
    const l2Idx = header.findIndex((h) => norm(h).includes('level 2'));
    const objIdx = header.findIndex((h) => norm(h).includes('objective'));
    const descIdx = header.findIndex((h) => norm(h) === 'description');

    if (pidIdx < 0) {
      return [];
    }

    const cell = (r: (string | number | undefined)[], idx: number) =>
      idx >= 0 && idx < r.length ? String(r[idx] ?? '').trim() : '';

    const out: Array<{
      processId: string;
      name: string;
      level0: string;
      level1: string;
      level2: string;
      objective: string;
      description: string;
    }> = [];

    for (let i = 1; i < matrix.length; i += 1) {
      const r = matrix[i];
      const processId = cell(r, pidIdx);
      if (!processId) {
        continue;
      }
      out.push({
        processId,
        name: cell(r, l3Idx),
        level0: cell(r, l0Idx),
        level1: cell(r, l1Idx),
        level2: cell(r, l2Idx),
        objective: cell(r, objIdx),
        description: cell(r, descIdx),
      });
    }

    return out;
  }

  /**
   * Process Function code uniqueness is scoped per company:
   * the same `code` may exist under different `companyCode` values.
   */
  private async ensureDepartmentCodeUnique(
    code: string,
    companyCode: CompanyCode,
    excludeDepartmentId?: string,
  ) {
    const existing = await this.departmentRepository.findOne({
      where: { code, companyCode },
    });
    if (existing && existing.id !== excludeDepartmentId) {
      throw new ConflictException(
        `Process Function code "${code}" already exists in company ${companyCode}.`,
      );
    }
  }

  private normalizeProcessCodeLevels(value?: number | null): 3 | 4 {
    return value === 4 ? 4 : 3;
  }

  private findLowestUnusedSequenceNumber(used: Set<number>, start = 1): number {
    let candidate = start;
    while (used.has(candidate)) {
      candidate += 1;
    }
    return candidate;
  }

  private getNextProcessCode(
    departmentCode: string,
    processes: ProcessEntity[],
    processCodeLevels: 3 | 4,
  ) {
    const [major] = departmentCode.split('-');
    if (processCodeLevels === 4) {
      const usedParents = new Set<number>();
      for (const processItem of processes) {
        const code = String(processItem.code ?? '').trim();
        if (!code) continue;
        const parts = code.split('-');
        if (parts.length !== 4 || parts[0] !== major || parts[3] !== '000') {
          continue;
        }
        if (parts[2] !== '001') continue;
        const parent = Number(parts[1] ?? '');
        if (!Number.isNaN(parent) && parent > 0) {
          usedParents.add(parent);
        }
      }
      const nextParent = this.findLowestUnusedSequenceNumber(usedParents);
      return `${major}-${String(nextParent).padStart(3, '0')}-001-000`;
    }

    const usedMid = new Set<number>();
    for (const processItem of processes) {
      const code = String(processItem.code ?? '').trim();
      if (!code) continue;
      const parts = code.split('-');
      if (parts.length !== 3 || parts[0] !== major) {
        continue;
      }
      const mid = Number(parts[1] ?? '');
      if (!Number.isNaN(mid) && mid > 0) {
        usedMid.add(mid);
      }
    }
    const nextMid = this.findLowestUnusedSequenceNumber(usedMid);
    return `${major}-${String(nextMid).padStart(3, '0')}-000`;
  }

  /**
   * Process with 4-level codes: selected parent branch `C1-P-*-000` -> next `C1-P-C-000`.
   */
  private getNextChildProcessCode(
    parentCode: string,
    processes: ProcessEntity[],
  ): string {
    const parentParts = parentCode.split('-');
    if (parentParts.length !== 4) {
      throw new BadRequestException(
        `Parent process must be 4-level (C1-P-C-000). Got: ${parentCode}`,
      );
    }
    const [major, parent] = parentParts;
    const usedChildren = new Set<number>();
    for (const processItem of processes) {
      const code = String(processItem.code ?? '').trim();
      if (!code) continue;
      const parts = code.split('-');
      if (
        parts.length !== 4 ||
        parts[0] !== major ||
        parts[1] !== parent ||
        parts[3] !== '000'
      ) {
        continue;
      }
      const child = Number.parseInt(parts[2] ?? '', 10);
      if (!Number.isNaN(child) && child > 0) {
        usedChildren.add(child);
      }
    }
    const nextChild = this.findLowestUnusedSequenceNumber(usedChildren);
    return `${major}-${parent}-${String(nextChild).padStart(3, '0')}-000`;
  }

  private toImportSheetError(raw: string): string {
    const msg = raw?.trim() || 'Unknown import error';
    if (msg.includes('character varying(11)')) {
      return 'Process Code is too long for old DB schema. Restart backend so schema sync updates `processes.code` length.';
    }
    if (
      msg.includes('duplicate key value violates unique constraint') &&
      (msg.includes('UQ_abccbcae051b35786027db70bf1') ||
        msg.includes('activities'))
    ) {
      return 'No processes were saved because generated Activity Code already exists. This usually means the target Process Code already exists or legacy process codes are missing. Please refresh and try again.';
    }
    return msg;
  }

  private validateAndNormalizeImportedProcessCode(
    rawCode: string,
    departmentCode: string,
    processCodeLevels: 3 | 4,
  ): string {
    const normalized = rawCode.trim();
    const parts = normalized.split('-');
    const isThree = /^\d{3}-\d{3}-\d{3}$/.test(normalized);
    const isFour = /^\d{3}-\d{3}-\d{3}-\d{3}$/.test(normalized);
    if (!isThree && !isFour) {
      throw new BadRequestException(
        `Invalid process code "${rawCode}". Expected NNN-NNN-NNN or NNN-NNN-NNN-NNN.`,
      );
    }
    const endsWithRoot = normalized.endsWith('-000');
    if (!endsWithRoot) {
      throw new BadRequestException(
        `Invalid process code "${rawCode}". Last segment must be 000.`,
      );
    }

    const [deptMajor] = departmentCode.split('-');
    const [major] = parts;
    if (major !== deptMajor) {
      throw new BadRequestException(
        `Process code "${normalized}" must share C1 with process function code ${departmentCode}.`,
      );
    }
    if (processCodeLevels === 3 && parts.length !== 3) {
      // Allow 4-segment Excel codes (NNN-NNN-NNN-000) in Operations-style workbooks.
      if (!(parts.length === 4 && endsWithRoot)) {
        throw new BadRequestException(
          `Process function ${departmentCode} is configured for 3 levels; code must be NNN-NNN-000.`,
        );
      }
    }
    if (processCodeLevels === 4 && parts.length !== 4) {
      // Allow 3-segment Excel codes (NNN-NNN-000) mixed into Operations workbooks.
      if (!(parts.length === 3 && endsWithRoot)) {
        throw new BadRequestException(
          `Process function ${departmentCode} is configured for 4 levels; code must be NNN-NNN-NNN-000.`,
        );
      }
    }
    return normalized;
  }
}

function firstDetailString(
  details: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const raw = details[key];
    if (raw == null) continue;
    const text = Array.isArray(raw)
      ? raw
          .map((x) => String(x ?? '').trim())
          .filter(Boolean)
          .join(', ')
      : String(raw).trim();
    if (text && !isDashboardPlaceholder(text)) return text;
  }
  return '';
}

function isDashboardPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    !v || v === 'na' || v === 'n/a' || v === '-' || v === 'tbd' || v === 'nil'
  );
}

function splitDashboardTokens(raw: string): string[] {
  return raw
    .split(/[,;/|\n\r]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && !isDashboardPlaceholder(s) && s.length <= 120);
}

function normalizeJobRoleKey(token: string): string {
  return token
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** R/A/C/I/V = RACI + verifier, P = approver (Approval Flow levels). */
type RaciLetter = 'R' | 'A' | 'C' | 'I' | 'V' | 'P';

const DASHBOARD_ROLE_FIELDS: Array<[string, RaciLetter]> = [
  ['Responsible', 'R'],
  ['Responsbility', 'R'],
  ['Accountable', 'A'],
  ['Accountability', 'A'],
  ['Consulted', 'C'],
  ['Consulting', 'C'],
  ['Informed', 'I'],
  ['Inform', 'I'],
  ['Business Role', 'R'],
  ['Responsible-Role', 'R'],
  ['Verification (VI)', 'V'],
  ['Verify (VI)', 'V'],
];

/**
 * RACI / people roles only — skip Support (often systems like SAP / Email).
 * Distinct by normalized key so repeated spellings count once; each role also
 * carries the RACI letters it holds on this activity.
 */
function extractDashboardJobRoles(
  details: Record<string, unknown>,
): Array<{ name: string; key: string; raci: Set<RaciLetter> }> {
  const byKey = new Map<
    string,
    { name: string; key: string; raci: Set<RaciLetter> }
  >();
  for (const [field, letter] of DASHBOARD_ROLE_FIELDS) {
    const text = firstDetailString(details, [field]);
    for (const token of splitDashboardTokens(text)) {
      if (looksLikeSystemNotRole(token)) continue;
      const key = normalizeJobRoleKey(token);
      if (!key) continue;
      const entry = byKey.get(key) ?? { name: token, key, raci: new Set() };
      entry.raci.add(letter);
      byKey.set(key, entry);
    }
  }
  // Approval Flow: every job role in the ordered levels is an approver.
  for (const [detailKey, raw] of Object.entries(details)) {
    if (detailKey.toLowerCase().replace(/[^a-z0-9]/g, '') !== 'approvalflow') continue;
    for (const level of parseApprovalFlow(raw).levels) {
      const token = level.replace(/\s+/g, ' ').trim();
      if (!token || isDashboardPlaceholder(token) || looksLikeSystemNotRole(token)) continue;
      const key = normalizeJobRoleKey(token);
      if (!key) continue;
      const entry = byKey.get(key) ?? { name: token, key, raci: new Set() };
      entry.raci.add('P');
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

/** True when any "Exception …" field (description / mitigation / handling) has real text. */
function hasDashboardException(details: Record<string, unknown>): boolean {
  for (const [key, raw] of Object.entries(details)) {
    if (!key.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith('exception')) continue;
    const text = (Array.isArray(raw) ? raw.join(' ') : String(raw ?? '')).trim();
    if (text && !isDashboardPlaceholder(text)) return true;
  }
  return false;
}

function looksLikeSystemNotRole(token: string): boolean {
  const t = token.toLowerCase();
  return (
    t === 'email' ||
    t === 'sap' ||
    t.startsWith('sap ') ||
    t.includes('sap s4') ||
    t.includes('s/4') ||
    t.includes('wms') ||
    t.includes('ewm') ||
    t.includes('system')
  );
}

function extractDashboardPolicyRefs(
  details: Record<string, unknown>,
): string[] {
  const text = firstDetailString(details, [
    'Policy Reference',
    'Policies',
    'policies',
  ]);
  return splitDashboardTokens(text);
}

/** Parse TAT-like values ("2", "2 days", "1-2", "1.5 day") → days number. */
function parseDashboardTatDays(
  details: Record<string, unknown>,
): number | null {
  const text = firstDetailString(details, [
    'TAT',
    'Wait/Delay Time',
    'Wait/Delay Time -',
  ]);
  if (!text) return null;
  const range = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  }
  const single = text.match(/(\d+(?:\.\d+)?)/);
  if (!single) return null;
  const n = Number(single[1]);
  return Number.isFinite(n) ? n : null;
}

function parseDashboardFte(details: Record<string, unknown>): number | null {
  const text = firstDetailString(details, [
    "No Of FTE's Interactions",
    'No Of FTEs Interactions',
    'FTE',
  ]);
  if (!text) return null;
  const m = text.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function avgOrNull(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}
