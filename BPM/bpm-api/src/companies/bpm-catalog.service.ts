import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActivityEntity } from 'src/activities/entities/activity.entity';
import { isRaciRoleFieldKeyOrLabel } from 'src/common/raci-role-fields.util';
import { Department } from 'src/departments/entities/department.entity';
import { mapHanaBranchToBpmCode } from 'src/hana/company-branch-map';
import { hanaDepartmentMatchesOrgName } from 'src/hana/hana-dept-org-map';
import { OracleHcmService } from 'src/oracle/oracle-hcm.service';
import { ProcessEntity } from 'src/processes/entities/process.entity';
import { CompanyEntity } from './entities/company.entity';

function normalizeDeptToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function departmentMatches(
  deptName: string,
  bpmName: string,
  orgName: string | null,
) {
  const target = normalizeDeptToken(deptName);
  const candidates = [bpmName, orgName ?? '']
    .map(normalizeDeptToken)
    .filter(Boolean);
  const tokenMatch = candidates.some(
    (candidate) =>
      candidate === target ||
      candidate.includes(target) ||
      target.includes(candidate),
  );
  if (tokenMatch) return true;
  return hanaDepartmentMatchesOrgName(deptName, orgName);
}

function expandDesignationFragments(value: string): string[] {
  return value
    .split(/[/,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeDesignationLists(
  primary: string[],
  secondary: string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...primary, ...secondary]) {
    const label = item.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(label);
  }
  return merged.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

@Injectable()
export class BpmCatalogService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(ProcessEntity)
    private readonly processRepository: Repository<ProcessEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,
    private readonly oracleHcmService: OracleHcmService,
  ) {}

  private async resolveOracleBusinessUnitId(
    companyCode: string,
  ): Promise<string | null> {
    if (!companyCode) return null;
    const row = await this.companyRepository.findOne({
      where: { code: companyCode },
    });
    return row?.oracleBusinessUnitId?.trim() || null;
  }

  async listDesignations(hanaBranch?: string, bpmCode?: string) {
    const branch = hanaBranch?.trim() ?? '';
    const companyCode =
      mapHanaBranchToBpmCode(branch) || bpmCode?.trim().toUpperCase() || '';

    let fromOracle: string[] = [];
    if (this.oracleHcmService.isConfigured()) {
      try {
        const businessUnitId =
          await this.resolveOracleBusinessUnitId(companyCode);
        fromOracle =
          await this.oracleHcmService.fetchDesignations(businessUnitId);
      } catch {
        fromOracle = [];
      }
    }

    const fromSaved = companyCode
      ? await this.listSavedRaciDesignations(companyCode)
      : [];

    return mergeDesignationLists(fromOracle, fromSaved);
  }

  /**
   * Job-role picker: Oracle HCM Jobs (generic grades such as Manager / Director) PLUS every active
   * Oracle Position / designation (HR Officer, Head of HR, …), plus values already saved on RACI
   * fields. Positions are included for all business units so a title that exists in Oracle is never
   * missing from the list.
   */
  async listJobRoles(hanaBranch?: string, bpmCode?: string) {
    const branch = hanaBranch?.trim() ?? '';
    const companyCode =
      mapHanaBranchToBpmCode(branch) || bpmCode?.trim().toUpperCase() || '';

    let fromOracle: string[] = [];
    let fromPositions: string[] = [];
    if (this.oracleHcmService.isConfigured()) {
      try {
        fromOracle = await this.oracleHcmService.fetchJobRoles();
      } catch {
        fromOracle = [];
      }
      try {
        fromPositions = await this.oracleHcmService.fetchDesignations(null);
      } catch {
        fromPositions = [];
      }
    }

    const fromSaved = companyCode
      ? await this.listSavedRaciDesignations(companyCode)
      : [];

    return mergeDesignationLists(
      mergeDesignationLists(fromOracle, fromPositions),
      fromSaved,
    );
  }

  /** Values already saved on activities — kept in dropdown only; stored data is never changed. */
  private async listSavedRaciDesignations(
    companyCode: string,
  ): Promise<string[]> {
    const rows = await this.activityRepository
      .createQueryBuilder('activity')
      .innerJoin('activity.process', 'process')
      .innerJoin('process.department', 'department')
      .where('department.companyCode = :companyCode', { companyCode })
      .select(['activity.details'])
      .getMany();

    const seen = new Set<string>();
    const items: string[] = [];

    for (const row of rows) {
      const details = row.details ?? {};
      for (const [key, raw] of Object.entries(details)) {
        if (!isRaciRoleFieldKeyOrLabel(key, key)) continue;
        const values = Array.isArray(raw)
          ? raw.map((entry) => String(entry ?? ''))
          : [String(raw ?? '')];
        for (const value of values) {
          for (const fragment of expandDesignationFragments(value)) {
            const keyLower = fragment.toLowerCase();
            if (seen.has(keyLower)) continue;
            seen.add(keyLower);
            items.push(fragment);
          }
        }
      }
    }

    return items;
  }

  async listProcessFunctionsForDepartment(
    hanaBranch: string,
    departmentName: string,
  ) {
    const bpmCompany = mapHanaBranchToBpmCode(hanaBranch);
    const targetName = departmentName.trim().toLowerCase();
    const rows = await this.departmentRepository.find({
      where: { companyCode: bpmCompany },
      relations: { orgDepartment: true },
      order: { name: 'ASC' },
    });

    const mapped = rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      companyCode: row.companyCode,
      orgDepartmentName: row.orgDepartment?.name ?? null,
      hanaDepartmentName: row.hanaDepartmentName ?? null,
    }));

    const exactHana = mapped.filter(
      (row) => row.hanaDepartmentName?.trim().toLowerCase() === targetName,
    );
    if (exactHana.length > 0) {
      return exactHana.map(({ hanaDepartmentName: _h, ...rest }) => rest);
    }

    const matched = mapped.filter((row) =>
      departmentMatches(
        departmentName,
        row.name,
        row.hanaDepartmentName ?? row.orgDepartmentName,
      ),
    );

    const result = matched.length > 0 ? matched : mapped;
    return result.map(({ hanaDepartmentName: _h, ...rest }) => rest);
  }

  async listProcessesForFunction(departmentId: string) {
    const rows = await this.processRepository.find({
      where: { departmentId },
      order: { code: 'ASC', processName: 'ASC' },
      select: {
        id: true,
        code: true,
        processName: true,
        name: true,
        departmentId: true,
      },
    });
    return rows;
  }

  async listSubProcessesForProcess(processId: string) {
    const rows = await this.activityRepository.find({
      where: { processId },
      order: { sln: 'ASC', code: 'ASC' },
      select: {
        id: true,
        code: true,
        activityName: true,
        parentActivityId: true,
      },
    });
    return rows;
  }

  async listProcessesForPolicyLink(hanaBranch: string, departmentName: string) {
    const functions = await this.listProcessFunctionsForDepartment(
      hanaBranch,
      departmentName,
    );
    const processFunction = functions[0] ?? null;
    const processes = processFunction
      ? await this.listProcessesForFunction(processFunction.id)
      : [];

    return {
      processFunction,
      processes: processes.map((process) => ({
        id: process.id,
        code: process.code,
        name: process.processName || process.name,
      })),
    };
  }
}
