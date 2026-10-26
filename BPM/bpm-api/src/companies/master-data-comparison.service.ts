import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActivityEntity } from 'src/activities/entities/activity.entity';
import { isRaciRoleFieldKeyOrLabel } from 'src/common/raci-role-fields.util';
import { Department } from 'src/departments/entities/department.entity';
import { SqlEmpMasterService } from 'src/sql/sql-emp-master.service';

import { CompanyEntity } from './entities/company.entity';

export type MasterDataLegalEntitySide = {
  name: string;
  database?: string;
  businessUnit?: string;
  employeeCount?: number;
};

export type MasterDataDepartmentRow = {
  code: string;
  name: string;
};

export type MasterDataCompanyComparison = {
  bpmCode: string;
  legalEntity: {
    bpm: MasterDataLegalEntitySide | null;
    sql: MasterDataLegalEntitySide | null;
  };
  departments: {
    bpm: MasterDataDepartmentRow[];
    sql: MasterDataDepartmentRow[];
  };
  designations: {
    bpm: string[];
    sql: string[];
  };
};

export type MasterDataComparisonResult = {
  generatedAt: string;
  cachedAt: string | null;
  fromCache: boolean;
  hasCache: boolean;
  sqlConfigured: boolean;
  sqlDatabases: string[];
  companies: MasterDataCompanyComparison[];
  errors: Array<{ bpmCode: string; source: 'bpm' | 'sql'; message: string }>;
};

function expandDesignationFragments(value: string): string[] {
  return value
    .split(/[/,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

@Injectable()
export class MasterDataComparisonService {
  private cache: Omit<MasterDataComparisonResult, 'fromCache'> | null = null;
  private syncInFlight: Promise<
    Omit<MasterDataComparisonResult, 'fromCache'>
  > | null = null;

  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: Repository<ActivityEntity>,
    private readonly sqlEmpMasterService: SqlEmpMasterService,
  ) {}

  getCached(): MasterDataComparisonResult {
    if (!this.cache) {
      return {
        generatedAt: new Date().toISOString(),
        cachedAt: null,
        fromCache: false,
        hasCache: false,
        sqlConfigured: this.sqlEmpMasterService.isConfigured(),
        sqlDatabases: this.sqlEmpMasterService.resolveDatabases(),
        companies: [],
        errors: [],
      };
    }

    return {
      ...this.cache,
      fromCache: true,
      hasCache: true,
    };
  }

  async syncFromSources(): Promise<MasterDataComparisonResult> {
    if (this.syncInFlight) {
      const pending = await this.syncInFlight;
      return { ...pending, fromCache: false, hasCache: true };
    }

    this.syncInFlight = this.buildComparison();
    try {
      const built = await this.syncInFlight;
      this.cache = built;
      return { ...built, fromCache: false, hasCache: true };
    } finally {
      this.syncInFlight = null;
    }
  }

  private async listBpmDesignations(companyCode: string): Promise<string[]> {
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

    return items.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  }

  private async buildComparison(): Promise<
    Omit<MasterDataComparisonResult, 'fromCache'>
  > {
    const rows = await this.companyRepository.find({
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
    const errors: MasterDataComparisonResult['errors'] = [];
    const companies: MasterDataCompanyComparison[] = [];

    const sqlSnapshots = this.sqlEmpMasterService.isConfigured()
      ? await this.sqlEmpMasterService.fetchAllSnapshots()
      : [];

    for (const snapshot of sqlSnapshots) {
      if (snapshot.error) {
        errors.push({
          bpmCode: '*',
          source: 'sql',
          message: `${snapshot.database}: ${snapshot.error}`,
        });
      }
    }

    const sqlCatalogs =
      this.sqlEmpMasterService.buildLegalEntityCatalogs(sqlSnapshots);
    const allDepartments = await this.departmentRepository.find({
      order: { companyCode: 'ASC', name: 'ASC' },
    });

    for (const row of rows) {
      const bpmCode = row.code.trim().toUpperCase();
      const bpmLegalName =
        row.oracleLegalEntityName?.trim() || row.name?.trim() || '';
      const bpmLegal: MasterDataLegalEntitySide | null = bpmLegalName
        ? { name: bpmLegalName }
        : null;

      const sqlMatch = this.sqlEmpMasterService.resolveLegalEntityForCompany(
        sqlCatalogs,
        row.name,
        row.oracleLegalEntityName,
      );

      const sqlLegal: MasterDataLegalEntitySide | null = sqlMatch
        ? {
            name: sqlMatch.legalEmployerName,
            database: sqlMatch.database,
            businessUnit: sqlMatch.businessUnitName || undefined,
            employeeCount: sqlMatch.employeeCount,
          }
        : null;

      const bpmDepartments = allDepartments
        .filter((dept) => dept.companyCode.trim().toUpperCase() === bpmCode)
        .map((dept) => {
          const name =
            dept.hanaDepartmentName?.trim() || dept.name?.trim() || '';
          return {
            code: dept.code?.trim() || name,
            name,
          };
        })
        .filter((dept) => dept.name);

      let bpmDesignations: string[] = [];
      try {
        bpmDesignations = await this.listBpmDesignations(bpmCode);
      } catch (err) {
        errors.push({
          bpmCode,
          source: 'bpm',
          message: `Designations: ${(err as Error).message}`,
        });
      }

      companies.push({
        bpmCode,
        legalEntity: {
          bpm: bpmLegal,
          sql: sqlLegal,
        },
        departments: {
          bpm: bpmDepartments,
          sql: sqlMatch?.departments ?? [],
        },
        designations: {
          bpm: bpmDesignations,
          sql: sqlMatch?.designations ?? [],
        },
      });
    }

    const now = new Date().toISOString();
    return {
      generatedAt: now,
      cachedAt: now,
      hasCache: true,
      sqlConfigured: this.sqlEmpMasterService.isConfigured(),
      sqlDatabases: this.sqlEmpMasterService.resolveDatabases(),
      companies,
      errors,
    };
  }
}
