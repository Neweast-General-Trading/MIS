import hana from '@sap/hana-client';
import type { Connection } from '@sap/hana-client';

const SCHEMA = 'BI_NEGT';

export type BrandPerformanceRow = {
  CardCode: string;
  CardName: string;
  Brand: string;
  SalesValue_CurrentYear: number | string | null;
  SalesValue_LastYear: number | string | null;
  SalesValue_2YearsAgo: number | string | null;
  SalesQty_CurrentYear: number | string | null;
  SalesQty_LastYear: number | string | null;
  SalesQty_2YearsAgo: number | string | null;
  BrandBackorderQty: number | string | null;
  BrandBackorderValue: number | string | null;
  CustomerTotalBackorderValue: number | string | null;
  CustomerTotalSalesValue_LastYear: number | string | null;
  BackorderPctOfLastYearSales: number | string | null;
};

export type FinancialStatusRow = {
  CardCode: string;
  CardName: string;
  PaymentType: string | null;
  PaymentTermsName: string | null;
  PayDueMonth: string | null;
  ExtraMonths: number | string | null;
  ExtraDays: number | string | null;
  CreditLimit: number | string | null;
  CurrentBalance: number | string | null;
  OverCreditLimit: string | null;
  TotalOverdueAmount: number | string | null;
  OverdueInvoiceCount: number | string | null;
  MaxDaysOverdue: number | string | null;
  OverdueInvoiceDocNum: number | string | null;
  InvoiceDate: string | null;
  InvoiceDueDate: string | null;
  DocTotal: number | string | null;
  PaidToDate: number | string | null;
  OpenBalance: number | string | null;
  DaysOverdue: number | string | null;
};

export type ItemEvaluationRow = {
  ItemCode: string;
  ItemName: string | null;
  Brand: string | null;
  SalesQty_LastYear: number | string | null;
  SalesValue_LastYear: number | string | null;
  DistinctCustomers_LastYear: number | string | null;
  DistinctCountries_LastYear: number | string | null;
  CatalogAvgQty_LastYear: number | string | null;
  MovementClass: string | null;
  CustomerSpecific: string | null;
  TopCustomerCode: string | null;
  TopCustomerName: string | null;
  CountrySpecific: string | null;
  TopCountry: string | null;
};

export type ItemBackorderRow = {
  ItemCode: string;
  ItemName: string | null;
  TotalOnHandQty: number | string | null;
  TotalCommittedQty: number | string | null;
  TotalOnOrderQty: number | string | null;
  TotalAvailableQty: number | string | null;
  BackorderWhsCode: string | null;
  BackorderWhsOnHandQty: number | string | null;
  BackorderWhsCommittedQty: number | string | null;
  BackorderWhsAvailableQty: number | string | null;
  BackorderDocNum: number | string | null;
  OrderDate: string | null;
  DueDate: string | null;
  CardCode: string | null;
  CardName: string | null;
  BackorderQty: number | string | null;
  Price: number | string | null;
  BackorderValue: number | string | null;
};

export type AllocatedStockRow = {
  ItemCode: string;
  ItemName: string | null;
  WhsCode: string | null;
  WhsName: string | null;
  SalesOrderDocNum: number | string | null;
  OrderDate: string | null;
  DueDate: string | null;
  CardCode: string | null;
  CardName: string | null;
  AllocatedQty: number | string | null;
  Price: number | string | null;
  AllocatedValue: number | string | null;
  DaysAllocated: number | string | null;
  MonthsAllocated_Approx: number | string | null;
  ItemTotalAgedAllocatedQty: number | string | null;
  ItemTotalAgedAllocatedValue: number | string | null;
};

export type QuotationDetailRow = {
  QuotationDocNum: number | string;
  CardCode: string;
  CardName: string | null;
  QuotationDate: string | null;
  ItemCode: string;
  ItemDescription: string | null;
  Quantity: number | string | null;
  Price: number | string | null;
  LineTotal: number | string | null;
};

export type Ne02ApprovalPayload = {
  cardCode: string;
  itemCodes: string[];
  quotationDocNum: number | null;
  quotationDetails: QuotationDetailRow[];
  brandPerformance: BrandPerformanceRow[];
  financialStatus: FinancialStatusRow[];
  itemEvaluation: ItemEvaluationRow[];
  itemBackorder: ItemBackorderRow[];
  allocatedStock: AllocatedStockRow[];
};

