import sql from 'mssql';

export type PayrollDatabase = {
  id: string;
  label: string;
  country: string;
};

export const PAYROLL_DATABASES: PayrollDatabase[] = [
  { id: 'NEGTPAYROLL_UAE', label: 'UAE', country: 'United Arab Emirates' },
  { id: 'NEGTPAYROLL_OMAN', label: 'Oman', country: 'Oman' },
  { id: 'NEGTPAYROLL_KSA', label: 'KSA', country: 'Saudi Arabia' },
  { id: 'NEGTPAYROLL_BHR', label: 'Bahrain', country: 'Bahrain' },
];

export type AttDiscrepancyRow = {
  SLNo: number;
  HRM_EmpId: string;
  Pr_AttDate: string;
  Pr_Year: number;
  Pr_Month: number;
  Pr_EmpCategory: string;
  Pr_AttOrgTimeIn: string;
  Pr_AttOrgTimeOut: string;
  Pr_AttOrgWorkHrs: number;
  Pr_AttOrgWorkMin: number;
  Pr_AttOrgWorkSec: number;
  Pr_AttTimeIn: string;
  Pr_AttTimeout: string;
  Pr_AttNorHours: number;
  Pr_AttOtHours: number;
  Pr_ExtraOtHours: number;
  Pr_WOOtHours: number;
  Pr_WOExtraOtHours: number;
  Pr_PHOtHours: number;
  Pr_PHExtraOtHours: number;
  Pr_OTEligible: string;
  Verified: string | null;
  Comments: string;
};

function connectConfig(database: string): sql.config {
  return {
    server: process.env.SQL_DB_SERVER!,
    user: process.env.SQL_DB_USER!,
    password: process.env.SQL_DB_PASSWORD!,
    database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 15_000,
    requestTimeout: 120_000,
  };
}

function formatTime(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(11, 19);
  }
  return String(value).trim();
}

function formatDate(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function normalizeRow(row: Record<string, unknown>): AttDiscrepancyRow {
  return {
    SLNo: Number(row.SLNo ?? 0),
    HRM_EmpId: String(row.HRM_EmpId ?? ''),
    Pr_AttDate: formatDate(row.Pr_AttDate),
    Pr_Year: Number(row.Pr_Year ?? 0),
    Pr_Month: Number(row.Pr_Month ?? 0),
    Pr_EmpCategory: String(row.Pr_EmpCategory ?? ''),
    Pr_AttOrgTimeIn: formatTime(row.Pr_AttOrgTimeIn),
    Pr_AttOrgTimeOut: formatTime(row.Pr_AttOrgTimeOut),
    Pr_AttOrgWorkHrs: Number(row.Pr_AttOrgWorkHrs ?? 0),
    Pr_AttOrgWorkMin: Number(row.Pr_AttOrgWorkMin ?? 0),
    Pr_AttOrgWorkSec: Number(row.Pr_AttOrgWorkSec ?? 0),
    Pr_AttTimeIn: formatTime(row.Pr_AttTimeIn),
    Pr_AttTimeout: formatTime(row.Pr_AttTimeout),
    Pr_AttNorHours: Number(row.Pr_AttNorHours ?? 0),
    Pr_AttOtHours: Number(row.Pr_AttOtHours ?? 0),
    Pr_ExtraOtHours: Number(row.Pr_ExtraOtHours ?? 0),
    Pr_WOOtHours: Number(row.Pr_WOOtHours ?? 0),
    Pr_WOExtraOtHours: Number(row.Pr_WOExtraOtHours ?? 0),
    Pr_PHOtHours: Number(row.Pr_PHOtHours ?? 0),
    Pr_PHExtraOtHours: Number(row.Pr_PHExtraOtHours ?? 0),
    Pr_OTEligible: String(row.Pr_OTEligible ?? ''),
    Verified: row.Verified == null ? null : String(row.Verified),
    Comments: String(row.Comments ?? ''),
  };
}

export function isValidPayrollDatabase(database: string): boolean {
  return PAYROLL_DATABASES.some((d) => d.id === database);
}

export async function callAttDiscrepancy(
  database: string,
  year: number,
  month: number,
): Promise<AttDiscrepancyRow[]> {
  const pool = await new sql.ConnectionPool(connectConfig(database)).connect();
  try {
    const result = await pool
      .request()
      .input('year', sql.Int, year)
      .input('month', sql.Int, month)
      .query('EXEC SP_AttDiscrepancy @year, @month');
    const recordset = (result.recordset ?? []) as Record<string, unknown>[];
    return recordset.map((row) => normalizeRow(row));
  } finally {
    await pool.close();
  }
}
