import { Injectable } from '@nestjs/common';
import * as mssql from 'mssql';

import type {
  SqlLegalEntitySnapshot,
  SqlMasterRow,
  SqlMasterSnapshot,
} from './sql-emp-master.types';

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function sqlNamesMatch(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

@Injectable()
export class SqlEmpMasterService {
  isConfigured(): boolean {
    return Boolean(
      process.env.SQL_DB_SERVER?.trim() &&
        process.env.SQL_DB_USER?.trim() &&
        process.env.SQL_DB_PASSWORD,
    );
  }

  resolveDatabases(): string[] {
    const list = process.env.SQL_DB_DATABASES?.trim();
    if (list) {
      return list
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    const single = process.env.SQL_DB_DATABASE?.trim();
    if (single) return [single];
    return ['NEGTPAYROLL_UAE'];
  }

  private buildConfig(database: string): mssql.config {
    return {
      user: process.env.SQL_DB_USER?.trim(),
      password: process.env.SQL_DB_PASSWORD,
      server: process.env.SQL_DB_SERVER?.trim() ?? '',
      port: Number(process.env.SQL_DB_PORT ?? 1433),
      database,
      options: {
        encrypt: process.env.SQL_DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.SQL_DB_TRUST_CERT !== 'false',
        enableArithAbort: true,
      },
      connectionTimeout: 15000,
      requestTimeout: 120000,
    };
  }

  async fetchDatabaseSnapshot(database: string): Promise<SqlMasterSnapshot> {
    let pool: mssql.ConnectionPool | null = null;
    try {
      pool = await mssql.connect(this.buildConfig(database));
      const result = await pool.request().query<SqlMasterRow>(`
        SELECT
          LTRIM(RTRIM(LegalEmployerName)) AS legalEmployerName,
          LTRIM(RTRIM(BusinessUnitName)) AS businessUnitName,
          LTRIM(RTRIM(DepartmentName)) AS departmentName,
          LTRIM(RTRIM(JobName)) AS jobName,
          LTRIM(RTRIM(PositionName)) AS positionName,
          sourceTable
        FROM (
          SELECT
            LegalEmployerName,
            BusinessUnitName,
            DepartmentName,
            JobName,
            PositionName,
            'Or_EmpMaster' AS sourceTable
          FROM dbo.Or_EmpMaster
          WHERE LegalEmployerName IS NOT NULL
            AND LTRIM(RTRIM(LegalEmployerName)) <> ''
          UNION ALL
          SELECT
            LegalEmployerName,
            BusinessUnitName,
            DepartmentName,
            JobName,
            PositionName,
            'Or_EXEmpMaster' AS sourceTable
          FROM dbo.Or_EXEmpMaster
          WHERE LegalEmployerName IS NOT NULL
            AND LTRIM(RTRIM(LegalEmployerName)) <> ''
        ) AS combined
      `);

      return {
        database,
        rows: result.recordset.map((row) => ({
          legalEmployerName: row.legalEmployerName?.trim() ?? '',
          businessUnitName: row.businessUnitName?.trim() ?? '',
          departmentName: row.departmentName?.trim() ?? '',
          jobName: row.jobName?.trim() ?? '',
          positionName: row.positionName?.trim() ?? '',
          sourceTable: row.sourceTable,
        })),
      };
    } catch (err) {
      return {
        database,
        rows: [],
        error: (err as Error).message,
      };
    } finally {
      if (pool) {
        await pool.close().catch(() => undefined);
      }
    }
  }

  async fetchAllSnapshots(): Promise<SqlMasterSnapshot[]> {
    if (!this.isConfigured()) return [];
    return Promise.all(this.resolveDatabases().map((db) => this.fetchDatabaseSnapshot(db)));
  }

  buildLegalEntityCatalogs(snapshots: SqlMasterSnapshot[]): SqlLegalEntitySnapshot[] {
    const byKey = new Map<string, SqlLegalEntitySnapshot>();

    for (const snapshot of snapshots) {
      for (const row of snapshot.rows) {
        const legalEmployerName = row.legalEmployerName.trim();
        if (!legalEmployerName) continue;

        const key = `${snapshot.database}::${normalizeName(legalEmployerName)}`;
        let entry = byKey.get(key);
        if (!entry) {
          entry = {
            legalEmployerName,
            businessUnitName: row.businessUnitName.trim(),
            database: snapshot.database,
            employeeCount: 0,
            departments: [],
            designations: [],
          };
          byKey.set(key, entry);
        }

        entry.employeeCount += 1;
        if (row.businessUnitName && !entry.businessUnitName) {
          entry.businessUnitName = row.businessUnitName.trim();
        }

        if (row.departmentName) {
          const deptName = row.departmentName.trim();
          if (!entry.departments.some((item) => sqlNamesMatch(item.name, deptName))) {
            entry.departments.push({
              code: deptName,
              name: deptName,
            });
          }
        }

        for (const designation of [row.positionName, row.jobName]) {
          const label = designation.trim();
          if (!label) continue;
          if (!entry.designations.some((item) => sqlNamesMatch(item, label))) {
            entry.designations.push(label);
          }
        }
      }
    }

    for (const entry of byKey.values()) {
      entry.departments.sort((a, b) => a.name.localeCompare(b.name));
      entry.designations.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }

    return [...byKey.values()].sort((a, b) =>
      a.legalEmployerName.localeCompare(b.legalEmployerName),
    );
  }

  resolveLegalEntityForCompany(
    catalogs: SqlLegalEntitySnapshot[],
    companyName: string,
    oracleLegalEntityName?: string | null,
  ): SqlLegalEntitySnapshot | null {
    const candidates = [oracleLegalEntityName?.trim(), companyName.trim()].filter(Boolean);
    if (!candidates.length) return null;

    for (const candidate of candidates) {
      const exact = catalogs.find(
        (item) => normalizeName(item.legalEmployerName) === normalizeName(candidate),
      );
      if (exact) return exact;
    }

    for (const candidate of candidates) {
      const fuzzy = catalogs.find(
        (item) =>
          sqlNamesMatch(item.legalEmployerName, candidate) ||
          sqlNamesMatch(item.businessUnitName, candidate),
      );
      if (fuzzy) return fuzzy;
    }

    return null;
  }
}
