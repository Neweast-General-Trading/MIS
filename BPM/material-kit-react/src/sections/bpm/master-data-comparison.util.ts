import type { MasterDataComparisonResult } from 'src/sections/bpm/api';

export type CompareStatus =
  | 'match'
  | 'mismatch'
  | 'bpm_only'
  | 'sql_only'
  | 'missing_bpm'
  | 'missing_sql';

export type CompareDepartmentRow = {
  bpmCode: string;
  bpmCodeValue: string;
  bpmName: string;
  sqlCode: string;
  sqlName: string;
  status: CompareStatus;
  statusLabel: string;
};

export type CompareDesignationRow = {
  bpmCode: string;
  bpmName: string;
  sqlName: string;
  status: CompareStatus;
  statusLabel: string;
};

export type LegalEntityCompareRow = {
  bpmCode: string;
  bpmName: string;
  sqlName: string;
  sqlDatabase: string;
  sqlBusinessUnit: string;
  sqlEmployeeCount: string;
  status: CompareStatus;
  statusLabel: string;
};

export type CompareSummary = {
  match: number;
  mismatch: number;
  bpmOnly: number;
  sqlOnly: number;
  missingBpm: number;
  missingSql: number;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function namesMatch(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function statusLabel(status: CompareStatus): string {
  switch (status) {
    case 'match':
      return 'Match';
    case 'mismatch':
      return 'Name differs';
    case 'bpm_only':
      return 'BPM only';
    case 'sql_only':
      return 'SQL only';
    case 'missing_bpm':
      return 'Missing BPM';
    case 'missing_sql':
      return 'Missing SQL';
    default:
      return status;
  }
}

export function summarizeCompareRows(
  rows: Array<{ status: CompareStatus }>,
): CompareSummary {
  const summary: CompareSummary = {
    match: 0,
    mismatch: 0,
    bpmOnly: 0,
    sqlOnly: 0,
    missingBpm: 0,
    missingSql: 0,
  };
  for (const row of rows) {
    switch (row.status) {
      case 'match':
        summary.match += 1;
        break;
      case 'mismatch':
        summary.mismatch += 1;
        break;
      case 'bpm_only':
        summary.bpmOnly += 1;
        break;
      case 'sql_only':
        summary.sqlOnly += 1;
        break;
      case 'missing_bpm':
        summary.missingBpm += 1;
        break;
      case 'missing_sql':
        summary.missingSql += 1;
        break;
      default:
        break;
    }
  }
  return summary;
}

export function buildLegalEntityCompareRows(
  data: MasterDataComparisonResult,
): LegalEntityCompareRow[] {
  return data.companies.map((company) => {
    const bpmName = company.legalEntity.bpm?.name?.trim() ?? '';
    const sqlName = company.legalEntity.sql?.name?.trim() ?? '';
    let status: CompareStatus = 'match';

    if (bpmName && sqlName) {
      status = namesMatch(bpmName, sqlName)
        ? normalizeName(bpmName) === normalizeName(sqlName)
          ? 'match'
          : 'mismatch'
        : 'mismatch';
    } else if (bpmName && !sqlName) {
      status = 'missing_sql';
    } else if (!bpmName && sqlName) {
      status = 'missing_bpm';
    } else {
      status = 'mismatch';
    }

    return {
      bpmCode: company.bpmCode,
      bpmName: bpmName || '—',
      sqlName: sqlName || '—',
      sqlDatabase: company.legalEntity.sql?.database ?? '—',
      sqlBusinessUnit: company.legalEntity.sql?.businessUnit ?? '—',
      sqlEmployeeCount:
        company.legalEntity.sql?.employeeCount != null
          ? String(company.legalEntity.sql.employeeCount)
          : '—',
      status,
      statusLabel: statusLabel(status),
    };
  });
}

export function buildDepartmentCompareRows(
  data: MasterDataComparisonResult,
): CompareDepartmentRow[] {
  const rows: CompareDepartmentRow[] = [];

  for (const company of data.companies) {
    const bpmList = [...company.departments.bpm];
    const sqlList = [...company.departments.sql];
    const usedSql = new Set<number>();

    for (const bpmItem of bpmList) {
      const sqlIndex = sqlList.findIndex(
        (sqlItem, index) => !usedSql.has(index) && namesMatch(bpmItem.name, sqlItem.name),
      );

      if (sqlIndex >= 0) {
        usedSql.add(sqlIndex);
        const sqlItem = sqlList[sqlIndex];
        const exact = normalizeName(bpmItem.name) === normalizeName(sqlItem.name);
        rows.push({
          bpmCode: company.bpmCode,
          bpmCodeValue: bpmItem.code,
          bpmName: bpmItem.name,
          sqlCode: sqlItem.code,
          sqlName: sqlItem.name,
          status: exact ? 'match' : 'mismatch',
          statusLabel: statusLabel(exact ? 'match' : 'mismatch'),
        });
      } else {
        rows.push({
          bpmCode: company.bpmCode,
          bpmCodeValue: bpmItem.code,
          bpmName: bpmItem.name,
          sqlCode: '—',
          sqlName: '—',
          status: 'bpm_only',
          statusLabel: statusLabel('bpm_only'),
        });
      }
    }

    sqlList.forEach((sqlItem, index) => {
      if (usedSql.has(index)) return;
      rows.push({
        bpmCode: company.bpmCode,
        bpmCodeValue: '—',
        bpmName: '—',
        sqlCode: sqlItem.code,
        sqlName: sqlItem.name,
        status: 'sql_only',
        statusLabel: statusLabel('sql_only'),
      });
    });
  }

  return rows.sort(
    (a, b) =>
      a.bpmCode.localeCompare(b.bpmCode) ||
      a.status.localeCompare(b.status) ||
      a.bpmName.localeCompare(b.bpmName) ||
      a.sqlName.localeCompare(b.sqlName),
  );
}

export function buildDesignationCompareRows(
  data: MasterDataComparisonResult,
): CompareDesignationRow[] {
  const rows: CompareDesignationRow[] = [];

  for (const company of data.companies) {
    const bpmList = [...company.designations.bpm];
    const sqlList = [...company.designations.sql];
    const usedSql = new Set<number>();

    for (const bpmName of bpmList) {
      const sqlIndex = sqlList.findIndex(
        (sqlName, index) => !usedSql.has(index) && namesMatch(bpmName, sqlName),
      );

      if (sqlIndex >= 0) {
        usedSql.add(sqlIndex);
        const sqlName = sqlList[sqlIndex];
        const exact = normalizeName(bpmName) === normalizeName(sqlName);
        rows.push({
          bpmCode: company.bpmCode,
          bpmName,
          sqlName,
          status: exact ? 'match' : 'mismatch',
          statusLabel: statusLabel(exact ? 'match' : 'mismatch'),
        });
      } else {
        rows.push({
          bpmCode: company.bpmCode,
          bpmName,
          sqlName: '—',
          status: 'bpm_only',
          statusLabel: statusLabel('bpm_only'),
        });
      }
    }

    sqlList.forEach((sqlName, index) => {
      if (usedSql.has(index)) return;
      rows.push({
        bpmCode: company.bpmCode,
        bpmName: '—',
        sqlName,
        status: 'sql_only',
        statusLabel: statusLabel('sql_only'),
      });
    });
  }

  return rows.sort(
    (a, b) =>
      a.bpmCode.localeCompare(b.bpmCode) ||
      a.status.localeCompare(b.status) ||
      a.bpmName.localeCompare(b.bpmName) ||
      a.sqlName.localeCompare(b.sqlName),
  );
}

export function compareStatusColor(
  status: CompareStatus,
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'match':
      return 'success';
    case 'mismatch':
      return 'warning';
    case 'bpm_only':
    case 'sql_only':
      return 'info';
    case 'missing_bpm':
    case 'missing_sql':
      return 'error';
    default:
      return 'default';
  }
}