function connectConfig() {
  return {
    serverNode: process.env.SERVER_NODE!,
    uid: process.env.SAP_HANA_USER!,
    pwd: process.env.SAP_HANA_PASSWORD!,
    currentSchema: process.env.SAP_HANA_DATABASE ?? SCHEMA,
    pooling: true,
    connectionLifetime: 1800,
    communicationTimeout: 120_000,
  };
}

function exec<T>(conn: Connection, sql: string): Promise<T> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, [], (err, result) => {
      if (err) reject(err);
      else resolve(result as T);
    });
  });
}

function withConn<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const conn = hana.createConnection();
  return new Promise((resolve, reject) => {
    conn.connect(connectConfig(), async (err) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        resolve(await fn(conn));
      } catch (e) {
        reject(e);
      } finally {
        conn.disconnect();
      }
    });
  });
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function asRows<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

export function sanitizeCardCode(value: unknown, required = true): string {
  if (value == null || String(value).trim() === '') {
    if (required) throw new Error('cardCode is required');
    return '';
  }
  const t = String(value).trim().toUpperCase();
  if (!/^[0-9A-Z._-]{1,30}$/.test(t)) throw new Error('Invalid cardCode');
  return t;
}

export function sanitizeItemCodes(value: unknown): string[] {
  if (value == null || value === '') return [];
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  const codes = raw
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    if (!/^[0-9A-Z._/-]{1,50}$/.test(code)) {
      throw new Error(`Invalid item code: ${code}`);
    }
    if (!seen.has(code)) {
      seen.add(code);
      unique.push(code);
    }
  }
  if (unique.length > 40) throw new Error('Too many item codes (max 40)');
  return unique;
}

export function sanitizeQuotationDocNum(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).trim());
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) {
    throw new Error('Invalid quotationDocNum');
  }
  return n;
}

async function callProc<T>(proc: string, arg: string): Promise<T[]> {
  const sql = `CALL "${SCHEMA}"."${proc}"(${lit(arg)})`;
  return withConn(async (conn) => asRows<T>(await exec(conn, sql)));
}

async function callProcInt<T>(proc: string, arg: number): Promise<T[]> {
  const sql = `CALL "${SCHEMA}"."${proc}"(${arg})`;
  return withConn(async (conn) => asRows<T>(await exec(conn, sql)));
}

async function callProcMany<T>(proc: string, args: string[]): Promise<T[]> {
  if (args.length === 0) return [];
  const batches = await Promise.all(args.map((arg) => callProc<T>(proc, arg)));
  return batches.flat();
}

export async function fetchNe02Approval(
  cardCodeRaw: unknown,
  itemCodesRaw: unknown,
  quotationDocNumRaw?: unknown,
): Promise<Ne02ApprovalPayload> {
  const quotationDocNum = sanitizeQuotationDocNum(quotationDocNumRaw);
  let cardCode = sanitizeCardCode(cardCodeRaw, false);
  let itemCodes = sanitizeItemCodes(itemCodesRaw);

  let quotationDetails: QuotationDetailRow[] = [];
  if (quotationDocNum != null) {
    quotationDetails = await callProcInt<QuotationDetailRow>(
      'SP_QUOTATION_DETAILS',
      quotationDocNum,
    );
    if (quotationDetails.length === 0) {
      throw new Error(`No open quotation lines found for DocNum ${quotationDocNum}`);
    }
    if (!cardCode) {
      cardCode = sanitizeCardCode(quotationDetails[0]?.CardCode, true);
    }
    if (itemCodes.length === 0) {
      itemCodes = sanitizeItemCodes(quotationDetails.map((r) => r.ItemCode));
    }
  }

  if (!cardCode) throw new Error('cardCode is required (or provide quotationDocNum)');

  const [brandPerformance, financialStatus, itemEvaluation, itemBackorder, allocatedStock] =
    await Promise.all([
      callProc<BrandPerformanceRow>('SP_CUSTOMER_BRAND_SALES_BACKORDER', cardCode),
      callProc<FinancialStatusRow>('SP_CUSTOMER_FINANCIAL_STATUS', cardCode),
      callProcMany<ItemEvaluationRow>('SP_ITEM_EVALUATION', itemCodes),
      callProcMany<ItemBackorderRow>('SP_ITEM_BACKORDER_STOCK', itemCodes),
      callProcMany<AllocatedStockRow>('SP_ALLOCATED_STOCK_AGING', itemCodes),
    ]);

  return {
    cardCode,
    itemCodes,
    quotationDocNum,
    quotationDetails,
    brandPerformance,
    financialStatus,
    itemEvaluation,
    itemBackorder,
    allocatedStock,
  };
}
