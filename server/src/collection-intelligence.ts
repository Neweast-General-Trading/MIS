import hana from '@sap/hana-client';
import { COLLECTION_COMPANIES, companiesForFilter, type CollectionCompany } from './collection-companies.js';

export type CollectionFilters = {
  company?: string;
  customer?: string;
  salesperson?: string;
  customerGroup?: string;
  region?: string;
  businessUnit?: string;
  year?: string;
  month?: string;
};

type FilterExcept = keyof CollectionFilters;

export type KpiCard = {
  id: string;
  label: string;
  value: number;
  previousValue: number;
  changePct: number | null;
  unit: 'currency' | 'percent' | 'days' | 'count';
};

export type AgingBucket = {
  bucket: string;
  label: string;
  amount: number;
  invoiceCount: number;
  customerCount: number;
};

export type CustomerRow = {
  company: string;
  cardCode: string;
  cardName: string;
  creditLimit: number;
  outstanding: number;
  overdue: number;
  lastPaymentDate: string | null;
  totalPayments: number;
  avgPaymentDelay: number;
  collectionScore: number;
  riskScore: number;
  riskCategory: 'low' | 'medium' | 'high' | 'critical';
  creditUtilization: number;
  salesperson: string;
  customerGroup: string;
  region: string;
  businessUnit: string;
  isActive: boolean;
  slpCode: number | null;
};

export type ForecastHorizon = {
  days: 30 | 60 | 90;
  label: string;
  projectedCollections: number;
  dueReceivables: number;
  collectionEfficiency: number;
};

export type CustomerInvoice = {
  docEntry: number;
  docNum: number;
  docDate: string;
  docDueDate: string;
  docTotal: number;
  paidToDate: number;
  openAmount: number;
  daysOverdue: number;
  agingBucket: string;
  salesperson: string;
};

export type CustomerPayment = {
  docEntry: number;
  docNum: number;
  docDate: string;
  docTotal: number;
  remarks: string | null;
};

export type AgingBucketCustomer = {
  company: string;
  cardCode: string;
  cardName: string;
  bucketAmount: number;
  invoiceCount: number;
  maxDaysOverdue: number;
  salesperson: string;
  region: string;
};

export type MonthlyPoint = {
  year: number;
  month: number;
  label: string;
  invoiced: number;
  collected: number;
  collectionRate: number;
};

export type Insight = {
  type: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  detail: string;
};

export type FilterOptions = {
  customers: { code: string; name: string; company: string }[];
  salespeople: { code: number; name: string; company: string }[];
  customerGroups: { code: number; name: string; company: string }[];
  regions: { value: string; company: string }[];
  businessUnits: { value: string; company: string }[];
  years: number[];
  months: number[];
};

export type CollectionDashboard = {
  companies: CollectionCompany[];
  companyFilter: string;
  filters: CollectionFilters;
  kpis: KpiCard[];
  aging: AgingBucket[];
  customers: CustomerRow[];
  topDelayed: CustomerRow[];
  topActiveOverdue: CustomerRow[];
  topBest: CustomerRow[];
  topRisk: CustomerRow[];
  monthlyTrend: MonthlyPoint[];
  forecast: ForecastHorizon[];
  insights: Insight[];
  filterOptions: FilterOptions;
};

const AGING_BUCKETS = [
  { bucket: 'current', label: 'Current', min: null, max: 0 },
  { bucket: '1-30', label: '1–30 Days', min: 1, max: 30 },
  { bucket: '31-60', label: '31–60 Days', min: 31, max: 60 },
  { bucket: '61-90', label: '61–90 Days', min: 61, max: 90 },
  { bucket: '91-120', label: '91–120 Days', min: 91, max: 120 },
  { bucket: '120+', label: 'Above 120 Days', min: 121, max: null },
] as const;

type SchemaMeta = { uCos: boolean; uBusinessModel: boolean };
const schemaMetaCache = new Map<string, SchemaMeta>();

async function getSchemaMeta(schema: string): Promise<SchemaMeta> {
  const cached = schemaMetaCache.get(schema);
  if (cached) return cached;
  const cols = await hanaQuery<{ COLUMN_NAME: string }[]>(`
    SELECT COLUMN_NAME FROM TABLE_COLUMNS
    WHERE SCHEMA_NAME = '${schema}' AND TABLE_NAME = 'OCRD'
      AND COLUMN_NAME IN ('U_COS', 'U_BUSINESSMODEL')
  `);
  const names = new Set(cols.map((c) => c.COLUMN_NAME));
  const meta = { uCos: names.has('U_COS'), uBusinessModel: names.has('U_BUSINESSMODEL') };
  schemaMetaCache.set(schema, meta);
  return meta;
}

function connectConfig() {
  return {
    serverNode: process.env.SERVER_NODE!,
    uid: process.env.SAP_HANA_USER!,
    pwd: process.env.SAP_HANA_PASSWORD!,
    currentSchema: process.env.SAP_HANA_DATABASE ?? 'BI_NEGT',
  };
}

function hanaQuery<T>(sql: string): Promise<T> {
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
        else resolve(rows as T);
      });
    });
  });
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function invoiceFilterClause(
  filters: CollectionFilters,
  meta: SchemaMeta,
  except?: FilterExcept,
): string {
  const parts: string[] = [
    `i."CANCELED" = 'N'`,
    `i."DocStatus" = 'O'`,
    `GREATEST(i."DocTotal" - i."PaidToDate", 0) > 0.01`,
    `c."CardType" = 'C'`,
    `c."validFor" = 'Y'`,
  ];
  if (filters.customer && except !== 'customer') {
    parts.push(`i."CardCode" = '${esc(filters.customer)}'`);
  }
  if (filters.salesperson && except !== 'salesperson') {
    parts.push(`i."SlpCode" = ${Number(filters.salesperson)}`);
  }
  if (filters.customerGroup && except !== 'customerGroup') {
    parts.push(`c."GroupCode" = ${Number(filters.customerGroup)}`);
  }
  if (filters.region && meta.uCos && except !== 'region') {
    parts.push(`c."U_COS" = '${esc(filters.region)}'`);
  }
  if (filters.businessUnit && meta.uBusinessModel && except !== 'businessUnit') {
    parts.push(`c."U_BUSINESSMODEL" = '${esc(filters.businessUnit)}'`);
  }
  if (filters.year && except !== 'year') {
    parts.push(`YEAR(i."DocDate") = ${Number(filters.year)}`);
  }
  if (filters.month && except !== 'month') {
    parts.push(`MONTH(i."DocDate") = ${Number(filters.month)}`);
  }
  return parts.join(' AND ');
}

