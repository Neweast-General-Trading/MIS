import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Brackets, Repository } from 'typeorm';

import { AccessControlService } from 'src/access-control/access-control.service';
import { AccessUserEntity } from 'src/access-control/entities/user.entity';
import { Department } from 'src/departments/entities/department.entity';
import { ProcessEntity } from 'src/processes/entities/process.entity';

import {
  ProcessDocumentationFileEntity,
  type ProcessDocumentationSource,
} from './entities/process-documentation-file.entity';
import type {
  DocumentationFileDto,
  DocumentationGroupedRecordDto,
} from './dto/documentation-grouped-record.dto';
import type { ListDocumentationRecordsDto } from './dto/list-documentation-records.dto';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

@Injectable()
export class ProcessDocumentationService {
  constructor(
    @InjectRepository(ProcessDocumentationFileEntity)
    private readonly fileRepository: Repository<ProcessDocumentationFileEntity>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(ProcessEntity)
    private readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(AccessUserEntity)
    private readonly accessUserRepository: Repository<AccessUserEntity>,
    private readonly accessControlService: AccessControlService,
  ) {}

  private async assertSuperAdmin(userEmail: string) {
    const allowed = await this.accessControlService.userIsSuperAdmin(userEmail);
    if (!allowed) {
      throw new ForbiddenException('Only Super Admin can access process documentation.');
    }
  }

