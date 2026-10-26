import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { In, Repository } from 'typeorm';

import { AccessControlService } from 'src/access-control/access-control.service';
import { ActivityEntity } from 'src/activities/entities/activity.entity';
import { ActivityPolicyLinkEntity } from 'src/activities/entities/activity-policy-link.entity';
import { ActivityRelationEntity } from 'src/activities/entities/activity-relation.entity';
import { PolicyCreatorCatalogService } from 'src/companies/policy-creator-catalog.service';
import { Department } from 'src/departments/entities/department.entity';
import { ProcessEntity } from 'src/processes/entities/process.entity';

import {
  bpmActivityDeepLink,
  toWordPolicyDocument,
  type RelatedSubProcessWordLink,
  type WordPolicyDocument,
} from './ai-bpm-policy-word.util';

import {
  buildBpmDocumentDocxBuffer,
  buildDocxFilename,
} from './ai-bpm-docx.builder';
import { ActivityTemplateEntity } from 'src/activity-templates/entities/activity-template.entity';

import {
  alignDetailsToTemplateColumns,
  buildAuthoritativeDataMarkdown,
  inferTemplateColumns,
  type TemplateColumn,
} from './ai-bpm-authoritative-data';
import { CompaniesService } from 'src/companies/companies.service';
import { buildDeterministicWordDocument } from './ai-bpm-fallback-document.builder';
import { parseBpmDocumentJsonLenient } from './ai-bpm-json.parser';
import type { BpmDocumentJson } from './ai-bpm-document.types';
import {
  isMarkdownContentTooThin,
  sanitizeProcessMarkdownForMerge,
} from './ai-bpm-markdown-merge';
import { buildProseWordDocxBuffer } from './ai-bpm-prose-docx.builder';
import {
  buildPipelineBpmDocx,
  buildPipelineSopDocx,
  buildPipelineJdDocx,
  buildPipelineSummaryDocx,
  type PipelineDocMeta,
} from './ai-bpm-json-docx.builder';
import {
  WordJobStore,
  type PersistedWordJob,
  type WordFileKind,
} from './ai-bpm-word-job.store';
import {
  runBpmPipeline,
  mapInBatches,
  runJdPipeline,
  runSopPipeline,
  runSummaryOverview,
  runSummaryPipeline,
  type JdMaster,
  type SummaryOverview,
  type PipelineBundle,
  type PipelineProgress,
  type SopMaster,
} from './ai-bpm-json-pipeline';
import {
  AI_BPM_PROSE_SYSTEM_PROMPT,
  buildProseUserMessage,
  extractMarkdownSectionHeadings,
} from './ai-bpm-prose.prompts';
import { buildFlowHintFromExportJson } from './ai-bpm-flow-hint.builder';
import {
  getAiPromptTemplates,
  listAiPromptTemplatesPublic,
  type AiPromptTemplateId,
} from './ai-prompt-templates';
import type { GenerateAiBpmDto } from './dto/generate-ai-bpm.dto';
import type { ExportAiBpmWordDto } from './dto/export-ai-bpm-word.dto';

/** Internal fallback only — not exposed in the UI. */
const WORD_EXPORT_FALLBACK_TEMPLATES: AiPromptTemplateId[] = [
  'full-bpm-document',
  'raci-matrix',
  'bpmn-swimlane',
];

type WordNamedBundle = { label: string; bundle: PipelineBundle };

type FollowUpKind = 'sop' | 'summary' | 'jd';

/** What is kept in memory so the SOP and the Summary SOP can be built from the finished BPM data. */
type WordExportKit = {
  meta: PipelineDocMeta;
  named: WordNamedBundle[];
  master?: SopMaster;
  /** The overview page of a multi-process Summary SOP. */
  overview?: SummaryOverview;
  jd?: JdMaster;
};

type WordExportJob = {
  id: string;
  ownerEmail: string;
  status: 'running' | 'done' | 'error';
  /** The document being produced right now (or the last one produced). */
  phase: WordFileKind;
  /** Finished files live on disk; only their names are kept here. */
  files: Partial<Record<WordFileKind, { filename: string }>>;
  /** Loaded from disk when the SOP or Summary needs it. */
  kit?: WordExportKit;
  hasKit: boolean;
  dto?: ExportAiBpmWordDto;
  resumes: number;
  stage: PipelineProgress['stage'];
  label: string;
  progress: number;
  warningMessage?: string | null;
  note?: string | null;
  error?: string;
  createdAt: number;
  touchedAt: number;
};

type SubProcessExport = {
  code: string;
  sln: number;
  activityName: string;
  activityDescription: string | null;
  status: string;
  owners: string[];
  parentActivityId: string | null;
  parentCode: string | null;
  templateId: string | null;
  templateName: string | null;
  relatedSubProcesses: RelatedSubProcessWordLink[];
  relatedPolicies: string[];
  /** Full Policy Creator documents for Word (print-style body under the sub-process). */
  relatedPolicyDocuments: WordPolicyDocument[];
  details: Record<string, string | string[]>;
};

type ProcessSliceExport = {
  process: {
    code: string;
    processName: string;
    name: string;
    companyCode: string;
    projectName: string | null;
    description: string | null;
    processDescription: string | null;
    processOwners: string[];
    activityTemplateId: string | null;
    activityTemplateName: string | null;
  };
  subProcesses: SubProcessExport[];
  subProcessCount: number;
  templateColumns?: TemplateColumn[];
};

type BpmSingleProcessExportJson = {
  meta: {
    exportedFor: 'bpm-automation-generation';
    scope: 'process';
    commentsIncluded: false;
    hierarchy: 'Process Function → Process → Sub-processes (activities)';
  };
  processFunction: {
    code: string;
    name: string;
    companyCode: string;
    processFunctionOwners: string[];
    processCodeLevels: number;
  };
  process: ProcessSliceExport['process'];
  subProcesses: SubProcessExport[];
  subProcessCount: number;
  templateColumns?: TemplateColumn[];
};

type BpmProcessFunctionExportJson = {
  meta: {
    exportedFor: 'bpm-automation-generation';
    scope: 'processFunction';
    commentsIncluded: false;
    hierarchy: 'Process Function → all Processes → Sub-processes (activities)';
  };
  processFunction: BpmSingleProcessExportJson['processFunction'];
  processes: ProcessSliceExport[];
  processCount: number;
  subProcessCount: number;
  templateColumns?: TemplateColumn[];
};

type BpmExportJson = BpmSingleProcessExportJson | BpmProcessFunctionExportJson;

@Injectable()
export class AiBpmService implements OnModuleInit {
  private readonly logger = new Logger(AiBpmService.name);
  private anthropic: Anthropic | null = null;
  private readonly wordJobs = new Map<string, WordExportJob>();
  private readonly wordJobStore = new WordJobStore(
    process.env.WORD_JOBS_DIR?.trim() || join(process.cwd(), '..', 'word-jobs'),
  );

  constructor(
    private readonly accessControlService: AccessControlService,
    private readonly policyCreatorCatalogService: PolicyCreatorCatalogService,
    private readonly companiesService: CompaniesService,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(ProcessEntity)
    private readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(ActivityTemplateEntity)
    private readonly activityTemplateRepository: Repository<ActivityTemplateEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(ActivityRelationEntity)
    private readonly activityRelationRepository: Repository<ActivityRelationEntity>,
    @InjectRepository(ActivityPolicyLinkEntity)
    private readonly activityPolicyLinkRepository: Repository<ActivityPolicyLinkEntity>,
  ) {}

  listTemplates() {
    return listAiPromptTemplatesPublic();
  }

