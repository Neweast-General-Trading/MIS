import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import hana from '@sap/hana-client';
import type { Lst5yrsRow } from './hana.js';

export type Lst5yrsBlock = {
  company: string;
  docType: string;
  schema: string;
  table: string;
  dateColumn: 'DocDate' | 'RefDate';
  entryColumn: 'DocEntry' | 'TransId';
  cancelColumn: string | null;
  extraWhere: string;
  transType: number | null;
};

const blocksPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'data',
  'lst5yrs-blocks.json',
);

let blocksCache: Lst5yrsBlock[] | null = null;

function loadBlocks(): Lst5yrsBlock[] {
  if (!blocksCache) {
    blocksCache = JSON.parse(readFileSync(blocksPath, 'utf8')) as Lst5yrsBlock[];
  }
  return blocksCache;
}

function connectConfig() {
  return {
    serverNode: process.env.SERVER_NODE!,
    uid: process.env.SAP_HANA_USER!,
    pwd: process.env.SAP_HANA_PASSWORD!,
    currentSchema: process.env.SAP_HANA_DATABASE ?? 'BI_NEGT',
  };
}

function escapeUserId(userId: string): string {
  return userId.replace(/'/g, "''");
}

/** Employee filter: all years by default (no 2025-only cap). Set EMPLOYEE_LST5YRS_YEARS_BACK to limit. */
function employeeYearFilter(dateCol: string): string {
  const raw = process.env.EMPLOYEE_LST5YRS_YEARS_BACK?.trim();
  if (!raw) return '';
  const years = Number(raw);
  if (!Number.isFinite(years) || years <= 0) return '';
  const start = Math.max(0, Math.floor(years) - 1);
  return ` AND YEAR(T0."${dateCol}") BETWEEN YEAR(CURRENT_DATE) - ${start} AND YEAR(CURRENT_DATE)`;
}

function sanitizeExtraWhere(extra: string): string {
  let s = (extra ?? '').replace(/--[^\n\r]*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || /^and$/i.test(s)) return '';
  if (!/^and\s/i.test(s)) s = ` AND ${s}`;
  return s.startsWith(' ') ? s : ` ${s}`;
}

function blockSelect(block: Lst5yrsBlock, userId: string): string {
  const docType = block.docType.replace(/'/g, "''");
  const uid = escapeUserId(userId);
  const dateCol = block.dateColumn;
  const entryCol = block.entryColumn;
  const cancelledExpr = block.cancelColumn
    ? `SUM(CASE WHEN T0."${block.cancelColumn}" = 'Y' THEN 1 ELSE 0 END)`
    : '0';
  const transFilter = block.transType != null ? ` AND T0."TransType" = ${block.transType}` : '';
  const extra = sanitizeExtraWhere(block.extraWhere ?? '');
  const yearFilter = employeeYearFilter(dateCol);
  return `
SELECT '${block.company}' AS "Company",
       '${docType}' AS "DocType",
       YEAR(T0."${dateCol}") AS "Year No",
       MONTH(T0."${dateCol}") AS "Month No",
       WEEK(T0."${dateCol}") AS "Week No",
       COUNT(T0."${entryCol}") AS "Document Count",
       ${cancelledExpr} AS "Cancelled Document Count"
FROM "${block.schema}"."${block.table}" T0
WHERE T0."UserSign" = (
    SELECT "USERID" FROM "${block.schema}".OUSR WHERE "USER_CODE" = '${uid}'
  )${yearFilter}${transFilter}${extra}
GROUP BY YEAR(T0."${dateCol}"), MONTH(T0."${dateCol}"), WEEK(T0."${dateCol}")
HAVING COUNT(T0."${entryCol}") > 0
`;
}

export function buildEmployeeLst5yrsSql(
  userId: string,
  companies?: string[],
): string {
  const uid = userId.trim();
  if (!uid) throw new Error('employee user id required');

  let blocks = loadBlocks();
  if (companies?.length) {
    const allowed = new Set(companies);
    blocks = blocks.filter((b) => allowed.has(b.company));
  }

  const parts = blocks.map((b) => blockSelect(b, uid));
  return parts.join('\nUNION ALL\n');
}

export async function callLst5yrsForEmployee(
  userId: string,
  companies?: string[],
): Promise<Lst5yrsRow[]> {
  const sql = buildEmployeeLst5yrsSql(userId, companies);
  const conn = hana.createConnection();

  return new Promise((resolve, reject) => {
    conn.connect(connectConfig(), (err) => {
      if (err) {
        reject(err);
        return;
      }
      conn.exec(sql, [], (e, rows) => {
        conn.disconnect();
        if (e) reject(e);
        else resolve((rows as Lst5yrsRow[]) ?? []);
      });
    });
  });
}

/** Companies where this employee has at least one document */
export async function getEmployeeCompanies(userId: string): Promise<string[]> {
  const rows = await callLst5yrsForEmployee(userId);
  return [...new Set(rows.map((r) => r.Company))].sort();
}