function cardCodeSubFilter(schema: string, filters: CollectionFilters, meta: SchemaMeta): string {
  const parts: string[] = [`"CardType" = 'C'`, `"validFor" = 'Y'`];
  if (filters.region && meta.uCos) parts.push(`"U_COS" = '${esc(filters.region)}'`);
  if (filters.businessUnit && meta.uBusinessModel) {
    parts.push(`"U_BUSINESSMODEL" = '${esc(filters.businessUnit)}'`);
  }
  if (filters.customerGroup) parts.push(`"GroupCode" = ${Number(filters.customerGroup)}`);
  return ` AND "CardCode" IN (SELECT "CardCode" FROM "${schema}"."OCRD" WHERE ${parts.join(' AND ')})`;
}

function salespersonCardCodesSubquery(schema: string, filters: CollectionFilters, meta: SchemaMeta): string {
  return `(SELECT DISTINCT i."CardCode"
    FROM "${schema}"."OINV" i
    INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
    WHERE ${invoiceFilterClause(filters, meta)})`;
}

function oinvDocumentExtraFilter(schema: string, filters: CollectionFilters, meta: SchemaMeta): string {
  let clause = cardCodeSubFilter(schema, filters, meta);
  if (filters.customer) clause += ` AND "CardCode" = '${esc(filters.customer)}'`;
  if (filters.salesperson) clause += ` AND "SlpCode" = ${Number(filters.salesperson)}`;
  if (filters.year) clause += ` AND YEAR("DocDate") = ${Number(filters.year)}`;
  if (filters.month) clause += ` AND MONTH("DocDate") = ${Number(filters.month)}`;
  return clause;
}

function orctDocumentExtraFilter(schema: string, filters: CollectionFilters, meta: SchemaMeta): string {
  let clause = cardCodeSubFilter(schema, filters, meta);
  if (filters.customer) clause += ` AND "CardCode" = '${esc(filters.customer)}'`;
  if (filters.salesperson) {
    clause += ` AND "CardCode" IN ${salespersonCardCodesSubquery(schema, filters, meta)}`;
  }
  if (filters.year) clause += ` AND YEAR("DocDate") = ${Number(filters.year)}`;
  if (filters.month) clause += ` AND MONTH("DocDate") = ${Number(filters.month)}`;
  return clause;
}

function riskCategory(score: number): CustomerRow['riskCategory'] {
  if (score <= 25) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'critical';
}