  async listTargets(userEmail: string) {
    await this.assertSuperAdmin(userEmail);

    const departments = await this.departmentRepository.find({
      relations: { processes: true },
      order: { code: 'ASC' },
    });

    const out: Array<{
      id: string;
      code: string;
      name: string;
      companyCode: string | null;
      processes: Array<{ id: string; code: string; name: string }>;
    }> = [];

    for (const dept of departments) {
      try {
        await this.accessControlService.assertUserCanAccessDepartment(
          userEmail,
          dept.id,
        );
      } catch {
        continue;
      }
      const processes: Array<{ id: string; code: string; name: string }> = [];
      for (const proc of dept.processes ?? []) {
        try {
          await this.accessControlService.assertUserCanAccessProcess(
            userEmail,
            dept.id,
            proc.id,
          );
          processes.push({
            id: proc.id,
            code: proc.code,
            name: proc.processName?.trim() || proc.name || proc.code,
          });
        } catch {
          /* skip */
        }
      }
      out.push({
        id: dept.id,
        code: dept.code,
        name: dept.name,
        companyCode: dept.companyCode ?? null,
        processes,
      });
    }
    return out;
  }

  private getAnthropicClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Automation is not configured. Set ANTHROPIC_API_KEY in bpm-api/.env and restart the API.',
      );
    }
    if (!this.anthropic) {
      const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
      this.anthropic = new Anthropic({
        apiKey,
        ...(workspaceId
          ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } }
          : {}),
      });
    }
    return this.anthropic;
  }

  private async assertSuperAdmin(userEmail: string) {
    const allowed = await this.accessControlService.userIsSuperAdmin(userEmail);
    if (!allowed) {
      throw new ForbiddenException(
        'Only Super Admin can generate BPM content with Automation.',
      );
    }
  }

  private mapSubProcesses(activities: ActivityEntity[]): SubProcessExport[] {
    const codeById = new Map(activities.map((a) => [a.id, a.code]));
    return activities
      .slice()
      .sort((a, b) => a.sln - b.sln || a.code.localeCompare(b.code))
      .map((a) => {
        const extra = a as ActivityEntity & {
          relatedSubProcesses?: RelatedSubProcessWordLink[];
          relatedPolicies?: string[];
          relatedPolicyDocuments?: WordPolicyDocument[];
        };
        return {
          code: a.code,
          sln: a.sln,
          activityName: a.activityName,
          activityDescription: a.activityDescription,
          status: a.status,
          owners: a.owners ?? [],
          parentActivityId: a.parentActivityId,
          parentCode: a.parentActivityId
            ? (codeById.get(a.parentActivityId) ?? null)
            : null,
          templateId: a.templateId,
          templateName: a.templateName,
          relatedSubProcesses: extra.relatedSubProcesses ?? [],
          relatedPolicies: extra.relatedPolicies ?? [],
          relatedPolicyDocuments: extra.relatedPolicyDocuments ?? [],
          details: a.details ?? {},
        };
      });
  }

  /** Always load every activity for a process — nested TypeORM relations can drop rows. */
  private async hydrateProcessActivities(
    process: ProcessEntity,
  ): Promise<ProcessEntity> {
    process.activities = await this.activityRepository.find({
      where: { processId: process.id },
      order: { sln: 'ASC', code: 'ASC' },
    });
    await this.attachRelatedLinks(process.activities);
    return process;
  }

  private async attachRelatedLinks(
    activities: ActivityEntity[],
  ): Promise<void> {
    if (!activities.length) return;
    const ids = activities.map((a) => a.id);
    const extra = activities as Array<
      ActivityEntity & {
        relatedSubProcesses?: RelatedSubProcessWordLink[];
        relatedPolicies?: string[];
        relatedPolicyDocuments?: WordPolicyDocument[];
      }
    >;
    for (const row of extra) {
      row.relatedSubProcesses = [];
      row.relatedPolicies = [];
      row.relatedPolicyDocuments = [];
    }

    const [relations, policyLinks] = await Promise.all([
      this.activityRelationRepository
        .createQueryBuilder('rel')
        .where('rel.sourceActivityId IN (:...ids)', { ids })
        .orWhere('rel.targetActivityId IN (:...ids)', { ids })
        .getMany(),
      this.activityPolicyLinkRepository.find({
        where: { activityId: In(ids) },
      }),
    ]);

    const uniquePolicyIds = [
      ...new Set(
        policyLinks
          .map((link) => link.policyCreatorPolicyId?.trim())
          .filter(Boolean),
      ),
    ];
    const policyDocById = new Map<string, WordPolicyDocument>();
    await Promise.all(
      uniquePolicyIds.map(async (policyId) => {
        try {
          const doc =
            await this.policyCreatorCatalogService.getPolicyDocument(policyId);
          policyDocById.set(policyId, toWordPolicyDocument(doc));
        } catch {
          /* Policy may have been deleted in Policy Creator — keep link name only. */
        }
      }),
    );

    const policyNamesByActivity = new Map<string, string[]>();
    const policyDocsByActivity = new Map<string, WordPolicyDocument[]>();
    for (const link of policyLinks) {
      const label = [
        link.policyName,
        link.policyVersion ? `v${link.policyVersion}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (label) {
        const names = policyNamesByActivity.get(link.activityId) ?? [];
        if (!names.includes(label)) names.push(label);
        policyNamesByActivity.set(link.activityId, names);
      }
      const full = policyDocById.get(link.policyCreatorPolicyId);
      if (full) {
        const docs = policyDocsByActivity.get(link.activityId) ?? [];
        if (!docs.some((item) => item.id === full.id)) docs.push(full);
        policyDocsByActivity.set(link.activityId, docs);
      } else if (label) {
        const docs = policyDocsByActivity.get(link.activityId) ?? [];
        docs.push(
          toWordPolicyDocument({
            id: link.policyCreatorPolicyId,
            name: link.policyName,
            version: link.policyVersion,
            companyName: link.companyName,
            departmentName: link.departmentName,
            businessRole: '',
            sections: [],
          }),
        );
        policyDocsByActivity.set(link.activityId, docs);
      }
    }

    const relatedIds = new Set<string>();
    for (const rel of relations) {
      relatedIds.add(rel.sourceActivityId);
      relatedIds.add(rel.targetActivityId);
    }
    const linkedRows = relatedIds.size
      ? await this.activityRepository.find({
          where: { id: In([...relatedIds]) },
        })
      : [];
    const processIds = [
      ...new Set(linkedRows.map((a) => a.processId).filter(Boolean)),
    ];
    const processes = processIds.length
      ? await this.processRepository.find({
          where: { id: In(processIds) },
          select: ['id', 'departmentId'],
        })
      : [];
    const departmentByProcessId = new Map(
      processes.map((p) => [p.id, p.departmentId]),
    );
    const linkById = new Map<string, RelatedSubProcessWordLink>();
    for (const a of linkedRows) {
      const departmentId = departmentByProcessId.get(a.processId);
      if (!departmentId) continue;
      linkById.set(a.id, {
        id: a.id,
        code: a.code,
        activityName: a.activityName,
        processId: a.processId,
        departmentId,
        bpmUrl: bpmActivityDeepLink(departmentId, a.processId, a.id),
      });
    }
    const idSet = new Set(ids);

    const relatedByActivity = new Map<string, RelatedSubProcessWordLink[]>();
    for (const rel of relations) {
      const pair: Array<[string, string]> = [
        [rel.sourceActivityId, rel.targetActivityId],
        [rel.targetActivityId, rel.sourceActivityId],
      ];
      for (const [from, to] of pair) {
        if (!idSet.has(from)) continue;
        const link = linkById.get(to);
        if (!link) continue;
        const list = relatedByActivity.get(from) ?? [];
        if (!list.some((item) => item.id === link.id)) list.push(link);
        relatedByActivity.set(from, list);
      }
    }

    for (const row of extra) {
      row.relatedPolicies = policyNamesByActivity.get(row.id) ?? [];
      row.relatedPolicyDocuments = policyDocsByActivity.get(row.id) ?? [];
      row.relatedSubProcesses = relatedByActivity.get(row.id) ?? [];
    }
  }

  private mapProcessSlice(process: ProcessEntity): ProcessSliceExport {
    const activities = process.activities ?? [];
    const subProcesses = this.mapSubProcesses(activities);
    return {
      process: {
        code: process.code,
        processName: process.processName,
        name: process.name,
        companyCode: process.companyCode,
        projectName: process.projectName,
        description: process.description,
        processDescription: process.processDescription,
        processOwners: process.processOwners ?? [],
        activityTemplateId: process.activityTemplateId,
        activityTemplateName: process.activityTemplateName,
      },
      subProcesses,
      subProcessCount: subProcesses.length,
    };
  }

  private processFunctionBlock(department: Department) {
    return {
      code: department.code,
      name: department.name,
      companyCode: department.companyCode,
      processFunctionOwners: department.processFunctionOwners ?? [],
      processCodeLevels: department.processCodeLevels,
    };
  }

  private buildSingleProcessExportJson(
    department: Department,
    process: ProcessEntity,
  ): BpmSingleProcessExportJson {
    const slice = this.mapProcessSlice(process);
    return {
      meta: {
        exportedFor: 'bpm-automation-generation',
        scope: 'process',
        commentsIncluded: false,
        hierarchy: 'Process Function → Process → Sub-processes (activities)',
      },
      processFunction: this.processFunctionBlock(department),
      process: slice.process,
      subProcesses: slice.subProcesses,
      subProcessCount: slice.subProcessCount,
    };
  }

  private buildProcessFunctionExportJson(
    department: Department,
    processes: ProcessEntity[],
  ): BpmProcessFunctionExportJson {
    const slices = processes
      .slice()
      .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''))
      .map((p) => this.mapProcessSlice(p));
    const subProcessCount = slices.reduce((n, s) => n + s.subProcessCount, 0);

    return {
      meta: {
        exportedFor: 'bpm-automation-generation',
        scope: 'processFunction',
        commentsIncluded: false,
        hierarchy:
          'Process Function → all Processes → Sub-processes (activities)',
      },
      processFunction: this.processFunctionBlock(department),
      processes: slices,
      processCount: slices.length,
      subProcessCount,
    };
  }

  private async loadProcessForExport(
    departmentId: string,
    processId: string,
    userEmail: string,
  ): Promise<{ department: Department; process: ProcessEntity }> {
    await this.accessControlService.assertUserCanAccessProcess(
      userEmail,
      departmentId,
      processId,
    );

    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
    });
    if (!department) {
      throw new NotFoundException('Process function not found.');
    }

    const process = await this.processRepository.findOne({
      where: { id: processId, departmentId },
    });
    if (!process) {
      throw new NotFoundException(
        'Process not found in this process function.',
      );
    }
    await this.hydrateProcessActivities(process);

    return { department, process };
  }

  private async loadProcessFunctionForExport(
    departmentId: string,
    userEmail: string,
  ): Promise<{ department: Department; processes: ProcessEntity[] }> {
    await this.accessControlService.assertUserCanAccessDepartment(
      userEmail,
      departmentId,
    );

    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
      relations: { processes: true },
      order: {
        processes: {
          code: 'ASC',
        },
      },
    });
    if (!department) {
      throw new NotFoundException('Process function not found.');
    }

    const accessible: ProcessEntity[] = [];
    for (const proc of department.processes ?? []) {
      try {
        await this.accessControlService.assertUserCanAccessProcess(
          userEmail,
          departmentId,
          proc.id,
        );
        accessible.push(proc);
      } catch {
        /* skip inaccessible process */
      }
    }

    if (accessible.length === 0) {
      throw new BadRequestException(
        'No accessible processes found in this process function.',
      );
    }

    for (const proc of accessible) {
      await this.hydrateProcessActivities(proc);
    }

    return { department, processes: accessible };
  }

  private async resolveTemplateColumns(opts: {
    activityTemplateId?: string | null;
    activityTemplateName?: string | null;
    fallbackDetails?: Record<string, string | string[]>[];
  }): Promise<TemplateColumn[]> {
    let template: ActivityTemplateEntity | null = null;
    if (opts.activityTemplateId?.trim()) {
      template = await this.activityTemplateRepository.findOne({
        where: { id: opts.activityTemplateId.trim() },
      });
    }
    if (!template && opts.activityTemplateName?.trim()) {
      template = await this.activityTemplateRepository.findOne({
        where: { name: opts.activityTemplateName.trim() },
      });
    }
    if (template?.fields?.length) {
      return template.fields.map((f) => ({
        key: f.key,
        label: f.label?.trim() || f.key,
      }));
    }
    return inferTemplateColumns(
      (opts.fallbackDetails ?? []).map((details, index) => ({
        code: `row-${index}`,
        activityName: `row-${index}`,
        status: 'Draft',
        owners: [],
        details,
      })),
    );
  }

  private applyTemplateColumnsToSlice(
    slice: ProcessSliceExport,
    columns: TemplateColumn[],
  ): ProcessSliceExport {
    return {
      ...slice,
      templateColumns: columns,
      subProcesses: slice.subProcesses.map((sp) => ({
        ...sp,
        details: alignDetailsToTemplateColumns(sp.details, columns),
      })),
    };
  }

  /** Attach full template column order and align every row's details to it. */
  private async enrichExportWithTemplateColumns(
    exportJson: BpmExportJson,
  ): Promise<BpmExportJson> {
    if (exportJson.meta.scope === 'process') {
      const single = exportJson as BpmSingleProcessExportJson;
      const columns = await this.resolveTemplateColumns({
        activityTemplateId: single.process.activityTemplateId,
        activityTemplateName: single.process.activityTemplateName,
        fallbackDetails: single.subProcesses.map((sp) => sp.details),
      });
      const enriched = this.applyTemplateColumnsToSlice(
        {
          process: single.process,
          subProcesses: single.subProcesses,
          subProcessCount: single.subProcessCount,
        },
        columns,
      );
      return {
        ...single,
        process: enriched.process,
        subProcesses: enriched.subProcesses,
        subProcessCount: enriched.subProcessCount,
        templateColumns: columns,
      };
    }

    const pfExport = exportJson as BpmProcessFunctionExportJson;
    const processes: ProcessSliceExport[] = [];
    for (const slice of pfExport.processes) {
      const columns = await this.resolveTemplateColumns({
        activityTemplateId: slice.process.activityTemplateId,
        activityTemplateName: slice.process.activityTemplateName,
        fallbackDetails: slice.subProcesses.map((sp) => sp.details),
      });
      processes.push(this.applyTemplateColumnsToSlice(slice, columns));
    }
    return {
      ...pfExport,
      processes,
      templateColumns: processes[0]?.templateColumns,
    };
  }

  private trimExportForPrompt(
    exportJson: BpmExportJson,
    opts?: { preserveAllColumns?: boolean },
  ): BpmExportJson {
    const maxSubProcessesPerProcess = Number.MAX_SAFE_INTEGER;
    const preserveAll = Boolean(opts?.preserveAllColumns);

    const slimDetails = (details: Record<string, string | string[]>) => {
      if (preserveAll) {
        // Keep every column (including empty) and full text for Word export quality.
        const out: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(details ?? {})) {
          if (Array.isArray(value)) {
            out[key] = value.map((v) => String(v ?? '').slice(0, 4000));
          } else {
            out[key] = String(value ?? '').slice(0, 4000);
          }
        }
        return out;
      }

      const out: Record<string, string | string[]> = {};
      let count = 0;
      for (const [key, value] of Object.entries(details ?? {})) {
        if (count >= 48) break;
        const text = Array.isArray(value) ? value.join(', ') : value;
        if (String(text).trim()) {
          out[key] = String(text).slice(0, 1200);
          count += 1;
        }
      }
      return out;
    };

    const slimSub = (rows: SubProcessExport[]) =>
      rows.slice(0, maxSubProcessesPerProcess).map((sp) => ({
        ...sp,
        details: slimDetails(sp.details),
      }));

    if (exportJson.meta.scope === 'process') {
      const single = exportJson as BpmSingleProcessExportJson;
      return {
        ...single,
        subProcesses: slimSub(single.subProcesses),
        subProcessCount: Math.min(
          single.subProcessCount,
          maxSubProcessesPerProcess,
        ),
        templateColumns: single.templateColumns,
      };
    }

    const pfExport = exportJson as BpmProcessFunctionExportJson;
    return {
      ...pfExport,
      processes: pfExport.processes.map((slice) => ({
        ...slice,
        subProcesses: slimSub(slice.subProcesses),
        subProcessCount: Math.min(
          slice.subProcessCount,
          maxSubProcessesPerProcess,
        ),
        templateColumns: slice.templateColumns,
      })),
      templateColumns: pfExport.templateColumns,
    };
  }

  /** Free-form Markdown generation for Word export (streaming; continues if truncated). */
  private async callAutomationProse(
    client: Anthropic,
    model: string,
    system: string,
    userMessage: string,
    maxTokens = 16_384,
  ): Promise<{
    text: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage },
    ];
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    // Allow continues so section 5 covers every sub-process when truncated.
    const maxContinues = maxTokens >= 8_000 ? 2 : 0;

    for (let attempt = 0; attempt <= maxContinues; attempt += 1) {
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages,
      });
      const response = await stream.finalMessage();
      const chunk = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
      text = `${text}${chunk}`.trim();
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      if (response.stop_reason !== 'max_tokens') {
        break;
      }
      if (attempt === maxContinues) break;

      messages.push({ role: 'assistant', content: chunk });
      messages.push({
        role: 'user',
        content:
          'Continue exactly from where you stopped. Finish any remaining ## 5 sub-process analysis blocks (### code — name + rich paragraph for every catalogue step still missing). Do not repeat prior sections. No Table of Contents. No filler.',
      });
    }

    return {
      text,
      usage: { inputTokens, outputTokens },
    };
  }

  async generate(dto: GenerateAiBpmDto, userEmail: string) {
    await this.assertSuperAdmin(userEmail);

    const userPrompt = dto.userPrompt?.trim() ?? '';
    const templateIds = (dto.templateIds ?? []) as AiPromptTemplateId[];
    const templates = getAiPromptTemplates(templateIds);
    const templateNames = templates.map((t) => t.name);

    if (!userPrompt && templateIds.length === 0) {
      throw new BadRequestException(
        'Enter a prompt and/or select at least one deliverable.',
      );
    }
    if (
      userPrompt.length > 0 &&
      userPrompt.length < 20 &&
      templateIds.length === 0
    ) {
      throw new BadRequestException(
        'Enter a detailed prompt (at least 20 characters) or select deliverables.',
      );
    }

    const fallbackTemplateIds =
      templateIds.length > 0 ? templateIds : WORD_EXPORT_FALLBACK_TEMPLATES;

    return this.runWordGeneration({
      departmentId: dto.departmentId,
      processId: dto.processId?.trim() || undefined,
      userEmail,
      userPrompt,
      templateIds: fallbackTemplateIds,
      templateNames,
    });
  }

  /**
   * Starts Word generation in the background so the browser is not held on one long request.
   * Poll the job, then download the single file when it is ready.
   */
  startWordExportJob(dto: ExportAiBpmWordDto, userEmail: string) {
    this.pruneWordJobs();
    const job: WordExportJob = {
      id: randomUUID(),
      ownerEmail: userEmail.trim().toLowerCase(),
      status: 'running',
      phase: 'bpm',
      files: {},
      hasKit: false,
      dto,
      resumes: 0,
      stage: 'prepare',
      label: 'Preparing the document',
      progress: 1,
      createdAt: Date.now(),
      touchedAt: Date.now(),
    };
    this.wordJobs.set(job.id, job);
    this.persistWordJob(job);
    void this.runWordExportJob(job.id, dto, userEmail);
    return { jobId: job.id };
  }

  getWordExportJob(jobId: string, userEmail: string) {
    const job = this.requireWordJob(jobId, userEmail);
    const ready = (['bpm', 'sop', 'summary', 'jd'] as WordFileKind[]).filter(
      (kind) => job.files[kind],
    );
    const idle = job.status !== 'running';
    // Only offer the next document once the previous one exists and the job is idle.
    const next: 'sop' | 'summary' | null =
      !idle || !job.hasKit
        ? null
        : !job.files.sop
          ? job.files.bpm
            ? 'sop'
            : null
          : !job.files.summary
            ? 'summary'
            : null;
    return {
      jobId: job.id,
      status: job.status,
      phase: job.phase,
      stage: job.stage,
      label: job.label,
      progress: job.progress,
      filename: job.files[job.phase]?.filename ?? null,
      files: ready.map((kind) => ({
        kind,
        filename: job.files[kind].filename,
      })),
      next,
      // Job descriptions are written from the BPM data alone, so they can be asked for at any point.
      canJd: idle && job.hasKit && !!job.files.bpm && !job.files.jd,
      warningMessage: job.warningMessage ?? null,
      note: job.note ?? null,
      error: job.error ?? null,
    };
  }

  async downloadWordExportJob(
    jobId: string,
    userEmail: string,
    kind?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const job = this.requireWordJob(jobId, userEmail);
    const wanted: WordFileKind =
      kind === 'sop' || kind === 'summary' || kind === 'bpm' || kind === 'jd'
        ? kind
        : job.phase;
    const file = job.files[wanted];
    if (!file)
      throw new BadRequestException('This Word file is not ready yet.');
    job.touchedAt = Date.now();
    try {
      return {
        buffer: await this.wordJobStore.readFile(job.id, wanted),
        filename: file.filename,
      };
    } catch {
      throw new NotFoundException(
        'This Word file is no longer available. Please generate the Word document again.',
      );
    }
  }

  /** Starts the SOP (or the Summary SOP) from the data of the finished BPM document. */
  async startWordFollowUp(
    jobId: string,
    userEmail: string,
    kind: FollowUpKind,
  ) {
    const job = this.requireWordJob(jobId, userEmail);
    if (job.status === 'running') {
      throw new BadRequestException(
        'Another document is still being generated.',
      );
    }
    if (!job.hasKit || !job.files.bpm || !(await this.loadWordKit(job))) {
      throw new BadRequestException(
        'The data of this document is no longer available. Please generate the Word document again.',
      );
    }
    if (kind === 'summary' && !job.files.sop) {
      throw new BadRequestException(
        'Generate the SOP first, then the Summary SOP.',
      );
    }
    job.status = 'running';
    job.phase = kind;
    job.resumes = 0; // each phase gets its own single automatic resume
    job.error = undefined;
    job.stage = kind;
    job.progress = 1;
    job.label = {
      sop: 'Preparing the SOP',
      summary: 'Preparing the Summary SOP',
      jd: 'Preparing the job descriptions',
    }[kind];
    job.touchedAt = Date.now();
    this.persistWordJob(job);
    void this.runWordFollowUp(job, kind);
    return { jobId: job.id };
  }

  private async runWordFollowUp(job: WordExportJob, kind: FollowUpKind) {
    const kit = job.kit;
    if (!kit) return;
    try {
      const client = this.getAnthropicClient();
      if (kind === 'sop') {
        // One consolidated SOP across every process in the document.
        const result = await runSopPipeline(client, kit.named, (update) => {
          job.stage = update.stage;
          job.progress = Math.max(
            job.progress,
            Math.min(90, Math.round(update.percent * 0.9)),
          );
          job.label = update.label;
        });
        kit.named = kit.named.map((item, index) => ({
          ...item,
          bundle: result.bundles[index],
        }));
        kit.master = result.master;
      } else if (kind === 'summary') {
        const count = kit.named.length;
        // Processes are condensed a few at a time: each one is independent.
        const condensed = await mapInBatches(
          kit.named,
          4,
          (item) =>
            runSummaryPipeline(client, item.bundle, undefined, count > 1),
          (completed, total) => {
            job.stage = 'summary';
            job.progress = Math.max(
              job.progress,
              Math.min(
                90,
                Math.round((completed / total) * (count > 1 ? 80 : 90)),
              ),
            );
            job.label =
              total > 1
                ? `Condensed ${completed} of ${total} processes`
                : 'Condensing the process into a quick reference';
          },
        );
        kit.named.forEach((item, index) => {
          item.bundle = condensed[index];
        });
        if (count > 1) {
          job.stage = 'summary';
          job.progress = Math.max(job.progress, 84);
          job.label = 'Writing the overview of the whole function';
          kit.overview = await runSummaryOverview(
            client,
            kit.named,
            kit.master,
            this.functionNameOf(kit.meta),
          );
        }
      } else {
        kit.jd = await runJdPipeline(
          client,
          kit.named,
          kit.meta.scope === 'process'
            ? this.plainName(kit.meta.processName)
            : this.functionNameOf(kit.meta),
          (update) => {
            job.stage = update.stage;
            job.progress = Math.max(
              job.progress,
              Math.min(90, Math.round(update.percent * 0.9)),
            );
            job.label = update.label;
          },
        );
      }
      job.stage = 'build';
      job.progress = 94;
      job.label = {
        sop: 'Building the SOP (diagrams and page numbers)',
        summary: 'Building the Summary SOP',
        jd: 'Building the job descriptions (page numbers)',
      }[kind];
      const filename = kit.meta.docxFilename.replace(
        /_BPM\.docx$/i,
        {
          sop: '_SOP.docx',
          summary: '_SOP-Summary.docx',
          jd: '_Job-Descriptions.docx',
        }[kind],
      );
      const heading = {
        sop: 'Standard Operating Procedure',
        summary: 'Summary SOP',
        jd: 'Job Descriptions',
      }[kind];
      const meta: PipelineDocMeta = {
        ...kit.meta,
        docxFilename: filename,
        title: `${heading} — ${kit.meta.processName}`,
      };
      const buffer =
        kind === 'sop'
          ? await buildPipelineSopDocx(meta, kit.named, kit.master)
          : kind === 'summary'
            ? await buildPipelineSummaryDocx(
                meta,
                kit.named,
                kit.overview,
                kit.master,
              )
            : await buildPipelineJdDocx(meta, kit.named, kit.jd);
      await this.wordJobStore.saveFile(job.id, kind, buffer);
      await this.wordJobStore.saveJson(job.id, 'kit', kit);
      job.files[kind] = { filename };
      job.progress = 100;
      job.label = {
        sop: 'SOP is ready',
        summary: 'Summary SOP is ready',
        jd: 'Job descriptions are ready',
      }[kind];
      job.status = 'done';
    } catch (err: unknown) {
      job.status = 'error';
      job.error = this.wordJobErrorText(err);
      job.label = 'Generation stopped';
    } finally {
      job.touchedAt = Date.now();
      this.persistWordJob(job);
    }
  }

  private plainName(value: string): string {
    return (
      value.replace(/^\s*\d+(?:-\d+)+\s*[_:\-–—]\s*/, '').trim() || value.trim()
    );
  }

  private functionNameOf(meta: PipelineDocMeta): string {
    return this.plainName(meta.departmentName);
  }

  private requireWordJob(jobId: string, userEmail: string): WordExportJob {
    const job = this.wordJobs.get(jobId);
    if (!job) {
      throw new NotFoundException(
        'This Word generation job has expired. Please generate the Word document again.',
      );
    }
    if (job.ownerEmail !== userEmail.trim().toLowerCase()) {
      throw new ForbiddenException('You cannot open this Word generation job.');
    }
    return job;
  }

  private pruneWordJobs() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, job] of this.wordJobs) {
      if (job.status !== 'running' && job.touchedAt < cutoff) {
        this.wordJobs.delete(id);
        void this.wordJobStore.remove(id).catch(() => undefined);
      }
    }
  }

  private toPersistedWordJob(job: WordExportJob): PersistedWordJob {
    return {
      id: job.id,
      ownerEmail: job.ownerEmail,
      status: job.status,
      phase: job.phase,
      stage: job.stage,
      label: job.label,
      progress: job.progress,
      warningMessage: job.warningMessage,
      note: job.note,
      error: job.error,
      createdAt: job.createdAt,
      touchedAt: job.touchedAt,
      files: job.files,
      hasKit: job.hasKit,
      dto: job.dto,
      resumes: job.resumes,
    };
  }

  private persistWordJob(job: WordExportJob) {
    void this.wordJobStore
      .saveState(this.toPersistedWordJob(job))
      .catch((err: unknown) =>
        this.logger.error(
          `Could not save Word job ${job.id}: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
        ),
      );
  }

  private async loadWordKit(job: WordExportJob): Promise<WordExportKit | null> {
    if (job.kit) return job.kit;
    const kit = await this.wordJobStore.loadJson<WordExportKit>(job.id, 'kit');
    if (kit) job.kit = kit;
    return kit;
  }

  /** Loads jobs saved before the last restart and continues the ones that were interrupted. */
  async onModuleInit() {
    try {
      await this.wordJobStore.init();
      const saved = await this.wordJobStore.loadAll();
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const item of saved) {
        if (item.touchedAt < cutoff && item.status !== 'running') {
          void this.wordJobStore.remove(item.id).catch(() => undefined);
          continue;
        }
        const job: WordExportJob = {
          ...item,
          status: item.status,
          stage: item.stage as WordExportJob['stage'],
        };
        this.wordJobs.set(job.id, job);
        if (job.status === 'running') this.resumeWordJob(job);
      }
      if (saved.length) {
        this.logger.log(
          `Restored ${saved.length} Word generation job(s) from disk.`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `Could not restore Word jobs: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
      );
    }
  }

  /**
   * A restart interrupted this job. It is continued once: the BPM step resumes after the last
   * finished process, the SOP and Summary steps restart from the saved data.
   * A job that was already continued once and stopped again is reported instead, so a crash can never loop.
   */
  private resumeWordJob(job: WordExportJob) {
    const stop = (message: string) => {
      job.status = 'error';
      job.error = message;
      job.label = 'Generation stopped';
      job.touchedAt = Date.now();
      this.persistWordJob(job);
    };
    if (job.resumes >= 1) {
      return stop(
        'The server restarted while this was generating. Please try again.',
      );
    }
    job.resumes += 1;
    job.touchedAt = Date.now();
    job.label = 'The server restarted. Continuing where it stopped';
    if (job.phase === 'bpm') {
      if (!job.dto)
        return stop(
          'The server restarted while this was generating. Please generate again.',
        );
      this.persistWordJob(job);
      void this.runWordExportJob(job.id, job.dto, job.ownerEmail);
      return;
    }
    const kind = job.phase;
    void this.loadWordKit(job).then((kit) => {
      if (!kit)
        return stop(
          'The server restarted and the data of this document was lost. Please generate again.',
        );
      job.progress = 1;
      this.persistWordJob(job);
      return this.runWordFollowUp(job, kind);
    });
  }

  private async runWordExportJob(
    jobId: string,
    dto: ExportAiBpmWordDto,
    userEmail: string,
  ) {
    const job = this.wordJobs.get(jobId);
    if (!job) return;
    const processId = dto.processId?.trim() || undefined;
    try {
      // After a restart the processes finished so far are reused instead of paid for again.
      const completed =
        (await this.wordJobStore.loadJson<WordNamedBundle[]>(
          job.id,
          'partial',
        )) ?? [];
      const result = processId
        ? await this.exportSingleProcessWordViaClaudeFast({
            departmentId: dto.departmentId,
            processId,
            userEmail,
            onProgress: (update) => this.applyWordProgress(job, 0, 1, update),
          })
        : await this.exportProcessFunctionWordViaClaude({
            departmentId: dto.departmentId,
            userEmail,
            completed,
            onCheckpoint: (named) =>
              this.wordJobStore.saveJson(job.id, 'partial', named),
            onProgress: (index, count, update) =>
              this.applyWordProgress(job, index, count, update),
          });
      await this.wordJobStore.saveFile(job.id, 'bpm', result.buffer);
      if (result.kit)
        await this.wordJobStore.saveJson(job.id, 'kit', result.kit);
      void this.wordJobStore
        .removeJson(job.id, 'partial')
        .catch(() => undefined);
      job.files.bpm = { filename: result.docxFilename };
      job.kit = result.kit;
      job.hasKit = !!result.kit;
      job.touchedAt = Date.now();
      job.phase = 'bpm';
      job.warningMessage = result.warningMessage as string | null;
      job.progress = 100;
      job.stage = 'build';
      job.label = 'Word file is ready';
      job.status = 'done';
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        job.status = 'error';
        job.error = this.wordJobErrorText(err);
        job.label = 'Generation stopped';
        return;
      }
      try {
        job.stage = 'build';
        job.label =
          'Automation was interrupted. Building the file from BPM data';
        job.progress = 96;
        const fallback = await this.exportWordDocumentDeterministicFallback(
          dto,
          userEmail,
          err,
        );
        await this.wordJobStore.saveFile(
          job.id,
          'bpm',
          Buffer.from(fallback.docxBase64, 'base64'),
        );
        job.files.bpm = { filename: fallback.docxFilename };
        job.kit = undefined;
        job.hasKit = false;
        job.phase = 'bpm';
        job.warningMessage = fallback.warningMessage;
        job.progress = 100;
        job.label = 'Word file is ready';
        job.status = 'done';
      } catch (fallbackErr: unknown) {
        job.status = 'error';
        job.error = this.wordJobErrorText(fallbackErr);
        job.label = 'Generation stopped';
      }
    } finally {
      job.touchedAt = Date.now();
      this.persistWordJob(job);
    }
  }

  private applyWordProgress(
    job: WordExportJob,
    processIndex: number,
    processCount: number,
    update: PipelineProgress,
  ) {
    const count = Math.max(processCount, 1);
    const span = 92 / count;
    job.stage = update.stage;
    job.progress = Math.max(
      job.progress,
      Math.min(
        92,
        Math.round(processIndex * span + (update.percent / 100) * span),
      ),
    );
    job.label =
      count > 1
        ? `Process ${processIndex + 1} of ${count} — ${update.label}`
        : update.label;
    if (/data gap/i.test(update.label)) {
      const line = job.label;
      job.note =
        job.note && !job.note.includes(line)
          ? `${job.note}\n${line}`
          : job.note || line;
    }
  }

  private wordJobErrorText(err: unknown): string {
    if (
      err instanceof BadRequestException ||
      err instanceof ForbiddenException ||
      err instanceof NotFoundException
    ) {
      const body = err.getResponse();
      if (typeof body === 'string') return body;
      if (body && typeof body === 'object' && 'message' in body) {
        const message = (body as { message?: string | string[] }).message;
        if (Array.isArray(message)) return message.join('\n');
        if (message) return message;
      }
    }
    return err instanceof Error ? err.message : 'Word generation failed.';
  }

  /**
   * Process / Process-Function Download Word — Claude narrative + authoritative tables.
   * Process-function downloads generate ONE Claude chapter per process, then merge,
   * so the pack is never a TOC-only / truncated empty document.
   */
  async exportWordDocument(dto: ExportAiBpmWordDto, userEmail: string) {
    const processId = dto.processId?.trim() || undefined;

    try {
      const result = processId
        ? await this.exportSingleProcessWordViaClaudeFast({
            departmentId: dto.departmentId,
            processId,
            userEmail,
          })
        : await this.exportProcessFunctionWordViaClaude({
            departmentId: dto.departmentId,
            userEmail,
          });
      // The file travels as base64; the in-memory kit is never sent to the client.
      return {
        ...result,
        buffer: undefined,
        kit: undefined,
        docxBase64: result.buffer.toString('base64'),
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      return this.exportWordDocumentDeterministicFallback(dto, userEmail, err);
    }
  }

  private async exportWordDocumentDeterministicFallback(
    dto: ExportAiBpmWordDto,
    userEmail: string,
    err: unknown,
  ) {
    const processIdTrimmed = dto.processId?.trim() || undefined;
    let exportJson: BpmExportJson;
    let scope: 'process' | 'processFunction';
    let department: Department;
    let processCode: string | null = null;
    let processName: string;
    let processCount: number;
    let subProcessCount: number;

    if (processIdTrimmed) {
      const loaded = await this.loadProcessForExport(
        dto.departmentId,
        processIdTrimmed,
        userEmail,
      );
      department = loaded.department;
      exportJson = this.buildSingleProcessExportJson(
        department,
        loaded.process,
      );
      scope = 'process';
      processCode = loaded.process.code;
      processName =
        loaded.process.processName?.trim() ||
        loaded.process.name?.trim() ||
        loaded.process.code;
      processCount = 1;
      subProcessCount = exportJson.subProcessCount;
    } else {
      const loaded = await this.loadProcessFunctionForExport(
        dto.departmentId,
        userEmail,
      );
      department = loaded.department;
      exportJson = this.buildProcessFunctionExportJson(
        department,
        loaded.processes,
      );
      scope = 'processFunction';
      processCode = null;
      processName = `All processes (${exportJson.processCount})`;
      processCount = exportJson.processCount;
      subProcessCount = exportJson.subProcessCount;
    }

    const processLabel =
      scope === 'processFunction'
        ? `All processes in this process function (${processCount} process(es))`
        : `${processName} (${processCode})`;

    const coverDefaults: BpmDocumentJson['cover'] = {
      title: `Business Process Document — ${processLabel}`,
      processFunction: department.name,
      processFunctionCode: department.code,
      processTarget: processLabel,
      companyCode: department.companyCode,
      documentVersion: '1.0',
      confidentiality: 'Internal',
    };

    const generatedAt = new Date().toISOString();
    const docxFilename = buildDocxFilename(department.code, processCode);
    const document = buildDeterministicWordDocument(
      exportJson as Parameters<typeof buildDeterministicWordDocument>[0],
      coverDefaults,
      generatedAt,
    );
    const docxBuffer = await buildBpmDocumentDocxBuffer(
      document,
      generatedAt,
      docxFilename,
    );

    const errMsg =
      err instanceof Error ? err.message : 'Automation request failed.';

    return {
      scope,
      processName,
      departmentName: department.name,
      departmentCode: department.code,
      subProcessCount,
      docxFilename,
      docxBase64: docxBuffer.toString('base64'),
      warningMessage: `Claude generation unavailable (${errMsg}). Document built from BPM master data.`,
      generationSource: 'bpm-data-deterministic-fallback',
    };
  }

  /** Single-process Word: server tables (all columns) + short Claude narrative. */
  private async exportSingleProcessWordViaClaudeFast(input: {
    departmentId: string;
    processId: string;
    userEmail: string;
    onProgress?: (update: PipelineProgress) => void;
  }) {
    const loaded = await this.loadProcessForExport(
      input.departmentId,
      input.processId,
      input.userEmail,
    );
    const department = loaded.department;
    const singleJson = this.buildSingleProcessExportJson(
      department,
      loaded.process,
    );
    const enriched = (await this.enrichExportWithTemplateColumns(
      singleJson,
    )) as BpmSingleProcessExportJson;

    const processName =
      enriched.process.processName?.trim() ||
      enriched.process.name?.trim() ||
      enriched.process.code;

    const processLabel = `${processName} (${enriched.process.code})`;
    const generatedAt = new Date().toISOString();
    const docxFilename = buildDocxFilename(
      department.code,
      enriched.process.code,
    );
    input.onProgress?.({
      stage: 'prepare',
      label: 'Loading the process',
      percent: 2,
    });
    if (!enriched.subProcesses?.length) {
      throw new BadRequestException(`No steps were found for ${processLabel}.`);
    }
    const bundle = await runBpmPipeline(
      this.getAnthropicClient(),
      enriched.subProcesses,
      input.onProgress,
      { columns: enriched.templateColumns },
    );
    this.assertPipelineCanGenerate(bundle, processLabel);
    const meta = {
      title: `Business Process Document — ${processLabel}`,
      scope: 'process' as const,
      processName,
      processCode: enriched.process.code,
      departmentName: department.name,
      departmentCode: department.code,
      companyCode: department.companyCode,
      companyName: await this.companiesService.describeCompany(
        department.companyCode,
      ),
      generatedAt,
      docxFilename,
    };
    input.onProgress?.({
      stage: 'build',
      label: 'Building the Word file (diagrams and page numbers)',
      percent: 98,
    });
    const buffer = await buildPipelineBpmDocx(meta, [
      { label: processLabel, bundle },
    ]);

    return {
      scope: 'process' as const,
      processName,
      departmentName: department.name,
      departmentCode: department.code,
      subProcessCount: enriched.subProcessCount,
      docxFilename,
      buffer,
      kit: { meta, named: [{ label: processLabel, bundle }] } as WordExportKit,
      warningMessage: null,
      generationSource: 'prompt-library',
    };
  }

  /**
   * Process-function Word: parallel short Claude narratives + server tables per process.
   */
  private async exportProcessFunctionWordViaClaude(input: {
    departmentId: string;
    userEmail: string;
    /** Processes already written before an interruption. */
    completed?: WordNamedBundle[];
    onCheckpoint?: (named: WordNamedBundle[]) => Promise<void>;
    onProgress?: (
      processIndex: number,
      processCount: number,
      update: PipelineProgress,
    ) => void;
  }) {
    const loaded = await this.loadProcessFunctionForExport(
      input.departmentId,
      input.userEmail,
    );
    const department = loaded.department;
    const exportJson = this.buildProcessFunctionExportJson(
      department,
      loaded.processes,
    );
    const enriched = (await this.enrichExportWithTemplateColumns(
      exportJson,
    )) as BpmProcessFunctionExportJson;

    const client = this.getAnthropicClient();
    const named: Array<{ label: string; bundle: PipelineBundle }> = [];
    const skipped: string[] = [];
    const processCount = enriched.processes.length;
    for (let index = 0; index < enriched.processes.length; index += 1) {
      const slice = enriched.processes[index];
      const processName =
        slice.process.processName?.trim() ||
        slice.process.name?.trim() ||
        slice.process.code;
      const label = `${processName} (${slice.process.code})`;
      if (!slice.subProcesses?.length) {
        // A process without steps is skipped. It must never stop the whole document.
        skipped.push(label);
        input.onProgress?.(index, processCount, {
          stage: 'prepare',
          label: `Skipping ${label}: no steps recorded yet`,
          percent: 100,
        });
        continue;
      }
      const finished = input.completed?.find((item) => item.label === label);
      if (finished) {
        named.push(finished);
        input.onProgress?.(index, processCount, {
          stage: 'prepare',
          label: `Restored ${label}`,
          percent: 100,
        });
        continue;
      }
      const bundle = await runBpmPipeline(
        client,
        slice.subProcesses,
        (update) => input.onProgress?.(index, processCount, update),
        { columns: slice.templateColumns },
      );
      this.assertPipelineCanGenerate(bundle, label);
      named.push({ label, bundle });
      await input.onCheckpoint?.(named);
    }
    if (!named.length) {
      throw new BadRequestException(
        'None of the processes in this process function have steps yet.',
      );
    }

    const processLabel = `All processes in this process function (${enriched.processCount} process(es))`;
    const generatedAt = new Date().toISOString();
    const docxFilename = buildDocxFilename(department.code, null);
    const meta = {
      title: `Business Process Document — ${processLabel}`,
      scope: 'processFunction' as const,
      processName:
        department.name.replace(/^\s*\d+(?:-\d+)*\s*[_-]\s*/, '').trim() ||
        department.name,
      processCode: department.code,
      departmentName: department.name,
      departmentCode: department.code,
      companyCode: department.companyCode,
      companyName: await this.companiesService.describeCompany(
        department.companyCode,
      ),
      generatedAt,
      docxFilename,
    };
    input.onProgress?.(
      Math.max(processCount - 1, 0),
      Math.max(processCount, 1),
      {
        stage: 'build',
        label: 'Building the Word file (diagrams and page numbers)',
        percent: 98,
      },
    );
    const buffer = await buildPipelineBpmDocx(meta, named);

    return {
      scope: 'processFunction' as const,
      processName: `All processes (${enriched.processCount})`,
      departmentName: department.name,
      departmentCode: department.code,
      subProcessCount: enriched.subProcessCount,
      docxFilename,
      buffer,
      kit: { meta, named } as WordExportKit,
      warningMessage:
        [
          skipped.length
            ? `Skipped ${skipped.length} process(es) with no steps: ${skipped.join(', ')}.`
            : null,
        ]
          .filter(Boolean)
          .join(' ') || null,
      generationSource: 'prompt-library',
    };
  }

  private assertPipelineCanGenerate(bundle: PipelineBundle, label: string) {
    if (bundle.process?.length) return;
    throw new BadRequestException(`No steps were found for ${label}.`);
  }

  private async runWordGeneration(input: {
    departmentId: string;
    processId?: string;
    userEmail: string;
    userPrompt: string;
    templateIds: AiPromptTemplateId[];
    templateNames: string[];
    systemPrompt?: string;
    maxTokens?: number;
    useFlowHint?: boolean;
    useAuthoritativeData?: boolean;
    preserveAllColumns?: boolean;
  }) {
    const templates = getAiPromptTemplates(input.templateIds);
    const processId = input.processId;
    let exportJson: BpmExportJson;
    let scope: 'process' | 'processFunction';
    let department: Department;
    let processCode: string | null = null;
    let processName: string;
    let processCount: number;
    let subProcessCount: number;

    if (processId) {
      const loaded = await this.loadProcessForExport(
        input.departmentId,
        processId,
        input.userEmail,
      );
      department = loaded.department;
      exportJson = this.buildSingleProcessExportJson(
        department,
        loaded.process,
      );
      scope = 'process';
      processCode = loaded.process.code;
      processName =
        loaded.process.processName?.trim() ||
        loaded.process.name?.trim() ||
        loaded.process.code;
      processCount = 1;
      subProcessCount = exportJson.subProcessCount;
    } else {
      const loaded = await this.loadProcessFunctionForExport(
        input.departmentId,
        input.userEmail,
      );
      department = loaded.department;
      exportJson = this.buildProcessFunctionExportJson(
        department,
        loaded.processes,
      );
      scope = 'processFunction';
      processCode = null;
      processName = `All processes (${exportJson.processCount})`;
      processCount = exportJson.processCount;
      subProcessCount = exportJson.subProcessCount;
    }

    const enrichedExport =
      await this.enrichExportWithTemplateColumns(exportJson);
    const trimmedExport = this.trimExportForPrompt(enrichedExport, {
      preserveAllColumns:
        input.preserveAllColumns ?? input.useAuthoritativeData,
    });
    const processJson = JSON.stringify(trimmedExport, null, 2);
    const flowHint = input.useFlowHint
      ? buildFlowHintFromExportJson(trimmedExport)
      : undefined;
    const authoritativeData = input.useAuthoritativeData
      ? buildAuthoritativeDataMarkdown(
          trimmedExport as Parameters<typeof buildAuthoritativeDataMarkdown>[0],
        )
      : undefined;

    const processLabel =
      scope === 'processFunction'
        ? `All processes in this process function (${processCount} process(es))`
        : `${processName} (${processCode})`;

    const proseUserMessage = buildProseUserMessage({
      departmentName: department.name,
      departmentCode: department.code,
      processLabel,
      scope,
      userPrompt: input.userPrompt || undefined,
      deliverableInstructions: templates.map((t) => t.deliverableInstruction),
      processJson,
      flowHint,
      authoritativeData,
    });

    const client = this.getAnthropicClient();
    const model = process.env.ANTHROPIC_MODEL?.trim() ?? 'claude-sonnet-4-6';
    const systemPrompt = input.systemPrompt ?? AI_BPM_PROSE_SYSTEM_PROMPT;
    const maxTokens = input.maxTokens ?? 16_384;

    let markdown: string;
    let usage = { inputTokens: 0, outputTokens: 0 };
    try {
      const automationOut = await this.callAutomationProse(
        client,
        model,
        systemPrompt,
        proseUserMessage,
        maxTokens,
      );
      markdown = automationOut.text;
      usage = automationOut.usage;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Automation API request failed.';
      throw new ServiceUnavailableException(message);
    }

    if (markdown.length < 200) {
      throw new BadRequestException(
        'Automation returned a very short response. Refine your prompt or try again with a single process.',
      );
    }

    markdown = sanitizeProcessMarkdownForMerge(markdown);
    let generationSource = 'automation-prose-word';
    let warningMessage: string | null = null;

    if (
      input.useAuthoritativeData &&
      isMarkdownContentTooThin(markdown) &&
      authoritativeData
    ) {
      markdown = `${authoritativeData}\n\n${markdown}`;
      generationSource = 'automation-prose-word-auth-augmented';
    }

    const coverDefaults: BpmDocumentJson['cover'] = {
      title: `Business Process Document — ${processLabel}`,
      processFunction: department.name,
      processFunctionCode: department.code,
      processTarget: processLabel,
      companyCode: department.companyCode,
      documentVersion: '1.0',
      confidentiality: 'Internal',
    };

    const generatedAt = new Date().toISOString();
    const docxFilename = buildDocxFilename(department.code, processCode);
    let docxBuffer: Buffer;

    try {
      docxBuffer = await buildProseWordDocxBuffer({
        markdown,
        cover: coverDefaults,
        generatedAt,
        docxFilename,
      });
    } catch (wordErr) {
      docxBuffer = await this.buildDocxFallbackFromMarkdown(
        markdown,
        exportJson,
        input.templateIds,
        coverDefaults,
        docxFilename,
        generatedAt,
      );
      generationSource = 'automation-prose-structured-fallback';
      warningMessage =
        (wordErr instanceof Error
          ? wordErr.message
          : 'Word export fallback used.') +
        ' Open in Word desktop, switch to Print Layout, then press F9 to refresh page numbers in the table of contents.';
    }

    const sectionHeadings = extractMarkdownSectionHeadings(markdown);

    const documentJson = parseBpmDocumentJsonLenient(markdown, {
      title: coverDefaults.title,
      processFunction: coverDefaults.processFunction,
      processFunctionCode: coverDefaults.processFunctionCode,
      processTarget: coverDefaults.processTarget,
      companyCode: coverDefaults.companyCode,
    }).document;

    return {
      scope,
      userPrompt: input.userPrompt || null,
      templateIds: input.templateIds,
      templateNames: input.templateNames,
      processId: processId ?? null,
      processCode,
      processName,
      processCount,
      departmentCode: department.code,
      departmentName: department.name,
      subProcessCount,
      generationSource,
      warningMessage,
      markdown,
      document: documentJson,
      docxFilename,
      docxBase64: docxBuffer.toString('base64'),
      sectionHeadings,
      usage,
    };
  }

  private async buildDocxFallbackFromMarkdown(
    markdown: string,
    exportJson: BpmExportJson,
    templateIds: AiPromptTemplateId[],
    coverDefaults: BpmDocumentJson['cover'],
    docxFilename: string,
    generatedAt: string,
  ): Promise<Buffer> {
    const parsed = parseBpmDocumentJsonLenient(markdown, {
      title: coverDefaults.title,
      processFunction: coverDefaults.processFunction,
      processFunctionCode: coverDefaults.processFunctionCode,
      processTarget: coverDefaults.processTarget,
      companyCode: coverDefaults.companyCode,
    });

    let documentJson = this.enrichDocumentCover(parsed.document, {
      departmentName: coverDefaults.processFunction,
      departmentCode: coverDefaults.processFunctionCode,
      companyCode: coverDefaults.companyCode ?? '',
      processLabel: coverDefaults.processTarget,
    });

    if (documentJson.sections.length < 2) {
      documentJson = buildDeterministicWordDocument(
        exportJson as Parameters<typeof buildDeterministicWordDocument>[0],
        coverDefaults,
        generatedAt,
      );
    }

    return buildBpmDocumentDocxBuffer(documentJson, generatedAt, docxFilename);
  }

  private enrichDocumentCover(
    doc: BpmDocumentJson,
    vars: {
      departmentName: string;
      departmentCode: string;
      companyCode: string;
      processLabel: string;
    },
  ): BpmDocumentJson {
    return {
      ...doc,
      cover: {
        ...doc.cover,
        processFunction: doc.cover.processFunction || vars.departmentName,
        processFunctionCode:
          doc.cover.processFunctionCode || vars.departmentCode,
        processTarget: doc.cover.processTarget || vars.processLabel,
        companyCode: doc.cover.companyCode || vars.companyCode,
        title:
          doc.cover.title || `Business Process Document — ${vars.processLabel}`,
      },
    };
  }
}