  private async resolveUploaderLabel(email: string): Promise<string> {
    const normalized = email.trim().toLowerCase();
    const row = await this.accessUserRepository
      .createQueryBuilder('user')
      .select('user.displayName', 'displayName')
      .where('user.email = :email', { email: normalized })
      .getRawOne<{ displayName: string | null }>();
    const display = row?.displayName?.trim() ?? '';
    return display || normalized;
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
          /* skip inaccessible process */
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

  async listRecords(userEmail: string, query: ListDocumentationRecordsDto) {
    await this.assertSuperAdmin(userEmail);
    const { deptIds, procIds } = await this.resolveAccessibleScopeIds(userEmail);
    if (!deptIds.length && !procIds.length) {
      return {
        items: [],
        total: 0,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 10,
      };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const qb = this.buildRecordsQuery(deptIds, procIds, query);
    qb.orderBy('f.createdAt', 'DESC');
    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    await this.backfillRowCodes(rows);

    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page,
      pageSize,
    };
  }

  async listGroupedRecords(userEmail: string, query: ListDocumentationRecordsDto) {
    await this.assertSuperAdmin(userEmail);
    const { deptIds, procIds } = await this.resolveAccessibleScopeIds(userEmail);
    if (!deptIds.length && !procIds.length) {
      return {
        items: [] as DocumentationGroupedRecordDto[],
        total: 0,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 10,
      };
    }

    const qb = this.buildRecordsQuery(deptIds, procIds, {
      ...query,
      source: undefined,
    });
    qb.orderBy('f.createdAt', 'DESC');
    const rows = await qb.getMany();
    await this.backfillRowCodes(rows);
    const files = rows.map((row) => this.toDto(row));

    const groupMap = new Map<string, DocumentationGroupedRecordDto>();
    for (const file of files) {
      const departmentId = file.departmentId ?? '';
      const processId = file.processId ?? null;
      const scopeKey = this.groupScopeKey(file);
      let group = groupMap.get(scopeKey);
      if (!group) {
        group = {
          scopeKey,
          departmentId: departmentId || '',
          processId,
          processFunctionCode: file.processFunctionCode,
          processCode: file.processCode,
          automationFiles: [],
          uploadFiles: [],
          commentTargetId: null,
          comments: null,
        };
        groupMap.set(scopeKey, group);
      }
      if (!group.processFunctionCode && file.processFunctionCode) {
        group.processFunctionCode = file.processFunctionCode;
      }
      if (!group.processCode && file.processCode) {
        group.processCode = file.processCode;
      }
      if (file.source === 'automation') {
        group.automationFiles.push(file);
      } else {
        group.uploadFiles.push(file);
      }
    }

    let groups = Array.from(groupMap.values());

    if (query.source === 'automation') {
      groups = groups.filter((g) => g.automationFiles.length > 0);
    } else if (query.source === 'upload') {
      groups = groups.filter((g) => g.uploadFiles.length > 0);
    }

    groups.sort((a, b) => {
      const latest = (g: DocumentationGroupedRecordDto) => {
        const all = [...g.automationFiles, ...g.uploadFiles];
        return all.reduce(
          (max, f) => Math.max(max, new Date(f.createdAt).getTime()),
          0,
        );
      };
      return latest(b) - latest(a);
    });

    for (const group of groups) {
      const primary =
        group.automationFiles[0] ?? group.uploadFiles[0] ?? null;
      group.commentTargetId = primary?.id ?? null;
      group.comments =
        group.automationFiles.find((f) => f.comments)?.comments ??
        group.uploadFiles.find((f) => f.comments)?.comments ??
        null;
      if (!group.departmentId) {
        const deptId =
          group.automationFiles.find((f) => f.departmentId)?.departmentId ??
          group.uploadFiles.find((f) => f.departmentId)?.departmentId ??
          primary?.departmentId ??
          null;
        group.departmentId = deptId;
      }
      if (!group.processId && primary?.processId) {
        group.processId = primary.processId;
      }
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const total = groups.length;
    const items = groups.slice((page - 1) * pageSize, page * pageSize);

    return { items, total, page, pageSize };
  }

  /** One table row per process function / process (by business codes, not raw UUID drift). */
  private groupScopeKey(file: DocumentationFileDto): string {
    const pf = (file.processFunctionCode ?? '').trim().toUpperCase();
    const pc = (file.processCode ?? '').trim().toUpperCase();
    if (pf) {
      return `pf:${pf}|pc:${pc}`;
    }
    return `id:${file.departmentId ?? ''}|${file.processId ?? ''}`;
  }

  private buildRecordsQuery(
    deptIds: string[],
    procIds: string[],
    query: ListDocumentationRecordsDto,
  ) {
    const qb = this.fileRepository.createQueryBuilder('f');
    if (deptIds.length && procIds.length) {
      qb.where(
        new Brackets((w) => {
          w.where('f.departmentId IN (:...deptIds)', { deptIds }).orWhere(
            'f.processId IN (:...procIds)',
            { procIds },
          );
        }),
      );
    } else if (deptIds.length) {
      qb.where('f.departmentId IN (:...deptIds)', { deptIds });
    } else {
      qb.where('f.processId IN (:...procIds)', { procIds });
    }

    if (query.processFunctionCode?.trim()) {
      qb.andWhere('f.processFunctionCode ILIKE :pfc', {
        pfc: `%${query.processFunctionCode.trim()}%`,
      });
    }
    if (query.processCode?.trim()) {
      qb.andWhere('f.processCode ILIKE :pc', {
        pc: `%${query.processCode.trim()}%`,
      });
    }
    if (query.source === 'upload' || query.source === 'automation') {
      const sources =
        query.source === 'automation' ? ['automation', 'claude'] : [query.source];
      qb.andWhere('f.source IN (:...sources)', { sources });
    }
    if (query.search?.trim()) {
      const q = `%${query.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('f.originalName ILIKE :q', { q })
            .orWhere('f.comments ILIKE :q', { q })
            .orWhere('f.processFunctionCode ILIKE :q', { q })
            .orWhere('f.processCode ILIKE :q', { q });
        }),
      );
    }

    return qb;
  }

  async approveAutomationDocument(input: {
    departmentId: string;
    processId?: string | null;
    docxBase64: string;
    docxFilename: string;
    comments?: string;
    userEmail: string;
  }) {
    await this.assertSuperAdmin(input.userEmail);
    let buffer: Buffer;
    try {
      buffer = Buffer.from(input.docxBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid document payload.');
    }
    if (!buffer.length) {
      throw new BadRequestException('Document file is empty.');
    }
    if (buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException('Document exceeds the 25 MB limit.');
    }

    const department = await this.departmentRepository.findOne({
      where: { id: input.departmentId },
    });
    if (!department) {
      throw new NotFoundException('Process function not found.');
    }

    let process: ProcessEntity | null = null;
    if (input.processId) {
      await this.accessControlService.assertUserCanAccessProcess(
        input.userEmail,
        input.departmentId,
        input.processId,
      );
      process = await this.processRepository.findOne({
        where: { id: input.processId, departmentId: input.departmentId },
      });
      if (!process) {
        throw new NotFoundException('Process not found in this process function.');
      }
    } else {
      await this.accessControlService.assertUserCanAccessDepartment(
        input.userEmail,
        input.departmentId,
      );
    }

    const originalName =
      input.docxFilename?.trim() ||
      `Automation-BPM-${department.code}${process ? `_${process.code}` : ''}.docx`;

    return this.saveFile({
      departmentId: input.departmentId,
      processId: process?.id ?? null,
      scopeKey: process
        ? `proc-${process.code || process.id}`
        : `dept-${department.code || input.departmentId}`,
      file: {
        buffer,
        originalname: originalName,
        mimetype:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      userEmail: input.userEmail,
      source: 'automation',
      processFunctionCode: department.code,
      processCode: process?.code ?? null,
      comments: input.comments?.trim() || null,
    });
  }

  async updateComments(
    fileId: string,
    comments: string | null | undefined,
    userEmail: string,
  ) {
    await this.assertSuperAdmin(userEmail);
    const row = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!row) {
      throw new NotFoundException('Documentation file not found.');
    }
    await this.assertRowAccess(userEmail, row);
    row.comments =
      comments === undefined || comments === null
        ? null
        : comments.trim().slice(0, 4000) || null;
    const saved = await this.fileRepository.save(row);
    return this.toDto(saved);
  }

  private async assertRowAccess(
    userEmail: string,
    row: ProcessDocumentationFileEntity,
  ) {
    if (row.departmentId) {
      await this.accessControlService.assertUserCanAccessDepartment(
        userEmail,
        row.departmentId,
      );
      return;
    }
    if (row.processId) {
      const process = await this.processRepository.findOne({
        where: { id: row.processId },
      });
      if (!process?.departmentId) {
        throw new NotFoundException('Process not found.');
      }
      await this.accessControlService.assertUserCanAccessProcess(
        userEmail,
        process.departmentId,
        row.processId,
      );
    }
  }

  private async resolveAccessibleScopeIds(userEmail: string) {
    const departments = await this.departmentRepository.find({
      relations: { processes: true },
    });
    const deptIds: string[] = [];
    const procIds: string[] = [];
    for (const dept of departments) {
      try {
        await this.accessControlService.assertUserCanAccessDepartment(
          userEmail,
          dept.id,
        );
        deptIds.push(dept.id);
      } catch {
        /* may still access some processes */
      }
      for (const proc of dept.processes ?? []) {
        try {
          await this.accessControlService.assertUserCanAccessProcess(
            userEmail,
            dept.id,
            proc.id,
          );
          procIds.push(proc.id);
        } catch {
          /* skip */
        }
      }
    }
    return { deptIds, procIds };
  }

  async listForDepartment(departmentId: string, userEmail: string) {
    await this.assertSuperAdmin(userEmail);
    await this.accessControlService.assertUserCanAccessDepartment(
      userEmail,
      departmentId,
    );
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
    });
    if (!department) {
      throw new NotFoundException('Process function not found.');
    }
    const files = await this.fileRepository.find({
      where: { departmentId, processId: null },
      order: { createdAt: 'DESC' },
    });
    return files.map((row) => this.toDto(row));
  }

  async listForProcess(
    departmentId: string,
    processId: string,
    userEmail: string,
  ) {
    await this.assertSuperAdmin(userEmail);
    await this.accessControlService.assertUserCanAccessProcess(
      userEmail,
      departmentId,
      processId,
    );
    const process = await this.processRepository.findOne({
      where: { id: processId, departmentId },
    });
    if (!process) {
      throw new NotFoundException('Process not found in this process function.');
    }
    const files = await this.fileRepository.find({
      where: { processId },
      order: { createdAt: 'DESC' },
    });
    return files.map((row) => this.toDto(row));
  }

  async uploadToDepartment(
    departmentId: string,
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
    userEmail: string,
  ) {
    await this.assertSuperAdmin(userEmail);
    await this.accessControlService.assertUserCanAccessDepartment(
      userEmail,
      departmentId,
    );
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
    });
    if (!department) {
      throw new NotFoundException('Process function not found.');
    }
    return this.saveFile({
      departmentId,
      processId: null,
      scopeKey: `dept-${department.code || departmentId}`,
      file,
      userEmail,
      source: 'upload',
      processFunctionCode: department.code,
      processCode: null,
    });
  }

  async uploadToProcess(
    departmentId: string,
    processId: string,
    file: { buffer: Buffer; originalname?: string; mimetype?: string },
    userEmail: string,
  ) {
    await this.assertSuperAdmin(userEmail);
    await this.accessControlService.assertUserCanAccessProcess(
      userEmail,
      departmentId,
      processId,
    );
    const process = await this.processRepository.findOne({
      where: { id: processId, departmentId },
    });
    if (!process) {
      throw new NotFoundException('Process not found in this process function.');
    }
    const department = await this.departmentRepository.findOne({
      where: { id: departmentId },
    });
    return this.saveFile({
      departmentId,
      processId,
      scopeKey: `proc-${process.code || processId}`,
      file,
      userEmail,
      source: 'upload',
      processFunctionCode: department?.code ?? null,
      processCode: process.code,
    });
  }

  async download(fileId: string, userEmail: string): Promise<StreamableFile> {
    await this.assertSuperAdmin(userEmail);
    const row = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!row) {
      throw new NotFoundException('Documentation file not found.');
    }
    await this.assertRowAccess(userEmail, row);
    const absolutePath = this.resolveAbsolutePath(row.storedPath);
    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('File is missing on the server.');
    }
    const stream = createReadStream(absolutePath);
    return new StreamableFile(stream, {
      type: row.mimeType ?? 'application/octet-stream',
      disposition: `attachment; filename="${encodeURIComponent(row.originalName)}"`,
    });
  }

  async remove(fileId: string, userEmail: string) {
    await this.assertSuperAdmin(userEmail);
    const row = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!row) {
      throw new NotFoundException('Documentation file not found.');
    }
    await this.assertRowAccess(userEmail, row);
    const absolutePath = this.resolveAbsolutePath(row.storedPath);
    try {
      await fs.unlink(absolutePath);
    } catch {
      /* file may already be gone */
    }
    await this.fileRepository.delete({ id: fileId });
    return { deleted: true as const };
  }

  private async saveFile(input: {
    departmentId: string | null;
    processId: string | null;
    scopeKey: string;
    file: { buffer: Buffer; originalname?: string; mimetype?: string };
    userEmail: string;
    source?: ProcessDocumentationSource;
    processFunctionCode?: string | null;
    processCode?: string | null;
    comments?: string | null;
  }) {
    if (!input.file?.buffer?.length) {
      throw new BadRequestException('Choose a file to upload.');
    }
    if (input.file.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException('File exceeds the 25 MB limit.');
    }
    const saved = await this.writeToDisk(
      input.file.buffer,
      input.scopeKey,
      input.file.originalname,
    );
    const uploadedByName = await this.resolveUploaderLabel(input.userEmail);
    const entity = this.fileRepository.create({
      departmentId: input.departmentId,
      processId: input.processId,
      source: input.source ?? 'upload',
      processFunctionCode: input.processFunctionCode?.trim() || null,
      processCode: input.processCode?.trim() || null,
      comments: input.comments ?? null,
      originalName: saved.originalName,
      storedPath: saved.storedPath,
      storedFileName: saved.storedFileName,
      mimeType: input.file.mimetype?.trim() || null,
      fileSize: input.file.buffer.length,
      uploadedByEmail: input.userEmail.trim().toLowerCase(),
      uploadedByName,
    });
    const created = await this.fileRepository.save(entity);
    return this.toDto(created);
  }

  private async writeToDisk(
    fileBuffer: Buffer,
    scopeKey: string,
    originalName?: string,
  ) {
    const safeScope = scopeKey.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
    const safeName = (originalName || 'document.bin')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120);
    const storedFileName = `${safeScope}-${Date.now()}-${randomUUID()}-${safeName}`;
    const dir = path.resolve(
      process.cwd(),
      'docx',
      'BPM-Files',
      'process-documentation',
      safeScope,
    );
    const publicRoot = path.resolve(process.cwd(), 'docx', 'BPM-Files');
    await fs.mkdir(dir, { recursive: true });
    const storedPath = path.join(dir, storedFileName);
    await fs.writeFile(storedPath, fileBuffer);
    const relativePublic = path.relative(publicRoot, storedPath).replace(/\\/g, '/');
    const pathForDb =
      !relativePublic.startsWith('..') && !path.isAbsolute(relativePublic)
        ? `/docx/BPM-Files/${relativePublic}`
        : storedPath;
    return {
      storedPath: pathForDb,
      originalName: originalName?.trim() || safeName,
      storedFileName,
    };
  }

  private resolveAbsolutePath(storedPath: string): string {
    const trimmed = storedPath.trim();
    if (trimmed.startsWith('/docx/BPM-Files/')) {
      return path.resolve(process.cwd(), trimmed.replace(/^\//, ''));
    }
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
  }

  private async backfillRowCodes(rows: ProcessDocumentationFileEntity[]) {
    for (const row of rows) {
      if (row.processFunctionCode) continue;
      if (row.departmentId) {
        const dept = await this.departmentRepository.findOne({
          where: { id: row.departmentId },
        });
        if (dept) row.processFunctionCode = dept.code;
      } else if (row.processId) {
        const process = await this.processRepository.findOne({
          where: { id: row.processId },
          relations: { department: true },
        });
        if (process) {
          row.processCode = process.code;
          row.processFunctionCode = process.department?.code ?? null;
          if (process.departmentId && !row.departmentId) {
            row.departmentId = process.departmentId;
          }
        }
      }
    }
  }

  private toDto(row: ProcessDocumentationFileEntity): DocumentationFileDto {
    const rawSource = String(row.source ?? 'upload');
    const source =
      rawSource === 'claude' || rawSource === 'automation' ? 'automation' : 'upload';
    return {
      id: row.id,
      departmentId: row.departmentId,
      processId: row.processId,
      source,
      processFunctionCode: row.processFunctionCode,
      processCode: row.processCode,
      comments: row.comments,
      originalName: row.originalName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      uploadedByEmail: row.uploadedByEmail,
      uploadedByName: row.uploadedByName,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