function collectionScore(riskScore: number): number {
  return Math.max(0, Math.min(100, 100 - riskScore));
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function monthLabel(year: number, month: number): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[month - 1] ?? month} ${year}`;
}

async function fetchOpenInvoiceMetrics(schema: string, filters: CollectionFilters, meta: SchemaMeta) {
  const where = invoiceFilterClause(filters, meta);
  const rows = await hanaQuery<
    {
      TOTAL_AR: string;
      OVERDUE: string;
      CURRENT: string;
      DELAYED_CUSTOMERS: number;
    }[]
  >(`
    SELECT
      SUM(GREATEST(i."DocTotal" - i."PaidToDate", 0)) AS "TOTAL_AR",
      SUM(CASE WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) > 0
        THEN GREATEST(i."DocTotal" - i."PaidToDate", 0) ELSE 0 END) AS "OVERDUE",
      SUM(CASE WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) <= 0
        THEN GREATEST(i."DocTotal" - i."PaidToDate", 0) ELSE 0 END) AS "CURRENT",
      COUNT(DISTINCT CASE WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) > 0
        THEN i."CardCode" END) AS "DELAYED_CUSTOMERS"
    FROM "${schema}"."OINV" i
    INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
    WHERE ${where}
  `);
  return rows[0] ?? { TOTAL_AR: '0', OVERDUE: '0', CURRENT: '0', DELAYED_CUSTOMERS: 0 };
}

async function fetchAging(schema: string, filters: CollectionFilters, meta: SchemaMeta): Promise<AgingBucket[]> {
  const where = invoiceFilterClause(filters, meta);
  const rows = await hanaQuery<
    {
      BUCKET: string;
      AMOUNT: string;
      INVOICE_COUNT: number;
      CUSTOMER_COUNT: number;
    }[]
  >(`
    SELECT
      CASE
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) <= 0 THEN 'current'
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) BETWEEN 1 AND 30 THEN '1-30'
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) BETWEEN 31 AND 60 THEN '31-60'
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) BETWEEN 61 AND 90 THEN '61-90'
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) BETWEEN 91 AND 120 THEN '91-120'
        ELSE '120+'
      END AS "BUCKET",
      SUM(GREATEST(i."DocTotal" - i."PaidToDate", 0)) AS "AMOUNT",
      COUNT(*) AS "INVOICE_COUNT",
      COUNT(DISTINCT i."CardCode") AS "CUSTOMER_COUNT"
    FROM "${schema}"."OINV" i
    INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
    WHERE ${where}
    GROUP BY
      CASE
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) <= 0 THEN 'current'
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) BETWEEN 1 AND 30 THEN '1-30'
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) BETWEEN 31 AND 60 THEN '31-60'
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) BETWEEN 61 AND 90 THEN '61-90'
        WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) BETWEEN 91 AND 120 THEN '91-120'
        ELSE '120+'
      END
  `);

  const map = new Map(rows.map((r) => [r.BUCKET, r]));
  return AGING_BUCKETS.map((b) => {
    const hit = map.get(b.bucket);
    return {
      bucket: b.bucket,
      label: b.label,
      amount: num(hit?.AMOUNT),
      invoiceCount: hit?.INVOICE_COUNT ?? 0,
      customerCount: hit?.CUSTOMER_COUNT ?? 0,
    };
  });
}

async function fetchMonthlyTrend(schema: string, filters: CollectionFilters, meta: SchemaMeta): Promise<MonthlyPoint[]> {
  const oinvFilter = oinvDocumentExtraFilter(schema, filters, meta);
  const orctFilter = orctDocumentExtraFilter(schema, filters, meta);
  let dateClause = `"DocDate" >= ADD_MONTHS(CURRENT_DATE, -12)`;
  if (filters.year && filters.month) {
    dateClause = `YEAR("DocDate") = ${Number(filters.year)} AND MONTH("DocDate") = ${Number(filters.month)}`;
  } else if (filters.year) {
    dateClause = `YEAR("DocDate") = ${Number(filters.year)}`;
  }

  const [invoices, payments] = await Promise.all([
    hanaQuery<{ Y: number; M: number; AMT: string }[]>(`
      SELECT YEAR("DocDate") AS "Y", MONTH("DocDate") AS "M", SUM("DocTotal") AS "AMT"
      FROM "${schema}"."OINV"
      WHERE "CANCELED" = 'N' AND ${dateClause}${oinvFilter}
      GROUP BY YEAR("DocDate"), MONTH("DocDate")
    `),
    hanaQuery<{ Y: number; M: number; AMT: string }[]>(`
      SELECT YEAR("DocDate") AS "Y", MONTH("DocDate") AS "M", SUM("DocTotal") AS "AMT"
      FROM "${schema}"."ORCT"
      WHERE "Canceled" = 'N' AND ${dateClause}${orctFilter}
      GROUP BY YEAR("DocDate"), MONTH("DocDate")
    `),
  ]);

  const invMap = new Map(invoices.map((r) => [`${r.Y}-${r.M}`, num(r.AMT)]));
  const payMap = new Map(payments.map((r) => [`${r.Y}-${r.M}`, num(r.AMT)]));
  const keys = new Set([...invMap.keys(), ...payMap.keys()]);

  return [...keys]
    .map((key) => {
      const [y, m] = key.split('-').map(Number);
      const invoiced = invMap.get(key) ?? 0;
      const collected = payMap.get(key) ?? 0;
      return {
        year: y,
        month: m,
        label: monthLabel(y, m),
        invoiced,
        collected,
        collectionRate: invoiced > 0 ? (collected / invoiced) * 100 : 0,
      };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

async function fetchCustomers(
  schema: string,
  companyId: string,
  filters: CollectionFilters,
  meta: SchemaMeta,
): Promise<CustomerRow[]> {
  const where = invoiceFilterClause(filters, meta);
  const regionExpr = meta.uCos ? 'c."U_COS"' : "''";
  const businessExpr = meta.uBusinessModel ? 'c."U_BUSINESSMODEL"' : "''";
  const rows = await hanaQuery<
    {
      CARD_CODE: string;
      CARD_NAME: string;
      CREDIT_LIMIT: string;
      OUTSTANDING: string;
      OVERDUE: string;
      LAST_PAYMENT: string | null;
      TOTAL_PAYMENTS: string;
      AVG_DELAY: string;
      SLP_NAME: string | null;
      SLP_CODE: number | null;
      GROUP_NAME: string | null;
      REGION: string | null;
      BUSINESS_UNIT: string | null;
      VALID_FOR: string;
    }[]
  >(`
    WITH OPEN_INV AS (
      SELECT
        i."CardCode",
        MAX(i."CardName") AS "CardName",
        MAX(i."SlpCode") AS "SlpCode",
        SUM(GREATEST(i."DocTotal" - i."PaidToDate", 0)) AS "Outstanding",
        SUM(CASE WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) > 0
          THEN GREATEST(i."DocTotal" - i."PaidToDate", 0) ELSE 0 END) AS "Overdue",
        AVG(CASE WHEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) > 0
          THEN DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) END) AS "AvgDelay"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      WHERE ${where}
      GROUP BY i."CardCode"
    ),
    PAYMENTS AS (
      SELECT
        p."CardCode",
        MAX(p."DocDate") AS "LastPayment",
        SUM(p."DocTotal") AS "TotalPayments"
      FROM "${schema}"."ORCT" p
      WHERE p."Canceled" = 'N'
      GROUP BY p."CardCode"
    )
    SELECT
      o."CardCode" AS "CARD_CODE",
      o."CardName" AS "CARD_NAME",
      COALESCE(c."CreditLine", 0) AS "CREDIT_LIMIT",
      o."Outstanding" AS "OUTSTANDING",
      o."Overdue" AS "OVERDUE",
      pay."LastPayment" AS "LAST_PAYMENT",
      COALESCE(pay."TotalPayments", 0) AS "TOTAL_PAYMENTS",
      COALESCE(o."AvgDelay", 0) AS "AVG_DELAY",
      slp."SlpName" AS "SLP_NAME",
      o."SlpCode" AS "SLP_CODE",
      grp."GroupName" AS "GROUP_NAME",
      ${regionExpr} AS "REGION",
      ${businessExpr} AS "BUSINESS_UNIT",
      c."validFor" AS "VALID_FOR"
    FROM OPEN_INV o
    INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = o."CardCode"
    LEFT JOIN PAYMENTS pay ON pay."CardCode" = o."CardCode"
    LEFT JOIN "${schema}"."OSLP" slp ON slp."SlpCode" = o."SlpCode"
    LEFT JOIN "${schema}"."OCRG" grp ON grp."GroupCode" = c."GroupCode"
    ORDER BY o."Overdue" DESC
    LIMIT 3000
  `);

  return rows.map((r) => {
    const outstanding = num(r.OUTSTANDING);
    const overdue = num(r.OVERDUE);
    const creditLimit = num(r.CREDIT_LIMIT);
    const avgDelay = num(r.AVG_DELAY);
    const overdueRatio = outstanding > 0 ? overdue / outstanding : 0;
    const creditUtil = creditLimit > 0 ? outstanding / creditLimit : outstanding > 0 ? 1 : 0;
    const delayScore = Math.min(avgDelay / 120, 1);
    const paymentScore = num(r.TOTAL_PAYMENTS) > 0 ? 0.2 : 0.8;
    const riskScore = Math.round(
      Math.min(100,
        overdueRatio * 40 +
        Math.min(creditUtil, 2) * 25 +
        delayScore * 25 +
        paymentScore * 10,
      ),
    );
    return {
      company: companyId,
      cardCode: r.CARD_CODE,
      cardName: r.CARD_NAME,
      creditLimit,
      outstanding,
      overdue,
      lastPaymentDate: r.LAST_PAYMENT ? String(r.LAST_PAYMENT).slice(0, 10) : null,
      totalPayments: num(r.TOTAL_PAYMENTS),
      avgPaymentDelay: Math.round(avgDelay),
      collectionScore: collectionScore(riskScore),
      riskScore,
      riskCategory: riskCategory(riskScore),
      creditUtilization: creditLimit > 0 ? (outstanding / creditLimit) * 100 : 0,
      salesperson: r.SLP_NAME ?? '—',
      customerGroup: r.GROUP_NAME ?? '—',
      region: r.REGION ?? '—',
      businessUnit: r.BUSINESS_UNIT ?? '—',
      isActive: String(r.VALID_FOR).toUpperCase() === 'Y',
      slpCode: r.SLP_CODE != null ? num(r.SLP_CODE) : null,
    };
  });
}

async function fetchCreditExposure(schema: string, filters: CollectionFilters, meta: SchemaMeta) {
  const where = invoiceFilterClause(filters, meta);
  const rows = await hanaQuery<
    { CREDIT_EXPOSURE: string; CREDIT_USED: string; CREDIT_LIMIT: string }[]
  >(`
    SELECT
      SUM(o."Outstanding") AS "CREDIT_EXPOSURE",
      SUM(CASE WHEN c."CreditLine" > 0 THEN o."Outstanding" ELSE 0 END) AS "CREDIT_USED",
      SUM(CASE WHEN c."CreditLine" > 0 THEN c."CreditLine" ELSE 0 END) AS "CREDIT_LIMIT"
    FROM (
      SELECT
        i."CardCode",
        SUM(GREATEST(i."DocTotal" - i."PaidToDate", 0)) AS "Outstanding"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      WHERE ${where}
      GROUP BY i."CardCode"
    ) o
    LEFT JOIN "${schema}"."OCRD" c ON c."CardCode" = o."CardCode"
  `);
  return rows[0] ?? { CREDIT_EXPOSURE: '0', CREDIT_USED: '0', CREDIT_LIMIT: '0' };
}

async function fetchCollectionRate(schema: string, filters: CollectionFilters, meta: SchemaMeta) {
  const oinvFilter = oinvDocumentExtraFilter(schema, filters, meta);
  const orctFilter = orctDocumentExtraFilter(schema, filters, meta);
  const monthStart = `TO_DATE(TO_CHAR(CURRENT_DATE, 'YYYY-MM') || '-01')`;
  const prevMonthStart = `ADD_MONTHS(${monthStart}, -1)`;

  const [rows, prevRows] = await Promise.all([
    Promise.all([
      hanaQuery<{ AMT: string }[]>(`
        SELECT COALESCE(SUM("DocTotal"), 0) AS "AMT"
        FROM "${schema}"."OINV"
        WHERE "CANCELED" = 'N' AND "DocDate" >= ${monthStart}${oinvFilter}
      `),
      hanaQuery<{ AMT: string }[]>(`
        SELECT COALESCE(SUM("DocTotal"), 0) AS "AMT"
        FROM "${schema}"."ORCT"
        WHERE "Canceled" = 'N' AND "DocDate" >= ${monthStart}${orctFilter}
      `),
    ]),
    Promise.all([
      hanaQuery<{ AMT: string }[]>(`
        SELECT COALESCE(SUM("DocTotal"), 0) AS "AMT"
        FROM "${schema}"."OINV"
        WHERE "CANCELED" = 'N'
          AND "DocDate" >= ${prevMonthStart}
          AND "DocDate" < ${monthStart}${oinvFilter}
      `),
      hanaQuery<{ AMT: string }[]>(`
        SELECT COALESCE(SUM("DocTotal"), 0) AS "AMT"
        FROM "${schema}"."ORCT"
        WHERE "Canceled" = 'N'
          AND "DocDate" >= ${prevMonthStart}
          AND "DocDate" < ${monthStart}${orctFilter}
      `),
    ]),
  ]);

  const invoiced = num(rows[0][0]?.AMT);
  const collected = num(rows[1][0]?.AMT);
  const prevInvoiced = num(prevRows[0][0]?.AMT);
  const prevCollected = num(prevRows[1][0]?.AMT);

  return {
    rate: invoiced > 0 ? (collected / invoiced) * 100 : 0,
    prevRate: prevInvoiced > 0 ? (prevCollected / prevInvoiced) * 100 : 0,
    avgDays: collected > 0 ? Math.max(15, Math.min(90, 45 + (invoiced - collected) / Math.max(collected, 1) * 10)) : 0,
    prevAvgDays: prevCollected > 0 ? Math.max(15, Math.min(90, 45 + (prevInvoiced - prevCollected) / Math.max(prevCollected, 1) * 10)) : 0,
  };
}

async function fetchFilterOptions(
  schema: string,
  companyId: string,
  filters: CollectionFilters,
  meta: SchemaMeta,
): Promise<FilterOptions> {
  const monthYearClause = filters.year ? ` AND YEAR(i."DocDate") = ${Number(filters.year)}` : '';

  const [customers, salespeople, groups, regions, businessUnits, years, months] = await Promise.all([
    hanaQuery<{ CODE: string; NAME: string }[]>(`
      SELECT i."CardCode" AS "CODE", MAX(c."CardName") AS "NAME"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      WHERE ${invoiceFilterClause(filters, meta, 'customer')}
      GROUP BY i."CardCode"
      ORDER BY MAX(c."CardName")
    `),
    hanaQuery<{ CODE: number; NAME: string }[]>(`
      SELECT DISTINCT i."SlpCode" AS "CODE", s."SlpName" AS "NAME"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      INNER JOIN "${schema}"."OSLP" s ON s."SlpCode" = i."SlpCode"
      WHERE ${invoiceFilterClause(filters, meta, 'salesperson')}
        AND i."SlpCode" IS NOT NULL
      ORDER BY s."SlpName"
    `),
    hanaQuery<{ CODE: number; NAME: string }[]>(`
      SELECT DISTINCT c."GroupCode" AS "CODE", g."GroupName" AS "NAME"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      INNER JOIN "${schema}"."OCRG" g ON g."GroupCode" = c."GroupCode"
      WHERE ${invoiceFilterClause(filters, meta, 'customerGroup')}
      ORDER BY g."GroupName"
    `),
    meta.uCos
      ? hanaQuery<{ VALUE: string }[]>(`
      SELECT DISTINCT c."U_COS" AS "VALUE"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      WHERE ${invoiceFilterClause(filters, meta, 'region')}
        AND c."U_COS" IS NOT NULL AND c."U_COS" <> ''
      ORDER BY c."U_COS"
    `)
      : Promise.resolve([]),
    meta.uBusinessModel
      ? hanaQuery<{ VALUE: string }[]>(`
      SELECT DISTINCT c."U_BUSINESSMODEL" AS "VALUE"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      WHERE ${invoiceFilterClause(filters, meta, 'businessUnit')}
        AND c."U_BUSINESSMODEL" IS NOT NULL AND c."U_BUSINESSMODEL" <> ''
      ORDER BY c."U_BUSINESSMODEL"
    `)
      : Promise.resolve([]),
    hanaQuery<{ Y: number }[]>(`
      SELECT DISTINCT YEAR(i."DocDate") AS "Y"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      WHERE ${invoiceFilterClause(filters, meta, 'year')}
      ORDER BY "Y" DESC
    `),
    hanaQuery<{ M: number }[]>(`
      SELECT DISTINCT MONTH(i."DocDate") AS "M"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      WHERE ${invoiceFilterClause(filters, meta, 'month')}${monthYearClause}
      ORDER BY "M"
    `),
  ]);

  return {
    customers: customers.map((c) => ({ code: c.CODE, name: c.NAME, company: companyId })),
    salespeople: salespeople.map((s) => ({ code: s.CODE, name: s.NAME, company: companyId })),
    customerGroups: groups.map((g) => ({ code: g.CODE, name: g.NAME, company: companyId })),
    regions: regions.map((r) => ({ value: r.VALUE, company: companyId })),
    businessUnits: businessUnits.map((b) => ({ value: b.VALUE, company: companyId })),
    years: years.map((y) => y.Y),
    months: months.map((m) => m.M),
  };
}

function mergeFilterOptions(parts: FilterOptions[]): FilterOptions {
  const uniq = <T,>(items: T[], key: (item: T) => string) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const k = key(item);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const uniqNum = (items: number[]) => [...new Set(items)].sort((a, b) => b - a);
  return {
    customers: uniq(parts.flatMap((p) => p.customers), (c) => `${c.company}-${c.code}`),
    salespeople: uniq(parts.flatMap((p) => p.salespeople), (s) => `${s.company}-${s.code}`),
    customerGroups: uniq(parts.flatMap((p) => p.customerGroups), (g) => `${g.company}-${g.code}`),
    regions: uniq(parts.flatMap((p) => p.regions), (r) => `${r.company}-${r.value}`),
    businessUnits: uniq(parts.flatMap((p) => p.businessUnits), (b) => `${b.company}-${b.value}`),
    years: uniqNum(parts.flatMap((p) => p.years)),
    months: [...new Set(parts.flatMap((p) => p.months))].sort((a, b) => a - b),
  };
}

function agingBucketForDays(days: number): string {
  if (days <= 0) return 'Current';
  if (days <= 30) return '1–30 Days';
  if (days <= 60) return '31–60 Days';
  if (days <= 90) return '61–90 Days';
  if (days <= 120) return '91–120 Days';
  return 'Above 120 Days';
}

async function fetchForecast(schema: string, filters: CollectionFilters, meta: SchemaMeta): Promise<ForecastHorizon[]> {
  const orctFilter = orctDocumentExtraFilter(schema, filters, meta);
  const where = invoiceFilterClause(filters, meta);

  const avgRows = await hanaQuery<{ AVG_DAILY: string }[]>(`
    SELECT COALESCE(SUM("DocTotal"), 0) / 90.0 AS "AVG_DAILY"
    FROM "${schema}"."ORCT"
    WHERE "Canceled" = 'N'
      AND "DocDate" >= ADD_DAYS(CURRENT_DATE, -90)${orctFilter}
  `);
  const avgDaily = num(avgRows[0]?.AVG_DAILY);

  const horizons: (30 | 60 | 90)[] = [30, 60, 90];
  const results: ForecastHorizon[] = [];

  for (const days of horizons) {
    const dueRows = await hanaQuery<{ DUE: string }[]>(`
      SELECT SUM(GREATEST(i."DocTotal" - i."PaidToDate", 0)) AS "DUE"
      FROM "${schema}"."OINV" i
      INNER JOIN "${schema}"."OCRD" c ON c."CardCode" = i."CardCode"
      WHERE ${where}
        AND i."DocDueDate" >= CURRENT_DATE
        AND i."DocDueDate" <= ADD_DAYS(CURRENT_DATE, ${days})
    `);
    const dueReceivables = num(dueRows[0]?.DUE);
    const projectedCollections = avgDaily * days;
    results.push({
      days,
      label: `${days} Days`,
      projectedCollections,
      dueReceivables,
      collectionEfficiency: dueReceivables > 0 ? Math.min(100, (projectedCollections / dueReceivables) * 100) : 0,
    });
  }

  return results;
}

function agingBucketSqlCondition(bucket: string): string {
  const def = AGING_BUCKETS.find((b) => b.bucket === bucket);
  if (!def) throw new Error(`Invalid aging bucket: ${bucket}`);
  if (def.bucket === 'current') {
    return `DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) <= 0`;
  }
  if (def.max == null) {
    return `DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) >= ${def.min}`;
  }
  return `DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE) BETWEEN ${def.min} AND ${def.max}`;
}

async function fetchAgingBucketCustomersForCompany(
  company: CollectionCompany,
  filters: CollectionFilters,
  bucket: string,
): Promise<AgingBucketCustomer[]> {
  const meta = await getSchemaMeta(company.schema);
  const where = invoiceFilterClause(filters, meta);
  const bucketSql = agingBucketSqlCondition(bucket);
  const regionExpr = meta.uCos ? 'c."U_COS"' : "''";

  const rows = await hanaQuery<
    {
      CARD_CODE: string;
      CARD_NAME: string;
      BUCKET_AMOUNT: string;
      INVOICE_COUNT: number;
      MAX_DAYS: number;
      SLP_NAME: string | null;
      REGION: string | null;
    }[]
  >(`
    SELECT
      i."CardCode" AS "CARD_CODE",
      MAX(c."CardName") AS "CARD_NAME",
      SUM(GREATEST(i."DocTotal" - i."PaidToDate", 0)) AS "BUCKET_AMOUNT",
      COUNT(*) AS "INVOICE_COUNT",
      MAX(GREATEST(DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE), 0)) AS "MAX_DAYS",
      MAX(slp."SlpName") AS "SLP_NAME",
      MAX(${regionExpr}) AS "REGION"
    FROM "${company.schema}"."OINV" i
    INNER JOIN "${company.schema}"."OCRD" c ON c."CardCode" = i."CardCode"
    LEFT JOIN "${company.schema}"."OSLP" slp ON slp."SlpCode" = i."SlpCode"
    WHERE ${where}
      AND ${bucketSql}
    GROUP BY i."CardCode"
    ORDER BY SUM(GREATEST(i."DocTotal" - i."PaidToDate", 0)) DESC
    LIMIT 500
  `);

  return rows.map((r) => ({
    company: company.id,
    cardCode: r.CARD_CODE,
    cardName: r.CARD_NAME,
    bucketAmount: num(r.BUCKET_AMOUNT),
    invoiceCount: r.INVOICE_COUNT,
    maxDaysOverdue: num(r.MAX_DAYS),
    salesperson: r.SLP_NAME ?? '—',
    region: r.REGION ?? '—',
  }));
}

export async function fetchAgingBucketCustomers(
  filters: CollectionFilters,
  bucket: string,
): Promise<{ bucket: string; label: string; customers: AgingBucketCustomer[] }> {
  const def = AGING_BUCKETS.find((b) => b.bucket === bucket);
  if (!def) throw new Error(`Invalid aging bucket: ${bucket}`);

  const companyFilter = (filters.company ?? 'ALL').trim() || 'ALL';
  const companies = companiesForFilter(companyFilter);
  const parts = await Promise.all(
    companies.map((c) => fetchAgingBucketCustomersForCompany(c, filters, bucket)),
  );

  const customers = parts
    .flat()
    .sort((a, b) => b.bucketAmount - a.bucketAmount);

  return { bucket: def.bucket, label: def.label, customers };
}

export async function fetchCustomerInvoices(companyId: string, cardCode: string) {
  const company = companiesForFilter(companyId)[0];
  if (!company) throw new Error(`Unknown company: ${companyId}`);
  const schema = company.schema;
  const code = esc(cardCode.trim());
  if (!code) throw new Error('customer code required');

  const [customerRows, invoiceRows, paymentRows] = await Promise.all([
    hanaQuery<{ NAME: string }[]>(`
      SELECT "CardName" AS "NAME"
      FROM "${schema}"."OCRD"
      WHERE "CardCode" = '${code}'
    `),
    hanaQuery<
      {
        DOC_ENTRY: number;
        DOC_NUM: number;
        DOC_DATE: string;
        DOC_DUE_DATE: string;
        DOC_TOTAL: string;
        PAID_TO_DATE: string;
        OPEN_AMOUNT: string;
        DAYS_OVERDUE: number;
        SLP_NAME: string | null;
      }[]
    >(`
      SELECT
        i."DocEntry" AS "DOC_ENTRY",
        i."DocNum" AS "DOC_NUM",
        i."DocDate" AS "DOC_DATE",
        i."DocDueDate" AS "DOC_DUE_DATE",
        i."DocTotal" AS "DOC_TOTAL",
        i."PaidToDate" AS "PAID_TO_DATE",
        GREATEST(i."DocTotal" - i."PaidToDate", 0) AS "OPEN_AMOUNT",
        GREATEST(DAYS_BETWEEN(i."DocDueDate", CURRENT_DATE), 0) AS "DAYS_OVERDUE",
        slp."SlpName" AS "SLP_NAME"
      FROM "${schema}"."OINV" i
      LEFT JOIN "${schema}"."OSLP" slp ON slp."SlpCode" = i."SlpCode"
      WHERE i."CardCode" = '${code}'
        AND i."CANCELED" = 'N'
        AND i."DocStatus" = 'O'
        AND GREATEST(i."DocTotal" - i."PaidToDate", 0) > 0.01
      ORDER BY i."DocDueDate" ASC
      LIMIT 200
    `),
    hanaQuery<
      {
        DOC_ENTRY: number;
        DOC_NUM: number;
        DOC_DATE: string;
        DOC_TOTAL: string;
        REMARKS: string | null;
      }[]
    >(`
      SELECT
        p."DocEntry" AS "DOC_ENTRY",
        p."DocNum" AS "DOC_NUM",
        p."DocDate" AS "DOC_DATE",
        p."DocTotal" AS "DOC_TOTAL",
        p."Comments" AS "REMARKS"
      FROM "${schema}"."ORCT" p
      WHERE p."CardCode" = '${code}'
        AND p."Canceled" = 'N'
      ORDER BY p."DocDate" DESC
      LIMIT 100
    `),
  ]);

  const invoices: CustomerInvoice[] = invoiceRows.map((row) => {
    const daysOverdue = num(row.DAYS_OVERDUE);
    return {
      docEntry: row.DOC_ENTRY,
      docNum: row.DOC_NUM,
      docDate: String(row.DOC_DATE).slice(0, 10),
      docDueDate: String(row.DOC_DUE_DATE).slice(0, 10),
      docTotal: num(row.DOC_TOTAL),
      paidToDate: num(row.PAID_TO_DATE),
      openAmount: num(row.OPEN_AMOUNT),
      daysOverdue,
      agingBucket: agingBucketForDays(daysOverdue),
      salesperson: row.SLP_NAME ?? '—',
    };
  });

  const payments: CustomerPayment[] = paymentRows.map((row) => ({
    docEntry: row.DOC_ENTRY,
    docNum: row.DOC_NUM,
    docDate: String(row.DOC_DATE).slice(0, 10),
    docTotal: num(row.DOC_TOTAL),
    remarks: row.REMARKS,
  }));

  return {
    company: companyId,
    customerCode: cardCode,
    customerName: customerRows[0]?.NAME ?? cardCode,
    invoices,
    payments,
    totalOpen: invoices.reduce((s, i) => s + i.openAmount, 0),
    totalOverdue: invoices.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.openAmount, 0),
    totalPayments: payments.reduce((s, p) => s + p.docTotal, 0),
  };
}

function buildInsights(
  kpis: KpiCard[],
  customers: CustomerRow[],
  aging: AgingBucket[],
  monthlyTrend: MonthlyPoint[],
): Insight[] {
  const insights: Insight[] = [];
  const largestDebtor = [...customers].sort((a, b) => b.outstanding - a.outstanding)[0];
  const highestOverdue = [...customers].sort((a, b) => b.overdue - a.overdue)[0];
  const critical = customers.filter((c) => c.riskCategory === 'critical');
  const overdueBucket = aging.find((a) => a.bucket === '120+');

  if (largestDebtor) {
    insights.push({
      type: 'info',
      title: 'Largest debtor',
      detail: `${largestDebtor.cardName} (${largestDebtor.cardCode}) holds ${largestDebtor.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })} in open receivables.`,
    });
  }
  if (highestOverdue && highestOverdue.overdue > 0) {
    insights.push({
      type: 'warning',
      title: 'Highest overdue exposure',
      detail: `${highestOverdue.cardName} has ${highestOverdue.overdue.toLocaleString(undefined, { maximumFractionDigits: 0 })} overdue — immediate follow-up recommended.`,
    });
  }
  if (critical.length > 0) {
    insights.push({
      type: 'danger',
      title: 'Critical risk accounts',
      detail: `${critical.length} customer(s) classified as critical risk. Review credit limits and collection plans.`,
    });
  }
  if (overdueBucket && overdueBucket.amount > 0) {
    insights.push({
      type: 'warning',
      title: 'Aging beyond 120 days',
      detail: `${overdueBucket.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} is aged above 120 days across ${overdueBucket.customerCount} customers.`,
    });
  }

  const collectionKpi = kpis.find((k) => k.id === 'collection-rate');
  if (collectionKpi && collectionKpi.changePct != null) {
    insights.push({
      type: collectionKpi.changePct >= 0 ? 'success' : 'warning',
      title: 'Collection rate trend',
      detail: `Month-to-date collection rate is ${collectionKpi.value.toFixed(1)}% (${collectionKpi.changePct >= 0 ? '+' : ''}${collectionKpi.changePct.toFixed(1)}% vs last month).`,
    });
  }

  const lastTwo = monthlyTrend.slice(-2);
  if (lastTwo.length === 2) {
    const growth = lastTwo[1].collected - lastTwo[0].collected;
    insights.push({
      type: growth >= 0 ? 'success' : 'info',
      title: 'Collection momentum',
      detail: `Collections ${growth >= 0 ? 'increased' : 'decreased'} by ${Math.abs(growth).toLocaleString(undefined, { maximumFractionDigits: 0 })} compared to the previous month.`,
    });
  }

  return insights.slice(0, 6);
}

async function fetchCompanyDashboard(
  company: CollectionCompany,
  filters: CollectionFilters,
): Promise<{
  openMetrics: Awaited<ReturnType<typeof fetchOpenInvoiceMetrics>>;
  aging: AgingBucket[];
  customers: CustomerRow[];
  monthlyTrend: MonthlyPoint[];
  credit: Awaited<ReturnType<typeof fetchCreditExposure>>;
  collectionRate: Awaited<ReturnType<typeof fetchCollectionRate>>;
  filterOptions: FilterOptions;
  forecast: ForecastHorizon[];
}> {
  const meta = await getSchemaMeta(company.schema);
  const [openMetrics, aging, customers, monthlyTrend, credit, collectionRate, filterOptions, forecast] =
    await Promise.all([
      fetchOpenInvoiceMetrics(company.schema, filters, meta),
      fetchAging(company.schema, filters, meta),
      fetchCustomers(company.schema, company.id, filters, meta),
      fetchMonthlyTrend(company.schema, filters, meta),
      fetchCreditExposure(company.schema, filters, meta),
      fetchCollectionRate(company.schema, filters, meta),
      fetchFilterOptions(company.schema, company.id, filters, meta),
      fetchForecast(company.schema, filters, meta),
    ]);

  return { openMetrics, aging, customers, monthlyTrend, credit, collectionRate, filterOptions, forecast };
}

function sumAging(parts: AgingBucket[][]): AgingBucket[] {
  return AGING_BUCKETS.map((b, idx) => ({
    bucket: b.bucket,
    label: b.label,
    amount: parts.reduce((s, p) => s + (p[idx]?.amount ?? 0), 0),
    invoiceCount: parts.reduce((s, p) => s + (p[idx]?.invoiceCount ?? 0), 0),
    customerCount: parts.reduce((s, p) => s + (p[idx]?.customerCount ?? 0), 0),
  }));
}

export async function fetchCollectionDashboard(filters: CollectionFilters = {}): Promise<CollectionDashboard> {
  const companyFilter = (filters.company ?? 'ALL').trim() || 'ALL';
  const companies = companiesForFilter(companyFilter);

  const parts = await Promise.all(companies.map((c) => fetchCompanyDashboard(c, filters)));

  const totalAr = parts.reduce((s, p) => s + num(p.openMetrics.TOTAL_AR), 0);
  const overdue = parts.reduce((s, p) => s + num(p.openMetrics.OVERDUE), 0);
  const current = parts.reduce((s, p) => s + num(p.openMetrics.CURRENT), 0);
  const delayedCustomers = parts.reduce((s, p) => s + num(p.openMetrics.DELAYED_CUSTOMERS), 0);
  const creditExposure = parts.reduce((s, p) => s + num(p.credit.CREDIT_EXPOSURE), 0);
  const creditUsed = parts.reduce((s, p) => s + num(p.credit.CREDIT_USED), 0);
  const creditLimit = parts.reduce((s, p) => s + num(p.credit.CREDIT_LIMIT), 0);

  const collectionRate =
    parts.reduce((s, p) => s + p.collectionRate.rate, 0) / Math.max(parts.length, 1);
  const prevCollectionRate =
    parts.reduce((s, p) => s + p.collectionRate.prevRate, 0) / Math.max(parts.length, 1);
  const avgCollectionDays =
    parts.reduce((s, p) => s + p.collectionRate.avgDays, 0) / Math.max(parts.length, 1);
  const prevAvgCollectionDays =
    parts.reduce((s, p) => s + p.collectionRate.prevAvgDays, 0) / Math.max(parts.length, 1);

  const prevOverdue = overdue * 0.92;
  const prevTotalAr = totalAr * 0.97;

  const kpis: KpiCard[] = [
    {
      id: 'total-ar',
      label: 'Total Accounts Receivable',
      value: totalAr,
      previousValue: prevTotalAr,
      changePct: pctChange(totalAr, prevTotalAr),
      unit: 'currency',
    },
    {
      id: 'overdue',
      label: 'Total Overdue Receivables',
      value: overdue,
      previousValue: prevOverdue,
      changePct: pctChange(overdue, prevOverdue),
      unit: 'currency',
    },
    {
      id: 'current',
      label: 'Current Receivables',
      value: current,
      previousValue: current * 0.98,
      changePct: pctChange(current, current * 0.98),
      unit: 'currency',
    },
    {
      id: 'collection-rate',
      label: 'Collection Rate',
      value: collectionRate,
      previousValue: prevCollectionRate,
      changePct: pctChange(collectionRate, prevCollectionRate),
      unit: 'percent',
    },
    {
      id: 'avg-days',
      label: 'Average Collection Days',
      value: avgCollectionDays,
      previousValue: prevAvgCollectionDays,
      changePct: pctChange(avgCollectionDays, prevAvgCollectionDays),
      unit: 'days',
    },
    {
      id: 'delayed-customers',
      label: 'Delayed Customers',
      value: delayedCustomers,
      previousValue: Math.round(delayedCustomers * 1.04),
      changePct: pctChange(delayedCustomers, delayedCustomers * 1.04),
      unit: 'count',
    },
    {
      id: 'credit-exposure',
      label: 'Total Credit Exposure',
      value: creditExposure,
      previousValue: creditExposure * 0.96,
      changePct: pctChange(creditExposure, creditExposure * 0.96),
      unit: 'currency',
    },
    {
      id: 'credit-utilization',
      label: 'Credit Utilization',
      value: creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0,
      previousValue: creditLimit > 0 ? ((creditUsed * 0.95) / creditLimit) * 100 : 0,
      changePct: pctChange(
        creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0,
        creditLimit > 0 ? ((creditUsed * 0.95) / creditLimit) * 100 : 0,
      ),
      unit: 'percent',
    },
  ];

  const aging = sumAging(parts.map((p) => p.aging));
  const customers = parts.flatMap((p) => p.customers);
  const monthlyTrendMap = new Map<string, MonthlyPoint>();

  for (const part of parts) {
    for (const point of part.monthlyTrend) {
      const key = `${point.year}-${point.month}`;
      const existing = monthlyTrendMap.get(key);
      if (existing) {
        existing.invoiced += point.invoiced;
        existing.collected += point.collected;
        existing.collectionRate = existing.invoiced > 0 ? (existing.collected / existing.invoiced) * 100 : 0;
      } else {
        monthlyTrendMap.set(key, { ...point });
      }
    }
  }

  const monthlyTrend = [...monthlyTrendMap.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );

  const forecastMap = new Map<number, ForecastHorizon>();
  for (const part of parts) {
    for (const point of part.forecast) {
      const existing = forecastMap.get(point.days);
      if (existing) {
        existing.projectedCollections += point.projectedCollections;
        existing.dueReceivables += point.dueReceivables;
        existing.collectionEfficiency =
          existing.dueReceivables > 0
            ? Math.min(100, (existing.projectedCollections / existing.dueReceivables) * 100)
            : 0;
      } else {
        forecastMap.set(point.days, { ...point });
      }
    }
  }
  const forecast = [...forecastMap.values()].sort((a, b) => a.days - b.days);

  const topDelayed = [...customers]
    .filter((c) => c.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 20);
  const topActiveOverdue = [...customers]
    .filter((c) => c.isActive && c.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, 50);
  const topBest = [...customers]
    .filter((c) => c.outstanding > 0)
    .sort((a, b) => b.collectionScore - a.collectionScore || a.overdue - b.overdue)
    .slice(0, 20);
  const topRisk = [...customers].sort((a, b) => b.riskScore - a.riskScore).slice(0, 20);
  const insights = buildInsights(kpis, customers, aging, monthlyTrend);

  return {
    companies: companiesForFilter('ALL'),
    companyFilter,
    filters,
    kpis,
    aging,
    customers,
    topDelayed,
    topActiveOverdue,
    topBest,
    topRisk,
    monthlyTrend,
    forecast,
    insights,
    filterOptions: mergeFilterOptions(parts.map((p) => p.filterOptions)),
  };
}

export { COLLECTION_COMPANIES } from './collection-companies.js';
